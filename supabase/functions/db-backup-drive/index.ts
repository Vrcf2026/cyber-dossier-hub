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

const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
const GOOGLE_DRIVE_BACKUP_SCOPE = "https://www.googleapis.com/auth/drive";

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

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
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

function parseGoogleServiceAccount(): GoogleServiceAccount {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new BackupError("GOOGLE_SERVICE_ACCOUNT_JSON não configurado no backend.");
  }

  try {
    const parsed = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    if (
      typeof parsed?.client_email !== "string" ||
      typeof parsed?.private_key !== "string" ||
      !parsed.client_email.trim() ||
      !parsed.private_key.trim()
    ) {
      throw new Error("Campos obrigatórios em falta.");
    }

    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };
  } catch (err) {
    throw new BackupError(
      "A chave JSON da Google Service Account é inválida.",
      400,
      String(err),
    );
  }
}

// --- JWT para Google Service Account (RS256) ---
async function base64url(input: ArrayBuffer | Uint8Array): Promise<string> {
  let bytes: Uint8Array;
  if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else {
    bytes = input;
  }
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleAccessToken(sa: GoogleServiceAccount, scopes: string[]): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = await base64url(
    new TextEncoder().encode(JSON.stringify(header)),
  );
  const payloadB64 = await base64url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signingInput = `${headerB64}.${payloadB64}`;

  // Importar a chave privada RSA
  // O formato PEM precisa de ser convertido para DER
  const pemBody = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const pemBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${await base64url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new BackupError(
      "Não foi possível autenticar a Service Account no Google.",
      400,
      `Google OAuth [${tokenRes.status}]: ${errText}`,
    );
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function validateDriveFolder(
  accessToken: string,
  folderId: string,
  serviceAccountEmail: string,
): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,capabilities/canAddChildren&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404) {
      throw new BackupError(
        `A pasta do Google Drive não foi encontrada ou não está partilhada com a Service Account (${serviceAccountEmail}).`,
        400,
        "Confirma que o ID/URL da pasta está correto e partilha a pasta com esse email com permissão de Editor.",
      );
    }

    if (res.status === 403) {
      throw new BackupError(
        `A Service Account (${serviceAccountEmail}) não tem permissão para aceder à pasta do Google Drive.`,
        400,
        "Confirma a partilha da pasta como Editor e que a Google Drive API está ativa no projeto Google Cloud.",
      );
    }

    throw new BackupError(
      "Não foi possível validar a pasta do Google Drive.",
      400,
      `Google Drive [${res.status}]: ${errText}`,
    );
  }

  const folder = await res.json();
  if (folder.mimeType !== "application/vnd.google-apps.folder") {
    throw new BackupError(
      "O ID configurado no Google Drive não pertence a uma pasta.",
      400,
      "Abre a pasta no Google Drive e copia o ID do URL /drive/folders/<ID>.",
    );
  }

  if (folder.capabilities?.canAddChildren === false) {
    throw new BackupError(
      `A Service Account (${serviceAccountEmail}) não pode criar ficheiros nesta pasta.`,
      400,
      "Partilha a pasta com esse email e atribui permissão de Editor.",
    );
  }

  return folder.name ?? folderId;
}

// --- Upload para Google Drive (resumable upload) ---
async function uploadToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  content: string,
): Promise<string> {
  // Iniciar sessão de upload resumable
  const startRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: fileName,
        parents: folderId ? [folderId] : undefined,
      }),
    },
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Erro ao iniciar upload Drive: ${errText}`);
  }

  const uploadUrl = startRes.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("Drive não devolveu URL de upload.");
  }

  const contentBytes = new TextEncoder().encode(content);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": contentBytes.length.toString(),
    },
    body: content,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Erro no upload para Drive: ${errText}`);
  }

  const fileData = await uploadRes.json();
  return fileData.id;
}

// --- Listar ficheiros antigos na pasta para limpeza ---
async function listDriveFiles(
  accessToken: string,
  folderId: string,
): Promise<{ id: string; name: string; createdTime: string }[]> {
  const query = `'${folderId}' in parents and trashed = false and name contains 'cyberdossier-backup-'`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime&supportsAllDrives=true&pageSize=200`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao listar ficheiros Drive: ${errText}`);
  }

  const data = await res.json();
  return data.files ?? [];
}

async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// --- Exportar todas as tabelas ---
async function exportDatabase(): Promise<string> {
  const admin = createAdminClient();
  const dump: Record<string, unknown> = {
    _meta: {
      exported_at: new Date().toISOString(),
      table_count: TABLES_TO_BACKUP.length,
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

  return JSON.stringify(dump, null, 2);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createAdminClient();

    // Se for chamada autenticada (manual), validar admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const jwt = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await admin.auth.getUser(jwt);
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
    // Se não houver Authorization, assume-se chamada do cron (anon key no header)

    // Ler configuração
    const { data: settings, error: settingsError } = await admin
      .from("backup_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (settingsError || !settings) {
      return jsonResponse({ error: "Configuração de backup não encontrada." }, 400);
    }

    if (!settings.enabled && !authHeader) {
      // Cron chamou mas backups estão desativados — sair silenciosamente
      return jsonResponse({ skipped: true, reason: "Backups desativados." });
    }

    const folderId = typeof settings.drive_folder_id === "string" ? settings.drive_folder_id.trim() : "";

    if (!folderId) {
      const errMsg = "ID da pasta do Google Drive não configurado.";
      await admin
        .from("backup_settings")
        .update({
          last_backup_at: new Date().toISOString(),
          last_backup_status: "erro",
          last_backup_error: errMsg,
        })
        .eq("id", settings.id);
      return jsonResponse({ error: errMsg }, 400);
    }

    const serviceAccount = parseGoogleServiceAccount();

    // 1) Autenticar e validar acesso à pasta antes de exportar dados
    const accessToken = await getGoogleAccessToken(serviceAccount, [GOOGLE_DRIVE_BACKUP_SCOPE]);
    const folderName = await validateDriveFolder(
      accessToken,
      folderId,
      serviceAccount.client_email,
    );

    // 2) Exportar base de dados
    const jsonDump = await exportDatabase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `cyberdossier-backup-${timestamp}.json`;

    // 3) Upload
    const fileId = await uploadToDrive(
      accessToken,
      folderId,
      fileName,
      jsonDump,
    );

    // 4) Limpeza de backups antigos
    const retentionWeeks = settings.retention_weeks ?? 12;
    const cutoff = new Date(Date.now() - retentionWeeks * 7 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    try {
      const files = await listDriveFiles(accessToken, folderId);
      for (const file of files) {
        if (file.name.startsWith("cyberdossier-backup-") && new Date(file.createdTime) < cutoff) {
          await deleteDriveFile(accessToken, file.id);
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
      const storedError = errorDetails ? `${errorMessage} ${errorDetails}` : errorMessage;
      await admin
        .from("backup_settings")
        .update({
          last_backup_at: new Date().toISOString(),
          last_backup_status: "erro",
          last_backup_error: storedError,
        })
        .neq("id", "00000000-0000-0000-0000-000000000000");
    } catch {
      // Ignorar erro ao escrever erro
    }

    return jsonResponse({ error: errorMessage, details: errorDetails }, status);
  }
});
