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
- **Hangboard diverso per sessione** (scelta del proprietario, nov 2026): A = **Max Hangs**
  (5 × 10 s, recupero 3 min), B = **Repeaters** (3 serie × 6 rip. da 7 s appeso / 3 s
  riposo, 3 min tra le serie). Tacca, presa e carico separati (`edgeMm/addedKg/grip`
  vs `repEdgeMm/repAddedKg/repGrip`). Ogni sessione salvata ha `hang.protocol`
  (`'max'` o `'repeaters'`): statistiche e progressione si basano su quello, non sul tipo.
- **Progressione hangboard**: mai carico e tacca insieme; +2–5% di carico **oppure**
  tacca −2 mm. Separata per metodo (`progression` e `progressionRep` nello stato).
  Max Hangs: contano tutte le sessioni con protocol `max` (anche le B vecchie).
  Repeaters: prima +1 serie (3→5), poi carico o tacca e le serie tornano a 3.
  Escluse sempre: hangboard saltato, scarico, dolore.
- **Obiettivi boulder** (da indicazioni di coach, vedi README): volume B = 15 blocchi
  (12–20) in 40 min; progetti A = 2, massimo 3 (dal quarto l'app chiede conferma).
- **Icona**: variante `geo-bauhaus` (geometrica, chiara, colorata). Il proprietario
  ha scartato le montagne stilizzate. Le icone si rigenerano con
  `icons/genera-icona.ps1 -Variant geo-bauhaus` (192, 512 e `-Maskable`).

## Dati
- Stato in `localStorage` (`scheda-arrampicata.state.v1`, con campo `version`, ora 3)
  e sessione in corso in `scheda-arrampicata.run.v1`.
- Ogni cambio di formato richiede una migrazione in `migrateState`/`migrateSession`
  (in `js/logic.js`) con test: i dati reali sul telefono non vanno mai persi.
- Esportazione JSON/CSV e importazione JSON devono includere i campi nuovi.

## Ambiente sul PC
- Windows, niente Node e niente Python. Server locale: `serve.ps1` (porta 8080),
  configurato in `../.claude/launch.json` come `scheda-arrampicata`.
- Test: aprire `http://localhost:8080/tests/` nel browser (74 test, tutti verdi).
  Aggiungere test in `tests/logic.test.js` per ogni logica nuova.
- PowerShell: le coordinate negative nello script delle icone vanno tra parentesi, es. `(PT (-0.05) 1)`.

## Pubblicazione
- Repository pubblico GitHub `pietrozubin-afk/scheda-arrampicata`, ramo `main`,
  servito da GitHub Pages: https://pietrozubin-afk.github.io/scheda-arrampicata/
- Il progetto ora sta in `C:\Users\Martina\Desktop\CODE\scheda-arrampicata`. Su questo PC
  `gh` non è installato: si pubblica con `git push` (credenziali tramite Git Credential Manager).
- A ogni modifica: incrementare `VERSION` in `sw.js` (ora `v6`), commit, push,
  poi verificare che Pages serva i file nuovi. Il telefono si aggiorna alla prima
  apertura con connessione; l'icona in Home può richiedere ore o una reinstallazione.
- Il proprietario ha chiesto di pubblicare le modifiche: dopo ogni lavoro concluso si pubblica.
