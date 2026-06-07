# PreToolUse (matcher Bash|PowerShell) — blocca SOLO le operazioni git di STAGING/commit su
# .mcp.json (es. `git add .mcp.json`, anche con -f; `git commit .mcp.json`). NON blocca le
# ispezioni read-only (`git log/diff/check-ignore .mcp.json`) ne' Edit/Write del file.
# .mcp.json contiene il PAT GitHub in chiaro ed e' in .gitignore (difesa primaria).
# Windows/PowerShell-native.

try {
  $raw = [Console]::In.ReadToEnd()
  $cmd = [string]((($raw | ConvertFrom-Json)).tool_input.command)
} catch { exit 0 }
if (-not $cmd) { exit 0 }

if (($cmd -match '(?i)\.mcp\.json') -and ($cmd -match '(?i)git\s+(add|stage|rm|mv|stash|commit|restore)\b')) {
  [Console]::Error.WriteLine("[block-mcp-json] BLOCCATO: comando git che referenzia .mcp.json. Il file contiene il PAT GitHub in chiaro e NON va messo in staging/committato (e' gia' in .gitignore). Per modificarne il contenuto usa Edit/Write, che non sono bloccati.")
  exit 2
}
exit 0
