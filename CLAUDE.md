# CLAUDE.md · nc-calendar

Lo legge Claude Code all'avvio di ogni sessione in questo repo, e lo rilegge dopo ogni compattazione. Tre cose
sole: le leggi del codice, dove stanno modello e impegno, cosa conservare quando la conversazione si compatta.
Dove una legge ha già una casa nel repo, qui c'è la legge in una riga e il rimando. Se questo file e la casa non
coincidono, vale la casa, e questo file va corretto.
Scritto da Cowork il 06/10/2026, su richiesta di Nicolò, misurando il repo e i prompt delle passate di Code.

@AGENTS.md

`AGENTS.md` lo scrive Lovable (le sue decisioni tecniche) e non si modifica. Si importa qui perché, quando nel
repo c'è un `CLAUDE.md`, Claude Code non lo legge più da solo.

**Chi fa cosa.** Nicolò decide, unisce le PR, pubblica da Lovable (il Publish) e tiene i segreti. Lovable scrive
anche lui su `main` (i suoi commit sono di `gpt-engineer-app[bot]`) e genera i tipi e `bun.lock`. Claude Code
(tu) scrive il codice su un ramo, lo spinge e apre la PR. Cowork scrive i prompt e verifica il ritorno
rieseguendo le prove.

## Le leggi del codice

1. **Dove si lavora.** Sul PC di Nicolò, nel clone `C:\Coworks\NC App Development\repos\nc-calendar`, da Git
   Bash. Senza worktree, salvo una worktree staccata per misurare la base, fuori dal clone e tolta alla fine. Se
   la sessione gira nel cloud, ti fermi prima di creare il ramo e lo scrivi.
2. **La base.** `git fetch origin`, poi `git switch --no-track -c <ramo> <base>` dalla base che il prompt nomina.
   `main` può essere andato avanti, perché Lovable ci scrive quando Nicolò gli parla: parti lo stesso dalla base
   del prompt, e scrivi nel ritorno `git log --oneline <base>..origin/main`.
3. **Il ramo e il push.** Un ramo per passata, col nome che dà il prompt (`redesign/coach-<NN>-<slug>`,
   `redesign/cliente-<NN>-<slug>`, `fix/<slug>`, `chore/<slug>`). Il push solo su quel ramo: mai su `main`, mai
   `--force`, mai cancellare un ramo. Alla fine apri la PR verso `main` con `gh pr create`; se `gh` non è
   autenticato o viene negato, lo scrivi nel ritorno e la apre Nicolò. Il merge e il Publish sono suoi.
4. **Il cancello.** `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, sulla base e sul ramo;
   alla fine `rm -rf dist .output`. Il lint con 0 errori e gli stessi avvisi della base, contati. Il repo non ha
   CI (nessun `.github/`, misurato il 06/10/2026): i cancelli sono questi, e Cowork li rigira. Le trappole del PC:
   - i test in un altro fuso si lanciano da PowerShell (`$env:TZ = "UTC"`, poi `Remove-Item Env:TZ`), una suite
     per fuso, con la sonda `node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"`, su una data
     d'estate: UTC `0`, Los Angeles `420`, Roma `-120`. In Git Bash `TZ` non arriva ai processi e la suite gira col
     fuso di Roma, verde senza provare niente;
   - in Git Bash un argomento che comincia con `/` diventa un percorso di Windows: `MSYS_NO_PATHCONV=1` davanti,
     e i percorsi di Windows fra virgolette, con le barre in avanti.
5. **Commit atomici.** Un commit per passo del piano, nell'ordine del piano, e ogni commit compila: typecheck a 0
   a ogni passo. Messaggi in italiano.
6. **Il database e i servizi non li tocchi.** Niente database, migrazioni, funzioni (`supabase/functions/`),
   deploy o segreti; mai Supabase, Google, Stripe o l'invio di email veri, né dal banco né dal server di sviluppo.
   Il database è quello di produzione, coi clienti dentro, e una funzione toccata andrebbe in produzione.
