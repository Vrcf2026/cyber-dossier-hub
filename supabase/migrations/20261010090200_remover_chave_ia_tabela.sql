-- A coluna company_settings.claude_api_key não é usada (as funções leem ANTHROPIC_API_KEY dos
-- segredos das Edge Functions) e a tabela pode ser lida por qualquer conta autenticada,
-- incluindo as contas de cliente do portal. Se alguma vez lá esteve uma chave, fica exposta:
-- apaga-se a coluna. (Se havia uma chave guardada, revogá-la na consola da Anthropic.)
ALTER TABLE public.company_settings DROP COLUMN IF EXISTS claude_api_key;
