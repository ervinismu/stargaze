# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stargaze is a client-side GitHub Stars Explorer that visualizes a user's starred repositories as a D3 force-directed graph. Repos are connected by shared topics and colored by programming language. No server or build step is required.

## Running the App

Open `index.html` directly in a browser — no build step needed. D3 and fonts load from CDN.

## File Structure

```
index.html          — markup only (three phases: #loading, #landing, #app)
css/
  base.css          — CSS variables (:root), reset, html/body, scrollbar, app shell, loading overlay
  landing.css       — landing page, starfield canvas, form inputs, entrance animation, error box
  header.css        — top bar, search input
  sidebar.css       — filter columns, in-list search inputs, lang/topic items, active chips, toggles, stats
  canvas.css        — canvas area, zoom controls, hint text
  detail.css        — right detail panel, topic pills, action buttons
  tooltip.css       — hover tooltip
js/
  config.js         — LANG_COLORS map, langColor(), nodeR(), fmtNum(), themeColors()
  state.js          — all mutable state variables and cached DOM refs
  starfield.js      — startStarfield() / stopStarfield() — landing animation lifecycle
  api.js            — loadRepos(), buildGraph(), slimRepo(), expandRepo(), REPO_CACHE_KEY, star lists (gql(), fetchUserLists(), refreshLists())
  sidebar.js        — showApp(), updateHeaderMeta(), setChip(), refreshLangList(), refreshTopicList(), topicCounts(), refreshListsBlock(), updateClearBtn(), clearAllFilters()
  tooltip.js        — showTooltip(), moveTooltip(), hideTooltip()
  detail.js         — openDetail(), closeDetail()
  renderer.js       — rebuildGraph() — canvas drawing, simulation, zoom, drag, focus mode
  events.js         — all top-level event listener wiring + session auto-restore + keyboard shortcuts
```

Scripts and stylesheets are loaded in dependency order via plain `<script defer>` / `<link>` tags — no bundler or build step.

## Architecture

### Three UI phases

1. **`#loading`** — fullscreen spinner, shown only when restoring from localStorage cache (controlled by `html.restoring` class added by an inline script in `<head>` before deferred scripts run)
2. **`#landing`** — username/token form, shown on first visit or after Reset
3. **`#app`** — the graph view, shown after a successful load

`showApp()` removes the `restoring` class, stops the starfield (`stopStarfield()`), hides landing, and adds `.visible` to `#app`.

### Landing starfield (`js/starfield.js`)

Lightweight canvas animation behind the landing form (~90–220 stars, twinkle + drift + mouse parallax, DPR-aware). `startStarfield()` runs on page load unless `html.restoring` is set; `stopStarfield()` is called by `showApp()`; Reset re-calls `startStarfield()`. It pauses on `visibilitychange`, and under `prefers-reduced-motion` draws one static frame instead of animating. `sfState` holds the active run's listeners so they can be fully detached on stop.

### Themes