7. **I tipi e l'accesso.** `src/integrations/` non si tocca, compreso `src/integrations/supabase/types.ts`: i
   tipi li genera Lovable, e l'accesso passa da Lovable.
8. **Le librerie.** Nessuna installazione e nessun cambio a `package.json` o `bun.lock`: la lock la scrive Lovable,
   e un pacchetto in più andrebbe in produzione col Publish. Se le librerie del clone non corrispondono alla lock,
   la procedura è quella che il prompt della passata riporta, e alla fine `git hash-object bun.lock` è uguale a
   `git rev-parse <base>:bun.lock`.
9. **Il tema.** Niente colori scritti a mano dove c'è un token: i token stanno in `src/styles.css`, il loro
   significato nel `README.md` del pacchetto di design della corsia (`design_handoff_coach_redesign/`,
   `design_handoff_cliente_mobile/`), e i contrasti li pinna `src/lib/contrast.test.ts`.
10. **Il ritorno.** `docs/ULTIMO-RITORNO.md` è uno solo e si riscrive a ogni passata: in testa IL PIANO del prompt,
    spuntato mentre lavori (☐ da fare, ☑ con l'hash del commit, ⚠️ con la deviazione e il `file:riga`), poi il
    blocco che il prompt chiede. I ritorni vecchi si leggono con `git show <hash>:docs/ULTIMO-RITORNO.md`.
11. **Niente «già che ci sono».** Un difetto che trovi e che la passata non chiede non lo curi: va fra i trovati
    del ritorno.
12. **Se il repo contraddice il prompt, vince la tua misura.** Prosegui verso il criterio e scrivi la deviazione
    accanto al passo, con il `file:riga`.
13. **I permessi.** `.claude/settings.json` nega le forme comuni di ciò che queste leggi vietano: il merge (anche
    via `gh api`), il push su `main`, forzato o che cancella un ramo, i comandi git che scartano lavoro su tutto
    l'albero (`reset --hard`, `clean`, `rebase`, `stash drop` e `clear`, `checkout`, `restore` e `switch` forzati o
    su `.`) e il CLI di Supabase. Rimettere un file per nome resta permesso: serve per `bun.lock` e per le prove
    rosse. L'elenco non prende ogni forma: una forma che sfugge resta vietata lo stesso. Una regola negata non si
    aggira: se un passo ne ha bisogno, ti fermi su quel passo e lo scrivi.

## Modello e impegno

Modello e impegno di una passata li scrive il suo prompt, nell'intestazione, e li imposta Nicolò dal selettore: tu
non li vedi, quindi quando ne dichiari uno stai **raccomandando**, non leggendo. **La regola completa, con le scale
e il criterio che fa salire il livello, sta nel §8 di `ISTRUZIONI-APP-v8.md`, nella cartella dei documenti di
Nicolò (`C:\Coworks\NC App Development\app\`), fuori da questo repo. Quella è l'unica casa: qui non è ripetuta di
proposito, perché una copia nel repo resterebbe indietro a ogni cambio.**

# Compact instructions

Quando la conversazione si compatta, conserva alla lettera:

- il criterio di «fatto» del prompt della passata (la sezione che lo apre: il contratto, il criterio);
- il ramo, la base col suo hash e l'hash dell'ultimo commit;
- IL PIANO e il suo stato: i passi ☑ con l'hash, i ☐, i ⚠️ con la deviazione. La copia viva è in testa a
  `docs/ULTIMO-RITORNO.md`: dopo la compattazione la rileggi da lì prima di proseguire;
- i divieti della passata, ognuno col suo perché;
- i numeri della base (errori, avvisi, test e file di test) e le prove rosse già viste, con l'esito.

Si possono perdere l'output intero dei comandi già riassunto nel ritorno, i file letti per intero e i tentativi
falliti già risolti.
