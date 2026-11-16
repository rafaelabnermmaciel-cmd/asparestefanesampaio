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
  ouvirProprietariosAprovados,
} from './firestore.js?v=15';
import { MODELO_PADRAO, VALOR_SEMANAL_PADRAO, CAUCAO_PADRAO, TABELA_REVISAO_BYD, calcularProximaRevisao } from './seed-data.js?v=15';

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
  proprietariosAprovados: [],
};

// O link normal (index.html) exige login de todo mundo. O administrador (Rafael) entra digitando
// a senha de administrador no próprio portão (sem e-mail) — ou, como antes, abrindo o link com
// ?admin=1 uma vez. De qualquer um dos dois jeitos o dispositivo lembra disso (localStorage) e
// passa a abrir direto com acesso total, sem precisar logar, nas próximas vezes — isso também é
// o que faz funcionar certo quando se fixa o app na tela inicial (o atalho guarda a própria
// lembrança, já que a senha é digitada dentro dele mesmo).
const SENHA_ADMINISTRADOR = 'rmveiculos';

function dispositivoAdmin() {
  try { return localStorage.getItem('rm-veiculos-admin') === '1'; } catch (e) { return false; }
}

function souAdmin() {
  // Exige um perfil carregado de verdade — sem isso, alguém cujo acesso foi removido (perfil
  // apagado) enquanto ainda estava logado não pode cair aqui achando que é administrador.
  return dispositivoAdmin() || (!!state.auth.uid && !!state.auth.perfil && state.auth.perfil.tipo !== 'proprietario');
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

// Texto do custo da próxima revisão: até 100 mil km é garantia (grátis, não é gasto de
// verdade); só a partir de 120 mil km o proprietário paga e aí sim mostra o valor da tabela.
function custoRevisaoHtml(prox, classeMuted) {
  if (prox.gratuita) return ` <span class="font-normal ${classeMuted}">· grátis (garantia)</span>`;
  if (prox.valorPrevisto) return ` <span class="font-normal ${classeMuted}">· ~${formatMoeda(prox.valorPrevisto)}</span>`;
  return '';
}

// Comprime uma imagem no navegador (canvas) e devolve como data URL (base64) — usado pra guardar
// fotos de documentos/contratos direto no Firestore, já que não temos Firebase Storage (plano
// pago). Redimensiona pra no máximo `maxLargura` px e recomprime em JPEG, pra caber no limite de
// 1 MB por documento do Firestore mesmo com várias páginas.
function comprimirImagem(arquivo, maxLargura = 1280, qualidade = 0.6) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maxLargura / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', qualidade));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui ler essa imagem.')); };
    img.src = url;
  });
}

// Comprime cada imagem escolhida e devolve a lista pronta pra gravar no Firestore (nome + dados
// em base64). Para no limite de ORÇAMENTO_PAGINAS_BYTES pra nunca estourar o 1 MB do documento.
const ORCAMENTO_PAGINAS_BYTES = 850000;

