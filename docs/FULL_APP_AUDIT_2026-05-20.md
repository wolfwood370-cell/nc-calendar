# Full App Audit Report — NC Calendar

> **Date**: 2026-05-20
> **Scope**: full repo (`src/**`, `supabase/**`) after merge `a43504e`.
> **Method**: targeted greps + file reads, plus reconciliation against the audit spec's premises.
> **Prior cycle**: [`FULL_APP_AUDIT.md`](FULL_APP_AUDIT.md) (3 Critical + 4 High + 7 Medium + 7 Low) is fully closed across audit phases 1–5.

## Premise reconciliation

Three vectors in the audit brief reference files/features that **don't exist in this repo**. They are not findings against the codebase — but they are gaps the spec implies should exist. Flagged at the bottom as `Architectural Gaps`.

| Spec claim | Reality |
| --- | --- |
| `src/routes/api/public/webhooks/gcal-watch.ts` | does not exist (`find ... -name 'gcal-watch*'` empty) |
| Realtime subscription `useEffect` in `trainer.calendar.tsx` | does not exist — `grep "supabase.channel" src/` returns nothing; only `push.ts` uses `.subscribe`, and that's the Web Push API, not Supabase Realtime |
| `DESIGN.md` | does not exist |

The audit is performed against the actual code; gaps are surfaced separately.

---

## Resolution Snapshot

| Severity | Count |
| --- | --- |
| 🔴 High | 1 |
| 🟠 Medium | 4 |
| 🔵 Low | 4 |
| Architectural gaps | 3 |
| **Total open** | **12** |

---

## 🔴 High

### H1. `import_history` overwrites Personal Block metadata + can re-consume credit

- **Where**: [supabase/functions/sync-calendar/index.ts:699-758](supabase/functions/sync-calendar/index.ts:699)
- **Pattern**:

  ```ts
  let { data: existing } = await supabase
    .from("bookings")
    .select("id, status, scheduled_at, block_id, client_id, event_type_id, session_type")  // ❌ no is_personal
    .eq("google_event_id", id)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {
      session_type: sessionType,
      event_type_id: eventTypeId,
      notes: `Importato da Google Calendar: ${summary}`,
      title: summary,
    };
    if (match.client) patch.client_id = clientId;                          // ❌ undoes markPersonal
    if (existing.status === "cancelled" && status !== "cancelled" &&
        match.client && !existing.block_id) {                              // ⚠️ block_id IS NULL for personals → guard hits
      const blockId = await consumeCreditFor(...);                         // ❌ credit deducted on a personal!
      if (blockId) patch.block_id = blockId;
    }
    await supabase.from("bookings").update(patch).eq("id", existing.id);
  }
  ```

- **Effect**:
  - Every click on "Sincronizza ora" (which calls `import_history`) walks every Google event and **overwrites** `client_id`, `session_type`, `event_type_id`, `notes`, `title` on rows the coach has already converted to Personal/Consulenza. `is_personal` and `category` survive (not in patch), so the badge stays, but internal data is silently re-polluted.
  - For a personal block whose Google event was once "cancelled" and is now back to "scheduled", the credit-consumption guard at line 735-746 fires (`!existing.block_id` is true because `markPersonal` set it to NULL) and **deducts a credit from the client pack** the matchEvent resolved to. Direct violation of the credit-protection invariant.
  - `mirror_check` correctly skips is_personal rows ([line 868](supabase/functions/sync-calendar/index.ts:868)) — `import_history` was never updated.

- **Fix**:

  ```ts
  // 1. Add is_personal to the SELECT
  let { data: existing } = await supabase
    .from("bookings")
    .select("id, status, scheduled_at, block_id, client_id, event_type_id, session_type, is_personal")
    .eq("google_event_id", id)
    .maybeSingle();

  // 2. Skip is_personal rows just like mirror_check does
  if (existing && (existing as { is_personal?: boolean }).is_personal === true) {
    // Coach explicitly opted out of client-session treatment for this
    // row. Don't re-stamp client/event metadata or touch credits.
    continue;
  }
  ```

  Same migration-race fallback needed on the SELECT (drop `is_personal` if column missing — pattern already used in `queries.ts`).

---

## 🟠 Medium

### M1. Aura card radius violations — `rounded-xl` on full-width sections

