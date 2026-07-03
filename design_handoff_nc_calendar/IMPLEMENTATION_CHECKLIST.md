# Checklist di implementazione — NC Calendar

Guida operativa per portare i prototipi in un codebase reale. Segui in ordine; ogni fase è indipendentemente verificabile. Riferimento costante: `README.md` + i file in `designs/`.

## Fase 0 — Setup progetto
- [ ] Scegliere lo stack (consigliato: React + TypeScript + router + uno state store; oppure lo stack già presente nel repo).
- [ ] Impostare i **design tokens** (colori, tipografia Sora/Manrope, raggi, ombre, spaziature) dal README come variabili/tema.
- [ ] Aggiungere set icone (Lucide consigliato, i prototipi già usano quello stile).
- [ ] Definire due aree/route: `/app` (cliente, layout mobile) e `/studio` (coach, layout desktop con sidebar).
- [ ] Stile globale a11y: `:focus-visible`, transizione pagina con `prefers-reduced-motion`.

## Fase 1 — Modello dati & servizi (fondamenta)
- [ ] Tradurre lo stato cliente (`ncapp-giulia-v1`) in tipi/schema: `block`, `pools`, `credits`, `sessions[]`, `bia[]` (vedi README).
- [ ] Tradurre il roster coach (`coach-clients.js`) in tipi/schema.
- [ ] Reimplementare le funzioni di dominio come servizi (NON localStorage in produzione):
  - [ ] `poolFor(type)` per **blocco corrente**, `blockStats()`, `upcoming/past/next/byId`.
  - [ ] `book / reschedule / cancel / restore`, `confirmAttendance`, `setFeedback / pendingFeedback`, `addCredits`, `renewBlock`.
  - [ ] `reminderDue(h)`, `notifications() / unreadCount / markAllRead`.
- [ ] Definire il **canale prenotazioni condiviso** (equivalente `ncbookings-v1`) come endpoint/tabella: il cliente pubblica le upcoming, il coach le legge.
- [ ] Archiviazione clienti persistente (`getArchived/setArchived`).
- [ ] Scrivere unit test per pool/blocco (i conteggi sono per-blocco), refund su cancel, renew azzera i pool.

## Fase 2 — App Cliente (mobile)
- [ ] **Dashboard**: card blocco (segmenti completate/prenotate/da prenotare), "Le tue Sessioni" (pool), statistiche, "I tuoi progressi" (grafico BIA), "Il tuo percorso", "Prossima Sessione" (countdown live + conferma), timeline, CTA.
- [ ] Stati condizionali: banner promemoria (≤48h non confermata), card **rinnovo blocco**, **welcome/primo accesso**, empty "nessuna sessione".
- [ ] Pannello **notifiche** (badge, segna lette, voci → azione).
- [ ] **Booking**: selettore tipologia (crediti residui), calendario mensile (regole prenotabilità), slot con "consigliato", conferma → crea/riprogramma → naviga a Dettaglio. Supporto parametri `t` e `rid`.
- [ ] **Booking Detail**: sessione reale via id, stati badge, conferma presenza, riprogramma, cancella/ripristina con refund, note coach.
- [ ] **Store**: bilancio crediti, acquisto → `addCredits`, toast.
- [ ] **Profile**: identità, statistiche, sessioni residue, menu, (opz.) selettore scenari demo per QA.
- [ ] Bottom nav a 4 voci con stato attivo + `aria-current`.

## Fase 3 — App Coach (desktop)
- [ ] Sidebar navigazione (6 voci) condivisa tra le pagine.
- [ ] **Dashboard**: lista "Oggi" con check-in (+ nota → profilo cliente), grafici, campanella "Attività clienti" dal canale condiviso.
- [ ] **Calendar**: griglia settimana, nav settimana, filtri tipologia, drag-to-reschedule, crea/edit/elimina via popover, **overlay prenotazioni cliente** (badge "cliente", ✓ conferma, sola lettura).
- [ ] **Clients**: riepilogo, ricerca, **toggle griglia/tabella**, ordinamento, tab con conteggi, card/righe con pacchetto+prossima+presenza, menu ⋮, **archiviazione persistente**.
- [ ] **Client Detail**: switcher cliente, storico (correzione presenza, note per sessione), **BIA add/edit/delete** (anche date passate, ordine cronologico, ≥1), note & obiettivi con autosave.
- [ ] **Availability**: orari settimanali, regole, eccezioni, **anteprima slot** live, salva.
- [ ] **Event Types**: card servizio editabili (nome/colore/durata/buffer/prezzo/attivo), nuova tipologia.
- [ ] **Integrations**: elenco con connetti/disconnetti + contatore.

## Fase 4 — Sincronizzazione & realtime
- [ ] Loop prenotazione end-to-end: prenota (cliente) → compare nel calendario/clienti coach; conferma presenza → visibile al coach.
- [ ] BIA scritta dal coach → visibile al cliente.
- [ ] Sostituire il sync cross-tab (`storage` event) con **realtime** (websocket/subscription) verso il backend.
- [ ] Autenticazione + autorizzazione (ruolo cliente vs coach), multi-cliente/multi-dispositivo.

## Fase 5 — Rifinitura & QA
- [ ] Verifica fedeltà visiva vs prototipi (colori/tipografia/spaziature).
- [ ] Accessibilità: focus, `aria-label` su icone, navigazione da tastiera (incl. righe tabella), contrasto, `prefers-reduced-motion`.
- [ ] Stati vuoti/limite/errore e validazioni.
- [ ] Responsive (se il web deve adattarsi oltre alle dimensioni fisse dei mock).
- [ ] Test end-to-end dei flussi chiave (prenota→conferma→feedback; rinnovo blocco; archivia/ripristina).

## Ordine consigliato
Fase 0 → 1 (fondamenta dati) → 2 (cliente) in parallelo a 3 (coach) → 4 (sync/realtime) → 5 (QA). La Fase 1 sblocca tutto: farla per prima.
