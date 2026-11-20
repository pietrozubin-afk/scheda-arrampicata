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
    // Hangboard: valori comuni ai due metodi
    countdownSec: 3,         // conto alla rovescia 3-2-1
    rpeTarget: 8,
    // Max Hangs (Sessione A): sospensioni brevi al massimo carico
    hangReps: 5,             // solo per eventuali sessioni non classificate
    hangSec: 10,
    hangRestSec: 180,        // recupero tra sospensioni (2–3 min)
    edgeMm: 20,              // tacca
    grip: 'Half crimp',
    addedKg: 0,              // >0 zavorra, <0 alleggerimento (elastico/carrucola)
    // Repeaters (Sessione B): 7 s appeso / 3 s riposo × 6, per serie
    repSets: 3,              // serie attuali (la progressione le aumenta)
    repMinSets: 3,           // si riparte da qui dopo un aumento di carico o tacca
    repMaxSets: 5,           // raggiunte queste, si propone carico o tacca
    repReps: 6,              // ripetizioni per serie
    repOnSec: 7,             // secondi appeso
    repOffSec: 3,            // secondi di riposo tra le ripetizioni
    repSetRestSec: 180,      // recupero tra le serie (2–3 min)
    repEdgeMm: 20,
    repGrip: 'Half crimp',
    repAddedKg: 0,
    // Boulder (sessione di scarico / sessioni non classificate)
    boulderMin: 30,
    boulderLimitMin: 15,     // primi minuti dedicati ai blocchi al limite (solo sessioni vecchie)
    // Sessione A – Limite
    hangRepsA: 5,            // Max Hangs: è l'unico giorno di forza massima
    boulderAMin: 35,         // boulder al limite 30–40 min
    attemptRestSec: 180,     // recupero tra tentativi 3–4 min
    projectLevel: 5,         // livello dei progetti (scala palestra 1–7)
    projectMax: 3,           // oltre, l'app chiede conferma (consigliati 2)
    // Sessione B – Volume
    boulderBMin: 40,
    volumeRestSec: 90,       // recupero tra blocchi 1–2 min
    volumeTarget: 15,        // obiettivo blocchi
    volumeTargetMin: 12,     // minimo utile
    volumeTargetMax: 20,     // massimo: oltre è troppo
    volumeLevel: 4,          // livello dei blocchi a volume
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

// Esercizi a corpo libero, nell'ordine in cui si eseguono in ogni giro.
// "unit" indica se si registrano ripetizioni o secondi. Le sessioni salvate
// identificano gli esercizi per "id", quindi l'ordine si può cambiare senza
// rovinare lo storico.
export const BW_EXERCISES = [
  { id: 'pullup', name: 'Trazioni', unit: 'rip', min: 5, max: 8, loadable: true },
  { id: 'hollow', name: 'Addominali (hollow body)', unit: 's', min: 20, max: 30, loadable: false },
  { id: 'pushup', name: 'Piegamenti', unit: 'rip', min: 10, max: 15, loadable: true },
  { id: 'lunge', name: 'Affondi laterali', unit: 'rip/lato', min: 8, max: 10, loadable: true },
];

// Esercizio a partire dall'id (le sessioni vecchie hanno un altro ordine).
export function bwExercise(id) {
  return BW_EXERCISES.find(x => x.id === id);
}

export const WARMUP_MOBILITY = ['Mobilità spalle', 'Mobilità polsi e dita'];

// ---------------------------------------------------------------------
// TIPI DI SESSIONE
//   A = Limite (hangboard Max Hangs + progetti)
//   B = Volume (hangboard Repeaters 7/3 + tanti blocchi)
//   S = Scarico (niente hangboard, boulder facile)
//   U = Non classificata (sessioni salvate prima dell'introduzione di A/B)
// ---------------------------------------------------------------------
export const SESSION_TYPES = {
  A: { id: 'A', name: 'Sessione A', short: 'A · Limite', desc: 'Limite' },
  B: { id: 'B', name: 'Sessione B', short: 'B · Volume', desc: 'Volume' },
  S: { id: 'S', name: 'Scarico', short: 'Scarico', desc: 'Scarico' },
  U: { id: 'U', name: 'Non classificata', short: 'Non classificata', desc: '' },
};

