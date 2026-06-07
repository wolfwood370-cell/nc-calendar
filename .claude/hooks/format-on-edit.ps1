# PostToolUse (matcher Write|Edit) — formatta SOLO il file appena toccato.
# .ts/.tsx -> eslint --fix (include prettier via eslint-plugin-prettier).
# altri formattabili -> prettier --write. Salta file generati. Non blocca MAI (exit 0).
# Windows/PowerShell-native.

try {
  $raw  = [Console]::In.ReadToEnd()
  $file = [string]((($raw | ConvertFrom-Json)).tool_input.file_path)
} catch { exit 0 }
if (-not $file) { exit 0 }

$full = (Resolve-Path -LiteralPath $file -ErrorAction SilentlyContinue).Path
if (-not $full -or -not (Test-Path -LiteralPath $full)) { exit 0 }

$root = $env:CLAUDE_PROJECT_DIR
if (-not $root) { $root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }

# Solo file dentro il repo
if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { exit 0 }
# Salta generati / build
if ($full -match '(?i)routeTree\.gen\.ts$' -or $full -match '(?i)[\\/](dist|node_modules|\.output|\.vinxi|\.wrangler)[\\/]') { exit 0 }
# Salta config sensibili (es. .mcp.json col PAT): non riformattare in-place
if ($full -match '(?i)[\\/]\.mcp\.json$') { exit 0 }

$ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
Set-Location $root
$eslint   = Join-Path $root 'node_modules\.bin\eslint.cmd'
$prettier = Join-Path $root 'node_modules\.bin\prettier.cmd'

try {
  if ($ext -eq '.ts' -or $ext -eq '.tsx') {
    if (Test-Path $eslint) { & $eslint --fix $full 2>&1 | Out-Null }
    else { if (Test-Path $prettier) { & $prettier --write --ignore-unknown $full 2>&1 | Out-Null } }
  }
  elseif (@('.js','.jsx','.json','.css','.md','.html','.yml','.yaml','.mjs','.cjs') -contains $ext) {
    if (Test-Path $prettier) { & $prettier --write --ignore-unknown $full 2>&1 | Out-Null }
  }
} catch { }
exit 0
