# Contesto per Claude

App per la scheda di allenamento di arrampicata del proprietario (uso personale,
su Samsung Galaxy S22+). Struttura, funzioni e istruzioni di build sono nel
[README](README.md): leggilo per primo. Qui ci sono le decisioni prese durante
lo sviluppo che dal codice non si vedono.

## Lingua e stile
- Tutto in **italiano**: interfaccia, commenti nel codice, messaggi di commit, risposte.
- Il proprietario non è uno sviluppatore: spiegazioni semplici, niente gergo.

## Decisioni di prodotto (da rispettare)
- **PWA, non app nativa.** La specifica iniziale chiedeva Kotlin/Compose/Room con APK;
  il proprietario ha scelto esplicitamente la PWA. Non riproporre il nativo.
  Requisiti tradotti: Room → localStorage; foreground service → timer basati su
  timestamp + Wake Lock (schermo sempre acceso) + notifiche best-effort.
- **Nessun suono.** Rimossi su richiesta: segnali solo con vibrazione, colori dello
  schermo e notifiche silenziose. Non reintrodurre audio.
- **Sessioni A (Limite) e B (Volume)** con alternanza suggerita; in settimana di
  scarico niente scelta (tipo `S`). Sessioni precedenti ad A/B migrate come
  "non classificate" (`U`), quelle di scarico come `S`.
- **Livelli** della palestra su scala propria 1–7 (volume default 4, progetto default 5).
- **Ordine corpo libero**: trazioni → addominali (hollow body) → piegamenti → affondi.
  Le sessioni salvate identificano gli esercizi per `id`, non per posizione.
- **Progressione hangboard**: proporre +2–5% di carico **oppure** tacca −2 mm, mai
  entrambe; conta sessioni A e B, esclude A con hangboard saltato, scarico e dolore.
- **Icona**: variante `geo-bauhaus` (geometrica, chiara, colorata). Il proprietario
  ha scartato le montagne stilizzate. Le icone si rigenerano con
  `icons/genera-icona.ps1 -Variant geo-bauhaus` (192, 512 e `-Maskable`).

## Dati
- Stato in `localStorage` (`scheda-arrampicata.state.v1`, con campo `version`, ora 2)
  e sessione in corso in `scheda-arrampicata.run.v1`.
- Ogni cambio di formato richiede una migrazione in `migrateState`/`migrateSession`
  (in `js/logic.js`) con test: i dati reali sul telefono non vanno mai persi.
- Esportazione JSON/CSV e importazione JSON devono includere i campi nuovi.

## Ambiente sul PC
- Windows, niente Node e niente Python. Server locale: `serve.ps1` (porta 8080),
  configurato in `../.claude/launch.json` come `scheda-arrampicata`.
- Test: aprire `http://localhost:8080/tests/` nel browser (57 test, tutti verdi).
  Aggiungere test in `tests/logic.test.js` per ogni logica nuova.
- PowerShell: le coordinate negative nello script delle icone vanno tra parentesi, es. `(PT (-0.05) 1)`.

## Pubblicazione
- Repository pubblico GitHub `pietrozubin-afk/scheda-arrampicata`, ramo `main`,
  servito da GitHub Pages: https://pietrozubin-afk.github.io/scheda-arrampicata/
- `gh` è installato in `C:\Program Files\GitHub CLI` (in bash: aggiungerlo al PATH) e già autenticato.
- A ogni modifica: incrementare `VERSION` in `sw.js` (ora `v5`), commit, push,
  poi verificare che Pages serva i file nuovi. Il telefono si aggiorna alla prima
  apertura con connessione; l'icona in Home può richiedere ore o una reinstallazione.
- Il proprietario ha chiesto di pubblicare le modifiche: dopo ogni lavoro concluso si pubblica.
