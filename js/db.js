// Camada de acesso ao Supabase: init do cliente, CRUD das 3 tabelas e listeners em tempo real.
// Mantém os mesmos nomes de campo em camelCase que o resto do app já usa (app.js não sabe, e
// não precisa saber, que o banco por trás é o Supabase — só esta camada conhece as colunas
// em snake_case das tabelas).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { LOCALIDADES_SEED, AGENDA_SEED } from './seed-data.js';

export const supabaseConfigurado = !SUPABASE_URL.startsWith('COLE_AQUI') && !SUPABASE_ANON_KEY.startsWith('COLE_AQUI');

// O SDK é carregado como script clássico no index.html (window.supabase), não como módulo —
// é o jeito recomendado pelo próprio Supabase pra apps sem build/bundler.
const cliente = supabaseConfigurado ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function checarCliente() {
  if (!cliente) throw new Error('Supabase não configurado. Preencha js/supabase-config.js (veja SETUP.md).');
}

function novoId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

// ---- Conversão linha (snake_case) <-> objeto do app (camelCase) --------------------------

const pessoaFromRow = (r) => ({ id: String(r.id), nome: r.nome, contato: r.contato, funcao: r.funcao, status: r.status });

const localidadeFromRow = (r) => ({
  id: r.id, ra: r.ra, tipo: r.tipo, endereco: r.endereco,
  anfitriaoNome: r.anfitriao_nome, anfitriaoContato: r.anfitriao_contato,
});

const atividadeFromRow = (r) => ({
  id: r.id, data: r.data, tipoAtividade: r.tipo_atividade, localidadeId: r.localidade_id,
  equipeLabel: r.equipe_label, pessoasIds: (r.pessoas_ids || []).map(String),
  pontoSaida: r.ponto_saida, pontoRetorno: r.ponto_retorno, horarioInicio: r.horario_inicio,
  visita: r.visita, status: r.status, observacoes: r.observacoes,
});

// ---- Listeners em tempo real -------------------------------------------------------------
// Estratégia simples (adequada ao tamanho destas tabelas): a cada mudança avisada pelo
// Realtime, busca a lista inteira de novo e entrega pronta pro callback — sem precisar
// remontar o array na mão a partir do payload do evento.

function ouvirTabela(nomeTabela, mapRow, callback) {
  checarCliente();
  let cancelado = false;

  async function recarregar() {
    const { data, error } = await cliente.from(nomeTabela).select('*');
    if (cancelado) return;
    if (error) { console.warn(`[db] falha ao ler ${nomeTabela}:`, error.message); return; }
    callback(data.map(mapRow));
  }

  recarregar();
  const canal = cliente
    .channel(`${nomeTabela}-realtime`)
    .on('postgres_changes', { event: '*', schema: 'public', table: nomeTabela }, recarregar)
    .subscribe();

  return () => { cancelado = true; cliente.removeChannel(canal); };
}

export function ouvirPessoas(callback) { return ouvirTabela('pessoas', pessoaFromRow, callback); }
export function ouvirLocalidades(callback) { return ouvirTabela('localidades', localidadeFromRow, callback); }
export function ouvirAgenda(callback) { return ouvirTabela('agenda', atividadeFromRow, callback); }

// ---- Pessoas -------------------------------------------------------------------------------

export async function salvarPessoa(dados, id) {
  checarCliente();
  const row = { nome: dados.nome, contato: dados.contato, funcao: dados.funcao, status: dados.status, atualizado_em: new Date().toISOString() };
  if (id) {
    const { error } = await cliente.from('pessoas').update(row).eq('id', Number(id));
    if (error) throw new Error(error.message);
    return id;
  }
  const { data, error } = await cliente.from('pessoas').insert(row).select('id').single();
  if (error) throw new Error(error.message);
  return String(data.id);
}

export async function definirStatusPessoa(id, status) {
  checarCliente();
  const { error } = await cliente.from('pessoas').update({ status, atualizado_em: new Date().toISOString() }).eq('id', Number(id));
  if (error) throw new Error(error.message);
}

