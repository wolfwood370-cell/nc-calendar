# Passata 08 — Disponibilità

## Obiettivo
Orari facili da impostare, regole oneste su ciò che funziona, eccezioni su periodi, nessuna modifica persa.

## Punti audit
D1 (regole che non hanno effetto), D2 (due margini), D3 (copia orari), D4 (salvataggio), D5 (stato Google), D6 (eccezioni).

## Riferimenti design
`designs/Coach Disponibilita.dc.html`.


## Schermate
Riferimento visivo fisso (dati di esempio del 25/09/2026, ora simulata 10:40). In caso di dubbio valgono i valori del brief e del prototipo.
- `screenshots/08-disponibilita-01-pagina.png`
- `screenshots/08-disponibilita-02-copia-su.png`
- `screenshots/08-disponibilita-03-modifiche-non-salvate.png`

## File del repo
`src/routes/trainer.availability.tsx`, `src/components/availability-exceptions-card.tsx`, `src/lib/availability-helpers.ts`.

## Pagina
H1 «Disponibilità»; sottotitolo «Gli orari in cui i clienti possono prenotare. Gli impegni già presenti in calendario, anche su Google, bloccano gli slot in automatico.». Sotto, pill di stato reale (D5): «● Google Calendar collegato · sincronizzato 4 min fa · Gestisci» (→ Integrazioni).

Due colonne `minmax(min(100%,420px),1fr)`.

## Orario settimanale (sinistra)
- Riga giorno (Lunedì → Domenica): interruttore + nome (140px); fasce con due select (06:00–22:00 a passi di 30 min) e cestino; «Non disponibile» se spento; errori sotto la riga («Aggiungi almeno una fascia o disattiva il giorno.», «L'ora di fine deve essere successiva a quella di inizio.», «Le fasce orarie si sovrappongono.»), bordo rosso sui select.
- A destra di ogni giorno attivo: «+ Fascia» e **«Copia su…»** (D3) → popover «Copia gli orari di <Giorno> su» con caselle per gli altri giorni, scorciatoia «Lun–Ven», «Applica».

## Colonna destra
- **Anteprima della settimana** (card `aura-primary`, testo bianco): ore prenotabili totali (Sora 44/800) + «Circa 58 sessioni di Personal Training (60 min + 10 min di margine), prima di contare quelle già prenotate.» (usa durata e margine reali della tipologia principale, D2) + istogramma per giorno.
- **Regole di prenotazione** (D1), in sola lettura: «Preavviso minimo: 24 ore», «Prenotabile fino a: 14 giorni in anticipo», «Margine tra le sessioni: Per tipologia» (link a Tipologie). Nota: «Preavviso e anticipo sono fissi per tutti i clienti: diventeranno modificabili quando il sistema di prenotazione li applicherà.».
- **Eccezioni** (D6): elenco delle eccezioni future (`CalendarOff`, periodo «8 – 10 ottobre», «Tutto il giorno · Ferie» o «14:00–18:00 · Corso», avviso cliccabile «3 sessioni già prenotate in questo periodo: spostale» → calendario). Modulo tratteggiato «Nuova eccezione»: Dal / Al, «Tutto il giorno | Fascia oraria», orari, Motivo; avviso sulle sessioni già prenotate; «Aggiungi eccezione». Rimozione con toast «Ripristina».

## Salvataggio (D4)
Niente pulsante in testata. Barra fissa in basso (come nel Profilo): «1 giorno modificato» · «Annulla modifiche» · «Salva orari» (disabilitato con errori: «Correggi gli orari evidenziati per salvare»). Protezione all'uscita con «Salvare gli orari?».

## Dati e backend
- D1: mantenere i campi in `trainer_settings`, mostrarli in sola lettura finché il motore degli slot non li usa.
- D2: prima di togliere il «Buffer tra sessioni» globale verificare se il motore degli slot usa `trainer_settings.buffer_minutes` o il margine della tipologia; se usa il globale, allineare prima il motore.
- D6: `end_date` sulla tabella eccezioni (o una riga per giorno raggruppata in UI).

## Accettazione
- Nessun campo modificabile che non ha effetto.
- Una settimana di ferie è una sola eccezione.
- Uscire con orari non salvati chiede conferma.
