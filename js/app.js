import {
  firebaseConfigurado,
  ouvirVeiculos,
  ouvirFinanciamentos,
  ouvirLocacoes,
  ouvirPagamentos,
  ouvirManutencoes,
  salvarVeiculo,
  salvarFinanciamento,
  excluirFinanciamento,
  salvarLocacao,
  encerrarLocacao,
  salvarPagamento,
  definirStatusPagamento,
  salvarManutencao,
  carregarFrotaPadrao,
  frotaJaCarregada,
} from './firestore.js';
import { MODELO_PADRAO, VALOR_SEMANAL_PADRAO, CAUCAO_PADRAO, TABELA_REVISAO_BYD, calcularProximaRevisao } from './seed-data.js';

// ---------------------------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------------------------

const state = {
  veiculos: [],
  financiamentos: [],
  locacoes: [],
  pagamentos: [],
  manutencoes: [],
  pagina: 'painel',
  pagamentosFiltro: { veiculoId: '', status: '' },
};

const NAV = [
  { id: 'painel', label: 'Painel', icon: 'layout-dashboard' },
  { id: 'veiculos', label: 'Veículos', icon: 'car' },
  { id: 'locacoes', label: 'Locações', icon: 'users' },
  { id: 'pagamentos', label: 'Pagamentos', icon: 'wallet' },
  { id: 'manutencoes', label: 'Manutenções', icon: 'wrench' },
];

const DIAS_SEMANA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const DIAS_SEMANA_LABEL = { segunda: 'Segunda-feira', terca: 'Terça-feira', quarta: 'Quarta-feira', quinta: 'Quinta-feira', sexta: 'Sexta-feira', sabado: 'Sábado', domingo: 'Domingo' };

