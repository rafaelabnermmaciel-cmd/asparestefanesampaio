import {
  firebaseConfigurado,
  ouvirVeiculos,
  ouvirVeiculo,
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
  observarAuth,
  fazerLogin,
  fazerLogout,
  ouvirPerfil,
  cadastrarProprietario,
  ouvirAcessosPendentes,
  aprovarAcesso,
  recusarAcesso,
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
  auth: { uid: null, email: null, perfil: null },
  relatorioVeiculoId: '',
  acessosPendentes: [],
};

// O link normal (index.html) exige login de todo mundo. O administrador (Rafael) acessa pelo
// link com ?admin=1 uma vez — o dispositivo lembra disso (localStorage) e passa a abrir direto
// com acesso total, sem precisar logar, nas próximas vezes.
function dispositivoAdmin() {
  try { return localStorage.getItem('rm-veiculos-admin') === '1'; } catch (e) { return false; }
}

function souAdmin() {
  return dispositivoAdmin() || (!!state.auth.uid && state.auth.perfil?.tipo !== 'proprietario');
}

function precisaGateLogin() {
  return !dispositivoAdmin() && !state.auth.uid;
}

function aguardandoAprovacao() {
  return !!(state.auth.uid && state.auth.perfil?.tipo === 'proprietario' && state.auth.perfil?.status !== 'aprovado');
}

