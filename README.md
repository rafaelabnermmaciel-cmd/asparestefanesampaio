# RM Veículos — Controle de Frota

App de controle da frota administrada pela RM Veículos (Rafael Abner Machado Maciel):
cadastro dos veículos (BYD Dolphin GS 180EV), locações (histórico de locatários por carro),
pagamentos semanais (toda segunda-feira) e manutenções (revisões pela tabela oficial BYD, por
km ou data — vale o que vier primeiro), com previsibilidade de renda distinguindo veículo
próprio (receita total do aluguel) de veículos de terceiros (taxa fixa de administração).

HTML/CSS/JS puro (sem build, sem framework) + **Firebase Firestore** como banco de dados, com
sincronização em tempo real entre todos os aparelhos. Reaproveita a paleta e a estrutura de
navegação (sidebar + barra inferior no celular, tema claro/escuro) do projeto original deste
repositório.

**Primeira vez configurando?** Vá direto pro **[SETUP.md](./SETUP.md)** — passo a passo
clicável para criar o projeto no Firebase, sem precisar programar.

## Estrutura

- `index.html` — layout (sidebar, barra mobile, contador do topo, modais).
- `css/styles.css` — pequenos ajustes além do Tailwind (via CDN).
- `js/firebase-config.js` — **edite este arquivo** com os dados do seu projeto Firebase.
- `js/firestore.js` — conexão com o Firestore: CRUD das 5 coleções, listeners em tempo real
  (`onSnapshot`) e a função de pré-carga da frota padrão.
- `js/seed-data.js` — dados reais da frota (veículos, financiamentos, locações e manutenções
  dos 3 carros administrados) e a tabela oficial de revisões BYD.
- `js/app.js` — toda a interface: navegação entre páginas, renderização das telas, filtros e
  formulários.

## Coleções no Firestore

**`veiculos`**
`placa`, `modelo`, `cor`, `anoFabricacao`, `anoModelo`, `renavam`, `chassi`,
`proprietarioNome`, `tipoReceita` (`total` — é seu, a renda é o aluguel inteiro, menos
financiamento/gastos — ou `administracao` — de terceiro, a renda é a taxa fixa), `valorCompra`,
`dataInicioOperacao`, `kmInicial`, `protecaoVeicularMensal`, `taxaAdministracaoMensal` (quando
`tipoReceita === 'administracao'`), `status` (`ativo` | `inativo`).

**`financiamentos`**
`veiculoId`, `instituicao`, `numeroContrato`, `parcela`, `jurosAoMes`, `diaVencimento`.

**`locacoes`**
`veiculoId`, `locatarioNome`, `locatarioCpf`, `dataRetirada`, `dataFim`, `dataFimReal`,
`valorSemanal`, `diaPagamento` (dia da semana atual de cobrança), `diaPagamentoAnterior`
(dia que valia antes da migração para segunda-feira, por histórico), `caucaoValor`,
`caucaoStatus`, `multaRescisoria`, `status` (`ativa` | `encerrada`).

**`pagamentos`**
`locacaoId`, `dataReferencia` (semana a que se refere), `valor`, `status`
(`pago` | `pendente` | `atrasado`).

**`manutencoes`**
`veiculoId`, `tipo` (`revisao`), `dataRealizada`, `kmRealizado`, `status` (`concluida`).

## Telas

- **Painel**: pagamentos da semana (vencimento, status, atraso), próximas revisões previstas
  (km ou data, o que vier primeiro) e renda prevista do mês, separando receita total dos
  veículos próprios da taxa de administração dos veículos de terceiros.
- **Veículos**: cadastro da frota (dados do carro, proprietário, tipo de receita) e
  financiamentos vinculados (parcela, juros, dia de vencimento).
- **Locações**: histórico de locatários por veículo, com caução, multa rescisória e
  encerramento de contrato.
- **Pagamentos**: controle semanal (toda segunda-feira), filtro por veículo e status, marcar
  como pago/pendente/atrasado.
- **Manutenções**: registro de revisões feitas e cálculo automático da próxima (tabela oficial
  BYD por km, com data prevista = última data + 1 ano).

## Por que sem build?

Interface HTML/JS simples de preencher no dia a dia. Sem etapa de build, basta subir este
repositório em qualquer hospedagem estática (ou até abrir com um servidor local) — não precisa
de Node, `npm install` nem pipeline de deploy.