Dark and light themes are defined as CSS custom properties in `css/base.css` (`:root` = dark, `[data-theme="light"]` = light overrides, including canvas colors `--grid/--link/--label/--label-hi/--star` and component colors like `--hover-bg/--chip-bg/--glow`). The synchronous inline script in `<head>` sets `data-theme` from `localStorage('stargaze_theme')` or `prefers-color-scheme` **before first paint** (no theme flash). The sidebar `#toggle-theme` switch flips `data-theme`, persists the choice, and calls `rebuildGraph()` so the canvas re-reads `themeColors()`. Theme survives Reset (it's a device preference, not session data).

### Session persistence (`js/api.js`, `js/events.js`)

On successful load, the username is saved to `localStorage('stargaze_username')` and the repo data is saved in compressed form to `localStorage(REPO_CACHE_KEY)`. On next page load, `events.js` reads the saved username, calls `loadRepos()`, which reads the cache and skips the API fetch entirely. Both the fetch and cache paths reset the layout state (`posCache.clear()`, `savedTransform = null`) so new data always starts with a fresh layout and camera.

**Cache compression** — raw API responses are large. `slimRepo()` stores only the fields the app uses, with short single-letter keys (`i/n/f/d/l/s/k/t/a`). `expandRepo()` is the inverse, reconstructing `html_url` from `full_name` and `owner` from `full_name.split('/')[0]`. See the key mapping comment in `api.js` before modifying either function.

**Star lists** — the cache object may also carry an optional `lists` field (`[{name, description, repos}]`). It is backward compatible: old caches without it parse fine and simply show no lists, so `REPO_CACHE_KEY` was not bumped when it was added.

**Re-fetch button** — `#btn-refetch` in the header calls `loadRepos(true)` which bypasses cache and fetches fresh data.

**Reset** — clears both localStorage keys and in-memory layout state (`posCache`, `savedTransform`, `currentClearFocus`), restarts the starfield, and returns to landing.

**Error path** — if a fetch fails while the landing is hidden by `html.restoring` (failed auto-restore), the catch in `loadRepos()` removes the class and re-shows the landing — otherwise the user would be stuck on the loading overlay forever.

### State

All mutable state lives as plain `let` variables in `js/state.js`, accessible globally across all script files:

| Variable | Purpose |
|---|---|
| `allRepos` | Repo array (raw from API or expanded from cache) |
| `graphData` | `{ nodes, links, topicMap, langMap }` |
| `filterLangs` | `Set<string>` — active language filters (OR within the facet; empty = none) |
| `filterTopics` | `Set<string>` — active topic filters (OR within the facet; empty = none) |
| `filterList` | Active star-list filter (`null` = none) |
| `allLists` | `[{ name, description, repos: [fullName,…] }]` — GitHub star lists from GraphQL or cache |
| `listsStatus` | `'none'` (no token) \| `'loading'` \| `'ready'` \| `'failed'` — drives the lists block empty state |
| `searchVal` | Current search string |
| `sim` | D3 force simulation instance |
| `selectedNode` | Currently open detail node |
| `canvasController` | AbortController for canvas event listeners |
| `resizeObs` | ResizeObserver for canvas sizing |
| `showLabels` | Whether node name labels are rendered |
| `currentDraw` | Reference to the active `draw()` closure |
| `currentZoom` | Reference to the active D3 zoom behavior |
| `zoomCanvas` | Reference to the active canvas element |
| `posCache` | `Map<nodeId, {x,y}>` — node positions persisted across `rebuildGraph()` calls so filter/search changes don't reshuffle the layout |
| `savedTransform` | Last zoom transform — the camera survives filter/search rebuilds |
| `currentClearFocus` | Renderer-provided `clearFocus()` closure; returns `true` when focus mode was active (used by Esc handling) |

### Renderer (`js/renderer.js`)

Uses Canvas 2D (not SVG) for performance with 1000+ nodes. Key design decisions:
- All canvas colors (background, grid, links, labels) come from `themeColors()` (CSS custom properties) read once per rebuild — the context uses `alpha:false`, so `draw()` fills an opaque theme background instead of `clearRect`
- All links drawn in one `beginPath()` + `stroke()` call
- Nodes batched by color to minimise `fillStyle` changes (two passes when focus mode is active: dimmed at alpha 0.1, normal at 0.88)
- `d3.quadtree` for O(log n) hover/click hit detection
- Tick-skipping for large graphs (skip every 2nd/3rd DOM repaint)
- `AbortController` cleans up canvas event listeners on each rebuild
- `ResizeObserver` with `requestAnimationFrame` debounce redraws on container resize

**Layout persistence** — `posCache` (nodeId → position) is written on every drawn tick and on drag end. On `rebuildGraph()`, if the cache is non-empty the new `simNodes` are seeded from it and the sim only gets a gentle reheat (`alpha(0.3)`); unseen nodes start near the center. Only a fresh graph (`posCache.size === 0`, i.e. new data from fetch/cache/reset) gets d3's phyllotaxis start + the full synchronous pre-warm (`tick()` × 50–300 before first render). The camera works the same way: `transform` initializes from `savedTransform`, and `zoomBehavior.transform` is set to the saved transform on rebuilds / identity on fresh graphs — either way it must be called explicitly to keep `canvas.__zoom` in sync, or the next pan jumps (old pan-jump bug).

**Focus mode** — clicking a node sets `focusedId` + `neighborSet` (node + direct neighbors from `simLinks`), dims everything else (nodes at low alpha, non-neighborhood links and labels skipped), and glides the camera to the neighborhood bbox via a `d3.transition` on `zoomBehavior.transform` (same math as zoom-fit). Clicking empty canvas, Esc, or `clearAllFilters()` exits. The detail panel opens independently of focus mode.

**Cursors** — canvas shows `grab` by default, `pointer` over nodes, `grabbing` while panning (zoom `start`/`end` events, guarded by `e.sourceEvent` so programmatic transforms don't trigger it) or dragging a node.

### Graph construction (`js/api.js` — `buildGraph`)

- Nodes: one per repo, each has a `_searchKey` (pre-lowercased concatenation of name, description, topics, language, full_name) for fast search matching
- Links: repos sharing a topic are connected (topic must have 2–25 repos; capped at 12 connections per topic to avoid hairball)
- `topicMap` / `langMap`: topic/language → array of node indices

### Star lists (`js/api.js`)

GitHub's "Lists" (user-named star categories) have **no REST endpoint** — they are fetched via GraphQL (`POST https://api.github.com/graphql`, `bearer` auth), so **they require a token**. `fetchUserLists()` queries `user(login:).lists(first:50)` with `items(first:100)` per list and paginates large lists via `node(id:)` follow-ups (cap 1000 items/list). It returns `null` on any failure — lists are optional and must never break the main load.

`refreshLists()` runs whenever a token is available: fire-and-forget after `showApp()` (fresh fetch or cache hit), or on demand from the token box in the sidebar empty state. It sets `listsStatus` (`loading` → `ready`/`failed`, with a `console.warn` on failure), replaces `allLists`, merges `lists` into the existing cache object (without touching the repos payload), drops a stale `filterList`, and calls `refreshListsBlock()`. On a token-less cache restore, lists load from the cache instead (`listsStatus = 'ready'`).

The `#lists-block` is **always visible** for discoverability: with no lists it shows an empty state (token input + "Load star lists" button for `'none'`/`'failed'`, a note for `'loading'`/`'ready'`-but-empty); with lists it shows items whose counts are **intersected with the loaded repos** (lists can contain since-unstarred repos). Filtering is AND logic with the other filters — `rebuildGraph()` resolves the active list to a `Set` of `fullName`s once per rebuild.

### Force simulation parameters

- Link distance scales with node degree: `42 + √(degA + degB) × 8`, strength `0.35` — hub nodes spread further
- Charge: `−120`, `distanceMax: 320`
- **Per-node gravity**: `forceX(W/2)` / `forceY(H/2)` at strength `0.02` — keeps isolated (unlinked) nodes near the pack. (Replaced `forceCenter`, which only centers the average and let outliers drift to the far edges. Tuned visually: 0.05 collapses the graph into an unreadable blob.)
- `alphaDecay: 0.04`, `velocityDecay: 0.4`

### Filters

Languages and topics are **multi-select**: `filterLangs` / `filterTopics` are `Set`s. Semantics: **OR within a facet** (repo matches any selected language / any selected topic), **AND across facets** (language ∧ topic ∧ star list ∧ search), applied in `rebuildGraph()` before constructing `simNodes` / `simLinks`. Each selected value gets its own chip (`setMultiChips()`) floating over the canvas top-left (`#active-filters`); the star-list filter stays single-select (`setChip()`).

- **Sidebar lists** (`refreshLangList()` / `refreshTopicList()` in `sidebar.js`) are sorted by count desc (A–Z tiebreak) and each column has an in-list search input (`#lang-filter` / `#topic-filter`) that filters the list itself without touching the graph.
- **Topic counts** come from `topicCounts()`: the **union** of all selected languages' repos, or global when none are selected (capped at top 80 entries).
- **Clear all** — `#btn-clear-filters` calls `clearAllFilters()` (language + topic + star list + search + list searches + focus mode). `updateClearBtn()` toggles its visibility and is called at the end of every `rebuildGraph()`.
- **Keyboard** (in `events.js`) — `/` focuses the search bar; `Esc` unwinds in order: blur input → close detail panel → exit focus mode → clear search. Shortcuts are ignored while typing in inputs and when the app phase isn't visible.

## GitHub API Usage

- Endpoint: `GET /users/{username}/starred?per_page=100&page={n}`
- Without token: 6 pages max (600 repos), subject to 60 req/hr unauthenticated limit
- With token: 20 pages max (2000 repos), token needs no special scopes
- Rate limit error → 403; user not found → 404
- Star lists use GraphQL (`POST /graphql`, token always required): `user(login:).lists` → `UserList.items` (union member: `Repository` only)
