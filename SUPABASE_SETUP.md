# Configuração do Supabase Auth

O Supabase é usado **somente para autenticação** nesta etapa. Viagens, rotas,
conquistas, POIs e caches continuam armazenados exclusivamente no navegador.

1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. No painel do projeto, abra **Project Settings → API** e copie:
   - **Project URL**;
   - a chave **anon/public** (ou a chave pública indicada para uso no navegador).
3. Preencha `config.js` com esses dois valores:

   ```js
   window.MINHAS_VIAGENS_CONFIG = {
     supabaseUrl: "https://SEU-PROJETO.supabase.co",
     supabaseAnonKey: "SUA-CHAVE-ANON-PUBLIC"
   };
   ```

   Nunca use a chave `service_role`, senha do banco ou outro segredo neste
   arquivo público.
4. Em **Authentication → Providers → Email**, mantenha o provedor de e-mail
   ativado e habilite o fluxo por Magic Link. Configure também um serviço de
   envio de e-mail caso o ambiente de produção exija SMTP próprio.
5. Em **Authentication → URL Configuration**, defina a **Site URL** como:

   ```text
   https://lcmsarq-creator.github.io/minhas-viagens/
   ```

6. Na mesma tela, adicione às **Redirect URLs**:

   ```text
   https://lcmsarq-creator.github.io/minhas-viagens/
   ```

7. Publique os arquivos estáticos no GitHub Pages. Faça um teste solicitando o
   link, abrindo-o no mesmo navegador e confirmando que o aplicativo abre já
   autenticado. A sessão é persistida e renovada pelo SDK do Supabase.

Se `Project URL` ou `anon/public key` estiverem vazias, o site mostra
“Supabase ainda não configurado” em vez de inicializar o aplicativo.
