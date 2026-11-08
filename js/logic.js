// =====================================================================
// logic.js — logica pura dell'app (nessun accesso al DOM).
// Tutte le funzioni ricevono "now" (timestamp in ms) come parametro,
// così si possono testare senza dipendere dall'orologio reale.
// =====================================================================

export const SEC = 1000;
export const MIN = 60 * SEC;
export const DAY = 24 * 60 * MIN;
export const WEEK = 7 * DAY;

// ---------------------------------------------------------------------
// Impostazioni predefinite (tutte modificabili dalla schermata Impostazioni)
// ---------------------------------------------------------------------
export function defaultSettings() {
  return {
    bodyKg: 70,              // peso corporeo
    // Riscaldamento
    warmupMin: 10,
    warmupBlocks: 6,         // blocchi facili progressivi
    // Hangboard (Max Hangs)
    hangReps: 5,
    hangSec: 10,
    hangRestSec: 180,        // recupero tra sospensioni (2–3 min)
    countdownSec: 3,         // conto alla rovescia 3-2-1
    edgeMm: 20,              // tacca
    grip: 'Half crimp',
    addedKg: 0,              // >0 zavorra, <0 alleggerimento (elastico/carrucola)
    rpeTarget: 8,
    // Boulder
    boulderMin: 30,
    boulderLimitMin: 15,     // primi minuti dedicati ai blocchi al limite
    // Corpo libero
    bwRounds: 3,
    bwRoundRestSec: 90,      // recupero tra un giro e l'altro
    // Progressione
    progressionMinWeeks: 2,  // proponi dopo almeno 2 settimane...
    progressionMinSessions: 3, // ...e almeno 3 sessioni con la stessa configurazione
    edgeStepMm: 2,           // riduzione tacca proposta
    minEdgeMm: 10,
    // Scarico
    deloadMinWeeks: 6,
    deloadMaxWeeks: 8,
    // Feedback
    vibration: true,
  };
}

// Esercizi a corpo libero: "unit" indica se si registrano ripetizioni o secondi.
export const BW_EXERCISES = [
  { id: 'pullup', name: 'Trazioni', unit: 'rip', min: 5, max: 8, loadable: true },
  { id: 'pushup', name: 'Piegamenti', unit: 'rip', min: 10, max: 15, loadable: true },
  { id: 'hollow', name: 'Hollow body hold', unit: 's', min: 20, max: 30, loadable: false },
  { id: 'lunge', name: 'Affondi laterali', unit: 'rip/lato', min: 8, max: 10, loadable: true },
];

export const WARMUP_MOBILITY = ['Mobilità spalle', 'Mobilità polsi e dita'];

// Stato iniziale dell'app al primo avvio.
export function initialState(now) {
  return {
    version: 1,
    programStart: now,
    settings: defaultSettings(),
    sessions: [],
    events: [],              // {ts, type: 'pain'|'progression'|'deload', text}
    progression: { lastChangeAt: now, snoozeUntil: 0 },
    deload: { lastEndAt: now, activeUntil: 0, snoozeUntil: 0 },
  };
}

// Unisce uno stato caricato (es. da backup vecchio) con i default,
// così i campi aggiunti in versioni successive non mancano mai.
export function normalizeState(raw, now) {
  const base = initialState(now);
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    progression: { ...base.progression, ...(raw.progression || {}) },
    deload: { ...base.deload, ...(raw.deload || {}) },
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    events: Array.isArray(raw.events) ? raw.events : [],
  };
}

// ---------------------------------------------------------------------
// TIMER basato su timestamp: il tempo resta corretto anche se la pagina
// viene messa in pausa dal sistema (schermo bloccato, app in background),
// perché il residuo si calcola sempre da "now" e non contando i tick.
// ---------------------------------------------------------------------
export function createTimer(durationMs, now) {
  return { durationMs, startedAt: now, pausedRemaining: null };
}

export function timerRemaining(t, now) {
  if (!t) return 0;
  if (t.pausedRemaining != null) return t.pausedRemaining;
  return Math.max(0, t.startedAt + t.durationMs - now);
}

export function timerElapsed(t, now) {
  return t ? t.durationMs - timerRemaining(t, now) : 0;
}

export function timerIsPaused(t) {
  return !!t && t.pausedRemaining != null;
}

export function timerIsDone(t, now) {
  return !!t && !timerIsPaused(t) && timerRemaining(t, now) <= 0;
}

// Istante (timestamp) in cui il timer finirà; null se in pausa.
export function timerEndAt(t) {
  if (!t || timerIsPaused(t)) return null;
  return t.startedAt + t.durationMs;
}

