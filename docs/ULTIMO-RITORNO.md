# CLAUDE.md e i permessi del progetto

Passata di configurazione (Sonnet 5.5), ramo `chore/claude-md-e-permessi`. Nessun cambio al codice: tre file copiati con `cp` da `app\claude-md-e-permessi-2026-10-06\nc-calendar\`, e la prova che le regole mordono. Questo file sostituisce il ritorno della 10b (resta nella cronologia e nella PR #92).

## 0 · Il piano

0. ☑ **La base** (§2), la colonna PRIMA delle sonde, la matrice e i cancelli sulla base. Nessun commit.
1. ☑ `7148842` **`CLAUDE.md`**: `cp`, id `de4d18c8…` verificato.
2. ☑ `28369d3` **I permessi**: `.claude/settings.json` e `.gitignore` con `cp`, id `64b1e75e…` e `d8b1a932…`, matrice verificata.
3. ☑ **La colonna DOPO delle sonde**, R3 e l'elenco degli strumenti MCP. Nessun commit.
4. ☑ **I cancelli sul ramo**: uguali alla base (la suite alla seconda esecuzione, vedi §9). Nessun commit.
5. ☑ **Chiusura**: questo file, push, PR (non unita).

## 1 · Dove ho girato

- `pwd`: `/c/Coworks/NC App Development/repos/nc-calendar`; `uname -s`: `MINGW64_NT-10.0-26300`; modello: Sonnet 5.5 (`claude-sonnet-5-5`).
- Albero pulito e `git stash list` vuoto prima di cominciare (quindi S7 lanciata).

## 2 · Ramo e commit

Ramo `chore/claude-md-e-permessi`, da `origin/main` con `git switch --no-track`.

- `7148842` CLAUDE.md: le leggi del codice, il rimando al §8 per modello e impegno, cosa conservare quando si compatta
- `28369d3` I permessi del progetto in .claude/settings.json, e il .gitignore che li lascia entrare
- il commit di chiusura, che riscrive questo file (il suo hash e il numero della PR stanno nel messaggio di Claude Code e nella PR stessa)

## 3 · La base

`origin/main` = `85c0b39d1c955fae321acc4d142714572d974ef9`.

| condizione              | comando                                                           | esito                                                               |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `096c534` antenato      | `git merge-base --is-ancestor 096c534 origin/main`                | esce 0                                                              |
| `.gitignore` di Cowork  | `git rev-parse origin/main:.gitignore`                            | `b7843269f4b8c0617871a7a9c89c904d516a541a`                          |
| `CLAUDE.md` assente     | `git cat-file -e origin/main:CLAUDE.md`                           | fallisce (128)                                                      |
| `settings.json` assente | `git cat-file -e origin/main:.claude/settings.json`               | fallisce (128)                                                      |
| `AGENTS.md` presente    | `git cat-file -e origin/main:AGENTS.md`                           | riesce (0)                                                          |
| lock uguale             | `git hash-object bun.lock` = `git rev-parse origin/main:bun.lock` | `d93afeddf8068057f6d78347267b94b9ffacace6`, `node_modules` presente |

`git log --oneline 096c534..origin/main`: `85c0b39` Merge PR #92 (10b), `78d635b`, `80be56f` (la 10b stessa, già in `main`). Va bene: non toccano i file della passata.

I tre file in `app\`: `git hash-object` → `de4d18c8…`, `64b1e75e…`, `d8b1a932…`, quelli del contratto.

## 4 · Manifesto

`git diff --name-status origin/main HEAD`:

```
A	.claude/settings.json
M	.gitignore
A	CLAUDE.md
M	docs/ULTIMO-RITORNO.md
```

Le quattro righe del contratto, nessun'altra (ordine di Git).

## 5 · Gli id

| file                    | `git rev-parse HEAD:<file>`                | atteso |
| ----------------------- | ------------------------------------------ | ------ |
| `CLAUDE.md`             | `de4d18c813adddb7aa24311e872d39b2dde2faf0` | uguale |
| `.claude/settings.json` | `64b1e75e9c1b29815b52f020e7210eba3e804037` | uguale |
| `.gitignore`            | `d8b1a932572d5cfefc154e81d4be46dc19883674` | uguale |

## 6 · La matrice di `git check-ignore --no-index` (0 = fuori dall'indice, 1 = dentro)

| percorso                          | base | ramo  |
| --------------------------------- | ---- | ----- |
| `.claude/settings.json`           | 0    | **1** |
| `.claude/settings.local.json`     | 0    | 0     |
| `.claude/launch.json`             | 0    | 0     |
| `.claude/worktrees/x/CLAUDE.md`   | 0    | 0     |
| `sub/.claude/settings.local.json` | 0    | 0     |
| `CLAUDE.md`                       | 1    | 1     |

Esattamente l'atteso. `git ls-files .claude` sul ramo: `.claude/settings.json`, una riga sola. (In Git Bash `git rev-parse origin/main:.gitignore` e simili vanno lanciati con `MSYS_NO_PATHCONV=1`, altrimenti i due punti e le barre vengono riscritti.)

## 7 · Le sonde

L'albero era pulito prima di ognuna. Nella colonna DOPO la regola nega con «Permission to use Bash with command … has been denied.»; ogni comando era composto (`cd … && test … && <sonda>`) e la negazione ha colpito l'intero comando per via della sonda dentro.

| sonda | comando                                                        | PRIMA                                                                                                                       | DOPO                                         |
| ----- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| S1    | `git reset --hard HEAD`                                        | ESEGUITA (0): «HEAD is now at 85c0b39…»                                                                                     | NEGATA DALLA REGOLA                          |
| S2    | `git rebase HEAD`                                              | ESEGUITA (0): «Current branch chore/claude-md-e-permessi is up to date.»                                                    | NEGATA DALLA REGOLA                          |
| S3    | `git clean -n`                                                 | ESEGUITA (0), nessun output                                                                                                 | NEGATA DALLA REGOLA                          |
| S4    | `git checkout -- .`                                            | ESEGUITA (0)                                                                                                                | NEGATA DALLA REGOLA                          |
| S5    | `git restore .`                                                | ESEGUITA (0)                                                                                                                | NEGATA DALLA REGOLA                          |
| S6    | `git switch -f chore/claude-md-e-permessi`                     | ESEGUITA (0): «Already on…»                                                                                                 | NEGATA DALLA REGOLA                          |
| S7    | `git stash drop`                                               | ESEGUITA (1): «No stash entries found.»                                                                                     | NEGATA DALLA REGOLA                          |
| S8    | `git push --dry-run origin HEAD:main`                          | ESEGUITA (0): «Everything up-to-date»                                                                                       | NEGATA DALLA REGOLA                          |
| S9    | `git push --dry-run --force origin chore/claude-md-e-permessi` | BLOCCATA DALL'HOOK UTENTE: «BLOCCATO da hook utente: comando potenzialmente distruttivo (pattern: git\s+push\s+.\*--force)» | BLOCCATA DALL'HOOK UTENTE (stesso messaggio) |
| S10   | `git push --dry-run origin --delete claude/sonda-inesistente`  | ESEGUITA (1): «error: unable to delete 'claude/sonda-inesistente': remote ref does not exist»                               | NEGATA DALLA REGOLA                          |
| S11   | `gh pr merge --help`                                           | ESEGUITA (0): «Merge a pull request on GitHub.»                                                                             | NEGATA DALLA REGOLA                          |
| S12   | `supabase --version`                                           | ESEGUITA (127): «supabase: command not found»                                                                               | NEGATA DALLA REGOLA                          |
| P1    | `git status --short`                                           | ESEGUITA (0)                                                                                                                | ESEGUITA (0)                                 |
| P2    | `git checkout -- bun.lock`                                     | ESEGUITA (0)                                                                                                                | ESEGUITA (0)                                 |
| P3    | `git restore CLAUDE.md`                                        | ESEGUITA (1): «error: pathspec 'CLAUDE.md' did not match any file(s) known to git»                                          | ESEGUITA (0)                                 |
| P4    | `git push --dry-run origin chore/claude-md-e-permessi`         | ESEGUITA (0): «\* [new branch] chore/claude-md-e-permessi -> chore/claude-md-e-permessi»                                    | ESEGUITA (0), stessa riga                    |
| P5    | `git stash list`                                               | ESEGUITA (0)                                                                                                                | ESEGUITA (0)                                 |
| P6    | `gh auth status`                                               | ESEGUITA (0): «Logged in to github.com account wolfwood370-cell»                                                            | ESEGUITA (0)                                 |

Le regole mordono già nella sessione in cui il file è stato creato: nessuna sessione nuova è servita. Nessuna sonda negata è stata ritentata in un'altra forma.

## 8 · Le prove rosse

- **R1** · Matrice sulla base: `.claude/settings.json` dà 0, cioè fuori dall'indice: col `.gitignore` vecchio il file non sarebbe entrato nel commit. Sul ramo dà 1.
- **R2** · Colonna PRIMA: S1-S8 e S10-S12 non sono negate da nessuna regola (S7 esce 1 e S12 127 per conto loro, non per un permesso). **S9 era già bloccata prima**, da un hook di livello utente (`C:\Users\wolfw\.claude\hooks\block-bash.ps1`, pattern `git\s+push\s+.*--force`): è un dato, non un errore. Conseguenza: S9 non misura la regola di progetto, perché l'hook scatta prima; la colonna DOPO dice solo che l'hook regge ancora.
- **R3** · Dopo il passo 2:
  - `printf x >> CLAUDE.md` → `git hash-object CLAUDE.md` = `9cb1ac5204721d26d24738a5785f908d08061c51` (diverso da `de4d18c8…`);
  - `git checkout -- CLAUDE.md` → uscita 0 (rimettere un file per nome è permesso: nessun difetto delle regole);
  - `git hash-object CLAUDE.md` = `de4d18c813adddb7aa24311e872d39b2dde2faf0` (uguale); albero pulito.

## 9 · I cancelli

Suite col fuso `Europe/Rome`, da PowerShell (da Git Bash `TZ` non arriva a Node); build con `LOVABLE_SANDBOX=1`. Alla fine `rm -rf dist .output` dalla radice: uscita 0, le cartelle non ci sono più.

| cancello            | base                                            | ramo                                                                             |
| ------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `bun run typecheck` | 0                                               | 0                                                                                |
| `bun run lint`      | 0 · 0 errori, 14 avvisi                         | 0 · 0 errori, 14 avvisi                                                          |
| `bun run test`      | 0 · 71 file, 1433 passati, 0 saltati, 0 falliti | 0 · 71 file, 1433 passati, 0 saltati, 0 falliti (seconda esecuzione, vedi sotto) |
| `bun run build`     | 0                                               | 0                                                                                |

**Prima esecuzione della suite sul ramo: 1 fallito su 1433** (`src/lib/clock.test.ts` › «useNow è definito una volta, in hooks/use-now.ts», «Test timed out in 5000ms», 179 s). Era partita in parallelo a typecheck e lint, e `clock.test.ts` cade sotto carico (già noto). Rilanciata da sola: 71/71 file, 1433/1433 test, 83 s. La passata non tocca codice, quindi il timeout non dipende dai file nuovi. Il numero che conta è quello della seconda esecuzione, ma lo dichiaro: non è «una volta sola».

## 10 · Gli strumenti MCP

I nomi degli strumenti non contengono la parola «supabase» né «github»; il server Supabase si riconosce dal contenuto (prefisso `mcp__e1acde72-affb-48ba-ab72-228ff40a1879__`). Nessuna chiamata fatta:

`apply_migration`, `confirm_cost`, `create_branch`, `create_project`, `delete_branch`, `deploy_edge_function`, `execute_sql`, `generate_typescript_types`, `get_advisors`, `get_cost`, `get_edge_function`, `get_organization`, `get_project`, `get_project_url`, `get_publishable_keys`, `list_branches`, `list_edge_functions`, `list_extensions`, `list_migrations`, `list_organizations`, `list_projects`, `list_tables`, `merge_branch`, `pause_project`, `query_logs`, `rebase_branch`, `reset_branch`, `restore_project`, `search_docs`.

Il server **`github`** non si è connesso (HTTP 401, `AUTH_HEADER_REJECTED`): nessuno strumento da elencare.

## 11 · Non fatto, divergenze, trovati e non toccati

- **Non fatto**: niente di quanto richiesto è rimasto fuori. La colonna DOPO è stata fatta nella stessa sessione, senza riavvio.
- **Divergenza**: la suite sul ramo è stata lanciata due volte (§9), per il timeout sotto carico.
- **Divergenza**: il piano chiedeva l'hash accanto alle voci spuntate; ce l'hanno i passi 1 e 2, i passi senza commit no.
- **Trovato, non toccato**: S9 non è misurabile qui, perché l'hook utente `block-bash.ps1` scatta prima di qualunque regola di progetto (§8, R2). Per provare la regola `--force` di `settings.json` serve una sessione con l'hook spento, e non sono io a spegnerlo.
- **Trovato, non toccato**: `supabase` non è nel PATH di Git Bash (S12 PRIMA: 127): la sonda prova quindi la regola, non la CLI.
- **Trovato, non toccato**: `clock.test.ts` cade sotto carico (timeout di 5 s), già noto.
- Il `docs/ULTIMO-RITORNO.md` precedente (10b) è stato sostituito per intero, come negli altri ritorni.

## 12 · Resta a Nicolò

Il merge della PR `chore/claude-md-e-permessi` verso `main` (aperta, non unita): il link è nel messaggio che l'ha creata.
