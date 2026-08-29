// supabase/functions/db-backup-drive/index.ts
//
// Backup automático da base de dados para o Google Drive.
//
// Funcionamento:
//  1. Lê a configuração em `backup_settings` (se não estiver ativo, sai).
//  2. Exporta todas as tabelas públicas como um ficheiro JSON estruturado.
//  3. Autentica-se no Google Drive com uma Service Account (JWT RSA-SHA256).
//  4. Faz upload do backup para a pasta configurada no Drive.
//  5. Remove backups mais antigos que `retention_weeks`.
//  6. Atualiza `backup_settings` com o estado do último backup.
//
// Agendamento: pg_cron semanal (configurado separadamente).
// Também pode ser invocado manualmente por um admin.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive";


// Tabelas a exportar (ordem importa para restauro — pais antes de filhos)
const TABLES_TO_BACKUP = [
  "company_settings",
  "clients",
  "profiles",
  "user_roles",
  "dossiers",
  "dossier_sections",
  "dossier_sections_history",
  "dossier_credentials",
  "dossier_facts",
  "dossier_intake_messages",
  "dossier_access",
  "phishing_campaigns",
  "phishing_targets",
  "phishing_clicks",
  "audit_logs",
  "audit_settings",
  "backup_settings",
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class BackupError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status = 400, details?: string) {
    super(message);
    this.name = "BackupError";
    this.status = status;
    this.details = details;
  }
}


type BackupSettingsRow = {
  id: string;
  enabled: boolean;
  drive_folder_id: string | null;
  retention_weeks: number | null;
};

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new BackupError(`${name} não configurado no backend.`, 500);
  }
  return value;
}

function createAdminClient() {
  return createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

function isProjectApiKey(token: string): boolean {
  if (token === Deno.env.get("SUPABASE_ANON_KEY") || token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return true;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) return false;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded));
    return claims?.role === "anon" || claims?.role === "service_role";
  } catch {
    return false;
  }
}

async function updateBackupError(
  admin: ReturnType<typeof createClient>,
  settings: BackupSettingsRow | null,
  message: string,
  details?: string,
) {
  if (!settings?.id) return;

  const storedError = details ? `${message} ${details}` : message;
  await admin
    .from("backup_settings")
    .update({
      last_backup_at: new Date().toISOString(),
      last_backup_status: "erro",
      last_backup_error: storedError,
    })
    .eq("id", settings.id);
}

function getGoogleErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error?.message === "string") {
      return parsed.error.message;
    }
  } catch {
    // manter corpo original quando não for JSON
  }

  return body;
}

// --- Chamadas ao Google Drive através do connector gateway (ligação OAuth) ---
async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const driveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY");

  if (!lovableKey || !driveKey) {
    throw new BackupError(
      "A ligação ao Google Drive não está configurada neste projeto.",
      400,
      "Liga a tua conta Google Drive nos conectores do projeto e tenta novamente.",
    );
  }

  return await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": driveKey,
    },
  });
}

async function validateDriveFolder(folderId: string): Promise<string> {
  const res = await driveFetch(
    `/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType&supportsAllDrives=true`,
  );

  if (!res.ok) {
    const errText = await res.text();
    // Com o âmbito drive.file, pastas criadas fora da app podem não ser legíveis.
    // Nesse caso seguimos em frente e deixamos o upload validar o destino.
    console.warn(`Aviso: não foi possível ler a pasta do Drive [${res.status}]: ${errText}`);
    return folderId;
  }

  const folder = await res.json();
  if (folder.mimeType && folder.mimeType !== "application/vnd.google-apps.folder") {
    throw new BackupError(
      "O ID configurado no Google Drive não pertence a uma pasta.",
      400,
      "Abre a pasta no Google Drive e copia o ID do URL /drive/folders/<ID>.",
    );
  }

  return folder.name ?? folderId;
}
// --- Criar subpasta no Drive ---
async function createDriveFolder(parentId: string, name: string): Promise<string> {
  const res = await driveFetch("/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new BackupError(
      "Não foi possível criar a pasta do backup no Google Drive.",
      400,
      `Google Drive [${res.status}]: ${getGoogleErrorMessage(errText)}`,
    );
  }

  const data = await res.json();
  return data.id as string;
}

