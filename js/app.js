// =====================================================================
// app.js — interfaccia: schermate, sessione guidata, storico, impostazioni.
// Architettura semplice: uno stato in memoria (state = dati salvati,
// run = sessione in corso, ui = schermata attuale), una funzione render()
// che ridisegna la schermata e un unico gestore di tocchi (data-act).
// =====================================================================
import * as L from './logic.js';
import * as S from './store.js';
import * as F from './feedback.js';
import { lineChart } from './charts.js';

const $app = document.getElementById('app');
const now = () => Date.now();

let state = S.loadState(now());
let run = S.loadRun(); // { session, steps, idx, timer, hollow, painStopped, flags }
let ui = { screen: run ? 'session' : 'home', detailId: null, modal: null, toast: null };

F.setFeedbackOptions({ vibration: state.settings.vibration });
S.requestPersistence();
if (run) F.keepScreenOn(true);

// ----------------------------- utilità -----------------------------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function persist() {
  if (!S.saveState(state)) toast('⚠️ Salvataggio non riuscito: spazio pieno?');
}
function persistRun() { S.saveRun(run); }
function fmtDate(ts, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(ts).toLocaleDateString('it-IT', opts);
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
function toast(msg) {
  ui.toast = msg;
  render();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { ui.toast = null; render(); }, 2600);
}
function modal(title, text, buttons) {
  ui.modal = { title, text, buttons };
  render();
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// =====================================================================
// SESSIONE GUIDATA
// =====================================================================
const step = () => run?.steps[run.idx];

function startSession() {
  const deload = L.deloadStatus(state, now()).active;
  run = {
    session: L.newSession(state, now(), { deload }),
    steps: L.buildSteps(state.settings, { deload }),
    idx: 0,
    timer: null,
    hollow: null,
    painStopped: false,
    flags: {},
  };
  ui.screen = 'session';
  F.keepScreenOn(true);
  enterStep(0);
  render();
}

// Entra in un passo. startAt permette di "recuperare" esattamente i tempi
// quando l'app torna in primo piano dopo un periodo in background.
function enterStep(idx, startAt = now()) {
  run.idx = clamp(idx, 0, run.steps.length - 1);
  const st = step();
  run.timer = st.durationMs ? L.createTimer(st.durationMs, startAt) : null;
  run.hollow = null;
  run.flags = {};
  persistRun();
}

// Registra i dati quando un passo automatico finisce da solo.
function onAutoEnd(st) {
  const s = run.session;
  const n = run.steps.filter(x => x.kind === 'hang').length;
  if (st.kind === 'hangCountdown') {
    F.vibrate('go');
    F.notify(`Sospensione ${st.rep + 1}/${n}`, 'VAI! Appeso.');
  } else if (st.kind === 'hang') {
    const r = s.hang.reps[st.rep];
    r.heldS = r.targetS;
    r.done = true;
    F.vibrate('end');
    F.notify('Fine sospensione', 'Recupero: inserisci l\'RPE.');
  } else if (st.kind === 'hangRest') {
    F.vibrate('done');
    F.notify('Fine recupero', 'Preparati alla prossima sospensione.');
  } else if (st.kind === 'bwRest') {
    F.vibrate('done');
    F.notify('Fine recupero', 'Inizia il prossimo giro.');
  }
}

// Ciclo principale: aggiorna i timer a schermo e fa avanzare i passi automatici.
function tick() {
  if (!run || ui.screen !== 'session' || run.painStopped) return;
  let changed = false;
  for (let guard = 0; guard < 100; guard++) {
    const st = step();
    if (!st.auto || !run.timer || !L.timerIsDone(run.timer, now())) break;
    const endAt = L.timerEndAt(run.timer);
    onAutoEnd(st);
    enterStep(run.idx + 1, endAt);
    changed = true;
  }
  // Passi non automatici (riscaldamento, boulder): avvisi una volta sola.
  const st = step();
  if (run.timer && !st.auto) {
    if (st.kind === 'boulder' && !run.flags.limitDone &&
        L.timerElapsed(run.timer, now()) >= state.settings.boulderLimitMin * L.MIN) {
      run.flags.limitDone = true;
      F.vibrate('tick');
      changed = true;
    }
    if (!run.flags.timeUp && L.timerIsDone(run.timer, now())) {
      run.flags.timeUp = true;
      F.vibrate('done');
      F.notify(st.kind === 'boulder' ? 'Boulder: tempo scaduto' : 'Riscaldamento: tempo scaduto', 'Passa alla fase successiva.');
      changed = true;
    }
  }
  if (changed) render(); else updateClocks();
}
setInterval(tick, 250);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });

// Salvataggio di ciò che si è fatto nel passo che si sta lasciando.
function leaveStep() {
  const st = step();
  const s = run.session;
  if (st.kind === 'warmup') s.warmup.done = true;
  if (st.kind === 'boulder') s.boulder.elapsedMs = L.timerElapsed(run.timer, now());
}

function next() {
  leaveStep();
  enterStep(run.idx + 1);
  render();
}

function goToIndex(i) {
  leaveStep();
  enterStep(i);
  render();
}

const idxOf = pred => run.steps.findIndex(pred);
const firstAfterHang = () => idxOf(x => x.kind === 'boulder');

function togglePause() {
  if (!run.timer) return;
  run.timer = L.timerIsPaused(run.timer) ? L.resumeTimer(run.timer, now()) : L.pauseTimer(run.timer, now());
  persistRun();
  render();
}

