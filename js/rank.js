/* ระบบยศ NEON STRIKE — ฝั่งเกม (ตรวจสิทธิ์ + หน้าต่างบัญชี/ปลดล็อคยศ)
   หมายเหตุ: ยศถูกตรวจและเก็บที่เซิร์ฟเวอร์ แต่การล็อคอาวุธทำในไฟล์ JS ของเกม
   ผู้ที่แก้โค้ดในเบราว์เซอร์ตัวเองจึงยังเลี่ยงได้ (เป็นข้อจำกัดของเกมฝั่งไคลเอนต์ทุกเกม) */
import { API_URL } from './config.js';

export const RANKS = {
  tester:    { id:'tester',    lv:0, name:'THE TESTER', price:'ฟรี',      color:'#9fb0c8',
    perks:['เล่นได้ 1 แมพ (Rain City)','ปืนหลัก 3 กระบอก: AR-77, LONGBOW-X, BREAKER-12 · ปืนพก: NX-9 เท่านั้น','อาวุธประชิด: ไม้เบสบอล (Home run bat)','ใช้สกิลกดได้ 2 อย่าง: พุ่ง (E) และคลื่นกระแทก (F)'] },
  gunner:    { id:'gunner',    lv:1, name:'GUNNER',     price:'25 บาท',   color:'#ffd24a',
    perks:['เพิ่มแมพ Sandstone Bazaar, Ashfall','ปืนพก/SMG/ไรเฟิล/ลูกซอง/สไนเปอร์ ส่วนใหญ่ (ปืนหลักช่อง 1 + ปืนพกช่อง 2)','อาวุธประชิดทุกชนิด','ใช้สกิลกดได้ครบทั้ง 5 อย่าง','ไม่มีระบบสุ่มสกิน'] },
  protecter: { id:'protecter', lv:2, name:'PROTECTER',  price:'50 บาท',   color:'#ff2bd6',
    perks:['เล่นได้ทุกอาวุธ','ปลดล็อคทุกแมพ','มีระบบสุ่มสกินปืน','รวมสิทธิ์ทุกอย่างของเวอร์ชันล่าสุด'] }
};
export const RANK_ORDER = ['tester','gunner','protecter'];

const TESTER_GUNS = ['ar','sniper','shotgun','pistol'];   /* ปืนหลัก 3 กระบอก + ปืนพกช่อง 2 คือ NX-9 PISTOL เท่านั้น */
const GUNNER_GUNS = ['pistol','viper18','triad3','ricochet','taser','magnum',      /* ปืนพก (ยกเว้น TWIN-9, STINGER-MP, TRIPLET-3, HAMMER-45) */
  'wasp','tempest','brawler','smg',                                                /* SMG (ยกเว้น NAILER, SENTRY-KIT, WHISPER-S) */
  'ar','cinder','gale','bulwark',                                                  /* ไรเฟิล (ยกเว้น ARTMA CABINE 01, RANGER-DMR, FROSTBITE) */
  'shotgun','twindrake','autohail',                                                /* ลูกซอง (ยกเว้น DRAGON'S BREATH) */
  'sniper','banshee','hawk'];                                                      /* สไนเปอร์ทั้งหมด */
const MAPS_BY = { tester:['rain'], gunner:['rain','desert','apoc'] };

export const state = { user:null, rank:'tester', token:'', online:false, err:'' };
const LS = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }, del(k){ try{ localStorage.removeItem(k); }catch(e){} } };
const lv = () => RANKS[state.rank].lv;
const listeners = [];
export const onRankChange = f => listeners.push(f);
const emit = () => listeners.forEach(f=>{ try{ f(state); }catch(e){} });

