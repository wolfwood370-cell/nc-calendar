# Full App Audit Report — NC Calendar

> **Date**: 2026-05-18
> **Scope**: Coach platform + Client platform + Infrastructure (Edge Functions, RLS, OAuth).
> **Method**: Three parallel `Explore` agents scoped to coach routes, client routes, and infra. Every CRITICAL / HIGH finding below was re-verified by re-reading the cited file:line in the current tree. Claims that did not hold up are listed in the **Refuted Claims** section at the bottom.
> **Prior cycle**: `CALENDAR_APP_AUDIT.md` (8 High + 10 Medium + 10 Low) is fully closed (27/28 actionable, L7 generated/upstream). This audit looks for **new** issues — especially regressions or gaps introduced by the prior cycle's fixes.

## Resolution Snapshot

| Severity       | Count  |
| -------------- | ------ |
| 🔴 Critical    | 3      |
| 🟠 High        | 4      |
| 🟡 Medium      | 7      |
| 🔵 Low         | 7      |
| **Total open** | **21** |

---

## 🔴 Critical Issues

### C1. Block allocations created with `week_number: 1` only — H1 trigger rejects bookings past week 1

- **Status**: 🚨 **Production-blocking — regression introduced by the H1 atomic-booking trigger.**
- **Where**:
  - [src/routes/trainer.clients.index.tsx:555-568](src/routes/trainer.clients.index.tsx:555) — block creation loops `for m = startBlock..endBlock` and inserts allocations with `week_number: 1` for every iteration. Blocks span **30 days** ([line 521-523](src/routes/trainer.clients.index.tsx:521): `start.setDate(today.getDate() + i * 30)`), i.e. ~4 weeks.
  - [supabase/migrations/20260518120000_booking_atomic_integrity.sql:130-145](supabase/migrations/20260518120000_booking_atomic_integrity.sql:130) — the `validate_booking_block_allocation` trigger computes `v_week_number = LEAST(4, GREATEST(1, FLOOR((NEW.scheduled_at::date - v_block_start) / 7.0)::int + 1))` and **strictly requires** `WHERE week_number = v_week_number`.
  - [src/routes/client.book.tsx:520-538](src/routes/client.book.tsx:520) — frontend `findAllocationForWeek` has a fallback to any allocation matching the pool, so it sets `block_id` on the INSERT for weeks 2-4. The INSERT then hits the trigger, which finds **no** `week_number=2/3/4` rows and raises `P0001 "Credito di blocco non disponibile per questa settimana e tipologia"`.
- **Effect**: Every booking placed in weeks 2, 3, or 4 of a 30-day block **fails** with the P0001 toast. Only week 1 (days 0-6 of the block) works. The user sees "Prenotazione non possibile" instead of confirmation, and no `bookings` row is created.
- **Why now**: Before the H1 trigger shipped, allocation deduction was done client-side via `findAllocationForWeek` which fell back to any allocation in the block. The H1 trigger tightened to require an exact `week_number` match, but the block-creation code was never updated to insert four allocations (one per week).
- **Fix options**:
  1. **Insert four allocations per block** at creation time (week_number = 1..4, each `quantity_assigned = rule.quantityPerBlock / 4` or distribute per week). This requires deciding how the coach's "quantityPerBlock" maps to per-week quotas.
  2. **Relax the trigger** to fall back to any unbooked allocation in the same block when the per-week match misses. Loses the per-week quota enforcement but matches the frontend's existing fallback behavior.
  3. **Drop `week_number` from the allocation grain** and key by `(block_id, event_type_id, session_type)` with `quantity_assigned` as the total block quota. Cleanest long-term shape; requires migration of existing rows.
- **Severity rationale**: This is the live booking flow for every block-based client. If the production DB has any 30-day block in active use, ~75% of legitimate bookings are currently rejected.

### C2. `booster-checkout` accepts arbitrary `client_id` from caller — no ownership check

- **Where**: [supabase/functions/booster-checkout/index.ts:20-26](supabase/functions/booster-checkout/index.ts:20)
  ```ts
  const body = await req.json();
  const package_type = body.package_type;
  const requested_client_id = body.client_id;
  // Use requested client_id if provided (e.g. coach buying for client),
  // otherwise default to the caller's userId.
  const targetClientId = requested_client_id || userId;
  ```
