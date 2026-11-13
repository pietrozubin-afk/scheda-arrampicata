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
  ok(lines[0].startsWith('data,sessione,tipo,sezione'));
  eq(lines.filter(l => l.includes(',hangboard,')).length, 5);
  ok(lines.some(l => l.includes('"chiuso 6b, ""tetto"""')), 'virgolette e virgole escapate');
});

test('CSV: include tipo di sessione, progetti e volume', () => {
  let st = L.initialState(T0);
  const a = L.newSession(st, T0 + L.DAY, { type: 'A' });
  a.boulder.projects[0] = { level: 5, style: 'Placca', attempts: 4, outcome: 'sent', notes: '' };
  const b = L.newSession(st, T0 + 2 * L.DAY, { type: 'B' });
  L.volumeAdd(b.boulder, 4, true, 1); L.volumeAdd(b.boulder, 4, false, 2); L.volumeAdd(b.boulder, 3, true, 3);
  st = withSessions(st, [a, b]);
  const lines = L.toCSV(st).split('\n');
  ok(lines[0].includes(',tipo,'), 'colonna tipo');
  ok(lines.some(l => l.includes(',A,boulder progetto,') && l.includes(',4,tentativi,') && l.includes('Chiuso · Placca')));
  ok(lines.some(l => l.includes(',B,boulder volume,livello 4,,1,chiusi')));
  ok(lines.some(l => l.includes(',B,boulder volume,livello 4,,1,non chiusi')));
  ok(lines.some(l => l.includes(',B,boulder volume,livello 3,,1,chiusi')));
});

// ============================ SESSIONI A / B ============================
test('alternanza: prima sessione in assoluto -> A', () => {
  eq(L.suggestType(L.initialState(T0)), 'A');
});

test('alternanza: dopo A propone B e dopo B propone A', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [L.newSession(st, T0 + L.DAY, { type: 'A' })]);
  eq(L.suggestType(st), 'B');
  st = withSessions(st, [L.newSession(st, T0 + 2 * L.DAY, { type: 'B' })]);
  eq(L.suggestType(st), 'A');
});

test('alternanza: scarico e non classificate non contano', () => {
  let st = L.initialState(T0);
  st = withSessions(st, [L.newSession(st, T0 + L.DAY, { type: 'B' })]);
  st = withSessions(st, [L.newSession(st, T0 + 2 * L.DAY, { type: 'S' })]);
  st = withSessions(st, [{ ...L.newSession(st, T0 + 3 * L.DAY), type: 'U' }]);
  eq(L.suggestType(st), 'A', 'riferimento: ultima B');
});

test('piano A: 3 sospensioni, boulder progetti 35 min', () => {
  const s = L.defaultSettings();
  const steps = L.buildSteps(s, { type: 'A' });
  eq(steps.filter(x => x.kind === 'hang').length, 3);
  eq(steps.filter(x => x.kind === 'hangRest' && x.last).length, 1);
  const b = steps.find(x => x.kind === 'boulder');
  eq(b.mode, 'project');
  eq(b.durationMs, 35 * L.MIN);
  eq(steps.filter(x => x.kind === 'bw').length, 12, 'corpo libero identico');
});

test('piano B: 5 sospensioni, boulder volume 30 min', () => {
  const steps = L.buildSteps(L.defaultSettings(), { type: 'B' });
  eq(steps.filter(x => x.kind === 'hang').length, 5);
  const b = steps.find(x => x.kind === 'boulder');
  eq(b.mode, 'volume');
  eq(b.durationMs, 30 * L.MIN);
});

test('riscaldamento A con voce finale "1–2 blocchi di livello 4"', () => {
  const s = L.defaultSettings();
  const a = L.warmupItems(s, 'A');
  const b = L.warmupItems(s, 'B');
  eq(a.length, b.length + 1);
  eq(a.at(-1), '1–2 blocchi di livello 4');
  const st = L.initialState(T0);
  eq(L.newSession(st, T0, { type: 'A' }).warmup.checks.length, a.length);
  eq(L.newSession({ ...st, settings: { ...s, volumeLevel: 5 } }, T0, { type: 'A' }).warmup.checks.length, a.length);
  eq(L.warmupItems({ ...s, volumeLevel: 5 }, 'A').at(-1), '1–2 blocchi di livello 5', 'segue il livello volume');
});

