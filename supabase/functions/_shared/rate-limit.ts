// Shared rate-limit helper for edge functions.
// Wave 7 P4/P5: chiama la SECURITY DEFINER `check_action_rate_limit` (vedi
// migration 20260605...). Tornare `false` ⇒ il chiamante ha superato il
// limite per quell'azione nella finestra temporale specificata.
// In caso di errore DB consideriamo il check fallito-aperto (fail-open):
// preferiamo accettare un eccesso di richieste piuttosto che bloccare
// l'app intera per un problema infrastrutturale.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface RateLimitOptions {
  /** ID utente autenticato (auth.uid()). */
  userId: string;
  /** Etichetta dell'azione (es. "booster-checkout"). */
  action: string;
  /** Numero massimo di chiamate nella finestra. */
  limit: number;
  /** Ampiezza della finestra in secondi. */
  windowSeconds: number;
}

export async function checkRateLimit(
  admin: SupabaseClient,
  opts: RateLimitOptions,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("check_action_rate_limit", {
      p_user_id: opts.userId,
      p_action: opts.action,
      p_limit: opts.limit,
      p_window_seconds: opts.windowSeconds,
    });
    if (error) {
      console.error("rate-limit rpc error", { action: opts.action, message: error.message });
      return true; // fail-open
    }
    return data === true;
  } catch (e) {
    console.error("rate-limit unexpected error", {
      action: opts.action,
      message: e instanceof Error ? e.message : String(e),
    });
    return true; // fail-open
  }
}
