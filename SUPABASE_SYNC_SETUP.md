# Configuração da sincronização com Supabase

Antes de a sincronização funcionar em produção, o proprietário do projeto deve:

1. Abrir o [Supabase Dashboard](https://supabase.com/dashboard).
2. Selecionar o projeto já usado pela autenticação do Minhas Viagens.
3. Abrir **SQL Editor**.
4. Copiar e executar todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
5. Em **Table Editor**, verificar se a tabela `public.trips` foi criada.
6. Nas opções da tabela, confirmar que RLS está ativado e que há políticas separadas de `SELECT`, `INSERT`, `UPDATE` e `DELETE` somente para o próprio `user_id`.

O frontend reutiliza a Publishable Key que já está em `config.js`. Não crie nem coloque uma `service_role`, secret key, senha, access token ou refresh token manual no frontend. O SDK Supabase continua responsável pela sessão.

O SQL não remove dados locais do navegador. Se ele ainda não tiver sido executado, o aplicativo permanece local-first e informa que a sincronização não está configurada.
