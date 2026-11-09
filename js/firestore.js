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
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { VEICULOS_SEED, FINANCIAMENTOS_SEED, LOCACOES_SEED, MANUTENCOES_SEED } from './seed-data.js';

export const firebaseConfigurado = !Object.values(firebaseConfig).some((v) => String(v).startsWith('COLE_AQUI'));

let db = null;
if (firebaseConfigurado) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
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

function ouvirColecao(nomeCol, callback) {
  checarDb();
  return onSnapshot(collection(db, nomeCol), (snap) => {
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

// ---- Financiamentos (parcelas dos veículos próprios) ------------------------------------

export function ouvirFinanciamentos(callback) { return ouvirColecao(COL.financiamentos, callback); }
export function salvarFinanciamento(dados, id) { return salvarDoc(COL.financiamentos, dados, id); }
export function excluirFinanciamento(id) { return excluirDoc(COL.financiamentos, id); }

// ---- Locações (histórico de locatários por veículo) ---------------------------------------

export function ouvirLocacoes(callback) { return ouvirColecao(COL.locacoes, callback); }
export function salvarLocacao(dados, id) { return salvarDoc(COL.locacoes, dados, id); }

export async function encerrarLocacao(id, dataFimReal) {
  checarDb();
  await updateDoc(doc(db, COL.locacoes, id), { status: 'encerrada', dataFimReal, atualizadoEm: serverTimestamp() });
}

// ---- Pagamentos ----------------------------------------------------------------------------

export function ouvirPagamentos(callback) { return ouvirColecao(COL.pagamentos, callback); }
export function salvarPagamento(dados, id) { return salvarDoc(COL.pagamentos, dados, id); }

export async function definirStatusPagamento(id, status) {
  checarDb();
  await updateDoc(doc(db, COL.pagamentos, id), { status, atualizadoEm: serverTimestamp() });
}

export async function excluirPagamento(id) { return excluirDoc(COL.pagamentos, id); }

// ---- Manutenções (revisões, pneus, etc.) --------------------------------------------------

export function ouvirManutencoes(callback) { return ouvirColecao(COL.manutencoes, callback); }
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
