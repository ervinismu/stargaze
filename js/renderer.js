function rebuildGraph(){
  if(sim) sim.stop();
  if(canvasController) canvasController.abort();
  canvasController = new AbortController();
  const signal = canvasController.signal;
  if(resizeObs){ resizeObs.disconnect(); resizeObs = null; }

  // ── Filter nodes & links ──
  const { nodes: allNodes, links: allLinks } = graphData;
  const q = searchVal.toLowerCase().trim();

  // Star-list filter: resolve the active list's repos to a Set once per rebuild
  const activeList = filterList && allLists.find(l => l.name === filterList);
  const activeListSet = activeList ? new Set(activeList.repos) : null;

  const visNodes = allNodes.filter(n => {
    // OR within each facet (any selected language / any selected topic), AND across facets
    if(filterLangs.size && !filterLangs.has(n.language)) return false;
    if(filterTopics.size){
      let match = false;
      for(const t of filterTopics){ if(n.topics.includes(t)){ match = true; break; } }
      if(!match) return false;
    }
    if(activeListSet && !activeListSet.has(n.fullName)) return false;
    if(q) return n._searchKey.includes(q);
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
  // alpha:false lets the browser skip alpha compositing — safe since background is always solid
  const ctx = canvas.getContext('2d', { alpha: false });
  // Canvas colors follow the active theme (read from CSS custom properties)
  const colors = themeColors();

  let transform    = savedTransform || d3.zoomIdentity;
  let quadtree     = null;
  let hoveredNode  = null;
  let dragNode     = null;
  let wasDragging  = false;
  let zoomRaf      = null;
  let focusedId    = null;  // node id in "focus mode" — everything except its neighbors is dimmed
  let neighborSet  = null;  // Set of ids: focused node + its direct neighbors
  // Viewport bounds in world space, updated once per draw() and shared across sub-functions
  let vx0 = 0, vy0 = 0, vx1 = 0, vy1 = 0;

  function buildQuadtree(){
    quadtree = d3.quadtree().x(d=>d.x).y(d=>d.y).addAll(simNodes);
  }

  // Persist node positions so the next rebuildGraph() (filter/search change)
  // starts from this layout instead of re-randomizing the whole graph.
  function cachePositions(){
    for(const n of simNodes){
      if(n.x == null) continue;
      const p = posCache.get(n.id);
      if(p){ p.x = n.x; p.y = n.y; } else posCache.set(n.id, { x: n.x, y: n.y });
    }
  }

  function findNode(cx, cy, threshold = 20){
    if(!quadtree) return null;
    const [wx, wy] = transform.invert([cx, cy]);
    return quadtree.find(wx, wy, threshold / transform.k) || null;
  }

  // ── Focus mode: dim everything except the clicked node and its neighbors ──
  function focusNode(node){
    focusedId = node.id;
    neighborSet = new Set([node.id]);
    for(const l of simLinks){
      const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
      if(s === node.id) neighborSet.add(t);
      else if(t === node.id) neighborSet.add(s);
    }
    draw();

    // Glide the camera to the focused neighborhood (same math as zoom-fit)
    let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
    for(const n of simNodes){
      if(!neighborSet.has(n.id)) continue;
      x0=Math.min(x0,n.x); y0=Math.min(y0,n.y);
      x1=Math.max(x1,n.x); y1=Math.max(y1,n.y);
    }
    if(x0 === Infinity) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight, pad = 100;
    const k  = Math.min(1.6, (W-pad*2)/Math.max(x1-x0,1), (H-pad*2)/Math.max(y1-y0,1));
    const tx = W/2 - k*(x0+x1)/2, ty = H/2 - k*(y0+y1)/2;
    d3.select(canvas).transition().duration(500)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(tx,ty).scale(k));
  }

  // Returns true when focus mode was active — lets Esc fall through to the next action
  function clearFocus(){
    if(focusedId === null) return false;
    focusedId = null; neighborSet = null;
    draw();
    return true;
  }
  currentClearFocus = clearFocus;

  // ── Draw functions ──
  function drawGrid(){
    let spacing = 50;
    while(spacing * transform.k < 20) spacing *= 2;
    while(spacing * transform.k > 80) spacing /= 2;
    if(spacing * transform.k < 10) return;

    const dotR   = 1.2 / transform.k;
    const startX = Math.floor(vx0 / spacing) * spacing;
    const startY = Math.floor(vy0 / spacing) * spacing;

    // fillRect is significantly faster than arc() for many small dots
    ctx.fillStyle   = colors.grid;
    ctx.globalAlpha = 0.9;
    for(let x = startX; x <= vx1 + spacing; x += spacing){
      for(let y = startY; y <= vy1 + spacing; y += spacing){
        ctx.fillRect(x - dotR, y - dotR, dotR * 2, dotR * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawLinks(){
    ctx.beginPath();
    ctx.strokeStyle = colors.link;
    ctx.lineWidth   = 0.9 / transform.k;
    ctx.globalAlpha = 0.75;
    for(const l of simLinks){
      // In focus mode only links inside the focused neighborhood are drawn
      if(neighborSet && !(neighborSet.has(l.source.id ?? l.source) && neighborSet.has(l.target.id ?? l.target))) continue;
      const sx = l.source.x, sy = l.source.y, tx = l.target.x, ty = l.target.y;
      // Skip links where both endpoints are clearly off-screen on the same side
      if(sx < vx0 && tx < vx0) continue;
      if(sx > vx1 && tx > vx1) continue;
      if(sy < vy0 && ty < vy0) continue;
      if(sy > vy1 && ty > vy1) continue;
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
  }

  function drawNodes(){
    // Group by color to minimise fillStyle changes. Nodes outside the focused
    // neighborhood are drawn in a separate low-alpha pass ("dimmed").
    const byColor = new Map(), dimByColor = new Map();
    for(const n of simNodes){
      if(n === hoveredNode) continue;
      if(n.x < vx0 - 12 || n.x > vx1 + 12 || n.y < vy0 - 12 || n.y > vy1 + 12) continue;
      const map  = (neighborSet && !neighborSet.has(n.id)) ? dimByColor : byColor;
      const list = map.get(n.color);
      if(list) list.push(n); else map.set(n.color, [n]);
    }
    for(const [map, alpha] of [[dimByColor, 0.1], [byColor, 0.88]]){
      if(!map.size) continue;
      ctx.globalAlpha = alpha;
      for(const [color, nodes] of map){
        ctx.fillStyle = color;
        ctx.beginPath();
        for(const n of nodes){
          const r = nodeR(n);
          ctx.moveTo(n.x + r, n.y);
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
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
    // Skip labels when zoomed out too far — they'd be unreadable anyway
    if(!showLabels || transform.k < 0.25) return;
    ctx.font         = `${10 / transform.k}px 'JetBrains Mono', monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.globalAlpha  = 1;
    // shadowBlur is one of the most expensive canvas operations — skipped for performance

    for(const n of simNodes){
      if(neighborSet && !neighborSet.has(n.id)) continue;
      if(n.x < vx0-60 || n.x > vx1+60 || n.y < vy0-60 || n.y > vy1+60) continue;
      ctx.fillStyle = n === hoveredNode ? colors.labelHi : colors.label;
      ctx.fillText(
        n.name.length > 22 ? n.name.slice(0,20)+'…' : n.name,
        n.x,
        n.y + nodeR(n) + 3 / transform.k
      );
    }
  }

  function draw(){
    const W = canvas.width, H = canvas.height;
    // Update shared viewport bounds in world space — used by all draw sub-functions for culling
    vx0 = -transform.x / transform.k;
    vy0 = -transform.y / transform.k;
    vx1 = (W - transform.x) / transform.k;
    vy1 = (H - transform.y) / transform.k;
    // Opaque theme background (canvas context has alpha:false — clearRect would be black)
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);
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

  // Seed positions from posCache so filter/search changes don't reshuffle the graph.
  // Only never-seen nodes start near the center. A fresh graph (empty cache) keeps
  // no positions at all and gets d3's default phyllotaxis start + full pre-warm.
  const isFresh = posCache.size === 0;
  if(!isFresh){
    for(const n of simNodes){
      const p = posCache.get(n.id);
      if(p){ n.x = p.x; n.y = p.y; }
      else { n.x = W/2 + (Math.random()-0.5)*120; n.y = H/2 + (Math.random()-0.5)*120; }
    }
  }

  sim = d3.forceSimulation(simNodes)
    .force('link', d3.forceLink(simLinks).id(d=>d.id)
      .distance(l => {
        const sd = degreeMap.get(l.source.id ?? l.source) || 1;
        const td = degreeMap.get(l.target.id ?? l.target) || 1;
        return 42 + Math.sqrt(sd + td) * 8;
      })
      .strength(0.35))
    .force('charge',  d3.forceManyBody().strength(-120).distanceMax(320))
    // Per-node gravity toward the center — keeps isolated (unlinked) nodes from
    // drifting to the far edges, which forceCenter alone could not prevent
    .force('x',       d3.forceX(W/2).strength(0.02))
    .force('y',       d3.forceY(H/2).strength(0.02))
    .force('collide', d3.forceCollide().radius(d=>nodeR(d)+4))
    .alphaDecay(0.04)
    .velocityDecay(0.4)
    .stop();

  // A fresh graph needs the full synchronous pre-warm so it appears settled;
  // a re-filtered graph already has good positions — just a gentle reheat.
  if(isFresh){
    const preTicks = Math.min(300, Math.max(50, Math.floor(10000 / Math.max(simNodes.length, 1))));
    for(let i = 0; i < preTicks; i++) sim.tick();
    cachePositions();
  } else {
    sim.alpha(0.3);
  }

  currentDraw = draw;
  buildQuadtree();
  draw();

  let tickN = 0;
  const tickSkip = simNodes.length > 600 ? 3 : simNodes.length > 300 ? 2 : 1;
  sim.restart().on('tick', () => {
    if(++tickN % tickSkip !== 0) return;
    cachePositions();
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
    .on('start', e => { if(e.sourceEvent) canvas.style.cursor = 'grabbing'; })
    .on('end',   () => { canvas.style.cursor = hoveredNode ? 'pointer' : 'grab'; })
    .on('zoom', e => {
      transform = e.transform;
      savedTransform = e.transform;
      // Throttle redraws to once per animation frame — scroll events fire far
      // faster than the screen refreshes (10-20×/sec vs 60fps), causing wasted
      // draw calls that block the main thread and cause zoom lag on large graphs.
      if(!zoomRaf) zoomRaf = requestAnimationFrame(() => { zoomRaf = null; draw(); });
    });

  d3.select(canvas).call(zoomBehavior).on('dblclick.zoom', null);
  // Sync D3's stored canvas.__zoom with our transform. Filter/search rebuilds keep
  // the user's camera (savedTransform); a fresh graph resets to identity. Either way
  // canvas.__zoom must match `transform` or the next pan jumps (old pan-fix bug).
  d3.select(canvas).call(zoomBehavior.transform, isFresh ? d3.zoomIdentity : transform);
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
      canvas.style.cursor = 'grabbing';
      moveTooltip(e);
      return;
    }
    const found = findNode(e.offsetX, e.offsetY);
    canvas.style.cursor = found ? 'pointer' : 'grab';
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
      cachePositions();
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
      focusNode(found);
      const orig = allNodes.find(n => n.id === found.id) || found;
      openDetail(orig); hideTooltip();
    } else {
      clearFocus();
      closeDetail();
    }
  }, { signal });

  // ── Resize ──
  let resizeRaf = null;
  resizeObs = new ResizeObserver(() => {
    if(resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
  });
  resizeObs.observe(canvas);

  updateClearBtn();
}
