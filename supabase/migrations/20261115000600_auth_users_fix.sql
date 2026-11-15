-- =====================================================================
-- 06 · Correção dos usuários criados por SQL direto no auth.users
-- =====================================================================
-- Contexto: usuários criados fora do fluxo de signup do GoTrue (por exemplo
-- por script administrativo ou INSERT direto) podem ficar com NULL nas
-- colunas de token. O GoTrue lê essas colunas como `string` e devolve
-- HTTP 500 "Database error querying schema" em qualquer tentativa de login.
--
-- Referências:
--   https://github.com/supabase/auth/issues/1940
--   https://supabase.com/kb/troubleshooting/auth-error-500-database-error-querying-schema-eb6b44
--
-- Solução: normalizar NULL -> '' (string vazia), que é exatamente o valor
-- gravado pelo fluxo normal de criação de usuário.
--
-- Idempotente: pode rodar quantas vezes for necessário.

update auth.users set
  confirmation_token          = coalesce(confirmation_token, ''),
  recovery_token              = coalesce(recovery_token, ''),
  email_change                = coalesce(email_change, ''),
  email_change_token_new      = coalesce(email_change_token_new, ''),
  email_change_token_current  = coalesce(email_change_token_current, ''),
  phone_change                = coalesce(phone_change, ''),
  phone_change_token          = coalesce(phone_change_token, ''),
  reauthentication_token      = coalesce(reauthentication_token, '')
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null
   or email_change_token_current is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;

-- Verificação: nenhuma coluna de token deve permanecer NULL.
-- select count(*) as usuarios_com_token_nulo
-- from auth.users
-- where confirmation_token is null
--    or recovery_token is null
--    or email_change is null
--    or email_change_token_new is null;
