// Camada de acesso ao Firestore: init do app, CRUD das coleções e listeners em tempo real.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';
import { VEICULOS_SEED, FINANCIAMENTOS_SEED, LOCACOES_SEED, MANUTENCOES_SEED } from './seed-data.js';

export const firebaseConfigurado = !Object.values(firebaseConfig).some((v) => String(v).startsWith('COLE_AQUI'));

let db = null;
let auth = null;
if (firebaseConfigurado) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

// ---- Login (acesso restrito dos proprietários — opcional pro administrador) ----------------
// Sem login, o app funciona igual sempre funcionou (acesso total). Logar só importa pra quem
// tem uma conta de proprietário — aí o app mostra só o veículo e o relatório daquela pessoa.

export function observarAuth(callback) {
  checarDb();
  return onAuthStateChanged(auth, callback);
}

export async function fazerLogin(email, senha) {
  checarDb();
  await signInWithEmailAndPassword(auth, email, senha);
}

export async function fazerLogout() {
  checarDb();
  await signOut(auth);
}

// Perfil do usuário logado (tipo, veículo, status de aprovação) — é um listener (não uma leitura
// única) pra que, se o administrador aprovar o acesso enquanto a pessoa já está com a tela
// aberta, ela passe a ver os dados na hora, sem precisar sair e entrar de novo.
export function ouvirPerfil(uid, callback) {
  checarDb();
  return onSnapshot(doc(db, 'usuarios', uid), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// Autocadastro do proprietário: ele mesmo escolhe e-mail e senha, e informa a placa do veículo
// — o sistema acha o veículo por ela. Fica com status "pendente" até o administrador aprovar
// (ver listarAcessosPendentes / aprovarAcesso / recusarAcesso) — antes disso, o app não mostra
// os dados do veículo pra essa conta.
export async function cadastrarProprietario(email, senha, placa) {
  checarDb();
  const placaNormalizada = placa.trim().toUpperCase();
  const veiculosSnap = await getDocs(query(collection(db, COL.veiculos), where('placa', '==', placaNormalizada)));
  if (veiculosSnap.empty) {
    throw new Error(`Nenhum veículo encontrado com a placa ${placaNormalizada}.`);
  }
  const veiculoId = veiculosSnap.docs[0].id;
  const cred = await createUserWithEmailAndPassword(auth, email, senha);
  await setDoc(doc(db, 'usuarios', cred.user.uid), {
    tipo: 'proprietario',
    veiculoId,
    placa: placaNormalizada,
    email,
    status: 'pendente',
    criadoEm: serverTimestamp(),
  });
  return cred.user.uid;
}

// ---- Aprovação de acessos (administrador) --------------------------------------------------

export function ouvirAcessosPendentes(callback) {
  checarDb();
  return onSnapshot(query(collection(db, 'usuarios'), where('status', '==', 'pendente')), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function aprovarAcesso(uid) {
  checarDb();
  await updateDoc(doc(db, 'usuarios', uid), { status: 'aprovado', aprovadoEm: serverTimestamp() });
}

export async function recusarAcesso(uid) {
  checarDb();
  await deleteDoc(doc(db, 'usuarios', uid));
}

const COL = {
  veiculos: 'veiculos',
  financiamentos: 'financiamentos',
  locacoes: 'locacoes',
  pagamentos: 'pagamentos',
  manutencoes: 'manutencoes',
};

function checarDb() {
  if (!db) throw new Error('Firebase não configurado. Preencha js/firebase-config.js (veja SETUP.md).');
}

// ---- Helpers genéricos -----------------------------------------------------------------------

function ouvirColecao(nomeCol, callback, veiculoId) {
  checarDb();
  const ref = veiculoId ? query(collection(db, nomeCol), where('veiculoId', '==', veiculoId)) : collection(db, nomeCol);
  return onSnapshot(ref, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

async function salvarDoc(nomeCol, dados, id) {
  checarDb();
  if (id) {
    await updateDoc(doc(db, nomeCol, id), { ...dados, atualizadoEm: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(collection(db, nomeCol), {
    ...dados,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  return ref.id;
}

async function excluirDoc(nomeCol, id) {
  checarDb();
  await deleteDoc(doc(db, nomeCol, id));
}

// ---- Veículos ----------------------------------------------------------------------------

export function ouvirVeiculos(callback) { return ouvirColecao(COL.veiculos, callback); }
export function salvarVeiculo(dados, id) { return salvarDoc(COL.veiculos, dados, id); }

export function ouvirVeiculo(veiculoId, callback) {
  checarDb();
  return onSnapshot(doc(db, COL.veiculos, veiculoId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// ---- Financiamentos (parcelas dos veículos próprios) ------------------------------------

export function ouvirFinanciamentos(callback, veiculoId) { return ouvirColecao(COL.financiamentos, callback, veiculoId); }
export function salvarFinanciamento(dados, id) { return salvarDoc(COL.financiamentos, dados, id); }
export function excluirFinanciamento(id) { return excluirDoc(COL.financiamentos, id); }

// ---- Locações (histórico de locatários por veículo) ---------------------------------------

export function ouvirLocacoes(callback, veiculoId) { return ouvirColecao(COL.locacoes, callback, veiculoId); }
export function salvarLocacao(dados, id) { return salvarDoc(COL.locacoes, dados, id); }

export async function encerrarLocacao(id, dataFimReal) {
  checarDb();
  await updateDoc(doc(db, COL.locacoes, id), { status: 'encerrada', dataFimReal, atualizadoEm: serverTimestamp() });
}

// ---- Pagamentos ----------------------------------------------------------------------------

export function ouvirPagamentos(callback, veiculoId) { return ouvirColecao(COL.pagamentos, callback, veiculoId); }
export function salvarPagamento(dados, id) { return salvarDoc(COL.pagamentos, dados, id); }

export async function definirStatusPagamento(id, status) {
  checarDb();
  await updateDoc(doc(db, COL.pagamentos, id), { status, atualizadoEm: serverTimestamp() });
}

export async function excluirPagamento(id) { return excluirDoc(COL.pagamentos, id); }

// ---- Manutenções (revisões, pneus, etc.) --------------------------------------------------

export function ouvirManutencoes(callback, veiculoId) { return ouvirColecao(COL.manutencoes, callback, veiculoId); }
export function salvarManutencao(dados, id) { return salvarDoc(COL.manutencoes, dados, id); }

// ---- Pré-carga da frota (SSF4H14, SMM4D01, SGY7C19) ----------------------------------------
// Idempotente: cada item do seed tem um ID fixo e só é gravado se ainda não existir, então
// clicar em "Carregar frota padrão" de novo nunca apaga edições/status já feitos.

export async function carregarFrotaPadrao() {
  checarDb();
  const contagem = { veiculos: 0, financiamentos: 0, locacoes: 0, manutencoes: 0 };

  const grupos = [
    [COL.veiculos, VEICULOS_SEED, 'veiculos'],
    [COL.financiamentos, FINANCIAMENTOS_SEED, 'financiamentos'],
    [COL.locacoes, LOCACOES_SEED, 'locacoes'],
    [COL.manutencoes, MANUTENCOES_SEED, 'manutencoes'],
  ];

  for (const [nomeCol, itens, chave] of grupos) {
    for (const item of itens) {
      const ref = doc(db, nomeCol, item.id);
      const existente = await getDoc(ref);
      if (!existente.exists()) {
        const { id, ...campos } = item;
        await setDoc(ref, { ...campos, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
        contagem[chave]++;
      }
    }
  }

  return contagem;
}

export async function frotaJaCarregada() {
  checarDb();
  const snap = await getDocs(collection(db, COL.veiculos));
  return !snap.empty;
}
