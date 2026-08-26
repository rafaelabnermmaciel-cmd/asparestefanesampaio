import {
  supabaseConfigurado,
  ouvirPessoas,
  ouvirLocalidades,
  ouvirAgenda,
  salvarPessoa,
  definirStatusPessoa,
  salvarLocalidade,
  salvarAtividade,
  definirStatusAtividade,
  carregarCronogramaPadrao,
  cronogramaJaCarregado,
} from './db.js';
import { CAPACIDADE_PANFLETAGEM, MINI_TRIO, PRAZO_FINAL_VISITAS, PRAZO_VOTACAO, LIMITE_DIAS_SEM_VISITA } from './seed-data.js';

// ---------------------------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------------------------

const state = {
  pessoas: [],
  localidades: [],
  agenda: [],
  pagina: 'dashboard',
  dashboardData: hojeISO(),
  agendaFiltros: { data: hojeISO(), ra: '', pessoaId: '' },
  pessoasFiltroStatus: 'ativo',
};

const NAV = [
  { id: 'dashboard', label: 'Resumo do dia', icon: 'layout-dashboard' },
  { id: 'agenda', label: 'Agenda diária', icon: 'calendar-days' },
  { id: 'pessoas', label: 'Pessoas', icon: 'users' },
  { id: 'localidades', label: 'Localidades', icon: 'map-pin' },
];

