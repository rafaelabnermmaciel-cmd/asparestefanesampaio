import {
  firebaseConfigurado,
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
} from './firestore.js';
import { MINI_TRIO, PRAZO_FINAL_VISITAS, PRAZO_VOTACAO, LIMITE_DIAS_SEM_VISITA } from './seed-data.js';

// ---------------------------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------------------------

const state = {
  pessoas: [],
  localidades: [],
  agenda: [],
  pagina: 'dashboard',
  dashboardData: hojeISO(),
  agendaView: 'calendario',
  agendaMes: hojeISO().slice(0, 7),
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
  panfletagem: { label: 'Panfletagem', curto: 'Panf.', cor: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400', corBarra: 'bg-indigo-500', corPonto: 'bg-indigo-500' },
  reuniao: { label: 'Reunião/café', curto: 'Reunião', cor: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400', corBarra: 'bg-amber-500', corPonto: 'bg-amber-500' },
  paredao: { label: 'Paredão', curto: 'Paredão', cor: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400', corBarra: 'bg-rose-500', corPonto: 'bg-rose-500' },
  evento: { label: 'Evento na RA', curto: 'Evento', cor: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400', corBarra: 'bg-emerald-500', corPonto: 'bg-emerald-500' },
};

// Ordem fixa de agrupamento visual no calendário (reunião/café, panfletagem, paredão, evento).
const ORDEM_TIPO = ['reuniao', 'panfletagem', 'paredao', 'evento'];

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
  localidades: ['Localidades', 'Pontos de panfletagem, reunião/café e paredão por RA'],
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

function calcularStatusRAs() {
  // Agrupa por nome de RA (não por localidade): uma RA pode ter mais de um ponto cadastrado
  // (panfletagem, reunião/café, paredão), então a "última visita" da RA é a mais recente entre
  // todas as atividades ligadas a qualquer um desses pontos.
  const hoje = hojeISO();
  const ras = [...new Set(state.localidades.map((l) => l.ra))].sort();
  const naoIniciadas = [];
  const atrasadas = [];

  ras.forEach((ra) => {
    const idsDaRA = state.localidades.filter((l) => l.ra === ra).map((l) => l.id);
    const visitas = state.agenda
      .filter((a) => idsDaRA.includes(a.localidadeId) && a.data <= hoje)
      .map((a) => a.data)
      .sort();
    const ultima = visitas[visitas.length - 1];
    if (!ultima) { naoIniciadas.push(ra); return; }
    const dias = diffDiasISO(ultima, hoje);
    if (dias > LIMITE_DIAS_SEM_VISITA) atrasadas.push({ ra, dias });
  });

  atrasadas.sort((a, b) => b.dias - a.dias);
  return { naoIniciadas, atrasadas };
}

function calcularVisitasPorRA() {
  const porRA = {};
  state.localidades.forEach((loc) => { porRA[loc.ra] = porRA[loc.ra] || { total: 0, porTipo: {} }; });
  state.agenda.forEach((a) => {
    const loc = localidadePorId(a.localidadeId);
    const ra = loc ? loc.ra : null;
    if (!ra) return;
    porRA[ra] = porRA[ra] || { total: 0, porTipo: {} };
    porRA[ra].total++;
    porRA[ra].porTipo[a.tipoAtividade] = (porRA[ra].porTipo[a.tipoAtividade] || 0) + 1;
  });
  return Object.entries(porRA)
    .map(([ra, dados]) => ({ ra, ...dados }))
    .sort((a, b) => b.total - a.total || a.ra.localeCompare(b.ra));
}

function renderGraficoVisitasPorRA() {
  const linhas = calcularVisitasPorRA();
  if (!linhas.length) return '<p class="text-sm text-slate-400">Cadastre localidades para ver o panorama por RA.</p>';
  const maxTotal = Math.max(...linhas.map((l) => l.total), 1);
  const legenda = Object.entries(TIPO_ATIVIDADE).map(([tipo, t]) => `
    <span class="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
      <span class="h-2.5 w-2.5 rounded-full ${t.corBarra}"></span>${t.label}
    </span>`).join('');

  const barras = linhas.map((l) => {
    const larguraTotal = (l.total / maxTotal) * 100;
    const segmentos = Object.entries(l.porTipo).map(([tipo, qtd]) => {
      const pct = (qtd / l.total) * 100;
      return `<div class="h-full ${TIPO_ATIVIDADE[tipo]?.corBarra || 'bg-slate-400'}" style="width:${pct}%" title="${TIPO_ATIVIDADE[tipo]?.label || tipo}: ${qtd}"></div>`;
    }).join('');
    return `
      <div class="flex items-center gap-3">
        <span class="w-36 shrink-0 truncate text-xs text-slate-600 dark:text-slate-300" title="${esc(l.ra)}">${esc(l.ra)}</span>
        <div class="h-4 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div class="flex h-full overflow-hidden rounded-full" style="width:${larguraTotal}%">${segmentos}</div>
        </div>
        <span class="w-6 shrink-0 text-right text-xs font-medium text-slate-500 dark:text-slate-400">${l.total}</span>
      </div>`;
  }).join('');

  return `<div class="flex flex-wrap gap-x-4 gap-y-1 pb-3">${legenda}</div><div class="space-y-2.5">${barras}</div>`;
}

function renderDashboard() {
  const container = qs('#page-dashboard');
  const data = state.dashboardData;
  const doDia = state.agenda.filter((a) => a.data === data);
  const { naoIniciadas, atrasadas } = calcularStatusRAs();

  const porTipo = {};
  doDia.forEach((a) => {
    porTipo[a.tipoAtividade] = porTipo[a.tipoAtividade] || { total: 0, na_rua: 0, retornou: 0, nao_iniciado: 0 };
    porTipo[a.tipoAtividade].total++;
    porTipo[a.tipoAtividade][a.status]++;
  });

  const porRADia = {};
  doDia.forEach((a) => {
    const loc = localidadePorId(a.localidadeId);
    const nome = loc ? loc.ra : '(sem localidade)';
    porRADia[nome] = porRADia[nome] || [];
    porRADia[nome].push(a);
  });

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

    ${(naoIniciadas.length || atrasadas.length) ? `
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/30">
        <p class="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">⏳ RAs não iniciadas (${naoIniciadas.length})</p>
        ${naoIniciadas.length ? `
        <div class="flex flex-wrap gap-2">
          ${naoIniciadas.map((ra) => `<span class="badge bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">${esc(ra)}</span>`).join('')}
        </div>` : '<p class="text-xs text-amber-700/70 dark:text-amber-400/70">Todas as RAs já tiveram alguma visita.</p>'}
      </div>
      <div class="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-900 dark:bg-rose-950/30">
        <p class="mb-2 text-sm font-semibold text-rose-800 dark:text-rose-300">🚨 RAs sem visita há mais de ${LIMITE_DIAS_SEM_VISITA} dias (${atrasadas.length})</p>
        ${atrasadas.length ? `
        <div class="flex flex-wrap gap-2">
          ${atrasadas.map((a) => `<span class="badge bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400">${esc(a.ra)} — ${a.dias} dia(s)</span>`).join('')}
        </div>` : '<p class="text-xs text-rose-700/70 dark:text-rose-400/70">Nenhuma RA passou do limite.</p>'}
      </div>
    </div>` : ''}

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Atividades no dia</p>
        <p class="mt-2 text-3xl font-semibold text-indigo-600 dark:text-indigo-400">${doDia.length}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">RAs cobertas no dia</p>
        <p class="mt-2 text-3xl font-semibold text-emerald-600 dark:text-emerald-400">${Object.keys(porRADia).length}</p>
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
        <p class="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Por RA (neste dia)</p>
        ${Object.keys(porRADia).length ? Object.entries(porRADia).map(([ra, itens]) => `
          <div class="mb-2 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
            <p class="text-sm font-medium text-slate-800 dark:text-slate-100">${esc(ra)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">${itens.map((i) => `${TIPO_ATIVIDADE[i.tipoAtividade]?.label || i.tipoAtividade} · ${STATUS_ATIVIDADE[i.status]?.label || i.status}`).join(' — ')}</p>
          </div>`).join('') : '<p class="text-sm text-slate-400">Nenhuma atividade nesta data.</p>'}
      </div>
    </div>

    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p class="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Panorama geral — atividades por RA</p>
      <p class="mb-3 text-xs text-slate-400">Todas as datas cadastradas, por RA e tipo de atividade</p>
      ${renderGraficoVisitasPorRA()}
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
  const jaCarregado = firebaseConfigurado ? await cronogramaJaCarregado().catch(() => true) : true;
  const ras = [...new Set(state.localidades.map((l) => l.ra))].sort();

  container.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-end gap-3">
        <div class="inline-flex rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          <button data-view="calendario" class="rounded-md px-3 py-1.5 text-xs font-medium transition ${state.agendaView === 'calendario' ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400'}">Calendário</button>
          <button data-view="lista" class="rounded-md px-3 py-1.5 text-xs font-medium transition ${state.agendaView === 'lista' ? 'bg-indigo-600 text-white' : 'text-slate-500 dark:text-slate-400'}">Lista</button>
        </div>
        ${state.agendaView === 'lista' ? `
        <label class="text-xs text-slate-500 dark:text-slate-400">Data
          <input type="date" id="f-data" value="${f.data}" class="mt-1 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>` : ''}
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
        ${state.agendaView === 'lista' ? `<button id="f-limpar" class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Limpar filtros</button>` : ''}
      </div>
      <div class="flex gap-2">
        ${!jaCarregado ? `<button id="btn-seed" class="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-400">Carregar cronograma padrão</button>` : ''}
        <button id="btn-nova-atividade" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Nova atividade</button>
      </div>
    </div>

    <div id="agenda-corpo" class="mt-4"></div>
  `;

  qs('[data-view="lista"]').addEventListener('click', () => { state.agendaView = 'lista'; renderAgenda(); });
  qs('[data-view="calendario"]').addEventListener('click', () => { state.agendaView = 'calendario'; renderAgenda(); });
  qs('#f-ra').addEventListener('change', (e) => { state.agendaFiltros.ra = e.target.value; renderAgendaCorpo(); });
  qs('#f-pessoa').addEventListener('change', (e) => { state.agendaFiltros.pessoaId = e.target.value; renderAgendaCorpo(); });
  qs('#f-data')?.addEventListener('change', (e) => { state.agendaFiltros.data = e.target.value; renderAgendaCorpo(); });
  qs('#f-limpar')?.addEventListener('click', () => { state.agendaFiltros = { data: '', ra: '', pessoaId: '' }; renderAgendaCorpo(); });
  qs('#btn-nova-atividade').addEventListener('click', () => abrirModalAtividade());
  qs('#btn-seed')?.addEventListener('click', async () => {
    try {
      const r = await carregarCronogramaPadrao();
      toast(`Cronograma carregado: ${r.localidadesCriadas} localidade(s) e ${r.atividadesCriadas} atividade(s) novas.`);
      renderAgenda();
    } catch (e) { toast(e.message); }
  });

  renderAgendaCorpo();
}

function renderAgendaCorpo() {
  if (state.agendaView === 'calendario') renderAgendaCalendario();
  else renderAgendaLista();
}

function renderAgendaLista() {
  const container = qs('#agenda-corpo');
  const f = state.agendaFiltros;

  let itens = [...state.agenda];
  if (f.data) itens = itens.filter((a) => a.data === f.data);
  if (f.ra) itens = itens.filter((a) => localidadePorId(a.localidadeId)?.ra === f.ra);
  if (f.pessoaId) itens = itens.filter((a) => (a.pessoasIds || []).includes(f.pessoaId));
  itens.sort((a, b) => (a.data + a.horarioInicio).localeCompare(b.data + b.horarioInicio));

  container.innerHTML = `
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full min-w-[900px] text-left text-sm">
        <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <tr>
            <th class="px-4 py-3">Data</th>
            <th class="px-4 py-3">Tipo</th>
            <th class="px-4 py-3">RA / Localidade</th>
            <th class="px-4 py-3">Equipe / Pessoas</th>
            <th class="px-4 py-3">Saída → Retorno</th>
            <th class="px-4 py-3">Horário</th>
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
  const horario = a.horarioRetorno ? `${esc(a.horarioInicio || '—')} → ${esc(a.horarioRetorno)}` : esc(a.horarioInicio || '—');
  return `
    <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
      <td class="px-4 py-3 whitespace-nowrap">${formatDateBR(a.data)}${a.visita ? `<br/><span class="text-[11px] text-slate-400">${esc(a.visita)}</span>` : ''}</td>
      <td class="px-4 py-3"><span class="badge ${TIPO_ATIVIDADE[a.tipoAtividade]?.cor || ''}">${TIPO_ATIVIDADE[a.tipoAtividade]?.label || a.tipoAtividade}</span></td>
      <td class="px-4 py-3">${esc(loc?.ra || '—')}</td>
      <td class="px-4 py-3">${esc(equipe)}</td>
      <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">${esc(a.pontoSaida || '—')} → ${esc(a.pontoRetorno || '—')}</td>
      <td class="px-4 py-3 whitespace-nowrap">${horario}</td>
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

// ---- Calendário ------------------------------------------------------------------------------

const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function diasDoMes(mesISO) {
  const [ano, mes] = mesISO.split('-').map(Number);
  const primeiro = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dias = [];
  for (let i = 0; i < primeiro.getDay(); i++) dias.push(null);
  for (let d = 1; d <= ultimoDia; d++) dias.push(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  return dias;
}

function mudarMes(mesISO, delta) {
  const [ano, mes] = mesISO.split('-').map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function renderAgendaCalendario() {
  const container = qs('#agenda-corpo');
  const f = state.agendaFiltros;

  let itens = [...state.agenda];
  if (f.ra) itens = itens.filter((a) => localidadePorId(a.localidadeId)?.ra === f.ra);
  if (f.pessoaId) itens = itens.filter((a) => (a.pessoasIds || []).includes(f.pessoaId));

  const porDia = {};
  itens.forEach((a) => { (porDia[a.data] = porDia[a.data] || []).push(a); });

  const dias = diasDoMes(state.agendaMes);
  const hoje = hojeISO();
  const [ano, mes] = state.agendaMes.split('-').map(Number);

  container.innerHTML = `
    <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-3 flex items-center justify-between">
        <button id="mes-anterior" class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">‹</button>
        <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">${NOMES_MES[mes - 1]} de ${ano}</p>
        <button id="mes-proximo" class="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">›</button>
      </div>
      <div class="mb-1 grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-slate-400">
        ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => `<div>${d}</div>`).join('')}
      </div>
      <div class="grid grid-cols-7 gap-1.5">
        ${dias.map((iso) => {
          if (!iso) return '<div></div>';
          const atividadesDia = (porDia[iso] || []).slice().sort((a, b) => {
            const ordemA = ORDEM_TIPO.indexOf(a.tipoAtividade);
            const ordemB = ORDEM_TIPO.indexOf(b.tipoAtividade);
            return ordemA - ordemB || (a.horarioInicio || '').localeCompare(b.horarioInicio || '');
          });
          const ehHoje = iso === hoje;
          const LIMITE_VISIVEL = 4;
          return `
          <button data-dia="${iso}" class="min-h-[88px] rounded-lg border p-1.5 text-left align-top transition hover:border-indigo-300 dark:hover:border-indigo-700 ${ehHoje ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-600 dark:bg-indigo-500/10' : 'border-slate-100 dark:border-slate-800'}">
            <p class="mb-1 text-[11px] font-medium ${ehHoje ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}">${Number(iso.slice(-2))}</p>
            <div class="space-y-0.5">
              ${atividadesDia.slice(0, LIMITE_VISIVEL).map((a) => {
                const loc = localidadePorId(a.localidadeId);
                const t = TIPO_ATIVIDADE[a.tipoAtividade];
                return `<div class="truncate rounded px-1 py-0.5 text-[10px] font-medium ${t?.cor || ''}" title="${esc(t?.label || a.tipoAtividade)} · ${esc(loc?.ra || '')}">${esc(t?.curto || a.tipoAtividade)} · ${esc(loc?.ra || '—')}</div>`;
              }).join('')}
              ${atividadesDia.length > LIMITE_VISIVEL ? `<p class="text-[10px] text-slate-400">+${atividadesDia.length - LIMITE_VISIVEL} mais</p>` : ''}
            </div>
          </button>`;
        }).join('')}
      </div>
      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 dark:border-slate-800">
        ${Object.entries(TIPO_ATIVIDADE).map(([, t]) => `
          <span class="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span class="h-2.5 w-2.5 rounded-full ${t.corBarra}"></span>${t.label}
          </span>`).join('')}
      </div>
    </div>
  `;

  qs('#mes-anterior').addEventListener('click', () => { state.agendaMes = mudarMes(state.agendaMes, -1); renderAgendaCalendario(); });
  qs('#mes-proximo').addEventListener('click', () => { state.agendaMes = mudarMes(state.agendaMes, 1); renderAgendaCalendario(); });
  container.querySelectorAll('[data-dia]').forEach((btn) => btn.addEventListener('click', () => {
    state.agendaFiltros.data = btn.dataset.dia;
    state.agendaView = 'lista';
    renderAgenda();
  }));
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
        <label class="text-xs text-slate-500 dark:text-slate-400">Ponto de saída <span class="text-slate-300">(local de encontro no paredão)</span>
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
        <label class="text-xs text-slate-500 dark:text-slate-400">Horário de retorno (planejado)
          <input type="time" name="horarioRetorno" value="${esc(atividade?.horarioRetorno || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Status
        <select name="status" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          ${Object.entries(STATUS_ATIVIDADE).map(([v, s]) => `<option value="${v}" ${(atividade?.status || 'nao_iniciado') === v ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Roteiro / trajeto <span class="text-slate-300">(ex: ruas do paredão)</span>
        <textarea name="roteiro" rows="2" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">${esc(atividade?.roteiro || '')}</textarea>
      </label>
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
      horarioRetorno: fd.get('horarioRetorno') || '',
      status: fd.get('status'),
      roteiro: fd.get('roteiro') || '',
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
          <tr><th class="px-4 py-3">Nome</th><th class="px-4 py-3">Contato</th><th class="px-4 py-3">Função</th><th class="px-4 py-3">Contratado(a) em</th><th class="px-4 py-3">Status</th><th class="px-4 py-3"></th></tr>
        </thead>
        <tbody>
          ${lista.length ? lista.map((p) => `
            <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">${esc(p.nome)}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${esc(p.contato || '—')}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${esc(p.funcao || '—')}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${formatDateBR(p.dataContratacao)}</td>
              <td class="px-4 py-3"><span class="badge ${p.status === 'ativo' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}">${p.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button data-editar-pessoa="${p.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>
                <button data-toggle-pessoa="${p.id}" data-status="${p.status}" class="ml-3 text-xs font-medium text-slate-500 hover:underline dark:text-slate-400">${p.status === 'ativo' ? 'Inativar' : 'Ativar'}</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">Nenhuma pessoa cadastrada.</td></tr>`}
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
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs text-slate-500 dark:text-slate-400">Data de contratação
          <input type="date" name="dataContratacao" value="${esc(pessoa?.dataContratacao || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Status
          <select name="status" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
            <option value="ativo" ${(pessoa?.status || 'ativo') === 'ativo' ? 'selected' : ''}>Ativo</option>
            <option value="inativo" ${pessoa?.status === 'inativo' ? 'selected' : ''}>Inativo</option>
          </select>
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
  qs('#form-pessoa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const dados = { nome: fd.get('nome').trim(), contato: fd.get('contato') || '', funcao: fd.get('funcao') || '', dataContratacao: fd.get('dataContratacao') || '', status: fd.get('status') };
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
          <option value="paredao" ${localidade?.tipo === 'paredao' ? 'selected' : ''}>Paredão</option>
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

  if (!firebaseConfigurado) {
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