- **Effect**: Any authenticated user can pass `client_id` = victim's UUID. The function then:
  1. Looks up the victim's active block (line 64) using `targetClientId`.
  2. Creates a Stripe checkout session whose **metadata** includes the victim's `client_id` (line 113).
  3. After payment, the (signature-verified) stripe-webhook reads that metadata and inserts `extra_credits` under the victim's account.
- **Threat model**: The attacker pays from their own card, so there's no financial theft from the victim. But: (a) credits show up in the wrong account, (b) a coach building a "buy credits for my client" UX without role-checking can be tricked into attributing a purchase to a random client, (c) a malicious client can hand-craft requests to attribute their purchases to a different account for record-keeping fraud.
- **Fix**: Verify the caller is either the target client themselves, an admin, or the coach of the target client:
  ```ts
  if (targetClientId !== userId) {
    const [{ data: roleRow }, { data: targetProfile }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("coach_id").eq("id", targetClientId).maybeSingle(),
    ]);
    const callerRole = (roleRow as { role?: string } | null)?.role ?? null;
    const targetCoachId = (targetProfile as { coach_id?: string } | null)?.coach_id ?? null;
    if (callerRole !== "admin" && targetCoachId !== userId) {
      return jsonResponse({ error: "Permesso negato" }, 403);
    }
  }
  ```
  This mirrors the auth pattern I shipped for `sync-calendar` last session.

### C3. CORS `Access-Control-Allow-Origin` falls back to `*` when env var is unset

- **Where**: [supabase/functions/\_shared/cors.ts:3](supabase/functions/_shared/cors.ts:3)
  ```ts
  const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
  ```
- **Effect**: If `ALLOWED_ORIGIN` is not configured in Supabase secrets (or is removed by mistake), the function happily accepts requests from any origin. Combined with cookie-based auth, this exposes every edge function to cross-origin abuse from any browser tab.
- **Fix**: Fail loud. Either throw at module load if the env is missing, or default to a hard-coded production origin instead of `*`. Example:
  ```ts
  const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
  if (!ALLOWED_ORIGIN) {
    throw new Error("ALLOWED_ORIGIN must be set in Supabase secrets");
  }
  ```
  Or if multiple origins (preview deploys + prod) are needed, accept a comma-separated list and reflect the matched origin per request.

---

## 🟠 High Issues

### H1. `booster-checkout` uses caller-controlled `Origin` / `Referer` header for Stripe redirect URLs

- **Where**: [supabase/functions/booster-checkout/index.ts:90-111](supabase/functions/booster-checkout/index.ts:90)
  ```ts
  const origin =
    req.headers.get("origin") ||
    req.headers.get("referer")?.replace(/\/$/, "") ||
    "https://nc-calendar.lovable.app";
  // ...
  success_url: `${origin}/client?booster=success`,
  cancel_url:  `${origin}/client/store?booster=cancel`,
  ```
- **Effect**: A request crafted with `Origin: https://attacker.com` produces a legitimate Stripe checkout session whose success/cancel URLs land on the attacker's domain. After paying, the user is redirected away from your app — perfect setup for a phishing capture or a credentials-replay flow.
- **Fix**: Whitelist allowed origins. The fallback string already exists; just stop accepting whatever header arrives:
  ```ts
  const allowed = new Set(
    ["https://nc-calendar.lovable.app", Deno.env.get("ALLOWED_ORIGIN") ?? ""].filter(Boolean),
  );
  const reqOrigin = req.headers.get("origin") ?? "";
  const origin = allowed.has(reqOrigin) ? reqOrigin : "https://nc-calendar.lovable.app";
  ```

### H2. `block_allocations.event_type_id` and `bookings.event_type_id` have no foreign-key constraint

- **Where**:
  - [supabase/migrations/20260510101138\_\*.sql:1](supabase/migrations/20260510101138_58bfbbbd-68aa-4d34-a783-53624ab78eb1.sql:1): `ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS event_type_id uuid NULL;` — no `REFERENCES event_types(id)`.
  - [supabase/migrations/20260510101528\_\*.sql:1](supabase/migrations/20260510101528_22da3f03-f7b1-4b59-8553-a389a4be20b3.sql:1): same for `block_allocations.event_type_id`.