export function pauseTimer(t, now) {
  if (!t || timerIsPaused(t)) return t;
  return { ...t, pausedRemaining: timerRemaining(t, now) };
}

export function resumeTimer(t, now) {
  if (!t || !timerIsPaused(t)) return t;
  return {
    durationMs: t.durationMs,
    startedAt: now - (t.durationMs - t.pausedRemaining),
    pausedRemaining: null,
  };
}

// Formatta i millisecondi come m:ss (arrotondando per eccesso, come un countdown).
export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / SEC);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------
// PIANO DELLA SESSIONE: elenco ordinato di "passi" che la sessione guidata
// percorre uno dopo l'altro.
//   auto: true  -> allo scadere del timer si passa da soli al passo successivo
//   auto: false -> il timer è indicativo, si avanza con un tap
// ---------------------------------------------------------------------
export function buildSteps(settings, { deload = false } = {}) {
  const s = settings;
  const steps = [];
  steps.push({ kind: 'warmup', durationMs: s.warmupMin * MIN, auto: false });

  if (!deload) {
    steps.push({ kind: 'hangConfirm' });
    steps.push({ kind: 'hangSetup' });
    for (let rep = 0; rep < s.hangReps; rep++) {
      steps.push({ kind: 'hangCountdown', rep, durationMs: s.countdownSec * SEC, auto: true });
      steps.push({ kind: 'hang', rep, durationMs: s.hangSec * SEC, auto: true });
      const last = rep === s.hangReps - 1;
      // Dopo l'ultima sospensione non serve recupero: resta solo la registrazione dell'RPE.
      steps.push(last
        ? { kind: 'hangRest', rep, last: true }
        : { kind: 'hangRest', rep, durationMs: s.hangRestSec * SEC, auto: true });
    }
  }

  steps.push({ kind: 'boulder', durationMs: s.boulderMin * MIN, auto: false });

  for (let round = 0; round < s.bwRounds; round++) {
    BW_EXERCISES.forEach((ex, i) => steps.push({ kind: 'bw', round, exIndex: i }));
    if (round < s.bwRounds - 1) {
      steps.push({ kind: 'bwRest', round, durationMs: s.bwRoundRestSec * SEC, auto: true });
    }
  }
  steps.push({ kind: 'summary' });
  return steps;
}

export function isHangStep(step) {
  return !!step && ['hangSetup', 'hangCountdown', 'hang', 'hangRest'].includes(step.kind);
}

// Indice del primo passo di un certo tipo (con filtro opzionale).
export function findStep(steps, pred) {
  return steps.findIndex(pred);
}

// ---------------------------------------------------------------------
// NUOVA SESSIONE con valori precompilati dalla sessione precedente
// ---------------------------------------------------------------------
export function lastSession(state, pred = () => true) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    if (pred(state.sessions[i])) return state.sessions[i];
  }
  return null;
}

export function newSession(state, now, { deload = false } = {}) {
  const s = state.settings;
  const prevHang = lastSession(state, x => x.hang && !x.hang.skipped && x.hang.reps.length);
  const prevBw = lastSession(state, x => x.bodyweight && x.bodyweight.rounds.length);

  const hangReps = [];
  for (let i = 0; i < s.hangReps; i++) {
    const prevRpe = prevHang?.hang.reps[i]?.rpe;
    hangReps.push({ targetS: s.hangSec, heldS: null, rpe: prevRpe ?? s.rpeTarget, done: false });
  }

  const rounds = [];
  for (let r = 0; r < s.bwRounds; r++) {
    rounds.push(BW_EXERCISES.map(ex => {
      // Precompila con lo stesso giro della sessione precedente (o con l'ultimo giro disponibile).
      const prevRounds = prevBw?.bodyweight.rounds || [];
      const prevRound = prevRounds[r] || prevRounds[prevRounds.length - 1];
      const prev = prevRound?.find(e => e.id === ex.id);
      return { id: ex.id, value: prev?.value ?? ex.min, loadKg: prev?.loadKg ?? 0, done: false };
    }));
  }

  return {
    id: `s${now}`,
    date: now,
    endedAt: null,
    deload,
    pain: false,
    warmup: { done: false, checks: Array(WARMUP_MOBILITY.length + s.warmupBlocks).fill(false) },
    hang: deload ? null : {
      edgeMm: s.edgeMm,
      grip: s.grip,
      bodyKg: s.bodyKg,
      addedKg: s.addedKg,
      reps: hangReps,
      interrupted: null,
      skipped: false,
    },
    boulder: { elapsedMs: 0, notes: '' },
    bodyweight: { rounds },
  };
}