- **Where**:
  - [src/routes/client.book.tsx:843](src/routes/client.book.tsx:843) — `<section className="bg-surface-container-lowest rounded-xl …">`
  - [src/routes/client.bookings.$bookingId.tsx:238, 294, 319](src/routes/client.bookings.$bookingId.tsx:238) — three card sections with `rounded-xl`
  - [src/routes/client.bookings.$bookingId.tsx:152-154](src/routes/client.bookings.$bookingId.tsx:152) — skeleton placeholders use `rounded-xl`
- **Effect**: 16px radius on what are clearly card surfaces. Spec says cards = `rounded-[32px]`. Visible on the client booking detail page (3 hero cards) and client.book step intro.
- **Fix**: replace `rounded-xl` → `rounded-[32px]` in each card section. The skeletons can adopt `AuraCardSkeleton` from `@/components/ui/aura-skeleton` which already enforces the 32px shape.

### M2. Stale `Skeleton` rounded-md on dashboard load state

- **Where**: [src/routes/client.index.tsx:155-156](src/routes/client.index.tsx:155)

  ```tsx
  <Skeleton className="h-12 w-full rounded-md" />
  <Skeleton className="h-12 w-full rounded-md" />
  ```

- **Effect**: Loading bars on the "Il Tuo Percorso" section render as 6px-radius pills while the actual content underneath uses 24-32px Aura cards. Flash-of-style on first mount.
- **Fix**: switch to the new family:

  ```tsx
  import { AuraCardSkeleton } from "@/components/ui/aura-skeleton";
  …
  <AuraCardSkeleton className="h-16" />
  <AuraCardSkeleton className="h-16" />
  ```

### M3. `__root.tsx` error fallback buttons use `rounded-md`

- **Where**: [src/routes/__root.tsx:24, 45](src/routes/__root.tsx:24)
- **Effect**: 404 / error pages render their reset buttons with 6px corners. Spec mandates `rounded-full` for buttons.
- **Fix**:

  ```diff
  - className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
  + className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
  ```

### M4. Badge violation on coach desktop dashboard

- **Where**: [src/routes/trainer.index.tsx:987](src/routes/trainer.index.tsx:987)

  ```tsx
  className={`text-xs font-semibold px-2 py-1 rounded-md whitespace-nowrap ${badgeBg}`}
  ```

- **Effect**: pill/badge using rectangular corners on desktop "Oggi" feed cards. Inconsistent with every other pill in the system.
- **Fix**: `rounded-md` → `rounded-full`. Padding can stay; the pill silhouette is the issue.

---

## 🔵 Low

### L1. Event-type chooser cards use `rounded-md` borders

[src/routes/trainer.event-types.tsx:422, 429](src/routes/trainer.event-types.tsx:422) — sub-options inside the form. Less visible; recommend `rounded-[16px]` to match Aura input radius.

### L2. Rule-editor inner cards use `rounded-md`

