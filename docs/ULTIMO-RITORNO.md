# CLAUDE.md e i permessi del progetto

Passata di configurazione (Sonnet 5.5), ramo `chore/claude-md-e-permessi`. Nessun cambio al codice.

## 0 · Il piano

0. ☑ **La base** (§2), la colonna PRIMA delle sonde e i cancelli sulla base. Nessun commit.
1. ☑ **`CLAUDE.md`**: copiato con `cp`, id verificato.
2. ☑ **I permessi**: `.claude/settings.json` e `.gitignore` copiati con `cp`, id e matrice verificati.
3. ☐ **La colonna DOPO delle sonde**, la prova rossa R3 e l'elenco degli strumenti MCP.
4. ☐ **I cancelli sul ramo**.
5. ☐ **Chiusura**: ritorno finito, push, PR.

## 1 · Dove ho girato

- `pwd`: `/c/Coworks/NC App Development/repos/nc-calendar`; `uname -s`: `MINGW64_NT-10.0-26300`; modello: Sonnet 5.5 (`claude-sonnet-5-5`).
- Albero pulito e `git stash list` vuoto prima di cominciare.

## 3 · La base

`origin/main` = `85c0b39d1c955fae321acc4d142714572d974ef9`.

| condizione              | comando                                                           | esito                                                               |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| 096c534 antenato        | `git merge-base --is-ancestor 096c534 origin/main`                | esce 0                                                              |
| `.gitignore` di Cowork  | `git rev-parse origin/main:.gitignore`                            | `b7843269f4b8c0617871a7a9c89c904d516a541a`                          |
| `CLAUDE.md` assente     | `git cat-file -e origin/main:CLAUDE.md`                           | fallisce (128)                                                      |
| `settings.json` assente | `git cat-file -e origin/main:.claude/settings.json`               | fallisce (128)                                                      |
| `AGENTS.md` presente    | `git cat-file -e origin/main:AGENTS.md`                           | riesce (0)                                                          |
| lock uguale             | `git hash-object bun.lock` = `git rev-parse origin/main:bun.lock` | `d93afeddf8068057f6d78347267b94b9ffacace6`, `node_modules` presente |

`git log --oneline 096c534..origin/main`: `85c0b39` Merge PR #92 (10b), `78d635b`, `80be56f` (la 10b stessa: codice e ritorno, già in `main`).

I tre file in `app\`: `git hash-object` dà `de4d18c8…`, `64b1e75e…`, `d8b1a932…`, quelli del contratto.

## 6 · La matrice di `git check-ignore` sulla base

`.claude/settings.json` 0 · `.claude/settings.local.json` 0 · `.claude/launch.json` 0 · `.claude/worktrees/x/CLAUDE.md` 0 · `sub/.claude/settings.local.json` 0 · `CLAUDE.md` 1. `git ls-files .claude` vuoto.

Sul ramo (dopo il passo 2): `.claude/settings.json` **1** · `.claude/settings.local.json` 0 · `.claude/launch.json` 0 · `.claude/worktrees/x/CLAUDE.md` 0 · `sub/.claude/settings.local.json` 0 · `CLAUDE.md` 1. `git ls-files .claude` = `.claude/settings.json`, una riga.

## 7 · Le sonde (colonna PRIMA)

| sonda | comando                                                        | PRIMA                                                                                                                       |
| ----- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| S1    | `git reset --hard HEAD`                                        | ESEGUITA (0): «HEAD is now at 85c0b39…»                                                                                     |
| S2    | `git rebase HEAD`                                              | ESEGUITA (0): «Current branch chore/claude-md-e-permessi is up to date.»                                                    |
| S3    | `git clean -n`                                                 | ESEGUITA (0), nessun output                                                                                                 |
| S4    | `git checkout -- .`                                            | ESEGUITA (0)                                                                                                                |
| S5    | `git restore .`                                                | ESEGUITA (0)                                                                                                                |
| S6    | `git switch -f chore/claude-md-e-permessi`                     | ESEGUITA (0): «Already on…»                                                                                                 |
| S7    | `git stash drop`                                               | ESEGUITA (1): «No stash entries found.»                                                                                     |
| S8    | `git push --dry-run origin HEAD:main`                          | ESEGUITA (0): «Everything up-to-date»                                                                                       |
| S9    | `git push --dry-run --force origin chore/claude-md-e-permessi` | BLOCCATA DALL'HOOK UTENTE: «BLOCCATO da hook utente: comando potenzialmente distruttivo (pattern: git\s+push\s+.\*--force)» |
| S10   | `git push --dry-run origin --delete claude/sonda-inesistente`  | ESEGUITA (1): «error: unable to delete 'claude/sonda-inesistente': remote ref does not exist»                               |
| S11   | `gh pr merge --help`                                           | ESEGUITA (0): «Merge a pull request on GitHub.»                                                                             |
| S12   | `supabase --version`                                           | ESEGUITA (127): «supabase: command not found»                                                                               |
| P1    | `git status --short`                                           | ESEGUITA (0)                                                                                                                |
| P2    | `git checkout -- bun.lock`                                     | ESEGUITA (0)                                                                                                                |
| P3    | `git restore CLAUDE.md`                                        | ESEGUITA (1): «error: pathspec 'CLAUDE.md' did not match any file(s) known to git»                                          |
| P4    | `git push --dry-run origin chore/claude-md-e-permessi`         | ESEGUITA (0): «\* [new branch] chore/claude-md-e-permessi -> chore/claude-md-e-permessi»                                    |
| P5    | `git stash list`                                               | ESEGUITA (0)                                                                                                                |
| P6    | `gh auth status`                                               | ESEGUITA (0): «Logged in to github.com account wolfwood370-cell»                                                            |

La colonna DOPO si aggiunge al passo 3.

## 9 · I cancelli sulla base

Suite col fuso `Europe/Rome` (da PowerShell, perché `TZ` da Git Bash non arriva a Node); build con `LOVABLE_SANDBOX=1`.

| cancello            | uscita | numeri                                           |
| ------------------- | ------ | ------------------------------------------------ |
| `bun run typecheck` | 0      | —                                                |
| `bun run lint`      | 0      | 0 errori, 14 avvisi                              |
| `bun run test`      | 0      | 71 file, 1433 test passati, 0 saltati, 0 falliti |
| `bun run build`     | 0      | —                                                |
