// ── Landing starfield ──
// Lightweight canvas animation behind the landing form. Runs only while the
// landing page is visible — showApp() stops it, the Reset button restarts it.
let sfState = null;

function startStarfield(){
  const canvas = document.getElementById('starfield');
  if(!canvas) return;
  stopStarfield(); // tear down any previous run (listeners + RAF) before re-init

  const ctx  = canvas.getContext('2d');
  const starColor = themeColors().star; // follows the active theme
  const dpr  = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0, mx = 0.5, my = 0.5; // mx/my: parallax target, 0..1
  const stars = [];

  function resize(){
    W = canvas.offsetWidth; H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  const count = Math.round(Math.min(220, Math.max(90, (W * H) / 9000)));
  for(let i = 0; i < count; i++){
    stars.push({
      x: Math.random() * W, y: Math.random() * H,
      r:     Math.random() * 1.3 + 0.3,
      depth: Math.random() * 0.8 + 0.2,   // drives parallax strength + brightness
      phase: Math.random() * Math.PI * 2, // twinkle offset
      drift: (Math.random() - 0.5) * 0.06,
    });
  }

  const state = { raf: null };
  sfState = state;

  function drawFrame(t){
    ctx.clearRect(0, 0, W, H);
    const ox = (mx - 0.5) * 24, oy = (my - 0.5) * 16;
    ctx.fillStyle = starColor;
    for(const s of stars){
      const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + s.depth) + s.phase);
      ctx.globalAlpha = tw * (0.3 + s.depth * 0.6);
      ctx.beginPath();
      ctx.arc(s.x + ox * s.depth, s.y + oy * s.depth, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Respect reduced-motion: draw one static frame and skip the animation loop
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    drawFrame(0);
    sfState = null;
    return;
  }

  let t = 0;
  function tick(){
    if(sfState !== state) return; // stopped
    t += 0.016;
    for(const s of stars){
      s.x += s.drift;
      if(s.x < -4) s.x = W + 4; else if(s.x > W + 4) s.x = -4;
    }
    drawFrame(t);
    state.raf = requestAnimationFrame(tick);
  }

  state.onResize = resize;
  state.onMouse  = e => { mx = e.clientX / window.innerWidth; my = e.clientY / window.innerHeight; };
  state.onVis    = () => {
    if(document.hidden){ if(state.raf) cancelAnimationFrame(state.raf); state.raf = null; }
    else if(state.raf === null) tick();
  };

  window.addEventListener('resize', state.onResize);
  window.addEventListener('mousemove', state.onMouse);
  document.addEventListener('visibilitychange', state.onVis);
  tick();
}

function stopStarfield(){
  if(!sfState) return;
  if(sfState.raf) cancelAnimationFrame(sfState.raf);
  window.removeEventListener('resize', sfState.onResize);
  window.removeEventListener('mousemove', sfState.onMouse);
  document.removeEventListener('visibilitychange', sfState.onVis);
  sfState = null;
}

// Start on page load — unless a cached session is being restored (landing hidden)
if(!document.documentElement.classList.contains('restoring')){
  startStarfield();
}
