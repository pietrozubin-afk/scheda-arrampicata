// =====================================================================
// feedback.js — vibrazione, schermo sempre acceso, notifiche.
// L'app non emette suoni: i segnali sono solo vibrazione e grafica.
// =====================================================================

let opts = { vibration: true };

export function setFeedbackOptions(o) {
  opts = { ...opts, ...o };
}

// Schemi di vibrazione:
//  go    = inizio sospensione
//  end   = fine sospensione
//  done  = fine recupero / fine fase
//  tick  = avviso breve
//  alert = dolore alle dita
const VIBES = {
  go: [500],
  end: [200, 100, 200],
  done: [300, 120, 300, 120, 300],
  tick: [60],
  alert: [800],
};

export function vibrate(kind) {
  if (!opts.vibration || !navigator.vibrate) return;
  try { navigator.vibrate(VIBES[kind] || [200]); } catch { /* ignorato */ }
}

// ------------------------- Schermo sempre acceso -------------------------
let wakeLock = null;
let wantWake = false;

export async function keepScreenOn(on) {
  wantWake = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* non supportato o rifiutato */ }
}

// Il wake lock si perde quando l'app va in background: lo riprendiamo al ritorno.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake) keepScreenOn(true);
});

// ------------------------------ Notifiche ------------------------------
export async function askNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

// Mostra una notifica solo se l'app non è visibile (es. schermo bloccato).
// "silent" evita il suono di sistema: resta solo la vibrazione.
export async function notify(title, body) {
  if (document.visibilityState === 'visible') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const options = { body, tag: 'sessione', renotify: true, silent: true, vibrate: [300, 100, 300], icon: 'icons/icon-192.png' };
    if (reg) reg.showNotification(title, options);
    else new Notification(title, options);
  } catch { /* ignorato */ }
}
