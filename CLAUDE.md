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
  landing.css       — landing page, form inputs, buttons, error box
  header.css        — top bar, search input
  sidebar.css       — filter columns, lang/topic items, active chips, toggles, stats
  canvas.css        — canvas area, zoom controls, hint text
  detail.css        — right detail panel, topic pills, action buttons
  tooltip.css       — hover tooltip
js/
  config.js         — LANG_COLORS map, langColor(), nodeR(), fmtNum()
  state.js          — all mutable state variables and cached DOM refs
  api.js            — loadRepos(), buildGraph(), slimRepo(), expandRepo(), REPO_CACHE_KEY
  sidebar.js        — showApp(), updateHeaderMeta(), setChip(), refreshTopicList()
  tooltip.js        — showTooltip(), moveTooltip(), hideTooltip()
  detail.js         — openDetail(), closeDetail()
  renderer.js       — rebuildGraph() — canvas drawing, simulation, zoom, drag
  events.js         — all top-level event listener wiring + session auto-restore
```

Scripts and stylesheets are loaded in dependency order via plain `<script defer>` / `<link>` tags — no bundler or build step.

## Architecture

### Three UI phases

1. **`#loading`** — fullscreen spinner, shown only when restoring from localStorage cache (controlled by `html.restoring` class added by an inline script in `<head>` before deferred scripts run)
2. **`#landing`** — username/token form, shown on first visit or after Reset
3. **`#app`** — the graph view, shown after a successful load

`showApp()` removes the `restoring` class, hides landing, and adds `.visible` to `#app`.

### Session persistence (`js/api.js`, `js/events.js`)

On successful load, the username is saved to `localStorage('stargaze_username')` and the repo data is saved in compressed form to `localStorage(REPO_CACHE_KEY)`. On next page load, `events.js` reads the saved username, calls `loadRepos()`, which reads the cache and skips the API fetch entirely.

**Cache compression** — raw API responses are large. `slimRepo()` stores only the fields the app uses, with short single-letter keys (`i/n/f/d/l/s/k/t/a`). `expandRepo()` is the inverse, reconstructing `html_url` from `full_name` and `owner` from `full_name.split('/')[0]`. See the key mapping comment in `api.js` before modifying either function.

**Re-fetch button** — `#btn-refetch` in the header calls `loadRepos(true)` which bypasses cache and fetches fresh data.

**Reset** — clears both localStorage keys and returns to landing.

### State

All mutable state lives as plain `let` variables in `js/state.js`, accessible globally across all script files:

| Variable | Purpose |
|---|---|
| `allRepos` | Repo array (raw from API or expanded from cache) |
| `graphData` | `{ nodes, links, topicMap, langMap }` |
| `filterLang` | Active language filter (`null` = none) |
| `filterTopic` | Active topic filter (`null` = none) |
| `searchVal` | Current search string |
| `sim` | D3 force simulation instance |
| `selectedNode` | Currently open detail node |
| `canvasController` | AbortController for canvas event listeners |
| `resizeObs` | ResizeObserver for canvas sizing |
| `showLabels` | Whether node name labels are rendered |
| `currentDraw` | Reference to the active `draw()` closure |
| `currentZoom` | Reference to the active D3 zoom behavior |
| `zoomCanvas` | Reference to the active canvas element |

### Renderer (`js/renderer.js`)

Uses Canvas 2D (not SVG) for performance with 1000+ nodes. Key design decisions:
- All links drawn in one `beginPath()` + `stroke()` call
- Nodes batched by color to minimise `fillStyle` changes
- `d3.quadtree` for O(log n) hover/click hit detection
- Simulation pre-warmed with synchronous `tick()` calls before first render
- Tick-skipping for large graphs (skip every 2nd/3rd DOM repaint)
- `AbortController` cleans up canvas event listeners on each rebuild
- `ResizeObserver` with `requestAnimationFrame` debounce redraws on container resize
- After attaching the zoom behavior, `zoomBehavior.transform` is explicitly reset to `d3.zoomIdentity` to sync `canvas.__zoom` with our `transform` variable — prevents a pan-jump bug when `rebuildGraph()` is called mid-session (e.g. after a filter change)

### Graph construction (`js/api.js` — `buildGraph`)

- Nodes: one per repo, each has a `_searchKey` (pre-lowercased concatenation of name, description, topics, language, full_name) for fast search matching
- Links: repos sharing a topic are connected (topic must have 2–25 repos; capped at 12 connections per topic to avoid hairball)
- `topicMap` / `langMap`: topic/language → array of node indices

### Force simulation parameters

- Link distance scales with node degree: `60 + √(degA + degB) × 12` — hub nodes spread further
- Charge: `−180`, `distanceMax: 400`
- Center: `strength(0.08)` — keeps isolated nodes from drifting too far
- `alphaDecay: 0.04`, `velocityDecay: 0.4`

### Filters

Language and topic filters are combinable (AND logic). Topic list is dependent on the selected language — `refreshTopicList()` rebuilds it from `graphData.langMap`. Both filters are applied in `rebuildGraph()` before constructing `simNodes` / `simLinks`. Active selections are shown as pill chips floating over the canvas top-left (`#active-filters`).

## GitHub API Usage

- Endpoint: `GET /users/{username}/starred?per_page=100&page={n}`
- Without token: 6 pages max (600 repos), subject to 60 req/hr unauthenticated limit
- With token: 20 pages max (2000 repos), token needs no special scopes
- Rate limit error → 403; user not found → 404
