// Dados de pré-carga da frota RM Veículos — direto dos contratos, CRLVs e estudos de
// rentabilidade já existentes (conferido com o Rafael). Usado só pela função de seed em
// firestore.js (idempotente: nunca sobrescreve doc já existente).

export const MODELO_PADRAO = 'BYD Dolphin GS 180EV';
export const VALOR_SEMANAL_PADRAO = 1500;
export const CAUCAO_PADRAO = 2500;
export const PROTECAO_VEICULAR_MENSAL = 300;
export const TAXA_ADMINISTRACAO_MENSAL = 1500;
export const MULTA_ATRASO_DIARIA = 50;

// Tabela oficial de revisões BYD Dolphin, vigente desde 01/09/2026 (peças + mão de obra).
// Usada para calcular sozinho qual é a próxima revisão de cada carro a partir da última feita.
export const TABELA_REVISAO_BYD = [
  { km: 60000, valor: 393 },
  { km: 80000, valor: 1292 },
  { km: 100000, valor: 758 },
  { km: 120000, valor: 1292 },
  { km: 140000, valor: 393 },
];

// ---- Veículos ---------------------------------------------------------------------------

export const VEICULOS_SEED = [
  {
    id: 'veiculo-ssf4h14',
    placa: 'SSF4H14',
    modelo: MODELO_PADRAO,
    cor: 'Preta',
    anoFabricacao: '2023',
    anoModelo: '2024',
    renavam: '01372721190',
    chassi: 'LC0CE4CC1R0008672',
    proprietarioNome: 'Rafael Abner Machado Maciel',
    tipoReceita: 'total', // é seu — a renda é o aluguel inteiro, menos financiamento/gastos
    valorCompra: 120000,
    dataInicioOperacao: '2026-05-28',
    protecaoVeicularMensal: PROTECAO_VEICULAR_MENSAL,
    status: 'ativo',
  },
  {
    id: 'veiculo-smm4d01',
    placa: 'SMM4D01',
    modelo: MODELO_PADRAO,
    cor: 'Preta',
    anoFabricacao: '2023',
    anoModelo: '2024',
    renavam: '01380386702',
    chassi: 'LC0CE4CC5R0010358',
    proprietarioNome: 'Douglas Martins Soares',
    tipoReceita: 'administracao', // de terceiro — a renda é a taxa fixa de administração
    valorCompra: 117000,
    dataInicioOperacao: '2026-06-16',
    kmInicial: 57078,
    protecaoVeicularMensal: PROTECAO_VEICULAR_MENSAL,
    taxaAdministracaoMensal: TAXA_ADMINISTRACAO_MENSAL,
    status: 'ativo',
  },
  {
    id: 'veiculo-sgy7c19',
    placa: 'SGY7C19',
    modelo: MODELO_PADRAO,
    cor: 'Amarela',
    anoFabricacao: '2023',
    anoModelo: '2024',
    renavam: '01369841830',
    chassi: 'LC0CE4CC2R0007269',
    proprietarioNome: 'Luiz Claudio Cardoso Maciel',
    tipoReceita: 'administracao',
    valorCompra: 117000,
    dataInicioOperacao: '2026-10-13',
    protecaoVeicularMensal: PROTECAO_VEICULAR_MENSAL,
    taxaAdministracaoMensal: TAXA_ADMINISTRACAO_MENSAL,
    status: 'ativo',
  },
];

// ---- Financiamentos (só do veículo próprio — SSF) -----------------------------------------

export const FINANCIAMENTOS_SEED = [
  {
    id: 'financiamento-ssf-1',
    veiculoId: 'veiculo-ssf4h14',
    instituicao: 'Caixa',
    numeroContrato: '0304944-42',
    parcela: 1356.03,
    jurosAoMes: 1.6,
    diaVencimento: 5,
  },
  {
    id: 'financiamento-ssf-2',
    veiculoId: 'veiculo-ssf4h14',
    instituicao: 'Caixa',
    numeroContrato: '0301751-23',
    parcela: 1320.23,
    jurosAoMes: 1.5,
    diaVencimento: 5,
  },
];

// ---- Locações (histórico de locatários por veículo) ---------------------------------------
// diaPagamento: dia da semana atual de cobrança (todos migraram para segunda-feira a partir de
// 09/11/2026 — contratos antigos ficam registrados com o dia que valia na época, por histórico).

