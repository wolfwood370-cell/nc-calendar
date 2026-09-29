# Ultimo ritorno · Lato cliente · Passata 01 · Shell

## 0 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **La base e il ramo.** Nessun commit.
   - `git fetch origin`; `git merge-base --is-ancestor 6695f4f origin/redesign/cliente-mobile && echo 00-presente` → `00-presente`.
   - `origin/redesign/cliente-mobile` = `f30838b` (merge della PR 78), albero `b67d976`, lo stesso di `6695f4f`. `redesign/cliente-01-shell` creato con `git switch --no-track -c redesign/cliente-01-shell origin/redesign/cliente-mobile`.
   - ⚠️ Il clone non era su `redesign/cliente-00-fondamenta` @ `6695f4f` ma su `main` @ `3d29634`, pulito. Il `redesign/cliente-mobile` locale è fermo a `14c09e9`, come detto: non usato.
   - `git diff --stat b780645 origin/redesign/cliente-mobile -- package.json bun.lock` → vuoto. `TZ=UTC node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"` → `0` (senza `TZ` → `-120`): il fuso arriva a Node.
   - Base misurata su `f30838b`: typecheck 0 errori · lint 0 errori e 22 avvisi · **736 test in 47 file**, verdi alla prima corsa coi worker predefiniti · build riuscita, `src/routeTree.gen.ts` invariato.
   - Memoria all'avvio: 4,1 GB fisici liberi, 6,5 GB impegnabili. Nessun errore di memoria in tutta la passata.
   - In più, prima di toccare il codice: la cattura della base nel browser per B10 e B11 (§6), sullo stesso albero.
1. ☑ **Le regole della cornice** (§4.1). `d7292e4`. `client-shell.test.ts` 18 test, uguali con `TZ=UTC`. R1-R7, R9, R10 rosse e poi verdi (§5).
2. ☑ **Le voci calcolate** (§4.2). `c648a37`. `client-notifications.test.ts` 10 test, uguali con `TZ=UTC`. R8 rossa e poi verde.
3. ☑ **Le due route** (§4.9, §4.10). `6455d9f`. `src/routeTree.gen.ts` rigenerato da `bun run build`: `1 file changed, 42 insertions(+)`. C12 `2`.
4. ☑ **Gli hook** (§4.2 punto 6, §4.3 punto 5, §4.8 punto 1). `9fc82a3`; `bookingsLoading` aggiunto in `19dca28` per lo scheletro di Sessioni. C14 come atteso.
   - ⚠️ I dati li legge il layout una volta sola (`useClientShellState`, `src/hooks/use-client-shell.ts:102`) e li passa con un contesto (`ClientShellContext`, `:184`, letto con `useClientShell`, `:187`) a barra, campanelle, Notifiche, Sessioni, Home e Prenota: un orologio, una lettura e un canale realtime della BIA invece di uno per campanella. Lo stato «letta» passa da un piccolo store su localStorage (`subscribeRead`, `:71`), così la campanella dell'header desktop, che resta montata, perde il badge subito (B5).
   - La cattura di `beforeinstallprompt` è a livello di modulo (`src/hooks/use-pwa.ts:37-67`); la avvia il layout (`src/routes/client.tsx:48-50`) e `usePwaInstall` la riavvia, senza effetto, se qualcuno la legge prima. Parte dopo l'evento `load`: §6 B7 e §9.
5. ☑ **Pulsanti, foglio e toast** (§4.5, §4.6, §4.7). `dc601af`; corretti poi in `42d0e43` e `1c6d3eb` (passi 12 e 13). C15, C16.
6. ☑ **Intestazioni e campanella** (§4.4). `4065a4f`; aggancio da md corretto in `42d0e43`. C6.
   - ⚠️ Nello stesso commit dalla Home è uscito anche il calcolo delle voci (`client.index.tsx:389-458` della base), che il piano assegnava al passo 8: senza il tipo `ClientNotificationItem` non compilava, e tenerlo con un tipo suo sarebbe stato codice morto.