test('nuova sessione A: 3 sospensioni e un progetto al livello progetto', () => {
  const st = L.initialState(T0);
  st.settings.projectLevel = 6;
  const s = L.newSession(st, T0, { type: 'A' });
  eq(s.type, 'A');
  eq(s.hang.reps.length, 3);
  eq(s.boulder.projects.length, 1);
  eq(s.boulder.projects[0].level, 6);
  eq(s.boulder.log, []);
});

test('nuova sessione di scarico: niente hangboard, tipo S', () => {
  const s = L.newSession(L.initialState(T0), T0, { type: 'S' });
  eq(s.type, 'S');
  eq(s.hang, null);
  eq(s.deload, true);
});

test('A: tentativi e chiusure dei progetti', () => {
  const s = L.newSession(L.initialState(T0), T0, { type: 'A' });
  const p = s.boulder.projects[0];
  L.addAttempt(p); L.addAttempt(p); L.addAttempt(p);
  eq(p.attempts, 3);
  L.addAttempt(p, -1);
  eq(p.attempts, 2, 'correzione −1');
  L.addAttempt(p, -5);
  eq(p.attempts, 0, 'mai negativo');
  p.attempts = 5; p.outcome = 'sent';
  s.boulder.projects.push({ ...L.newProject(L.defaultSettings()), attempts: 4, outcome: 'sections' });
  eq(L.projectStats(s), { projects: 2, attempts: 9, sends: 1, sections: 1 });
});

test('B: conteggio blocchi chiusi / non chiusi per livello', () => {
  const s = L.newSession(L.initialState(T0), T0, { type: 'B' });
  for (let i = 0; i < 9; i++) L.volumeAdd(s.boulder, 4, true, i);
  L.volumeAdd(s.boulder, 4, false, 10);
  L.volumeAdd(s.boulder, 3, true, 11);
  L.volumeAdd(s.boulder, 5, false, 12);
  const v = L.volumeStats(s);
  eq(v.total, 12);
  eq(v.sent, 10);
  eq(v.notSent, 2);
  eq(v.byLevel[4], { sent: 9, notSent: 1 });
  eq(v.byLevel[3], { sent: 1, notSent: 0 });
  eq(v.byLevel[5], { sent: 0, notSent: 1 });
  const p = L.volumeProgress(s, L.defaultSettings());
  ok(p.reachedMin && !p.reachedMax, '12 blocchi: obiettivo minimo raggiunto');
  eq(p.pct, 60);
});

test('B: annulla ultimo blocco e livelli fuori scala', () => {
  const s = L.newSession(L.initialState(T0), T0, { type: 'B' });
  L.volumeAdd(s.boulder, 4, true, 1);
  L.volumeAdd(s.boulder, 9, false, 2);
  eq(s.boulder.log[1].level, 7, 'scala palestra 1–7');
  L.volumeUndo(s.boulder);
  eq(L.volumeStats(s).total, 1);
  L.volumeUndo(s.boulder); L.volumeUndo(s.boulder);
  eq(L.volumeStats(s).total, 0, 'annulla su registro vuoto non rompe');
});

test('timer recupero tentativi (A): 3 min di default, configurabile', () => {
  const s = L.defaultSettings();
  const t = L.restTimerFor(s, 'A', 1000);
  eq(t.durationMs, 180000);
  eq(L.timerRemaining(t, 61000), 120000);
  ok(L.timerIsDone(t, 181000));
  eq(L.restTimerFor({ ...s, attemptRestSec: 240 }, 'A', 0).durationMs, 240000);
});

test('timer recupero volume (B): 90 s di default', () => {
  const t = L.restTimerFor(L.defaultSettings(), 'B', 0);
  eq(t.durationMs, 90000);
});

