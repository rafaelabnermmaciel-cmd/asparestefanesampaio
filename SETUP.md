# Passo a passo — configurar o Firebase (sem precisar saber programar)

Siga na ordem. É só clicar, colar e apertar os botões indicados — em nenhum passo você
precisa escrever código.

---

## 1. Abrir o projeto no Firebase

Você já criou um projeto no Google Cloud (aparece como "My First Project" /
`project-398e198f-283b-4d9c-807`). O Firebase usa esse mesmo tipo de projeto por baixo, mas
precisa ser "adicionado" pelo **console do Firebase** (não o do Google Cloud) pra liberar as
telas certas. Faça assim:

1. Acesse **https://console.firebase.google.com** (repare: `firebase`, não `cloud`, no
   endereço) e faça login com a mesma conta Google.
2. Clique em **Criar um projeto** (ou **Adicionar projeto**).
3. Se aparecer a opção de usar um projeto do Google Cloud já existente, escolha o seu
   (`My First Project` / `project-398e198f-283b-4d9c-807`) na lista. Se não aparecer, sem
   problema — pode criar um projeto novo do zero, com o nome que quiser (ex.:
   `asparestefanesampaio`).
4. Pode desmarcar o Google Analytics (não é necessário para este app). Clique em **Criar
   projeto** (ou **Continuar**) e aguarde alguns segundos.

## 2. Criar o banco de dados (Firestore)

1. No menu da esquerda, clique em **Compilação** → **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha a localização mais próxima do Brasil (ex.: `southamerica-east1` — São Paulo).
4. Em modo de segurança, escolha **Iniciar no modo de teste** (regras abertas por 30 dias —
   depois disso, use as regras da seção 4 abaixo, que não expiram).
5. Clique em **Ativar**.

## 3. Registrar o app da web e pegar a configuração

1. No menu da esquerda, clique no ícone de engrenagem ⚙️ ao lado de **Visão geral do
   projeto** → **Configurações do projeto**.
2. Role até **Seus apps** e clique no ícone **`</>`** (Web).
3. Dê um apelido, por exemplo `rm-veiculos` (não marque o Firebase Hosting). Clique em
   **Registrar app**.
4. Vai aparecer um bloco de código com `const firebaseConfig = { ... }`. Copie os valores de
   `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` e `appId`.
5. Abra o arquivo `js/firebase-config.js` deste projeto e substitua cada `COLE_AQUI_...` pelo
   valor correspondente que você copiou. Salve o arquivo.

   Exemplo de como fica depois de preenchido:
   ```js
   export const firebaseConfig = {
     apiKey: 'AIzaSyD...',
     authDomain: 'project-398e198f-283b-4d9c-807.firebaseapp.com',
     projectId: 'project-398e198f-283b-4d9c-807',
     storageBucket: 'project-398e198f-283b-4d9c-807.appspot.com',
     messagingSenderId: '123456789012',
     appId: '1:123456789012:web:abcdef123456',
   };
   ```
6. Clique em **Continuar no console** (não precisa dos passos de "Firebase Hosting" que
   aparecem em seguida).

## 4. Regras de segurança (recomendado, substitui o "modo de teste")

O modo de teste expira em 30 dias. Para deixar liberado para toda a equipe sem precisar
renovar, vá em **Firestore Database** → aba **Regras**, apague o conteúdo e cole:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /veiculos/{doc} { allow read, write: if true; }
    match /financiamentos/{doc} { allow read, write: if true; }
    match /locacoes/{doc} { allow read, write: if true; }
    match /pagamentos/{doc} { allow read, write: if true; }
    match /manutencoes/{doc} { allow read, write: if true; }
  }
}
```

Clique em **Publicar**. Isso libera leitura e escrita nas 5 coleções do app para qualquer
pessoa com o link — adequado para uso pessoal/interno rápido. Se mais adiante quiser exigir
login, é possível trocar `if true` por uma regra de autenticação, mas isso já exige adicionar
login ao app (fora do escopo deste app simples).

## 5. Abrir o app

- **Mais simples**: publique este repositório em qualquer hospedagem de arquivos estáticos
  (GitHub Pages, Netlify, Vercel, etc.) e acesse o link com o celular ou computador — é só
  HTML/CSS/JS puro, sem instalação, sem build.
- **Testar localmente**: dentro da pasta do projeto, rode `python3 -m http.server 8080` (ou
  qualquer servidor local de arquivos estáticos) e abra `http://localhost:8080` no navegador.
  Abrir o `index.html` direto pelo `file://` não funciona porque o navegador bloqueia módulos
  JavaScript (`type="module"`) nesse modo.

## 6. Carregar a frota padrão (SSF4H14, SMM4D01, SGY7C19)

Assim que o Firebase estiver configurado, abra o app, vá na aba **Veículos** e clique no botão
**"Carregar frota padrão"** (só aparece enquanto a frota estiver vazia). Isso cadastra de uma
vez os 3 veículos administrados, os financiamentos do SSF4H14, o histórico de locações de cada
carro e a última revisão registrada de cada um.

É seguro clicar de novo depois (por exemplo, se alguém clicar sem querer) — o botão some
sozinho assim que já houver veículos cadastrados, e o carregamento nunca sobrescreve um
registro que já exista.

Depois disso, é só ir lançando os **Pagamentos** semanais (toda segunda-feira) e as novas
**Manutenções** conforme forem feitas — e cadastrar nova **Locação** quando um veículo trocar
de locatário.