- **Effect**: When a coach deletes an event type, every booking and allocation that referenced it keeps the now-dangling UUID. The `event_types` lookup at [client.book.tsx:373](src/routes/client.book.tsx:373) returns `undefined`, the rendered chip shows the bare `session_type` fallback, and the `block_allocations.event_type_id IS NOT NULL` branch of the H1 trigger may fail to find a match where the coach expected it to.
- **Fix**: Migration that backfills + adds FKs:

  ```sql
  -- 1. Null out dangling refs first to avoid violating the FK
  UPDATE public.bookings b SET event_type_id = NULL
    WHERE event_type_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.event_types e WHERE e.id = b.event_type_id);
  UPDATE public.block_allocations a SET event_type_id = NULL
    WHERE event_type_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.event_types e WHERE e.id = a.event_type_id);

  -- 2. Add FK with ON DELETE SET NULL (preserves history when event types are deleted)
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_event_type_id_fkey
    FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE SET NULL;
  ALTER TABLE public.block_allocations
    ADD CONSTRAINT block_allocations_event_type_id_fkey
    FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE SET NULL;
  ```

### H3. Event-type `duration` / `buffer_minutes` edits retroactively change historical session display

- **Where**:
  - Coach edits [src/routes/trainer.event-types.tsx:101-141](src/routes/trainer.event-types.tsx:101) — only `event_types` row is updated.
  - Calendar render in [src/routes/trainer.calendar.tsx:577-583](src/routes/trainer.calendar.tsx:577) (`const duration = et?.duration ?? 60;`) — pulls duration LIVE from the event_types table, not from the booking row.
- **Effect**: When a coach changes a "PT Session" from 60 min → 75 min, every PAST booking that referenced that event type now renders as 75 min on the calendar, even though the session actually ran for 60. The H1 migration denormalizes `duration_min` / `buffer_min` onto the `bookings` row, but the UI never reads it — it goes back to `event_types`.
- **Fix**: Two options:
  1. **Use the denormalized booking columns** for rendering: `const duration = b.duration_min ?? et?.duration ?? 60;`. Requires exposing `duration_min` on the `BookingRow` type.
  2. **Snapshot a name/duration label on the booking** at insert time (e.g. add `event_type_label`, `duration_min` already there, `buffer_min` already there). The trigger already populates `duration_min` / `buffer_min`; this is just a UI plumbing change.

### H4. `admin-delete-user` performs cascading deletes without a transaction

