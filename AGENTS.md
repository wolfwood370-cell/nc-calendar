# AGENTS.md

## Technical decisions

- `deno.json` at project root sets `"nodeModulesDir": "none"`. Why: the edge-function Deno check fails when it tries to resolve `npm:` specifiers (`web-push`, `stripe`) through the bun-managed root `node_modules`; "none" resolves them from the Deno global cache instead and keeps Deno from touching the app's `node_modules`.