const STATUS_LOCACAO = {
  ativa: { label: 'Ativa', cor: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  encerrada: { label: 'Encerrada', cor: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

const STATUS_PAGAMENTO = {
  pago: { label: 'Pago', cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
  pendente: { label: 'Pendente', cor: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
  atrasado: { label: 'Atrasado', cor: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' },
};

const TIPO_RECEITA_LABEL = {
  total: { label: 'Receita total (seu)', cor: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
  administracao: { label: 'Administração', cor: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
};

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatMoeda(v) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function diffDiasISO(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db_ = new Date(`${b}T00:00:00`);
  return Math.round((db_ - da) / 86400000);
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function qs(sel, root = document) { return root.querySelector(sel); }

function toast(msg) {
  const t = qs('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.add('hidden'), 2600);
}

// Data (ISO) da ocorrência mais recente (hoje ou passada) de um dia da semana — usada pra achar
// a semana de referência atual de uma locação a partir do seu dia de pagamento.
function dataOcorrenciaRecente(diaPagamento) {
  const hoje = new Date();
  const diaAlvo = DIAS_SEMANA[diaPagamento] ?? 1;
  let diff = hoje.getDay() - diaAlvo;
  if (diff < 0) diff += 7;
  const data = new Date(hoje);
  data.setDate(hoje.getDate() - diff);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function veiculoPorId(id) { return state.veiculos.find((v) => v.id === id) || null; }

function locacaoAtiva(veiculoId) {
  return state.locacoes.find((l) => l.veiculoId === veiculoId && l.status === 'ativa') || null;
}

function locacoesDoVeiculo(veiculoId) {
  return state.locacoes.filter((l) => l.veiculoId === veiculoId).sort((a, b) => (b.dataRetirada || '').localeCompare(a.dataRetirada || ''));
}

function financiamentosDoVeiculo(veiculoId) {
  return state.financiamentos.filter((f) => f.veiculoId === veiculoId);
}

function manutencoesDoVeiculo(veiculoId) {
  return state.manutencoes.filter((m) => m.veiculoId === veiculoId).sort((a, b) => (b.dataRealizada || '').localeCompare(a.dataRealizada || ''));
}

function ultimaRevisao(veiculoId) {
  return manutencoesDoVeiculo(veiculoId).find((m) => m.tipo === 'revisao') || null;
}

// ---------------------------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------------------------

function renderNav() {
  const itemHtml = (item, mobile) => `
    <button data-nav="${item.id}" class="nav-btn ${mobile ? 'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition' : 'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition'}">
      <i data-lucide="${item.icon}" class="${mobile ? 'h-5 w-5' : 'h-[18px] w-[18px] shrink-0'}"></i>
      ${item.label}
    </button>`;

  qs('#nav-desktop').innerHTML = NAV.map((i) => itemHtml(i, false)).join('');
  qs('#nav-mobile').innerHTML = NAV.map((i) => itemHtml(i, true)).join('');

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => { location.hash = btn.dataset.nav; });
  });

  aplicarEstiloNav();
  atualizarIcones();
}

function atualizarIcones() {
  if (window.lucide) lucide.createIcons();
}

function aplicarEstiloNav() {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    const ativo = btn.dataset.nav === state.pagina;
    const mobile = btn.closest('#nav-mobile') !== null;
    if (mobile) {
      btn.classList.toggle('text-indigo-600', ativo);
      btn.classList.toggle('dark:text-indigo-400', ativo);
      btn.classList.toggle('text-slate-500', !ativo);
      btn.classList.toggle('dark:text-slate-500', !ativo);
    } else {
      btn.classList.toggle('bg-indigo-600', ativo);
      btn.classList.toggle('text-white', ativo);
      btn.classList.toggle('shadow-sm', ativo);
      btn.classList.toggle('text-slate-600', !ativo);
      btn.classList.toggle('dark:text-slate-400', !ativo);
      btn.classList.toggle('hover:bg-slate-100', !ativo);
      btn.classList.toggle('dark:hover:bg-slate-800/60', !ativo);
    }
  });
}

const TITULOS = {
  painel: ['Painel', 'Pagamentos da semana, próximas revisões e renda prevista'],
  veiculos: ['Veículos', 'Frota cadastrada — dados, financiamento e proprietário'],
  locacoes: ['Locações', 'Histórico de locatários por veículo'],
  pagamentos: ['Pagamentos', 'Controle semanal — toda segunda-feira'],
  manutencoes: ['Manutenções', 'Revisões (tabela BYD) e previsão do próximo marco'],
};

function irParaPagina(pagina) {
  state.pagina = NAV.some((n) => n.id === pagina) ? pagina : 'painel';
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  qs(`#page-${state.pagina}`).classList.remove('hidden');
  const [titulo, sub] = TITULOS[state.pagina];
  qs('#titulo-pagina').textContent = titulo;
  qs('#subtitulo-pagina').textContent = sub;
  aplicarEstiloNav();
  renderPaginaAtual();
}

function renderPaginaAtual() {
  if (state.pagina === 'painel') renderPainel();
  if (state.pagina === 'veiculos') renderVeiculos();
  if (state.pagina === 'locacoes') renderLocacoes();
  if (state.pagina === 'pagamentos') renderPagamentos();
  if (state.pagina === 'manutencoes') renderManutencoes();
}

// ---------------------------------------------------------------------------------------------
// Contadores do topo
// ---------------------------------------------------------------------------------------------

function renderContadores() {
  const veiculosAtivos = state.veiculos.filter((v) => v.status === 'ativo').length;
  const hoje = hojeISO();
  let atrasados = 0;
  state.veiculos.filter((v) => v.status === 'ativo').forEach((v) => {
    const loc = locacaoAtiva(v.id);
    if (!loc) return;
    const dataRef = dataOcorrenciaRecente(loc.diaPagamento);
    const pago = state.pagamentos.some((p) => p.locacaoId === loc.id && p.dataReferencia === dataRef && p.status === 'pago');
    if (!pago && dataRef < hoje) atrasados++;
  });
  qs('#contador-contratados').textContent = veiculosAtivos;
  qs('#contador-na-rua').textContent = atrasados;
}

// ---------------------------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------------------------

function statusSemanaLocacao(loc) {
  const hoje = hojeISO();
  const dataRef = dataOcorrenciaRecente(loc.diaPagamento);
  const pagto = state.pagamentos.find((p) => p.locacaoId === loc.id && p.dataReferencia === dataRef);
  if (pagto && pagto.status === 'pago') return { label: 'Pago', cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400', dataRef };
  if (dataRef === hoje) return { label: 'Vence hoje', cor: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400', dataRef };
  const dias = diffDiasISO(dataRef, hoje);
  return { label: `Atrasado ${dias}d`, cor: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400', dataRef };
}

function renderPainel() {
  const container = qs('#page-painel');
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  const veiculosAtivos = state.veiculos.filter((v) => v.status === 'ativo');

  let receitaMesTotal = 0;
  let atrasados = 0;
  let revisoesProximas = 0;

  const cardsHtml = veiculosAtivos.map((v) => {
    const loc = locacaoAtiva(v.id);
    const fins = financiamentosDoVeiculo(v.id);
    const rev = ultimaRevisao(v.id);
    const prox = rev ? calcularProximaRevisao(rev.kmRealizado, rev.dataRealizada) : null;

    let receitaMes = 0;
    if (v.tipoReceita === 'administracao') {
      receitaMes = loc ? (v.taxaAdministracaoMensal || 0) : 0;
    } else {
      const pagosNoMes = state.pagamentos.filter((p) => p.veiculoId === v.id && p.status === 'pago' && (p.dataReferencia || '').startsWith(mesAtual)).reduce((s, p) => s + Number(p.valor || 0), 0);
      const parcelasTotal = fins.reduce((s, f) => s + Number(f.parcela || 0), 0);
      receitaMes = pagosNoMes - parcelasTotal - Number(v.protecaoVeicularMensal || 0);
    }
    receitaMesTotal += receitaMes;

    let statusChip = '<span class="badge bg-slate-100 text-slate-400 dark:bg-slate-800">Sem locatário</span>';
    if (loc) {
      const st = statusSemanaLocacao(loc);
      if (st.label.startsWith('Atrasado')) atrasados++;
      statusChip = `<span class="badge ${st.cor}">${st.label}</span>`;
    }

    let proxRevisaoHtml = '<p class="text-xs text-slate-400">Sem revisão registrada</p>';
    if (prox) {
      const diasData = diffDiasISO(hoje, prox.dataPrevista);
      if (diasData <= 30) revisoesProximas++;
      proxRevisaoHtml = `
        <p class="text-xs text-slate-500 dark:text-slate-400">
          ${prox.kmPrevisto ? `${prox.kmPrevisto.toLocaleString('pt-BR')} km` : '—'} ou ${formatDateBR(prox.dataPrevista)} <span class="text-slate-400">(o que vier primeiro)</span>
        </p>
        <p class="text-[11px] text-slate-400">${diasData >= 0 ? `faltam ${diasData} dia(s) pela data` : 'data já passou — confira o km'}${prox.valorPrevisto ? ` · ~${formatMoeda(prox.valorPrevisto)}` : ''}</p>`;
    }

    return `
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-3 flex items-start justify-between gap-2">
          <div>
            <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(v.placa)}</p>
            <p class="text-xs text-slate-400">${esc(v.modelo)} · ${esc(v.cor || '')}</p>
          </div>
          <span class="badge ${TIPO_RECEITA_LABEL[v.tipoReceita]?.cor || ''}">${TIPO_RECEITA_LABEL[v.tipoReceita]?.label || v.tipoReceita}</span>
        </div>
        <div class="mb-3 flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
          <div>
            <p class="text-xs text-slate-400">Locatário</p>
            <p class="text-sm font-medium text-slate-800 dark:text-slate-100">${loc ? esc(loc.locatarioNome) : '—'}</p>
          </div>
          ${statusChip}
        </div>
        ${loc && !(state.pagamentos.find((p) => p.locacaoId === loc.id && p.dataReferencia === statusSemanaLocacao(loc).dataRef && p.status === 'pago')) ? `
        <button data-marcar-pago="${loc.id}" data-veiculo="${v.id}" class="mb-3 w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">Marcar pago (${formatMoeda(loc.valorSemanal)})</button>` : ''}
        <div class="mb-3">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Próxima revisão</p>
          ${proxRevisaoHtml}
        </div>
        <div class="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
          <p class="text-xs text-slate-400">Renda do mês (${mesAtual.split('-').reverse().join('/')})</p>
          <p class="text-sm font-semibold ${receitaMes >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${formatMoeda(receitaMes)}</p>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Renda prevista do mês</p>
        <p class="mt-2 text-3xl font-semibold text-indigo-600 dark:text-indigo-400">${formatMoeda(receitaMesTotal)}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Pagamentos atrasados</p>
        <p class="mt-2 text-3xl font-semibold ${atrasados ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">${atrasados}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Revisões em até 30 dias</p>
        <p class="mt-2 text-3xl font-semibold ${revisoesProximas ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}">${revisoesProximas}</p>
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      ${cardsHtml || '<p class="text-sm text-slate-400">Nenhum veículo ativo cadastrado.</p>'}
    </div>
  `;

  container.querySelectorAll('[data-marcar-pago]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const loc = state.locacoes.find((l) => l.id === btn.dataset.marcarPago);
      const v = veiculoPorId(btn.dataset.veiculo);
      const dataRef = dataOcorrenciaRecente(loc.diaPagamento);
      const existente = state.pagamentos.find((p) => p.locacaoId === loc.id && p.dataReferencia === dataRef);
      try {
        await salvarPagamento({
          veiculoId: v.id,
          locacaoId: loc.id,
          dataReferencia: dataRef,
          valor: loc.valorSemanal,
          status: 'pago',
          dataPagamentoReal: hojeISO(),
          observacoes: existente?.observacoes || '',
        }, existente?.id);
        toast('Pagamento marcado como pago.');
      } catch (e) { toast(e.message); }
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Veículos
// ---------------------------------------------------------------------------------------------

function renderVeiculos() {
  const container = qs('#page-veiculos');
  const lista = [...state.veiculos].sort((a, b) => a.placa.localeCompare(b.placa));
  const jaCarregado = state.veiculos.length > 0;

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-end gap-2">
      ${!jaCarregado ? `<button id="btn-seed" class="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-400">Carregar frota padrão</button>` : ''}
      <button id="btn-novo-veiculo" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Novo veículo</button>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full min-w-[760px] text-left text-sm">
        <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <tr>
            <th class="px-4 py-3">Placa</th><th class="px-4 py-3">Modelo / Cor</th><th class="px-4 py-3">Proprietário</th>
            <th class="px-4 py-3">Receita</th><th class="px-4 py-3">Status</th><th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          ${lista.length ? lista.map((v) => `
            <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">${esc(v.placa)}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${esc(v.modelo)} · ${esc(v.cor || '—')}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${esc(v.proprietarioNome)}</td>
              <td class="px-4 py-3"><span class="badge ${TIPO_RECEITA_LABEL[v.tipoReceita]?.cor || ''}">${TIPO_RECEITA_LABEL[v.tipoReceita]?.label || v.tipoReceita}</span></td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${v.status === 'ativo' ? 'Ativo' : 'Inativo'}</td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                ${v.tipoReceita === 'total' ? `<button data-financiamento="${v.id}" class="mr-3 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Financiamento</button>` : ''}
                <button data-editar-veiculo="${v.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">Nenhum veículo cadastrado.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  qs('#btn-novo-veiculo').addEventListener('click', () => abrirModalVeiculo());
  qs('#btn-seed')?.addEventListener('click', async () => {
    try {
      const r = await carregarFrotaPadrao();
      toast(`Frota carregada: ${r.veiculos} veículo(s), ${r.financiamentos} financiamento(s), ${r.locacoes} locação(ões), ${r.manutencoes} manutenção(ões).`);
      renderVeiculos();
    } catch (e) { toast(e.message); }
  });
  container.querySelectorAll('[data-editar-veiculo]').forEach((btn) => btn.addEventListener('click', () => abrirModalVeiculo(veiculoPorId(btn.dataset.editarVeiculo))));
  container.querySelectorAll('[data-financiamento]').forEach((btn) => btn.addEventListener('click', () => abrirModalFinanciamentos(veiculoPorId(btn.dataset.financiamento))));
}

function abrirModalVeiculo(veiculo = null) {
  const html = `
    <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">${veiculo ? 'Editar veículo' : 'Novo veículo'}</h2>
    <form id="form-veiculo" class="space-y-3">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Placa *
          <input required type="text" name="placa" value="${esc(veiculo?.placa || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm uppercase dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Cor
          <input type="text" name="cor" value="${esc(veiculo?.cor || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Modelo
        <input type="text" name="modelo" value="${esc(veiculo?.modelo || MODELO_PADRAO)}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Renavam
          <input type="text" name="renavam" value="${esc(veiculo?.renavam || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Chassi
          <input type="text" name="chassi" value="${esc(veiculo?.chassi || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Proprietário (locador) *
        <input required type="text" name="proprietarioNome" value="${esc(veiculo?.proprietarioNome || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Tipo de receita *
        <select required name="tipoReceita" id="select-tipo-receita" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="total" ${(veiculo?.tipoReceita || 'total') === 'total' ? 'selected' : ''}>Seu — recebe o aluguel inteiro</option>
          <option value="administracao" ${veiculo?.tipoReceita === 'administracao' ? 'selected' : ''}>De terceiro — você recebe só a administração</option>
        </select>
      </label>
      <div id="campo-taxa-admin" class="${(veiculo?.tipoReceita || 'total') === 'administracao' ? '' : 'hidden'}">
        <label class="block text-xs text-slate-500 dark:text-slate-400">Taxa de administração mensal
          <input type="number" step="0.01" name="taxaAdministracaoMensal" value="${veiculo?.taxaAdministracaoMensal ?? 1500}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Valor de compra
          <input type="number" step="0.01" name="valorCompra" value="${veiculo?.valorCompra ?? ''}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Proteção veicular (mês)
          <input type="number" step="0.01" name="protecaoVeicularMensal" value="${veiculo?.protecaoVeicularMensal ?? 300}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Início da operação
          <input type="date" name="dataInicioOperacao" value="${esc(veiculo?.dataInicioOperacao || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Km inicial
          <input type="number" name="kmInicial" value="${veiculo?.kmInicial ?? ''}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Status
        <select name="status" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="ativo" ${(veiculo?.status || 'ativo') === 'ativo' ? 'selected' : ''}>Ativo</option>
          <option value="inativo" ${veiculo?.status === 'inativo' ? 'selected' : ''}>Inativo (vendido/parado)</option>
        </select>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="btn-cancelar" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
        <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Salvar</button>
      </div>
    </form>
  `;
  abrirModal(html);
  qs('#btn-cancelar').addEventListener('click', fecharModal);
  qs('#select-tipo-receita').addEventListener('change', (e) => qs('#campo-taxa-admin').classList.toggle('hidden', e.target.value !== 'administracao'));
  qs('#form-veiculo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dados = {
      placa: fd.get('placa').trim().toUpperCase(),
      cor: fd.get('cor') || '',
      modelo: fd.get('modelo') || MODELO_PADRAO,
      renavam: fd.get('renavam') || '',
      chassi: fd.get('chassi') || '',
      proprietarioNome: fd.get('proprietarioNome').trim(),
      tipoReceita: fd.get('tipoReceita'),
      taxaAdministracaoMensal: fd.get('tipoReceita') === 'administracao' ? Number(fd.get('taxaAdministracaoMensal') || 0) : null,
      valorCompra: fd.get('valorCompra') ? Number(fd.get('valorCompra')) : null,
      protecaoVeicularMensal: Number(fd.get('protecaoVeicularMensal') || 0),
      dataInicioOperacao: fd.get('dataInicioOperacao') || '',
      kmInicial: fd.get('kmInicial') ? Number(fd.get('kmInicial')) : null,
      status: fd.get('status'),
    };
    try {
      await salvarVeiculo(dados, veiculo?.id);
      toast('Veículo salvo.');
      fecharModal();
    } catch (err) { toast(err.message); }
  });
}

function abrirModalFinanciamentos(veiculo) {
  const lista = financiamentosDoVeiculo(veiculo.id);
  const html = `
    <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Financiamento — ${esc(veiculo.placa)}</h2>
    <p class="mb-4 text-xs text-slate-400">Parcelas mensais deste veículo (consignado, empréstimo, etc.)</p>
    <div id="lista-financiamentos" class="mb-4 space-y-2"></div>
    <form id="form-financiamento" class="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <p class="text-xs font-medium text-slate-500 dark:text-slate-400">+ Adicionar parcela</p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Instituição
          <input type="text" name="instituicao" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Nº do contrato
          <input type="text" name="numeroContrato" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label class="text-xs text-slate-500 dark:text-slate-400">Parcela (R$)
          <input required type="number" step="0.01" name="parcela" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Juros ao mês (%)
          <input type="number" step="0.01" name="jurosAoMes" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Dia do vencimento
          <input type="number" min="1" max="31" name="diaVencimento" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="btn-fechar-financiamento" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Fechar</button>
        <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Adicionar</button>
      </div>
    </form>
  `;
  abrirModal(html);

  function renderLista() {
    const atualizados = financiamentosDoVeiculo(veiculo.id);
    const total = atualizados.reduce((s, f) => s + Number(f.parcela || 0), 0);
    qs('#lista-financiamentos').innerHTML = atualizados.length ? `
      ${atualizados.map((f) => `
        <div class="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
          <div>
            <p class="font-medium text-slate-800 dark:text-slate-100">${esc(f.instituicao || 'Financiamento')} ${f.numeroContrato ? `· ${esc(f.numeroContrato)}` : ''}</p>
            <p class="text-xs text-slate-400">${formatMoeda(f.parcela)}/mês${f.diaVencimento ? ` · vence dia ${f.diaVencimento}` : ''}${f.jurosAoMes ? ` · ${f.jurosAoMes}% a.m.` : ''}</p>
          </div>
          <button data-remover-financiamento="${f.id}" class="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">Remover</button>
        </div>`).join('')}
      <p class="pt-1 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Total: ${formatMoeda(total)}/mês</p>
    ` : '<p class="text-sm text-slate-400">Nenhuma parcela cadastrada.</p>';
    qs('#lista-financiamentos').querySelectorAll('[data-remover-financiamento]').forEach((btn) => btn.addEventListener('click', async () => {
      await excluirFinanciamento(btn.dataset.removerFinanciamento);
      toast('Removido.');
      renderLista();
    }));
  }
  renderLista();

  qs('#btn-fechar-financiamento').addEventListener('click', fecharModal);
  qs('#form-financiamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await salvarFinanciamento({
        veiculoId: veiculo.id,
        instituicao: fd.get('instituicao') || '',
        numeroContrato: fd.get('numeroContrato') || '',
        parcela: Number(fd.get('parcela')),
        jurosAoMes: fd.get('jurosAoMes') ? Number(fd.get('jurosAoMes')) : null,
        diaVencimento: fd.get('diaVencimento') ? Number(fd.get('diaVencimento')) : null,
      });
      e.target.reset();
      toast('Parcela adicionada.');
      renderLista();
    } catch (err) { toast(err.message); }
  });
}

// ---------------------------------------------------------------------------------------------
// Locações
// ---------------------------------------------------------------------------------------------

function renderLocacoes() {
  const container = qs('#page-locacoes');
  const lista = [...state.locacoes].sort((a, b) => (b.dataRetirada || '').localeCompare(a.dataRetirada || ''));

  container.innerHTML = `
    <div class="flex justify-end">
      <button id="btn-nova-locacao" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Nova locação</button>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full min-w-[840px] text-left text-sm">
        <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <tr>
            <th class="px-4 py-3">Veículo</th><th class="px-4 py-3">Locatário</th><th class="px-4 py-3">Retirada</th>
            <th class="px-4 py-3">Fim previsto</th><th class="px-4 py-3">Valor/dia pag.</th><th class="px-4 py-3">Caução</th>
            <th class="px-4 py-3">Status</th><th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          ${lista.length ? lista.map((l) => {
            const v = veiculoPorId(l.veiculoId);
            return `
            <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">${esc(v?.placa || '—')}</td>
              <td class="px-4 py-3">${esc(l.locatarioNome)}</td>
              <td class="px-4 py-3 whitespace-nowrap">${formatDateBR(l.dataRetirada)}</td>
              <td class="px-4 py-3 whitespace-nowrap">${formatDateBR(l.dataFim)}</td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">${formatMoeda(l.valorSemanal)} · ${DIAS_SEMANA_LABEL[l.diaPagamento] || l.diaPagamento}</td>
              <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">${l.caucaoValor ? formatMoeda(l.caucaoValor) : '—'} ${l.caucaoStatus ? `(${l.caucaoStatus})` : ''}</td>
              <td class="px-4 py-3"><span class="badge ${STATUS_LOCACAO[l.status]?.cor || ''}">${STATUS_LOCACAO[l.status]?.label || l.status}</span></td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button data-editar-locacao="${l.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>
                ${l.status === 'ativa' ? `<button data-encerrar-locacao="${l.id}" class="ml-3 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">Encerrar</button>` : ''}
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">Nenhuma locação cadastrada.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  qs('#btn-nova-locacao').addEventListener('click', () => abrirModalLocacao());
  container.querySelectorAll('[data-editar-locacao]').forEach((btn) => btn.addEventListener('click', () => abrirModalLocacao(state.locacoes.find((l) => l.id === btn.dataset.editarLocacao))));
  container.querySelectorAll('[data-encerrar-locacao]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Encerrar esta locação (veículo devolvido)?')) return;
    await encerrarLocacao(btn.dataset.encerrarLocacao, hojeISO());
    toast('Locação encerrada.');
  }));
}

function abrirModalLocacao(locacao = null) {
  const html = `
    <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">${locacao ? 'Editar locação' : 'Nova locação'}</h2>
    <form id="form-locacao" class="space-y-3">
      <label class="block text-xs text-slate-500 dark:text-slate-400">Veículo *
        <select required name="veiculoId" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="">Selecione...</option>
          ${state.veiculos.map((v) => `<option value="${v.id}" ${locacao?.veiculoId === v.id ? 'selected' : ''}>${esc(v.placa)} — ${esc(v.modelo)}</option>`).join('')}
        </select>
      </label>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Nome do locatário *
          <input required type="text" name="locatarioNome" value="${esc(locacao?.locatarioNome || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">CPF
          <input type="text" name="locatarioCpf" value="${esc(locacao?.locatarioCpf || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Contato
        <input type="text" name="locatarioContato" value="${esc(locacao?.locatarioContato || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Data de retirada *
          <input required type="date" name="dataRetirada" value="${esc(locacao?.dataRetirada || hojeISO())}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Fim previsto (prazo mínimo)
          <input type="date" name="dataFim" value="${esc(locacao?.dataFim || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Valor semanal
          <input type="number" step="0.01" name="valorSemanal" value="${locacao?.valorSemanal ?? VALOR_SEMANAL_PADRAO}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Dia de pagamento
          <select name="diaPagamento" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
            ${Object.entries(DIAS_SEMANA_LABEL).map(([v, l]) => `<option value="${v}" ${(locacao?.diaPagamento || 'segunda') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Caução
          <input type="number" step="0.01" name="caucaoValor" value="${locacao?.caucaoValor ?? CAUCAO_PADRAO}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Status da caução
          <select name="caucaoStatus" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
            <option value="recebida" ${(locacao?.caucaoStatus || 'recebida') === 'recebida' ? 'selected' : ''}>Recebida</option>
            <option value="parcial" ${locacao?.caucaoStatus === 'parcial' ? 'selected' : ''}>Parcial</option>
            <option value="devolvida" ${locacao?.caucaoStatus === 'devolvida' ? 'selected' : ''}>Devolvida</option>
          </select>
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Status
        <select name="status" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="ativa" ${(locacao?.status || 'ativa') === 'ativa' ? 'selected' : ''}>Ativa</option>
          <option value="encerrada" ${locacao?.status === 'encerrada' ? 'selected' : ''}>Encerrada</option>
        </select>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="btn-cancelar" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
        <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Salvar</button>
      </div>
    </form>
  `;
  abrirModal(html);
  qs('#btn-cancelar').addEventListener('click', fecharModal);
  qs('#form-locacao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dados = {
      veiculoId: fd.get('veiculoId'),
      locatarioNome: fd.get('locatarioNome').trim(),
      locatarioCpf: fd.get('locatarioCpf') || '',
      locatarioContato: fd.get('locatarioContato') || '',
      dataRetirada: fd.get('dataRetirada'),
      dataFim: fd.get('dataFim') || '',
      valorSemanal: Number(fd.get('valorSemanal') || VALOR_SEMANAL_PADRAO),
      diaPagamento: fd.get('diaPagamento'),
      caucaoValor: fd.get('caucaoValor') ? Number(fd.get('caucaoValor')) : null,
      caucaoStatus: fd.get('caucaoStatus'),
      status: fd.get('status'),
    };
    try {
      await salvarLocacao(dados, locacao?.id);
      toast('Locação salva.');
      fecharModal();
    } catch (err) { toast(err.message); }
  });
}

// ---------------------------------------------------------------------------------------------
// Pagamentos
// ---------------------------------------------------------------------------------------------

function renderPagamentos() {
  const container = qs('#page-pagamentos');
  const f = state.pagamentosFiltro;

  let itens = [...state.pagamentos];
  if (f.veiculoId) itens = itens.filter((p) => p.veiculoId === f.veiculoId);
  if (f.status) itens = itens.filter((p) => p.status === f.status);
  itens.sort((a, b) => (b.dataReferencia || '').localeCompare(a.dataReferencia || ''));

  container.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-xs text-slate-500 dark:text-slate-400">Veículo
          <select id="f-veiculo" class="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <option value="">Todos</option>
            ${state.veiculos.map((v) => `<option value="${v.id}" ${f.veiculoId === v.id ? 'selected' : ''}>${esc(v.placa)}</option>`).join('')}
          </select>
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Status
          <select id="f-status" class="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <option value="">Todos</option>
            ${Object.entries(STATUS_PAGAMENTO).map(([v, s]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </label>
      </div>
      <button id="btn-novo-pagamento" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Novo pagamento</button>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full min-w-[760px] text-left text-sm">
        <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <tr>
            <th class="px-4 py-3">Referência</th><th class="px-4 py-3">Veículo / Locatário</th>
            <th class="px-4 py-3">Valor</th><th class="px-4 py-3">Status</th><th class="px-4 py-3">Pago em</th><th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          ${itens.length ? itens.map((p) => {
            const v = veiculoPorId(p.veiculoId);
            const loc = state.locacoes.find((l) => l.id === p.locacaoId);
            return `
            <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              <td class="px-4 py-3 whitespace-nowrap">${formatDateBR(p.dataReferencia)}</td>
              <td class="px-4 py-3">${esc(v?.placa || '—')} · ${esc(loc?.locatarioNome || '—')}</td>
              <td class="px-4 py-3">${formatMoeda(p.valor)}</td>
              <td class="px-4 py-3">
                <select data-status-pagamento="${p.id}" class="rounded-lg border px-2 py-1 text-xs font-semibold ${STATUS_PAGAMENTO[p.status]?.cor || ''}">
                  ${Object.entries(STATUS_PAGAMENTO).map(([v2, s]) => `<option value="${v2}" ${p.status === v2 ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">${formatDateBR(p.dataPagamentoReal)}</td>
              <td class="px-4 py-3 text-right"><button data-editar-pagamento="${p.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button></td>
            </tr>`;
          }).join('') : `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">Nenhum pagamento encontrado.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  qs('#f-veiculo').addEventListener('change', (e) => { state.pagamentosFiltro.veiculoId = e.target.value; renderPagamentos(); });
  qs('#f-status').addEventListener('change', (e) => { state.pagamentosFiltro.status = e.target.value; renderPagamentos(); });
  qs('#btn-novo-pagamento').addEventListener('click', () => abrirModalPagamento());
  container.querySelectorAll('[data-editar-pagamento]').forEach((btn) => btn.addEventListener('click', () => abrirModalPagamento(state.pagamentos.find((p) => p.id === btn.dataset.editarPagamento))));
  container.querySelectorAll('[data-status-pagamento]').forEach((sel) => sel.addEventListener('change', async (e) => {
    await definirStatusPagamento(sel.dataset.statusPagamento, e.target.value);
    toast('Status atualizado.');
  }));
}

function abrirModalPagamento(pagamento = null) {
  const locacoesAtivasPrimeiro = [...state.locacoes].sort((a, b) => (a.status === 'ativa' ? -1 : 1) - (b.status === 'ativa' ? -1 : 1));
  const html = `
    <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">${pagamento ? 'Editar pagamento' : 'Novo pagamento'}</h2>
    <form id="form-pagamento" class="space-y-3">
      <label class="block text-xs text-slate-500 dark:text-slate-400">Locação (veículo — locatário) *
        <select required name="locacaoId" id="select-locacao-pagamento" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="">Selecione...</option>
          ${locacoesAtivasPrimeiro.map((l) => `<option value="${l.id}" data-veiculo="${l.veiculoId}" data-valor="${l.valorSemanal}" ${pagamento?.locacaoId === l.id ? 'selected' : ''}>${esc(veiculoPorId(l.veiculoId)?.placa || '?')} — ${esc(l.locatarioNome)}${l.status === 'encerrada' ? ' (encerrada)' : ''}</option>`).join('')}
        </select>
      </label>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Data de referência (semana) *
          <input required type="date" name="dataReferencia" value="${esc(pagamento?.dataReferencia || hojeISO())}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Valor
          <input required type="number" step="0.01" name="valor" id="input-valor-pagamento" value="${pagamento?.valor ?? ''}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Status
          <select name="status" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
            ${Object.entries(STATUS_PAGAMENTO).map(([v, s]) => `<option value="${v}" ${(pagamento?.status || 'pago') === v ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Pago em
          <input type="date" name="dataPagamentoReal" value="${esc(pagamento?.dataPagamentoReal || hojeISO())}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Observações <span class="text-slate-300">(ex: diária de transição pra segunda-feira)</span>
        <textarea name="observacoes" rows="2" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">${esc(pagamento?.observacoes || '')}</textarea>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="btn-cancelar" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
        <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Salvar</button>
      </div>
    </form>
  `;
  abrirModal(html);
  qs('#btn-cancelar').addEventListener('click', fecharModal);
  qs('#select-locacao-pagamento').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt?.dataset.valor && !qs('#input-valor-pagamento').value) qs('#input-valor-pagamento').value = opt.dataset.valor;
  });
  qs('#form-pagamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const locacaoId = fd.get('locacaoId');
    const loc = state.locacoes.find((l) => l.id === locacaoId);
    const dados = {
      locacaoId,
      veiculoId: loc?.veiculoId || '',
      dataReferencia: fd.get('dataReferencia'),
      valor: Number(fd.get('valor')),
      status: fd.get('status'),
      dataPagamentoReal: fd.get('dataPagamentoReal') || '',
      observacoes: fd.get('observacoes') || '',
    };
    try {
      await salvarPagamento(dados, pagamento?.id);
      toast('Pagamento salvo.');
      fecharModal();
    } catch (err) { toast(err.message); }
  });
}

// ---------------------------------------------------------------------------------------------
// Manutenções
// ---------------------------------------------------------------------------------------------

function renderManutencoes() {
  const container = qs('#page-manutencoes');
  const hoje = hojeISO();

  const resumoHtml = state.veiculos.map((v) => {
    const rev = ultimaRevisao(v.id);
    if (!rev) return `
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(v.placa)}</p>
        <p class="mt-2 text-xs text-slate-400">Nenhuma revisão registrada ainda.</p>
      </div>`;
    const prox = calcularProximaRevisao(rev.kmRealizado, rev.dataRealizada);
    const diasData = diffDiasISO(hoje, prox.dataPrevista);
    const alerta = diasData <= 30;
    return `
      <div class="rounded-2xl border ${alerta ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'} p-5 shadow-sm">
        <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(v.placa)} <span class="font-normal text-slate-400">· ${esc(v.modelo)}</span></p>
        <p class="mt-2 text-xs text-slate-400">Última revisão</p>
        <p class="text-sm text-slate-700 dark:text-slate-200">${rev.kmRealizado.toLocaleString('pt-BR')} km · ${formatDateBR(rev.dataRealizada)}</p>
        <p class="mt-2 text-xs text-slate-400">Próxima (o que vier primeiro)</p>
        <p class="text-sm font-medium ${alerta ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}">${prox.kmPrevisto ? `${prox.kmPrevisto.toLocaleString('pt-BR')} km` : '—'} ou ${formatDateBR(prox.dataPrevista)}</p>
        <p class="text-[11px] text-slate-400">${diasData >= 0 ? `faltam ${diasData} dia(s)` : 'prazo já passou — confira o km'}${prox.valorPrevisto ? ` · ~${formatMoeda(prox.valorPrevisto)}` : ''}</p>
      </div>`;
  }).join('');

  const historico = [...state.manutencoes].sort((a, b) => (b.dataRealizada || '').localeCompare(a.dataRealizada || ''));

  container.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${resumoHtml || '<p class="text-sm text-slate-400">Nenhum veículo cadastrado.</p>'}</div>

    <div class="flex justify-end">
      <button id="btn-nova-manutencao" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Registrar manutenção</button>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full min-w-[640px] text-left text-sm">
        <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <tr><th class="px-4 py-3">Data</th><th class="px-4 py-3">Veículo</th><th class="px-4 py-3">Tipo</th><th class="px-4 py-3">Km</th><th class="px-4 py-3">Valor</th></tr>
        </thead>
        <tbody>
          ${historico.length ? historico.map((m) => `
            <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              <td class="px-4 py-3 whitespace-nowrap">${formatDateBR(m.dataRealizada)}</td>
              <td class="px-4 py-3">${esc(veiculoPorId(m.veiculoId)?.placa || '—')}</td>
              <td class="px-4 py-3 capitalize">${esc(m.tipo)}</td>
              <td class="px-4 py-3">${m.kmRealizado ? m.kmRealizado.toLocaleString('pt-BR') : '—'}</td>
              <td class="px-4 py-3">${m.valor ? formatMoeda(m.valor) : '—'}</td>
            </tr>`).join('') : `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Nenhuma manutenção registrada.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  qs('#btn-nova-manutencao').addEventListener('click', () => abrirModalManutencao());
}

function abrirModalManutencao() {
  const html = `
    <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Registrar manutenção</h2>
    <form id="form-manutencao" class="space-y-3">
      <label class="block text-xs text-slate-500 dark:text-slate-400">Veículo *
        <select required name="veiculoId" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="">Selecione...</option>
          ${state.veiculos.map((v) => `<option value="${v.id}">${esc(v.placa)}</option>`).join('')}
        </select>
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Tipo *
        <select required name="tipo" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="revisao">Revisão</option>
          <option value="pneu">Troca de pneu</option>
          <option value="outro">Outro reparo</option>
        </select>
      </label>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Data *
          <input required type="date" name="dataRealizada" value="${hojeISO()}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Km
          <input type="number" name="kmRealizado" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Valor <span class="text-slate-300">(tabela BYD: 60k R$393 · 80k R$1.292 · 100k R$758 · 120k R$1.292 · 140k R$393)</span>
        <input type="number" step="0.01" name="valor" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Observações
        <textarea name="observacoes" rows="2" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"></textarea>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="btn-cancelar" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
        <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Salvar</button>
      </div>
    </form>
  `;
  abrirModal(html);
  qs('#btn-cancelar').addEventListener('click', fecharModal);
  qs('#form-manutencao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dados = {
      veiculoId: fd.get('veiculoId'),
      tipo: fd.get('tipo'),
      dataRealizada: fd.get('dataRealizada'),
      kmRealizado: fd.get('kmRealizado') ? Number(fd.get('kmRealizado')) : null,
      valor: fd.get('valor') ? Number(fd.get('valor')) : null,
      observacoes: fd.get('observacoes') || '',
      status: 'concluida',
    };
    try {
      await salvarManutencao(dados);
      toast('Manutenção registrada.');
      fecharModal();
    } catch (err) { toast(err.message); }
  });
}

// ---------------------------------------------------------------------------------------------
// Modal genérico + tema
// ---------------------------------------------------------------------------------------------

function abrirModal(html) {
  qs('#modal-box').innerHTML = html;
  qs('#modal-backdrop').classList.remove('hidden');
  qs('#modal-backdrop').classList.add('flex');
}

function fecharModal() {
  qs('#modal-backdrop').classList.add('hidden');
  qs('#modal-backdrop').classList.remove('flex');
  qs('#modal-box').innerHTML = '';
}

qs('#modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') fecharModal(); });

function initTema() {
  const salvo = localStorage.getItem('rm-veiculos-tema');
  const escuro = salvo ? salvo === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', escuro);
  atualizarLabelTema();
  qs('#btn-theme').addEventListener('click', () => {
    const agora = document.documentElement.classList.toggle('dark');
    localStorage.setItem('rm-veiculos-tema', agora ? 'dark' : 'light');
    atualizarLabelTema();
  });
}

function atualizarLabelTema() {
  const escuro = document.documentElement.classList.contains('dark');
  qs('#theme-label').textContent = escuro ? 'Escuro' : 'Claro';
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------

function reRenderTudo() {
  renderContadores();
  renderPaginaAtual();
}

function init() {
  renderNav();
  initTema();

  if (!firebaseConfigurado) {
    qs('#aviso-config').classList.remove('hidden');
    irParaPagina((location.hash || '#painel').slice(1));
    return;
  }

  ouvirVeiculos((dados) => { state.veiculos = dados; reRenderTudo(); });
  ouvirFinanciamentos((dados) => { state.financiamentos = dados; reRenderTudo(); });
  ouvirLocacoes((dados) => { state.locacoes = dados; reRenderTudo(); });
  ouvirPagamentos((dados) => { state.pagamentos = dados; reRenderTudo(); });
  ouvirManutencoes((dados) => { state.manutencoes = dados; reRenderTudo(); });

  window.addEventListener('hashchange', () => irParaPagina(location.hash.slice(1)));
  irParaPagina((location.hash || '#painel').slice(1));
}

init();
