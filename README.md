# Equipe de Rua — Estéfane Sampaio

App de organização da equipe de rua da campanha: cadastro de pessoas, localidades
(panfletagem e reunião/café) e agenda diária de atividades (panfletagem, reunião/café,
paredão, eventos nas RAs), com contador de contratados vs. quem está na rua no dia, resumo do
dia por tipo de atividade e por RA, e alerta de RA sem visita há muito tempo.

HTML/CSS/JS puro (sem build, sem framework) + **Firebase Firestore** como banco de dados, com
sincronização em tempo real entre todos os aparelhos da equipe. Reaproveita a paleta e a
estrutura de navegação (sidebar + barra inferior no celular, tema claro/escuro) dos painéis
`painel-nacional`/`painel-captacao` do repositório `asparcbmgo` — projeto independente, mas
com a mesma identidade visual.

**Primeira vez configurando?** Vá direto pro **[SETUP.md](./SETUP.md)** — passo a passo
clicável para criar o projeto no Firebase, sem precisar programar.

## Estrutura

- `index.html` — layout (sidebar, barra mobile, contador do topo, modais).
- `css/styles.css` — pequenos ajustes além do Tailwind (via CDN).
- `js/firebase-config.js` — **edite este arquivo** com os dados do seu projeto Firebase.
- `js/firestore.js` — conexão com o Firestore: CRUD das 3 coleções, listeners em tempo real
  (`onSnapshot`) e a função de pré-carga do cronograma.
- `js/seed-data.js` — dados do Plano de Ação (localidades e agenda de 31/08 a 24/09/2026) e
  referências fixas (capacidade de panfletagem, janela do mini trio, prazo final de visitas).
- `js/app.js` — toda a interface: navegação entre páginas, renderização das telas, filtros e
  formulários.

## Coleções no Firestore

**`pessoas`**
`nome`, `contato`, `funcao`, `status` (`ativo` | `inativo`).

**`localidades`**
`ra` (região administrativa), `tipo` (`panfletagem` | `reuniao`), `endereco`,
`anfitriaoNome`/`anfitriaoContato` (só relevantes quando `tipo === 'reuniao'`).

**`agenda`**
`data` (`AAAA-MM-DD`), `tipoAtividade` (`panfletagem` | `reuniao` | `paredao` | `evento`),
`localidadeId` (referência a `localidades`), `pessoasIds` (array de referências a `pessoas`),
`equipeLabel` (rótulo livre, ex. "Grupo 1" — útil enquanto a atividade ainda não tem pessoas
específicas vinculadas), `pontoSaida`, `pontoRetorno`, `horarioInicio`, `status`
(`nao_iniciado` | `na_rua` | `retornou`), `visita` (ex. "1ª visita"), `observacoes`.

## Telas

- **Resumo do dia**: contador de contratados vs. na rua hoje (no topo, em todas as páginas),
  seletor de data, aviso de prazo final de visitas e do mini trio, alerta de RAs sem visita há
  10+ dias (ou perto disso), resumo agrupado por tipo de atividade e por RA, e a métrica de
  capacidade estimada de panfletagem (pessoas × ~266 panfletos/dia).
- **Agenda diária**: filtros por data, RA e pessoa; tabela com troca rápida de status
  (não iniciado / na rua / retornou) direto na linha; cadastro/edição de atividade com
  dropdowns de localidade e pessoas já cadastradas; botão para carregar o cronograma padrão.
- **Pessoas**: cadastro rápido (nome, contato, função), inativar/ativar sem excluir.
- **Localidades**: cadastro por RA, tipo de ponto, endereço/referência e dados do anfitrião
  quando for ponto de reunião/café.

## Por que sem build?

O pedido era uma interface HTML/JS simples de preencher no dia a dia por toda a equipe de
rua. Sem etapa de build, basta subir este repositório em qualquer hospedagem estática (ou até
abrir com um servidor local) — não precisa de Node, `npm install` nem pipeline de deploy.
