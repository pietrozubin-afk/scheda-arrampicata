# Scheda arrampicata — PWA

Web app installabile (PWA) per seguire la scheda di arrampicata in palestra:
sessione guidata fase per fase, timer automatici per i Max Hangs, registrazione
rapida delle serie, storico con grafici, proposte di progressione e di scarico.
Funziona offline, senza login e senza server: i dati restano sul telefono.

## Struttura del progetto

```
scheda-arrampicata/
├── index.html             pagina unica dell'app
├── manifest.webmanifest   nome, icone, colori: rende l'app installabile
├── sw.js                  service worker: cache dei file per l'uso offline
├── css/style.css          tema scuro, pulsanti grandi
├── js/
│   ├── logic.js           logica pura: timer, piano sessione, progressione, scarico, CSV/JSON
│   ├── app.js             interfaccia: home, sessione guidata, storico, impostazioni
│   ├── store.js           salvataggio locale (localStorage) + sessione in corso
│   ├── feedback.js        vibrazione, schermo acceso, notifiche (nessun suono)
│   └── charts.js          grafici SVG senza librerie
├── icons/                 icone PNG (192, 512, maskable) + genera-icona.ps1 che le disegna
├── tests/
│   ├── index.html         esegue i test nel browser
│   └── logic.test.js      74 unit test (timer, sessioni A/B, repeaters, progressione, scarico, migrazione, export)
└── serve.ps1              piccolo server locale per provare l'app sul PC
```

## Le due sessioni: A (Limite) e B (Volume)

All'avvio si sceglie tra **Sessione A** e **Sessione B**. L'app evidenzia come
*consigliata* quella non fatta l'ultima volta (alternanza A/B; scarico e
sessioni non classificate non contano), ma si può sempre scegliere l'altra.
Riscaldamento e corpo libero sono uguali in entrambe; cambiano hangboard e
boulder.

| | Sessione A – Limite | Sessione B – Volume |
|---|---|---|
| Riscaldamento | 10 min + voce finale "1–2 blocchi di livello 4" | 10 min |
| Hangboard | **Max Hangs**: 5 sospensioni da 10 s, 3 min di recupero, con "Salta hangboard oggi" (con conferma, annotato nello storico) | **Repeaters**: 3 serie × 6 ripetizioni da 7 s appeso / 3 s riposo, 3 min tra le serie |
| Boulder | **al limite**, 35 min (30–40): 2 progetti di livello 5, massimo 3 (dal quarto l'app chiede conferma) | **a volume**, 40 min: obiettivo 15 blocchi di livello 4 (minimo 12, massimo 20) |
| Registrazione | per ogni progetto: tentativi, esito (chiuso / sezioni chiuse / non chiuso), stile, note | contatore "+1 chiuso" / "+1 non chiuso" con livello 3 / 4 / 5 a un tocco, "annulla ultimo" |
| Recupero | 3 min tra tentativi: parte toccando "Tentativo fatto" | 90 s tra blocchi: parte a ogni +1 |
| Promemoria | "Smetti quando i tentativi peggiorano invece di migliorare" | "Se cadi per stanchezza e non per difficoltà, scendi a livello 3" |

I **livelli** sono quelli della scala della palestra (1–7): livello volume
(default 4) e livello progetto (default 5) si aggiornano in Impostazioni quando
si migliora; il resto dell'app (riscaldamento, scelte rapide, promemoria) li
segue automaticamente.

In **settimana di scarico** non c'è scelta: la sessione è di tipo *Scarico*,
senza hangboard, con boulder facile.

## Come funziona la sessione

1. **Riscaldamento**: timer di 10 min e checklist (mobilità + 6 blocchi facili,
   + 1–2 blocchi di livello volume nella A).
2. **Conferma** "Riscaldamento completato?" prima dell'hangboard.
3. **Hangboard**: si sceglie tacca, presa e carico (precompilati; Max Hangs e
   repeaters hanno valori separati), poi tutto procede in automatico con
   vibrazione:
   - **A · Max Hangs**: per ogni sospensione 3-2-1 → 10 s appeso → recupero 3 min.
     Durante il recupero si inseriscono RPE (target ≈ 8) ed eventuali secondi
     in meno ("Ceduto prima").
   - **B · Repeaters**: per ogni serie 3-2-1 → 7 s appeso / 3 s molla × 6 →
     recupero 3 min. Puntini a schermo per le ripetizioni; "Ceduto" chiude la
     serie contando le ripetizioni tenute. Nel recupero si inseriscono RPE e
     ripetizioni tenute.
4. **Boulder**: al limite (A) o a volume (B), con timer della fase e timer di
   recupero separato.
5. **Corpo libero**: 3 giri × 4 esercizi (trazioni → addominali → piegamenti →
   affondi), valori precompilati dalla sessione
   precedente, cronometro per l'hollow body, recupero tra i giri.
6. **Riepilogo** e salvataggio.

## Storico

Ogni sessione ha un'etichetta colorata: **A** arancio, **B** blu, **Scarico**
verde, **Non classificata** grigio (sessioni salvate prima delle sessioni A/B).
Si può filtrare per tipo. Grafici: carico delle Max Hangs, carico dei
repeaters (con tacca e serie), tentativi e chiusure dei progetti (A), blocchi
chiusi (B), trazioni.

Sempre presenti: **Pausa / Ripeti / Salta** e il pulsante rosso
**🩹 Dolore dita**, che interrompe l'hangboard e annota l'evento nello storico
(un dolore blocca anche le proposte di progressione).

**Progressione**: separata per i due metodi. Serve almeno 2 settimane e 3
sessioni con la stessa configurazione, con le ultime 2 complete e con RPE ≤ target.
- **Max Hangs**: contano le sessioni fatte con le Max Hangs (le A, e le B
  fatte prima dei repeaters; non le A con hangboard saltato). La home propone
  *+2–5% di carico* **oppure** *tacca −2 mm*.
- **Repeaters**: prima si aggiunge una serie (da 3 fino a 5, carico e tacca
  invariati); arrivati a 5 serie si propone *+2–5% di carico* **oppure**
  *tacca −2 mm* e le serie ripartono da 3.

Si accetta una sola opzione per volta; ogni proposta si può rimandare di una
settimana.

**Scarico**: dopo 6 settimane la home propone una settimana di scarico (niente
hangboard, boulder facile). Se rimandata, si ripropone dopo una settimana e
comunque a 8 settimane.

Tutti i parametri si cambiano in **Impostazioni**, dove ci sono anche
l'esportazione **JSON / CSV** (condivisione Android) e l'importazione da JSON.
Il CSV ha la colonna `tipo` e una riga per ogni progetto (A) e per i blocchi
chiusi / non chiusi di ogni livello (B).

## Dati e migrazione

I dati hanno un numero di versione (`version` nello stato salvato). All'apertura
l'app converte automaticamente i dati della versione 1 (prima delle sessioni
A/B): le sessioni esistenti diventano *non classificate* (quelle di scarico
diventano *Scarico*), senza cancellare né modificare nulla. Dalla versione 2
alla 3 (repeaters) l'hangboard delle sessioni salvate viene marcato come Max
Hangs; la Sessione A passa a 5 Max Hangs e il boulder a volume a 40 min solo
se erano ancora ai vecchi valori predefiniti. Lo stesso vale per una sessione
rimasta in corso e per i backup JSON vecchi importati.