7. ☑ **Layout e barra** (§4.3, §4.6 punti 1-2, §4.11). `b51ccd7`; `aria-current` corretto in `1c66f30`, margini laterali in `1c6d3eb`. C4, C5, C7, C8.
8. ☑ **Le pagine** (§4.9, §4.10, §4.12). `870513c` «Pagine del cliente dentro la cornice nuova» e `19dca28` «Notifiche e Sessioni: intestazione e contenuto». C3, C9.
9. ☑ **L'installazione** (§4.8). `b13e8b5`; prompt rifiutato e in errore gestiti in `1c6d3eb`. C1, C2.
10. ⚠️ **Il browser** (§8). B1-B12 fatti col banco fuori dal repo, sul codice finale: 108 prove su 109, più il confronto con la base per B10 e B11 (§6). Il KO: un `beforeinstallprompt` mandato all'evento `load` va perso, perché l'ascolto parte dopo (§6 B7, §9).
11. ☑ **Chiusura** (§10). C0-C16 tutti insieme sul ramo finito (§4); `bcae3b8` «Spunta la passata 01 in PIANO.md»; push; PR [wolfwood370-cell/nc-calendar#79](https://github.com/wolfwood370-cell/nc-calendar/pull/79) verso `redesign/cliente-mobile`, aperta e non unita; «Riscrive docs/ULTIMO-RITORNO.md per la passata 01 del lato cliente», l'ultimo commit del ramo (il suo hash sta nella risposta finale: un file non contiene l'hash del commit che lo scrive).
12. ☑ **Passo aggiunto: le correzioni viste nel browser.** Fatto prima della chiusura.
    - `1c66f30` «Barra e header del cliente: aria-current solo sulla scheda accesa»: il `Link` di TanStack scrive da sé `aria-current="page"` sui link attivi, dopo le props (`@tanstack/react-router/dist/esm/link.js:346`, `STATIC_ACTIVE_PROPS` a `:355`), e senza `exact` `/client` è attivo su tutte le sottopagine (`resolveIsActive`, `:38`): su Prenota risultavano correnti Home e Prenota (B2 rosso). Ora `activeOptions={{ exact: true, includeSearch: false }}` in `client-bottom-nav.tsx:47` e `client.tsx:96`, e la scheda corrente resta quella di `activeClientTab`, anche sul dettaglio e con `?eventType`.
    - `42d0e43` «Raggi del brief nel toast e nelle Notifiche, intestazioni sotto l'header»: in questo tema `--radius` è 12 px (`src/styles.css:187`), quindi `rounded-xl` vale 16 e `rounded-2xl` 20 (misurati: toast 20, «Ripristina» 16); ora in pixel. E l'header desktop è alto 57 (56 più 1 di bordo): le intestazioni si attaccano a `md:top-[57px]` (misurato 56 contro 57).
13. ☑ **Passo aggiunto: le correzioni della revisione.** Un revisore in sola lettura sul diff ha segnalato 15 punti; li ho verificati sul codice, sulle librerie e nel browser. `1c6d3eb` «Foglio, installazione, Notifiche e toast: le correzioni della revisione» corregge i 7 veri; gli altri sono al §7 e al §9, col perché.
    - **Il foglio scorreva nel bianco** (certo): vaul appende al pannello un `::after` alto il 200% (`vaul/dist/index.mjs:62`), e col pannello `overflow-y-auto` la rotella lo portava 600 px sotto il contenuto (`scrollHeight` 1176 su 392). Ora il pannello è `overflow-hidden` e il contenuto scorre in un blocco interno (`client-sheet.tsx:86`, `:96`): rotella 0 px, foglio lungo alto il 90% che scorre dentro, trascinamento che chiude anche a pagina scorsa.
    - **Prompt del sistema**: un `prompt()` che fallisce (secondo tocco, evento già usato) finiva in un errore non gestito; ora `triggerInstall` restituisce `null` (`use-pwa.ts:105`), e se il cliente rifiuta il foglio si chiude senza toast (`client-install-sheet.tsx`). Commento del foglio corretto («in tutti e due i casi» era falso).
    - **Notifiche**: «Segna tutte come lette» sparisce appena premuto e il focus finiva sul body; ora va al riepilogo, `role="status"`, che dice «Tutte lette» (`client.notifications.tsx:58`, `:82`).
    - **Toast**: il CSS di sonner, fuori dai layer, mette `outline: 0` sul toast (che è focalizzabile) e batteva il focus globale; ora l'anello è `!important`, 2 px `#005685` misurato da tastiera.
    - **Orizzontale**: con `viewport-fit=cover` nessuno teneva i margini sicuri di sinistra e destra (il manifest non blocca l'orientamento, `vite.config.ts:49-60`); ora il layout (`client.tsx:70`) e la barra (`client-bottom-nav.tsx:31`).
    - **Commenti**: il rimontaggio dei toast in volo passando da `/auth` a `/client` (sonner usa la posizione come chiave del suo `<ol>`), e il `fixed` nelle pagine (la barra «Conferma» di Prenota c'è e scorre col contenuto).

29/09/2026. Prompt «NC Calendar · Redesign lato cliente · Passata 01 · Shell» (Cowork, contro `f30838b`). Agenti: 1 (il revisore in sola lettura del passo 13). Workflow: 0: la parola «Ultracode» nel prompt ha fatto scattare l'invito del sistema ai workflow, ma il prompt dice «Ultracode: non serve».

## 1 · Ramo e commit

- **`redesign/cliente-01-shell`**, da `origin/redesign/cliente-mobile` @ `f30838b`. Commit, in ordine:
  1. `d7292e4` Cornice del cliente: schede, badge, sottotitoli e titoli in un posto solo;
  2. `c648a37` Notifiche del cliente: le voci di oggi fuori dalla Home;
  3. `6455d9f` Notifiche e Sessioni: le due route nuove del cliente;
  4. `9fc82a3` Cornice del cliente: i dati della barra e della campanella;
  5. `dc601af` Pulsanti, foglio dal basso e toast del cliente;
  6. `4065a4f` Intestazioni del cliente: scheda e pagina aperta;
  7. `b51ccd7` Barra a cinque schede e layout del cliente;
  8. `870513c` Pagine del cliente dentro la cornice nuova;
  9. `19dca28` Notifiche e Sessioni: intestazione e contenuto;
  10. `b13e8b5` Installazione proposta dal foglio, non più all'ingresso;
  11. `1c66f30` Barra e header del cliente: aria-current solo sulla scheda accesa;
  12. `42d0e43` Raggi del brief nel toast e nelle Notifiche, intestazioni sotto l'header;
  13. `1c6d3eb` Foglio, installazione, Notifiche e toast: le correzioni della revisione;
  14. `bcae3b8` Spunta la passata 01 in PIANO.md;
  15. Riscrive docs/ULTIMO-RITORNO.md per la passata 01 del lato cliente (il commit finale).
- Ogni commit compila: typecheck 0 dopo ciascuno.
- **PR:** [wolfwood370-cell/nc-calendar#79](https://github.com/wolfwood370-cell/nc-calendar/pull/79) da `redesign/cliente-01-shell` verso `redesign/cliente-mobile`, aperta e **non** unita. Descrizione: questo file.
- `git diff --stat origin/redesign/cliente-mobile...HEAD` prima di questo file: `29 files changed, 2216 insertions(+), 706 deletions(-)` (di cui 42 righe di `routeTree.gen.ts` e 99 righe di `client.store.tsx` solo rientrate: `git diff -w` ne mostra 11 aggiunte e 18 tolte, compresa una frase del contenuto che prettier ha solo riandato a capo).

## 2 · Manifesto

- **NUOVI:**
  - `src/lib/client-shell.ts` e `client-shell.test.ts` (18 test);
  - `src/lib/client-notifications.ts` e `client-notifications.test.ts` (10 test);
  - `src/hooks/use-client-shell.ts`;
  - `src/components/client-button.tsx`, `client-sheet.tsx`, `client-toaster.tsx`, `client-tab-header.tsx`, `client-page-header.tsx`, `client-install-sheet.tsx`;
  - `src/routes/client.sessions.tsx`, `src/routes/client.notifications.tsx`.
- **MODIFICATI:**
  - `src/routes/client.tsx`: il layout (header desktop con le cinque schede, la campanella ed Esci; colonna di 560; spazio della barra; contesto della cornice; avvio della cattura; `viewport-fit=cover` nell'`head()`; margini laterali sicuri); via `PwaOnboarding`, `InstallPwaButton` e «Calendario»;
  - `src/components/client-bottom-nav.tsx`: la barra a cinque schede con etichetta, `aria-current` e badge;
  - `src/components/client-notifications-bell.tsx`: stesso file e stesso nome esportato, ora un `Link` a `/client/notifications` senza popover;
  - `src/hooks/use-pwa.ts`: la cattura unica a livello di modulo, `startInstallCapture`, il segno `APP_INSTALLED_KEY`, `triggerInstall` che non lancia;
  - `src/routes/__root.tsx`: solo il `Toaster` (import e riga: `<ClientToaster />` al posto di `<Toaster richColors position="top-right" />`, più un commento);
  - `src/routeTree.gen.ts`: rigenerato dalla build (+42);
  - le pagine, solo intestazione e titolo: `client.index.tsx` (anche il calcolo delle voci della campanella uscito), `client.book.tsx` (nei tre rami; via freccia e `useNavigate`), `client.store.tsx` (via freccia, `Button`, `Link`; il resto rientrato di due spazi), `client.settings.tsx`, `client.bookings.$bookingId.tsx` (via freccia e `useNavigate`);
  - `src/components/client-sessions-breakdown.tsx` e `src/hooks/use-book-confirm.ts`: l'import di `UNDO_TOAST_DURATION` e `duration: UNDO_TOAST_DURATION` (due righe ciascuno, nient'altro);
  - `design_handoff_cliente_mobile/PIANO.md`: la riga 01 spuntata, nient'altro;
  - `docs/ULTIMO-RITORNO.md`: questo file.
- **TOLTI** (`git rm`): `src/components/pwa-onboarding.tsx`, `src/components/install-pwa-button.tsx`.
- **NEL PERIMETRO MA NON TOCCATI:** `src/components/ui/*` (compresi `drawer.tsx`, `sonner.tsx`, `button.tsx`, `popover.tsx`), `reschedule-drawer.tsx`, `client-reschedule-sheet.tsx`, `client-session-timeline.tsx`, `client-booking-detail-view.tsx`, `pwa-register.tsx`, `src/lib/toast.ts`, `src/lib/notifications.ts`, `src/lib/queries.ts`, `src/lib/query-keys.ts`, `src/hooks/use-now.ts`, `src/hooks/use-bia.ts`, `src/hooks/use-session-feedback.ts`, `src/styles.css`, `src/routes/auth.tsx`, le route del coach, `supabase/`, `package.json`, `bun.lock`, `vitest.config.ts`.

## 3 · La cornice (per le passate 02-09)

**Componenti**

- `ClientTabHeader({ title: string; subtitle?: ReactNode; children?: ReactNode })` — `src/components/client-tab-header.tsx`. Le cinque schede. Sticky (da md a 57 px, sotto l'header desktop), titolo Sora 28/700 su una riga con l'ellissi, sottotitolo 14 px facoltativo, campanella solo sotto md; i `children` sotto la riga con gap 14 (il controllo segmentato di Sessioni, 03).
- `ClientPageHeader({ title: string })` — `src/components/client-page-header.tsx`. Le pagine aperte (dettaglio, Notifiche). Indietro 44×44: la voce prima della cronologia se è una pagina dell'app (`useCanGoBack` + `router.history.back()`), altrimenti `backFallback`. Niente campanella, niente barra.
- `ClientNotificationsBell({ className?: string })` — `src/components/client-notifications-bell.tsx`. `Link` a `/client/notifications`, 44×44, badge delle non lette della cornice (`formatUnreadBadge`), nome `notificationsBellLabel`.
- `ClientBottomNav()` — `src/components/client-bottom-nav.tsx`. Nessuna prop. Solo sotto md e solo dove `showsTabBar(pathname)`; badge di Sessioni dalla cornice.
- `ClientSheet({ open; onOpenChange; title: ReactNode; description?: ReactNode; role?: "dialog" | "alertdialog"; list?: boolean; className?: string; children?: ReactNode })` — `src/components/client-sheet.tsx`. Il foglio dal basso, sui primitivi di vaul: scrim `--color-scrim`, maniglia 40×5, titolo Sora 22/700, `aria-modal="true"`, focus nel pannello all'apertura e di ritorno a chi l'ha aperto; il contenuto scorre dentro, al massimo il 90%. `list` → gap 16 invece di 14.
- `ClientButton({ variant?: "primary" | "secondary" | "tonal" | "text" | "text-danger" | "danger" | "row" | "row-outline"; size?: "md" | "lg" (solo tonal: 44/14 o 48/15); icon?: LucideIcon; fullWidth?: boolean; asChild?: boolean; …props di <button> })` — `src/components/client-button.tsx`. Principale 52, secondario 48, tonale 44/48, testuale 44, distruttivo pieno 52, azione di riga 44; `asChild` presta lo stile a un `Link` (senza icona). Esporta solo il componente e i tipi.
- `ClientToaster()` — `src/components/client-toaster.tsx`. Lo monta solo la radice.
- `ClientInstallSheet({ open; onOpenChange; from: "home" | "profilo" })` — `src/components/client-install-sheet.tsx`. «Installa NC Calendar»; nessuna pagina lo apre ancora (05 e 07).

**Helper** (`src/lib/client-shell.ts`, puri)

- `CLIENT_TABS: readonly ClientTab[]` con `ClientTab = { key: ClientTabKey; to: ClientTabPath; label: string; icon: LucideIcon }`; `ClientTabKey = "home" | "prenota" | "sessioni" | "booster" | "profilo"`.
- `activeClientTab(pathname: string): ClientTabKey | null` · `showsTabBar(pathname: string): boolean` · `isClientPath(pathname: string): boolean` — per segmenti di percorso.
- `sessionsBadge(bookings: readonly StatusBooking[], now: Date): { count: number; label: string }` · `upcomingCount(bookings, now): number` · `sessionsSubtitle(n: number): string`.
- `homeSubtitle(now: Date): string` · `bookSubtitle(pathType: string | null, blocks: readonly RenewalBlock[], now: Date): string | null`.
- `clientPageTitle(name: string): string` · `backFallback(pathname: string): "/client" | "/client/sessions"`.

**Voci della campanella** (`src/lib/client-notifications.ts`, puri)

- `clientReminderItems(input: { now; bookings; blocks; eventTypes; bia; feedback }): ClientReminderItem[]`, con `ClientReminderItem = { id; kind: "confirm" | "block" | "bia" | "credit" | "feedback"; title; sub; target }` e `target` = `{ to: "/client/bookings/$bookingId", bookingId }` · `{ to: "/client/book" }` · `{ to: "/client/store" }` · `null`.
- `clientNotificationsReadKey(userId): string` (`nc-client-notif-read-<id>`, come prima) · `parseReadIds(raw: string | null): string[]` · `unreadCount(items, readIds): number`.

**Hook**

- `useClientShellState(): ClientShellState` — `src/hooks/use-client-shell.ts`, lo chiama **solo** il layout. `ClientShellState = { userId; now; bookings; bookingsLoading; eventTypes; sessionsBadge; reminders; readIds; unread; markAllRead }`.
- `useClientShell(): ClientShellState` — per tutto ciò che sta dentro il layout del cliente; fuori lancia un errore.
- `startInstallCapture(): void` e `usePwaInstall(): { canInstall; installed; markedInstalled; isIos; triggerInstall(): Promise<"accepted" | "dismissed" | null>; markInstalled(); dismiss(); wasDismissed() }` — `src/hooks/use-pwa.ts`. `APP_INSTALLED_KEY = "nc-app-installed"`.

**Vincoli per chi le usa**

- Ogni pagina del cliente usa `ClientTabHeader` (le cinque schede) o `ClientPageHeader` (le pagine aperte); niente `<header>` scritto a mano nelle pagine (C9).
- I fogli con `ClientSheet`, mai `confirm()` né `components/ui/drawer.tsx`; i pulsanti del foglio con `ClientButton fullWidth`, in colonna: principale, secondario, testuale. Per le conferme distruttive `role="alertdialog"`, col limite del trascinamento del §9.
- Il `Toaster` è uno solo, nella radice (`ClientToaster`): nessuna pagina ne monta un altro. I toast con un'azione durano 8 s: `toastWithUndo` per «Ripristina», `duration: UNDO_TOAST_DURATION` per le altre azioni; mai «Annulla» come azione.
- Niente `position: fixed` dentro le pagine: il `div.page-enter` ha un `transform` e diventa il riferimento dei `fixed`, che scorrono col contenuto. Barra, fogli (portal) e toast (radice) stanno fuori. Una barra fissa di pagina va messa in un portal o fatta `sticky`.
- `now` sempre esplicito: `useClientShell().now` (o `useNow()`), passato agli helper; anche a `clientReferenceBlock`, `blockTiming`, `resolveCurrentBlock`.
- «Ho installato l'app» lascia `localStorage["nc-app-installed"] = "1"`; l'app installata resta `display-mode: standalone`. La card della Home (05) e la voce del Profilo (07) leggono `installed || markedInstalled` di `usePwaInstall()` e aprono `ClientInstallSheet` con `from="home"` o `from="profilo"`.
- La 08 sostituisce `clientReminderItems` e la lettura per voce: il badge della campanella e il badge di Sessioni stanno nella cornice (`unread`, `sessionsBadge`).
- Il profilo della cornice ha la chiave `["client-shell", "profile", id]`; `["profile", id]` resta quella (condivisa, con due `select`) di Home e Prenota (§9).
- I `Link` delle schede hanno `activeOptions={{ exact: true, includeSearch: false }}`: il `Link` di TanStack scrive `aria-current` da sé.
- Raggi del brief in pixel: in questo tema `rounded-xl` è 16 e `rounded-2xl` 20.
- Da md in su i sticky si attaccano a 57 px, sotto l'header desktop (56 più 1 di bordo).
- Con `viewport-fit=cover` le misure del brief con `env(safe-area-inset-*)` valgono su iPhone; chi aggiunge un elemento fisso tiene anche `env(safe-area-inset-left/right)`.

## 4 · Acceptance

Base = `origin/redesign/cliente-mobile` (`f30838b`), misurata al passo 0 (i quattro cancelli) e con `git show`/`git grep` sui file di lì (i controlli); i valori coincidono con quelli «oggi» del prompt. Dopo = il ramo a `bcae3b8`, con tutte le correzioni.

| Controllo                  | Base                                       | Dopo                                                                                                                       |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **C0** file nuovi          | 11 righe «MANCA»                           | nessuna riga                                                                                                               |
| **C1** file tolti          | 2 righe; `7`                               | nessuna riga; `0`                                                                                                          |
| **C2** una cattura         | `2`                                        | `1` (`src/hooks/use-pwa.ts:58`)                                                                                            |
| **C3** titoli              | nessuna riga; `2` in ognuna delle 5 pagine | 7 righe; `0` ovunque                                                                                                       |
| **C4** «Calendario»        | 2 righe                                    | nessuna riga                                                                                                               |
| **C5** barra               | `1`, `0`, `0`, `1` e `1`                   | `0`, `2`, `1`, `0` e `0`                                                                                                   |
| **C6** campanella          | `1`, `0`                                   | `0`, `2`                                                                                                                   |
| **C7** `Toaster`           | `__root.tsx:150`                           | una riga (`client-toaster.tsx:89`); nessuna in `client.tsx`; `isClientPath` in `client-toaster.tsx`                        |
| **C8** viewport            | `0` e `0`                                  | `1` e `0`                                                                                                                  |
| **C9** intestazioni        | `1`, `2`, `1`, `1`; `4`; `0`               | `0` ovunque; `0`; ≥ 1 in tutti e sette                                                                                     |
| **C10** coach              | —                                          | vuoto; `0`                                                                                                                 |
| **C11** cancelli           | 0 · 0 e 22 · 736 in 47 · build ok          | 0 · 0 e 22 (gli stessi) · **764 in 49** · `TZ=UTC` 28 verdi · build ok                                                     |
| **C12** route nel tipo     | `0`                                        | `2`; `+42`                                                                                                                 |
| **C13** PIANO              | `[ ] \|`                                   | `[x] \|`; solo `PIANO.md`, una riga                                                                                        |
| **C14** chiave del profilo | 3 righe                                    | nessuna nel file dell'hook; le stesse 3 altrove (`client.book.tsx:80`, `client.index.tsx:72`: righe spostate dagli import) |
| **C15** foglio             | —                                          | `1`, `2`, vuoto                                                                                                            |
| **C16** toast con azione   | `0` e `0`                                  | `2` e `2`                                                                                                                  |

**C11 · i quattro cancelli**, sul ramo finito:

- `bun run typecheck` → `$ tsc --noEmit`, exit 0, nessun errore.
- `bun run lint` → `✖ 22 problems (0 errors, 22 warnings)`. Gli stessi 22 della base, confrontati per file, regola e colonna: l'unico file toccato che ne ha è `client.book.tsx`, i cui due `react-hooks/exhaustive-deps` passano da `164:9` a `167:9` per le tre righe di import aggiunte sopra. Nessun avviso nuovo.
- `bun run test` → `Test Files  49 passed (49)` · `Tests  764 passed (764)` (736 + 18 + 10), alla prima corsa coi worker predefiniti.
- `TZ=UTC bun run test src/lib/client-shell.test.ts src/lib/client-notifications.test.ts` → `Test Files  2 passed (2)` · `Tests  28 passed (28)`.
- `bun run build` → `✓ built in 7.85s`, `2.24s`, `6.37s`, exit 0; `src/routeTree.gen.ts` invariato dopo la build.

Output dei controlli, incollato (`controlli.sh` fuori dal repo, a lavoro committato; le righe «fine …» segnano dove un controllo atteso vuoto non ha stampato niente):

```text
### C0
(fine C0)
### C1
(fine C1 prima parte)
0
### C2
1
src/hooks/use-pwa.ts:58:  window.addEventListener("beforeinstallprompt", (e) => {
### C3
clientPageTitle("Booster")
clientPageTitle("Home")
clientPageTitle("Notifiche")
clientPageTitle("Prenota")
clientPageTitle("Profilo")
clientPageTitle("Sessione")
clientPageTitle("Sessioni")
src/routes/client.book.tsx:0
src/routes/client.bookings.$bookingId.tsx:0
src/routes/client.index.tsx:0
src/routes/client.notifications.tsx:0
src/routes/client.sessions.tsx:0
src/routes/client.settings.tsx:0
src/routes/client.store.tsx:0
src/routes/client.tsx:0
### C4
(fine C4)
### C5
0
2
1
src/components/client-bottom-nav.tsx:0
src/routes/client.tsx:0
### C6
0
2
### C7
src/components/client-toaster.tsx:89:  return <Toaster {...props} />;
(fine C7 seconda parte)
src/components/client-toaster.tsx:33:import { isClientPath, showsTabBar } from "@/lib/client-shell";
src/components/client-toaster.tsx:86:  const props = isClientPath(path)
### C8
src/routes/client.tsx:1
src/routes/__root.tsx:0
### C9
src/routes/client.index.tsx:0
src/routes/client.book.tsx:0
src/routes/client.settings.tsx:0
src/routes/client.bookings.$bookingId.tsx:0
0
src/routes/client.index.tsx:2
src/routes/client.book.tsx:4
src/routes/client.sessions.tsx:2
src/routes/client.store.tsx:2
src/routes/client.settings.tsx:2
src/routes/client.bookings.$bookingId.tsx:2
src/routes/client.notifications.tsx:2
### C10
(fine C10 prima parte)
0
### C12
2
 src/routeTree.gen.ts | 42 ++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 42 insertions(+)
### C13
15:| 01 | [Shell: barra, intestazioni, fogli, toast](passes/01-shell.md) | N2, N3, N5, O2, T2, V4, V5, V7, V14, H8 (1ª parte) | 00 | — | [x] |
 design_handoff_cliente_mobile/PIANO.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
### C14
(fine C14 prima parte)
src/lib/query-keys.ts:55:  profile: (userId: string | null | undefined) => ["profile", userId] as const,
src/routes/client.book.tsx:80:    queryKey: ["profile", meId],
src/routes/client.index.tsx:72:    queryKey: ["profile", meId],
### C15
1
2
(fine C15 terza parte)
### C16
src/components/client-sessions-breakdown.tsx:2
src/hooks/use-book-confirm.ts:2
```

## 5 · Le prove rosse

Uno script fuori dal repo muta il file, esegue il suo test, rimette il file, controlla che sia uguale byte per byte e che `git diff` sia vuoto, riesegue. Fatte al passo 1 e al passo 2, e **rifatte tutte sul codice finale** con lo stesso esito.

- **R1** · `activeClientTab` con `pathname.startsWith(t.to)` al posto del confronto per segmento (`client-shell.ts:69`) → `Tests  1 failed | 17 passed (18)`: «un prefisso di stringa non basta» (`/client/bookx` → Prenota, `/client/storefront` → Booster). Il dettaglio resta verde: `/client/bookings/…` passa da un caso a parte (`:68`). Rimesso: `18 passed (18)`.
- **R2** · Home per prefisso (`if (pathname.startsWith("/client")) return "home"`) → `4 failed | 14 passed (18)`: rossi **tutti e due**, `/client/book` → `prenota` e `/client/notifications` → `null` («Home solo su /client…», «il dettaglio di una sessione accende Sessioni, le Notifiche nessuna»), più «un prefisso di stringa non basta» e «c'è sulle cinque schede». Rimesso: `18 passed (18)`.
- **R3** · `showsTabBar` vero su tutto `/client` tranne il dettaglio → `1 failed | 17 passed (18)`: «non c'è sulle pagine aperte». Rimesso: `18 passed (18)`.
- **R4** · `sessionsBadge` conta anche le «Prenotata» → `2 failed | 16 passed (18)`: «sette sessioni: una da confermare…», «con due da confermare, e con nessuna». Rimesso: `18 passed (18)`.
- **R5** · `upcomingCount` senza «In corso» → `1 failed | 17 passed (18)`: «sette sessioni…» (3 invece di 4). Rimesso: `18 passed (18)`.
- **R6** · `bookSubtitle` con l'ultimo blocco valido per `sequence_order`, come l'RPC → `4 failed | 14 passed (18)`, fra cui «abbonamento coi mesi dopo già creati: il mese in corso, non l'ultimo creato». Rimesso: `18 passed (18)`.
- **R7** · `backFallback` sempre `/client` → `1 failed | 17 passed (18)`: «Indietro senza una pagina dell'app prima». Rimesso: `18 passed (18)`.
- **R8** · la voce di conferma torna quella di prima (la prossima sessione in programma non confermata, a qualunque distanza) → `client-notifications.test.ts` `2 failed | 8 passed (10)`: «una non confermata fra 72 ore, da sola (è la prossima), no…» e «una voce per ogni sessione da confermare, in ordine d'inizio…». Rimesso: `10 passed (10)`.
- **R9** · `isClientPath` con `pathname.startsWith("/client")` → `1 failed | 17 passed (18)`: «/client e ciò che sta sotto sì, il resto no» (`/clients`). Rimesso: `18 passed (18)`.
- **R10** · `bookSubtitle` chiama `clientReferenceBlock(blocks)` e `blockTiming(ref)` senza `now` → `1 failed | 17 passed (18)`: «nel 2031, con l'ora data e non con l'orologio». Rimesso: `18 passed (18)`.

## 6 · Il browser

**Il banco**, fuori dal repo (`%TEMP%\claude\C--Coworks-NC-App-Development-repos-nc-calendar\f179982d-477b-46aa-9557-56ee7e895682\scratchpad\banco`): quello della passata 09 del coach (Playwright 1.64 della cache npx, `chromium_headless_shell-1200`, Vite sul repo con `VITE_SUPABASE_URL=http://finto-supabase.test`, PostgREST finto in memoria, realtime finto, Google finto), più una sessione e i dati del cliente (`seed-cliente.mjs`: Giulia, percorso fisso di sei blocchi, il terzo dal 14/09 all'11/10 con 8 crediti PT; una svolta il 21/09 già valutata, una «Da confermare» martedì 29 alle 16:40, una giovedì 1 alle 10:40; nella campanella due voci), `/auth/v1/token` e `/auth/v1/user` finti per il login, un ritardo per tabella. Ora fissa lunedì 28/09/2026 10:40 a Roma. Ogni richiesta verso un host diverso da `localhost` è servita dal finto o bloccata e contata.
**Come ho aperto il foglio e fatto partire i toast:** un modulo virtuale di Vite (`virtual:banco`, aggiunto dalla configurazione del banco, fuori dal repo) dà al browser React, `createRoot`, `sonner`, `toastWithUndo`, `ClientInstallSheet`, `ClientSheet` e `ClientButton` con le **stesse istanze** dell'app; il giro monta con quelli un piccolo arnese sopra una pagina del cliente (un pulsante «Apri installazione» e i fogli) e lancia i toast con la stessa `toast` dell'app. Il trascinamento del foglio l'ho provato con l'orologio vero: vaul non lascia trascinare nei primi 500 ms dall'apertura e li misura con `new Date()`, che con l'orologio fisso di Playwright non avanza.

Esito sul codice finale: `giro.mjs` **108/109**, zero errori in console, zero richieste bloccate, zero funzioni server; `sonda-revisione.mjs` 10/10; `cattura.mjs` e `confronto.mjs` per B10 e B11.

- **B1** · Barra, 320×800 e 390×844: cinque etichette nell'ordine Home, Prenota, Sessioni, Booster, Profilo, tutte intere (a 320 larghe 34-44 px in schede da 60; a 390 schede da 74; nessun link con overflow); schede 58 di altezza; pillola 56×32; badge «1» su Sessioni, 20,9×18, a −2 in alto e 8 da destra, `rgb(194, 65, 12)`; nome accessibile «Sessioni, 1 da confermare» (albero accessibile di Playwright); etichette 12/700 accesa e 12/600 spente, colori `#003e62` e `#41474f`; barra alta 71 (1 + 6 + 58 + 6), fondo bianco al 94% con `blur(20px)`.
- **B2** · Barra su `/client`, `/client/book`, `/client/sessions`, `/client/store`, `/client/settings`, con `aria-current` su una scheda sola, quella giusta; niente barra su `/client/bookings/<id>` e `/client/notifications`. Anche l'header a 1280: una sola scheda corrente, Sessioni sul dettaglio, Prenota con `?eventType=<uuid>`, nessuna su Notifiche (la prima corsa aveva trovato Home e Prenota insieme: passo 12).
- **B3** · «Ciao Giulia» con «Lunedì 28 settembre»; «Prenota» con «Blocco 3 di 6 · fino a domenica 11 ottobre»; «Sessioni» con «2 sessioni in programma»; «Booster» con «Crediti in più per il blocco in corso»; «Profilo» senza sottotitolo. Titolo Sora 28/700, interlinea 32,2 px. Campanella 44×44, badge «2», «Notifiche, 2 non lette», in tutte e cinque. A 320 con «Ciao Massimilianoferdinando»: `nowrap`, `ellipsis`, testo più largo del box, alto 32,2 (una riga). Dopo 400 px di scorrimento l'intestazione sta a 0, `sticky`.
- **B4** · «Sessione» e «Notifiche»: Indietro 44×44, titolo Manrope 17/700, griglia `44px 262px 44px`, niente campanella. Sessioni → dettaglio → Indietro → `/client/sessions`; Home → campanella → Indietro → `/client`; `/client/bookings/<id>` aperto direttamente (`__TSR_index` 0) → Indietro → `/client/sessions`; `/client/notifications` aperto direttamente → `/client`.
- **B5** · Due voci col pallino `rgb(0, 86, 133)`, «2 da leggere», righe bianche col bordo del primario al 25%, raggio 18, riquadro 40×40 `rgba(194, 65, 12, 0.1)`; nomi «Non letta. Conferma la tua presenza. Personal Training · martedì 29 alle 16:40» e «Non letta. Sessioni da prenotare. Hai 5 sessioni da prenotare entro il 11 ottobre». «Segna tutte come lette» → «Tutte lette», pallini trasparenti, fondo bianco al 55%, e nelle schede la campanella «Notifiche» senza badge. A 1280 il badge «2» della campanella dell'header sparisce 300 ms dopo il clic, nella stessa pagina. Il tocco su «Conferma la tua presenza» apre `/client/bookings/<quella sessione>`, e Indietro torna alle Notifiche. Da tastiera, dopo «Segna tutte come lette» il focus va al riepilogo (`role="status"`, «Tutte lette»).
- **B6** · localStorage con la sola sessione, `/client`, 2 s dopo «Ciao Giulia»: nessun `dialog`, `alertdialog` o foglio. Sulla base, nelle stesse condizioni, c'è il dialog «Installa NC Calendar…» di `PwaOnboarding`.
- **B7** · Foglio d'installazione: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` verso «Installa NC Calendar», nessun `aria-describedby` (niente descrizione); all'apertura il focus è il pannello (`DIV`), non un campo; Esc chiude e il focus torna al pulsante che l'ha aperto; il tocco sullo scrim chiude; il trascinamento in basso chiude (240 px, orologio vero), anche a pagina scorsa di 400 px; senza l'evento del browser il principale è «Ho installato l'app» (52) e «Chiudi» (44), tutti e due larghi 350; il clic dà il toast «App installata: attiva le notifiche dal Profilo.», chiude il foglio e scrive `nc-app-installed` = `1`; con `from="profilo"` il passo 3 dice «…da qui»; raggio 28, scrim `rgba(0, 20, 35, 0.42)`, maniglia 40×5 `rgb(193, 199, 208)`, titolo Sora 22/700; un foglio con `role="alertdialog"` ha quel ruolo, `aria-modal` e la descrizione collegata. `beforeinstallprompt` finto mandato **dopo** il montaggio della pagina e prima di aprire il foglio: principale «Installa», che apre il prompt; accettato → toast e foglio chiuso. Rifiutato → foglio chiuso senza toast né segno; `prompt()` che fallisce → nessun errore, foglio aperto. ⚠️ **KO**: mandato all'evento `load` va perso (principale «Ho installato l'app»): misurato, l'ascolto parte a ~480 ms, `load` a ~140 ms (tre corse in sviluppo; avviato al caricamento del modulo invece che al montaggio cambia di ~25 ms). Il perché e la proposta al §9. Confronto con `01-shell-01-foglio.png` a 390: stessa struttura, testi, cerchi, pulsanti (`giro/B7-390-foglio.png`).
- **B8** · Un solo `[data-sonner-toaster]` sul cliente e uno su `/trainer`. Il toast «Accesso effettuato» del login (form di `/auth`, credenziali finte del banco) è visibile all'arrivo su `/client`, in basso al centro. Un toast lanciato mentre il layout del cliente carica (il ruolo arriva dopo 5 s) si vede. A 390, in una scheda: il fondo del toast con «Ripristina» sta **12 px** sopra il bordo alto della barra (761 contro 773), largo 12-378; «Ripristina» alto 44, `rgb(145, 203, 255)` 14/700, raggio 12, padding 0 12; toast `rgb(25, 28, 31)`, raggio 16, padding 8 8 8 16, ombra `0 12px 32px rgba(0, 0, 0, 0.25)`, icona 18 `rgb(110, 231, 183)`. In una pagina aperta sta 12 px sopra il fondo (832 su 844). A 700 px: largo 356, centrato, 12 px sopra la barra. `description` dipinta `rgb(198, 198, 199)` su `rgb(25, 28, 31)`: **10,03:1**. Senza azione sparisce in 3268 ms; con «Ripristina» resta 8060 ms. Da tastiera il toast ha l'anello 2 px `#005685`. Confronto con `01-shell-02-toast-ripristina.png`: `giro/B8-390-toast-ripristina.png`.
- **B9** · 1280×800: header con Home (corrente), Prenota, Sessioni, Booster, Profilo, niente «Calendario» nella pagina; una sola campanella visibile, nell'header, ed «Esci»; barra `display: none`; `main` largo **560** (da 360); dopo 500 px di scorrimento l'intestazione della pagina sta a 57, il bordo inferiore dell'header a 57.
- **B10** · Coach, `/trainer` col seed della 09: le schermate a 1440×900 e 390×844, senza e con un toast, sono **uguali byte per byte** a quelle della base; toast in alto a destra, `rgb(236, 253, 243)`, stesso rettangolo (24/1060/1416 e 16/16/374); `meta[name=viewport]` `width=device-width, initial-scale=1` su `/trainer` (base e ramo) e `width=device-width, initial-scale=1, viewport-fit=cover` su `/client` (base: senza).
- **B11** · Il testo del contenuto (la pagina meno i suoi `<header>`), base contro ramo, con gli stessi dati e la stessa ora: **uguale** su Home (797 caratteri), Prenota (255), Profilo (733), dettaglio (253); su Booster manca solo la riga «NC Add-on», che era il titolo della pagina (sulla base stava in un `div`, non in un `<header>`). La barra fissa di Prenota a 390 **scorre col contenuto** sulla base e sul ramo: in cima al documento il suo bordo inferiore è a 756 (base) e 764 (ramo), in fondo a 660 e 661, dopo 96 e 103 px di scorrimento; è dentro `div.page-enter`, quindi `fixed` rispetto al div e non allo schermo.
- **B12** · Zero richieste esterne bloccate e zero funzioni server in tutto il giro, nella sonda e nelle catture.

**Schermate** (nella cartella del banco): `giro/S-320-<pagina>.png`, `giro/S-390-<pagina>.png`, `giro/S-1280-<pagina>.png` per `home`, `prenota`, `sessioni`, `booster`, `profilo`, `sessione`, `notifiche`; `giro/B1-320-home.png`, `giro/B1-390-home.png`, `giro/B3-320-nome-lungo.png`, `giro/B3-390-home-scorsa.png`, `giro/B5-390-notifiche.png`, `giro/B5-390-notifiche-lette.png`, `giro/B6-390-ingresso.png`, `giro/B7-390-foglio.png`, `giro/B7-390-toast-installata.png`, `giro/B7-390-alertdialog.png`, `giro/B8-390-toast-ripristina.png`, `giro/B8-390-dopo-login.png`, `giro/B9-1280-home-scorsa.png`; base e ramo in `cattura-base/` e `cattura-ramo/` (`cliente-390-<pagina>.png`, `coach-1440*.png`, `coach-390*.png`). Esiti completi in `giro/esito-tutto.json`, `giro-finale.log`, `confronto.txt`.

## 7 · Non fatto

- **La cattura di `beforeinstallprompt` prima del montaggio del layout** (B7 al `load`): resta avviata dal layout, come il prompt. Per prenderla prima servirebbe la radice (§9), che questa passata cambia solo per il `Toaster`.
- **Nessuna prova su un iPhone vero:** le safe area (barra, intestazioni, foglio, toast) con `viewport-fit=cover`, in verticale e in orizzontale; nel banco `env(safe-area-inset-*)` vale 0. Il trascinamento e lo scorrimento del foglio col dito (provati col puntatore del mouse).
- **Nessuna misura sulla build di produzione:** l'anteprima passa da workerd di Cloudflare, e non l'ho avviata per non fare richieste di rete dal banco.
- **Test di componente** con `renderToStaticMarkup`: non scritti; barra, intestazioni, campanella, foglio e toast li ha provati il browser.
- Dal brief: la riga del tempo nelle notifiche (§8); il punto d'ingresso del foglio d'installazione (Home 05, Profilo 07).

## 8 · Divergenze

Dove il prompt, il brief o il prototipo dicevano una cosa e il repo un'altra; vince la misura.

**Base e ancore**

- Il clone era su `main` @ `3d29634`, non su `redesign/cliente-00-fondamenta` @ `6695f4f`.
- Le righe citate dal prompt corrispondono sulla base (`client.tsx:16`, `:36`, `:43`, `:45-46`, `:59`, `:76`, `:91`, `:94`; `client-bottom-nav.tsx:6`, `:14`, `:16`, `:33`; `client-notifications-bell.tsx:34-44`, `:61-68`, `:71-142`, `:115-119`; `use-pwa.ts:10-17`, `:37`; `install-pwa-button.tsx:22`, `:30`; `pwa-onboarding.tsx:46`; `__root.tsx:61`, `:111`, `:150`; `client.index.tsx:38-41`, `:389-458`, `:486-500`, `:498`; `client.book.tsx:457-461`, `:487-498`, `:504-516`, `:648-655`; `client.store.tsx:194-203`, `:233`; `client.settings.tsx:278-282`; `client.bookings.$bookingId.tsx:80-90`; `client-sessions-breakdown.tsx:124`; `use-book-confirm.ts:153`; `auth.tsx:71-72`; `styles.css:279-291`; `drawer.tsx:26`, `:46`; vaul `:879`, `:1476-1481`; Radix `:146-149`, `:223-228`).
- Il prompt dava l'header desktop «alto 56 px»: con il bordo è alto 57 (passo 12).

**Scelte sul codice**

- **La cornice in un contesto** (passo 4): il prompt descrive «l'hook che carica i dati e restituisce voci, non lette e segna tutte lette»; l'hook è `useClientShellState`, ma lo chiama solo il layout e gli altri leggono il contesto, per non avere un canale realtime della BIA e un calcolo per ogni campanella.
- **Il toast del cliente è `unstyled`**: il CSS di sonner non sta in un layer e batte le classi di Tailwind, compresa la `description` `#3f3f3f`; lo stile del brief sta tutto nelle `classNames` di `client-toaster.tsx`.
- **`aria-current`**: il `Link` di TanStack lo scrive da sé; senza `activeOptions` esatte la barra e l'header davano due schede correnti (passo 12).
- **Raggi in pixel** (passo 12).
- **Il calcolo delle voci uscito dalla Home al passo 6**, non all'8.
- **Nelle pagine nuove un `div` al posto di `main`** («`main` con padding 8px 16px 32px»): il layout ha già il suo `main`, e un `main` dentro un altro non è valido.
- **Riga delle notifiche:** il pallino delle lette resta come spazio trasparente (come nel prototipo), così il testo non si allarga quando si segnano lette; la riga «N da leggere» non c'è quando non ci sono voci; il riepilogo è `role="status"` e prende il focus dopo «Segna tutte come lette» (revisione).
- **Il nav dell'header desktop** ha anch'esso `aria-label="Navigazione principale"`: barra e header non sono mai visibili insieme.
- **Prompt del sistema rifiutato:** il foglio si chiude senza toast; il brief e il prompt non lo dicevano.
- **Sottotitolo di Prenota:** niente sottotitolo finché blocchi e profilo non sono caricati, in tutti e tre i rami (il prompt lo chiedeva per il caricamento).
- **Margini laterali sicuri** (revisione): il prompt metteva `viewport-fit=cover` senza dirlo, e il manifest non blocca l'orientamento.
- **Desktop:** `main` largo 560 con dentro il `md:px-4` di prima (le pagine ne tengono conto, Booster per primo con `md:px-0`); la Home resta nel suo `max-w-md` (448) dentro la colonna, perché il contenuto non cambia.
- Le divergenze dal brief elencate dal prompt (§5) sono applicate così: conferma per O3, niente riga del tempo, testo del vuoto, `error` come avviso, «Esci» nell'header, campanella di scheda solo sotto md, i due toast a 8 s, «inizia …» per il blocco da iniziare, il foglio su vaul, le notifiche nell'ordine di oggi.

## 9 · Trovati e non toccati

- **`<html lang="en">`** (`src/routes/__root.tsx:111`): le pagine sono in italiano; è della radice, condivisa col coach.
- **La chiave del profilo condivisa:** Home e Prenota leggono `["profile", meId]` con due `select` diversi (`client.index.tsx:72`, `client.book.tsx:80`), e la cache li mescola; la cornice usa una chiave sua.
- **La barra fissa di Prenota** (`client.book.tsx:648-655` della base) scorre col contenuto sulla base e sul ramo (B11): è `fixed` dentro `div.page-enter`, e gli 88 px sono quelli della barra vecchia; con `viewport-fit=cover` il suo `env(safe-area-inset-bottom)` su iPhone ora vale davvero. La toglie la 02 (N4).
- **`beforeinstallprompt` perso prima del montaggio del layout:** l'ascolto parte quando si monta il layout del cliente. Chrome manda l'evento una volta per caricamento, presto: se arriva su `/auth` (il primo accesso: dopo il login la navigazione non ricarica la pagina) o prima che il layout si monti, si perde, e il foglio offrirà «Ho installato l'app» fino al caricamento dopo. Era così anche sulla base (`PwaOnboarding` stava nel layout). Per prenderlo sempre serve un ascolto nel grafo statico della radice (per esempio in `pwa-register.tsx`, a livello di modulo) o uno script nel `<head>`; ma chiamando `preventDefault()` anche su `/auth` e `/trainer` si toglierebbe al coach la mini-barra d'installazione di Chrome. Decisione da prendere.
- **Nessun punto d'installazione fino alle passate 05 e 07:** `PwaOnboarding` è tolto (N5) e la cattura chiama `preventDefault()`, che spegne anche la mini-barra di Chrome sulle pagine del cliente; il foglio c'è ma nessuna pagina lo apre. Sul ramo di integrazione, non su `main`.
- **Trascinamento con `role="alertdialog"`:** vaul 1.1.2 (`shouldDrag`, `node_modules/vaul/dist/index.mjs:1019`) si ferma sul pannello solo se il suo ruolo è `dialog`; con `alertdialog` sale fino a `<html>` e, a pagina scorsa, fuori da Safari (e nella PWA installata) il trascinamento non parte (misurato: a 400 px di scorrimento non chiude). Chiudono Esc, lo scrim e i pulsanti. È della 04, che usa `alertdialog` per l'annullamento.
- **Badge della campanella:** bianco 12/700 su `#e53935` (`--color-error-bright`, il token del README) fa circa 4,2:1, sotto 4,5 per il testo piccolo.
- **Voce «Sessioni da prenotare»:** la data la legge `new Date("AAAA-MM-GG")`, la mezzanotte UTC (portata dalla Home com'era): a ovest di UTC direbbe il giorno prima; e il testo dice «entro il 11 ottobre». La sostituisce la 08.
- **Sessioni, segnaposto:** l'elenco di prima mostra solo le sessioni passate (filtra su `Date.now()`, `client-session-timeline.tsx:98`), mentre il sottotitolo e il badge contano quelle in programma: la sessione «Da confermare» lì non si trova. La 03 sostituisce la pagina.
- **`main` annidati:** Home, Prenota, Profilo e dettaglio hanno un loro `<main>` dentro quello del layout (di prima).
- **L'ora nel contesto:** ogni 30 s i consumatori della cornice (Home e Prenota comprese) si ridisegnano per `now`.
- **Il canale realtime della BIA** ora si apre su tutte le pagine del cliente (la cornice lo legge per la campanella); prima solo sulla Home.
- **Un toast lanciato mentre il layout carica** si mette già 12 px sopra il posto della barra, che non c'è ancora; finché la larghezza non è misurata (`useDesktop`) il toaster fa come se la barra ci fosse.

## 10 · Resta a Nicolò

- Il merge della PR [wolfwood370-cell/nc-calendar#79](https://github.com/wolfwood370-cell/nc-calendar/pull/79) nel ramo di integrazione `redesign/cliente-mobile`, dopo la verifica di Cowork.
- Da girare a Cowork: la decisione sulla cattura di `beforeinstallprompt` nella radice (§9: il primo accesso passa da `/auth`, e il coach perderebbe la mini-barra di Chrome) e il limite di vaul con `alertdialog` per la 04.
- La prova su un iPhone vero delle safe area con `viewport-fit=cover` (barra, intestazioni, foglio, toast; in verticale e in orizzontale).
