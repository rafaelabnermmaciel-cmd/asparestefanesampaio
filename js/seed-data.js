// Dados de pré-carga: Plano de Ação — Visitas às RAs (Estéfane Sampaio, 31/08 a 24/09/2026).
// Usado só pela função de seed em firestore.js (idempotente: nunca sobrescreve doc existente).

export const PONTO_PADRAO = 'Comitê (Taguatinga)';
export const HORARIO_PADRAO = '13:30';

// Uma localidade por RA (RAs que aparecem 2x no cronograma reaproveitam a mesma localidade).
export const LOCALIDADES_SEED = [
  { id: 'loc-ceilandia', ra: 'Ceilândia' },
  { id: 'loc-recanto-das-emas', ra: 'Recanto das Emas' },
  { id: 'loc-taguatinga', ra: 'Taguatinga' },
  { id: 'loc-brazlandia', ra: 'Brazlândia' },
  { id: 'loc-samambaia', ra: 'Samambaia' },
  { id: 'loc-planaltina', ra: 'Planaltina (+ Arapoanga)' },
  { id: 'loc-aguas-claras', ra: 'Águas Claras' },
  { id: 'loc-gama', ra: 'Gama' },
  { id: 'loc-sobradinho', ra: 'Sobradinho I e II' },
  { id: 'loc-guara', ra: 'Guará' },
  { id: 'loc-riacho-fundo', ra: 'Riacho Fundo I (+ Riacho Fundo II)' },
  { id: 'loc-sao-sebastiao', ra: 'São Sebastião' },
  { id: 'loc-asa-sul', ra: 'Asa Sul' },
  { id: 'loc-santa-maria', ra: 'Santa Maria' },
  { id: 'loc-cruzeiro', ra: 'Cruzeiro (+ Sudoeste/Octogonal)' },
  { id: 'loc-itapoa', ra: 'Itapoã (+ Paranoá)' },
  { id: 'loc-vicente-pires', ra: 'Vicente Pires' },
  { id: 'loc-nucleo-bandeirante', ra: 'Núcleo Bandeirante (+ Candangolândia)' },
  { id: 'loc-jardim-botanico', ra: 'Jardim Botânico (+ Varjão)' },
].map((l) => ({
  ...l,
  tipo: 'panfletagem',
  endereco: '',
  anfitriaoNome: '',
  anfitriaoContato: '',
}));

// data em ISO (YYYY-MM-DD), tipoAtividade padrão = panfletagem, saída/retorno no comitê às 13h30.
export const AGENDA_SEED = [
  { dia: 1, data: '2026-08-31', localidadeId: 'loc-ceilandia', equipeLabel: 'Grupo 1', visita: '1ª visita' },
  { dia: 2, data: '2026-09-01', localidadeId: 'loc-recanto-das-emas', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 3, data: '2026-09-02', localidadeId: 'loc-taguatinga', equipeLabel: 'Grupo 1', visita: '1ª visita' },
  { dia: 4, data: '2026-09-03', localidadeId: 'loc-brazlandia', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 5, data: '2026-09-04', localidadeId: 'loc-samambaia', equipeLabel: 'Grupo 1', visita: '1ª visita' },
  { dia: 6, data: '2026-09-05', localidadeId: 'loc-planaltina', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 7, data: '2026-09-06', localidadeId: 'loc-aguas-claras', equipeLabel: 'Grupo 1', visita: '1ª visita' },
  { dia: 8, data: '2026-09-07', localidadeId: 'loc-gama', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 9, data: '2026-09-08', localidadeId: 'loc-sobradinho', equipeLabel: 'Grupo 1', visita: '1ª visita' },
  { dia: 10, data: '2026-09-09', localidadeId: 'loc-guara', equipeLabel: 'Grupo 1', visita: '1ª visita' },
  { dia: 11, data: '2026-09-10', localidadeId: 'loc-ceilandia', equipeLabel: 'Grupo 1', visita: '2ª visita (retorno)' },
  { dia: 12, data: '2026-09-11', localidadeId: 'loc-riacho-fundo', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 13, data: '2026-09-12', localidadeId: 'loc-taguatinga', equipeLabel: 'Grupo 1', visita: '2ª visita (retorno)' },
  { dia: 14, data: '2026-09-13', localidadeId: 'loc-sao-sebastiao', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 15, data: '2026-09-14', localidadeId: 'loc-samambaia', equipeLabel: 'Grupo 1', visita: '2ª visita (retorno)' },
  { dia: 16, data: '2026-09-15', localidadeId: 'loc-asa-sul', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 17, data: '2026-09-16', localidadeId: 'loc-aguas-claras', equipeLabel: 'Grupo 1', visita: '2ª visita (retorno)' },
  { dia: 18, data: '2026-09-17', localidadeId: 'loc-santa-maria', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 19, data: '2026-09-18', localidadeId: 'loc-sobradinho', equipeLabel: 'Grupo 1', visita: '2ª visita (retorno)' },
  { dia: 20, data: '2026-09-19', localidadeId: 'loc-guara', equipeLabel: 'Grupo 1', visita: '2ª visita (retorno)' },
  { dia: 21, data: '2026-09-20', localidadeId: 'loc-cruzeiro', equipeLabel: 'Grupo 3', visita: '1ª visita' },
  { dia: 22, data: '2026-09-21', localidadeId: 'loc-itapoa', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 23, data: '2026-09-22', localidadeId: 'loc-vicente-pires', equipeLabel: 'Grupo 2', visita: '1ª visita' },
  { dia: 24, data: '2026-09-23', localidadeId: 'loc-nucleo-bandeirante', equipeLabel: 'Grupo 3', visita: '1ª visita' },
  { dia: 25, data: '2026-09-24', localidadeId: 'loc-jardim-botanico', equipeLabel: 'Grupo 2 + Grupo 3', visita: '1ª visita' },
].map((a) => ({
  id: `seed-dia-${String(a.dia).padStart(2, '0')}`,
  data: a.data,
  tipoAtividade: 'panfletagem',
  localidadeId: a.localidadeId,
  equipeLabel: a.equipeLabel,
  visita: a.visita,
  pessoasIds: [],
  pontoSaida: PONTO_PADRAO,
  pontoRetorno: PONTO_PADRAO,
  horarioInicio: HORARIO_PADRAO,
  status: 'nao_iniciado',
  observacoes: '',
}));

// Referências fixas usadas na interface (não são registros da agenda, só avisos/metas).
export const CAPACIDADE_PANFLETAGEM = { pessoas: 30, panfletosPorPessoa: 266 };
export const MINI_TRIO = { disponivelDesde: '2026-08-31', inicio: '13:30', fim: '21:30' };
export const PRAZO_VOTACAO = '2026-10-04';
export const PRAZO_FINAL_VISITAS = '2026-09-24'; // 10 dias antes da votação
export const LIMITE_DIAS_SEM_VISITA = 10;