function skip() {
  const st = step();
  if (st.kind === 'hangCountdown' || st.kind === 'hang') {
    // Salta questa sospensione (resta "non eseguita") e vai alla successiva.
    const nextRep = idxOf(x => x.kind === 'hangCountdown' && x.rep > st.rep);
    goToIndex(nextRep >= 0 ? nextRep : firstAfterHang());
  } else if (st.kind === 'hangSetup' || st.kind === 'hangConfirm') {
    run.session.hang.skipped = true;
    goToIndex(firstAfterHang());
  } else if (st.kind === 'bw') {
    next(); // esercizio non segnato come fatto
  } else {
    next();
  }
}

function repeat() {
  const st = step();
  if (['hangCountdown', 'hang', 'hangRest'].includes(st.kind)) {
    // Ripeti la sospensione corrente dal 3-2-1.
    const r = run.session.hang.reps[st.rep];
    r.done = false;
    r.heldS = null;
    goToIndex(idxOf(x => x.kind === 'hangCountdown' && x.rep === st.rep));
  } else if (run.timer) {
    enterStep(run.idx);
    render();
  }
}

// Ceduto prima dei secondi previsti: registra il tempo effettivo.
function failHang() {
  const st = step();
  const r = run.session.hang.reps[st.rep];
  r.heldS = Math.floor(L.timerElapsed(run.timer, now()) / 1000);
  r.done = true;
  F.vibrate('end');
  enterStep(run.idx + 1);
  render();
}

function painPressed() {
  modal('Dolore alle dita?', 'L\'hangboard viene interrotto e l\'evento resta annotato nello storico.', [
    { label: 'Sì, interrompi', cls: 'danger', fn: painStop },
    { label: 'Annulla', cls: 'ghost' },
  ]);
}

function painStop() {
  const s = run.session;
  const st = step();
  const t = now();
  s.pain = true;
  s.painAt = t;
  const hangPending = s.hang && !s.hang.skipped && run.idx <= idxOf(x => x.kind === 'hangRest' && x.last);
  if (hangPending) s.hang.interrupted = 'pain';
  const phase = phaseOf(st).name.toLowerCase();
  // L'evento si salva subito, anche se poi la sessione venisse scartata.
  state.events.push({ ts: t, type: 'pain', text: `Dolore alle dita (${phase}${hangPending ? `, sospensione ${(st.rep ?? 0) + 1}` : ''})` });
  persist();
  leaveStep();
  if (run.timer) run.timer = L.pauseTimer(run.timer, t);
  run.painStopped = true;
  F.vibrate('alert');
  persistRun();
  render();
}

function finishSession() {
  if (step().kind !== 'summary' && !run.painStopped) leaveStep();
  run.session.endedAt = now();
  state.sessions.push(run.session);
  persist();
  run = null;
  persistRun();
  F.keepScreenOn(false);
  ui.screen = 'home';
  toast('✅ Sessione salvata');
}

function discardSession() {
  run = null;
  persistRun();
  F.keepScreenOn(false);
  ui.screen = 'home';
  render();
}

function exitPressed() {
  modal('Uscire dalla sessione?', 'Puoi salvare quanto fatto finora o scartare la sessione.', [
    { label: 'Salva e termina', cls: 'primary', fn: finishSession },
    { label: 'Scarta sessione', cls: 'danger', fn: () => modal('Scartare davvero?', 'I dati di questa sessione andranno persi.', [
      { label: 'Sì, scarta', cls: 'danger', fn: discardSession },
      { label: 'No', cls: 'ghost' },
    ]) },
    { label: 'Continua l\'allenamento', cls: 'ghost' },
  ]);
}

// =====================================================================
// VISTE DELLA SESSIONE
// =====================================================================
const PHASES = [
  { id: 'warmup', name: 'Riscaldamento' },
  { id: 'hang', name: 'Hangboard' },
  { id: 'boulder', name: 'Boulder' },
  { id: 'bw', name: 'Corpo libero' },
];

function phaseOf(st) {
  if (!st) return { id: 'end', name: 'Fine' };
  if (st.kind === 'warmup') return PHASES[0];
  if (st.kind.startsWith('hang')) return PHASES[1];
  if (st.kind === 'boulder') return PHASES[2];
  if (st.kind === 'bw' || st.kind === 'bwRest') return PHASES[3];
  return { id: 'end', name: 'Fine' };
}

function clockHtml(big = 'xl') {
  return `<div class="clock ${big}" data-clock>${L.formatClock(L.timerRemaining(run.timer, now()))}</div>
    <div class="bar"><div data-bar style="width:${barPct()}%"></div></div>`;
}
function barPct() {
  if (!run?.timer) return 0;
  return (100 * L.timerElapsed(run.timer, now())) / run.timer.durationMs;
}