// --- Upload binário (ficheiros do Storage) ---
async function uploadBinaryToDrive(
  folderId: string,
  fileName: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const boundary = `cyberdossier-bin-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const head = encoder.encode(
    [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify({ name: fileName, parents: folderId ? [folderId] : undefined }),
      `--${boundary}`,
      `Content-Type: ${mimeType || "application/octet-stream"}`,
      "",
      "",
    ].join("\r\n"),
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await driveFetch(
    "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive [${res.status}]: ${getGoogleErrorMessage(errText)}`);
  }

  const data = await res.json();
  return data.id as string;
}


// --- Upload para Google Drive (multipart, via gateway) ---
async function uploadToDrive(
  folderId: string,
  fileName: string,
  content: string,
): Promise<string> {
  const boundary = `cyberdossier-${crypto.randomUUID()}`;
  const metadata = {
    name: fileName,
    mimeType: "application/json",
    parents: folderId ? [folderId] : undefined,
  };

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const res = await driveFetch(
    "/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    const googleMessage = getGoogleErrorMessage(errText);

    if (res.status === 401) {
      throw new BackupError(
        "A ligação ao Google Drive expirou ou não tem autorização.",
        400,
        `Volta a autorizar a ligação Google Drive nos conectores do projeto. Resposta Google: ${googleMessage}`,
      );
    }

    if (res.status === 404) {
      throw new BackupError(
        "A pasta do Google Drive indicada não foi encontrada.",
        400,
        `Confirma o ID/URL da pasta na conta Google que autorizaste. Resposta Google: ${googleMessage}`,
      );
    }

    if (res.status === 403) {
      throw new BackupError(
        "Sem permissão para criar ficheiros nesta pasta do Google Drive.",
        400,
        `Confirma que a conta autorizada tem acesso de edição à pasta. Resposta Google: ${googleMessage}`,
      );
    }

    throw new BackupError(
      "Erro ao enviar o backup para o Google Drive.",
      400,
      `Google Drive [${res.status}]: ${errText}`,
    );
  }

  const fileData = await res.json();
  return fileData.id;
}