- **Where**: [supabase/functions/admin-delete-user/index.ts](supabase/functions/admin-delete-user/index.ts) — sequential `.delete()` calls across `bookings`, `block_allocations`, `training_blocks`, `extra_credits`, `profiles`, `auth.users`.
- **Effect**: If any intermediate delete fails (network, timeout, RLS), the function returns 500 but earlier deletes have already committed. The result is an orphaned set: e.g., the bookings are gone but the auth user is still around (or vice versa). No recovery path.
- **Fix**: Wrap the cascade in a PostgreSQL function with `SECURITY DEFINER` so all deletes happen in a single transaction:
  ```sql
  CREATE OR REPLACE FUNCTION public.admin_delete_client(p_client_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
  BEGIN
    DELETE FROM public.bookings WHERE client_id = p_client_id;
    DELETE FROM public.extra_credits WHERE client_id = p_client_id;
    DELETE FROM public.block_allocations
      WHERE block_id IN (SELECT id FROM public.training_blocks WHERE client_id = p_client_id);
    DELETE FROM public.training_blocks WHERE client_id = p_client_id;
    DELETE FROM public.profiles WHERE id = p_client_id;
  END $$;
  ```
  Then call `await admin.rpc("admin_delete_client", { p_client_id })` from the Edge Function, followed by `await admin.auth.admin.deleteUser(p_client_id)` (which can't be in the SQL transaction, so accept this last step as best-effort and log on failure).

---

## 🟡 Medium Issues

### M1. Coach can navigate to `/trainer/clients/<other-coach's-client>` — shows empty/broken state instead of redirect

- **Where**: [src/routes/trainer.clients.$id.tsx:168-172](src/routes/trainer.clients.$id.tsx:168) — the `.select("id, full_name, email, ...").eq("id", clientId)` has **no** `coach_id` filter.
- **Effect**: RLS (`Coach read own clients` policy at [migrations/20260509203659\_\*.sql:138-140](supabase/migrations/20260509203659_e999ec2d-87a4-4f30-8c36-528590070c1e.sql:138)) silently returns `null`, so the data is not exposed — but the UI happily renders with `clientName = "Cliente"` (fallback at line 173) and proceeds to load training_blocks (which also return `[]`). The coach sees a broken page instead of a 404 or redirect.
- **Severity**: Not a security breach (RLS is doing its job), but a UX bug that masks an obvious bad URL.
- **Fix**: After the profile load, `if (!profile) { toast.error("Cliente non trovato o non autorizzato"); navigate({ to: "/trainer/clients" }); return; }`.

### M2. `admin.tsx` role gate is client-only (no `beforeLoad` / server-side guard)

- **Where**: [src/routes/admin.tsx:80-81](src/routes/admin.tsx:80) — `if (role !== "admin") return <Navigate to={pathForRole(role)} />;` runs in the React tree after `useAuth` resolves.
- **Effect**: A coach can briefly render the page tree (and any data fetched during render — though RLS again blocks the actual reads). Not a data leak, but the redirect is a UX guard, not a security boundary.
- **Fix**: Use TanStack Router's `beforeLoad` to do the role check before route children mount, or move the check into a layout route at `/admin/_layout.tsx`.

### M3. Late-cancel cutoff uses browser-local time

- **Where**: [src/routes/client.bookings.$bookingId.tsx:186-187](src/routes/client.bookings.$bookingId.tsx:186)
  ```ts
  const hoursUntil = differenceInHours(start, new Date());
  const within24h = hoursUntil < 24;
  ```
- **Effect**: `differenceInHours` operates on absolute instants, so the math is correct, but a user in UTC+12 looking at a booking scheduled "tomorrow 09:00 UTC" sees it as "today 21:00 local". The 24h threshold itself is consistent across zones — but the LABEL the user sees ("Sessione tra 14 ore") may differ from what the backend rule expects. Backend has no enforcement here either (the client decides which status to set), so there's also no double-check.
- **Fix**: Move the cancel-status decision **into a Postgres function** (`cancel_booking(booking_id, requested_status)`) that computes the time-to-session server-side using `scheduled_at - now()` (timezone-safe), and rejects "regular cancel" if `now() > scheduled_at - interval '24 hours'`. The frontend then trusts the server's response.

### M4. `client-bottom-nav` touch targets are below the 44 px minimum on narrow phones

- **Where**: [src/components/client-bottom-nav.tsx:23](src/components/client-bottom-nav.tsx:23) — `p-3` (12px) on a 24×24 icon = ~48px, but the nav's `px-6` plus 4 evenly-divided links means each tap target is `(viewport - 48) / 4` wide. On a 360px iPhone SE viewport that's `~78px` wide × `~48px` tall, OK on iPhone but tight; on watches/embedded webviews it's underspec.
- **Fix**: Add explicit `min-h-11 min-w-11` (44px both axes) to each `<Link>`.

### M5. `AlertDialog` content has `max-w-lg` (512 px) and no responsive override

- **Where**: [src/components/ui/alert-dialog.tsx](src/components/ui/alert-dialog.tsx) (shadcn default) — the cancellation confirmation in [client.bookings.$bookingId.tsx](src/routes/client.bookings.$bookingId.tsx) uses it.
- **Effect**: On 375 px phones, the dialog can overflow horizontally (375 < 512 + edge padding) and gets clipped or scrolls awkwardly.
- **Fix**: Override the dialog content class for this specific dialog: `<AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">`.

### M6. `send-email` has no per-user rate limiting

- **Where**: [supabase/functions/send-email/index.ts](supabase/functions/send-email/index.ts)
- **Effect**: An authenticated coach or admin can POST repeatedly and exhaust your Resend quota, or use the function as a free transactional email relay against arbitrary `to:` addresses.
- **Fix**: Add a sliding-window counter keyed on `auth.userId`, persisted in a small `email_rate_limit` table or in a KV (Upstash / Cloudflare KV via the worker). Reject if `count > 20/min`.

### M7. `booster-checkout` hardcodes `currency: "eur"`

- **Where**: [supabase/functions/booster-checkout/index.ts:100](supabase/functions/booster-checkout/index.ts:100)
- **Effect**: The amount strings (`4000`, `9900`, `7500` = €40 / €99 / €75) are also hardcoded. A US-based coach or client onboarded later cannot purchase, or will be charged the wrong amount because Stripe's currency conversion is opaque.
- **Fix**: Either move pricing into a `pricing_packs` DB table keyed by currency + locale, or accept `currency` + `amount_cents` in the request body and validate against an allowlist.

### M8. Trigger `validate_booking_block_allocation` uses `NEW.scheduled_at::date` (server-TZ dependent)

- **Where**: [supabase/migrations/20260518120000_booking_atomic_integrity.sql:145](supabase/migrations/20260518120000_booking_atomic_integrity.sql:145) — `FLOOR((NEW.scheduled_at::date - v_block_start) / 7.0)`.
- **Effect**: The implicit cast of `timestamptz → date` uses the `TimeZone` GUC of the server session. Supabase Postgres defaults to UTC. So a booking made at 23:00 Italy (= 22:00 UTC) on the last day of week 1 will compute as the **next** week boundary if it crosses UTC midnight. The frontend's `findAllocationForWeek` uses JavaScript Date arithmetic on the local browser timezone, which can disagree.
- **Effect compounding C1**: even if C1 is fixed by inserting allocations per week, the boundary disagreement between trigger (UTC) and frontend (local) still causes occasional one-week-off rejections near midnight.
- **Fix**: Cast explicitly using a fixed zone, e.g., `((NEW.scheduled_at AT TIME ZONE 'Europe/Rome')::date - v_block_start)`. Document the assumption that the app's business timezone is Europe/Rome.

---

## 🔵 Low Issues

### L1. `client.book.tsx`'s confirm loop is wrapped around an array always of length 1 — dead future-feature scaffolding

- **Where**: [src/routes/client.book.tsx:600-602](src/routes/client.book.tsx:600) — `const entries: [string, ...][] = [[selectedISO, ...]];` followed by `for (const [iso, pick] of entries)`.
- **Effect**: The structure suggests "book multiple slots in one click" but no UI feeds more than one entry. Maintenance risk: a future developer adds a second slot to the array, the existing per-iteration `toast.success(\`${bookedCount} ${bookedCount === 1 ? "sessione prenotata" : "sessioni prenotate"}\`)`still works, but the per-slot`continue` paths and the optimistic mutation we shipped in M1 aren't designed for multi-insert. Either commit to the future feature or unroll the loop.

### L2. No debounce / mutation lock on confirm button — double-click can fire two parallel INSERTs

- **Where**: [src/routes/client.book.tsx:592-790](src/routes/client.book.tsx:592) — `setConfirming(true)` runs after the first React render passes, so a fast double-tap can fire two `confirm()` calls before the button disables.
- **Effect**: The H2 exclusion constraint catches the second INSERT, but the user sees a confusing "Slot già occupato" toast for a slot they just tried to book.
- **Fix**: Set `confirming` synchronously before any await; or wrap the body in a `useMutation` so the button can read `mutation.isPending`.

### L3. `forgot-password` toast differentiates network errors from "email sent" — Supabase masks user-existence by default, but the toast text gives away rate-limits / outages distinctly from successes

- **Where**: [src/routes/forgot-password.tsx:23-32](src/routes/forgot-password.tsx:23)
- **Note**: Supabase's `resetPasswordForEmail` does **not** leak existence (always returns success). So the agent's "account enumeration" claim is overstated. The minor LOW concern is that an attacker can still distinguish "rate-limited" (which means they probed your account recently) from "happy path".
- **Fix (optional)**: Always show the same generic success toast regardless of `error` (still log to console for debug).

### L4. `reset-password` `setReady(true)` on already-authenticated session — UX confusion, not a security hole

- **Where**: [src/routes/reset-password.tsx:22-31](src/routes/reset-password.tsx:22)
- **Note**: `supabase.auth.updateUser({ password })` only updates the **currently authenticated user's** password — there's no privilege-escalation here. If a user is already logged in and types `/reset-password`, they can change their own password. That's expected.
- **Fix (optional)**: Verify `event === "PASSWORD_RECOVERY"` only, and require a recovery hash to be present in `window.location.hash` before flipping `setReady(true)`. Cosmetic: prevents confused users wondering why this page lets them reset without an email link.

### L5. `trainer.integrations.tsx` doesn't expose Google Calendar sync status (last run, token expiry)

- **Where**: [src/routes/trainer.integrations.tsx](src/routes/trainer.integrations.tsx)
- **Effect**: After last session's sync-calendar fix, the function auto-disables `gcal_enabled` when the refresh token is revoked — that's covered. But coaches have no observability into "did the most recent mirror_check actually run?" or "when does my token expire?".
- **Fix**: Read `gcal_token_expires_at` and show a small badge: `"Token valido fino a 18 Mag 14:23"`. Bonus: a `gcal_last_sync_at` column updated by sync-calendar on every successful call.

### L6. `send-push` logs the entire push subscription object (includes endpoint URL) on failure

- **Where**: [supabase/functions/send-push/index.ts:76](supabase/functions/send-push/index.ts:76) — `console.error("push failed", row.id, status, e);`
- **Effect**: The error `e` from `fetch()` against a push provider can include the full endpoint, which contains a browser-specific token. Captured in Supabase function logs.
- **Fix**: `console.error("push failed", { id: row.id, status, message: e instanceof Error ? e.message : String(e) });`

### L7. PWA service-worker registration failures are silent on iOS Safari (limited PWA support)

- **Where**: [src/components/pwa-register.tsx:35](src/components/pwa-register.tsx:35)
- **Effect**: When Safari rejects the SW registration (e.g., outside HTTPS, or in standalone PWA on iOS < 16), the user gets no feedback. Not blocking — the app still works as a normal web app.
- **Fix (optional)**: `.catch((e) => console.warn("PWA SW registration failed", e))` and surface a one-time toast only if explicitly opted-in to PWA install.

---

## ✋ Refuted Claims

These were flagged by the parallel agents but did not hold up against the actual source. Listing them so future audits don't re-trip on the same patterns.

1. **"Pool merging consolidates block + extra credits into a single source entry"** — REFUTED. Map keys are `block:${allocKey(...)}` vs `extra:${event_type_id}` ([client.book.tsx:389, 422](src/routes/client.book.tsx:389)); they never collide. Both pools remain selectable and `pool.source` correctly drives the credit-deduction branch.
2. **"Coach can access any client via URL — CRITICAL data breach"** — DOWNGRADED to M1. The frontend query has no `coach_id` filter, but `profiles` RLS (`Coach read own clients` policy with `coach_id = auth.uid()` predicate) blocks the read at the DB level. The bug is UX (broken page state) not data exposure.
3. **"Stripe webhook trusts untrusted metadata — CRITICAL fraud risk"** — REFUTED. The webhook verifies the Stripe signature ([stripe-webhook/index.ts:22](supabase/functions/stripe-webhook/index.ts:22)) which authenticates the entire event payload including metadata. Metadata cannot be forged without the webhook secret. The related — but real — issue is in `booster-checkout` accepting `client_id` from the caller (covered as C2).
4. **"forgot-password leaks email existence — HIGH"** — DOWNGRADED to L3. Supabase's `resetPasswordForEmail` is designed to always return success for valid emails to prevent enumeration; the only divergent toast happens on rate-limit/network errors.
5. **"reset-password lets you reset any password without a token — HIGH"** — REFUTED. `supabase.auth.updateUser({ password })` only mutates the currently authenticated user's password; there is no token-based escalation surface. Cosmetic concern logged as L4.
6. **"admin-create-user cross-coach assignment is a HIGH risk"** — REFUTED. The function pins `coach_id: callerId` (line 79 of admin-create-user); admins can already do whatever they want by definition. No surface to enumerate other coaches' clients.

---

## Recommended Remediation Order

1. **C1 — block_allocation week_number** (production-blocking; bookings beyond week 1 of any block fail).
2. **C2 — booster-checkout authorization** (financial attribution fraud surface).
3. **C3 — CORS hard-fail** (one-line ops fix; large security improvement).
4. **H2 — event_type_id foreign keys** (prevents data drift; cheap migration).
5. **H1 — Stripe redirect whitelist** (open-redirect / phishing surface).
6. **H4 — admin-delete-user transaction** (data-integrity under partial failure).
7. **H3 — duration denormalization in calendar UI** (visible historical accuracy).
8. **M8 — trigger timezone cast** (compounds C1; fix together).
9. **M1, M2, M3** — UX correctness for edge URLs and time math.
10. **M4–M7, L1–L7** — polish, observability, and defense-in-depth.

## Verification

- `tsc --noEmit` → exit 0 (no changes shipped in this audit; documentation only).
- All cited file:line references re-read against the current tree before being included.
- Cross-cited migration paths verified to match what's actually committed in `supabase/migrations/`.