function viewSession() {
  if (run.painStopped) return viewPainStop();
  const st = step();
  const ph = phaseOf(st);
  const deload = run.session.deload;
  const phases = PHASES.filter(p => !(deload && p.id === 'hang'));
  const phaseIdx = phases.findIndex(p => p.id === ph.id);

  const top = `<header class="sbar">
    <button class="icon-btn" data-act="exit" aria-label="Esci">✕</button>
    <div class="phases">${phases.map((p, i) =>
      `<span class="${i < phaseIdx || ph.id === 'end' ? 'past' : i === phaseIdx ? 'cur' : ''}">${p.name}</span>`).join('')}</div>
    <button class="pain-btn" data-act="pain">🩹 Dolore dita</button>
  </header>`;

  let body = '';
  let mode = '';
  switch (st.kind) {
    case 'warmup': body = viewWarmup(); break;
    case 'hangConfirm': body = viewHangConfirm(); break;
    case 'hangSetup': body = viewHangSetup(); break;
    case 'hangCountdown': body = viewCountdown(st); mode = 'countdown'; break;
    case 'hang': body = viewHang(st); mode = 'hang'; break;
    case 'hangRest': body = viewHangRest(st); mode = st.last ? '' : 'rest'; break;
    case 'boulder': body = viewBoulder(); break;
    case 'bw': body = viewBw(st); break;
    case 'bwRest': body = viewBwRest(st); mode = 'rest'; break;
    case 'summary': body = viewSummary(); break;
  }

  // Pulsanti di controllo comuni
  const ctrls = [];
  if (run.timer && st.kind !== 'hangCountdown') {
    ctrls.push(`<button class="ctrl" data-act="pause">${L.timerIsPaused(run.timer) ? '▶ Riprendi' : '⏸ Pausa'}</button>`);
  }
  if (run.timer || ['hangCountdown', 'hang', 'hangRest'].includes(st.kind)) {
    ctrls.push(`<button class="ctrl" data-act="repeat">↺ Ripeti</button>`);
  }
  if (!['summary', 'hangConfirm'].includes(st.kind)) {
    ctrls.push(`<button class="ctrl" data-act="skip">⏭ Salta</button>`);
  }
  const controls = ctrls.length ? `<footer class="controls">${ctrls.join('')}</footer>` : '';

  return `<div class="session mode-${mode}">${top}<main class="sbody">${body}</main>${controls}</div>`;
}

function viewWarmup() {
  const s = state.settings;
  const checks = run.session.warmup.checks;
  const items = [...L.WARMUP_MOBILITY, ...Array.from({ length: s.warmupBlocks }, (_, i) => `Blocco facile ${i + 1}`)];
  return `<h1 class="step-title">Riscaldamento</h1>
    <p class="muted center">Mobilità + ${s.warmupBlocks} blocchi facili progressivi</p>
    ${clockHtml('lg')}
    <div class="checklist">${items.map((t, i) =>
      `<button class="check ${checks[i] ? 'on' : ''}" data-act="check" data-i="${i}"><span class="box">${checks[i] ? '✓' : ''}</span>${esc(t)}</button>`).join('')}
    </div>
    <button class="cta" data-act="next">Riscaldamento fatto →</button>`;
}

function viewHangConfirm() {
  return `<div class="center-block">
    <div class="big-emoji">🔥</div>
    <h1 class="step-title">Riscaldamento completato?</h1>
    <p class="muted center">Le dita devono essere calde prima dei Max Hangs.</p>
    <button class="cta" data-act="confirmWarm">Sì, iniziamo</button>
    <button class="cta ghost" data-act="backWarm">No, torna al riscaldamento</button>
  </div>`;
}

function loadLabel(kg) {
  if (!kg) return 'Peso corporeo';
  return kg > 0 ? `Zavorra +${kg} kg` : `Alleggerimento −${Math.abs(kg)} kg`;
}

function viewHangSetup() {
  const h = run.session.hang;
  const s = state.settings;
  const grips = ['Half crimp', 'Open hand', 'Full crimp'];
  return `<h1 class="step-title">Hangboard · Max Hangs</h1>
    <p class="muted center">${s.hangReps} × ${s.hangSec} s · recupero ${L.formatClock(s.hangRestSec * 1000)}</p>
    <div class="setup-row">
      <div class="label">Tacca</div>
      <div class="stepper">
        <button data-act="hangEdge" data-d="-1">−</button>
        <div class="val">${h.edgeMm}<small> mm</small></div>
        <button data-act="hangEdge" data-d="1">+</button>
      </div>
    </div>
    <div class="setup-row">
      <div class="label">Presa</div>
      <div class="chips">${grips.map(g => `<button class="chip ${h.grip === g ? 'on' : ''}" data-act="hangGrip" data-v="${g}">${g}</button>`).join('')}</div>
    </div>
    <div class="setup-row">
      <div class="label">Carico · ${esc(loadLabel(h.addedKg))}</div>
      <div class="stepper">
        <button data-act="hangLoad" data-d="-0.5">−</button>
        <div class="val">${h.addedKg > 0 ? '+' : ''}${h.addedKg}<small> kg</small></div>
        <button data-act="hangLoad" data-d="0.5">+</button>
      </div>
      <p class="hint">Totale ${L.round1(h.bodyKg + h.addedKg)} kg (peso corporeo ${h.bodyKg} kg). Le modifiche valgono per oggi; per renderle fisse usa Impostazioni.</p>
    </div>
    <div class="note">🎯 Target RPE ≈ ${s.rpeTarget}: alla fine dei ${s.hangSec} s dovresti poter tenere ancora 2–3 s.</div>
    <button class="cta" data-act="next">Inizia sospensioni →</button>`;
}

function hangCount() { return run.steps.filter(x => x.kind === 'hang').length; }

function viewCountdown(st) {
  const sec = Math.ceil(L.timerRemaining(run.timer, now()) / 1000);
  return `<div class="center-block">
    <div class="rep-label">Sospensione ${st.rep + 1}/${hangCount()}</div>
    <div class="clock xxl" data-clock data-secs>${sec}</div>
    <div class="phase-word">Preparati</div>
  </div>`;
}

