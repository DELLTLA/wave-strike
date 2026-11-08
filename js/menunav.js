/* ควบคุมเมนูด้วยคีย์บอร์ด: ลูกศร/WASD เลื่อน · Enter เลือก · Backspace ย้อนกลับ
   ทำงานเฉพาะตอนมีหน้าจอเมนูแสดงอยู่ (ระหว่างเล่นไม่แตะต้องปุ่ม WASD ของเกม) */
const SEL = 'button:not([disabled]),.wcard,.tab,input:not([type=hidden]):not([disabled]),select:not([disabled])';
const DIRS = { ArrowUp:'u', KeyW:'u', ArrowDown:'d', KeyS:'d', ArrowLeft:'l', KeyA:'l', ArrowRight:'r', KeyD:'r' };
const BACK = ['#bMapBack','#bWBack','#bResume','#bQuit2','#bSetBack','button[data-a=close]','#bInvBack','#bSkinBack','#bBack'];
let usedKb = false;

const screenEl = () => document.querySelector('.screen.show');
const vis = el => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden' && el.offsetParent !== null; };
function items(scr){
  const out = []; scr.querySelectorAll(SEL).forEach(el => { if(vis(el) && !(el.closest('.wcard') && el !== el.closest('.wcard'))) out.push(el); });
  return out;
}
const ctr = el => { const r = el.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, r }; };
function pick(cur, list, d){
  const c = ctr(cur); let best = null, bs = 1e12;
  for(const el of list){ if(el === cur) continue; const t = ctr(el), dx = t.x-c.x, dy = t.y-c.y;
    let main, cross;
    if(d==='u'){ if(dy >= -2) continue; main = -dy; cross = Math.abs(dx); }
    else if(d==='d'){ if(dy <= 2) continue; main = dy; cross = Math.abs(dx); }
    else if(d==='l'){ if(dx >= -2) continue; main = -dx; cross = Math.abs(dy); }
    else { if(dx <= 2) continue; main = dx; cross = Math.abs(dy); }
    const sc = main + cross*2.2; if(sc < bs){ bs = sc; best = el; } }
  return best;
}
function mark(el){
  document.querySelectorAll('.kbfocus').forEach(e => e.classList.remove('kbfocus'));
  if(!el) return; el.classList.add('kbfocus'); if(!el.hasAttribute('tabindex') && !/^(BUTTON|INPUT|SELECT)$/.test(el.tagName)) el.setAttribute('tabindex','-1');
  try{ el.focus({ preventScroll:true }); el.scrollIntoView({ block:'nearest', inline:'nearest' }); }catch(e){}
}
function firstItem(list){ return list.find(e => e.classList.contains('primary')) || list.find(e => e.classList.contains('sel')) || list[0]; }
function goBack(scr){
  for(const q of BACK){ const b = scr.querySelector(q); if(b && vis(b)){ b.click(); return true; } }
  const b = [...scr.querySelectorAll('button')].find(x => vis(x) && /^(กลับ|ปิด|ออก)/.test(x.textContent.trim())); if(b){ b.click(); return true; }
  return false;
}
addEventListener('keydown', e => {
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const scr = screenEl(); if(!scr) return;
  const t = e.target, tag = t && t.tagName, type = t && t.type;
  const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && !/^(range|checkbox|button|radio)$/.test(type));
  if(typing) return;
  const d = DIRS[e.code];
  if(d){
    if(tag === 'INPUT' && type === 'range' && (d === 'l' || d === 'r') && e.code.startsWith('Arrow')) return;   // ให้ลูกศรซ้าย/ขวาปรับแถบเลื่อนตามปกติ
    const list = items(scr); if(!list.length) return;
    e.preventDefault(); e.stopPropagation(); usedKb = true;
    const cur = (t && list.includes(t.closest('.wcard')||t)) ? (t.closest('.wcard')||t) : (document.querySelector('.kbfocus') && list.includes(document.querySelector('.kbfocus')) ? document.querySelector('.kbfocus') : null);
    if(!cur){ mark(firstItem(list)); return; }
    const nx = pick(cur, list, d); mark(nx || cur); return;
  }
  if(e.code === 'Enter' || e.code === 'NumpadEnter'){
    const list = items(scr), cur = document.querySelector('.kbfocus');
    if(cur && list.includes(cur)){ e.preventDefault(); e.stopPropagation(); if(cur.tagName === 'SELECT'){ try{ cur.showPicker(); }catch(_){} } else cur.click(); }
    else if(usedKb || !list.length){ return; }
    return;
  }
  if(e.code === 'Backspace'){ if(goBack(scr)){ e.preventDefault(); e.stopPropagation(); } }
}, true);
/* เมื่อเปลี่ยนหน้าจอ ล้างกรอบโฟกัสเก่า */
new MutationObserver(() => { const k = document.querySelector('.kbfocus'); if(k && !vis(k)) k.classList.remove('kbfocus'); })
  .observe(document.body, { attributes:true, subtree:true, attributeFilter:['class'] });
addEventListener('mousedown', () => { document.querySelectorAll('.kbfocus').forEach(e => e.classList.remove('kbfocus')); }, true);