// --- Listar ficheiros antigos na pasta para limpeza ---
async function listDriveFiles(
  folderId: string,
): Promise<{ id: string; name: string; createdTime: string }[]> {
  const query = [
    folderId ? `'${folderId}' in parents` : null,
    "trashed = false",
    "name contains 'cyberdossier-backup-'",
  ].filter(Boolean).join(" and ");

  const res = await driveFetch(
    `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=200`,
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao listar ficheiros Drive: ${errText}`);
  }

  const data = await res.json();
  return data.files ?? [];
}

async function deleteDriveFile(fileId: string): Promise<void> {
  await driveFetch(`/drive/v3/files/${fileId}?supportsAllDrives=true`, { method: "DELETE" });
}


// --- Exportar utilizadores de autenticação (sem passwords) ---
async function exportAuthUsers(admin: ReturnType<typeof createClient>) {
  const users: unknown[] = [];
  let page = 1;

  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.warn(`Aviso: não foi possível exportar utilizadores auth: ${error.message}`);
      return { _error: error.message };
    }
    const batch = data?.users ?? [];
    for (const u of batch) {
      users.push({
        id: u.id,
        email: u.email,
        phone: u.phone,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        app_metadata: u.app_metadata,
        user_metadata: u.user_metadata,
      });
    }
    if (batch.length < 200) break;
    page++;
  }

  return users;
}

// --- Listar todos os objetos de um bucket (recursivo) ---
async function listBucketObjects(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix = "",
): Promise<{ path: string; size: number; mimetype: string }[]> {
  const out: { path: string; size: number; mimetype: string }[] = [];
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) {
    console.warn(`Aviso: não foi possível listar ${bucket}/${prefix}: ${error.message}`);
    return out;
  }

  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      out.push(...(await listBucketObjects(admin, bucket, path)));
    } else {
      out.push({
        path,
        size: (item as { metadata?: { size?: number } }).metadata?.size ?? 0,
        mimetype: (item as { metadata?: { mimetype?: string } }).metadata?.mimetype ??
          "application/octet-stream",
      });
    }
  }

  return out;
}

// --- Copiar ficheiros do Storage para o Drive ---
async function backupStorage(
  admin: ReturnType<typeof createClient>,
  backupFolderId: string,
): Promise<{ files: number; bytes: number; buckets: Record<string, number>; errors: string[] }> {
  const result = { files: 0, bytes: 0, buckets: {} as Record<string, number>, errors: [] as string[] };
  const { data: buckets, error } = await admin.storage.listBuckets();

  if (error || !buckets) {
    result.errors.push(`Não foi possível listar buckets: ${error?.message ?? "desconhecido"}`);
    return result;
  }

  const storageRoot = await createDriveFolder(backupFolderId, "storage");

  for (const bucket of buckets) {
    const objects = await listBucketObjects(admin, bucket.name);
    if (objects.length === 0) {
      result.buckets[bucket.name] = 0;
      continue;
    }

    const bucketFolder = await createDriveFolder(storageRoot, bucket.name);
    let count = 0;

    for (const obj of objects) {
      try {
        const { data: blob, error: dlError } = await admin.storage.from(bucket.name).download(obj.path);
        if (dlError || !blob) {
          result.errors.push(`${bucket.name}/${obj.path}: ${dlError?.message ?? "download falhou"}`);
          continue;
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // Caminho achatado para preservar a estrutura no nome do ficheiro
        const safeName = obj.path.replace(/\//g, "__");
        await uploadBinaryToDrive(bucketFolder, safeName, bytes, obj.mimetype);
        result.files++;
        result.bytes += bytes.length;
        count++;
      } catch (err) {
        result.errors.push(`${bucket.name}/${obj.path}: ${String(err)}`);
      }
    }

    result.buckets[bucket.name] = count;
  }

  return result;
}

// --- Exportar todas as tabelas + utilizadores auth ---
async function exportDatabase(): Promise<string> {
  const admin = createAdminClient();
  const dump: Record<string, unknown> = {
    _meta: {
      exported_at: new Date().toISOString(),
      table_count: TABLES_TO_BACKUP.length,
      includes_auth_users: true,
      includes_storage_files: true,
    },
  };

  for (const table of TABLES_TO_BACKUP) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100000);

    if (error) {
      // Tabela pode não ter created_at ou pode estar vazia — tentar sem order
      const { data: fallback, error: err2 } = await admin
        .from(table)
        .select("*")
        .limit(100000);

      if (err2) {
        console.warn(`Aviso: não foi possível exportar a tabela ${table}: ${err2.message}`);
        dump[table] = { _error: err2.message, _count: 0 };
        continue;
      }
      dump[table] = fallback ?? [];
    } else {
      dump[table] = data ?? [];
    }
  }

  dump.auth_users = await exportAuthUsers(admin);

  return JSON.stringify(dump, null, 2);
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createAdminClient();
    let settings: BackupSettingsRow | null = null;

    // Se for chamada autenticada (manual), validar admin
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.replace("Bearer ", "").trim() ?? "";
    const isScheduledCall = bearerToken ? isProjectApiKey(bearerToken) : true;

    if (bearerToken && !isScheduledCall) {
      const { data: userData, error: userError } = await admin.auth.getUser(bearerToken);
      if (userError || !userData?.user) {
        return jsonResponse({ error: "Sessão inválida." }, 401);
      }
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) {
        return jsonResponse({ error: "Apenas administradores podem gerir backups." }, 403);
      }
    }
    // Sem sessão de utilizador, assume-se chamada agendada/backend.

    // Ler configuração
    const { data, error: settingsError } = await admin
      .from("backup_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    settings = data;

    if (settingsError || !settings) {
      return jsonResponse({ error: "Configuração de backup não encontrada." }, 400);
    }

    if (!settings.enabled && isScheduledCall) {
      // Cron chamou mas backups estão desativados — sair silenciosamente
      return jsonResponse({ skipped: true, reason: "Backups desativados." });
    }

    const folderId = typeof settings.drive_folder_id === "string" ? settings.drive_folder_id.trim() : "";

    // Pasta é opcional: sem pasta, o backup vai para a raiz do Drive autorizado.
    const folderName = folderId ? await validateDriveFolder(folderId) : "Raiz do Google Drive";


    // 2) Exportar base de dados (tabelas + utilizadores auth)
    const jsonDump = await exportDatabase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `cyberdossier-backup-${timestamp}`;
    const fileName = `${backupName}.json`;

    // 3) Criar pasta do backup e enviar o dump da base de dados
    const backupFolderId = await createDriveFolder(folderId, backupName);
    const fileId = await uploadToDrive(backupFolderId, "database.json", jsonDump);

    // 3b) Copiar ficheiros do Storage (anexos, logos, exportações)
    const storage = await backupStorage(admin, backupFolderId);
    if (storage.errors.length > 0) {
      console.warn(`Avisos no backup do Storage: ${storage.errors.slice(0, 10).join(" | ")}`);
    }

    // 3c) Manifesto do backup
    await uploadToDrive(
      backupFolderId,
      "manifest.json",
      JSON.stringify(
        {
          backup: backupName,
          created_at: new Date().toISOString(),
          database_tables: TABLES_TO_BACKUP.length,
          auth_users_included: true,
          storage_files: storage.files,
          storage_bytes: storage.bytes,
          storage_buckets: storage.buckets,
          storage_errors: storage.errors,
        },
        null,
        2,
      ),
    );


    // 4) Limpeza de backups antigos
    const retentionWeeks = settings.retention_weeks ?? 12;
    const cutoff = new Date(Date.now() - retentionWeeks * 7 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    try {
      const files = await listDriveFiles(folderId);
      for (const file of files) {
        if (file.name.startsWith("cyberdossier-backup-") && new Date(file.createdTime) < cutoff) {
          await deleteDriveFile(file.id);
          deletedCount++;
        }
      }
    } catch (cleanupErr) {
      console.warn("Aviso: limpeza de backups antigos falhou:", String(cleanupErr));
    }

    // 5) Atualizar estado
    await admin
      .from("backup_settings")
      .update({
        last_backup_at: new Date().toISOString(),
        last_backup_status: "sucesso",
        last_backup_error: null,
      })
      .eq("id", settings.id);

    return jsonResponse({
      success: true,
      file_id: fileId,
      file_name: fileName,
      folder_name: folderName,
      size_bytes: new TextEncoder().encode(jsonDump).length,
      old_backups_deleted: deletedCount,
    });
  } catch (err) {
    const errorMessage = err instanceof BackupError ? err.message : "Erro interno no backup.";
    const errorDetails = err instanceof BackupError ? err.details : String(err);
    const status = err instanceof BackupError ? err.status : 500;

    // Registar erro na configuração
    try {
      const admin = createAdminClient();
      const { data: settings } = await admin
        .from("backup_settings")
        .select("id,enabled,drive_folder_id,retention_weeks")
        .limit(1)
        .maybeSingle();
      await updateBackupError(admin, settings, errorMessage, errorDetails);
    } catch {
      // Ignorar erro ao escrever erro
    }

    return jsonResponse({ error: errorMessage, details: errorDetails }, status);
  }
});