const NAV = [
  { id: 'painel', label: 'Painel', icon: 'layout-dashboard' },
  { id: 'veiculos', label: 'Veículos', labelMobile: 'Veíc.', icon: 'car' },
  { id: 'locacoes', label: 'Locações', labelMobile: 'Locaç.', icon: 'users' },
  { id: 'pagamentos', label: 'Pagamentos', labelMobile: 'Pagtos', icon: 'wallet' },
  { id: 'manutencoes', label: 'Manutenções', labelMobile: 'Manut.', icon: 'wrench' },
  { id: 'relatorio', label: 'Relatório', labelMobile: 'Relat.', icon: 'file-text' },
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

// Datas (ISO) de todas as segundas-feiras (dia de pagamento padrão) do mês 'AAAA-MM' — usado
// pra projetar a receita do mês inteiro.
function segundasDoMes(mesAtual) {
  const [ano, mes] = mesAtual.split('-').map(Number);
  const datas = [];
  const d = new Date(ano, mes - 1, 1);
  while (d.getMonth() === mes - 1) {
    if (d.getDay() === 1) {
      datas.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return datas;
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
    <button data-nav="${item.id}" class="nav-btn ${mobile ? 'flex flex-1 flex-col items-center gap-0.5 px-0.5 py-2 text-[9.5px] font-medium leading-tight transition' : 'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition'}">
      <i data-lucide="${item.icon}" class="${mobile ? 'h-5 w-5' : 'h-[18px] w-[18px] shrink-0'}"></i>
      ${mobile ? (item.labelMobile || item.label) : item.label}
    </button>`;

  const itens = souAdmin() ? NAV : NAV.filter((i) => i.id !== 'veiculos');
  qs('#nav-desktop').innerHTML = itens.map((i) => itemHtml(i, false)).join('');
  qs('#nav-mobile').innerHTML = itens.map((i) => itemHtml(i, true)).join('');

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
  relatorio: ['Relatório', 'Receita, gastos e lucro líquido desde o início da locação'],
};

function irParaPagina(pagina) {
  const itensValidos = souAdmin() ? NAV : NAV.filter((n) => n.id !== 'veiculos');
  state.pagina = itensValidos.some((n) => n.id === pagina) ? pagina : 'painel';
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
  qs(`#page-${state.pagina}`).classList.remove('hidden');
  const [titulo, sub] = TITULOS[state.pagina];
  qs('#titulo-pagina').textContent = titulo;
  qs('#subtitulo-pagina').textContent = sub;
  aplicarEstiloNav();
  renderPaginaAtual();
}

function renderPaginaAtual() {
  if (aguardandoAprovacao()) { renderAguardandoAprovacao(); return; }
  if (state.pagina === 'painel') renderPainel();
  if (state.pagina === 'veiculos') renderVeiculos();
  if (state.pagina === 'locacoes') renderLocacoes();
  if (state.pagina === 'pagamentos') renderPagamentos();
  if (state.pagina === 'manutencoes') renderManutencoes();
  if (state.pagina === 'relatorio') renderRelatorio();
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
// Tela de espera (proprietário com cadastro ainda não aprovado)
// ---------------------------------------------------------------------------------------------

function renderAguardandoAprovacao() {
  const container = qs(`#page-${state.pagina}`);
  if (!container) return;
  container.innerHTML = `
    <div class="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
      <i data-lucide="clock" class="h-10 w-10 text-amber-500"></i>
      <h3 class="text-base font-semibold text-slate-900 dark:text-white">Aguardando aprovação</h3>
      <p class="max-w-sm text-sm text-slate-500 dark:text-slate-400">Seu cadastro para o veículo <strong>${esc(state.auth.perfil?.placa || '')}</strong> foi recebido. Assim que o administrador aprovar o acesso, você poderá ver aqui a quilometragem, revisões e o relatório do seu carro.</p>
    </div>
  `;
  atualizarIcones();
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
    const prox = rev ? calcularProximaRevisao(v, rev, loc) : null;

    let receitaMes = 0;
    let detalheReceita = null;
    if (v.tipoReceita === 'administracao') {
      receitaMes = loc ? (v.taxaAdministracaoMensal || 0) : 0;
    } else {
      // Aluguel previsto do mês = soma de todo pagamento já registrado pra essa locação nesse mês
      // (cobre qualquer dia da semana — ex: o último pagamento do esquema antigo, antes de uma
      // troca de dia de pagamento) + uma projeção pro valor cheio em cada segunda ainda sem
      // pagamento registrado. Uma segunda sem registro só entra na projeção se for recente (até
      // 7 dias atrás) ou futura — uma segunda bem antiga sem registro normalmente é porque, antes
      // da troca de dia de pagamento, aquele dia nem era o dia de cobrança (não é uma semana
      // perdida, é só uma data que nunca existiu de verdade).
      const parcelasTotal = fins.reduce((s, f) => s + Number(f.parcela || 0), 0);
      let alugueis = 0;
      if (loc) {
        const pagamentosDoMes = state.pagamentos.filter((p) => p.locacaoId === loc.id && (p.dataReferencia || '').startsWith(mesAtual));
        const datasRegistradas = new Set(pagamentosDoMes.map((p) => p.dataReferencia));
        const somaRegistrada = pagamentosDoMes.reduce((s, p) => s + Number(p.valor || 0), 0);
        const segundasProjetadas = segundasDoMes(mesAtual).filter((d) => !datasRegistradas.has(d) && diffDiasISO(d, hoje) <= 7);
        alugueis = somaRegistrada + segundasProjetadas.length * Number(loc.valorSemanal || 0);
      }
      receitaMes = alugueis - parcelasTotal - Number(v.protecaoVeicularMensal || 0);
      detalheReceita = { alugueis, parcelasTotal, protecao: Number(v.protecaoVeicularMensal || 0) };
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
      const diasAlerta = diffDiasISO(hoje, prox.dataEstimativa || prox.dataLimite);
      if (diasAlerta <= 30) revisoesProximas++;
      proxRevisaoHtml = `
        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">${prox.kmPrevisto.toLocaleString('pt-BR')} km${prox.valorPrevisto ? ` <span class="font-normal text-slate-400">· ~${formatMoeda(prox.valorPrevisto)}</span>` : ''}</p>
        <p class="text-[11px] text-slate-400">Prazo oficial: até ${formatDateBR(prox.dataLimite)}</p>
        ${prox.dataEstimativa ? `<p class="text-[11px] text-slate-400">Estimativa p/ este motorista: ${formatDateBR(prox.dataEstimativa)}</p>` : `<p class="text-[11px] text-slate-400">Estimativa: ainda sem dados suficientes deste motorista</p>`}`;
    }

    return `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-2.5 flex items-start justify-between gap-2">
          <div>
            <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(v.placa)}</p>
            <p class="text-xs text-slate-400">${esc(v.modelo)} · ${esc(v.cor || '')}</p>
          </div>
          <span class="badge ${TIPO_RECEITA_LABEL[v.tipoReceita]?.cor || ''}">${TIPO_RECEITA_LABEL[v.tipoReceita]?.label || v.tipoReceita}</span>
        </div>
        <div class="mb-2.5 flex items-center justify-between rounded-xl border border-slate-100 px-3 py-1.5 dark:border-slate-800">
          <div>
            <p class="text-xs text-slate-400">Locatário</p>
            <p class="text-sm font-medium text-slate-800 dark:text-slate-100">${loc ? esc(loc.locatarioNome) : '—'}</p>
          </div>
          ${statusChip}
        </div>
        ${loc && souAdmin() && !(state.pagamentos.find((p) => p.locacaoId === loc.id && p.dataReferencia === statusSemanaLocacao(loc).dataRef && p.status === 'pago')) ? `
        <div class="mb-2.5 flex gap-2">
          <button data-marcar-pago="${loc.id}" data-veiculo="${v.id}" class="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">✓ Pago (${formatMoeda(loc.valorSemanal)})</button>
          <button data-marcar-naopago="${loc.id}" data-veiculo="${v.id}" class="flex-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20">✗ Não pago</button>
        </div>` : ''}
        <div class="mb-2.5">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Próxima revisão</p>
          ${proxRevisaoHtml}
        </div>
        <div class="border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <div class="flex items-center justify-between">
            <p class="text-xs text-slate-400">Lucro previsto do mês (${mesAtual.split('-').reverse().join('/')})</p>
            <p class="text-sm font-semibold ${receitaMes >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${formatMoeda(receitaMes)}</p>
          </div>
          ${detalheReceita ? `
          <div class="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
            <div class="flex justify-between"><span>Aluguel</span><span>${formatMoeda(detalheReceita.alugueis)}</span></div>
            ${detalheReceita.parcelasTotal ? `<div class="flex justify-between"><span>Financiamento</span><span>-${formatMoeda(detalheReceita.parcelasTotal)}</span></div>` : ''}
            ${detalheReceita.protecao ? `<div class="flex justify-between"><span>Proteção veicular</span><span>-${formatMoeda(detalheReceita.protecao)}</span></div>` : ''}
          </div>` : ''}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="grid grid-cols-3 gap-2 sm:gap-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <p class="text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">Lucro do mês</p>
        <p class="mt-1 text-base font-semibold text-indigo-600 sm:mt-2 sm:text-3xl dark:text-indigo-400">${formatMoeda(receitaMesTotal)}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <p class="text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">Atrasados</p>
        <p class="mt-1 text-base font-semibold sm:mt-2 sm:text-3xl ${atrasados ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">${atrasados}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <p class="text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-xs">Revisões 30d</p>
        <p class="mt-1 text-base font-semibold sm:mt-2 sm:text-3xl ${revisoesProximas ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}">${revisoesProximas}</p>
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

  container.querySelectorAll('[data-marcar-naopago]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const loc = state.locacoes.find((l) => l.id === btn.dataset.marcarNaopago);
      const v = veiculoPorId(btn.dataset.veiculo);
      const dataRef = dataOcorrenciaRecente(loc.diaPagamento);
      const existente = state.pagamentos.find((p) => p.locacaoId === loc.id && p.dataReferencia === dataRef);
      try {
        await salvarPagamento({
          veiculoId: v.id,
          locacaoId: loc.id,
          dataReferencia: dataRef,
          valor: loc.valorSemanal,
          status: 'atrasado',
          dataPagamentoReal: '',
          observacoes: existente?.observacoes || '',
        }, existente?.id);
        toast('Marcado como não pago (atrasado).');
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
    ${lista.length ? `
    <div class="space-y-3 sm:hidden">
      ${lista.map((v) => `
        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-2 flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(v.placa)}</p>
              <p class="text-xs text-slate-400">${esc(v.modelo)} · ${esc(v.cor || '—')}</p>
            </div>
            <span class="badge ${TIPO_RECEITA_LABEL[v.tipoReceita]?.cor || ''}">${TIPO_RECEITA_LABEL[v.tipoReceita]?.label || v.tipoReceita}</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">${esc(v.proprietarioNome)}</p>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
            <span class="text-xs text-slate-400">${v.status === 'ativo' ? 'Ativo' : 'Inativo'}</span>
            <div class="flex flex-wrap justify-end gap-x-3 gap-y-1">
              <button data-ver-relatorio="${v.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Relatório</button>
              ${v.tipoReceita === 'total' ? `<button data-financiamento="${v.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Financiamento</button>` : ''}
              <button data-editar-veiculo="${v.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>
            </div>
          </div>
        </div>`).join('')}
    </div>` : ''}
    <div class="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-left text-sm">
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
                <button data-ver-relatorio="${v.id}" class="mr-3 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Relatório</button>
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
  container.querySelectorAll('[data-ver-relatorio]').forEach((btn) => btn.addEventListener('click', () => {
    state.relatorioVeiculoId = btn.dataset.verRelatorio;
    location.hash = 'relatorio';
  }));
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
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Km atual <span class="text-slate-300">(leitura mais recente, opcional)</span>
          <input type="number" name="kmAtual" value="${veiculo?.kmAtual ?? ''}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Data dessa leitura
          <input type="date" name="dataLeituraAtual" value="${esc(veiculo?.dataLeituraAtual || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
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
      kmAtual: fd.get('kmAtual') ? Number(fd.get('kmAtual')) : null,
      dataLeituraAtual: fd.get('dataLeituraAtual') || '',
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
    ${souAdmin() ? `
    <div class="flex justify-end">
      <button id="btn-nova-locacao" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Nova locação</button>
    </div>` : ''}
    ${lista.length ? `
    <div class="space-y-3 sm:hidden">
      ${lista.map((l) => {
        const v = veiculoPorId(l.veiculoId);
        return `
        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-2 flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(l.locatarioNome)}</p>
              <p class="text-xs text-slate-400">${esc(v?.placa || '—')}</p>
            </div>
            <span class="badge ${STATUS_LOCACAO[l.status]?.cor || ''}">${STATUS_LOCACAO[l.status]?.label || l.status}</span>
          </div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <div><span class="text-slate-400">Retirada</span><br>${formatDateBR(l.dataRetirada)}</div>
            <div><span class="text-slate-400">Fim previsto</span><br>${formatDateBR(l.dataFim)}</div>
            <div><span class="text-slate-400">Valor/dia pag.</span><br>${formatMoeda(l.valorSemanal)} · ${DIAS_SEMANA_LABEL[l.diaPagamento] || l.diaPagamento}</div>
            <div><span class="text-slate-400">Caução</span><br>${l.caucaoValor ? formatMoeda(l.caucaoValor) : '—'} ${l.caucaoStatus ? `(${l.caucaoStatus})` : ''}</div>
          </div>
          <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
            <div>${l.observacoes ? `<button data-ver-observacao="${l.id}" class="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400">📝 Notas</button>` : ''}</div>
            ${souAdmin() ? `
            <div>
              <button data-editar-locacao="${l.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>
              ${l.status === 'ativa' ? `<button data-encerrar-locacao="${l.id}" class="ml-3 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">Encerrar</button>` : ''}
            </div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}
    <div class="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-left text-sm">
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
                ${l.observacoes ? `<button data-ver-observacao="${l.id}" class="mr-3 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400" title="Ver observações">📝 Notas</button>` : ''}
                ${souAdmin() ? `
                <button data-editar-locacao="${l.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>
                ${l.status === 'ativa' ? `<button data-encerrar-locacao="${l.id}" class="ml-3 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">Encerrar</button>` : ''}` : ''}
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">Nenhuma locação cadastrada.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  qs('#btn-nova-locacao')?.addEventListener('click', () => abrirModalLocacao());
  container.querySelectorAll('[data-editar-locacao]').forEach((btn) => btn.addEventListener('click', () => abrirModalLocacao(state.locacoes.find((l) => l.id === btn.dataset.editarLocacao))));
  container.querySelectorAll('[data-ver-observacao]').forEach((btn) => btn.addEventListener('click', () => {
    const l = state.locacoes.find((x) => x.id === btn.dataset.verObservacao);
    abrirModalObservacao(l);
  }));
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
        <label class="text-xs text-slate-500 dark:text-slate-400">Km na retirada <span class="text-slate-300">(do termo de vistoria)</span>
          <input type="number" name="kmRetirada" value="${locacao?.kmRetirada ?? ''}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Fim previsto (prazo mínimo)
          <input type="date" name="dataFim" value="${esc(locacao?.dataFim || '')}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Valor semanal
          <input type="number" step="0.01" name="valorSemanal" value="${locacao?.valorSemanal ?? VALOR_SEMANAL_PADRAO}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Dia de pagamento
        <select name="diaPagamento" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          ${Object.entries(DIAS_SEMANA_LABEL).map(([v, l]) => `<option value="${v}" ${(locacao?.diaPagamento || 'segunda') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="text-xs text-slate-500 dark:text-slate-400">Caução
          <input type="number" step="0.01" name="caucaoValor" value="${locacao?.caucaoValor ?? CAUCAO_PADRAO}" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="text-xs text-slate-500 dark:text-slate-400">Status da caução
          <select name="caucaoStatus" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
            <option value="recebida" ${(locacao?.caucaoStatus || 'recebida') === 'recebida' ? 'selected' : ''}>Recebida</option>
            <option value="parcial" ${locacao?.caucaoStatus === 'parcial' ? 'selected' : ''}>Parcial</option>
            <option value="devolvida" ${locacao?.caucaoStatus === 'devolvida' ? 'selected' : ''}>Devolvida</option>
            <option value="retida" ${locacao?.caucaoStatus === 'retida' ? 'selected' : ''}>Retida (não devolvida)</option>
          </select>
        </label>
      </div>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Status
        <select name="status" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
          <option value="ativa" ${(locacao?.status || 'ativa') === 'ativa' ? 'selected' : ''}>Ativa</option>
          <option value="encerrada" ${locacao?.status === 'encerrada' ? 'selected' : ''}>Encerrada</option>
        </select>
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Observações <span class="text-slate-300">(acertos, diárias em aberto, descontos na caução, etc.)</span>
        <textarea name="observacoes" rows="3" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">${esc(locacao?.observacoes || '')}</textarea>
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
      kmRetirada: fd.get('kmRetirada') ? Number(fd.get('kmRetirada')) : null,
      dataFim: fd.get('dataFim') || '',
      valorSemanal: Number(fd.get('valorSemanal') || VALOR_SEMANAL_PADRAO),
      diaPagamento: fd.get('diaPagamento'),
      caucaoValor: fd.get('caucaoValor') ? Number(fd.get('caucaoValor')) : null,
      caucaoStatus: fd.get('caucaoStatus'),
      status: fd.get('status'),
      observacoes: fd.get('observacoes') || '',
    };
    try {
      await salvarLocacao(dados, locacao?.id);
      toast('Locação salva.');
      fecharModal();
    } catch (err) { toast(err.message); }
  });
}

function abrirModalObservacao(locacao) {
  const v = veiculoPorId(locacao.veiculoId);
  const html = `
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">${esc(locacao.locatarioNome)}</h2>
        <p class="text-xs text-slate-400">${esc(v?.placa || '')} · ${formatDateBR(locacao.dataRetirada)} a ${formatDateBR(locacao.dataFim) || 'em aberto'}</p>
      </div>
    </div>
    <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">${esc(locacao.observacoes)}</div>
    <div class="flex justify-end pt-4">
      <button type="button" id="btn-fechar-observacao" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Fechar</button>
    </div>
  `;
  abrirModal(html);
  qs('#btn-fechar-observacao').addEventListener('click', fecharModal);
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
      ${souAdmin() ? `<button id="btn-novo-pagamento" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Novo pagamento</button>` : ''}
    </div>
    ${itens.length ? `
    <div class="space-y-3 sm:hidden">
      ${itens.map((p) => {
        const v = veiculoPorId(p.veiculoId);
        const loc = state.locacoes.find((l) => l.id === p.locacaoId);
        return `
        <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-2 flex items-start justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(v?.placa || '—')} · ${esc(loc?.locatarioNome || '—')}</p>
              <p class="text-xs text-slate-400">Ref. ${formatDateBR(p.dataReferencia)}${p.dataPagamentoReal ? ` · pago em ${formatDateBR(p.dataPagamentoReal)}` : ''}</p>
            </div>
            <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">${formatMoeda(p.valor)}</p>
          </div>
          <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
            ${souAdmin() ? `
            <select data-status-pagamento="${p.id}" class="rounded-lg border px-2 py-1 text-xs font-semibold ${STATUS_PAGAMENTO[p.status]?.cor || ''}">
              ${Object.entries(STATUS_PAGAMENTO).map(([v2, s]) => `<option value="${v2}" ${p.status === v2 ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
            <button data-editar-pagamento="${p.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>` : `
            <span class="badge ${STATUS_PAGAMENTO[p.status]?.cor || ''}">${STATUS_PAGAMENTO[p.status]?.label || p.status}</span>`}
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}
    <div class="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-left text-sm">
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
                ${souAdmin() ? `
                <select data-status-pagamento="${p.id}" class="rounded-lg border px-2 py-1 text-xs font-semibold ${STATUS_PAGAMENTO[p.status]?.cor || ''}">
                  ${Object.entries(STATUS_PAGAMENTO).map(([v2, s]) => `<option value="${v2}" ${p.status === v2 ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>` : `<span class="badge ${STATUS_PAGAMENTO[p.status]?.cor || ''}">${STATUS_PAGAMENTO[p.status]?.label || p.status}</span>`}
              </td>
              <td class="px-4 py-3 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">${formatDateBR(p.dataPagamentoReal)}</td>
              <td class="px-4 py-3 text-right">${souAdmin() ? `<button data-editar-pagamento="${p.id}" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Editar</button>` : ''}</td>
            </tr>`;
          }).join('') : `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">Nenhum pagamento encontrado.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  qs('#f-veiculo').addEventListener('change', (e) => { state.pagamentosFiltro.veiculoId = e.target.value; renderPagamentos(); });
  qs('#f-status').addEventListener('change', (e) => { state.pagamentosFiltro.status = e.target.value; renderPagamentos(); });
  qs('#btn-novo-pagamento')?.addEventListener('click', () => abrirModalPagamento());
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
    const loc = locacaoAtiva(v.id);
    const prox = calcularProximaRevisao(v, rev, loc);
    const diasAlerta = diffDiasISO(hoje, prox.dataEstimativa || prox.dataLimite);
    const alerta = diasAlerta <= 30;
    return `
      <div class="rounded-2xl border ${alerta ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'} p-5 shadow-sm">
        <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(v.placa)} <span class="font-normal text-slate-400">· ${esc(v.modelo)}</span></p>
        <p class="mt-2 text-xs text-slate-400">Última revisão</p>
        <p class="text-sm text-slate-700 dark:text-slate-200">${rev.kmRealizado.toLocaleString('pt-BR')} km · ${formatDateBR(rev.dataRealizada)}</p>
        <p class="mt-2 text-xs text-slate-400">Próxima revisão (previsão)</p>
        <p class="text-sm font-medium ${alerta ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}">${prox.kmPrevisto.toLocaleString('pt-BR')} km${prox.valorPrevisto ? ` <span class="font-normal ${alerta ? '' : 'text-slate-400'}">· ~${formatMoeda(prox.valorPrevisto)}</span>` : ''}</p>
        <p class="text-[11px] text-slate-400">Prazo oficial (último + 1 ano): ${formatDateBR(prox.dataLimite)}</p>
        <p class="text-[11px] ${alerta ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}">${prox.dataEstimativa ? `Estimativa p/ este motorista: ${formatDateBR(prox.dataEstimativa)} (${diasAlerta >= 0 ? `faltam ${diasAlerta} dia(s)` : 'já passou'})` : 'Estimativa: ainda sem dados suficientes deste motorista'}</p>
      </div>`;
  }).join('');

  const historico = [...state.manutencoes].sort((a, b) => (b.dataRealizada || '').localeCompare(a.dataRealizada || ''));

  container.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${resumoHtml || '<p class="text-sm text-slate-400">Nenhum veículo cadastrado.</p>'}</div>

    ${souAdmin() ? `
    <div class="flex justify-end">
      <button id="btn-nova-manutencao" class="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">+ Registrar manutenção</button>
    </div>` : ''}

    ${historico.length ? `
    <div class="space-y-2 sm:hidden">
      ${historico.map((m) => `
        <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-slate-800 dark:text-slate-100">${esc(veiculoPorId(m.veiculoId)?.placa || '—')} <span class="font-normal capitalize text-slate-400">· ${esc(m.tipo)}</span></p>
            <p class="text-xs text-slate-400">${formatDateBR(m.dataRealizada)}</p>
          </div>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">${m.kmRealizado ? `${m.kmRealizado.toLocaleString('pt-BR')} km` : '—'}${m.valor ? ` · ${formatMoeda(m.valor)}` : ''}</p>
        </div>`).join('')}
    </div>` : ''}
    <div class="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-left text-sm">
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

  qs('#btn-nova-manutencao')?.addEventListener('click', () => abrirModalManutencao());
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
// Relatório (lucro líquido por mês, desde o início da locação)
// ---------------------------------------------------------------------------------------------

function mesesEntre(inicioISO, fimISO) {
  const meses = [];
  let [ano, mes] = inicioISO.slice(0, 7).split('-').map(Number);
  const [anoFim, mesFim] = fimISO.slice(0, 7).split('-').map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return meses;
}

function nomeMes(mesISO) {
  const [ano, mes] = mesISO.split('-').map(Number);
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[mes - 1]}/${String(ano).slice(2)}`;
}

// Dia em que a cobrança semanal passou a cair sempre na segunda-feira (contratos mais antigos
// ficam registrados com o dia que valia na época — ver diaPagamentoAnterior da locação).
const DATA_TROCA_DIA_PAGAMENTO = '2026-11-09';

function isoDeData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fim de verdade da locação pra fins de relatório: se já encerrou, usa a data real (dataFimReal,
// quando foi encerrada pelo app, ou dataFim, quando o histórico já veio com a data real); se
// ainda está ativa, nunca passa de hoje (não projeta cobrança de semana que ainda não chegou).
function fimEfetivoLocacao(loc) {
  const hoje = hojeISO();
  if (loc.status === 'encerrada') return loc.dataFimReal || loc.dataFim || hoje;
  return loc.dataFim && loc.dataFim < hoje ? loc.dataFim : hoje;
}

// Todas as datas de cobrança (segundo o dia da semana combinado no contrato) de uma locação,
// do início até o fim efetivo — é o que dá pra reconstruir o aluguel desde o início de cada
// contrato, mesmo pras semanas de locatários antigos que nunca tiveram pagamento lançado no app.
function datasCobrancaLocacao(loc) {
  if (!loc.dataRetirada) return [];
  const fim = fimEfetivoLocacao(loc);
  if (loc.dataRetirada > fim) return [];
  const datas = [];
  const d = new Date(`${loc.dataRetirada}T00:00:00`);
  const dFim = new Date(`${fim}T00:00:00`);
  while (d <= dFim) {
    const iso = isoDeData(d);
    const diaNome = (loc.diaPagamentoAnterior && iso < DATA_TROCA_DIA_PAGAMENTO) ? loc.diaPagamentoAnterior : loc.diaPagamento;
    if (d.getDay() === (DIAS_SEMANA[diaNome] ?? 1)) datas.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return datas;
}

// Aluguel de cada mês, somando TODOS os contratos (ativos e já encerrados) desde o início da
// operação do veículo: usa o pagamento realmente registrado quando existe, e completa com o
// valor combinado em contrato pras datas de cobrança que nunca tiveram lançamento — é assim que
// o relatório mostra o total desde o início, igual ao estudo de rentabilidade original, sem
// precisar lançar manualmente cada semana de locatários que já saíram.
function aluguelPorMesDoVeiculo(veiculoId) {
  const aluguelPorMes = {};
  locacoesDoVeiculo(veiculoId).forEach((loc) => {
    const pagamentosDaLocacao = state.pagamentos.filter((p) => p.locacaoId === loc.id && p.status === 'pago');
    const datasRegistradas = new Set();
    pagamentosDaLocacao.forEach((p) => {
      const mes = (p.dataReferencia || '').slice(0, 7);
      if (!mes) return;
      datasRegistradas.add(p.dataReferencia);
      aluguelPorMes[mes] = (aluguelPorMes[mes] || 0) + Number(p.valor || 0);
    });
    datasCobrancaLocacao(loc).forEach((dataRef) => {
      if (datasRegistradas.has(dataRef)) return;
      const mes = dataRef.slice(0, 7);
      aluguelPorMes[mes] = (aluguelPorMes[mes] || 0) + Number(loc.valorSemanal || 0);
    });
  });
  return aluguelPorMes;
}

function renderRelatorio() {
  const container = qs('#page-relatorio');
  const veiculoId = souAdmin() ? state.relatorioVeiculoId : state.auth.perfil?.veiculoId;

  if (souAdmin() && !veiculoId) {
    container.innerHTML = `
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">Escolha um veículo pra ver o relatório:</p>
        <div class="flex flex-wrap gap-2">
          ${state.veiculos.map((v) => `<button data-escolher-relatorio="${v.id}" class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300 dark:hover:border-indigo-700">${esc(v.placa)}</button>`).join('') || '<p class="text-sm text-slate-400">Nenhum veículo cadastrado.</p>'}
        </div>
      </div>`;
    container.querySelectorAll('[data-escolher-relatorio]').forEach((btn) => btn.addEventListener('click', () => {
      state.relatorioVeiculoId = btn.dataset.escolherRelatorio;
      renderRelatorio();
    }));
    return;
  }

  const v = veiculoPorId(veiculoId);
  if (!v) {
    container.innerHTML = '<p class="text-sm text-slate-400">Veículo não encontrado.</p>';
    return;
  }

  const manuts = manutencoesDoVeiculo(veiculoId);
  const fins = financiamentosDoVeiculo(veiculoId);
  const parcelaMensal = fins.reduce((s, f) => s + Number(f.parcela || 0), 0);
  const protecaoMensal = Number(v.protecaoVeicularMensal || 0);
  const taxaAdmin = Number(v.taxaAdministracaoMensal || 0);
  const ehAdministracao = v.tipoReceita === 'administracao';

  const aluguelPorMes = aluguelPorMesDoVeiculo(veiculoId);
  const primeiraLocacao = locacoesDoVeiculo(veiculoId).reduce((maisAntiga, l) => (
    !maisAntiga || (l.dataRetirada || '') < maisAntiga ? l.dataRetirada : maisAntiga
  ), null);
  const inicio = v.dataInicioOperacao || primeiraLocacao || hojeISO();
  const meses = mesesEntre(inicio, hojeISO());

  let totAluguel = 0, totAdmin = 0, totManut = 0, totParcela = 0, totProtecao = 0, totLiquido = 0;
  const linhas = meses.map((mes) => {
    const aluguel = aluguelPorMes[mes] || 0;
    const manutencao = manuts.filter((m) => (m.dataRealizada || '').startsWith(mes)).reduce((s, m) => s + Number(m.valor || 0), 0);
    const administracao = ehAdministracao && aluguel > 0 ? taxaAdmin : 0;
    const parcela = ehAdministracao ? 0 : parcelaMensal;
    const protecao = protecaoMensal;
    const liquido = aluguel - administracao - manutencao - parcela - protecao;
    totAluguel += aluguel; totAdmin += administracao; totManut += manutencao; totParcela += parcela; totProtecao += protecao; totLiquido += liquido;
    return { mes, aluguel, administracao, manutencao, parcela, protecao, liquido };
  });

  container.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs text-slate-400">Veículo</p>
        <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(v.placa)} <span class="font-normal text-slate-400">· ${esc(v.proprietarioNome)}</span></p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs text-slate-400">Aluguel recebido (total)</p>
        <p class="text-lg font-semibold text-slate-900 dark:text-white">${formatMoeda(totAluguel)}</p>
      </div>
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p class="text-xs text-slate-400">Gastos (${ehAdministracao ? 'administração + manutenção + proteção' : 'financiamento + manutenção + proteção'})</p>
        <p class="text-lg font-semibold text-rose-600 dark:text-rose-400">-${formatMoeda(totAdmin + totManut + totParcela + totProtecao)}</p>
      </div>
      <div class="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm dark:border-indigo-900 dark:bg-indigo-500/10">
        <p class="text-xs text-indigo-600 dark:text-indigo-400">Líquido desde o início</p>
        <p class="text-lg font-semibold text-indigo-700 dark:text-indigo-300">${formatMoeda(totLiquido)}</p>
      </div>
    </div>
    <p class="text-[11px] text-slate-400">Desde ${formatDateBR(inicio)} (início da operação deste veículo). Semana sem pagamento lançado no app conta pelo valor combinado em contrato; mês sem locatário não conta aluguel nem ${ehAdministracao ? 'administração' : 'parcela'}.</p>

    <div class="space-y-2 sm:hidden">
      ${linhas.map((l) => `
        <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-slate-800 dark:text-slate-100">${nomeMes(l.mes)}</p>
            <p class="text-sm font-semibold ${l.liquido >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${formatMoeda(l.liquido)}</p>
          </div>
          <p class="mt-1 text-[11px] text-slate-400">Aluguel ${formatMoeda(l.aluguel)}${l.administracao ? ` · Admin. -${formatMoeda(l.administracao)}` : ''}${l.parcela ? ` · Financ. -${formatMoeda(l.parcela)}` : ''}${l.manutencao ? ` · Manut. -${formatMoeda(l.manutencao)}` : ''} · Proteção -${formatMoeda(l.protecao)}</p>
        </div>`).join('')}
    </div>
    <div class="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
          <tr>
            <th class="px-4 py-3">Mês</th><th class="px-4 py-3">Aluguel</th>
            <th class="px-4 py-3">${ehAdministracao ? 'Administração' : 'Financiamento'}</th>
            <th class="px-4 py-3">Manutenção</th><th class="px-4 py-3">Proteção</th><th class="px-4 py-3">Líquido</th>
          </tr>
        </thead>
        <tbody>
          ${linhas.map((l) => `
            <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">${nomeMes(l.mes)}</td>
              <td class="px-4 py-3">${formatMoeda(l.aluguel)}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${formatMoeda(ehAdministracao ? l.administracao : l.parcela)}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${formatMoeda(l.manutencao)}</td>
              <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${formatMoeda(l.protecao)}</td>
              <td class="px-4 py-3 font-semibold ${l.liquido >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${formatMoeda(l.liquido)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="border-t border-slate-200 font-semibold dark:border-slate-700">
            <td class="px-4 py-3">Total</td>
            <td class="px-4 py-3">${formatMoeda(totAluguel)}</td>
            <td class="px-4 py-3">${formatMoeda(ehAdministracao ? totAdmin : totParcela)}</td>
            <td class="px-4 py-3">${formatMoeda(totManut)}</td>
            <td class="px-4 py-3">${formatMoeda(totProtecao)}</td>
            <td class="px-4 py-3 ${totLiquido >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${formatMoeda(totLiquido)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    ${souAdmin() ? `<button id="btn-trocar-veiculo-relatorio" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">← Escolher outro veículo</button>` : ''}
  `;
  qs('#btn-trocar-veiculo-relatorio')?.addEventListener('click', () => { state.relatorioVeiculoId = ''; renderRelatorio(); });
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
// Conta (login dos proprietários — opcional, o administrador não precisa logar)
// ---------------------------------------------------------------------------------------------

function atualizarBotaoConta() {
  const label = qs('#btn-conta-label');
  const badge = qs('#btn-conta-badge');
  if (!label) return;
  if (state.auth.uid) {
    if (state.auth.perfil?.tipo === 'proprietario') {
      label.textContent = aguardandoAprovacao() ? 'Pendente' : (state.auth.perfil.placa || 'Minha conta');
    } else {
      label.textContent = 'Admin';
    }
  } else {
    label.textContent = 'Entrar';
  }
  if (badge) {
    const pendentes = souAdmin() ? state.acessosPendentes.length : 0;
    badge.textContent = String(pendentes);
    badge.classList.toggle('hidden', pendentes === 0);
  }
}

function htmlAcessosPendentes() {
  if (!state.acessosPendentes.length) {
    return `<p class="text-xs text-slate-400">Nenhum cadastro aguardando aprovação.</p>`;
  }
  return `
    <div class="space-y-2">
      ${state.acessosPendentes.map((a) => `
        <div class="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-500/10">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-slate-900 dark:text-white">${esc(a.email)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Placa ${esc(a.placa)}</p>
          </div>
          <div class="flex shrink-0 gap-1.5">
            <button type="button" data-aprovar="${a.id}" class="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">Aprovar</button>
            <button type="button" data-recusar="${a.id}" class="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-500">Recusar</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function wireAcessosPendentes() {
  document.querySelectorAll('[data-aprovar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await aprovarAcesso(btn.dataset.aprovar); toast('Acesso aprovado.'); } catch (e) { toast(e.message); btn.disabled = false; }
    });
  });
  document.querySelectorAll('[data-recusar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await recusarAcesso(btn.dataset.recusar); toast('Cadastro recusado.'); } catch (e) { toast(e.message); btn.disabled = false; }
    });
  });
}

function abrirModalConta() {
  if (state.auth.uid) {
    const pendente = aguardandoAprovacao();
    const html = `
      <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Sua conta</h2>
      <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">${esc(state.auth.email)} · ${state.auth.perfil?.tipo === 'proprietario' ? `Proprietário${state.auth.perfil.placa ? ' · ' + esc(state.auth.perfil.placa) : ''}` : 'Administrador'}</p>
      ${pendente ? `<p class="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">Seu cadastro ainda está aguardando aprovação do administrador.</p>` : ''}
      ${souAdmin() ? `
        <h3 class="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Cadastros pendentes</h3>
        ${htmlAcessosPendentes()}
      ` : ''}
      <div class="flex justify-end gap-2 pt-4">
        <button type="button" id="btn-fechar-conta" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Fechar</button>
        <button type="button" id="btn-sair" class="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-500">Sair</button>
      </div>
    `;
    abrirModal(html);
    qs('#btn-fechar-conta').addEventListener('click', fecharModal);
    qs('#btn-sair').addEventListener('click', async () => {
      try { await fazerLogout(); toast('Você saiu.'); fecharModal(); } catch (e) { toast(e.message); }
    });
    wireAcessosPendentes();
  } else {
    const htmlLogin = () => `
      <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Entrar</h2>
      <p class="mb-4 text-xs text-slate-400">Só precisa entrar se você for proprietário de um dos veículos.</p>
      <form id="form-login" class="space-y-3">
        <label class="block text-xs text-slate-500 dark:text-slate-400">E-mail
          <input required type="email" name="email" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="block text-xs text-slate-500 dark:text-slate-400">Senha
          <input required type="password" name="senha" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <div class="flex items-center justify-between pt-1">
          <button type="button" id="btn-ir-cadastro" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Ainda não tenho conta</button>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancelar" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
          <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Entrar</button>
        </div>
      </form>
      ${souAdmin() ? `
        <div class="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Cadastros pendentes</h3>
          ${htmlAcessosPendentes()}
        </div>
      ` : ''}
    `;
    const htmlCadastro = () => `
      <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Criar conta de proprietário</h2>
      <p class="mb-4 text-xs text-slate-400">Informe a placa do seu veículo — ela é usada para localizar seus dados. Seu acesso fica pendente até o administrador aprovar.</p>
      <form id="form-cadastro" class="space-y-3">
        <label class="block text-xs text-slate-500 dark:text-slate-400">Placa do veículo
          <input required name="placa" placeholder="ABC1D23" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm uppercase dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="block text-xs text-slate-500 dark:text-slate-400">E-mail
          <input required type="email" name="email" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <label class="block text-xs text-slate-500 dark:text-slate-400">Senha
          <input required type="password" name="senha" minlength="6" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
        </label>
        <div class="flex items-center justify-between pt-1">
          <button type="button" id="btn-ir-login" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Já tenho conta</button>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancelar" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
          <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Criar conta</button>
        </div>
      </form>
    `;

    const wireLogin = () => {
      qs('#btn-cancelar').addEventListener('click', fecharModal);
      qs('#btn-ir-cadastro').addEventListener('click', () => { abrirModal(htmlCadastro()); wireCadastro(); });
      qs('#form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const botao = e.target.querySelector('button[type=submit]');
        botao.disabled = true;
        try {
          await fazerLogin(fd.get('email').trim(), fd.get('senha'));
          toast('Login feito.');
          fecharModal();
        } catch (err) {
          botao.disabled = false;
          toast('E-mail ou senha incorretos.');
        }
      });
      wireAcessosPendentes();
    };

    const wireCadastro = () => {
      qs('#btn-cancelar').addEventListener('click', fecharModal);
      qs('#btn-ir-login').addEventListener('click', () => { abrirModal(htmlLogin()); wireLogin(); });
      qs('#form-cadastro').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const botao = e.target.querySelector('button[type=submit]');
        botao.disabled = true;
        try {
          await cadastrarProprietario(fd.get('email').trim(), fd.get('senha'), fd.get('placa'));
          toast('Conta criada! Aguarde a aprovação do administrador.');
          fecharModal();
        } catch (err) {
          botao.disabled = false;
          if (String(err.code || err.message).includes('email-already-in-use')) {
            toast('Esse e-mail já está cadastrado.');
          } else if (String(err.code || err.message).includes('weak-password')) {
            toast('Senha muito curta — use pelo menos 6 caracteres.');
          } else {
            toast(err.message);
          }
        }
      });
    };

    abrirModal(htmlLogin());
    wireLogin();
  }
}

