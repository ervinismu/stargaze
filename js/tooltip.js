function showTooltip(e, d){
  document.getElementById('tip-name').textContent = d.name;
  document.getElementById('tip-dot').style.cssText = `background:${d.color};box-shadow:0 0 4px ${d.color}`;
  document.getElementById('tip-lang').textContent = d.language;
  document.getElementById('tip-stars').textContent = '⭐ '+fmtNum(d.stars);
  tooltip.style.display = 'block';
  moveTooltip(e);
}

function moveTooltip(e){ tooltip.style.left=(e.clientX+14)+'px'; tooltip.style.top=(e.clientY-36)+'px'; }
function hideTooltip(){ tooltip.style.display='none'; }
