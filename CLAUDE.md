# CLAUDE.md — NC Calendar

App web/PWA di prenotazioni per un personal trainer e i suoi clienti. Questo file e' contesto
stabile caricato a ogni sessione: regole dure + gotcha del progetto. Conciso per definizione.

## Stack e dove vivono le cose
- **FE/SSR**: React 19 + TanStack Start/Router + TanStack Query + Vite 7 + Tailwind 4.
- **BE**: Supabase (Postgres + RLS + Edge Functions Deno) **gestito da Lovable Cloud**.
- Routing **file-based** in `src/routes/` (`trainer.*` / `client.*` / `auth`).
- Dominio/logica in `src/lib/`; componenti in `src/components/` (+ `ui/`); hook in `src/hooks/`;
  integrazioni in `src/integrations/{supabase,lovable}`.
- Edge functions in `supabase/functions/`; migrazioni in `supabase/migrations/`.
- `src/routeTree.gen.ts` e' **generato** — non modificarlo a mano.

## ⚠️ Context7 OBBLIGATORIO (librerie recenti)
Per qualsiasi codice che usa **React, TanStack (Start/Router/Query) o Tailwind**, consulta
**Context7** (`mcp__context7__query-docs`) PRIMA di proporre l'implementazione. Non affidarti
alla memoria: le versioni sono recenti e le API cambiano. Un hook `UserPromptSubmit` te lo
ricorda quando il task le tocca (nudge, non gate).

### Context7 library IDs (pinnati — salta `resolve-library-id`)
| Libreria | ID |
|---|---|
| React 19 | `/reactjs/react.dev` |
| TanStack Start | `/websites/tanstack_start_framework_react` |
| TanStack Router | `/tanstack/router` |
| TanStack Query | `/tanstack/query` |
| Tailwind CSS 4 | `/tailwindlabs/tailwindcss.com` |

## Backend = Lovable Cloud (vincoli forti)
- Il DB e' di proprieta' dell'org Supabase di Lovable. **NIENTE Supabase MCP, CLI o Dashboard.**
- I **tipi TS** dallo schema li **rigenera Lovable** — non generarli a mano.
- **Migrazioni**: SQL idempotente nel repo, applicato **solo via Lovable Chat** (mai `db push` /
  `supabase migration up`). Dettagli in [`supabase/CLAUDE.md`](supabase/CLAUDE.md).
- **Deploy**: merge in `main` ≠ live → serve **Publish manuale** su Lovable.
- **Edge functions**: cambi *interni* (body/helper/bugfix) NON vengono re-deployati in automatico
  → nel messaggio post-merge a Lovable chiedi sempre esplicitamente "re-deploya la function X".
- **Env var `VITE_*`**: Vite le inlina a build-time → un cambio `.env` richiede **Publish → Update**
  su Lovable per entrare nel bundle servito.

## Modello dati (gotcha)
- Enum reale: `public.session_type = {'PT Session','BIA','Functional Test'}` (NO lowercase).
- La differenziazione tipologia (es. consulenza) e' via **`event_type_id`**, NON un valore enum.
- Soft-delete: `bookings.deleted_at`, `training_blocks.deleted_at`, `profiles.deleted_at`.
- Clienti "leggeri" (Free Session / PT Pack): niente `training_block`, crediti via `extra_credits`
  (per `event_type_id`). ⚠️ Nelle migration del repo `profiles.path_type` ha CHECK
  `('fixed','recurring')` (default `fixed`): `'free'` NON è un valore valido dello schema versionato.
  Il codice (`trainer.clients.index.tsx`) prova a scriverlo → l'UPDATE viene rifiutato dal DB
  (fallimento silenzioso). Verifica il vincolo live prima di affidarti a `'free'`.

## Qualita' / git
- **Gate pre-commit** (hook automatico su `git commit` dell'agente): `tsc --noEmit` + `vite build`.
  Richiede `bun install` completato (lo stack usa **bun**; `bun.lock` e' la lockfile tracciata).
- Trappola: `main` locale puo' essere **stale** (PR mergiate via API) → basare i worktree su
  `origin/main` **dopo `git fetch`** e verificare il diff.
- Commit attribution: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- L'utente pusha via **GitHub Desktop**; l'agente non fa `git push`.

## Sicurezza
- `.mcp.json` contiene il **PAT GitHub in chiaro** → e' in `.gitignore`, **mai** metterlo in
  staging/commit (un hook lo blocca). Idem `.env` / `.env.*`.
- **Stripe e' in LIVE** in produzione → qualsiasi lavoro su Stripe va fatto in **test mode**.

## Modalita' di lavoro
- Esecuzione autonoma "safest-path": scegli la soluzione piu' sicura, niente refactor
  opportunistici che possono rompere flussi vivi (booking/auth). Plan Mode per schema/auth/core.
