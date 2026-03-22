# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stargaze is a client-side GitHub Stars Explorer that visualizes a user's starred repositories as a D3 force-directed graph. Repos are connected by shared topics and colored by programming language. No server or build step is required.

## Running the App

Open `index.html` directly in a browser — no build step needed. D3 and fonts load from CDN.

## File Structure

- `index.html` — markup only (two phases: `#landing` and `#app`)
- `style.css` — all styles, built on CSS variables defined in `:root`
- `script.js` — all logic and D3 rendering

## Architecture

State is managed via plain JS variables: `allRepos`, `graphData`, `filterLang`, `searchVal`, `sim`, `selectedNode`.

Two UI phases toggled by showing/hiding `#landing` and adding `.visible` to `#app`.

Key functions in `script.js`:
- `loadRepos()` — fetches starred repos from GitHub API, handles pagination (up to 600 without token, 2000 with token)
- `buildGraph(repos)` — constructs nodes/links; repos are linked when they share topics (topics with 2–25 repos, capped at 12 connections each)
- `rebuildGraph()` — tears down and re-renders the D3 simulation with current filters/search applied
- `openDetail(n)` / `closeDetail()` — right panel for selected node

## GitHub API Usage

- Endpoint: `GET /users/{username}/starred?per_page=100&page={n}`
- Without token: 6 pages max (600 repos), subject to 60 req/hr unauthenticated limit
- With token: 20 pages max (2000 repos), token needs no special scopes
- Rate limit error → 403; user not found → 404