// Statistiche hangboard di una sessione (per storico e progressione).
export function hangStats(session) {
  const h = session?.hang;
  if (!h || h.skipped) return null;
  const done = h.reps.filter(r => r.done);
  if (!done.length) return null;
  const completed = done.filter(r => (r.heldS ?? r.targetS) >= r.targetS).length;
  const avgRpe = done.reduce((a, r) => a + (Number(r.rpe) || 0), 0) / done.length;
  return {
    reps: done.length,
    planned: h.reps.length,
    completed,
    allCompleted: completed === h.reps.length,
    avgRpe,
    totalKg: round1(h.bodyKg + h.addedKg),
    addedKg: h.addedKg,
    edgeMm: h.edgeMm,
  };
}

// Totale ripetizioni di un esercizio a corpo libero in una sessione.
export function bwTotal(session, exId) {
  const rounds = session?.bodyweight?.rounds || [];
  let total = 0;
  let any = false;
  for (const round of rounds) {
    const e = round.find(x => x.id === exId);
    if (e && e.done) { total += Number(e.value) || 0; any = true; }
  }
  return any ? total : null;
}

// ---------------------------------------------------------------------
// PROGRESSIONE: dopo 2–3 settimane con la stessa configurazione, se le
// ultime sessioni sono state completate con RPE <= target, propone
// +2–5% di carico OPPURE una tacca più piccola. Mai entrambe insieme.
// ---------------------------------------------------------------------
export function roundHalf(x) {
  return Math.round(x * 2) / 2;
}
export function round1(x) {
  return Math.round(x * 10) / 10;
}

export function progressionSuggestion(state, now) {
  const s = state.settings;
  const p = state.progression;
  if (p.snoozeUntil && p.snoozeUntil > now) return null;
  if (deloadStatus(state, now).active) return null;

  const since = p.lastChangeAt ?? state.programStart;
  const weeks = (now - since) / WEEK;
  if (weeks < s.progressionMinWeeks) return null;

  // Un dolore alle dita dopo l'ultimo cambio blocca la progressione.
  if (state.events.some(e => e.type === 'pain' && e.ts >= since)) return null;

  // Sessioni valide: dopo l'ultimo cambio, con la configurazione attuale.
  const relevant = state.sessions.filter(x =>
    x.date >= since && !x.deload && !x.pain && x.hang && !x.hang.skipped &&
    x.hang.edgeMm === s.edgeMm && x.hang.addedKg === s.addedKg && hangStats(x));
  if (relevant.length < s.progressionMinSessions) return null;

  // Le ultime 2 devono essere complete e non oltre l'RPE target.
  const lastTwo = relevant.slice(-2).map(hangStats);
  const ready = lastTwo.every(st => st.allCompleted && st.avgRpe <= s.rpeTarget);
  if (!ready) return null;

  const totalKg = s.bodyKg + s.addedKg;
  const minInc = Math.max(0.5, roundHalf(totalKg * 0.02));
  const maxInc = Math.max(minInc, roundHalf(totalKg * 0.05));
  const inc = Math.min(maxInc, Math.max(minInc, roundHalf(totalKg * 0.03)));

  const options = [{
    type: 'load',
    fromKg: s.addedKg,
    toKg: round1(s.addedKg + inc),
    deltaKg: inc,
    pct: round1((inc / totalKg) * 100),
  }];
  const newEdge = s.edgeMm - s.edgeStepMm;
  if (newEdge >= s.minEdgeMm) {
    options.push({ type: 'edge', fromMm: s.edgeMm, toMm: newEdge });
  }
  return { weeks: round1(weeks), sessions: relevant.length, options };
}

// Applica UNA sola opzione di progressione: cambia o il carico o la tacca.
export function applyProgression(state, option, now) {
  const settings = { ...state.settings };
  let text;
  if (option.type === 'load') {
    settings.addedKg = option.toKg;
    text = `Carico: ${fmtKg(option.fromKg)} → ${fmtKg(option.toKg)} (tacca invariata ${settings.edgeMm} mm)`;
  } else if (option.type === 'edge') {
    settings.edgeMm = option.toMm;
    text = `Tacca: ${option.fromMm} → ${option.toMm} mm (carico invariato ${fmtKg(settings.addedKg)})`;
  } else {
    throw new Error('Opzione di progressione sconosciuta');
  }
  return {
    ...state,
    settings,
    progression: { ...state.progression, lastChangeAt: now, snoozeUntil: 0 },
    events: [...state.events, { ts: now, type: 'progression', text }],
  };
}

