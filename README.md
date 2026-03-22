# Stargaze

> Turn your GitHub starred repositories into an interactive knowledge graph — clustered by shared topics, colored by language.

No server. No build step. Open `index.html` and go.

---

## Quick Start

1. Open `index.html` in any modern browser
2. Enter a GitHub username
3. *(Optional)* Paste a GitHub token to load up to 2000 repos
4. Click **Build Graph →**

```mermaid
flowchart TD
    A([Open index.html]) --> B[Enter GitHub username]
    B --> C{Have a token?}
    C -- No --> D[Fetch up to 600 repos\n60 req/hr limit]
    C -- Yes --> E[Fetch up to 2000 repos\n5000 req/hr limit]
    D --> F[Build graph]
    E --> F
    F --> G([Interactive graph])
```

### GitHub Token

A token is optional but recommended for users with many stars. It only raises the API rate limit — **no scopes needed**.

Generate one at [github.com/settings/tokens](https://github.com/settings/tokens):
- **Classic token** — leave all checkboxes unchecked
- **Fine-grained token** — no extra permissions needed

---

## Understanding the Graph

### Nodes

Each **node** is one starred repository.

| Visual property | Meaning |
|---|---|
| Color | Programming language |
| Size | Star count (logarithmic scale, range 4–10 px) |
| Label | Repository name |

### Edges

Two repos are connected by an edge when they **share a topic tag**.

```mermaid
graph LR
    A[repo-A\ntopics: security, cli] -- security --- B[repo-B\ntopics: security, rust]
    A -- cli --- C[repo-C\ntopics: cli, terminal]
    B -- rust --- D[repo-D\ntopics: rust, wasm]
```

Edge generation rules:
- A topic must appear in **2–25 repos** to create edges (1 repo = nothing to connect; 26+ = too many edges)
- Each topic connects at most **12 repos** to each other to prevent hairballs
- Repos with **no topics** have no edges and float as isolated nodes

### Layout

The graph uses a D3 force simulation. Nodes that share many topics cluster together naturally.

```mermaid
flowchart LR
    subgraph "Cluster — shared topics"
        direction TB
        R1((repo)) --- R2((repo))
        R2 --- R3((repo))
        R1 --- R3
    end
    subgraph "Isolated — no topics"
        I1((repo))
        I2((repo))
    end
```

---

## Navigating the Graph

| Action | How |
|---|---|
| Zoom in / out | Scroll wheel, or **+** / **−** buttons |
| Fit all nodes | **⊡** button (bottom-right) |
| Pan | Click and drag on empty canvas |
| Pin a node | Drag the node itself |
| Open repo details | Click a node |
| Close details | Click empty canvas, or **×** in the panel |

---

## Filtering & Search

```mermaid
flowchart TD
    S([Start]) --> L[Pick a Language]
    L --> T[Topic list updates\nto show only topics\nin that language]
    T --> TP[Pick a Topic]
    TP --> G[Graph filters to repos\nmatching BOTH]
    L --> G2[Graph filters to\nlanguage only]
    G --> Clear[Click chip × to clear]
    Clear --> S
```

### Language filter

Click any language in the left column of the sidebar. The graph immediately filters to repos of that language. The active language appears as a **chip** in the top-left corner of the canvas — click **×** to clear it.

### Topic filter

Topic list is **dependent on the selected language** — pick a language first. The topic list then shows only topics that appear in repos of that language, with counts. Combining language + topic uses **AND logic** (repo must match both).

### Search bar

The search box (top bar) filters nodes in real time across:
- Repository name
- Description
- Topics
- Language
- Full name (`owner/repo`)

Search works independently of the language/topic filters — all three stack together.

---

## Sidebar at a Glance

```mermaid
flowchart LR
    subgraph Sidebar
        direction TB
        L[Languages column\nAll languages A–Z\nwith repo counts]
        T[Topics column\nDepends on selected language\nA–Z with counts]
        ST[Stats\nRepos · Languages · Topics · Edges]
        D[Display\nLabels toggle]
    end
```

---

## File Structure

```
index.html          — markup only
css/
  base.css          — CSS variables, reset, app shell
  landing.css       — landing page
  header.css        — top bar
  sidebar.css       — filters, chips, stats, toggles
  canvas.css        — canvas area, zoom controls
  detail.css        — repo detail panel
  tooltip.css       — hover tooltip
js/
  config.js         — language colors, helper functions
  state.js          — shared mutable state
  api.js            — GitHub fetch, graph data construction
  sidebar.js        — filter lists, active chips
  tooltip.js        — hover tooltip
  detail.js         — repo detail panel
  renderer.js       — Canvas 2D drawing, force simulation
  events.js         — event wiring
```

---

## How the Graph is Built

```mermaid
flowchart TD
    A[Raw GitHub API repos] --> B[Map to nodes\nid · name · language · stars · topics]
    B --> C[Build topicMap\ntopic → list of repo indices]
    C --> D{For each topic}
    D -- "< 2 repos" --> SKIP[Skip]
    D -- "2–25 repos" --> LINK[Link all pairs\ncapped at 12 per topic]
    D -- "> 25 repos" --> SKIP
    LINK --> E[Deduplicate edges]
    E --> F[Force simulation\nnodes + links]
    F --> G[Canvas renderer]
```

---

## Performance Notes

- Renders with **Canvas 2D**, not SVG — handles 1000+ nodes smoothly
- Simulation is **pre-warmed** synchronously before first paint so the graph appears settled
- Hit detection uses a **D3 quadtree** (O log n) instead of checking every node on hover
- Node labels are **viewport-culled** — only visible nodes are drawn