test('timer recupero: nuovo tentativo riparte da capo, resta corretto in background', () => {
  const s = L.defaultSettings();
  let t = L.restTimerFor(s, 'A', 0);
  t = L.restTimerFor(s, 'A', 100000); // nuovo tentativo a metà recupero
  eq(L.timerRemaining(t, 100000), 180000);
  eq(L.timerRemaining(t, 250000), 30000, 'nessun tick per 150 s: residuo giusto');
  t = L.pauseTimer(t, 250000);
  eq(L.timerRemaining(t, 999999), 30000);
});

test('salta hangboard oggi (A): registrato nello storico', () => {
  let st = L.initialState(T0);
  const s = L.newSession(st, T0, { type: 'A' });
  st = L.skipHangboard(st, s, T0 + 60000);
  ok(s.hang.skipped);
  eq(st.events.at(-1).type, 'skip');
  ok(st.events.at(-1).text.includes('Sessione A'));
});

test('progressione: conta sessioni A e B insieme', () => {
  let st = L.initialState(T0);
  const list = [1, 4, 8, 11].map((d, i) => {
    const s = hangSession(st, T0 + d * L.DAY);
    return { ...s, type: i % 2 ? 'B' : 'A' };
  });
  st = withSessions(st, list);
  const sug = L.progressionSuggestion(st, T0 + 15 * L.DAY);
  ok(sug, 'attesa una proposta');
  eq(sug.sessions, 4);
});

test('progressione: le sessioni A con hangboard saltato non contano', () => {
  let st = L.initialState(T0);
  const list = [1, 4, 8].map(d => hangSession(st, T0 + d * L.DAY));
  const skippedA = hangSession(st, T0 + 11 * L.DAY);
  skippedA.type = 'A';
  skippedA.hang.skipped = true;
  st = withSessions(st, [...list, skippedA]);
  // 3 valide: basta per la soglia minima, ma la A saltata non deve essere contata
  eq(L.progressionSuggestion(st, T0 + 15 * L.DAY).sessions, 3);
  st.settings.progressionMinSessions = 4;
  eq(L.progressionSuggestion(st, T0 + 15 * L.DAY), null);
});

// =============================== MIGRAZIONE ===============================
// Dati salvati dalla versione 1 dell'app (prima di A/B), così come erano.
function v1Data() {
  return {
    version: 1,
    programStart: T0,
    settings: { ...L.defaultSettings(), bodyKg: 68, addedKg: 3, sound: true },
    sessions: [
      {
        id: 's1', date: T0 + L.DAY, endedAt: T0 + L.DAY + 3600e3, deload: false, pain: false,
        warmup: { done: true, checks: [true, true, false, false, false, false, false, false] },
        hang: { edgeMm: 20, grip: 'Half crimp', bodyKg: 68, addedKg: 3, interrupted: null, skipped: false,
          reps: [{ targetS: 10, heldS: 10, rpe: 8, done: true }] },
        boulder: { elapsedMs: 1800000, notes: '6b chiuso' },
        bodyweight: { rounds: [[{ id: 'pullup', value: 7, loadKg: 0, done: true }]] },
      },
      {
        id: 's2', date: T0 + 30 * L.DAY, endedAt: null, deload: true, pain: false,
        warmup: { done: true, checks: [] }, hang: null,
        boulder: { elapsedMs: 900000, notes: '' }, bodyweight: { rounds: [] },
      },
    ],
    events: [{ ts: T0 + 2 * L.DAY, type: 'pain', text: 'Dolore alle dita' }],
    progression: { lastChangeAt: T0, snoozeUntil: 0 },
    deload: { lastEndAt: T0, activeUntil: 0, snoozeUntil: 0 },
  };
}

test('migrazione v1 -> v2: sessioni non classificate, scarico riconosciuto', () => {
  const st = L.normalizeState(v1Data(), T0 + 40 * L.DAY);
  eq(st.version, L.STATE_VERSION);
  eq(st.sessions.map(s => s.type), ['U', 'S']);
  eq(st.sessions[0].boulder.projects, []);
  eq(st.sessions[0].boulder.log, []);
});

