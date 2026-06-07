# UserPromptSubmit hook — reminder Context7 (nudge euristico, NON un gate).
# Se il prompt tocca React/TanStack/Tailwind, inietta su stdout un promemoria a consultare
# Context7 PRIMA di scrivere codice. Lo stdout di UserPromptSubmit viene aggiunto al contesto.
# Windows/PowerShell-native: nessuna dipendenza da bash/jq.

try {
  $raw = [Console]::In.ReadToEnd()
  if (-not $raw) { exit 0 }
  $prompt = [string]((($raw | ConvertFrom-Json)).prompt)
} catch { exit 0 }
if (-not $prompt) { exit 0 }

$pattern = '(?i)\breact\b|tanstack|tailwind|useQuery|useMutation|useInfiniteQuery|useSuspenseQuery|createFileRoute|createRootRoute|useNavigate|useLoaderData|queryClient|className=|\.tsx\b'
if ($prompt -match $pattern) {
  Write-Output "[Context7 reminder] Questo task tocca React 19 / TanStack Start-Router-Query / Tailwind 4. PRIMA di scrivere o modificare codice consulta Context7 (mcp__context7__query-docs) usando gli ID pinnati in CLAUDE.md -> sezione 'Context7 library IDs'. Non scrivere API a memoria: le versioni in uso sono recenti. (Nudge euristico, puo' avere falsi positivi/negativi.)"
}
exit 0
