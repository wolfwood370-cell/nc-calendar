# PreToolUse (matcher Bash|PowerShell) — gate qualita' SOLO su `git commit`.
# No-op per qualunque altro comando Bash. Su git commit: tsc --noEmit + vite build.
# Se uno dei due fallisce -> exit 2 (blocca il commit) con l'output su stderr.
# NON gira su Stop (sarebbe troppo frequente e vite build e' lento).
# Precondizione: `bun install` completato (altrimenti i binari mancano -> gate skip non-bloccante).
# Windows/PowerShell-native.

try {
  $raw = [Console]::In.ReadToEnd()
  $cmd = [string]((($raw | ConvertFrom-Json)).tool_input.command)
} catch { exit 0 }
if (-not $cmd) { exit 0 }

# Scatta solo sull'azione `git commit` reale: ancorata a inizio comando o dopo un separatore
# (; && || |). Esclude falsi positivi tipo `git log --grep=commit`, `echo "git commit"`,
# `grep "git commit"`, e il sottocomando diverso `git commit-tree` (dopo commit serve spazio o fine).
if ($cmd -notmatch '(?im)(^|[;&|]\s*)git\s+commit(\s|$)') { exit 0 }

$root = $env:CLAUDE_PROJECT_DIR
if (-not $root) { $root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
Set-Location $root

$tsc  = Join-Path $root 'node_modules\.bin\tsc.cmd'
$vite = Join-Path $root 'node_modules\.bin\vite.cmd'

if (-not (Test-Path $tsc) -or -not (Test-Path $vite)) {
  [Console]::Error.WriteLine("[quality-gate] SKIP non-bloccante: toolchain assente in node_modules. Esegui 'bun install' per riattivare il gate.")
  exit 0
}

# tsc --noEmit
$tscOut = & $tsc --noEmit 2>&1
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine("[quality-gate] tsc --noEmit FALLITO -> commit bloccato. Correggi i type error:")
  [Console]::Error.WriteLine(($tscOut | Out-String))
  exit 2
}

# vite build
$viteOut = & $vite build 2>&1
if ($LASTEXITCODE -ne 0) {
  [Console]::Error.WriteLine("[quality-gate] vite build FALLITO -> commit bloccato. Output:")
  [Console]::Error.WriteLine(($viteOut | Out-String))
  exit 2
}

exit 0
