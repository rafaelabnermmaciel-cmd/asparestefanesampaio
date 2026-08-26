// Camada de acesso ao Firestore: init do app, CRUD das 3 coleções e listeners em tempo real.
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
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { LOCALIDADES_SEED, AGENDA_SEED } from './seed-data.js';

export const firebaseConfigurado = !Object.values(firebaseConfig).some((v) => String(v).startsWith('COLE_AQUI'));

let db = null;
if (firebaseConfigurado) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

const COL = { pessoas: 'pessoas', localidades: 'localidades', agenda: 'agenda' };

function checarDb() {
  if (!db) throw new Error('Firebase não configurado. Preencha js/firebase-config.js (veja SETUP.md).');
}

// ---- Listeners em tempo real -------------------------------------------------------------

export function ouvirPessoas(callback) {
  checarDb();
  return onSnapshot(collection(db, COL.pessoas), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function ouvirLocalidades(callback) {
  checarDb();
  return onSnapshot(collection(db, COL.localidades), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function ouvirAgenda(callback) {
  checarDb();
  return onSnapshot(collection(db, COL.agenda), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ---- Pessoas -------------------------------------------------------------------------------

export async function salvarPessoa(dados, id) {
  checarDb();
  if (id) {
    await updateDoc(doc(db, COL.pessoas, id), { ...dados, atualizadoEm: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(collection(db, COL.pessoas), {
    ...dados,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function definirStatusPessoa(id, status) {
  checarDb();
  await updateDoc(doc(db, COL.pessoas, id), { status, atualizadoEm: serverTimestamp() });
}

// ---- Localidades ---------------------------------------------------------------------------

export async function salvarLocalidade(dados, id) {
  checarDb();
  if (id) {
    await updateDoc(doc(db, COL.localidades, id), { ...dados, atualizadoEm: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(collection(db, COL.localidades), {
    ...dados,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  return ref.id;
}

// ---- Agenda diária -------------------------------------------------------------------------

export async function salvarAtividade(dados, id) {
  checarDb();
  if (id) {
    await updateDoc(doc(db, COL.agenda, id), { ...dados, atualizadoEm: serverTimestamp() });
    return id;
  }
  const ref = await addDoc(collection(db, COL.agenda), {
    ...dados,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function definirStatusAtividade(id, status) {
  checarDb();
  await updateDoc(doc(db, COL.agenda, id), { status, atualizadoEm: serverTimestamp() });
}

// ---- Pré-carga (cronograma 31/08–24/09) ----------------------------------------------------
// Idempotente: cada item do seed tem um ID fixo e só é gravado se ainda não existir, então
// clicar em "Carregar cronograma padrão" de novo nunca apaga edições/status já feitos.

export async function carregarCronogramaPadrao() {
  checarDb();
  let localidadesCriadas = 0;
  let atividadesCriadas = 0;

  for (const loc of LOCALIDADES_SEED) {
    const ref = doc(db, COL.localidades, loc.id);
    const existente = await getDoc(ref);
    if (!existente.exists()) {
      const { id, ...campos } = loc;
      await setDoc(ref, { ...campos, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
      localidadesCriadas++;
    }
  }

  for (const item of AGENDA_SEED) {
    const ref = doc(db, COL.agenda, item.id);
    const existente = await getDoc(ref);
    if (!existente.exists()) {
      const { id, ...campos } = item;
      await setDoc(ref, { ...campos, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
      atividadesCriadas++;
    }
  }

  return { localidadesCriadas, atividadesCriadas };
}

export async function cronogramaJaCarregado() {
  checarDb();
  const snap = await getDocs(collection(db, COL.agenda));
  return !snap.empty;
}
