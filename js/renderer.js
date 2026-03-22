function rebuildGraph(){
  if(sim) sim.stop();
  if(canvasController) canvasController.abort();
  canvasController = new AbortController();
  const signal = canvasController.signal;
  if(resizeObs){ resizeObs.disconnect(); resizeObs = null; }

  // ── Filter nodes & links ──
  const { nodes: allNodes, links: allLinks } = graphData;
  const q = searchVal.toLowerCase().trim();

  const visNodes = allNodes.filter(n => {
    if(filterLang  && n.language !== filterLang) return false;
    if(filterTopic && !n.topics.includes(filterTopic)) return false;
    if(q) return n.name.toLowerCase().includes(q)        ||
                 n.description.toLowerCase().includes(q) ||
                 n.topics.some(t => t.includes(q))       ||
                 n.language.toLowerCase().includes(q)    ||
                 n.fullName.toLowerCase().includes(q);
    return true;
  });

  const simNodes = visNodes.map(n => ({...n}));
  const visIds   = new Set(simNodes.map(n => n.id));
  const simLinks = allLinks
    .filter(l => visIds.has(l.source?.id ?? l.source) && visIds.has(l.target?.id ?? l.target))
    .map(l => ({ source: l.source?.id ?? l.source, target: l.target?.id ?? l.target }));

  const username = document.getElementById('input-username').value.trim();
  updateHeaderMeta(username, visNodes.length, allNodes.length, simLinks.length);

  // ── Canvas setup ──
  const canvas = document.getElementById('graph-canvas');
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const ctx = canvas.getContext('2d');

  let transform   = d3.zoomIdentity;
  let quadtree    = null;
  let hoveredNode = null;
  let dragNode    = null;
  let wasDragging = false;

  function buildQuadtree(){
    quadtree = d3.quadtree().x(d=>d.x).y(d=>d.y).addAll(simNodes);
  }

  function findNode(cx, cy, threshold = 20){
    if(!quadtree) return null;
    const [wx, wy] = transform.invert([cx, cy]);
    return quadtree.find(wx, wy, threshold / transform.k) || null;
  }

  // ── Draw functions ──
  function drawGrid(){
    const W = canvas.width, H = canvas.height;
    let spacing = 50;
    while(spacing * transform.k < 20) spacing *= 2;
    while(spacing * transform.k > 80) spacing /= 2;
    if(spacing * transform.k < 10) return;

    const dotR  = 1.2 / transform.k;
    const wx0   = -transform.x / transform.k;
    const wy0   = -transform.y / transform.k;
    const wx1   = (W - transform.x) / transform.k;
    const wy1   = (H - transform.y) / transform.k;
    const startX = Math.floor(wx0 / spacing) * spacing;
    const startY = Math.floor(wy0 / spacing) * spacing;

    ctx.fillStyle   = '#1e2d40';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for(let x = startX; x <= wx1 + spacing; x += spacing){
      for(let y = startY; y <= wy1 + spacing; y += spacing){
        ctx.moveTo(x + dotR, y);
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawLinks(){
    ctx.beginPath();
    ctx.strokeStyle = '#1e2d40';
    ctx.lineWidth   = 0.9 / transform.k;
    ctx.globalAlpha = 0.75;
    for(const l of simLinks){
      ctx.moveTo(l.source.x, l.source.y);
      ctx.lineTo(l.target.x, l.target.y);
    }
    ctx.stroke();
  }

  function drawNodes(){
    // Group by color to minimise fillStyle changes
    ctx.globalAlpha = 0.88;
    const byColor = new Map();
    for(const n of simNodes){
      if(n === hoveredNode) continue;
      const list = byColor.get(n.color);
      if(list) list.push(n); else byColor.set(n.color, [n]);
    }
    for(const [color, nodes] of byColor){
      ctx.fillStyle = color;
      ctx.beginPath();
      for(const n of nodes){
        const r = nodeR(n);
        ctx.moveTo(n.x + r, n.y);
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Hovered node on top with glow
    if(hoveredNode){
      const n = hoveredNode, r = nodeR(n) + 4;
      ctx.save();
      ctx.shadowColor = n.color;
      ctx.shadowBlur  = 15 / transform.k;
      ctx.fillStyle   = n.color;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawLabels(){
    if(!showLabels) return;
    const vx0 = -transform.x / transform.k;
    const vy0 = -transform.y / transform.k;
    const vx1 = (canvas.width  - transform.x) / transform.k;
    const vy1 = (canvas.height - transform.y) / transform.k;

    ctx.font         = `${10 / transform.k}px 'JetBrains Mono', monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha  = 1;
    ctx.shadowColor  = '#0b0c10';
    ctx.shadowBlur   = 4 / transform.k;

    for(const n of simNodes){
      if(n.x < vx0-60 || n.x > vx1+60 || n.y < vy0-60 || n.y > vy1+60) continue;
      ctx.fillStyle = n === hoveredNode ? '#e6edf3' : '#8b949e';
      ctx.fillText(
        n.name.length > 22 ? n.name.slice(0,20)+'…' : n.name,
        n.x,
        n.y + nodeR(n) + 3 / transform.k
      );
    }
    ctx.shadowBlur = 0;
  }

  function draw(){
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    drawGrid();
    drawLinks();
    drawNodes();
    drawLabels();
    ctx.restore();
  }

  // ── Simulation ──
  const degreeMap = new Map(simNodes.map(n => [n.id, 0]));
  for(const l of simLinks){
    degreeMap.set(l.source, (degreeMap.get(l.source)||0) + 1);
    degreeMap.set(l.target, (degreeMap.get(l.target)||0) + 1);
  }

  const W = canvas.width, H = canvas.height;
  sim = d3.forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks).id(d=>d.id)
      .distance(l => {
        const sd = degreeMap.get(l.source.id ?? l.source) || 1;
        const td = degreeMap.get(l.target.id ?? l.target) || 1;
        return 60 + Math.sqrt(sd + td) * 12;
      })
      .strength(0.3))
    .force('charge',  d3.forceManyBody().strength(-180).distanceMax(400))
    .force('center',  d3.forceCenter(W/2, H/2).strength(0.08))
    .force('collide', d3.forceCollide().radius(d=>nodeR(d)+5))
    .alphaDecay(0.04)
    .velocityDecay(0.4)
    .stop();

  const preTicks = Math.min(300, Math.max(50, Math.floor(10000 / Math.max(simNodes.length, 1))));
  for(let i = 0; i < preTicks; i++) sim.tick();

  currentDraw = draw;
  buildQuadtree();
  draw();

  let tickN = 0;
  const tickSkip = simNodes.length > 600 ? 3 : simNodes.length > 300 ? 2 : 1;
  sim.restart().on('tick', () => {
    if(++tickN % tickSkip !== 0) return;
    buildQuadtree();
    draw();
  });

  // ── Zoom / pan ──
  const zoomBehavior = d3.zoom()
    .scaleExtent([0.04, 8])
    .filter(e => {
      if(e.type === 'mousedown') return !findNode(e.offsetX, e.offsetY);
      return !e.button;
    })
    .on('zoom', e => { transform = e.transform; draw(); });

  d3.select(canvas).call(zoomBehavior).on('dblclick.zoom', null);
  currentZoom = zoomBehavior;
  zoomCanvas  = canvas;

  // ── Node drag ──
  canvas.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    const found = findNode(e.offsetX, e.offsetY);
    if(found){
      dragNode = found; wasDragging = false;
      sim.alphaTarget(0.3).restart();
      found.fx = found.x; found.fy = found.y;
    }
  }, { signal });

  canvas.addEventListener('mousemove', e => {
    if(dragNode){
      wasDragging = true;
      const [wx, wy] = transform.invert([e.offsetX, e.offsetY]);
      dragNode.fx = wx; dragNode.fy = wy;
      moveTooltip(e);
      return;
    }
    const found = findNode(e.offsetX, e.offsetY);
    if(found !== hoveredNode){
      hoveredNode = found; draw();
      if(found) showTooltip(e, found); else hideTooltip();
    } else if(found){
      moveTooltip(e);
    }
  }, { signal });

  canvas.addEventListener('mouseup', () => {
    if(dragNode){
      sim.alphaTarget(0);
      dragNode.fx = null; dragNode.fy = null; dragNode = null;
    }
  }, { signal });

  canvas.addEventListener('mouseleave', () => {
    hoveredNode = null; hideTooltip();
    if(dragNode){
      sim.alphaTarget(0);
      dragNode.fx = null; dragNode.fy = null; dragNode = null;
    }
    draw();
  }, { signal });

  canvas.addEventListener('click', e => {
    if(wasDragging){ wasDragging = false; return; }
    const found = findNode(e.offsetX, e.offsetY);
    if(found){
      const orig = allNodes.find(n => n.id === found.id) || found;
      openDetail(orig); hideTooltip();
    } else {
      closeDetail();
    }
  }, { signal });

  // ── Resize ──
  resizeObs = new ResizeObserver(() => {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    draw();
  });
  resizeObs.observe(canvas);
}
