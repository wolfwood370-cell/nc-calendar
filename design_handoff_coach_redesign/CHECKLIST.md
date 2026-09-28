# Checklist passate — redesign Coach desktop

Ordine vincolante: 00 → 01 → 02, poi le pagine. Una passata per PR.

| # | Passata | Punti audit | Dipende da | Stato |
|---|---|---|---|---|
| 00 | [Fondamenta: token, testi, helper condivisi](passes/00-fondamenta.md) | T1, T2, T3, T5, T6, V1, V2, P4 | — | [x] |
| 01 | [Shell: sidebar e header](passes/01-shell.md) | S1, S2, S3, S4, V12 | 00 | [x] |
| 02 | [Dialog condivisi](passes/02-dialog-condivisi.md) | P5, O1, O2, L4 parz. | 00 | [x] |
| 03 | [Panoramica](passes/03-panoramica.md) | P1–P7, O4 | 01, 02 | [x] |
| 04 | [Calendario](passes/04-calendario.md) | C1–C6, T4, T5 | 01, 02 | [x] |
| 05 | [Clienti](passes/05-clienti.md) | L1–L8, T4, V5 | 01, 02 | [x] |
| 06 | [Profilo cliente](passes/06-profilo-cliente.md) | K1–K7, P5 | 02, 05 | [x] ¹ |
| 07 | [Tipologie di sessione](passes/07-tipologie.md) | E1–E5 | 00 | [x] ² |
| 08 | [Disponibilità](passes/08-disponibilita.md) | D1–D6 | 00 | [x] ³ |
| 09 | [Integrazioni](passes/09-integrazioni.md) | I1–I4, C1 | 04 | [x] ⁴ |
| 10 | [Verifica finale](passes/10-verifica-finale.md) | V1–V12, O3 | tutte | [x] ⁵ |

Legenda: [ ] da fare · [~] in corso · [x] fatta e verificata.

¹ Passata 06: K4 (Limitazioni) resta aperto, e con lui la terza riga di Accettazione del brief. Servono una colonna accanto a `goal` in `coach_client_notes`, cioè una migrazione, e come applicarla su Lovable si decide nella revisione del 02/10/2026.

² Passata 07: l'archiviazione delle tipologie resta aperta. Oggi una tipologia in uso non si elimina (le chiavi verso `event_types` sono `ON DELETE SET NULL`), e fra la rilettura dell'uso e la cancellazione resta una finestra. Archiviarle, o chiudere la finestra con una funzione sul server, vuole una migrazione: si decide nella revisione del 02/10/2026.

³ Passata 08: le eccezioni su un periodo sono una riga per giorno, raggruppate nella pagina, senza migrazione: Prenota, le riprogrammazioni e il Calendario leggono già una data per riga. Preavviso e anticipo sono mostrati come li applica Prenota (nessun preavviso, 90 giorni, da `src/lib/booking-rules.ts`) e non si modificano da qui; il margine è quello di ogni tipologia.

⁴ Passata 09: lo stato di Google Calendar è quello che misura la pagina (la lettura degli eventi all'apertura, «Sincronizza ora», la sincronizzazione completa), non un'ora salvata. L'ora dell'ultimo aggiornamento è di questo browser (`gcal_reconcile_ok`) finché non si salva sul server: vuole una migrazione, e come applicarla su Lovable si decide nella revisione del 02/10/2026. L'importazione degli eventi creati solo su Google resta in questa pagina: dal desktop è l'unica strada, e la Disponibilità la promette.

⁵ Passata 10: V1-V12 e O3 hanno ciascuno un verdetto in `docs/ULTIMO-RITORNO.md` della passata. Restano aperti, con la loro revisione: gli extra di un cliente con percorso, che solo Assegna evento somma al blocco (il debito già aperto, 02/10/2026); il gesto gemello di «Annulla check-in» / «Annulla assenza», icona solo per le sessioni urgenti in Panoramica e pulsante per ogni sessione di oggi o passata in Calendario (31/10/2026); il fuso, Europe/Rome in `romeDate` e l'ora del browser altrove (31/10/2026); i dodici gruppi di scelta dei dialog fatti con Radix, dove Home ed End spostano il fuoco senza scegliere (31/10/2026); il token `--color-outline` (#717880), che sta sotto 4.5:1 su ogni fondo chiaro, anche sul bianco (4,47), e le coppie `warning-text` su `surface-container` (4,46) e testo bianco sui colori delle metriche della BIA (3,08 e 3,56) (31/10/2026). Il Profilo e il dialog BIA del telefono tengono il guscio e i titoli di prima.