/* ---- สิทธิ์ ---- */
export function minRankGun(id){ return TESTER_GUNS.includes(id)?'tester':GUNNER_GUNS.includes(id)?'gunner':'protecter'; }
export function minRankMelee(id){ return id==='bat'?'tester':'gunner'; }
export function minRankMap(id){ return MAPS_BY.tester.includes(id)?'tester':MAPS_BY.gunner.includes(id)?'gunner':'protecter'; }
export const canGun   = id => lv() >= RANKS[minRankGun(id)].lv;
export const canMelee = id => lv() >= RANKS[minRankMelee(id)].lv;
export const canMap   = id => lv() >= RANKS[minRankMap(id)].lv;
const TESTER_SKILLS = ['dash','shock'];            /* THE TESTER ใช้ได้เฉพาะ พุ่ง (E) และ คลื่นกระแทก (F) — แก้รายการนี้ถ้าต้องการเปลี่ยน */
export const canSkill = id => lv() >= 1 || TESTER_SKILLS.includes(id);
export const canSkills = () => lv() >= 1;
export const canGacha  = () => lv() >= 2;

/* ---- API ---- */
async function api(path, body, method){
  if(!API_URL) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (js/config.js)');
  const h = { 'Content-Type':'application/json' }; if(state.token) h.Authorization = 'Bearer '+state.token;
  let r; try{ r = await fetch(API_URL+path, { method:method||(body?'POST':'GET'), headers:h, body:body?JSON.stringify(body):undefined }); }
  catch(e){ throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
  let j = {}; try{ j = await r.json(); }catch(e){}
  if(!r.ok) throw new Error(j.error||('ผิดพลาด ('+r.status+')'));
  return j;
}
function setSession(j){
  state.user = j.user||null; state.rank = RANKS[j.rank]?j.rank:'tester'; if(j.token){ state.token = j.token; LS.set('ns_token', j.token); }
  LS.set('ns_rank_cache', JSON.stringify({ u:state.user, r:state.rank })); emit(); paint();
}
function clearSession(){ state.user=null; state.rank='tester'; state.token=''; LS.del('ns_token'); LS.del('ns_rank_cache'); emit(); paint(); }
export async function initRank(){
  if(!API_URL){ const d = LS.get('ns_devrank'); if(RANKS[d]) { state.rank = d; } emit(); return; }
  state.token = LS.get('ns_token')||'';
  try{ const c = JSON.parse(LS.get('ns_rank_cache')||'null'); if(c&&state.token){ state.user=c.u; state.rank=RANKS[c.r]?c.r:'tester'; } }catch(e){}
  emit();
  if(!state.token) return;
  try{ const j = await api('/api/me'); setSession(j); state.online = true; }
  catch(e){ if(/401|เซสชัน|หมดอายุ/.test(e.message)){ clearSession(); } }
}

/* ---- หน้าต่าง ---- */
let root=null, mode='login', msg='', msgOk=false, focusRank='gunner';
function el(h){ const d=document.createElement('div'); d.innerHTML=h; return d.firstElementChild; }
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function ensureRoot(){
  if(root) return root;
  root = el('<div id="rankScr" class="screen scr2"></div>'); document.body.appendChild(root);
  root.addEventListener('click', onClick); root.addEventListener('submit', e=>e.preventDefault());
  return root;
}
export function openRankUI(r){ ensureRoot(); if(r&&RANKS[r]) focusRank=r; msg=''; paint(); root.classList.add('show'); document.querySelectorAll('.screen.show').forEach(s=>{ if(s!==root&&s.id!=='hud') s.classList.remove('show'); }); }
export function closeRankUI(){ if(root) root.classList.remove('show'); const m=document.getElementById('menuScr'); if(m) m.classList.add('show'); }
function paint(){
  if(!root) return;
  const logged = !!state.user, cur = RANKS[state.rank];
  let h = `<div class="wrap rk"><h1 class="title" style="font-size:clamp(28px,5.5vw,46px)">ปลดล็อคยศ</h1>`;
  if(!API_URL) h += `<div class="rkMsg bad">ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (js/config.js) — ตอนนี้เป็นโหมดออฟไลน์ ยศ: ${cur.name}</div>`;
  if(!logged){
    h += `<div class="rkBox"><div class="rkTabs"><button data-a="mode" data-m="login" class="${mode==='login'?'on':''}">เข้าสู่ระบบ</button><button data-a="mode" data-m="reg" class="${mode==='reg'?'on':''}">สมัครบัญชี</button></div>
      <form><input id="rkU" maxlength="16" placeholder="ชื่อผู้ใช้ (3–16 ตัว)" autocomplete="username"><input id="rkP" type="password" maxlength="64" placeholder="รหัสผ่าน (อย่างน้อย 6 ตัว)" autocomplete="${mode==='reg'?'new-password':'current-password'}">
      ${mode==='reg'?'<input id="rkP2" type="password" maxlength="64" placeholder="ยืนยันรหัสผ่าน" autocomplete="new-password">':''}
      <button class="mbtn primary" data-a="${mode==='reg'?'register':'login'}">${mode==='reg'?'สมัครบัญชี':'เข้าสู่ระบบ'}</button></form>
      <div class="rkHint">ต้องมีบัญชีก่อนจึงจะใส่รหัสปลดล็อคยศได้ ยศจะผูกกับบัญชีและใช้ได้ทุกเครื่อง</div></div>`;
  } else {
    h += `<div class="rkBox rkMe">👤 <b>${esc(state.user)}</b> · ยศ <b style="color:${cur.color}">${cur.name}</b> <button class="mbtn sm" data-a="logout">ออกจากระบบ</button></div>`;
  }
  h += `<div class="rkCards">` + RANK_ORDER.map(id=>{ const r=RANKS[id], mine=state.rank===id, below=r.lv<cur.lv;
    const act = id==='tester' ? `<div class="rkTag">${mine?'ยศปัจจุบัน':'ยศเริ่มต้น'}</div>`
      : mine ? `<div class="rkTag ok">ยศปัจจุบัน ✔</div>`
      : below ? `<div class="rkTag">คุณมียศสูงกว่าแล้ว</div>`
      : logged ? `<input class="rkCode" data-r="${id}" inputmode="numeric" maxlength="8" placeholder="รหัส 8 หลัก"><button class="mbtn sm" data-a="redeem" data-r="${id}">ยืนยันรหัส</button>`
      : `<div class="rkTag">เข้าสู่ระบบเพื่อใส่รหัส</div>`;
    return `<div class="wcard rkCard ${focusRank===id?'sel':''}" style="--rc:${r.color}"><h3 style="color:${r.color}">${r.name}</h3><div class="rkPrice">${r.price}</div><ul>${r.perks.map(p=>`<li>${p}</li>`).join('')}</ul>${act}</div>`; }).join('') + `</div>`;
  if(msg) h += `<div class="rkMsg ${msgOk?'ok':'bad'}">${esc(msg)}</div>`;
  h += `<button class="mbtn" data-a="close">กลับ</button></div>`;
  root.innerHTML = h;
}
async function onClick(e){
  const b = e.target.closest('button'); if(!b) return;
  const a = b.dataset.a; if(!a) return;
  if(a==='close') return closeRankUI();
  if(a==='mode'){ mode=b.dataset.m; msg=''; return paint(); }
  const v = id => (root.querySelector('#'+id)||{}).value||'';
  b.disabled = true;
  try{
    if(a==='login'||a==='register'){
      if(a==='register'&&v('rkP')!==v('rkP2')) throw new Error('รหัสผ่านสองช่องไม่ตรงกัน');
      const j = await api(a==='login'?'/api/login':'/api/register', { username:v('rkU').trim(), password:v('rkP') });
      msg = a==='login'?'เข้าสู่ระบบสำเร็จ':'สมัครบัญชีสำเร็จ'; msgOk=true; setSession(j);
    } else if(a==='logout'){ try{ await api('/api/logout',{}); }catch(e){} clearSession(); msg='ออกจากระบบแล้ว'; msgOk=true; paint(); }
    else if(a==='redeem'){
      const inp = root.querySelector(`.rkCode[data-r="${b.dataset.r}"]`), code = (inp&&inp.value||'').replace(/\D/g,'');
      if(code.length!==8) throw new Error('กรุณาใส่รหัส 8 หลัก');
      const j = await api('/api/redeem', { code, rank:b.dataset.r }); msg = j.message||'ปลดล็อคสำเร็จ'; msgOk=true; setSession(j);
    }
  }catch(err){ msg = err.message; msgOk=false; paint(); }
  b.disabled = false;
}
