// ── Mutable app state ──
let allRepos      = [];
let graphData     = null;
let filterLangs   = new Set(); // active language filters — OR within the facet
let filterTopics  = new Set(); // active topic filters — OR within the facet
let filterList    = null;   // active star-list (GitHub "Lists" category) filter
let allLists      = [];     // [{ name, description, repos: [fullName,…] }] from GraphQL or cache
let listsStatus   = 'none'; // 'none' (no token) | 'loading' | 'ready' | 'failed' — drives the empty-state hint
let searchVal     = '';
let sim           = null;
let selectedNode  = null;
let canvasController = null;
let resizeObs     = null;
let showLabels    = true;
let currentDraw   = null;
let currentZoom   = null;
let zoomCanvas    = null;

// ── Layout persistence (survives rebuildGraph on filter/search changes) ──
let posCache       = new Map(); // nodeId -> {x,y} — keeps node positions stable across rebuilds
let savedTransform = null;      // last zoom transform — keeps the camera stable across rebuilds
let currentClearFocus = null;   // renderer-provided fn that exits focus mode (returns true if it did)

// ── Cached DOM refs ──
const landing = document.getElementById('landing');
const appEl   = document.getElementById('app');
const tooltip = document.getElementById('tooltip');