export const STYLES = ['Strapiombo', 'Placca', 'Verticale', 'Tetto', 'Diedro', 'Spigolo'];
export const OUTCOMES = {
  sent: 'Chiuso',
  sections: 'Sezioni chiuse',
  notSent: 'Non chiuso',
};

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 7;
export const clampLevel = l => Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(Number(l) || LEVEL_MIN)));

// Alternanza: propone il tipo opposto all'ultima sessione A o B.
// Scarico e non classificate non contano. Prima volta in assoluto: A.
export function suggestType(state) {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const t = state.sessions[i].type;
    if (t === 'A') return 'B';
    if (t === 'B') return 'A';
  }
  return 'A';
}

// Voci della checklist di riscaldamento (in A si aggiunge 1–2 blocchi al livello volume).
export function warmupItems(settings, type) {
  const items = [...WARMUP_MOBILITY];
  for (let i = 0; i < settings.warmupBlocks; i++) items.push(`Blocco facile ${i + 1}`);
  if (type === 'A') items.push(`1–2 blocchi di livello ${settings.volumeLevel}`);
  return items;
}

// Metodo di hangboard di ogni tipo di sessione:
//   'max'       = Max Hangs (sospensioni da 10 s al carico massimo)
//   'repeaters' = 7 s appeso / 3 s riposo ripetuti, in più serie
//   null        = niente hangboard (scarico)
export const HANG_PROTOCOLS = { max: 'Max Hangs', repeaters: 'Repeaters' };

export function hangProtocolFor(type) {
  if (type === 'S') return null;
  return type === 'B' ? 'repeaters' : 'max';
}

// Numero di sospensioni Max Hangs (0 se la sessione non le prevede).
export function hangRepsFor(settings, type) {
  if (hangProtocolFor(type) !== 'max') return 0;
  return type === 'A' ? settings.hangRepsA : settings.hangReps;
}

// Metodo usato da una sessione salvata (le sessioni vecchie erano tutte Max Hangs).
export function hangProtocol(session) {
  if (!session?.hang) return null;
  return session.hang.protocol || 'max';
}

export function boulderMinFor(settings, type) {
  if (type === 'A') return settings.boulderAMin;
  if (type === 'B') return settings.boulderBMin;
  return settings.boulderMin;
}

// Stato iniziale dell'app al primo avvio.
export const STATE_VERSION = 3;

export function initialState(now) {
  return {
    version: STATE_VERSION,
    programStart: now,
    settings: defaultSettings(),
    sessions: [],
    events: [],              // {ts, type: 'pain'|'progression'|'deload', text}
    progression: { lastChangeAt: now, snoozeUntil: 0 },     // Max Hangs
    progressionRep: { lastChangeAt: now, snoozeUntil: 0 },  // Repeaters
    deload: { lastEndAt: now, activeUntil: 0, snoozeUntil: 0 },
  };
}

// Unisce uno stato caricato (es. da backup vecchio) con i default,
// così i campi aggiunti in versioni successive non mancano mai.
export function normalizeState(raw, now) {
  const base = initialState(now);
  if (!raw || typeof raw !== 'object') return base;
  const merged = {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    progression: { ...base.progression, ...(raw.progression || {}) },
    // Chi arriva da una versione senza repeaters parte da oggi (o dalla data del backup).
    progressionRep: { ...base.progressionRep, ...(raw.progressionRep || {}) },
    deload: { ...base.deload, ...(raw.deload || {}) },
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    events: Array.isArray(raw.events) ? raw.events : [],
  };
  return migrateState(merged);
}