// ---- Localidades ---------------------------------------------------------------------------

export async function salvarLocalidade(dados, id) {
  checarCliente();
  const row = {
    ra: dados.ra, tipo: dados.tipo, endereco: dados.endereco,
    anfitriao_nome: dados.anfitriaoNome, anfitriao_contato: dados.anfitriaoContato,
    atualizado_em: new Date().toISOString(),
  };
  if (id) {
    const { error } = await cliente.from('localidades').update(row).eq('id', id);
    if (error) throw new Error(error.message);
    return id;
  }
  const novoIdGerado = novoId();
  const { error } = await cliente.from('localidades').insert({ id: novoIdGerado, ...row });
  if (error) throw new Error(error.message);
  return novoIdGerado;
}

// ---- Agenda diária -------------------------------------------------------------------------

export async function salvarAtividade(dados, id) {
  checarCliente();
  const row = {
    data: dados.data, tipo_atividade: dados.tipoAtividade, localidade_id: dados.localidadeId || null,
    equipe_label: dados.equipeLabel, pessoas_ids: (dados.pessoasIds || []).map(Number),
    ponto_saida: dados.pontoSaida, ponto_retorno: dados.pontoRetorno, horario_inicio: dados.horarioInicio,
    visita: dados.visita || '', status: dados.status, observacoes: dados.observacoes,
    atualizado_em: new Date().toISOString(),
  };
  if (id) {
    const { error } = await cliente.from('agenda').update(row).eq('id', id);
    if (error) throw new Error(error.message);
    return id;
  }
  const novoIdGerado = novoId();
  const { error } = await cliente.from('agenda').insert({ id: novoIdGerado, ...row });
  if (error) throw new Error(error.message);
  return novoIdGerado;
}

export async function definirStatusAtividade(id, status) {
  checarCliente();
  const { error } = await cliente.from('agenda').update({ status, atualizado_em: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- Pré-carga (cronograma 31/08–24/09) ----------------------------------------------------
// Idempotente: cada item do seed tem um ID fixo e o upsert usa "ignoreDuplicates" — então
// clicar em "Carregar cronograma padrão" de novo nunca sobrescreve edições/status já feitos
// (linhas que já existem simplesmente não voltam no "select()" abaixo, por isso a contagem
// criada reflete só o que era realmente novo).

export async function carregarCronogramaPadrao() {
  checarCliente();

  const localidadesRows = LOCALIDADES_SEED.map((l) => ({
    id: l.id, ra: l.ra, tipo: l.tipo, endereco: l.endereco,
    anfitriao_nome: l.anfitriaoNome, anfitriao_contato: l.anfitriaoContato,
  }));
  const { data: localidadesInseridas, error: erroLoc } = await cliente
    .from('localidades').upsert(localidadesRows, { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if (erroLoc) throw new Error(erroLoc.message);

  const agendaRows = AGENDA_SEED.map((a) => ({
    id: a.id, data: a.data, tipo_atividade: a.tipoAtividade, localidade_id: a.localidadeId,
    equipe_label: a.equipeLabel, pessoas_ids: a.pessoasIds, ponto_saida: a.pontoSaida,
    ponto_retorno: a.pontoRetorno, horario_inicio: a.horarioInicio, visita: a.visita, status: a.status,
    observacoes: a.observacoes,
  }));
  const { data: agendaInserida, error: erroAgenda } = await cliente
    .from('agenda').upsert(agendaRows, { onConflict: 'id', ignoreDuplicates: true }).select('id');
  if (erroAgenda) throw new Error(erroAgenda.message);

  return { localidadesCriadas: localidadesInseridas?.length || 0, atividadesCriadas: agendaInserida?.length || 0 };
}

export async function cronogramaJaCarregado() {
  checarCliente();
  const { count, error } = await cliente.from('agenda').select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return (count || 0) > 0;
}
