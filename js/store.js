// =====================================================================
// store.js — persistenza locale nel browser del telefono (localStorage).
// Nessun server, nessun login: i dati restano sul dispositivo.
// Per sicurezza conviene fare ogni tanto un backup JSON dalle Impostazioni.
// =====================================================================
import { initialState, normalizeState } from './logic.js';

const KEY_STATE = 'scheda-arrampicata.state.v1';
const KEY_RUN = 'scheda-arrampicata.run.v1'; // sessione in corso (per riprenderla)

export function loadState(now) {
  try {
    const raw = localStorage.getItem(KEY_STATE);
    if (raw) return normalizeState(JSON.parse(raw), now);
  } catch (e) {
    console.warn('Impossibile leggere i dati salvati', e);
  }
  return initialState(now);
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY_STATE, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Salvataggio non riuscito', e);
    return false;
  }
}

export function loadRun() {
  try {
    const raw = localStorage.getItem(KEY_RUN);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveRun(run) {
  try {
    if (run) localStorage.setItem(KEY_RUN, JSON.stringify(run));
    else localStorage.removeItem(KEY_RUN);
  } catch (e) {
    console.error('Salvataggio sessione in corso non riuscito', e);
  }
}

// Chiede al browser di non cancellare mai questi dati per liberare spazio.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* non supportato: pazienza */ }
}
