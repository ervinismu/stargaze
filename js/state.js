// ── Mutable app state ──
let allRepos      = [];
let graphData     = null;
let filterLang    = null;
let filterTopic   = null;
let searchVal     = '';
let sim           = null;
let selectedNode  = null;
let canvasController = null;
let resizeObs     = null;
let showLabels    = true;
let currentDraw   = null;
let currentZoom   = null;
let zoomCanvas    = null;

// ── Cached DOM refs ──
const landing = document.getElementById('landing');
const appEl   = document.getElementById('app');
const tooltip = document.getElementById('tooltip');