// ---------------------------------------------------------------------------------------------
// Portão de acesso (tela cheia de login/cadastro pra quem abre o link sem ser o administrador)
// ---------------------------------------------------------------------------------------------

function htmlGateLogin() {
  return `
    <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Entrar</h2>
    <p class="mb-4 text-xs text-slate-400">Entre com o e-mail e senha do seu veículo.</p>
    <form id="gate-form-login" class="space-y-3">
      <label class="block text-xs text-slate-500 dark:text-slate-400">E-mail
        <input required type="email" name="email" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Senha
        <input required type="password" name="senha" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <div class="pt-1">
        <button type="button" id="gate-ir-cadastro" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Ainda não tenho conta</button>
      </div>
      <button type="submit" class="mt-1 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Entrar</button>
    </form>
  `;
}

function htmlGateCadastro() {
  return `
    <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Criar conta de proprietário</h2>
    <p class="mb-4 text-xs text-slate-400">Informe a placa do seu veículo — ela é usada pra achar seus dados. Seu acesso fica pendente até o administrador aprovar.</p>
    <form id="gate-form-cadastro" class="space-y-3">
      <label class="block text-xs text-slate-500 dark:text-slate-400">Placa do veículo
        <input required name="placa" placeholder="ABC1D23" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm uppercase dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">E-mail
        <input required type="email" name="email" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <label class="block text-xs text-slate-500 dark:text-slate-400">Senha
        <input required type="password" name="senha" minlength="6" class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <div class="pt-1">
        <button type="button" id="gate-ir-login" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Já tenho conta</button>
      </div>
      <button type="submit" class="mt-1 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Criar conta</button>
    </form>
  `;
}