export const LOCACOES_SEED = [
  // --- SSF4H14 ---
  {
    id: 'locacao-ssf-geudivaldo',
    veiculoId: 'veiculo-ssf4h14',
    locatarioNome: 'Geudivaldo Ribeiro',
    dataRetirada: '2026-05-28',
    dataFim: '2026-08-05',
    valorSemanal: 1550,
    diaPagamento: 'quinta',
    caucaoValor: null,
    caucaoStatus: '',
    status: 'encerrada',
  },
  {
    id: 'locacao-ssf-denilson',
    veiculoId: 'veiculo-ssf4h14',
    locatarioNome: 'Denilson',
    dataRetirada: '2026-08-06',
    dataFim: '2026-10-19',
    valorSemanal: 1500,
    diaPagamento: 'quinta',
    caucaoValor: null,
    caucaoStatus: '',
    status: 'encerrada',
  },
  {
    id: 'locacao-ssf-luiza',
    veiculoId: 'veiculo-ssf4h14',
    locatarioNome: 'Luiza Cristina Moreira Bastos',
    locatarioCpf: '021.886.991-65',
    dataRetirada: '2026-10-28',
    dataFim: '2027-04-28',
    valorSemanal: VALOR_SEMANAL_PADRAO,
    diaPagamento: 'segunda',
    diaPagamentoAnterior: 'quarta',
    caucaoValor: CAUCAO_PADRAO,
    caucaoStatus: 'recebida',
    multaRescisoria: 750,
    status: 'ativa',
  },

  // --- SMM4D01 ---
  {
    id: 'locacao-smm-max',
    veiculoId: 'veiculo-smm4d01',
    locatarioNome: 'Max Benicio Félix',
    dataRetirada: '2026-06-16',
    dataFim: '2026-07-27',
    valorSemanal: VALOR_SEMANAL_PADRAO,
    diaPagamento: 'quarta',
    caucaoValor: 3000,
    caucaoStatus: 'parcial',
    status: 'encerrada',
  },
  {
    id: 'locacao-smm-matheus-alves',
    veiculoId: 'veiculo-smm4d01',
    locatarioNome: 'Matheus Alves de Sousa',
    dataRetirada: '2026-08-05',
    dataFim: '2026-10-14',
    valorSemanal: VALOR_SEMANAL_PADRAO,
    diaPagamento: 'terca',
    caucaoValor: CAUCAO_PADRAO,
    caucaoStatus: 'devolvida',
    status: 'encerrada',
  },
  {
    id: 'locacao-smm-matheus-pereira',
    veiculoId: 'veiculo-smm4d01',
    locatarioNome: 'Matheus Pereira dos Santos',
    locatarioCpf: '025.744.181-66',
    dataRetirada: '2026-10-15',
    dataFim: '2027-04-15',
    valorSemanal: VALOR_SEMANAL_PADRAO,
    diaPagamento: 'segunda',
    diaPagamentoAnterior: 'quinta',
    caucaoValor: CAUCAO_PADRAO,
    caucaoStatus: 'recebida',
    multaRescisoria: 750,
    status: 'ativa',
  },

  // --- SGY7C19 ---
  {
    id: 'locacao-sgy-herbert',
    veiculoId: 'veiculo-sgy7c19',
    locatarioNome: 'Herbert Vieira Pedroza',
    locatarioCpf: '062.524.541-50',
    dataRetirada: '2026-10-13',
    dataFim: '2027-04-13',
    valorSemanal: VALOR_SEMANAL_PADRAO,
    diaPagamento: 'segunda',
    diaPagamentoAnterior: 'terca',
    caucaoValor: CAUCAO_PADRAO,
    caucaoStatus: 'recebida',
    multaRescisoria: 750,
    status: 'ativa',
  },
];

// ---- Manutenções (última revisão feita — a próxima é calculada sozinha pela tabela BYD) ---

export const MANUTENCOES_SEED = [
  {
    id: 'manutencao-ssf-rev1',
    veiculoId: 'veiculo-ssf4h14',
    tipo: 'revisao',
    dataRealizada: '2026-10-27',
    kmRealizado: 79891,
    status: 'concluida',
  },
  {
    id: 'manutencao-smm-rev1',
    veiculoId: 'veiculo-smm4d01',
    tipo: 'revisao',
    dataRealizada: '2026-09-03',
    kmRealizado: 80215,
    status: 'concluida',
  },
  {
    id: 'manutencao-sgy-rev1',
    veiculoId: 'veiculo-sgy7c19',
    tipo: 'revisao',
    dataRealizada: '2026-07-13',
    kmRealizado: 59947,
    status: 'concluida',
  },
];

// Calcula a próxima revisão prevista: o marco de km da tabela BYD logo acima da última
// revisão feita, e a data = última data + 1 ano. Vale o que vier primeiro.
export function calcularProximaRevisao(kmUltimaRevisao, dataUltimaRevisao) {
  const proximoMarco = TABELA_REVISAO_BYD.find((m) => m.km > kmUltimaRevisao);
  const [ano, mes, dia] = dataUltimaRevisao.split('-').map(Number);
  const dataPrevista = new Date(ano + 1, mes - 1, dia);
  const dataPrevistaISO = `${dataPrevista.getFullYear()}-${String(dataPrevista.getMonth() + 1).padStart(2, '0')}-${String(dataPrevista.getDate()).padStart(2, '0')}`;
  return {
    kmPrevisto: proximoMarco ? proximoMarco.km : null,
    valorPrevisto: proximoMarco ? proximoMarco.valor : null,
    dataPrevista: dataPrevistaISO,
  };
}
