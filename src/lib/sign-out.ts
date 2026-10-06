// ----------------------------------------------------------------------------
// L'uscita che dice se è riuscita (passata 11 del lato cliente)
// ----------------------------------------------------------------------------
// supabase.auth.signOut() chiama il server; se il server non risponde (la rete
// giù) restituisce un errore e auth-js tiene la sessione nello storage. Prima
// l'app puliva lo stesso il suo stato: sembrava di essere usciti, e
// ricaricando si rientrava, senza un messaggio (su un dispositivo condiviso
// conta). Ora l'esito si guarda: true se la sessione non c'è più, false se
// resta, e il chiamante lo dice e non fa finta di essere uscito.
// ⚠️ Un ripiego con signOut({ scope: "local" }) non serve: in auth-js 2.105
// anche quello chiama il server (POST /logout?scope=local, GoTrueClient
// _signOut), e a rete giù fallisce allo stesso modo (misurato dal revisore
// della passata 11).
// ----------------------------------------------------------------------------

export interface SignOutApi {
  signOut(): Promise<{ error: unknown }>;
}

/** true se l'uscita è riuscita. Non lancia. */
export async function signOutChecked(auth: SignOutApi): Promise<boolean> {
  try {
    const { error } = await auth.signOut();
    return !error;
  } catch {
    return false;
  }
}