function wireGateLogin() {
  qs('#gate-ir-cadastro').addEventListener('click', () => {
    qs('#gate-login-box').innerHTML = htmlGateCadastro();
    wireGateCadastro();
  });
  qs('#gate-form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const botao = e.target.querySelector('button[type=submit]');
    botao.disabled = true;
    try {
      await fazerLogin(fd.get('email').trim(), fd.get('senha'));
    } catch (err) {
      botao.disabled = false;
      toast('E-mail ou senha incorretos.');
    }
  });
}

function wireGateCadastro() {
  qs('#gate-ir-login').addEventListener('click', () => {
    qs('#gate-login-box').innerHTML = htmlGateLogin();
    wireGateLogin();
  });
  qs('#gate-form-cadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const botao = e.target.querySelector('button[type=submit]');
    botao.disabled = true;
    try {
      await cadastrarProprietario(fd.get('email').trim(), fd.get('senha'), fd.get('placa'));
      toast('Conta criada! Aguarde a aprovação do administrador.');
    } catch (err) {
      botao.disabled = false;
      if (String(err.code || err.message).includes('email-already-in-use')) {
        toast('Esse e-mail já está cadastrado.');
      } else if (String(err.code || err.message).includes('weak-password')) {
        toast('Senha muito curta — use pelo menos 6 caracteres.');
      } else {
        toast(err.message);
      }
    }
  });
}