const TIPO_ATIVIDADE = {
  panfletagem: { label: 'Panfletagem', cor: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' },
  reuniao: { label: 'Reunião/café', cor: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  paredao: { label: 'Paredão', cor: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' },
  evento: { label: 'Evento na RA', cor: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
};

const STATUS_ATIVIDADE = {
  nao_iniciado: { label: 'Não iniciado', cor: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  na_rua: { label: 'Na rua', cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
  retornou: { label: 'Retornou', cor: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400' },
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

function diffDiasISO(a, b) {
  const da = new Date(`${a}T00:00:00`);
  const db_ = new Date(`${b}T00:00:00`);
  return Math.round((db_ - da) / 86400000);
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function qs(sel, root = document) { return root.querySelector(sel); }

function toast(msg) {
  const t = qs('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.add('hidden'), 2600);
}

function pessoaNome(id) {
  const p = state.pessoas.find((x) => x.id === id);
  return p ? p.nome : '(removida)';
}

function localidadePorId(id) {
  return state.localidades.find((l) => l.id === id) || null;
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
  dashboard: ['Resumo do dia', 'Contadores, alertas de RA e panorama das atividades'],
  agenda: ['Agenda diária', 'Cadastre e acompanhe panfletagem, reuniões, paredão e eventos'],
  pessoas: ['Pessoas', 'Equipe contratada — cadastro, função e status'],
  localidades: ['Localidades', 'Pontos de panfletagem e de reunião/café por RA'],
};

function irParaPagina(pagina) {
  state.pagina = NAV.some((n) => n.id === pagina) ? pagina : 'dashboard';
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  qs(`#page-${state.pagina}`).classList.remove('hidden');
  const [titulo, sub] = TITULOS[state.pagina];
  qs('#titulo-pagina').textContent = titulo;
  qs('#subtitulo-pagina').textContent = sub;
  aplicarEstiloNav();
  renderPaginaAtual();
}

function renderPaginaAtual() {
  if (state.pagina === 'dashboard') renderDashboard();
  if (state.pagina === 'agenda') renderAgenda();
  if (state.pagina === 'pessoas') renderPessoas();
  if (state.pagina === 'localidades') renderLocalidades();
}

// ---------------------------------------------------------------------------------------------
// Contadores do topo
// ---------------------------------------------------------------------------------------------

function renderContadores() {
  const contratados = state.pessoas.filter((p) => p.status === 'ativo').length;
  const hoje = hojeISO();
  const idsNaRua = new Set();
  state.agenda
    .filter((a) => a.data === hoje && a.status === 'na_rua')
    .forEach((a) => (a.pessoasIds || []).forEach((id) => idsNaRua.add(id)));
  qs('#contador-contratados').textContent = contratados;
  qs('#contador-na-rua').textContent = idsNaRua.size;
}

// ---------------------------------------------------------------------------------------------
// Dashboard / Resumo do dia
// ---------------------------------------------------------------------------------------------

function calcularAlertasRA() {
  const hoje = hojeISO();
  const alertas = [];
  state.localidades.forEach((loc) => {
    const visitas = state.agenda.filter((a) => a.localidadeId === loc.id && a.data <= hoje).map((a) => a.data).sort();
    const ultima = visitas[visitas.length - 1];
    if (!ultima) {
      alertas.push({ ra: loc.ra, nivel: 'nunca', dias: null });
      return;
    }
    const dias = diffDiasISO(ultima, hoje);
    if (dias > LIMITE_DIAS_SEM_VISITA) alertas.push({ ra: loc.ra, nivel: 'atrasada', dias });
    else if (dias >= LIMITE_DIAS_SEM_VISITA - 2) alertas.push({ ra: loc.ra, nivel: 'proxima', dias });
  });
  return alertas.sort((a, b) => (b.dias ?? 999) - (a.dias ?? 999));
}

function renderDashboard() {
  const container = qs('#page-dashboard');
  const data = state.dashboardData;
  const doDia = state.agenda.filter((a) => a.data === data);
  const alertas = calcularAlertasRA();

  const porTipo = {};
  doDia.forEach((a) => {
    porTipo[a.tipoAtividade] = porTipo[a.tipoAtividade] || { total: 0, na_rua: 0, retornou: 0, nao_iniciado: 0 };
    porTipo[a.tipoAtividade].total++;
    porTipo[a.tipoAtividade][a.status]++;
  });

  const porRA = {};
  doDia.forEach((a) => {
    const loc = localidadePorId(a.localidadeId);
    const nome = loc ? loc.ra : '(sem localidade)';
    porRA[nome] = porRA[nome] || [];
    porRA[nome].push(a);
  });

  const pessoasPanfletagemHoje = new Set();
  doDia.filter((a) => a.tipoAtividade === 'panfletagem').forEach((a) => (a.pessoasIds || []).forEach((id) => pessoasPanfletagemHoje.add(id)));
  const nPessoasCapacidade = pessoasPanfletagemHoje.size || CAPACIDADE_PANFLETAGEM.pessoas;
  const panfletosEstimados = nPessoasCapacidade * CAPACIDADE_PANFLETAGEM.panfletosPorPessoa;

  const hoje = hojeISO();
  const diasParaPrazo = diffDiasISO(hoje, PRAZO_FINAL_VISITAS);
  const mostrarMiniTrio = hoje >= MINI_TRIO.disponivelDesde;

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <label class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        Ver resumo de:
        <input type="date" id="dash-data" value="${data}" class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" />
      </label>
      <button id="dash-hoje" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Ir para hoje</button>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      🗓️ Prazo final de visitas às RAs: <strong class="text-slate-700 dark:text-slate-200">${formatDateBR(PRAZO_FINAL_VISITAS)}</strong>
      (10 dias antes da votação, marcada para ${formatDateBR(PRAZO_VOTACAO)})${diasParaPrazo >= 0 ? ` — faltam <strong>${diasParaPrazo}</strong> dia(s).` : ' — prazo encerrado.'}
      ${mostrarMiniTrio ? `<br/>🔊 Mini trio (paredão) disponível desde ${formatDateBR(MINI_TRIO.disponivelDesde)}, das ${MINI_TRIO.inicio} às ${MINI_TRIO.fim}.` : ''}
    </div>

    ${alertas.length ? `
    <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/30">
      <p class="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">⚠️ RAs sem visita há ${LIMITE_DIAS_SEM_VISITA}+ dias (ou perto disso)</p>
      <div class="flex flex-wrap gap-2">
        ${alertas.map((a) => `
          <span class="badge ${a.nivel === 'atrasada' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'}">
            ${esc(a.ra)} — ${a.nivel === 'nunca' ? 'nunca visitada' : `${a.dias} dia(s)`}
          </span>`).join('')}
      </div>
    </div>` : ''}

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Atividades no dia</p>
        <p class="mt-2 text-3xl font-semibold text-indigo-600 dark:text-indigo-400">${doDia.length}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">RAs cobertas no dia</p>
        <p class="mt-2 text-3xl font-semibold text-emerald-600 dark:text-emerald-400">${Object.keys(porRA).length}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:col-span-2">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Capacidade estimada de panfletagem</p>
        <p class="mt-2 text-3xl font-semibold text-amber-600 dark:text-amber-400">${panfletosEstimados.toLocaleString('pt-BR')} <span class="text-sm font-normal text-slate-400">panfletos/dia</span></p>
        <p class="mt-1 text-xs text-slate-400">${nPessoasCapacidade} pessoa(s) × ~${CAPACIDADE_PANFLETAGEM.panfletosPorPessoa} panfletos (referência: 30 pessoas × 266 = ~7.980/dia)</p>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Por tipo de atividade</p>
        ${Object.keys(porTipo).length ? Object.entries(porTipo).map(([tipo, c]) => `
          <div class="mb-2 flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
            <span class="badge ${TIPO_ATIVIDADE[tipo]?.cor || ''}">${TIPO_ATIVIDADE[tipo]?.label || tipo}</span>
            <span class="text-xs text-slate-500 dark:text-slate-400">${c.total} atividade(s) · ${c.na_rua} na rua · ${c.retornou} retornou</span>
          </div>`).join('') : '<p class="text-sm text-slate-400">Nenhuma atividade nesta data.</p>'}
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Por RA</p>
        ${Object.keys(porRA).length ? Object.entries(porRA).map(([ra, itens]) => `
          <div class="mb-2 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
            <p class="text-sm font-medium text-slate-800 dark:text-slate-100">${esc(ra)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">${itens.map((i) => `${TIPO_ATIVIDADE[i.tipoAtividade]?.label || i.tipoAtividade} · ${STATUS_ATIVIDADE[i.status]?.label || i.status}`).join(' — ')}</p>
          </div>`).join('') : '<p class="text-sm text-slate-400">Nenhuma atividade nesta data.</p>'}
      </div>
    </div>
  `;

  qs('#dash-data').addEventListener('change', (e) => { state.dashboardData = e.target.value; renderDashboard(); });
  qs('#dash-hoje').addEventListener('click', () => { state.dashboardData = hojeISO(); renderDashboard(); });
}

// ---------------------------------------------------------------------------------------------
// Agenda diária
// ---------------------------------------------------------------------------------------------

async function renderAgenda() {
  const container = qs('#page-agenda');
  const f = state.agendaFiltros;
  const jaCarregado = supabaseConfigurado ? await cronogramaJaCarregado().catch(() => true) : true;

  let itens = [...state.agenda];
  if (f.data) itens = itens.filter((a) => a.data === f.data);
  if (f.ra) itens = itens.filter((a) => localidadePorId(a.localidadeId)?.ra === f.ra);
  if (f.pessoaId) itens = itens.filter((a) => (a.pessoasIds || []).includes(f.pessoaId));
  itens.sort((a, b) => (a.data + a.horarioInicio).localeCompare(b.data + b.horarioInicio));

  const ras = [...new Set(state.localidades.map((l) => l.ra))].sort();

  container.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-xs text-slate-500 dark:text-slate-400">Data
          <input type="date" id="f-data" value="${f.data}" class="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">RA
          <select id="f-ra" class="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <option value="">Todas</option>
            ${ras.map((ra) => `<option value="${esc(ra)}" ${f.ra === ra ? 'selected' : ''}>${esc(ra)}</option>`).join('')}
          </select>
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Pessoa
          <select id="f-pessoa" class="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <option value="">Todas</option>
            ${state.pessoas.map((p) => `<option value="${p.id}" ${f.pessoaId === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
          </select>
        </label>
        <button id="f-limpar" class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Limpar filtros</button>
      </div>
      <div class="flex gap-2">
        ${!jaCarregado ? `<button id="btn-seed" class="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-400">Carregar cronograma padrão</button>` : ''}
        <button id="btn-nova-atividade" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Nova atividade</button>
      </div>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full min-w-[860px] text-left text-sm">
        <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <tr>
            <th class="px-4 py-3">Data</th>
            <th class="px-4 py-3">Tipo</th>
            <th class="px-4 py-3">RA / Localidade</th>
            <th class="px-4 py-3">Equipe / Pessoas</th>
            <th class="px-4 py-3">Saída → Retorno</th>
            <th class="px-4 py-3">Início</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          ${itens.length ? itens.map(rowAtividade).join('') : `<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">Nenhuma atividade encontrada.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  qs('#f-data').addEventListener('change', (e) => { state.agendaFiltros.data = e.target.value; renderAgenda(); });
  qs('#f-ra').addEventListener('change', (e) => { state.agendaFiltros.ra = e.target.value; renderAgenda(); });
  qs('#f-pessoa').addEventListener('change', (e) => { state.agendaFiltros.pessoaId = e.target.value; renderAgenda(); });
  qs('#f-limpar').addEventListener('click', () => { state.agendaFiltros = { data: '', ra: '', pessoaId: '' }; renderAgenda(); });
  qs('#btn-nova-atividade').addEventListener('click', () => abrirModalAtividade());
  qs('#btn-seed')?.addEventListener('click', async () => {
    try {
      const r = await carregarCronogramaPadrao();
      toast(`Cronograma carregado: ${r.localidadesCriadas} localidade(s) e ${r.atividadesCriadas} atividade(s) novas.`);
      renderAgenda();
    } catch (e) { toast(e.message); }
  });

  container.querySelectorAll('[data-editar-atividade]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModalAtividade(state.agenda.find((a) => a.id === btn.dataset.editarAtividade)));
  });
  container.querySelectorAll('[data-status-atividade]').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      await definirStatusAtividade(sel.dataset.statusAtividade, e.target.value);
      toast('Status atualizado.');
    });
  });
}

function rowAtividade(a) {
  const loc = localidadePorId(a.localidadeId);
  const pessoas = (a.pessoasIds || []).map(pessoaNome);
  const equipe = [a.equipeLabel, ...pessoas].filter(Boolean).join(' · ') || '—';
  return `
    <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
      <td class="px-4 py-3 whitespace-nowrap">${formatDateBR(a.data)}${a.visita ? `<br/><span class="text-[11px] text-slate-400">${esc(a.visita)}</span>` : ''}</td>
      <td class="px-4 py-3"><span class="badge ${TIPO_ATIVIDADE[a.tipoAtividade]?.cor || ''}">${TIPO_ATIVIDADE[a.tipoAtividade]?.label || a.tipoAtividade}</span></td>
      <td class="px-4 py-3">${esc(loc?.ra || '—')}</td>
      <td class="px-4 py-3">${esc(equipe)}</td>
      <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">${esc(a.pontoSaida || '—')} → ${esc(a.pontoRetorno || '—')}</td>
      <td class="px-4 py-3 whitespace-nowrap">${esc(a.horarioInicio || '—')}</td>
      <td class="px-4 py-3">
        <select data-status-atividade="${a.id}" class="rounded-lg border px-2 py-1 text-xs font-semibold ${STATUS_ATIVIDADE[a.status]?.cor || ''}">
          ${Object.entries(STATUS_ATIVIDADE).map(([v, s]) => `<option value="${v}" ${a.status === v ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </td>
      <td class="px-4 py-3 text-right">
        <button data-editar-atividade="${a.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>
      </td>
    </tr>`;
}

function abrirModalAtividade(atividade = null) {
  const ativas = state.pessoas.filter((p) => p.status === 'ativo' || (atividade?.pessoasIds || []).includes(p.id));
  const html = `
    <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">${atividade ? 'Editar atividade' : 'Nova atividade'}</h2>
    <form id="form-atividade" class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs text-slate-500 dark:text-slate-400">Data *
          <input required type="date" name="data" value="${atividade?.data || state.agendaFiltros.data || hojeISO()}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Tipo de atividade *
          <select required name="tipoAtividade" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
            ${Object.entries(TIPO_ATIVIDADE).map(([v, t]) => `<option value="${v}" ${atividade?.tipoAtividade === v ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Localidade *
        <select required name="localidadeId" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="">Selecione...</option>
          ${state.localidades.map((l) => `<option value="${l.id}" ${atividade?.localidadeId === l.id ? 'selected' : ''}>${esc(l.ra)} (${TIPO_ATIVIDADE[l.tipo]?.label || l.tipo})</option>`).join('')}
        </select>
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Equipe (rótulo livre, ex: Grupo 1)
        <input type="text" name="equipeLabel" value="${esc(atividade?.equipeLabel || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <div class="block text-xs text-slate-500 dark:text-slate-400">
        Pessoa(s) vinculada(s)
        <div class="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800">
          ${ativas.length ? ativas.map((p) => `
            <label class="flex items-center gap-2 py-0.5 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" name="pessoasIds" value="${p.id}" ${(atividade?.pessoasIds || []).includes(p.id) ? 'checked' : ''} />
              ${esc(p.nome)}${p.status !== 'ativo' ? ' (inativo)' : ''}
            </label>`).join('') : '<p class="text-slate-400">Nenhuma pessoa cadastrada ainda.</p>'}
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs text-slate-500 dark:text-slate-400">Ponto de saída
          <input type="text" name="pontoSaida" value="${esc(atividade?.pontoSaida ?? 'Comitê (Taguatinga)')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Ponto de retorno
          <input type="text" name="pontoRetorno" value="${esc(atividade?.pontoRetorno ?? 'Comitê (Taguatinga)')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs text-slate-500 dark:text-slate-400">Horário de início
          <input type="time" name="horarioInicio" value="${esc(atividade?.horarioInicio ?? '13:30')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Status
          <select name="status" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
            ${Object.entries(STATUS_ATIVIDADE).map(([v, s]) => `<option value="${v}" ${(atividade?.status || 'nao_iniciado') === v ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Observações
        <textarea name="observacoes" rows="2" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">${esc(atividade?.observacoes || '')}</textarea>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="btn-cancelar" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
        <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Salvar</button>
      </div>
    </form>
  `;
  abrirModal(html);
  qs('#btn-cancelar').addEventListener('click', fecharModal);
  qs('#form-atividade').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dados = {
      data: fd.get('data'),
      tipoAtividade: fd.get('tipoAtividade'),
      localidadeId: fd.get('localidadeId'),
      equipeLabel: fd.get('equipeLabel') || '',
      pessoasIds: fd.getAll('pessoasIds'),
      pontoSaida: fd.get('pontoSaida') || '',
      pontoRetorno: fd.get('pontoRetorno') || '',
      horarioInicio: fd.get('horarioInicio') || '',
      status: fd.get('status'),
      observacoes: fd.get('observacoes') || '',
    };
    try {
      await salvarAtividade(dados, atividade?.id);
      toast('Atividade salva.');
      fecharModal();
    } catch (err) { toast(err.message); }
  });
}

// ---------------------------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------------------------

function renderPessoas() {
  const container = qs('#page-pessoas');
  const filtro = state.pessoasFiltroStatus;
  const lista = state.pessoas
    .filter((p) => filtro === 'todos' || p.status === filtro)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex gap-2">
        ${['ativo', 'inativo', 'todos'].map((v) => `
          <button data-filtro-status="${v}" class="rounded-full border px-3 py-1 text-xs font-medium ${filtro === v ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400'}">
            ${v === 'ativo' ? 'Ativos' : v === 'inativo' ? 'Inativos' : 'Todos'}
          </button>`).join('')}
      </div>
      <button id="btn-nova-pessoa" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Nova pessoa</button>
    </div>

    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full min-w-[600px] text-left text-sm">
        <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <tr><th class="px-4 py-3">Nome</th><th class="px-4 py-3">Contato</th><th class="px-4 py-3">Função</th><th class="px-4 py-3">Status</th><th class="px-4 py-3"></th></tr>
        </thead>
        <tbody>
          ${lista.length ? lista.map((p) => `
            <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">${esc(p.nome)}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${esc(p.contato || '—')}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${esc(p.funcao || '—')}</td>
              <td class="px-4 py-3"><span class="badge ${p.status === 'ativo' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}">${p.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button data-editar-pessoa="${p.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>
                <button data-toggle-pessoa="${p.id}" data-status="${p.status}" class="ml-3 text-xs font-medium text-slate-500 hover:underline dark:text-slate-400">${p.status === 'ativo' ? 'Inativar' : 'Ativar'}</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Nenhuma pessoa cadastrada.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('[data-filtro-status]').forEach((btn) => btn.addEventListener('click', () => { state.pessoasFiltroStatus = btn.dataset.filtroStatus; renderPessoas(); }));
  qs('#btn-nova-pessoa').addEventListener('click', () => abrirModalPessoa());
  container.querySelectorAll('[data-editar-pessoa]').forEach((btn) => btn.addEventListener('click', () => abrirModalPessoa(state.pessoas.find((p) => p.id === btn.dataset.editarPessoa))));
  container.querySelectorAll('[data-toggle-pessoa]').forEach((btn) => btn.addEventListener('click', async () => {
    const novo = btn.dataset.status === 'ativo' ? 'inativo' : 'ativo';
    await definirStatusPessoa(btn.dataset.togglePessoa, novo);
    toast(novo === 'ativo' ? 'Pessoa ativada.' : 'Pessoa inativada.');
  }));
}

function abrirModalPessoa(pessoa = null) {
  const html = `
    <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">${pessoa ? 'Editar pessoa' : 'Nova pessoa'}</h2>
    <form id="form-pessoa" class="space-y-3">
      <label class="block text-xs text-slate-500 dark:text-slate-400">Nome *
        <input required type="text" name="nome" value="${esc(pessoa?.nome || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Contato (telefone/WhatsApp)
        <input type="text" name="contato" value="${esc(pessoa?.contato || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Função
        <input type="text" name="funcao" list="lista-funcoes" value="${esc(pessoa?.funcao || '')}" placeholder="Ex: Panfletagem, Coordenador(a), Motorista" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        <datalist id="lista-funcoes">
          <option value="Panfletagem"></option>
          <option value="Coordenador(a) de grupo"></option>
          <option value="Motorista"></option>
          <option value="Apoio / logística"></option>
        </datalist>
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Status
        <select name="status" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="ativo" ${(pessoa?.status || 'ativo') === 'ativo' ? 'selected' : ''}>Ativo</option>
          <option value="inativo" ${pessoa?.status === 'inativo' ? 'selected' : ''}>Inativo</option>
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
  qs('#form-pessoa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dados = { nome: fd.get('nome').trim(), contato: fd.get('contato') || '', funcao: fd.get('funcao') || '', status: fd.get('status') };
    try {
      await salvarPessoa(dados, pessoa?.id);
      toast('Pessoa salva.');
      fecharModal();
    } catch (err) { toast(err.message); }
  });
}

// ---------------------------------------------------------------------------------------------
// Localidades
// ---------------------------------------------------------------------------------------------

function renderLocalidades() {
  const container = qs('#page-localidades');
  const lista = [...state.localidades].sort((a, b) => a.ra.localeCompare(b.ra));

  container.innerHTML = `
    <div class="flex justify-end">
      <button id="btn-nova-localidade" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Nova localidade</button>
    </div>
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full min-w-[720px] text-left text-sm">
        <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <tr><th class="px-4 py-3">RA</th><th class="px-4 py-3">Tipo</th><th class="px-4 py-3">Endereço/referência</th><th class="px-4 py-3">Anfitrião</th><th class="px-4 py-3"></th></tr>
        </thead>
        <tbody>
          ${lista.length ? lista.map((l) => `
            <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">${esc(l.ra)}</td>
              <td class="px-4 py-3"><span class="badge ${TIPO_ATIVIDADE[l.tipo]?.cor || ''}">${TIPO_ATIVIDADE[l.tipo]?.label || l.tipo}</span></td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${esc(l.endereco || '—')}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${l.tipo === 'reuniao' ? `${esc(l.anfitriaoNome || '—')}${l.anfitriaoContato ? ` (${esc(l.anfitriaoContato)})` : ''}` : '—'}</td>
              <td class="px-4 py-3 text-right"><button data-editar-localidade="${l.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button></td>
            </tr>`).join('') : `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Nenhuma localidade cadastrada.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  qs('#btn-nova-localidade').addEventListener('click', () => abrirModalLocalidade());
  container.querySelectorAll('[data-editar-localidade]').forEach((btn) => btn.addEventListener('click', () => abrirModalLocalidade(state.localidades.find((l) => l.id === btn.dataset.editarLocalidade))));
}

function abrirModalLocalidade(localidade = null) {
  const html = `
    <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">${localidade ? 'Editar localidade' : 'Nova localidade'}</h2>
    <form id="form-localidade" class="space-y-3">
      <label class="block text-xs text-slate-500 dark:text-slate-400">RA (região administrativa) *
        <input required type="text" name="ra" value="${esc(localidade?.ra || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Tipo de ponto *
        <select required name="tipo" id="loc-tipo" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="panfletagem" ${(localidade?.tipo || 'panfletagem') === 'panfletagem' ? 'selected' : ''}>Panfletagem</option>
          <option value="reuniao" ${localidade?.tipo === 'reuniao' ? 'selected' : ''}>Reunião/café</option>
        </select>
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Endereço/referência
        <input type="text" name="endereco" value="${esc(localidade?.endereco || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <div id="loc-anfitriao" class="space-y-3 ${(localidade?.tipo || 'panfletagem') === 'reuniao' ? '' : 'hidden'}">
        <label class="block text-xs text-slate-500 dark:text-slate-400">Nome do anfitrião
          <input type="text" name="anfitriaoNome" value="${esc(localidade?.anfitriaoNome || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="block text-xs text-slate-500 dark:text-slate-400">Contato do anfitrião
          <input type="text" name="anfitriaoContato" value="${esc(localidade?.anfitriaoContato || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="btn-cancelar" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
        <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Salvar</button>
      </div>
    </form>
  `;
  abrirModal(html);
  qs('#btn-cancelar').addEventListener('click', fecharModal);
  qs('#loc-tipo').addEventListener('change', (e) => qs('#loc-anfitriao').classList.toggle('hidden', e.target.value !== 'reuniao'));
  qs('#form-localidade').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dados = {
      ra: fd.get('ra').trim(),
      tipo: fd.get('tipo'),
      endereco: fd.get('endereco') || '',
      anfitriaoNome: fd.get('tipo') === 'reuniao' ? fd.get('anfitriaoNome') || '' : '',
      anfitriaoContato: fd.get('tipo') === 'reuniao' ? fd.get('anfitriaoContato') || '' : '',
    };
    try {
      await salvarLocalidade(dados, localidade?.id);
      toast('Localidade salva.');
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
  const salvo = localStorage.getItem('equipe-rua-tema');
  const escuro = salvo ? salvo === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', escuro);
  atualizarLabelTema();
  qs('#btn-theme').addEventListener('click', () => {
    const agora = document.documentElement.classList.toggle('dark');
    localStorage.setItem('equipe-rua-tema', agora ? 'dark' : 'light');
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

  if (!supabaseConfigurado) {
    qs('#aviso-config').classList.remove('hidden');
    irParaPagina((location.hash || '#dashboard').slice(1));
    return;
  }

  ouvirPessoas((dados) => { state.pessoas = dados; reRenderTudo(); });
  ouvirLocalidades((dados) => { state.localidades = dados; reRenderTudo(); });
  ouvirAgenda((dados) => { state.agenda = dados; reRenderTudo(); });

  window.addEventListener('hashchange', () => irParaPagina(location.hash.slice(1)));
  irParaPagina((location.hash || '#dashboard').slice(1));
}

init();