async function prepararPaginasDocumento(arquivos) {
  const paginas = [];
  let total = 0;
  for (const arquivo of arquivos) {
    if (!arquivo.type.startsWith('image/')) {
      throw new Error(`"${arquivo.name}" não é uma imagem — tire uma foto ou print de cada página do documento.`);
    }
    const dados = await comprimirImagem(arquivo);
    total += dados.length;
    if (total > ORCAMENTO_PAGINAS_BYTES) {
      throw new Error('Muitas páginas/fotos grandes pra guardar de uma vez — tente enviar menos páginas, ou em fotos separadas.');
    }
    paginas.push({ nome: arquivo.name, dados });
  }
  return paginas;
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
      // troca de dia de pagamento) + uma projeção pro valor cheio em cada dia de cobrança ainda sem
      // pagamento registrado. Usa datasCobrancaLocacao (mesma lógica do Relatório) em vez de só
      // "toda segunda do mês" — assim respeita o dia de pagamento de cada locação (e sua troca ao
      // longo do tempo), em vez de supor que é sempre segunda-feira. Uma data sem registro só entra
      // na projeção se for recente (até 7 dias atrás) ou futura — uma data bem antiga sem registro
      // normalmente é porque, antes da troca de dia de pagamento, aquele dia nem era o dia de
      // cobrança (não é uma semana perdida, é só uma data que nunca existiu de verdade).
      const parcelasTotal = fins.reduce((s, f) => s + Number(f.parcela || 0), 0);
      let alugueis = 0;
      if (loc) {
        const pagamentosDoMes = state.pagamentos.filter((p) => p.locacaoId === loc.id && (p.dataReferencia || '').startsWith(mesAtual));
        const datasRegistradas = new Set(pagamentosDoMes.map((p) => p.dataReferencia));
        const somaRegistrada = pagamentosDoMes.reduce((s, p) => s + Number(p.valor || 0), 0);
        const datasProjetadas = datasCobrancaNoMes(loc, mesAtual).filter((d) => !datasRegistradas.has(d) && diffDiasISO(d, hoje) <= 7);
        alugueis = somaRegistrada + datasProjetadas.length * Number(loc.valorSemanal || 0);
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
        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">${prox.kmPrevisto.toLocaleString('pt-BR')} km${custoRevisaoHtml(prox, 'text-slate-400')}</p>
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
              <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(v.placa)}${v.documentoPaginas?.length ? ` <button type="button" data-ver-documento="${v.id}" title="Ver documento do veículo" class="text-indigo-500">📄</button>` : ''}</p>
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
              <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">${esc(v.placa)}${v.documentoPaginas?.length ? ` <button type="button" data-ver-documento="${v.id}" title="Ver documento do veículo" class="text-indigo-500">📄</button>` : ''}</td>
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
  container.querySelectorAll('[data-ver-documento]').forEach((btn) => btn.addEventListener('click', () => {
    const v = veiculoPorId(btn.dataset.verDocumento);
    abrirModalPaginas(`Documento — ${v.placa}`, v.documentoPaginas);
  }));
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
      <label class="block text-xs text-slate-500 dark:text-slate-400">Documento do veículo <span class="text-slate-300">(CRLV, etc. — foto ou print de cada página)</span>
        ${veiculo?.documentoPaginas?.length ? `<p class="mt-1 text-xs"><button type="button" id="btn-ver-documento" class="font-medium text-indigo-600 hover:underline dark:text-indigo-400">📄 Ver documento atual (${veiculo.documentoPaginas.length} pág.)</button> <button type="button" id="btn-remover-documento" class="ml-2 text-rose-600 hover:underline dark:text-rose-400">remover</button></p>` : ''}
        <input type="file" name="documento" accept="image/*" multiple class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
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
  qs('#btn-ver-documento')?.addEventListener('click', () => abrirModalPaginas(`Documento — ${veiculo.placa}`, veiculo.documentoPaginas));
  let documentoRemovido = false;
  qs('#btn-remover-documento')?.addEventListener('click', (e) => {
    documentoRemovido = true;
    e.target.closest('p').remove();
  });
  qs('#form-veiculo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const botao = e.target.querySelector('button[type=submit]');
    botao.disabled = true;
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
      const arquivos = fd.getAll('documento').filter((a) => a.size > 0);
      if (arquivos.length) {
        dados.documentoPaginas = await prepararPaginasDocumento(arquivos);
      } else if (documentoRemovido) {
        dados.documentoPaginas = null;
      }
      await salvarVeiculo(dados, veiculo?.id);
      toast('Veículo salvo.');
      fecharModal();
    } catch (err) { botao.disabled = false; toast(err.message); }
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
              <p class="text-sm font-semibold text-slate-900 dark:text-white">${esc(l.locatarioNome)}${l.contratoPaginas?.length ? ` <button type="button" data-ver-contrato="${l.id}" title="Ver contrato assinado" class="text-indigo-500">📄</button>` : ''}</p>
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
              <td class="px-4 py-3">${esc(l.locatarioNome)}${l.contratoPaginas?.length ? ` <button type="button" data-ver-contrato="${l.id}" title="Ver contrato assinado" class="text-indigo-500">📄</button>` : ''}</td>
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
  container.querySelectorAll('[data-ver-contrato]').forEach((btn) => btn.addEventListener('click', () => {
    const l = state.locacoes.find((x) => x.id === btn.dataset.verContrato);
    abrirModalPaginas(`Contrato — ${l.locatarioNome}`, l.contratoPaginas);
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
      <label class="block text-xs text-slate-500 dark:text-slate-400">Contrato assinado <span class="text-slate-300">(foto ou print de cada página)</span>
        ${locacao?.contratoPaginas?.length ? `<p class="mt-1 text-xs"><button type="button" id="btn-ver-contrato" class="font-medium text-indigo-600 hover:underline dark:text-indigo-400">📄 Ver contrato atual (${locacao.contratoPaginas.length} pág.)</button> <button type="button" id="btn-remover-contrato" class="ml-2 text-rose-600 hover:underline dark:text-rose-400">remover</button></p>` : ''}
        <input type="file" name="contrato" accept="image/*" multiple class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="btn-cancelar" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancelar</button>
        <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Salvar</button>
      </div>
    </form>
  `;
  abrirModal(html);
  qs('#btn-cancelar').addEventListener('click', fecharModal);
  qs('#btn-ver-contrato')?.addEventListener('click', () => abrirModalPaginas(`Contrato — ${locacao.locatarioNome}`, locacao.contratoPaginas));
  let contratoRemovido = false;
  qs('#btn-remover-contrato')?.addEventListener('click', (e) => {
    contratoRemovido = true;
    e.target.closest('p').remove();
  });
  qs('#form-locacao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const botao = e.target.querySelector('button[type=submit]');
    botao.disabled = true;
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
    if (!locacao) dados.primeiraCobrancaNaRetirada = true; // todo locatário novo paga a semana cheia já na retirada
    try {
      const arquivos = fd.getAll('contrato').filter((a) => a.size > 0);
      if (arquivos.length) {
        dados.contratoPaginas = await prepararPaginasDocumento(arquivos);
      } else if (contratoRemovido) {
        dados.contratoPaginas = null;
      }
      await salvarLocacao(dados, locacao?.id);
      toast('Locação salva.');
      fecharModal();
    } catch (err) { botao.disabled = false; toast(err.message); }
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
        <p class="text-sm font-medium ${alerta ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}">${prox.kmPrevisto.toLocaleString('pt-BR')} km${custoRevisaoHtml(prox, alerta ? '' : 'text-slate-400')}</p>
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

// Dia padrão em que a cobrança semanal passou a cair sempre na segunda-feira (contratos mais
// antigos ficam registrados com o dia que valia na época — ver diaPagamentoAnterior da locação).
// Cada locação pode ter sua própria data de troca (campo dataTrocaDiaPagamento), já que nem
// todo mundo mudou de dia na mesma semana — esta aqui é só o valor padrão quando a locação não
// especifica a sua.
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

// Datas de cobrança (segundo o dia da semana combinado no contrato, respeitando a troca de dia
// ao longo do tempo) de uma locação entre duas datas ISO quaisquer, inclusive.
function datasCobrancaEntre(loc, inicio, fim) {
  if (!inicio || inicio > fim) return [];
  const datas = [];
  const d = new Date(`${inicio}T00:00:00`);
  const dFim = new Date(`${fim}T00:00:00`);
  const dataTroca = loc.dataTrocaDiaPagamento || DATA_TROCA_DIA_PAGAMENTO;
  while (d <= dFim) {
    const iso = isoDeData(d);
    const diaNome = (loc.diaPagamentoAnterior && iso < dataTroca) ? loc.diaPagamentoAnterior : loc.diaPagamento;
    if (d.getDay() === (DIAS_SEMANA[diaNome] ?? 1)) datas.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return datas;
}

// Datas de cobrança dentro de [inicio, fim], considerando que algumas locações cobram uma
// semana cheia já na retirada (primeiraCobrancaNaRetirada): nesses casos a retirada sempre entra
// como data de cobrança (não importa o dia da semana) e o ciclo regular só recomeça 7 dias depois
// — a primeira ocorrência do dia de pagamento dentro dessa semana já paga não conta de novo.
function datasCobrancaComRetirada(loc, inicio, fim) {
  if (!inicio || inicio > fim) return [];
  if (loc.primeiraCobrancaNaRetirada && loc.dataRetirada) {
    const inicioCiclo = somarDiasISO(loc.dataRetirada, 7);
    const datas = [];
    if (loc.dataRetirada >= inicio && loc.dataRetirada <= fim) datas.push(loc.dataRetirada);
    const inicioLoop = inicioCiclo > inicio ? inicioCiclo : inicio;
    datas.push(...datasCobrancaEntre(loc, inicioLoop, fim));
    return datas;
  }
  return datasCobrancaEntre(loc, inicio, fim);
}

function somarDiasISO(iso, dias) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return isoDeData(d);
}

// Todas as datas de cobrança de uma locação, do início até o fim efetivo — é o que dá pra
// reconstruir o aluguel desde o início de cada contrato, mesmo pras semanas de locatários antigos
// que nunca tiveram pagamento lançado no app. Nunca passa de hoje (não projeta cobrança futura).
function datasCobrancaLocacao(loc) {
  if (!loc.dataRetirada) return [];
  return datasCobrancaComRetirada(loc, loc.dataRetirada, fimEfetivoLocacao(loc));
}

// Datas de cobrança de uma locação dentro de um mês 'AAAA-MM' inteiro — ao contrário de
// datasCobrancaLocacao, isso inclui dias ainda por vir dentro do mês (usado pra projetar o
// resultado do mês inteiro no Painel, não só o que já aconteceu até hoje).
function datasCobrancaNoMes(loc, mesAtual) {
  if (!loc.dataRetirada) return [];
  const [ano, mes] = mesAtual.split('-').map(Number);
  const inicioMes = `${mesAtual}-01`;
  const ultimoDiaMes = new Date(ano, mes, 0).getDate();
  const fimMes = `${mesAtual}-${String(ultimoDiaMes).padStart(2, '0')}`;
  const limiteSuperior = loc.status === 'encerrada' ? (loc.dataFimReal || loc.dataFim || fimMes) : fimMes;
  const inicio = loc.dataRetirada > inicioMes ? loc.dataRetirada : inicioMes;
  const fim = limiteSuperior < fimMes ? limiteSuperior : fimMes;
  return datasCobrancaComRetirada(loc, inicio, fim);
}

// Aluguel de cada mês, somando TODOS os contratos (ativos e já encerrados) desde o início da
// operação do veículo: usa o pagamento realmente registrado quando existe, e completa com o
// valor combinado em contrato pras datas de cobrança que nunca tiveram lançamento — é assim que
// o relatório mostra o total desde o início, igual ao estudo de rentabilidade original, sem
// precisar lançar manualmente cada semana de locatários que já saíram.
function aluguelPorMesDoVeiculo(veiculoId) {
  const aluguelPorMes = {};
  const aluguelPorLocacao = {};
  const semanasPorLocacao = {};
  locacoesDoVeiculo(veiculoId).forEach((loc) => {
    const pagamentosDaLocacao = state.pagamentos.filter((p) => p.locacaoId === loc.id && p.status === 'pago');
    const datasRegistradas = new Set();
    pagamentosDaLocacao.forEach((p) => {
      const mes = (p.dataReferencia || '').slice(0, 7);
      if (!mes) return;
      datasRegistradas.add(p.dataReferencia);
      aluguelPorMes[mes] = (aluguelPorMes[mes] || 0) + Number(p.valor || 0);
      aluguelPorLocacao[loc.id] = (aluguelPorLocacao[loc.id] || 0) + Number(p.valor || 0);
    });
    const datasContrato = datasCobrancaLocacao(loc);
    const datasSemRegistro = datasContrato.filter((d) => !datasRegistradas.has(d));
    // aluguelTotalReal: total já conferido por fora (acerto de caução, diárias retidas contando
    // como aluguel, etc.) — quando existe, prevalece sobre o valor semanal cheio, distribuído
    // pelas semanas sem pagamento lançado (as semanas já lançadas continuam valendo o que foi
    // realmente registrado, nunca são substituídas).
    if (loc.aluguelTotalReal != null && datasSemRegistro.length) {
      const faltante = Math.max(0, Number(loc.aluguelTotalReal) - (aluguelPorLocacao[loc.id] || 0));
      const valorPorSemana = faltante / datasSemRegistro.length;
      datasSemRegistro.forEach((dataRef) => {
        const mes = dataRef.slice(0, 7);
        aluguelPorMes[mes] = (aluguelPorMes[mes] || 0) + valorPorSemana;
        aluguelPorLocacao[loc.id] = (aluguelPorLocacao[loc.id] || 0) + valorPorSemana;
      });
    } else {
      datasSemRegistro.forEach((dataRef) => {
        const mes = dataRef.slice(0, 7);
        aluguelPorMes[mes] = (aluguelPorMes[mes] || 0) + Number(loc.valorSemanal || 0);
        aluguelPorLocacao[loc.id] = (aluguelPorLocacao[loc.id] || 0) + Number(loc.valorSemanal || 0);
      });
    }
    semanasPorLocacao[loc.id] = datasContrato.length;
  });
  return { aluguelPorMes, aluguelPorLocacao, semanasPorLocacao };
}

const CORES_OCUPACAO = ['bg-blue-700', 'bg-teal-600', 'bg-indigo-600', 'bg-purple-600', 'bg-cyan-700', 'bg-sky-700'];

// Linha do tempo de ocupação do veículo (pro relatório impresso): cada locação vira um bloco
// colorido proporcional aos dias que durou, com blocos cinza ("parado") nos intervalos sem
// locatário — tudo com base só no histórico real (sem projeção de datas futuras).
function segmentosOcupacao(linhasContratos, inicio, fim) {
  const totalDias = Math.max(1, diffDiasISO(inicio, fim));
  const segmentos = [];
  let cursor = inicio;
  let corIdx = 0;
  linhasContratos.forEach((c) => {
    if (!c.retirada) return;
    if (c.retirada > cursor) {
      segmentos.push({ tipo: 'parado', dias: diffDiasISO(cursor, c.retirada) });
      cursor = c.retirada;
    }
    const fimSegmento = c.ativa ? fim : (c.devolucao && c.devolucao < fim ? c.devolucao : fim);
    const dias = Math.max(1, diffDiasISO(cursor, fimSegmento));
    segmentos.push({ tipo: 'locatario', nome: c.nome, dias, cor: CORES_OCUPACAO[corIdx % CORES_OCUPACAO.length] });
    corIdx++;
    cursor = fimSegmento;
  });
  if (cursor < fim) segmentos.push({ tipo: 'parado', dias: diffDiasISO(cursor, fim) });
  return segmentos.map((s) => ({ ...s, pct: (s.dias / totalDias) * 100 }));
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

  const { aluguelPorMes, aluguelPorLocacao, semanasPorLocacao } = aluguelPorMesDoVeiculo(veiculoId);
  const contratos = [...locacoesDoVeiculo(veiculoId)].sort((a, b) => (a.dataRetirada || '').localeCompare(b.dataRetirada || ''));
  const primeiraLocacao = locacoesDoVeiculo(veiculoId).reduce((maisAntiga, l) => (
    !maisAntiga || (l.dataRetirada || '') < maisAntiga ? l.dataRetirada : maisAntiga
  ), null);
  const inicio = v.dataInicioOperacao || primeiraLocacao || hojeISO();
  const meses = mesesEntre(inicio, hojeISO());

  // A administração só passa a ser cobrada a partir de quando o carro começou a ser administrado
  // (dataInicioOperacao, ou administracaoDesde quando o carro teve um período inicial sem taxa,
  // como o SGY7C19 com o Gustavo). No mês em que isso cai no meio do mês, cobra só a parte
  // proporcional aos dias que restaram — foi assim que o Douglas pagou só R$750 (metade) no mês
  // do Max, que começou dia 16.
  const inicioAdministracao = v.administracaoDesde || inicio;

  let totAluguel = 0, totAdmin = 0, totManut = 0, totParcela = 0, totProtecao = 0, totLiquido = 0;
  const linhas = meses.map((mes) => {
    const aluguel = aluguelPorMes[mes] || 0;
    const manutencao = manuts.filter((m) => (m.dataRealizada || '').startsWith(mes)).reduce((s, m) => s + Number(m.valor || 0), 0);
    const administracaoAtiva = !v.administracaoDesde || mes >= v.administracaoDesde.slice(0, 7);
    let administracao = 0;
    if (ehAdministracao && aluguel > 0 && administracaoAtiva) {
      if (mes === inicioAdministracao.slice(0, 7)) {
        const [ano, mesNum] = mes.split('-').map(Number);
        const diasNoMes = new Date(ano, mesNum, 0).getDate();
        const diaInicio = Number(inicioAdministracao.slice(8, 10));
        administracao = taxaAdmin * ((diasNoMes - diaInicio + 1) / diasNoMes);
      } else {
        administracao = taxaAdmin;
      }
    }
    const parcela = ehAdministracao ? 0 : parcelaMensal;
    const protecao = protecaoMensal;
    const liquido = aluguel - administracao - manutencao - parcela - protecao;
    totAluguel += aluguel; totAdmin += administracao; totManut += manutencao; totParcela += parcela; totProtecao += protecao; totLiquido += liquido;
    return { mes, aluguel, administracao, manutencao, parcela, protecao, liquido };
  });

  const linhasContratos = contratos.map((loc) => {
    const ativa = loc.status === 'ativa';
    const devolucao = ativa ? (loc.dataFim || null) : (loc.dataFimReal || loc.dataFim || null);
    const caucaoTexto = loc.caucaoValor ? `${formatMoeda(loc.caucaoValor)}${loc.caucaoStatus ? ` (${loc.caucaoStatus})` : ''}` : '—';
    return {
      nome: loc.locatarioNome,
      retirada: loc.dataRetirada,
      devolucao,
      ativa,
      semanas: semanasPorLocacao[loc.id] || 0,
      caucaoTexto,
      aluguel: aluguelPorLocacao[loc.id] || 0,
    };
  });

  const hoje = hojeISO();
  const segmentos = segmentosOcupacao(linhasContratos, inicio, hoje);
  const diasParado = segmentos.filter((s) => s.tipo === 'parado').reduce((s, seg) => s + seg.dias, 0);
  const nomeGasto = ehAdministracao ? 'Administração' : 'Financiamento';
  const maxValorMes = Math.max(1, ...linhas.map((l) => Math.max(l.aluguel, ehAdministracao ? l.administracao : l.parcela, l.manutencao + l.protecao)));
  const pctSobreInvestido = v.valorCompra ? (totLiquido / v.valorCompra) * 100 : null;
  const resumoTexto = `${esc(v.placa)} está em operação desde ${formatDateBR(inicio)} (${meses.length} ${meses.length === 1 ? 'mês' : 'meses'}). `
    + `Nesse período passaram ${linhasContratos.length} ${linhasContratos.length === 1 ? 'locatário' : 'locatários'} pelo carro${diasParado > 0 ? `, com ${diasParado} dia(s) parado sem locatário` : ', sem nenhum dia parado'}, e o aluguel bruto recebido somou ${formatMoeda(totAluguel)}. `
    + `Descontando ${nomeGasto.toLowerCase()}, manutenção e proteção veicular (${formatMoeda(totAdmin + totManut + totParcela + totProtecao)} no total), o lucro líquido até hoje é de ${formatMoeda(totLiquido)}`
    + (pctSobreInvestido != null ? `, o equivalente a ${pctSobreInvestido.toFixed(1).replace('.', ',')}% do valor investido na compra (${formatMoeda(v.valorCompra)}).` : '.');

  // Gráfico circular (conic-gradient puro em CSS, sem biblioteca) com o destino do aluguel bruto:
  // quanto virou gasto principal (administração/financiamento), quanto foi manutenção+proteção
  // e quanto sobrou de lucro líquido pro proprietário — os três sempre somam o aluguel bruto.
  const baseAluguel = Math.max(1, totAluguel);
  const gastoPrincipalMes = ehAdministracao ? totAdmin : totParcela;
  const pctGastoPrincipal = Math.max(0, (gastoPrincipalMes / baseAluguel) * 100);
  const pctManutProtecao = Math.max(0, ((totManut + totProtecao) / baseAluguel) * 100);
  const pctLiquidoDonut = Math.max(0, 100 - pctGastoPrincipal - pctManutProtecao);
  const corte1 = pctLiquidoDonut;
  const corte2 = pctLiquidoDonut + pctGastoPrincipal;

  // Diagnóstico do veículo: peças trocadas e reparos fora da revisão normal (pneu, outro) — pra
  // mostrar no relatório o que já foi feito (e o que não foi) além do ciclo oficial de revisões.
  const itensDiagnostico = [...manuts].filter((m) => m.tipo !== 'revisao').sort((a, b) => (a.dataRealizada || '').localeCompare(b.dataRealizada || ''));
  const teveTrocaPneu = itensDiagnostico.some((m) => m.tipo === 'pneu');

  container.innerHTML = `
    <div class="print:hidden">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div></div>
        <div class="flex items-center gap-3">
          ${souAdmin() ? `<button id="btn-trocar-veiculo-relatorio" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">← Escolher outro veículo</button>` : ''}
          <button id="btn-gerar-pdf" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">
            <i data-lucide="file-down" class="h-4 w-4"></i> Gerar PDF
          </button>
        </div>
      </div>

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
      <p class="mt-2 text-[11px] text-slate-400">Desde ${formatDateBR(inicio)} (início da operação deste veículo). Semana sem pagamento lançado no app conta pelo valor combinado em contrato; mês sem locatário não conta aluguel nem ${ehAdministracao ? 'administração' : 'parcela'}.</p>

      <h3 class="mb-2 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-200">Contratos</h3>
      <div class="space-y-2 sm:hidden">
        ${linhasContratos.map((c) => `
          <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium text-slate-800 dark:text-slate-100">${esc(c.nome)}</p>
              <p class="text-sm font-semibold text-slate-900 dark:text-white">${formatMoeda(c.aluguel)}</p>
            </div>
            <p class="mt-1 text-[11px] text-slate-400">${formatDateBR(c.retirada)} → ${c.ativa ? `contrato até ${formatDateBR(c.devolucao)}` : formatDateBR(c.devolucao)} · ${c.semanas} semana(s) · Caução ${c.caucaoTexto}</p>
          </div>`).join('')}
      </div>
      <div class="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block dark:border-slate-800 dark:bg-slate-900">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
            <tr>
              <th class="px-4 py-3">Locatário</th><th class="px-4 py-3">Retirada</th><th class="px-4 py-3">Devolução</th>
              <th class="px-4 py-3">Semanas</th><th class="px-4 py-3">Caução</th><th class="px-4 py-3">Aluguel</th>
            </tr>
          </thead>
          <tbody>
            ${linhasContratos.map((c) => `
              <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                <td class="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">${esc(c.nome)}</td>
                <td class="px-4 py-3">${formatDateBR(c.retirada)}</td>
                <td class="px-4 py-3">${c.ativa ? `<span class="text-slate-400">contrato até</span> ${formatDateBR(c.devolucao)}` : formatDateBR(c.devolucao)}</td>
                <td class="px-4 py-3">${c.semanas}</td>
                <td class="px-4 py-3 text-slate-500 dark:text-slate-400">${c.caucaoTexto}</td>
                <td class="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">${formatMoeda(c.aluguel)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <h3 class="mb-2 mt-6 text-sm font-semibold text-slate-700 dark:text-slate-200">Mês a mês</h3>
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
      <div class="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block dark:border-slate-800 dark:bg-slate-900">
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
    </div>

    <!-- Versão limpa só pra impressão/PDF (sempre clara, sem menu/botões), no estilo do "Estudo de rentabilidade" -->
    <div class="hidden print:block text-black">
      <div class="flex items-center justify-between bg-slate-900 px-5 py-4 text-white">
        <div>
          <p class="text-base font-bold leading-tight tracking-tight">RM VEÍCULOS</p>
          <p class="text-[10px] text-slate-300">Gestão de veículos para motoristas de aplicativo</p>
        </div>
        <div class="text-right">
          <p class="text-sm font-semibold leading-tight">Relatório de rentabilidade</p>
          <p class="text-[10px] text-slate-300">${esc(v.modelo)} · ${esc(v.placa)} · posição em ${formatDateBR(hoje)}</p>
        </div>
      </div>
      <div class="h-1 bg-orange-500"></div>

      <div class="px-0.5 pt-5">
        <h1 class="mb-1 text-xl font-bold text-slate-900">Relatório de rentabilidade do veículo</h1>
        <p class="mb-4 text-xs text-slate-500">Histórico real das locações e resultado financeiro desde o início da operação.</p>

        <div class="mb-5 grid grid-cols-2 gap-x-6 gap-y-2.5 border-l-4 border-orange-500 bg-slate-50 p-3 text-xs break-inside-avoid">
          <div><span class="text-slate-400">Veículo</span><br /><span class="font-semibold">${esc(v.modelo)} · ${esc(v.cor)}</span></div>
          <div><span class="text-slate-400">Placa / Renavam</span><br /><span class="font-semibold">${esc(v.placa)} · ${esc(v.renavam || '—')}</span></div>
          <div><span class="text-slate-400">Proprietário</span><br /><span class="font-semibold">${esc(v.proprietarioNome)}</span></div>
          <div><span class="text-slate-400">${ehAdministracao ? 'Administração' : 'Tipo'}</span><br /><span class="font-semibold">${ehAdministracao ? 'Rafael Abner Machado Maciel · RM Veículos' : 'Veículo próprio'}</span></div>
          <div><span class="text-slate-400">Início da operação</span><br /><span class="font-semibold">${formatDateBR(inicio)}</span></div>
          <div><span class="text-slate-400">Data do relatório</span><br /><span class="font-semibold">${formatDateBR(hoje)}</span></div>
        </div>

        <div class="mb-5 grid grid-cols-4 gap-3 break-inside-avoid">
          <div class="rounded border border-slate-200 p-2.5">
            <p class="text-[10px] text-slate-400">Valor investido</p>
            <p class="text-sm font-bold text-slate-900">${v.valorCompra ? formatMoeda(v.valorCompra) : '—'}</p>
          </div>
          <div class="rounded border border-slate-200 p-2.5">
            <p class="text-[10px] text-slate-400">Aluguel recebido (bruto)</p>
            <p class="text-sm font-bold text-slate-900">${formatMoeda(totAluguel)}</p>
          </div>
          <div class="rounded border border-slate-200 p-2.5">
            <p class="text-[10px] text-slate-400">Gastos</p>
            <p class="text-sm font-bold text-rose-600">-${formatMoeda(totAdmin + totManut + totParcela + totProtecao)}</p>
          </div>
          <div class="rounded border border-emerald-300 bg-emerald-50 p-2.5">
            <p class="text-[10px] text-emerald-700">Lucro líquido</p>
            <p class="text-sm font-bold text-emerald-700">${formatMoeda(totLiquido)}</p>
          </div>
        </div>

        <h2 class="mb-1.5 text-sm font-bold uppercase tracking-wide text-slate-800">Resumo</h2>
        <p class="mb-5 text-xs leading-relaxed text-slate-700">${resumoTexto}</p>

        <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-800">Para onde foi o aluguel</h2>
        <div class="mb-5 flex flex-wrap items-center gap-6 break-inside-avoid">
          <div class="relative h-32 w-32 shrink-0 rounded-full" style="background: conic-gradient(#10b981 0% ${corte1}%, #f97316 ${corte1}% ${corte2}%, #f43f5e ${corte2}% 100%)">
            <div class="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-white text-center">
              <p class="text-[9px] text-slate-400">Lucro líquido</p>
              <p class="text-sm font-bold text-emerald-700">${pctLiquidoDonut.toFixed(0)}%</p>
            </div>
          </div>
          <div class="space-y-1.5 text-xs text-slate-700">
            <p><span class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>Lucro líquido — ${formatMoeda(totLiquido)} (${pctLiquidoDonut.toFixed(0)}%)</p>
            <p><span class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-orange-500"></span>${nomeGasto} — ${formatMoeda(gastoPrincipalMes)} (${pctGastoPrincipal.toFixed(0)}%)</p>
            <p><span class="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-rose-500"></span>Manutenção + proteção — ${formatMoeda(totManut + totProtecao)} (${pctManutProtecao.toFixed(0)}%)</p>
          </div>
        </div>

        <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-800">Ocupação do carro</h2>
        <div class="mb-1 flex h-7 overflow-hidden rounded border border-slate-200 text-[10px] text-white break-inside-avoid">
          ${segmentos.map((s) => s.tipo === 'locatario'
            ? `<div style="flex-grow:${Math.max(s.pct, 0.5)}" class="flex items-center justify-center overflow-hidden whitespace-nowrap px-1 ${s.cor}" title="${esc(s.nome)}">${esc(s.nome)}</div>`
            : `<div style="flex-grow:${Math.max(s.pct, 0.5)}" class="flex items-center justify-center bg-slate-200 text-slate-400"></div>`
          ).join('')}
        </div>
        <p class="mb-5 text-[10px] text-slate-400">De ${formatDateBR(inicio)} até ${formatDateBR(hoje)} · ${diasParado > 0 ? `${diasParado} dia(s) parado sem locatário` : 'nenhum dia parado'} · cinza = carro parado, sem locatário</p>

        <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-800">Contratos</h2>
        <table class="mb-6 w-full border-collapse text-sm break-inside-avoid">
          <thead>
            <tr class="bg-slate-900 text-white">
              <th class="px-2 py-2 text-left font-semibold">Locatário</th>
              <th class="px-2 py-2 text-left font-semibold">Retirada</th>
              <th class="px-2 py-2 text-left font-semibold">Devolução</th>
              <th class="px-2 py-2 text-right font-semibold">Semanas</th>
              <th class="px-2 py-2 text-left font-semibold">Caução</th>
              <th class="px-2 py-2 text-right font-semibold">Aluguel</th>
            </tr>
          </thead>
          <tbody>
            ${linhasContratos.map((c, i) => `
              <tr class="border-b border-slate-200 ${i % 2 === 1 ? 'bg-slate-50' : ''}">
                <td class="px-2 py-1.5">${esc(c.nome)}</td>
                <td class="px-2 py-1.5">${formatDateBR(c.retirada)}</td>
                <td class="px-2 py-1.5">${c.ativa ? `(contrato até) ${formatDateBR(c.devolucao)}` : formatDateBR(c.devolucao)}</td>
                <td class="px-2 py-1.5 text-right">${c.semanas}</td>
                <td class="px-2 py-1.5">${c.caucaoTexto}</td>
                <td class="px-2 py-1.5 text-right font-semibold">${formatMoeda(c.aluguel)}</td>
              </tr>`).join('')}
          </tbody>
        </table>

        <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-800">Entradas e saídas por mês</h2>
        <div class="mb-1 flex items-end gap-2 border-b border-slate-300 pb-0" style="height:90px">
          ${linhas.map((l) => `
            <div class="flex flex-1 flex-col items-center justify-end gap-0.5" style="height:100%">
              <div class="flex items-end gap-0.5" style="height:70px">
                <div style="height:${Math.max(2, (l.aluguel / maxValorMes) * 70)}px" class="w-2 rounded-t bg-blue-700" title="Aluguel"></div>
                <div style="height:${Math.max(2, ((ehAdministracao ? l.administracao : l.parcela) / maxValorMes) * 70)}px" class="w-2 rounded-t bg-orange-500" title="${nomeGasto}"></div>
                <div style="height:${Math.max(2, ((l.manutencao + l.protecao) / maxValorMes) * 70)}px" class="w-2 rounded-t bg-rose-500" title="Gastos"></div>
              </div>
            </div>`).join('')}
        </div>
        <div class="mb-1 flex gap-2">
          ${linhas.map((l) => `<p class="flex-1 text-center text-[9px] text-slate-400">${nomeMes(l.mes)}</p>`).join('')}
        </div>
        <div class="mb-5 flex gap-4 text-[10px] text-slate-500">
          <span class="inline-flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-sm bg-blue-700"></span> Aluguel</span>
          <span class="inline-flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-sm bg-orange-500"></span> ${nomeGasto}</span>
          <span class="inline-flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-sm bg-rose-500"></span> Manutenção + proteção</span>
        </div>

        <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-800">Mês a mês</h2>
        <table class="w-full border-collapse text-sm break-inside-avoid">
          <thead>
            <tr class="bg-slate-900 text-white">
              <th class="px-2 py-2 text-left font-semibold">Mês</th>
              <th class="px-2 py-2 text-right font-semibold">Aluguel</th>
              <th class="px-2 py-2 text-right font-semibold">${nomeGasto}</th>
              <th class="px-2 py-2 text-right font-semibold">Manutenção</th>
              <th class="px-2 py-2 text-right font-semibold">Proteção</th>
              <th class="px-2 py-2 text-right font-semibold">Líquido</th>
            </tr>
          </thead>
          <tbody>
            ${linhas.map((l, i) => `
              <tr class="border-b border-slate-200 ${i % 2 === 1 ? 'bg-slate-50' : ''}">
                <td class="px-2 py-1.5">${nomeMes(l.mes)}</td>
                <td class="px-2 py-1.5 text-right">${formatMoeda(l.aluguel)}</td>
                <td class="px-2 py-1.5 text-right">${formatMoeda(ehAdministracao ? l.administracao : l.parcela)}</td>
                <td class="px-2 py-1.5 text-right">${formatMoeda(l.manutencao)}</td>
                <td class="px-2 py-1.5 text-right">${formatMoeda(l.protecao)}</td>
                <td class="px-2 py-1.5 text-right font-semibold">${formatMoeda(l.liquido)}</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-slate-800 font-bold">
              <td class="px-2 py-2">Total</td>
              <td class="px-2 py-2 text-right">${formatMoeda(totAluguel)}</td>
              <td class="px-2 py-2 text-right">${formatMoeda(ehAdministracao ? totAdmin : totParcela)}</td>
              <td class="px-2 py-2 text-right">${formatMoeda(totManut)}</td>
              <td class="px-2 py-2 text-right">${formatMoeda(totProtecao)}</td>
              <td class="px-2 py-2 text-right">${formatMoeda(totLiquido)}</td>
            </tr>
          </tfoot>
        </table>

        <h2 class="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-slate-800">Diagnóstico do veículo</h2>
        <p class="mb-2 text-xs text-slate-600">Pneus: ${teveTrocaPneu ? 'já teve troca de pneu registrada (ver abaixo).' : 'nenhuma troca de pneu registrada até hoje.'}</p>
        ${itensDiagnostico.length ? `
        <table class="mb-5 w-full border-collapse text-sm break-inside-avoid">
          <thead>
            <tr class="bg-slate-900 text-white">
              <th class="px-2 py-2 text-left font-semibold">Data</th>
              <th class="px-2 py-2 text-left font-semibold">Item</th>
              <th class="px-2 py-2 text-left font-semibold">Km</th>
              <th class="px-2 py-2 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${itensDiagnostico.map((m, i) => `
              <tr class="border-b border-slate-200 ${i % 2 === 1 ? 'bg-slate-50' : ''}">
                <td class="px-2 py-1.5">${formatDateBR(m.dataRealizada)}</td>
                <td class="px-2 py-1.5">${esc(m.tipo === 'pneu' ? `Troca de pneu${m.observacoes ? ` — ${m.observacoes}` : ''}` : (m.observacoes || 'Reparo'))}</td>
                <td class="px-2 py-1.5">${m.kmRealizado ? m.kmRealizado.toLocaleString('pt-BR') : '—'}</td>
                <td class="px-2 py-1.5 text-right">${m.valor ? formatMoeda(m.valor) : 'garantia / sem custo'}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : `<p class="mb-5 text-xs text-slate-400">Nenhuma outra troca de peça ou reparo registrado até hoje, além das revisões.</p>`}

        <p class="mt-4 text-[10px] text-slate-400">Semana sem pagamento lançado no app conta pelo valor combinado em contrato; mês sem locatário não conta aluguel nem ${nomeGasto.toLowerCase()}.</p>
      </div>

      <div class="mt-6 flex items-center justify-between border-t-2 border-orange-500 pt-2 text-[9px] text-slate-400">
        <p>RM VEÍCULOS · Gestão de veículos para motoristas de aplicativo</p>
        <p>${ehAdministracao ? `Administração: Rafael Abner Machado Maciel · Proprietário: ${esc(v.proprietarioNome)}` : `Proprietário: ${esc(v.proprietarioNome)}`}</p>
      </div>
    </div>
  `;
  atualizarIcones();
  qs('#btn-trocar-veiculo-relatorio')?.addEventListener('click', () => { state.relatorioVeiculoId = ''; renderRelatorio(); });
  qs('#btn-gerar-pdf')?.addEventListener('click', () => window.print());
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

// Visualizador simples das páginas de um documento/contrato (fotos guardadas em base64).
function abrirModalPaginas(titulo, paginas) {
  const html = `
    <h2 class="mb-4 text-lg font-semibold text-slate-900 dark:text-white">${esc(titulo)}</h2>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      ${paginas.map((p, i) => `
        <a href="${p.dados}" target="_blank" rel="noopener" class="block overflow-hidden rounded-xl border border-slate-200 hover:border-indigo-300 dark:border-slate-800 dark:hover:border-indigo-700">
          <img src="${p.dados}" alt="Página ${i + 1}" class="aspect-[3/4] w-full object-cover" />
          <p class="truncate bg-slate-50 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">Página ${i + 1}</p>
        </a>`).join('')}
    </div>
    <div class="flex justify-end pt-4">
      <button type="button" id="btn-fechar-paginas" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Fechar</button>
    </div>
  `;
  abrirModal(html);
  qs('#btn-fechar-paginas').addEventListener('click', fecharModal);
}

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
  } else if (dispositivoAdmin()) {
    label.textContent = 'Admin';
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

function htmlProprietariosAprovados() {
  if (!state.proprietariosAprovados.length) {
    return `<p class="text-xs text-slate-400">Nenhum proprietário com acesso aprovado ainda.</p>`;
  }
  return `
    <div class="space-y-2">
      ${state.proprietariosAprovados.map((p) => `
        <div class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-slate-900 dark:text-white">${esc(p.email)}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Placa ${esc(p.placa)}</p>
          </div>
          <button type="button" data-remover-acesso="${p.id}" class="shrink-0 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-500">Remover acesso</button>
        </div>
      `).join('')}
    </div>
  `;
}

function wireProprietariosAprovados() {
  document.querySelectorAll('[data-remover-acesso]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await recusarAcesso(btn.dataset.removerAcesso); toast('Acesso removido.'); } catch (e) { toast(e.message); btn.disabled = false; }
    });
  });
}

function abrirModalConta() {
  const adminPorAparelho = !state.auth.uid && dispositivoAdmin();
  if (state.auth.uid || adminPorAparelho) {
    const pendente = aguardandoAprovacao();
    const html = `
      <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Sua conta</h2>
      <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">${adminPorAparelho ? 'Administrador (neste aparelho)' : `${esc(state.auth.email)} · ${state.auth.perfil?.tipo === 'proprietario' ? `Proprietário${state.auth.perfil.placa ? ' · ' + esc(state.auth.perfil.placa) : ''}` : 'Administrador'}`}</p>
      ${pendente ? `<p class="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">Seu cadastro ainda está aguardando aprovação do administrador.</p>` : ''}
      ${souAdmin() ? `
        <h3 class="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Cadastros pendentes</h3>
        ${htmlAcessosPendentes()}
        <h3 class="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Proprietários com acesso</h3>
        ${htmlProprietariosAprovados()}
      ` : ''}
      <div class="flex justify-end gap-2 pt-4">
        <button type="button" id="btn-fechar-conta" class="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Fechar</button>
        <button type="button" id="btn-sair" class="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-500">Sair</button>
      </div>
    `;
    abrirModal(html);
    qs('#btn-fechar-conta').addEventListener('click', fecharModal);
    qs('#btn-sair').addEventListener('click', async () => {
      try {
        if (adminPorAparelho) { sairAdministrador(); } else { await fazerLogout(); }
        toast('Você saiu.');
        fecharModal();
      } catch (e) { toast(e.message); }
    });
    wireAcessosPendentes();
    wireProprietariosAprovados();
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

// Primeira tela do portão: escolher entre proprietário e administrador, antes de qualquer
// formulário de login — só depois dessa escolha é que aparece o campo certo pra cada um.
function htmlGateEscolha() {
  return `
    <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Entrar</h2>
    <p class="mb-5 text-xs text-slate-400">Como você vai entrar?</p>
    <div class="space-y-2.5">
      <button type="button" id="gate-escolha-proprietario" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:text-slate-200 dark:hover:border-indigo-700">Sou proprietário de veículo</button>
      <button type="button" id="gate-escolha-admin" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:text-slate-200 dark:hover:border-indigo-700">Sou administrador</button>
    </div>
  `;
}

function wireGateEscolha() {
  qs('#gate-escolha-proprietario').addEventListener('click', () => {
    qs('#gate-login-box').innerHTML = htmlGateLogin();
    wireGateLogin();
  });
  qs('#gate-escolha-admin').addEventListener('click', () => {
    qs('#gate-login-box').innerHTML = htmlGateAdmin();
    wireGateAdmin();
  });
}

function htmlGateLogin() {
  return `
    <button type="button" id="gate-voltar" class="mb-3 text-xs font-medium text-slate-400 hover:underline dark:text-slate-500">← Voltar</button>
    <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Entrar como proprietário</h2>
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

function htmlGateAdmin() {
  return `
    <button type="button" id="gate-voltar" class="mb-3 text-xs font-medium text-slate-400 hover:underline dark:text-slate-500">← Voltar</button>
    <h2 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">Acesso do administrador</h2>
    <p class="mb-4 text-xs text-slate-400">Só a senha, sem e-mail. Fica salvo neste aparelho (ou atalho).</p>
    <form id="gate-form-admin" class="space-y-3">
      <label class="block text-xs text-slate-500 dark:text-slate-400">Senha
        <input required type="password" name="senha" autofocus class="mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>
      <button type="submit" class="mt-1 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500">Entrar como administrador</button>
    </form>
  `;
}

function htmlGateCadastro() {
  return `
    <button type="button" id="gate-voltar" class="mb-3 text-xs font-medium text-slate-400 hover:underline dark:text-slate-500">← Voltar</button>
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
  qs('#gate-voltar').addEventListener('click', () => {
    qs('#gate-login-box').innerHTML = htmlGateEscolha();
    wireGateEscolha();
  });
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
  qs('#gate-voltar').addEventListener('click', () => {
    qs('#gate-login-box').innerHTML = htmlGateEscolha();
    wireGateEscolha();
  });
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

function wireGateAdmin() {
  qs('#gate-voltar').addEventListener('click', () => {
    qs('#gate-login-box').innerHTML = htmlGateEscolha();
    wireGateEscolha();
  });
  qs('#gate-form-admin').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('senha') !== SENHA_ADMINISTRADOR) {
      toast('Senha incorreta.');
      return;
    }
    ativarAcessoAdministrador();
  });
}

// Entrar como administrador pela senha do portão (equivalente a abrir o link com ?admin=1):
// grava a lembrança neste aparelho/atalho e já libera o acesso total, sem precisar logar.
function ativarAcessoAdministrador() {
  try { localStorage.setItem('rm-veiculos-admin', '1'); } catch (e) { /* localStorage indisponível */ }
  if (firebaseConfigurado) {
    pararOuvirAcessosPendentes = ouvirAcessosPendentes((lista) => {
      state.acessosPendentes = lista;
      atualizarBotaoConta();
    });
    pararOuvirProprietariosAprovados = ouvirProprietariosAprovados((lista) => {
      state.proprietariosAprovados = lista;
    });
  }
  iniciarOuvintesConformeAuth();
}

// Sair do acesso de administrador deste aparelho — só acontece se a pessoa apertar em "Sair";
// um simples refresh da página nunca desloga ninguém (nem administrador, nem proprietário).
function sairAdministrador() {
  if (pararOuvirAcessosPendentes) { pararOuvirAcessosPendentes(); pararOuvirAcessosPendentes = null; }
  if (pararOuvirProprietariosAprovados) { pararOuvirProprietariosAprovados(); pararOuvirProprietariosAprovados = null; }
  try { localStorage.removeItem('rm-veiculos-admin'); } catch (e) { /* noop */ }
  state.acessosPendentes = [];
  state.proprietariosAprovados = [];
  iniciarOuvintesConformeAuth();
}

function renderGateLogin() {
  qs('#gate-login-box').innerHTML = htmlGateEscolha();
  wireGateEscolha();
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

  // Uid autenticado mas sem perfil (conta sem cadastro de proprietário, ou acesso removido pelo
  // administrador enquanto a pessoa ainda estava logada) — desloga, nunca trata como admin.
  if (state.auth.uid && !dispositivoAdmin() && !state.auth.perfil) {
    toast('Seu acesso foi removido.');
    fazerLogout();
    return;
  }

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
let pararOuvirAcessosPendentes = null;
let pararOuvirProprietariosAprovados = null;

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
    pararOuvirAcessosPendentes = ouvirAcessosPendentes((lista) => {
      state.acessosPendentes = lista;
      atualizarBotaoConta();
    });
    pararOuvirProprietariosAprovados = ouvirProprietariosAprovados((lista) => {
      state.proprietariosAprovados = lista;
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