function renderGateLogin() {
  qs('#gate-login-box').innerHTML = htmlGateLogin();
  wireGateLogin();
}

function mostrarGateLogin() {
  qs('#app-shell').classList.add('hidden');
  qs('#nav-mobile').classList.add('hidden');
  qs('#gate-login').classList.remove('hidden');
  qs('#gate-login').classList.add('flex');
  renderGateLogin();
}

function esconderGateLogin() {
  qs('#gate-login').classList.add('hidden');
  qs('#gate-login').classList.remove('flex');
  qs('#gate-login-box').innerHTML = '';
  qs('#app-shell').classList.remove('hidden');
  qs('#nav-mobile').classList.remove('hidden');
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------

function reRenderTudo() {
  renderContadores();
  renderPaginaAtual();
}

let pararListenersDados = [];

function pararOuvintesDados() {
  pararListenersDados.forEach((unsub) => { try { unsub && unsub(); } catch (e) { /* noop */ } });
  pararListenersDados = [];
}

function iniciarOuvintesConformeAuth() {
  pararOuvintesDados();
  state.veiculos = [];
  state.financiamentos = [];
  state.locacoes = [];
  state.pagamentos = [];
  state.manutencoes = [];
  state.relatorioVeiculoId = '';

  if (precisaGateLogin()) {
    mostrarGateLogin();
    return;
  }
  esconderGateLogin();

  if (state.auth.perfil?.tipo === 'proprietario') {
    if (state.auth.perfil.status === 'aprovado') {
      const veiculoId = state.auth.perfil.veiculoId;
      pararListenersDados.push(ouvirVeiculo(veiculoId, (v) => { state.veiculos = v ? [v] : []; reRenderTudo(); }));
      pararListenersDados.push(ouvirFinanciamentos((d) => { state.financiamentos = d; reRenderTudo(); }, veiculoId));
      pararListenersDados.push(ouvirLocacoes((d) => { state.locacoes = d; reRenderTudo(); }, veiculoId));
      pararListenersDados.push(ouvirPagamentos((d) => { state.pagamentos = d; reRenderTudo(); }, veiculoId));
      pararListenersDados.push(ouvirManutencoes((d) => { state.manutencoes = d; reRenderTudo(); }, veiculoId));
    }
  } else {
    pararListenersDados.push(ouvirVeiculos((d) => { state.veiculos = d; reRenderTudo(); }));
    pararListenersDados.push(ouvirFinanciamentos((d) => { state.financiamentos = d; reRenderTudo(); }));
    pararListenersDados.push(ouvirLocacoes((d) => { state.locacoes = d; reRenderTudo(); }));
    pararListenersDados.push(ouvirPagamentos((d) => { state.pagamentos = d; reRenderTudo(); }));
    pararListenersDados.push(ouvirManutencoes((d) => { state.manutencoes = d; reRenderTudo(); }));
  }

  renderNav();
  atualizarBotaoConta();
  irParaPagina(location.hash.slice(1) || 'painel');
}

let pararOuvirPerfil = null;

function init() {
  initTema();

  // Link do administrador (abrir uma vez com ?admin=1): fica lembrado neste navegador/aparelho,
  // dando acesso total sem precisar logar nas próximas vezes. Quem abre o link normal sem isso
  // cai no portão de login.
  try {
    if (new URLSearchParams(location.search).get('admin') === '1') {
      localStorage.setItem('rm-veiculos-admin', '1');
      history.replaceState(null, '', location.pathname + location.hash);
    }
  } catch (e) { /* localStorage indisponível — segue sem lembrar */ }

  qs('#btn-conta').addEventListener('click', () => abrirModalConta());

  if (!firebaseConfigurado) {
    qs('#aviso-config').classList.remove('hidden');
    renderNav();
    irParaPagina((location.hash || '#painel').slice(1));
    return;
  }

  window.addEventListener('hashchange', () => irParaPagina(location.hash.slice(1)));

  if (dispositivoAdmin()) {
    // Sempre ativo (mesmo sem login), pra avisar o administrador de cadastros novos à espera.
    ouvirAcessosPendentes((lista) => {
      state.acessosPendentes = lista;
      atualizarBotaoConta();
    });
  }

  observarAuth((user) => {
    if (pararOuvirPerfil) { pararOuvirPerfil(); pararOuvirPerfil = null; }
    if (user) {
      // Listener (não leitura única): se o administrador aprovar o acesso com a tela já aberta,
      // o proprietário passa a ver os dados na hora, sem precisar sair e entrar de novo.
      pararOuvirPerfil = ouvirPerfil(user.uid, (perfil) => {
        state.auth = { uid: user.uid, email: user.email, perfil };
        iniciarOuvintesConformeAuth();
      });
    } else {
      state.auth = { uid: null, email: null, perfil: null };
      iniciarOuvintesConformeAuth();
    }
  });
}

init();