[src/routes/trainer.clients.$id.tsx:1286](src/routes/trainer.clients.$id.tsx:1286) — deep inside the rules block of the client detail page. Promote to `rounded-2xl` minimum (still inner, doesn't need full 32px).

### L3. Create-client multi-step legacy form sections

[src/routes/trainer.clients.index.tsx:1694, 1699, 1851](src/routes/trainer.clients.index.tsx:1694) — inside `CreateClientDialog`. Cosmetic.

### L4. Admin page icon containers

[src/routes/admin.tsx:146, 289](src/routes/admin.tsx:146) — small icon avatars use `rounded-md`. Either promote to `rounded-full` (icon style consistent with profile avatars elsewhere) or leave as a deliberate "admin tooling" visual differentiation.

---

## ✅ Verified safe (no findings)

### State correctness — auto-sync useEffects

[src/routes/trainer.calendar.tsx:855-947](src/routes/trainer.calendar.tsx:855) — both auto-sync `useEffect`s are gated by **three independent locks**:

1. `didFullSyncForUser` / `lastMirrorMonth` refs prevent re-runs within the same mount
2. `shouldSkipAutoSync()` localStorage check enforces the 10-minute window across mounts/tabs
3. Dependency arrays are stable (`[user, qc]` / `[user, weekStart, qc]`) — `qc` is the QueryClient singleton, `user` only changes on auth flip, `weekStart` only changes on explicit user input

`invalidateQueries(coach)` after sync triggers a refetch of the bookings query but does **not** mutate any value in the useEffect deps. No infinite-loop path exists.

### Null-safety on Centro Revisione + Personal Blocks rendering

- `trainer.calendar.tsx` MobileEventCard / renderEvent: every `client?.full_name`, optional-chain on `b.notes`, fallback string in every branch ✅
- `trainer.index.tsx` mobile review cards: `r.title?.trim()` then `importedTitle` then `"Evento Google Calendar"` fallback ✅
- `LiveBookingCard`: `booking.meeting_link?.trim() || null` ✅
- `RescheduleDrawer.handleConfirm`: explicit guard `if (!booking.coach_id || !booking.client_id) { toast.error... }` — personal blocks can't be rescheduled by mistake ✅
- `grep "b\.client_id\.|booking\.client_id\.|r\.client\."` returns **0 hits** repo-wide → no unsafe dereferences of a possibly-null client linkage ✅

### Credit safety for Personal/Consulenza

- DB trigger `validate_booking_block_allocation` exits when `block_id IS NULL`
- DB trigger `validate_booking_extra_credits` exits when `client_id IS NULL OR client_id = coach_id`
- RPC `mark_booking_special` refunds any consumed credit **before** clearing the booking links — atomic
- `mark_booking_special` then sets `block_id=NULL, client_id=NULL, event_type_id=NULL` — every guard above engages
- Frontend `markAsPersonal` / `markPersonalQuick` both invoke the RPC (no direct UPDATE)
- `mirror_check` skips `is_personal=true` rows ([line 868](supabase/functions/sync-calendar/index.ts:868))

The single hole is **H1 above** (`import_history`).

---

## 🏗 Architectural Gaps (audit-spec references that don't exist)

### G1. No Google Calendar push-notification webhook

The audit's section 4 expects `src/routes/api/public/webhooks/gcal-watch.ts` validating `x-goog-channel-id` + `x-goog-channel-token` against `integration_settings`. **The file doesn't exist** and `integration_settings.gcal_webhook_url` is declared but never written or read. Today the only sync path is **polling** (`mirror_check` + `import_history` from the frontend).

If/when the webhook ships, mandatory validation:

```ts
const channelId = req.headers.get("x-goog-channel-id");
const channelToken = req.headers.get("x-goog-channel-token");
const resourceId = req.headers.get("x-goog-resource-id");
// fetch integration_settings row keyed on coach via channelId
const { data: settings } = await admin
  .from("integration_settings")
  .select("coach_id, gcal_channel_token, gcal_resource_id")
  .eq("gcal_channel_id", channelId)
  .maybeSingle();
if (!settings || settings.gcal_channel_token !== channelToken
    || settings.gcal_resource_id !== resourceId) {
  return new Response("forbidden", { status: 403 });
}
// then dispatch sync
```

`gcal_channel_token` + `gcal_channel_id` + `gcal_resource_id` columns would need to be added to `integration_settings` (and stored at watch-creation time).

### G2. No Supabase Realtime usage

The audit assumed Realtime subscriptions on bookings. Today the app polls via `useCoachBookings` + invalidation. If/when Realtime is added, the unsubscribe pattern is:

```ts
useEffect(() => {
  const channel = supabase.channel(`bookings-${coachId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `coach_id=eq.${coachId}` },
        () => qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) }))
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}, [coachId, qc]);
```

Note: `removeChannel` returns a Promise — wrap in `void` or `.catch(...)` to silence lint.

### G3. No `DESIGN.md`

Spec rules ("Cards rounded-[32px], buttons rounded-full, inputs rounded-[16px]") live as folklore in code comments + audit briefs. Persist them in `DESIGN.md` at the repo root so contributors don't drift. Pair with an ESLint rule (`tailwindcss/no-arbitrary-value` selectively) or a custom regex in CI that fails on `rounded-md|rounded-lg|rounded-xl|rounded-2xl` outside an allowlist.

---

## Recommended remediation order

1. **H1** — `import_history` skip is_personal (production credit-protection)
2. **M1** — booking detail / book page card radii (most visible page in the app)
3. **M2, M3, M4** — skeleton + root error + dashboard badge (small surface, big consistency win)
4. **L1–L4** — backlog
5. **G1, G2, G3** — architectural backlog (require multi-file work; not regressions)

---

## Verification

- `tsc --noEmit` → exit 0 (current tree)
- `vite build` → 7.76s, no warnings
- All file:line references re-read against the current tree (post-merge `a43504e`) before inclusion.
