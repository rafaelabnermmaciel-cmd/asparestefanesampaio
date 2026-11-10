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
    kmInicial: 52993, // termo de vistoria assinado com o Geudivaldo, 28/05/2026
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
    valorCompra: 118000,
    dataInicioOperacao: '2026-04-27', // 1º contrato (Gustavo), não o do Herbert
    kmInicial: 29000, // km que o carro tinha na compra
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
    locatarioNome: 'Geudivaldo Ribeiro de Souza',
    dataRetirada: '2026-05-28',
    dataFim: '2026-08-05',
    valorSemanal: 1550,
    diaPagamento: 'quinta',
    caucaoValor: 3000,
    caucaoStatus: 'retida',
    observacoes: 'Caução de R$3.000 retida integralmente. Mesmo assim ainda ficou devendo R$1.307,14 (R$807,14 de diárias em aberto + R$500,00 de orçamento de polimento/reparo).',
    status: 'encerrada',
  },
  {
    id: 'locacao-ssf-denilson',
    veiculoId: 'veiculo-ssf4h14',
    locatarioNome: 'Denilson Araujo Vieira',
    dataRetirada: '2026-08-06',
    dataFim: '2026-10-19',
    valorSemanal: 1500,
    diaPagamento: 'quinta',
    caucaoValor: CAUCAO_PADRAO,
    caucaoStatus: 'parcial',
    observacoes: 'Caução de R$2.500: reteve R$1.500 (diárias em atraso na devolução, pneu e polimento) e devolveu R$1.000. Ainda falta acertar R$150 (metade do conserto do carregador portátil, que quebrou enquanto estava com ele).',
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
    observacoes: 'Da caução de R$3.000 prevista em contrato, só pagou R$1.357,00 (nunca completou o valor cheio). Na devolução, foram retidas as 5 diárias de 22 a 26/07 (R$1.071,43). Foram devolvidos R$285,57. Ainda falta receber R$458,25 de multa, que ele está pagando aos poucos em lavagens do carro.',
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
    caucaoStatus: 'parcial',
    observacoes: 'Caução de R$2.500 NÃO foi devolvida integralmente. Descontos: 2 diárias em atraso na devolução (09 e 13/10, R$428,57), multa (R$104,00), lavagem (R$120,00), pneu (R$399,00) e retrovisor (R$300,00) — total descontado R$1.351,57. Foram devolvidos R$1.148,43.',
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
  // Gustavo foi o 1º motorista; depois ficou 45 dias parado (sem locatário) até o Herbert.
  {
    id: 'locacao-sgy-gustavo',
    veiculoId: 'veiculo-sgy7c19',
    locatarioNome: 'Gustavo Esser de Oliveira',
    dataRetirada: '2026-04-27',
    dataFim: '2026-08-29',
    valorSemanal: VALOR_SEMANAL_PADRAO,
    diaPagamento: 'segunda',
    caucaoValor: null,
    caucaoStatus: '',
    observacoes: 'Depois dele o carro ficou 45 dias parado (sem locatário) até o Herbert assumir em 13/10/2026.',
    status: 'encerrada',
  },
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

function diasEntreISO(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
}

function somarDiasISO(iso, dias) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Calcula a próxima revisão prevista: km = última revisão + 20.000 (espaçamento fixo da BYD,
// sempre o mesmo independente do km exato da última revisão), valor pela faixa da tabela mais
// próxima desse km previsto, e data projetada pela média de km rodado por dia (do início de
// operação até a última revisão), aplicada pra frente a partir da última revisão. Sem dados de
// km inicial/início de operação suficientes, cai de volta pra +1 ano. Vale o que vier primeiro.
export function calcularProximaRevisao(veiculo, manutencao) {
  const kmUltimaRevisao = manutencao.kmRealizado;
  const dataUltimaRevisao = manutencao.dataRealizada;
  const kmPrevisto = kmUltimaRevisao + 20000;

  const marcoProximo = TABELA_REVISAO_BYD.reduce((melhor, m) =>
    Math.abs(m.km - kmPrevisto) < Math.abs(melhor.km - kmPrevisto) ? m : melhor
  );

  let dataPrevista = null;
  if (veiculo?.kmInicial != null && veiculo?.dataInicioOperacao) {
    const dias = diasEntreISO(veiculo.dataInicioOperacao, dataUltimaRevisao);
    const kmRodados = kmUltimaRevisao - veiculo.kmInicial;
    if (dias > 0 && kmRodados > 0) {
      const mediaKmDia = kmRodados / dias;
      const candidata = somarDiasISO(dataUltimaRevisao, Math.round(20000 / mediaKmDia));
      // Só confia na projeção por km/dia se ela ainda não ficou muito velha (mais de 30 dias no
      // passado): depois disso o ritmo usado (de quando foi a última revisão até o início de
      // operação) deixou de refletir a realidade — por exemplo, o carro ficou parado ou trocou
      // de motorista no meio do caminho — e cai de volta pra +1 ano, mais seguro nesse caso.
      const hojeISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
      if (diasEntreISO(candidata, hojeISO) <= 30) dataPrevista = candidata;
    }
  }
  if (!dataPrevista) {
    const [ano, mes, dia] = dataUltimaRevisao.split('-').map(Number);
    dataPrevista = `${ano + 1}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  return { kmPrevisto, valorPrevisto: marcoProximo.valor, dataPrevista };
}
