// =====================================================================
// Unit test della logica pura (timer, piano sessione, progressione, scarico).
// Si eseguono aprendo tests/index.html dal server locale.
// =====================================================================
import * as L from '../js/logic.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, err: e.message }); }
}
function eq(a, b, msg = '') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} atteso ${B}, ottenuto ${A}`);
}
function ok(v, msg = 'condizione falsa') { if (!v) throw new Error(msg); }

const T0 = Date.UTC(2026, 0, 5, 18, 0); // lunedì 5 gennaio 2026

// Crea una sessione hangboard completata con la configurazione data.
function hangSession(state, ts, { rpe = 8, held = 10, edge, added, pain = false } = {}) {
  const s = L.newSession(state, ts);
  s.hang.edgeMm = edge ?? state.settings.edgeMm;
  s.hang.addedKg = added ?? state.settings.addedKg;
  s.hang.reps = s.hang.reps.map(r => ({ ...r, heldS: held, rpe, done: true }));
  s.pain = pain;
  s.endedAt = ts + 3600e3;
  return s;
}
function withSessions(state, list) { return { ...state, sessions: [...state.sessions, ...list] }; }

// ------------------------------- TIMER -------------------------------
test('timer: residuo calcolato dal timestamp', () => {
  const t = L.createTimer(10000, 1000);
  eq(L.timerRemaining(t, 1000), 10000);
  eq(L.timerRemaining(t, 4000), 7000);
  eq(L.timerRemaining(t, 20000), 0, 'mai negativo');
  ok(L.timerIsDone(t, 11000));
  ok(!L.timerIsDone(t, 10999));
});

test('timer: corretto anche dopo un "salto" (schermo bloccato)', () => {
  const t = L.createTimer(180000, 0);
  // nessun tick per 2 minuti: il residuo è comunque giusto
  eq(L.timerRemaining(t, 120000), 60000);
});

test('timer: pausa congela il residuo, ripresa lo conserva', () => {
  let t = L.createTimer(10000, 0);
  t = L.pauseTimer(t, 3000);
  ok(L.timerIsPaused(t));
  eq(L.timerRemaining(t, 50000), 7000, 'in pausa non scorre');
  ok(!L.timerIsDone(t, 999999), 'in pausa non è mai finito');
  eq(L.timerEndAt(t), null);
  t = L.resumeTimer(t, 50000);
  eq(L.timerRemaining(t, 50000), 7000);
  eq(L.timerRemaining(t, 52000), 5000);
  eq(L.timerEndAt(t), 57000);
});

test('timer: pausa/ripresa idempotenti', () => {
  const t = L.createTimer(5000, 0);
  eq(L.resumeTimer(t, 100), t, 'ripresa di un timer non in pausa');
  const p = L.pauseTimer(t, 1000);
  eq(L.pauseTimer(p, 4000), p, 'doppia pausa');
});

test('timer: elapsed', () => {
  const t = L.createTimer(30000, 0);
  eq(L.timerElapsed(t, 12000), 12000);
});

test('formatClock arrotonda per eccesso', () => {
  eq(L.formatClock(180000), '3:00');
  eq(L.formatClock(179001), '3:00');
  eq(L.formatClock(9100), '0:10');
  eq(L.formatClock(0), '0:00');
  eq(L.formatClock(-5), '0:00');
});

// --------------------------- PIANO SESSIONE ---------------------------
test('piano: sessione normale', () => {
  const s = L.defaultSettings();
  const steps = L.buildSteps(s);
  eq(steps[0].kind, 'warmup');
  eq(steps[1].kind, 'hangConfirm', 'conferma riscaldamento prima dell\'hangboard');
  eq(steps.filter(x => x.kind === 'hang').length, 5);
  eq(steps.filter(x => x.kind === 'hangCountdown').length, 5);
  const rests = steps.filter(x => x.kind === 'hangRest');
  eq(rests.length, 5);
  eq(rests.filter(r => r.auto).length, 4, 'niente recupero a timer dopo l\'ultima');
  eq(rests[0].durationMs, 180000);
  eq(steps.filter(x => x.kind === 'bw').length, 12, '3 giri x 4 esercizi');
  eq(steps.filter(x => x.kind === 'bwRest').length, 2, 'recupero solo tra i giri');
  eq(steps[steps.length - 1].kind, 'summary');
});

test('piano: settimana di scarico senza hangboard', () => {
  const steps = L.buildSteps(L.defaultSettings(), { deload: true });
  ok(!steps.some(L.isHangStep), 'nessun passo hangboard');
  ok(!steps.some(x => x.kind === 'hangConfirm'));
  ok(steps.some(x => x.kind === 'boulder'));
});

test('piano: rispetta le impostazioni', () => {
  const s = { ...L.defaultSettings(), hangReps: 6, hangSec: 7, hangRestSec: 120, bwRounds: 2 };
  const steps = L.buildSteps(s);
  eq(steps.filter(x => x.kind === 'hang').length, 6);
  eq(steps.find(x => x.kind === 'hang').durationMs, 7000);
  eq(steps.find(x => x.kind === 'hangRest').durationMs, 120000);
  eq(steps.filter(x => x.kind === 'bw').length, 8);
});

// ------------------------------ PRECOMPILAZIONE ------------------------------
test('nuova sessione precompilata dalla precedente', () => {
  let st = L.initialState(T0);
  const prev = L.newSession(st, T0);
  prev.bodyweight.rounds[0][0] = { id: 'pullup', value: 7, loadKg: 5, done: true };
  prev.hang.reps[0] = { ...prev.hang.reps[0], rpe: 9, done: true };
  st = withSessions(st, [prev]);
  const next = L.newSession(st, T0 + L.DAY);
  eq(next.bodyweight.rounds[0][0].value, 7);
  eq(next.bodyweight.rounds[0][0].loadKg, 5);
  eq(next.bodyweight.rounds[0][0].done, false);
  eq(next.hang.reps[0].rpe, 9);
  eq(next.hang.reps[1].rpe, 8, 'default = RPE target');
});

// ------------------------------ PROGRESSIONE ------------------------------
test('progressione: nessuna proposta prima di 2 settimane', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY)));
  eq(L.progressionSuggestion(st, T0 + 12 * L.DAY), null);
});

test('progressione: proposta dopo 2 settimane con sessioni complete e RPE <= 8', () => {
  let st = L.initialState(T0);
  st.settings.bodyKg = 70;
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY, { rpe: 7.5 })));
  const sug = L.progressionSuggestion(st, T0 + 15 * L.DAY);
  ok(sug, 'attesa una proposta');
  eq(sug.options.length, 2);
  const load = sug.options.find(o => o.type === 'load');
  const edge = sug.options.find(o => o.type === 'edge');
  // 70 kg: 2% = 1.5, 5% = 3.5, 3% = 2 -> +2 kg
  eq(load.deltaKg, 2);
  ok(load.pct >= 2 && load.pct <= 5, 'incremento tra 2% e 5%');
  eq(edge.toMm, 18);
});

test('progressione: niente proposta se RPE sopra il target', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY, { rpe: 9 })));
  eq(L.progressionSuggestion(st, T0 + 15 * L.DAY), null);
});

test('progressione: niente proposta se una sospensione non è stata tenuta', () => {
  let st = L.initialState(T0);
  const list = [1, 4, 8].map(d => hangSession(st, T0 + d * L.DAY));
  list.push(hangSession(st, T0 + 11 * L.DAY, { held: 8 }));
  st = withSessions(st, list);
  eq(L.progressionSuggestion(st, T0 + 15 * L.DAY), null);
});

test('progressione: troppo poche sessioni', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [1, 8].map(d => hangSession(st, T0 + d * L.DAY)));
  eq(L.progressionSuggestion(st, T0 + 15 * L.DAY), null);
});

test('progressione: bloccata da dolore alle dita', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY)));
  st.events.push({ ts: T0 + 9 * L.DAY, type: 'pain', text: 'dolore' });
  eq(L.progressionSuggestion(st, T0 + 15 * L.DAY), null);
});

test('progressione: applicare il carico NON cambia la tacca (mai entrambe)', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY)));
  const now = T0 + 15 * L.DAY;
  const sug = L.progressionSuggestion(st, now);
  const after = L.applyProgression(st, sug.options.find(o => o.type === 'load'), now);
  eq(after.settings.edgeMm, 20, 'tacca invariata');
  eq(after.settings.addedKg, 2);
  eq(after.progression.lastChangeAt, now);
  eq(after.events.at(-1).type, 'progression');
  // subito dopo il cambio non viene riproposto nulla
  eq(L.progressionSuggestion(after, now + L.DAY), null);
});

test('progressione: applicare la tacca NON cambia il carico (mai entrambe)', () => {
  let st = L.initialState(T0);
  st.settings.addedKg = 4;
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY)));
  const now = T0 + 15 * L.DAY;
  const sug = L.progressionSuggestion(st, now);
  const after = L.applyProgression(st, sug.options.find(o => o.type === 'edge'), now);
  eq(after.settings.addedKg, 4, 'carico invariato');
  eq(after.settings.edgeMm, 18);
});

test('progressione: conta solo sessioni con la configurazione attuale', () => {
  let st = L.initialState(T0);
  // sessioni fatte su una tacca diversa da quella attuale
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY, { edge: 25 })));
  eq(L.progressionSuggestion(st, T0 + 15 * L.DAY), null);
});

test('progressione: nessuna riduzione tacca sotto il minimo', () => {
  let st = L.initialState(T0);
  st.settings.edgeMm = 10;
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY)));
  const sug = L.progressionSuggestion(st, T0 + 15 * L.DAY);
  eq(sug.options.map(o => o.type), ['load']);
});

test('progressione: funziona anche con alleggerimento (carico negativo)', () => {
  let st = L.initialState(T0);
  st.settings.addedKg = -10; // 60 kg effettivi
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY)));
  const sug = L.progressionSuggestion(st, T0 + 15 * L.DAY);
  const load = sug.options.find(o => o.type === 'load');
  // 60 kg: 3% = 1.8 -> 2 kg; alleggerimento passa da -10 a -8
  eq(load.toKg, -8);
});

test('progressione: "rimanda" sospende la proposta per una settimana', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY)));
  const now = T0 + 15 * L.DAY;
  const snoozed = L.snoozeProgression(st, now);
  eq(L.progressionSuggestion(snoozed, now + 3 * L.DAY), null);
  ok(L.progressionSuggestion(snoozed, now + 8 * L.DAY), 'riproposta dopo una settimana');
});

// -------------------------------- SCARICO --------------------------------
test('scarico: nessuna proposta prima di 6 settimane', () => {
  const st = L.initialState(T0);
  const d = L.deloadStatus(st, T0 + 5 * L.WEEK);
  eq(d.propose, false);
  eq(d.active, false);
});

test('scarico: proposta a 6 settimane', () => {
  const st = L.initialState(T0);
  const d = L.deloadStatus(st, T0 + 6 * L.WEEK);
  eq(d.propose, true);
  eq(d.overdue, false);
});

test('scarico: rimandato non si ripropone per una settimana, ma sì dopo le 8', () => {
  let st = L.initialState(T0);
  st = L.snoozeDeload(st, T0 + 6 * L.WEEK);
  eq(L.deloadStatus(st, T0 + 6.5 * L.WEEK).propose, false);
  ok(L.deloadStatus(st, T0 + 7.1 * L.WEEK).propose, 'snooze scaduto');
  st = L.snoozeDeload(st, T0 + 7.9 * L.WEEK);
  const d = L.deloadStatus(st, T0 + 8 * L.WEEK);
  ok(d.propose && d.overdue, 'a 8 settimane si ripropone comunque');
});

test('scarico: settimana attiva e ripartenza del conteggio', () => {
  let st = L.initialState(T0);
  const now = T0 + 6 * L.WEEK;
  st = L.startDeload(st, now);
  const d = L.deloadStatus(st, now + 2 * L.DAY);
  ok(d.active, 'scarico in corso');
  eq(d.propose, false);
  eq(L.deloadStatus(st, now + L.WEEK + L.DAY).active, false, 'finito dopo 7 giorni');
  eq(L.deloadStatus(st, now + 6 * L.WEEK).propose, false, 'conteggio ripartito dalla fine');
  ok(L.deloadStatus(st, now + 7 * L.WEEK).propose, '6 settimane dalla fine dello scarico');
  eq(st.events.at(-1).type, 'deload');
});

test('scarico: durante lo scarico nessuna progressione', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [1, 4, 8, 11].map(d => hangSession(st, T0 + d * L.DAY)));
  st = L.startDeload(st, T0 + 14 * L.DAY);
  eq(L.progressionSuggestion(st, T0 + 15 * L.DAY), null);
});

// ------------------------------ ESPORTAZIONE ------------------------------
test('JSON: esporta e reimporta senza perdite', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [hangSession(st, T0 + L.DAY)]);
  const back = L.fromJSON(L.toJSON(st), T0);
  eq(back.sessions, st.sessions);
  eq(back.settings, st.settings);
});

test('JSON: rifiuta file non validi', () => {
  let threw = false;
  try { L.fromJSON('{"foo":1}', T0); } catch { threw = true; }
  ok(threw);
});

test('CSV: una riga per serie, con intestazione', () => {
  let st = L.initialState(T0);
  const s = hangSession(st, T0 + L.DAY);
  s.boulder.notes = 'chiuso 6b, "tetto"';
  st = withSessions(st, [s]);
  const lines = L.toCSV(st).split('\n');
  ok(lines[0].startsWith('data,sessione,sezione'));
  eq(lines.filter(l => l.includes(',hangboard,')).length, 5);
  ok(lines.some(l => l.includes('"chiuso 6b, ""tetto"""')), 'virgolette e virgole escapate');
});

export default results;
