// Edge function: il Coach elimina definitivamente un Cliente e tutti i suoi dati.
// Richiede service_role per cancellare l'utente in auth.users.
//
// H4 (FULL_APP_AUDIT.md): the data-cascade now runs inside a single
// Postgres transaction via the admin_delete_client RPC. Partial-failure
// states (e.g. some tables deleted, others left intact) are no longer
// possible at the SQL layer. auth.users deletion happens after the RPC
// succeeds — if that call fails the data is gone but the auth row
// remains as a tombstone, which is recoverable manually.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, assertUuid } from "../_shared/auth.ts";

interface Payload {
  client_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, req);

  try {
    const auth = await requireAuth(req, ["coach", "admin"]);
    if (auth instanceof Response) return auth;
    const { userId: callerId, role, admin } = auth;

    const { client_id } = (await req.json()) as Payload;
    if (!client_id) return jsonResponse({ error: "client_id mancante" }, 400, req);
    try {
      assertUuid(client_id, "client_id");
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "Invalid client_id" }, 400, req);
    }

    // Verifica ownership: il cliente deve appartenere al coach (admin bypassa).
    const { data: profile } = await admin
      .from("profiles")
      .select("id, coach_id")
      .eq("id", client_id)
      .maybeSingle();
    if (!profile) return jsonResponse({ error: "Cliente non trovato" }, 404, req);
    if (role !== "admin" && profile.coach_id !== callerId) {
      return jsonResponse({ error: "Permesso negato su questo cliente" }, 403, req);
    }

    // Atomic cascade in a single transaction. The RPC deletes:
    //   client_invitations (by email), user_roles, profiles (which cascades
    //   to bookings, training_blocks → block_allocations, push_subscriptions,
    //   extra_credits via the FKs added in 20260518122000).
    const { error: rpcErr } = await admin.rpc("admin_delete_client", {
      p_client_id: client_id,
    });
    if (rpcErr) {
      console.error("admin-delete-user: admin_delete_client RPC failed", rpcErr);
      return jsonResponse({ error: rpcErr.message ?? "Cancellazione dati fallita" }, 500, req);
    }

    // auth.users deletion is outside the SQL transaction by necessity
    // (Supabase Admin API call). If this fails, the data is gone but the
    // auth row remains and the client can no longer log in (no profile).
    // We log loudly so an operator can clean it up manually.
    const { error: delErr } = await admin.auth.admin.deleteUser(client_id);
    if (delErr) {
      console.error(
        "admin-delete-user: auth.admin.deleteUser failed AFTER data cascade succeeded",
        { client_id, error: delErr },
      );
      return jsonResponse(
        {
          ok: false,
          partial: true,
          error: `Dati eliminati ma utente auth non rimosso: ${delErr.message}`,
        },
        500,
      req);
    }

    return jsonResponse({ ok: true }, 200, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    console.error("admin-delete-user: unexpected error", e);
    return jsonResponse({ error: msg }, 500, req);
  }
});
