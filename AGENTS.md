# AGENTS.md

Guidance for OpenCode agents working in this repository.

## What this is

Stargaze — a zero-build, client-only GitHub stars visualizer. Plain HTML/CSS/JS with D3 as the only dependency (loaded from CDN). No package.json, no tests, no lint, no CI.

## Run / verify

- Run: open `index.html` directly in a browser (`file://` works). No dev server or build step.
- There is no automated test or lint — verification is manual in the browser. Do not add build tooling.

## Code model gotchas

- Scripts in `js/` are classic deferred scripts, **not ES modules**: every top-level `let`/`const`/`function` is a shared global. Load order in `index.html` is dependency order — register any new JS file there, after the files it depends on.
- The tiny inline `<script>` in `<head>` (applies the saved theme + adds the `restoring` class) must stay synchronous and ahead of the deferred scripts — it prevents a theme flash and a landing-page flash during cache restore. Do not defer or move it.
- `slimRepo()` / `expandRepo()` in `js/api.js` must remain exact inverses. If the cached shape changes, bump `REPO_CACHE_KEY` (currently `stargaze_repos_v1`) so old caches are discarded.

## Docs convention

- `CLAUDE.md` is the maintained architecture reference (state variables, renderer performance decisions, cache format, force-simulation params, filter logic). Read it before non-trivial changes and keep it accurate when you change architecture.
- `README.md` documents user-facing behavior (graph rules, filters, session persistence, performance notes) — update it alongside behavior changes. Git history shows docs are updated in lockstep with code.