test('migrazione v1 -> v2: nessun dato perso', () => {
  const old = v1Data();
  const st = L.normalizeState(JSON.parse(JSON.stringify(old)), T0 + 40 * L.DAY);
  const s = st.sessions[0];
  eq(s.hang, old.sessions[0].hang);
  eq(s.warmup, old.sessions[0].warmup);
  eq(s.bodyweight, old.sessions[0].bodyweight);
  eq(s.boulder.notes, '6b chiuso');
  eq(s.boulder.elapsedMs, 1800000);
  eq(st.events, old.events);
  eq(st.settings.bodyKg, 68);
  eq(st.settings.addedKg, 3);
  eq(st.settings.projectLevel, 5, 'nuove impostazioni con default');
  eq(st.settings.volumeLevel, 4);
});

test('migrazione: idempotente e stabile dopo salvataggio', () => {
  const once = L.normalizeState(v1Data(), T0);
  const twice = L.normalizeState(JSON.parse(JSON.stringify(once)), T0);
  eq(twice, once);
});

test('migrazione: backup JSON v1 importato correttamente', () => {
  const backup = JSON.stringify({ app: 'scheda-arrampicata', state: v1Data() });
  const st = L.fromJSON(backup, T0);
  eq(st.sessions.length, 2);
  eq(st.sessions[0].type, 'U');
});

test('migrazione: le sessioni migrate contano ancora per la progressione', () => {
  let st = L.normalizeState(v1Data(), T0);
  st.sessions = [];
  st.events = []; // il dolore dei dati v1 bloccherebbe la progressione
  st.settings.addedKg = 0;
  st = withSessions(st, [1, 4, 8, 11].map(d => ({ ...hangSession(st, T0 + d * L.DAY), type: undefined })));
  st = L.normalizeState(st, T0);
  eq(st.sessions.map(s => s.type), ['U', 'U', 'U', 'U']);
  ok(L.progressionSuggestion(st, T0 + 15 * L.DAY), 'proposta presente');
});

test('migrazione: sessione in corso salvata dalla versione precedente', () => {
  const oldRun = { session: v1Data().sessions[0], steps: [], idx: 3, timer: null, hollow: null, painStopped: false, flags: {} };
  const run = L.migrateRun(oldRun);
  eq(run.session.type, 'U');
  eq(run.idx, 3);
  eq(run.rest, null);
  eq(run.session.boulder.log, []);
  eq(L.migrateRun(null), null);
});

test('alternanza dopo la migrazione: parte da A', () => {
  eq(L.suggestType(L.normalizeState(v1Data(), T0)), 'A');
});

// ============================ ORDINE CORPO LIBERO ============================
test('corpo libero: ordine trazioni → addominali → piegamenti → affondi', () => {
  eq(L.BW_EXERCISES.map(e => e.id), ['pullup', 'hollow', 'pushup', 'lunge']);
  const s = L.newSession(L.initialState(T0), T0, { type: 'B' });
  s.bodyweight.rounds.forEach(r => eq(r.map(e => e.id), ['pullup', 'hollow', 'pushup', 'lunge']));
  const steps = L.buildSteps(L.defaultSettings(), { type: 'B' }).filter(x => x.kind === 'bw' && x.round === 0);
  eq(steps.map(x => L.BW_EXERCISES[x.exIndex].id), ['pullup', 'hollow', 'pushup', 'lunge']);
});

test('corpo libero: precompilazione corretta da una sessione col vecchio ordine', () => {
  let st = L.initialState(T0);
  const old = L.newSession(st, T0);
  // vecchio ordine: trazioni, piegamenti, hollow, affondi
  old.bodyweight.rounds = [[
    { id: 'pullup', value: 7, loadKg: 0, done: true },
    { id: 'pushup', value: 14, loadKg: 0, done: true },
    { id: 'hollow', value: 28, loadKg: 0, done: true },
    { id: 'lunge', value: 9, loadKg: 0, done: true },
  ]];
  st = withSessions(st, [old]);
  const next = L.newSession(st, T0 + L.DAY);
  eq(next.bodyweight.rounds[0].map(e => [e.id, e.value]), [['pullup', 7], ['hollow', 28], ['pushup', 14], ['lunge', 9]]);
  eq(L.bwTotal(old, 'pushup'), 14, 'totali per id');
});

export default results;