export function snoozeProgression(state, now) {
  return { ...state, progression: { ...state.progression, snoozeUntil: now + WEEK } };
}

// ---------------------------------------------------------------------
// SCARICO: ogni 6–8 settimane propone una settimana senza hangboard.
// ---------------------------------------------------------------------
export function deloadStatus(state, now) {
  const s = state.settings;
  const d = state.deload;
  if (d.activeUntil && d.activeUntil > now) {
    return { active: true, until: d.activeUntil, propose: false };
  }
  const base = d.lastEndAt ?? state.programStart;
  const weeks = (now - base) / WEEK;
  const snoozed = d.snoozeUntil && d.snoozeUntil > now;
  const overdue = weeks >= s.deloadMaxWeeks;
  // Dopo le 8 settimane la proposta ricompare anche se rimandata.
  const propose = weeks >= s.deloadMinWeeks && (!snoozed || overdue);
  return { active: false, propose, overdue, weeks: round1(weeks) };
}

export function startDeload(state, now) {
  const until = now + WEEK;
  return {
    ...state,
    deload: { ...state.deload, activeUntil: until, lastEndAt: until, snoozeUntil: 0 },
    // Dopo lo scarico il conteggio della progressione riparte.
    progression: { ...state.progression, lastChangeAt: until },
    events: [...state.events, { ts: now, type: 'deload', text: 'Inizio settimana di scarico' }],
  };
}

export function endDeloadNow(state, now) {
  return { ...state, deload: { ...state.deload, activeUntil: 0, lastEndAt: now } };
}

export function snoozeDeload(state, now) {
  return { ...state, deload: { ...state.deload, snoozeUntil: now + WEEK } };
}

// ---------------------------------------------------------------------
// Esportazione
// ---------------------------------------------------------------------
export function fmtKg(kg) {
  if (!kg) return 'peso corporeo';
  return kg > 0 ? `+${kg} kg` : `−${Math.abs(kg)} kg`;
}

function csvCell(v) {
  if (v == null) return '';
  const str = String(v);
  return /[",;\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function isoDate(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Una riga per ogni serie registrata.
export function toCSV(state) {
  const header = ['data', 'sessione', 'sezione', 'esercizio', 'serie', 'valore', 'unita', 'carico_kg', 'tacca_mm', 'rpe', 'note'];
  const rows = [header];
  for (const s of state.sessions) {
    const d = isoDate(s.date);
    if (s.warmup) rows.push([d, s.id, 'riscaldamento', 'riscaldamento', '', s.warmup.done ? 1 : 0, 'completato', '', '', '', '']);
    if (s.hang && !s.hang.skipped) {
      s.hang.reps.forEach((r, i) => {
        if (!r.done) return;
        rows.push([d, s.id, 'hangboard', `max hang ${s.hang.grip}`, i + 1, r.heldS ?? r.targetS, 's',
          round1(s.hang.bodyKg + s.hang.addedKg), s.hang.edgeMm, r.rpe, s.hang.interrupted ? 'interrotto: dolore' : '']);
      });
    }
    if (s.boulder) rows.push([d, s.id, 'boulder', 'boulder libero', '', Math.round((s.boulder.elapsedMs || 0) / MIN), 'min', '', '', '', s.boulder.notes]);
    (s.bodyweight?.rounds || []).forEach((round, ri) => {
      round.forEach(e => {
        if (!e.done) return;
        const ex = BW_EXERCISES.find(x => x.id === e.id);
        rows.push([d, s.id, 'corpo libero', ex?.name ?? e.id, ri + 1, e.value, ex?.unit ?? '', e.loadKg || '', '', '', '']);
      });
    });
  }
  for (const e of state.events) {
    rows.push([isoDate(e.ts), '', 'evento', e.type, '', '', '', '', '', '', e.text]);
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

export function toJSON(state) {
  return JSON.stringify({ app: 'scheda-arrampicata', exportedAt: new Date().toISOString(), state }, null, 2);
}

// Accetta sia un backup completo ({app, state}) sia direttamente lo stato.
export function fromJSON(text, now) {
  const parsed = JSON.parse(text);
  const raw = parsed && parsed.state ? parsed.state : parsed;
  if (!raw || !Array.isArray(raw.sessions)) {
    throw new Error('File non valido: mancano le sessioni');
  }
  return normalizeState(raw, now);
}