function viewHang(st) {
  const h = run.session.hang;
  const sec = Math.ceil(L.timerRemaining(run.timer, now()) / 1000);
  return `<div class="center-block">
    <div class="rep-label">Sospensione ${st.rep + 1}/${hangCount()} · ${h.edgeMm} mm · ${esc(loadLabel(h.addedKg))}</div>
    <div class="clock xxl" data-clock data-secs>${sec}</div>
    <div class="phase-word">APPESO</div>
    ${L.timerIsPaused(run.timer) ? '<p class="center">In pausa</p>' : ''}
    <button class="cta ghost" data-act="failHang">Ceduto prima</button>
  </div>`;
}

function viewHangRest(st) {
  const r = run.session.hang.reps[st.rep];
  const s = state.settings;
  const ok = (r.heldS ?? r.targetS) >= r.targetS;
  const rpeBtns = Array.from({ length: 10 }, (_, i) => i + 1).map(v =>
    `<button class="rpe ${r.rpe === v ? 'on' : ''} ${v === s.rpeTarget ? 'target' : ''}" data-act="rpe" data-v="${v}">${v}</button>`).join('');
  return `<div class="rep-label center">Sospensione ${st.rep + 1}/${hangCount()} · registrazione</div>
    ${st.last ? '' : `<div class="rest-label">Recupero</div>${clockHtml('lg')}`}
    <div class="setup-row">
      <div class="label">Tenuta ${ok ? '✓ completa' : '⚠ ceduto'}</div>
      <div class="stepper">
        <button data-act="held" data-d="-1">−</button>
        <div class="val">${r.heldS ?? r.targetS}<small> / ${r.targetS} s</small></div>
        <button data-act="held" data-d="1">+</button>
      </div>
    </div>
    <div class="setup-row">
      <div class="label">RPE · sforzo percepito</div>
      <div class="rpe-grid">${rpeBtns}</div>
      <p class="hint">Target ≈ ${s.rpeTarget}: margine di 2–3 s prima del cedimento.</p>
    </div>
    ${st.last ? '<button class="cta" data-act="next">Concludi hangboard →</button>' : ''}`;
}

function viewBoulder() {
  const s = state.settings;
  const limitPhase = L.timerElapsed(run.timer, now()) < s.boulderLimitMin * L.MIN;
  const banner = run.session.deload
    ? '<div class="note">🌿 Settimana di scarico: solo blocchi facili.</div>'
    : limitPhase
      ? `<div class="note accent">🔥 Primi ${s.boulderLimitMin} min: 2–3 blocchi vicini al tuo limite.</div>`
      : '<div class="note">🧗 Blocchi liberi, a sensazione.</div>';
  return `<h1 class="step-title">Boulder libero</h1>
    ${clockHtml('lg')}
    ${banner}
    <label class="label" for="notes">Note (blocchi tentati/chiusi, grado)</label>
    <textarea id="notes" data-input="notes" rows="4" placeholder="es. 6b chiuso al 3° tentativo, 6c lavorato">${esc(run.session.boulder.notes)}</textarea>
    <button class="cta" data-act="next">Boulder finito →</button>`;
}

function viewBw(st) {
  const ex = L.BW_EXERCISES[st.exIndex];
  const e = run.session.bodyweight.rounds[st.round][st.exIndex];
  const isTime = ex.unit === 's';
  const stopwatch = isTime ? `<div class="stopwatch">
      ${run.hollow
        ? `<div class="clock lg" data-stopwatch>${Math.floor((now() - run.hollow.startedAt) / 1000)} s</div>
           <button class="cta" data-act="hollowStop">■ Stop</button>`
        : '<button class="cta secondary" data-act="hollowStart">▶ Avvia cronometro</button>'}
    </div>` : '';
  const load = ex.loadable ? `<div class="setup-row">
      <div class="label">Carico</div>
      <div class="stepper small">
        <button data-act="bwLoad" data-d="-1">−</button>
        <div class="val">${e.loadKg ? `${e.loadKg > 0 ? '+' : ''}${e.loadKg}<small> kg</small>` : '<small>nessuno</small>'}</div>
        <button data-act="bwLoad" data-d="1">+</button>
      </div>
    </div>` : '';
  return `<div class="rep-label center">Giro ${st.round + 1}/${state.settings.bwRounds} · esercizio ${st.exIndex + 1}/${L.BW_EXERCISES.length}</div>
    <h1 class="step-title">${esc(ex.name)}</h1>
    <p class="muted center">Obiettivo ${ex.min}–${ex.max} ${ex.unit}</p>
    ${stopwatch}
    <div class="stepper huge">
      <button data-act="bwVal" data-d="-1">−</button>
      <div class="val">${e.value}<small> ${ex.unit}</small></div>
      <button data-act="bwVal" data-d="1">+</button>
    </div>
    ${load}
    <button class="cta" data-act="bwDone">Fatto ✓</button>`;
}

function viewBwRest(st) {
  const nextEx = L.BW_EXERCISES[0];
  return `<div class="center-block">
    <div class="rest-label">Recupero tra i giri</div>
    ${clockHtml('xl')}
    <p class="muted center">Prossimo: giro ${st.round + 2}/${state.settings.bwRounds} · ${esc(nextEx.name)}</p>
  </div>`;
}