// ---------------------------------------------------------------------
// MIGRAZIONE DEI DATI SALVATI
// v1 -> v2: introduzione dei tipi di sessione A/B.
//   - le sessioni esistenti diventano "non classificate" (U),
//     quelle fatte in settimana di scarico diventano "Scarico" (S);
//   - il boulder riceve i nuovi campi (progetti e registro volume) vuoti.
// v2 -> v3: introduzione dei repeaters nella Sessione B.
//   - l'hangboard delle sessioni esistenti viene marcato come Max Hangs
//     (protocol: 'max'), perché fino ad allora era l'unico metodo;
//   - impostazioni: la Sessione A passa da 3 a 5 Max Hangs e il boulder a
//     volume da 30 a 40 min, ma solo se erano ancora ai vecchi valori
//     predefiniti (una scelta personale non viene toccata).
// Nessun dato esistente viene cancellato o modificato.
// ---------------------------------------------------------------------
export function migrateSession(s) {
  if (!s || typeof s !== 'object') return s;
  const type = SESSION_TYPES[s.type] ? s.type : (s.deload ? 'S' : 'U');
  const boulder = s.boulder || { elapsedMs: 0, notes: '' };
  const out = {
    ...s,
    type,
    boulder: {
      ...boulder,
      projects: Array.isArray(boulder.projects) ? boulder.projects : [],
      log: Array.isArray(boulder.log) ? boulder.log : [],
    },
  };
  if (s.hang && !s.hang.protocol) out.hang = { ...s.hang, protocol: 'max' };
  return out;
}

function sessionIsCurrent(s) {
  return !!SESSION_TYPES[s.type] && (!s.hang || !!s.hang.protocol);
}

export function migrateState(st) {
  const from = Number(st.version) || 1;
  if (from >= STATE_VERSION && st.sessions.every(sessionIsCurrent)) return st;
  let settings = st.settings;
  if (from < 3) {
    settings = { ...settings };
    if (settings.hangRepsA === 3) settings.hangRepsA = 5;
    if (settings.boulderBMin === 30) settings.boulderBMin = 40;
  }
  return { ...st, version: STATE_VERSION, settings, sessions: st.sessions.map(migrateSession) };
}