## Da dove vengono i numeri

Sono indicazioni di allenatori e un piccolo studio, non regole fisse:
- **Volume 15–20 blocchi**: S. Bechtel (ClimbStrong), *Quantifying bouldering sessions*.
- **Progetti 2–3 al limite**: pratica di coaching (sessioni brevi, intense, recuperi lunghi).
- **Repeaters 7/3 × 6, 3–6 serie, 2–3 min di recupero**: protocollo diffuso
  (Gripped, Max Climbing); López-Rivera e González-Badillo 2019 (J. Hum.
  Kinet. 66) hanno confrontato sospensioni massime e intermittenti in climber
  avanzati: entrambi i metodi migliorano la resistenza delle dita, conviene alternarli.

## Provarla sul PC

Non serve installare nulla:

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Poi apri <http://localhost:8080>. I test sono su
<http://localhost:8080/tests/>.

## Installarla sul Samsung S22+

Per essere installabile e funzionare offline una PWA deve essere servita in
**HTTPS**. Il modo più semplice e gratuito è GitHub Pages:

1. Crea un repository su GitHub (es. `scheda-arrampicata`) e carica il
   contenuto di questa cartella.
2. Nel repository: **Settings → Pages → Branch: main / root → Save**.
3. Dopo un minuto l'app è su `https://<tuo-utente>.github.io/scheda-arrampicata/`.
4. Sul telefono apri il link con **Chrome** → menu ⋮ → **Aggiungi a schermata
   Home / Installa app**.
5. Apri l'app dall'icona: parte a tutto schermo. Al primo avvio di una
   sessione puoi attivare le notifiche da Impostazioni (silenziose, solo vibrazione).

In alternativa si può trascinare la cartella su <https://app.netlify.com/drop>.

**Aggiornare l'app**: modifica i file, incrementa `VERSION` in `sw.js` e
ricarica su GitHub. Il telefono scarica la nuova versione alla prima apertura
con connessione.

## Limiti di una PWA rispetto a un'app nativa

- **Schermo sempre acceso** (Wake Lock) durante la sessione: è la modalità
  consigliata, così timer e vibrazione sono sempre puntuali. L'app non emette suoni.
- **Con schermo bloccato o app in background** il tempo resta sempre corretto
  (i timer si basano sull'orario, non sui tick) e alla riapertura la sessione
  riprende dal punto giusto. Android però può sospendere la pagina: vibrazione
  e notifiche in background non sono garantite come con un foreground service
  nativo.
- **I dati stanno nel browser del telefono**: disinstallando l'app o
  cancellando i dati di Chrome si perdono. Fai un backup JSON ogni tanto.