function sessionSummaryHtml(s) {
  const parts = [];
  if (s.deload) parts.push('<div class="badge">🌿 Scarico</div>');
  if (s.pain) parts.push('<div class="badge danger">🩹 Dolore alle dita</div>');
  parts.push(`<div class="sum-row"><b>Riscaldamento</b><span>${s.warmup?.done ? '✓ completato' : '—'}</span></div>`);
  if (s.hang) {
    const st = L.hangStats(s);
    if (s.hang.skipped) parts.push('<div class="sum-row"><b>Hangboard</b><span>saltato</span></div>');
    else {
      parts.push(`<div class="sum-row"><b>Hangboard</b><span>${s.hang.edgeMm} mm ${esc(s.hang.grip)} · ${esc(loadLabel(s.hang.addedKg))}${s.hang.interrupted ? ' · interrotto' : ''}</span></div>`);
      parts.push(`<div class="reps">${s.hang.reps.map((r, i) =>
        `<div class="rep ${!r.done ? 'skip' : (r.heldS ?? r.targetS) < r.targetS ? 'fail' : ''}"><small>#${i + 1}</small>${r.done ? `${r.heldS ?? r.targetS}s` : '—'}<small>${r.done ? `RPE ${r.rpe}` : ''}</small></div>`).join('')}</div>`);
      if (st) parts.push(`<p class="hint">RPE medio ${L.round1(st.avgRpe)} · ${st.completed}/${st.planned} tenute complete</p>`);
    }
  }
  parts.push(`<div class="sum-row"><b>Boulder</b><span>${Math.round((s.boulder?.elapsedMs || 0) / L.MIN)} min</span></div>`);
  if (s.boulder?.notes) parts.push(`<p class="notes">${esc(s.boulder.notes)}</p>`);
  const rounds = s.bodyweight?.rounds || [];
  parts.push(`<table class="bw-table"><tr><th></th>${rounds.map((_, i) => `<th>G${i + 1}</th>`).join('')}</tr>
    ${L.BW_EXERCISES.map((ex, ei) => `<tr><td>${esc(ex.name)}</td>${rounds.map(r => {
      const e = r[ei];
      return `<td>${e?.done ? `${e.value}${e.loadKg ? `<small>${e.loadKg > 0 ? '+' : ''}${e.loadKg}kg</small>` : ''}` : '—'}</td>`;
    }).join('')}</tr>`).join('')}</table>`);
  return parts.join('');
}

function viewSummary() {
  return `<h1 class="step-title">Sessione completata 💪</h1>
    <div class="card">${sessionSummaryHtml(run.session)}</div>
    <button class="cta" data-act="finish">Salva sessione</button>`;
}

function viewPainStop() {
  return `<div class="session"><main class="sbody"><div class="center-block">
    <div class="big-emoji">🩹</div>
    <h1 class="step-title">Hangboard interrotto</h1>
    <p class="center">Evento annotato nello storico. Oggi niente carichi sulle dita: se il dolore persiste, fermati e valuta un consulto.</p>
    <button class="cta" data-act="finish">Termina e salva</button>
    <button class="cta ghost" data-act="painContinue">Continua solo con corpo libero</button>
  </div></main></div>`;
}

// Aggiorna solo i numeri dei timer (senza ridisegnare: non perde il focus sulle note).
function updateClocks() {
  if (!run || ui.screen !== 'session') return;
  const rem = L.timerRemaining(run.timer, now());
  $app.querySelectorAll('[data-clock]').forEach(el => {
    el.textContent = el.hasAttribute('data-secs') ? Math.ceil(rem / 1000) : L.formatClock(rem);
  });
  $app.querySelectorAll('[data-bar]').forEach(el => { el.style.width = `${barPct()}%`; });
  if (run.hollow) {
    const el = $app.querySelector('[data-stopwatch]');
    if (el) el.textContent = `${Math.floor((now() - run.hollow.startedAt) / 1000)} s`;
  }
}

// =====================================================================
// HOME
// =====================================================================
function viewHome() {
  const s = state.settings;
  const t = now();
  const dl = L.deloadStatus(state, t);
  const prog = L.progressionSuggestion(state, t);
  const last = state.sessions[state.sessions.length - 1];
  const cards = [];

  if (dl.active) {
    cards.push(`<div class="card deload"><h3>🌿 Settimana di scarico</h3>
      <p>Fino a ${fmtDate(dl.until)}: niente hangboard, solo boulder facile e corpo libero.</p>
      <button class="btn ghost" data-act="endDeload">Termina scarico ora</button></div>`);
  } else if (dl.propose) {
    cards.push(`<div class="card deload"><h3>🌿 Settimana di scarico?</h3>
      <p>Sono passate ${Math.floor(dl.weeks)} settimane dall'ultimo scarico${dl.overdue ? ' (consigliato ogni 6–8)' : ''}. Una settimana senza hangboard, solo boulder facile.</p>
      <div class="row"><button class="btn primary" data-act="startDeload">Inizia scarico</button>
      <button class="btn ghost" data-act="snoozeDeload">Più avanti</button></div></div>`);
  }

  if (prog) {
    const load = prog.options.find(o => o.type === 'load');
    const edge = prog.options.find(o => o.type === 'edge');
    cards.push(`<div class="card prog"><h3>📈 Pronto per progredire</h3>
      <p>${Math.floor(prog.weeks)} settimane e ${prog.sessions} sessioni complete con RPE ≤ ${s.rpeTarget}. Scegli <b>una</b> delle due opzioni:</p>
      <div class="col">
        <button class="btn primary" data-act="applyProg" data-type="load">Carico ${esc(L.fmtKg(load.fromKg))} → ${esc(L.fmtKg(load.toKg))} <small>(+${load.pct}%)</small></button>
        ${edge ? `<button class="btn primary" data-act="applyProg" data-type="edge">Tacca ${edge.fromMm} → ${edge.toMm} mm</button>` : ''}
        <button class="btn ghost" data-act="snoozeProg">Non ora</button>
      </div></div>`);
  }

  const deload = dl.active;
  return `<div class="page">
    <header class="hero">
      <div class="logo">🧗</div>
      <div><h1>Scheda arrampicata</h1>
      <p class="muted">${last ? `Ultima sessione: ${fmtDate(last.date)}` : 'Nessuna sessione ancora'}</p></div>
    </header>
    ${cards.join('')}
    <div class="card plan">
      <div class="plan-row"><span>1</span><i class="pl">Riscaldamento</i> <b>${s.warmupMin} min</b></div>
      <div class="plan-row ${deload ? 'off' : ''}"><span>2</span><i class="pl">Max Hangs</i> <b>${s.hangReps}×${s.hangSec}s · ${s.edgeMm} mm · ${esc(L.fmtKg(s.addedKg))}</b></div>
      <div class="plan-row"><span>3</span><i class="pl">Boulder${deload ? ' facile' : ''}</i> <b>${s.boulderMin} min</b></div>
      <div class="plan-row"><span>4</span><i class="pl">Corpo libero</i> <b>${s.bwRounds} giri</b></div>
    </div>
    <button class="cta start" data-act="start">${deload ? 'Inizia sessione di scarico' : 'Inizia sessione'}</button>
  </div>`;
}

// =====================================================================
// STORICO
// =====================================================================
function viewHistory() {
  const sessions = [...state.sessions].sort((a, b) => a.date - b.date);
  let prevEdge = null;
  const hangPts = [];
  for (const s of sessions) {
    const st = L.hangStats(s);
    if (!st) continue;
    hangPts.push({ x: s.date, y: st.totalKg, tag: st.edgeMm !== prevEdge ? `${st.edgeMm}mm` : '' });
    prevEdge = st.edgeMm;
  }
  const pullPts = sessions.map(s => ({ x: s.date, y: L.bwTotal(s, 'pullup') })).filter(p => p.y != null);

  const list = [...sessions].reverse().map(s => {
    const st = L.hangStats(s);
    const pull = L.bwTotal(s, 'pullup');
    const chips = [];
    if (s.deload) chips.push('<span class="badge">🌿 scarico</span>');
    if (s.pain) chips.push('<span class="badge danger">🩹 dolore</span>');
    if (st) chips.push(`<span class="badge">${st.edgeMm}mm · ${st.totalKg}kg · RPE ${L.round1(st.avgRpe)}</span>`);
    if (pull != null) chips.push(`<span class="badge">trazioni ${pull}</span>`);
    return `<button class="hist-item" data-act="detail" data-id="${esc(s.id)}">
      <div class="hist-date">${fmtDate(s.date)} <small>${fmtTime(s.date)}</small></div>
      <div class="chips-row">${chips.join('')}</div></button>`;
  }).join('');

  const events = [...state.events].reverse().slice(0, 20).map(e => {
    const icon = { pain: '🩹', progression: '📈', deload: '🌿' }[e.type] || '•';
    return `<li><span>${icon}</span><div>${esc(e.text)}<small>${fmtDate(e.ts)}</small></div></li>`;
  }).join('');

  return `<div class="page">
    <h1 class="page-title">Storico</h1>
    <div class="card"><h3>Hangboard · carico totale (kg)</h3>${lineChart(hangPts, { unit: 'kg' })}</div>
    <div class="card"><h3>Trazioni · ripetizioni totali</h3>${lineChart(pullPts, { unit: 'rip', color: 'var(--blue)' })}</div>
    ${events ? `<div class="card"><h3>Eventi</h3><ul class="events">${events}</ul></div>` : ''}
    <h3 class="section">Sessioni (${sessions.length})</h3>
    ${list || '<p class="muted">Nessuna sessione salvata.</p>'}
  </div>`;
}

function viewDetail() {
  const s = state.sessions.find(x => x.id === ui.detailId);
  if (!s) { ui.screen = 'history'; return viewHistory(); }
  const dur = s.endedAt ? Math.round((s.endedAt - s.date) / L.MIN) : null;
  return `<div class="page">
    <button class="back" data-act="nav" data-to="history">← Storico</button>
    <h1 class="page-title">${fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h1>
    <p class="muted">${fmtTime(s.date)}${dur ? ` · ${dur} min` : ''}</p>
    <div class="card">${sessionSummaryHtml(s)}</div>
    <button class="btn danger wide" data-act="deleteSession" data-id="${esc(s.id)}">Elimina sessione</button>
  </div>`;
}

// =====================================================================
// IMPOSTAZIONI
// =====================================================================
const SETTINGS_FORM = [
  ['Generale', [
    ['bodyKg', 'Peso corporeo', 'kg', 0.5],
  ]],
  ['Riscaldamento', [
    ['warmupMin', 'Durata', 'min', 1],
    ['warmupBlocks', 'Blocchi facili', '', 1],
  ]],
  ['Hangboard', [
    ['hangReps', 'Sospensioni', '', 1],
    ['hangSec', 'Durata sospensione', 's', 1],
    ['hangRestSec', 'Recupero', 's', 15],
    ['countdownSec', 'Conto alla rovescia', 's', 1],
    ['edgeMm', 'Tacca', 'mm', 1],
    ['addedKg', 'Carico (+ zavorra / − alleggerimento)', 'kg', 0.5],
    ['rpeTarget', 'RPE target', '', 1],
  ]],
  ['Boulder', [
    ['boulderMin', 'Durata', 'min', 1],
    ['boulderLimitMin', 'Minuti al limite', 'min', 1],
  ]],
  ['Corpo libero', [
    ['bwRounds', 'Giri', '', 1],
    ['bwRoundRestSec', 'Recupero tra i giri', 's', 15],
  ]],
  ['Progressione e scarico', [
    ['progressionMinWeeks', 'Proponi progressione dopo', 'sett.', 1],
    ['progressionMinSessions', 'Sessioni minime', '', 1],
    ['edgeStepMm', 'Riduzione tacca proposta', 'mm', 1],
    ['minEdgeMm', 'Tacca minima', 'mm', 1],
    ['deloadMinWeeks', 'Scarico ogni (min)', 'sett.', 1],
    ['deloadMaxWeeks', 'Scarico ogni (max)', 'sett.', 1],
  ]],
];

function viewSettings() {
  const s = state.settings;
  const groups = SETTINGS_FORM.map(([title, fields]) => `<div class="card"><h3>${title}</h3>
    ${fields.map(([key, label, unit, stepV]) => `<label class="field">
      <span>${label}</span>
      <span class="inp"><input type="number" inputmode="decimal" step="${stepV}" data-setting="${key}" value="${s[key]}">${unit ? `<em>${unit}</em>` : ''}</span>
    </label>`).join('')}
    ${title === 'Hangboard' ? `<label class="field"><span>Presa</span><span class="inp"><input type="text" data-setting="grip" value="${esc(s.grip)}"></span></label>` : ''}
  </div>`).join('');

  const notif = 'Notification' in window ? Notification.permission : 'unsupported';
  return `<div class="page">
    <h1 class="page-title">Impostazioni</h1>
    <div class="card"><h3>Segnali</h3>
      <label class="toggle"><span>Vibrazione</span><input type="checkbox" data-toggle="vibration" ${s.vibration ? 'checked' : ''}></label>
      ${notif === 'unsupported' ? '' : `<button class="btn ghost wide" data-act="notifPerm" ${notif === 'granted' ? 'disabled' : ''}>${notif === 'granted' ? '🔔 Notifiche attive' : '🔔 Attiva notifiche (schermo bloccato)'}</button>`}
    </div>
    ${groups}
    <div class="card"><h3>Backup dati</h3>
      <p class="hint">I dati sono salvati solo su questo telefono. Esporta un backup ogni tanto.</p>
      <div class="col">
        <button class="btn primary" data-act="exportJSON">Esporta backup JSON</button>
        <button class="btn" data-act="exportCSV">Esporta CSV (foglio di calcolo)</button>
        <label class="btn">Importa da JSON<input type="file" accept=".json,application/json" data-import hidden></label>
        <button class="btn danger" data-act="resetAll">Cancella tutti i dati</button>
      </div>
    </div>
    <p class="muted center small">Scheda arrampicata · v1.0</p>
  </div>`;
}

async function shareOrDownload(filename, text, mime) {
  const file = new File([text], filename, { type: mime });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return; // condivisione annullata dall'utente
  }
  // Ripiego: download diretto del file
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// =====================================================================
// RENDER
// =====================================================================
function nav() {
  const tabs = [['home', '🏠', 'Home'], ['history', '📊', 'Storico'], ['settings', '⚙️', 'Impostazioni']];
  const cur = ui.screen === 'detail' ? 'history' : ui.screen;
  return `<nav class="tabbar">${tabs.map(([id, ic, label]) =>
    `<button class="${cur === id ? 'on' : ''}" data-act="nav" data-to="${id}"><span>${ic}</span>${label}</button>`).join('')}</nav>`;
}

function render() {
  // Conserva lo scroll quando si ridisegna la stessa schermata
  const scroller = $app.querySelector('.page, .sbody');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  const prevScreen = render._screen;

  let html;
  if (ui.screen === 'session' && run) html = viewSession();
  else {
    if (ui.screen === 'session') ui.screen = 'home';
    const views = { home: viewHome, history: viewHistory, detail: viewDetail, settings: viewSettings };
    html = `<div class="shell">${(views[ui.screen] || viewHome)()}${nav()}</div>`;
  }
  if (ui.modal) {
    html += `<div class="overlay"><div class="modal">
      <h2>${esc(ui.modal.title)}</h2><p>${esc(ui.modal.text)}</p>
      ${ui.modal.buttons.map((b, i) => `<button class="btn wide ${b.cls || ''}" data-act="modal" data-i="${i}">${esc(b.label)}</button>`).join('')}
    </div></div>`;
  }
  if (ui.toast) html += `<div class="toast">${esc(ui.toast)}</div>`;

  // Non ridisegnare mentre si scrive nelle note (si perderebbe la tastiera)
  const active = document.activeElement;
  if (active && active.matches?.('textarea[data-input]') && ui.screen === 'session' && !ui.modal) {
    updateClocks();
    return;
  }
  $app.innerHTML = html;
  const key = `${ui.screen}:${run?.idx ?? ''}`;
  if (key === prevScreen) {
    const sc = $app.querySelector('.page, .sbody');
    if (sc) sc.scrollTop = scrollTop;
  }
  render._screen = key;
}

// =====================================================================
// GESTIONE TOCCHI E INPUT
// =====================================================================
const actions = {
  start: () => startSession(),
  next: () => next(),
  pause: () => togglePause(),
  skip: () => skip(),
  repeat: () => repeat(),
  exit: () => exitPressed(),
  pain: () => painPressed(),
  finish: () => finishSession(),
  failHang: () => failHang(),
  confirmWarm: () => { run.session.warmup.done = true; next(); },
  backWarm: () => goToIndex(0),
  painContinue: () => {
    run.painStopped = false;
    enterStep(idxOf(x => x.kind === 'bw'));
    render();
  },
  check: el => {
    const i = Number(el.dataset.i);
    run.session.warmup.checks[i] = !run.session.warmup.checks[i];
    persistRun(); render();
  },
  hangEdge: el => {
    const h = run.session.hang;
    h.edgeMm = clamp(h.edgeMm + Number(el.dataset.d), 4, 60);
    persistRun(); render();
  },
  hangGrip: el => { run.session.hang.grip = el.dataset.v; persistRun(); render(); },
  hangLoad: el => {
    const h = run.session.hang;
    h.addedKg = L.round1(clamp(h.addedKg + Number(el.dataset.d), -60, 100));
    persistRun(); render();
  },
  rpe: el => {
    run.session.hang.reps[step().rep].rpe = Number(el.dataset.v);
    persistRun(); render();
  },
  held: el => {
    const r = run.session.hang.reps[step().rep];
    r.heldS = clamp((r.heldS ?? r.targetS) + Number(el.dataset.d), 0, r.targetS + 30);
    persistRun(); render();
  },
  bwVal: el => {
    const st = step();
    const e = run.session.bodyweight.rounds[st.round][st.exIndex];
    e.value = clamp(Number(e.value) + Number(el.dataset.d), 0, 999);
    persistRun(); render();
  },
  bwLoad: el => {
    const st = step();
    const e = run.session.bodyweight.rounds[st.round][st.exIndex];
    e.loadKg = clamp((e.loadKg || 0) + Number(el.dataset.d), -50, 100);
    persistRun(); render();
  },
  bwDone: () => {
    const st = step();
    run.session.bodyweight.rounds[st.round][st.exIndex].done = true;
    next();
  },
  hollowStart: () => {
    run.hollow = { startedAt: now() };
    render();
  },
  hollowStop: () => {
    const st = step();
    const e = run.session.bodyweight.rounds[st.round][st.exIndex];
    e.value = Math.floor((now() - run.hollow.startedAt) / 1000);
    run.hollow = null;
    persistRun(); render();
  },
  // --- home ---
  startDeload: () => { state = L.startDeload(state, now()); persist(); toast('🌿 Settimana di scarico iniziata'); },
  snoozeDeload: () => { state = L.snoozeDeload(state, now()); persist(); render(); },
  endDeload: () => modal('Terminare lo scarico?', 'Dalla prossima sessione torna l\'hangboard.', [
    { label: 'Sì, termina', cls: 'primary', fn: () => { state = L.endDeloadNow(state, now()); persist(); render(); } },
    { label: 'Annulla', cls: 'ghost' },
  ]),
  applyProg: el => {
    const sug = L.progressionSuggestion(state, now());
    const opt = sug?.options.find(o => o.type === el.dataset.type);
    if (!opt) return;
    state = L.applyProgression(state, opt, now());
    persist();
    toast('📈 Progressione applicata');
  },
  snoozeProg: () => { state = L.snoozeProgression(state, now()); persist(); render(); },
  // --- navigazione / storico ---
  nav: el => { ui.screen = el.dataset.to; render(); window.scrollTo(0, 0); },
  detail: el => { ui.detailId = el.dataset.id; ui.screen = 'detail'; render(); },
  deleteSession: el => modal('Eliminare la sessione?', 'L\'operazione non si può annullare.', [
    { label: 'Elimina', cls: 'danger', fn: () => {
      state.sessions = state.sessions.filter(s => s.id !== el.dataset.id);
      persist(); ui.screen = 'history'; toast('Sessione eliminata');
    } },
    { label: 'Annulla', cls: 'ghost' },
  ]),
  // --- impostazioni ---
  notifPerm: async () => { await F.askNotificationPermission(); render(); },
  exportJSON: () => shareOrDownload(`scheda-arrampicata-${stamp()}.json`, L.toJSON(state), 'application/json'),
  exportCSV: () => shareOrDownload(`scheda-arrampicata-${stamp()}.csv`, L.toCSV(state), 'text/csv'),
  resetAll: () => modal('Cancellare tutti i dati?', 'Sessioni, eventi e impostazioni verranno eliminati. Fai prima un backup!', [
    { label: 'Cancella tutto', cls: 'danger', fn: () => { state = L.initialState(now()); persist(); toast('Dati cancellati'); } },
    { label: 'Annulla', cls: 'ghost' },
  ]),
  modal: el => {
    const b = ui.modal?.buttons[Number(el.dataset.i)];
    ui.modal = null;
    if (b?.fn) b.fn(); else render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el);
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.matches('[data-input="notes"]') && run) {
    run.session.boulder.notes = el.value;
    persistRun();
  }
});

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.matches('[data-setting]')) {
    const key = el.dataset.setting;
    if (el.type === 'number') {
      const v = parseFloat(el.value.replace(',', '.'));
      if (Number.isNaN(v)) { render(); return; }
      state.settings[key] = v;
    } else {
      state.settings[key] = el.value.trim() || L.defaultSettings()[key];
    }
    persist();
  } else if (el.matches('[data-toggle]')) {
    state.settings[el.dataset.toggle] = el.checked;
    F.setFeedbackOptions({ vibration: state.settings.vibration });
    persist();
  } else if (el.matches('[data-import]') && el.files?.[0]) {
    try {
      const imported = L.fromJSON(await el.files[0].text(), now());
      modal('Importare il backup?', `Contiene ${imported.sessions.length} sessioni. I dati attuali verranno sostituiti.`, [
        { label: 'Importa', cls: 'primary', fn: () => { state = imported; persist(); toast('✅ Backup importato'); } },
        { label: 'Annulla', cls: 'ghost' },
      ]);
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    }
    el.value = '';
  }
});

// Service worker: rende l'app installabile e utilizzabile offline.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW non registrato', err));
}

render();
tick();