// Sessione in corso salvata da una versione precedente dell'app.
export function migrateRun(run) {
  if (!run || !run.session) return run;
  return {
    rest: null,
    projIdx: 0,
    volLevel: null,
    ...run,
    session: migrateSession(run.session),
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
// Tipo effettivo: accetta anche il vecchio parametro { deload: true }.
function resolveType({ type, deload } = {}) {
  if (deload) return 'S';
  return SESSION_TYPES[type] ? type : 'B';
}

// Modalità del boulder: progetti (A), volume (B), libero (scarico/non classificata).
export function boulderMode(type) {
  if (type === 'A') return 'project';
  if (type === 'B') return 'volume';
  return 'free';
}

export function buildSteps(settings, opts = {}) {
  const s = settings;
  const type = resolveType(opts);
  const steps = [];
  steps.push({ kind: 'warmup', durationMs: s.warmupMin * MIN, auto: false });

  const reps = hangRepsFor(s, type);
  if (hangProtocolFor(type) === 'repeaters') {
    steps.push({ kind: 'hangConfirm' });
    steps.push({ kind: 'hangSetup' });
    const sets = Math.max(1, s.repSets);
    const n = Math.max(1, s.repReps);
    for (let set = 0; set < sets; set++) {
      steps.push({ kind: 'hangSetCountdown', set, durationMs: s.countdownSec * SEC, auto: true });
      for (let rep = 0; rep < n; rep++) {
        steps.push({ kind: 'hangOn', set, rep, durationMs: s.repOnSec * SEC, auto: true });
        // Dopo l'ultima ripetizione non c'è il riposo breve: parte il recupero della serie.
        if (rep < n - 1) steps.push({ kind: 'hangOff', set, rep, durationMs: s.repOffSec * SEC, auto: true });
      }
      steps.push(set === sets - 1
        ? { kind: 'hangSetRest', set, last: true }
        : { kind: 'hangSetRest', set, durationMs: s.repSetRestSec * SEC, auto: true });
    }
  } else if (reps > 0) {
    steps.push({ kind: 'hangConfirm' });
    steps.push({ kind: 'hangSetup' });
    for (let rep = 0; rep < reps; rep++) {
      steps.push({ kind: 'hangCountdown', rep, durationMs: s.countdownSec * SEC, auto: true });
      steps.push({ kind: 'hang', rep, durationMs: s.hangSec * SEC, auto: true });
      const last = rep === reps - 1;
      // Dopo l'ultima sospensione non serve recupero: resta solo la registrazione dell'RPE.
      steps.push(last
        ? { kind: 'hangRest', rep, last: true }
        : { kind: 'hangRest', rep, durationMs: s.hangRestSec * SEC, auto: true });
    }
  }

  steps.push({ kind: 'boulder', mode: boulderMode(type), durationMs: boulderMinFor(s, type) * MIN, auto: false });

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
  return !!step && ['hangSetup', 'hangCountdown', 'hang', 'hangRest',
    'hangSetCountdown', 'hangOn', 'hangOff', 'hangSetRest'].includes(step.kind);
}

// Passi di una serie di repeaters (per Ripeti / Salta / Ceduto).
export function isRepeaterStep(step) {
  return !!step && ['hangSetCountdown', 'hangOn', 'hangOff', 'hangSetRest'].includes(step.kind);
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

export function newProject(settings) {
  return { level: settings.projectLevel, style: '', attempts: 0, outcome: null, notes: '' };
}

export function newSession(state, now, opts = {}) {
  const s = state.settings;
  const type = resolveType(opts);
  const deload = type === 'S';
  const protocol = hangProtocolFor(type);
  // L'RPE si precompila dall'ultima sessione fatta con lo stesso metodo.
  const prevHang = lastSession(state, x => hangProtocol(x) === protocol && !x.hang.skipped &&
    (protocol === 'repeaters' ? x.hang.sets?.length : x.hang.reps?.length));
  const prevBw = lastSession(state, x => x.bodyweight && x.bodyweight.rounds.length);

  let hang = null;
  if (protocol === 'max') {
    const reps = [];
    for (let i = 0; i < hangRepsFor(s, type); i++) {
      const prevRpe = prevHang?.hang.reps[i]?.rpe;
      reps.push({ targetS: s.hangSec, heldS: null, rpe: prevRpe ?? s.rpeTarget, done: false });
    }
    hang = {
      protocol, edgeMm: s.edgeMm, grip: s.grip, bodyKg: s.bodyKg, addedKg: s.addedKg,
      reps, interrupted: null, skipped: false,
    };
  } else if (protocol === 'repeaters') {
    const sets = [];
    for (let i = 0; i < s.repSets; i++) {
      // heldReps: ripetizioni tenute nella serie (null = tutte)
      sets.push({ heldReps: null, rpe: prevHang?.hang.sets[i]?.rpe ?? s.rpeTarget, done: false });
    }
    hang = {
      protocol, edgeMm: s.repEdgeMm, grip: s.repGrip, bodyKg: s.bodyKg, addedKg: s.repAddedKg,
      repsPerSet: s.repReps, onSec: s.repOnSec, offSec: s.repOffSec,
      sets, interrupted: null, skipped: false,
    };
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
    type,
    date: now,
    endedAt: null,
    deload,
    pain: false,
    warmup: { done: false, checks: Array(warmupItems(s, type).length).fill(false) },
    hang,
    boulder: {
      elapsedMs: 0,
      notes: '',
      projects: type === 'A' ? [newProject(s)] : [],
      log: [],                // volume B: [{ ts, level, sent }]
    },
    bodyweight: { rounds },
  };
}

// "Salta hangboard oggi": la sessione resta valida, l'evento va nello storico.
export function skipHangboard(state, session, now) {
  if (!session.hang) return state;
  session.hang.skipped = true;
  session.hang.skipReason = 'saltato per scelta';
  const name = SESSION_TYPES[session.type]?.name || 'Sessione';
  return { ...state, events: [...state.events, { ts: now, type: 'skip', text: `Hangboard saltato (${name})` }] };
}

// ---------------------------------------------------------------------
// BOULDER A – progetti
// ---------------------------------------------------------------------
export function addAttempt(project, delta = 1) {
  project.attempts = Math.max(0, (project.attempts || 0) + delta);
  return project.attempts;
}

export function projectStats(session) {
  const projects = session?.boulder?.projects || [];
  return {
    projects: projects.length,
    attempts: projects.reduce((a, p) => a + (p.attempts || 0), 0),
    sends: projects.filter(p => p.outcome === 'sent').length,
    sections: projects.filter(p => p.outcome === 'sections').length,
  };
}

// Limite consigliato di progetti per sessione: oltre, l'app chiede conferma.
export function projectLimitReached(session, settings) {
  return (session?.boulder?.projects?.length || 0) >= settings.projectMax;
}

// ---------------------------------------------------------------------
// BOULDER B – contatore volume
// ---------------------------------------------------------------------
export function volumeAdd(boulder, level, sent, ts) {
  boulder.log.push({ ts, level: clampLevel(level), sent: !!sent });
  return boulder;
}

export function volumeUndo(boulder) {
  boulder.log.pop();
  return boulder;
}

export function volumeStats(session) {
  const log = session?.boulder?.log || [];
  const byLevel = {};
  let sent = 0;
  for (const e of log) {
    byLevel[e.level] ??= { sent: 0, notSent: 0 };
    if (e.sent) { byLevel[e.level].sent++; sent++; } else byLevel[e.level].notSent++;
  }
  return { total: log.length, sent, notSent: log.length - sent, byLevel };
}

// Avanzamento verso l'obiettivo (15, tra 12 e 20): contano tutti i blocchi provati.
export function volumeProgress(session, settings) {
  const { total } = volumeStats(session);
  const max = Math.max(1, settings.volumeTargetMax);
  return {
    total,
    reachedMin: total >= settings.volumeTargetMin,
    reachedTarget: total >= settings.volumeTarget,
    reachedMax: total >= settings.volumeTargetMax,
    pct: Math.min(100, Math.round((100 * total) / max)),
    targetPct: Math.min(100, Math.round((100 * settings.volumeTarget) / max)),
  };
}

// ---------------------------------------------------------------------
// TIMER DI RECUPERO del boulder: dopo un tentativo (A) o un blocco (B).
// È un timer secondario, indipendente da quello della fase boulder.
// ---------------------------------------------------------------------
export function restTimerFor(settings, type, now) {
  const sec = type === 'A' ? settings.attemptRestSec : settings.volumeRestSec;
  return createTimer(sec * SEC, now);
}

// Statistiche Max Hangs di una sessione (per storico e progressione).
// Per le sessioni con i repeaters usare repeaterStats.
export function hangStats(session) {
  const h = session?.hang;
  if (!h || h.skipped || hangProtocol(session) !== 'max' || !Array.isArray(h.reps)) return null;
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

// Ripetizioni tenute in una serie di repeaters (null = tutte quelle previste).
export function setHeldReps(hang, set) {
  return set.heldReps ?? hang.repsPerSet;
}

// Statistiche repeaters di una sessione (per storico e progressione).
export function repeaterStats(session) {
  const h = session?.hang;
  if (!h || h.skipped || hangProtocol(session) !== 'repeaters' || !Array.isArray(h.sets)) return null;
  const done = h.sets.filter(x => x.done);
  if (!done.length) return null;
  const completedSets = done.filter(x => setHeldReps(h, x) >= h.repsPerSet).length;
  return {
    sets: done.length,
    planned: h.sets.length,
    completedSets,
    allCompleted: completedSets === h.sets.length,
    totalReps: done.reduce((a, x) => a + setHeldReps(h, x), 0),
    repsPerSet: h.repsPerSet,
    avgRpe: done.reduce((a, x) => a + (Number(x.rpe) || 0), 0) / done.length,
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

// Controlli comuni ai due metodi: rimandata, scarico, tempo minimo, dolore.
// Restituisce la data dell'ultimo cambio e le settimane trascorse, o null.
function progressionWindow(state, p, now) {
  const s = state.settings;
  if (p.snoozeUntil && p.snoozeUntil > now) return null;
  if (deloadStatus(state, now).active) return null;
  const since = p.lastChangeAt ?? state.programStart;
  const weeks = (now - since) / WEEK;
  if (weeks < s.progressionMinWeeks) return null;
  // Un dolore alle dita dopo l'ultimo cambio blocca la progressione.
  if (state.events.some(e => e.type === 'pain' && e.ts >= since)) return null;
  return { since, weeks };
}

// Sessioni utili alla progressione: dopo l'ultimo cambio, niente scarico,
// niente dolore, hangboard non saltato.
function progressionCandidates(state, since) {
  return state.sessions.filter(x =>
    x.date >= since && !x.deload && x.type !== 'S' && !x.pain && x.hang && !x.hang.skipped);
}

// Le due opzioni alternative: +2–5% di carico OPPURE tacca −2 mm.
function loadOrEdgeOptions(s, addedKg, edgeMm) {
  const totalKg = s.bodyKg + addedKg;
  const minInc = Math.max(0.5, roundHalf(totalKg * 0.02));
  const maxInc = Math.max(minInc, roundHalf(totalKg * 0.05));
  const inc = Math.min(maxInc, Math.max(minInc, roundHalf(totalKg * 0.03)));
  const options = [{
    type: 'load',
    fromKg: addedKg,
    toKg: round1(addedKg + inc),
    deltaKg: inc,
    pct: round1((inc / totalKg) * 100),
  }];
  const newEdge = edgeMm - s.edgeStepMm;
  if (newEdge >= s.minEdgeMm) options.push({ type: 'edge', fromMm: edgeMm, toMm: newEdge });
  return options;
}

// MAX HANGS: contano tutte le sessioni fatte con le Max Hangs (oggi le A,
// prima dei repeaters anche le B e le non classificate) con la configurazione attuale.
export function progressionSuggestion(state, now) {
  const s = state.settings;
  const win = progressionWindow(state, state.progression, now);
  if (!win) return null;

  const relevant = progressionCandidates(state, win.since).filter(x =>
    hangProtocol(x) === 'max' && x.hang.edgeMm === s.edgeMm && x.hang.addedKg === s.addedKg && hangStats(x));
  if (relevant.length < s.progressionMinSessions) return null;

  // Le ultime 2 devono essere complete e non oltre l'RPE target.
  const lastTwo = relevant.slice(-2).map(hangStats);
  if (!lastTwo.every(st => st.allCompleted && st.avgRpe <= s.rpeTarget)) return null;

  const options = loadOrEdgeOptions(s, s.addedKg, s.edgeMm).map(o => ({ ...o, target: 'max' }));
  return { target: 'max', weeks: round1(win.weeks), sessions: relevant.length, options };
}

// REPEATERS: prima si aggiunge una serie (da 3 fino a 5); arrivati al massimo
// delle serie si propone +carico OPPURE −tacca, e le serie ripartono da 3.
export function repeaterSuggestion(state, now) {
  const s = state.settings;
  const win = progressionWindow(state, state.progressionRep, now);
  if (!win) return null;

  const relevant = progressionCandidates(state, win.since).filter(x =>
    hangProtocol(x) === 'repeaters' && x.hang.edgeMm === s.repEdgeMm && x.hang.addedKg === s.repAddedKg &&
    x.hang.sets.length === s.repSets && x.hang.repsPerSet === s.repReps && repeaterStats(x));
  if (relevant.length < s.progressionMinSessions) return null;

  const lastTwo = relevant.slice(-2).map(repeaterStats);
  if (!lastTwo.every(st => st.allCompleted && st.avgRpe <= s.rpeTarget)) return null;

  const options = s.repSets < s.repMaxSets
    ? [{ type: 'sets', fromSets: s.repSets, toSets: s.repSets + 1 }]
    : loadOrEdgeOptions(s, s.repAddedKg, s.repEdgeMm);
  return {
    target: 'rep', weeks: round1(win.weeks), sessions: relevant.length,
    options: options.map(o => ({ ...o, target: 'rep' })),
  };
}

// Applica UNA sola opzione di progressione: cambia o il carico o la tacca
// (o, per i repeaters, il numero di serie). Mai carico e tacca insieme.
export function applyProgression(state, option, now) {
  const settings = { ...state.settings };
  const rep = option.target === 'rep';
  const kgKey = rep ? 'repAddedKg' : 'addedKg';
  const edgeKey = rep ? 'repEdgeMm' : 'edgeMm';
  let text;
  if (option.type === 'load') {
    settings[kgKey] = option.toKg;
    text = `Carico: ${fmtKg(option.fromKg)} → ${fmtKg(option.toKg)} (tacca invariata ${settings[edgeKey]} mm)`;
  } else if (option.type === 'edge') {
    settings[edgeKey] = option.toMm;
    text = `Tacca: ${option.fromMm} → ${option.toMm} mm (carico invariato ${fmtKg(settings[kgKey])})`;
  } else if (option.type === 'sets' && rep) {
    settings.repSets = option.toSets;
    text = `Serie: ${option.fromSets} → ${option.toSets} (carico e tacca invariati)`;
  } else {
    throw new Error('Opzione di progressione sconosciuta');
  }
  // Con più carico o tacca più piccola i repeaters ripartono dal numero minimo di serie.
  if (rep && option.type !== 'sets') {
    settings.repSets = settings.repMinSets;
    text += `, serie riportate a ${settings.repMinSets}`;
  }
  const key = rep ? 'progressionRep' : 'progression';
  return {
    ...state,
    settings,
    [key]: { ...state[key], lastChangeAt: now, snoozeUntil: 0 },
    events: [...state.events, { ts: now, type: 'progression', text: `${rep ? 'Repeaters' : 'Max Hangs'} · ${text}` }],
  };
}

// target: 'max' (Max Hangs) oppure 'rep' (repeaters)
export function snoozeProgression(state, now, target = 'max') {
  const key = target === 'rep' ? 'progressionRep' : 'progression';
  return { ...state, [key]: { ...state[key], snoozeUntil: now + WEEK } };
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
    progressionRep: { ...state.progressionRep, lastChangeAt: until },
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
  const header = ['data', 'sessione', 'tipo', 'sezione', 'esercizio', 'serie', 'valore', 'unita', 'carico_kg', 'tacca_mm', 'rpe', 'note'];
  const rows = [header];
  for (const raw of state.sessions) {
    const s = migrateSession(raw);
    const d = isoDate(s.date);
    const r0 = (...cols) => rows.push([d, s.id, s.type, ...cols]);
    if (s.warmup) r0('riscaldamento', 'riscaldamento', '', s.warmup.done ? 1 : 0, 'completato', '', '', '', '');
    if (s.hang && s.hang.skipped) r0('hangboard', 'hangboard', '', 0, 'saltato', '', '', '', s.hang.skipReason || '');
    if (s.hang && !s.hang.skipped && hangProtocol(s) === 'repeaters') {
      const h = s.hang;
      h.sets.forEach((x, i) => {
        if (!x.done) return;
        r0('hangboard', `repeaters ${h.onSec}/${h.offSec} ${h.grip}`, i + 1, setHeldReps(h, x), `rip/${h.repsPerSet}`,
          round1(h.bodyKg + h.addedKg), h.edgeMm, x.rpe, h.interrupted ? 'interrotto: dolore' : '');
      });
    } else if (s.hang && !s.hang.skipped) {
      s.hang.reps.forEach((r, i) => {
        if (!r.done) return;
        r0('hangboard', `max hang ${s.hang.grip}`, i + 1, r.heldS ?? r.targetS, 's',
          round1(s.hang.bodyKg + s.hang.addedKg), s.hang.edgeMm, r.rpe, s.hang.interrupted ? 'interrotto: dolore' : '');
      });
    }
    if (s.boulder) {
      const mode = boulderMode(s.type);
      r0('boulder', mode === 'project' ? 'boulder al limite' : mode === 'volume' ? 'boulder a volume' : 'boulder libero',
        '', Math.round((s.boulder.elapsedMs || 0) / MIN), 'min', '', '', '', s.boulder.notes);
      s.boulder.projects.forEach((p, i) => {
        const note = [p.outcome ? OUTCOMES[p.outcome] : 'esito non indicato', p.style, p.notes].filter(Boolean).join(' · ');
        r0('boulder progetto', `progetto ${i + 1} livello ${p.level}`, i + 1, p.attempts, 'tentativi', '', '', '', note);
      });
      const vs = volumeStats(s);
      Object.keys(vs.byLevel).sort().forEach(level => {
        r0('boulder volume', `livello ${level}`, '', vs.byLevel[level].sent, 'chiusi', '', '', '', '');
        r0('boulder volume', `livello ${level}`, '', vs.byLevel[level].notSent, 'non chiusi', '', '', '', '');
      });
    }
    (s.bodyweight?.rounds || []).forEach((round, ri) => {
      round.forEach(e => {
        if (!e.done) return;
        const ex = BW_EXERCISES.find(x => x.id === e.id);
        r0('corpo libero', ex?.name ?? e.id, ri + 1, e.value, ex?.unit ?? '', e.loadKg || '', '', '', '');
      });
    });
  }
  for (const e of state.events) {
    rows.push([isoDate(e.ts), '', '', 'evento', e.type, '', '', '', '', '', '', e.text]);
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
