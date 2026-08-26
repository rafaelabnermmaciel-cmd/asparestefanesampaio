# Passo a passo — configurar o Supabase (sem precisar saber programar)

Siga na ordem. É só clicar, colar e apertar os botões indicados — em nenhum passo você
precisa escrever código.

---

## 1. Criar sua conta e o projeto no Supabase

1. Acesse **https://supabase.com** numa aba nova.
2. Clique em **Start your project** (canto superior direito).
3. Entre com sua conta Google ou GitHub.
4. Se for a primeira vez, o Supabase já cria uma organização padrão pra você. Clique nela (ou
   em **New project** se não tiver nenhuma).
5. Clique no botão verde **New project**. Preencha:
   - **Name**: `equipe-rua` (ou o nome que quiser, não afeta nada)
   - **Database Password**: clique em **Generate a password** e copie pra um lugar seguro
     (você provavelmente não vai precisar dela de novo pra este app, mas é bom guardar).
   - **Region**: **South America (São Paulo)** — deixa o app mais rápido pra quem acessa do
     Brasil.
6. Clique em **Create new project** e aguarde 1–2 minutos enquanto o Supabase prepara tudo.

## 2. Criar as tabelas e as permissões (um script só)

1. No menu da esquerda, clique no ícone **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo `supabase/schema.sql` deste projeto, selecione todo o conteúdo
   (Ctrl+A / Cmd+A) e copie (Ctrl+C / Cmd+C).
4. Volte pro Supabase e cole (Ctrl+V / Cmd+V) tudo dentro da caixa de texto do SQL Editor.
5. Clique no botão verde **Run** (ou Ctrl+Enter / Cmd+Enter).
6. Deve aparecer uma mensagem verde de sucesso lá embaixo. Se aparecer algo em vermelho, me
   manda o texto do erro que eu ajusto o script.

### Conferir se deu certo

Menu da esquerda → **Table Editor**: devem aparecer 3 tabelas — `pessoas` (vazia),
`localidades` (vazia) e `agenda` (vazia). Elas só ficam com dados depois do passo 5, quando
você clicar em "Carregar cronograma padrão" dentro do próprio app.

## 3. Pegar a URL e a chave do projeto (os 2 valores que o app precisa)

1. Menu da esquerda → ícone de engrenagem **Project Settings** → aba **API** (ou **Data API**,
   dependendo da versão do painel).
2. Copie o campo **Project URL** (começa com `https://` e termina em `.supabase.co`).
3. Copie a chave publicável — aparece como **anon public** (ou, em contas mais novas,
   **Publishable key**, que começa com `sb_publishable_...`) em **Project API keys**. **Não**
   copie a `service_role`/**Secret key** — essa é secreta e nunca deve ir para o navegador.
4. Abra o arquivo `js/supabase-config.js` deste projeto e substitua:
   - `COLE_AQUI_A_PROJECT_URL` pela Project URL
   - `COLE_AQUI_A_ANON_KEY` pela chave publicável/anon public
5. Salve o arquivo. Fica assim, por exemplo:
   ```js
   export const SUPABASE_URL = 'https://abcdefghijk.supabase.co';
   export const SUPABASE_ANON_KEY = 'sb_publishable_yUDKfC3UoJLRh_xOFQEy0A_EYAjFCXJ';
   ```

## 4. Abrir o app

- **Mais simples**: publique este repositório em qualquer hospedagem de arquivos estáticos
  (GitHub Pages, Netlify, Vercel, etc.) e acesse o link com o celular ou computador — é só
  HTML/CSS/JS puro, sem instalação, sem build.
- **Testar localmente**: dentro da pasta do projeto, rode `python3 -m http.server 8080` (ou
  qualquer servidor local de arquivos estáticos) e abra `http://localhost:8080` no navegador.
  Abrir o `index.html` direto pelo `file://` não funciona porque o navegador bloqueia módulos
  JavaScript (`type="module"`) nesse modo.

## 5. Carregar o cronograma pronto (31/08 a 24/09/2026)

Assim que o Supabase estiver configurado, abra o app, vá na aba **Agenda diária** e clique no
botão **"Carregar cronograma padrão"** (só aparece enquanto a agenda estiver vazia). Isso
cadastra de uma vez:

- As 19 localidades (uma por RA do cronograma), como pontos de **panfletagem**.
- As 25 atividades de panfletagem já com data, RA, grupo (Grupo 1/2/3) e horário de saída
  (13h30, saindo e retornando ao comitê em Taguatinga).

É seguro clicar de novo depois (por exemplo, se alguém clicar sem querer) — o botão some
sozinho assim que a agenda já tiver dados, e o carregamento nunca sobrescreve uma atividade ou
localidade que já exista.

Depois disso, é só a equipe ir cadastrando as **Pessoas** (aba Pessoas) e, na Agenda, editar
cada atividade para vincular quem vai em cada grupo — ou criar atividades novas para paredão,
reuniões/café e eventos que forem surgindo.

## Sobre segurança

As regras (RLS) do `schema.sql` deixam as 3 tabelas abertas pra leitura e escrita — qualquer
pessoa com o link do app consegue cadastrar e editar, sem precisar de login. Adequado para uso
interno rápido por toda a equipe de rua. Se mais adiante quiser exigir login, dá pra adicionar
autenticação do Supabase, mas isso fica fora do escopo deste app simples.
