import * as THREE from 'three';
import * as RK from './rank.js';
import './menunav.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
/* เลือกปืนได้ทุกกระบอกตั้งแต่เริ่ม (ไม่มีระบบปลดล็อก/ร้านปืน ตามที่ผู้เล่นต้องการ) */

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const rand = (a,b) => a + Math.random()*(b-a);
const easeOutBack = x => { const c1=1.70158, c3=c1+1; return 1 + c3*Math.pow(x-1,3) + c1*Math.pow(x-1,2); };
const isTouch = matchMedia('(pointer: coarse)').matches || (('ontouchstart' in window) && !matchMedia('(pointer: fine)').matches);

/* ================= SETTINGS ================= */
const DEF = {quality:isTouch?'med':'high',res:100,shadows:true,bloom:true,rain:true,fps:false,fov:isTouch?80:75,
  exposure:1.0,light:1.0,bloomStr:0.85,fog:1.0,master:80,sfx:90,music:45,gunVol:100,enemyVol:100,meleeVol:100,hurtVol:100,amb:90,sens:1.0,viewFx:100,vibrate:true,touchUI:isTouch,dmgNum:true,hitPause:true,slowmo:true,dmgDir:true};
let S = {...DEF};
try { Object.assign(S, JSON.parse(localStorage.getItem('ns_settings')||'{}')); } catch(e){}
const saveS = () => localStorage.setItem('ns_settings', JSON.stringify(S));

const CTRL_IDS = ['joy','fire','aim','jump','reload','sprint','swap','fm','sk1','sk2','sk3','sk4','sk5','inspect','qmelee','slide'];
const CTRL_NAMES = {joy:'จอยเดิน',fire:'ยิง',aim:'เล็ง',jump:'กระโดด',reload:'รีโหลด',sprint:'วิ่ง',swap:'สลับอาวุธ',fm:'สลับโหมดยิง',sk1:'สกิล พุ่ง',sk2:'สกิล คลื่น',sk3:'สกิล ชะลอ',sk4:'สกิล เร่ง',sk5:'สกิล โล่',inspect:'ควงอาวุธ',qmelee:'ตีด่วน',slide:'สไลด์/กระแทก'};
const DEF_L = {op:75,joy:{x:14,y:72,s:150},fire:{x:86,y:68,s:96},aim:{x:72,y:84,s:62},jump:{x:93,y:44,s:64},reload:{x:79,y:50,s:58},sprint:{x:7,y:42,s:56},swap:{x:64,y:56,s:54},fm:{x:71,y:36,s:50},sk1:{x:57,y:68,s:50},sk2:{x:50,y:80,s:50},sk3:{x:42,y:89,s:50},sk4:{x:93,y:27,s:50},sk5:{x:85,y:88,s:50},inspect:{x:93,y:60,s:50},qmelee:{x:79,y:36,s:50},slide:{x:7,y:56,s:56}};
/* ชุดปุ่ม 3 ชุด (แยกกันเก็บ): ชุด 1 ใช้คีย์เดิม ns_layout (ข้อมูลเก่าเข้าชุด 1 อัตโนมัติ) · ชุด 2-3 = ns_layout2/3 · ชุดที่ใช้อยู่ = ns_layout_slot */
let L = JSON.parse(JSON.stringify(DEF_L));
let LSLOT = 1; try { LSLOT = clamp(+localStorage.getItem('ns_layout_slot')||1,1,3)|0; } catch(e){}
const lKey = n => n===1 ? 'ns_layout' : 'ns_layout'+n;
function loadL(n){ L = JSON.parse(JSON.stringify(DEF_L)); try { const sv = JSON.parse(localStorage.getItem(lKey(n))||'null'); if (sv && typeof sv==='object') L = {...L, ...sv}; } catch(e){} }
loadL(LSLOT);
const saveL = () => { try { localStorage.setItem(lKey(LSLOT), JSON.stringify(L)); } catch(e){} };
function setLSlot(n){
  saveL(); LSLOT=n; try { localStorage.setItem('ns_layout_slot', n); } catch(e){}
  loadL(n); applyLayout(); refreshFmBtn(); if(editing) selectCtl(selCtl); refreshLSlotUI();
}
function refreshLSlotUI(){ document.querySelectorAll('#ebSlots .lsb').forEach(b=>b.classList.toggle('on',+b.dataset.n===LSLOT)); }

/* ================= RENDERER ================= */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
} catch(e) { document.body.innerHTML = '<h2 style="padding:30px">อุปกรณ์นี้ไม่รองรับ WebGL</h2>'; throw e; }
renderer.domElement.id = 'gl';
document.body.prepend(renderer.domElement);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = S.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
scene.fog = new THREE.FogExp2(0x0a0b1e, 0.016);
const camera = new THREE.PerspectiveCamera(S.fov, innerWidth/innerHeight, 0.05, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), S.bloomStr, 0.55, 0.8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ================= TEXTURES ================= */
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(w,h,draw,rx=1,ry=1){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=maxAniso; return t;
}
const floorTex = canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#0a0c17'; g.fillRect(0,0,w,h);
  for(let i=0;i<1400;i++){ g.fillStyle=`rgba(255,255,255,${Math.random()*0.035})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); }
  g.strokeStyle='#1a2140'; g.lineWidth=6; g.strokeRect(0,0,w,h);
  g.strokeStyle='#121833'; g.lineWidth=2; g.strokeRect(40,40,w-80,h-80);
},25,25);
const floorGlow = canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#000'; g.fillRect(0,0,w,h);
  g.strokeStyle='rgba(0,229,255,0.85)'; g.lineWidth=3; g.strokeRect(1.5,1.5,w-3,h-3);
  g.fillStyle='#ff2bd6'; [[0,0],[w,0],[0,h],[w,h]].forEach(([x,y])=>{g.beginPath();g.arc(x,y,7,0,7);g.fill();});
},25,25);
const wallTex = canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#151a2b'; g.fillRect(0,0,w,h);
  g.strokeStyle='#0b0e1a'; g.lineWidth=3;
  for(let y=0;y<h;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  for(let x=0;x<w;x+=128){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  for(let i=0;i<10;i++){g.fillStyle=Math.random()<.5?'#00e5ff':'#ff2bd6';g.fillRect(Math.random()*w,Math.random()*h,3,3);}
},8,1);
const towerTex = canvasTex(256,512,(g,w,h)=>{
  g.fillStyle='#121726'; g.fillRect(0,0,w,h);
  g.strokeStyle='#0a0d18'; g.lineWidth=4;
  for(let y=0;y<h;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
  g.fillStyle='#1d2440'; for(let y=20;y<h;y+=64) g.fillRect(20,y,w-40,16);
},1,3);
const crateTex = canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#2b303f'; g.fillRect(0,0,w,h);
  g.strokeStyle='#454c63'; g.lineWidth=18; g.strokeRect(9,9,w-18,h-18);
  g.lineWidth=12; g.beginPath(); g.moveTo(18,18); g.lineTo(w-18,h-18); g.moveTo(w-18,18); g.lineTo(18,h-18); g.stroke();
  g.fillStyle='#ffb300'; g.fillRect(w/2-40,h/2-14,80,28);
  g.fillStyle='#111'; g.font='bold 20px Arial'; g.textAlign='center'; g.fillText('NX-07',w/2,h/2+7);
});
const winTex = canvasTex(128,256,(g,w,h)=>{
  g.fillStyle='#04050b'; g.fillRect(0,0,w,h);
  const cols=['#ffd27a','#7fe9ff','#ff7ad9','#b0b8ff'];
  for(let y=6;y<h;y+=10) for(let x=4;x<w;x+=8){ if(Math.random()<0.3){ g.globalAlpha=0.35+Math.random()*0.65; g.fillStyle=cols[Math.random()*4|0]; g.fillRect(x,y,4,5);} }
  g.globalAlpha=1;
});
const dotTex = canvasTex(64,64,(g,w,h)=>{
  const gr=g.createRadialGradient(32,32,0,32,32,32); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.3,'rgba(255,255,255,.6)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,w,h);
});
const flashTex = canvasTex(128,128,(g,w,h)=>{
  g.translate(64,64);
  for(let i=0;i<6;i++){ g.rotate(Math.PI/3); const gr=g.createLinearGradient(0,0,60,0); gr.addColorStop(0,'rgba(255,255,220,1)'); gr.addColorStop(1,'rgba(255,160,40,0)'); g.fillStyle=gr; g.beginPath(); g.moveTo(0,-7); g.lineTo(60,0); g.lineTo(0,7); g.fill(); }
  const gr=g.createRadialGradient(0,0,0,0,0,34); gr.addColorStop(0,'rgba(255,255,230,1)'); gr.addColorStop(1,'rgba(255,140,30,0)'); g.fillStyle=gr; g.beginPath(); g.arc(0,0,34,0,7); g.fill();
});
function signTex(text,color){
  const t = canvasTex(1024,256,(g,w,h)=>{
    g.font='italic 900 150px Arial'; g.textAlign='center'; g.textBaseline='middle';
    g.shadowColor=color; g.shadowBlur=35; g.fillStyle=color; g.fillText(text,w/2,h/2); g.fillText(text,w/2,h/2);
    g.shadowBlur=0; g.globalAlpha=.85; g.fillStyle='#fff'; g.fillText(text,w/2,h/2);
  });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; return t;
}

/* ================= MATERIALS ================= */
const hdr = (hex,k) => new THREE.Color(hex).multiplyScalar(k);
const M = {
  floor: new THREE.MeshStandardMaterial({map:floorTex,emissiveMap:floorGlow,emissive:0xffffff,emissiveIntensity:0.7,roughness:0.16,metalness:0.6,envMapIntensity:0.25}),
  wall: new THREE.MeshStandardMaterial({map:wallTex,roughness:0.55,metalness:0.5,envMapIntensity:0.35}),
  tower: new THREE.MeshStandardMaterial({map:towerTex,roughness:0.5,metalness:0.6,envMapIntensity:0.35}),
  crate: new THREE.MeshStandardMaterial({map:crateTex,roughness:0.5,metalness:0.45,envMapIntensity:0.35}),
  dark: new THREE.MeshStandardMaterial({color:0x0e111c,roughness:0.35,metalness:0.85,envMapIntensity:0.4}),
  neonC: new THREE.MeshBasicMaterial({color:hdr(0x00e5ff,2.2)}),
  neonM: new THREE.MeshBasicMaterial({color:hdr(0xff2bd6,2.2)}),
  neonY: new THREE.MeshBasicMaterial({color:hdr(0xffb300,2.0)}),
};

/* ================= LIGHTS ================= */
const lights=[];
let mapG=new THREE.Group(); scene.add(mapG);
/* ตัวหมุดเงา: three ใช้ depth material ตัวเดียวร่วมกันในรอบเงา ถ้าวัตถุแรกที่ทอดเงาไม่มี map ค่า uniform เก่า (texture ของแมพก่อนหน้าที่ dispose แล้ว) จะค้าง
   แล้วถูกอัปโหลดใหม่ → texture รั่วทุกครั้งที่สลับแมพ  วางก้อนจิ๋วที่มี map ถาวรไว้เป็นวัตถุทอดเงาลำดับแรกเพื่อรีเซ็ตค่านี้ทุกเฟรม */
{ const pinT=canvasTex(2,2,(g)=>{ g.fillStyle='#fff'; g.fillRect(0,0,2,2); }); const pin=new THREE.Mesh(new THREE.BoxGeometry(0.02,0.02,0.02),new THREE.MeshBasicMaterial({map:pinT})); pin.position.set(0,-0.6,0); pin.castShadow=true; pin.frustumCulled=false; scene.add(pin); }
function addLight(l,base,root){ l.userData.base=base; lights.push(l); (root||mapG).add(l); return l; }
const hemi = addLight(new THREE.HemisphereLight(0x5566ff,0x1a0a2a,1), 0.55, scene);
const moon = addLight(new THREE.DirectionalLight(0xa8b8ff,1), 1.1, scene);
moon.position.set(-30,60,25); moon.castShadow=true;
Object.assign(moon.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:10,far:160});
moon.shadow.bias=-0.0004; moon.shadow.normalBias=0.03;
scene.add(moon.target);

/* ================= WORLD / MAPS ================= */
let A = 40;
const colliders=[], worldMeshes=[];
let mapUpd=null, mapRes=[], curMap='rain', mapReady=false;
const MAP_IDS=['rain','desert','apoc','frost','jungle','orbital','foundry','metro','testyard'];
let hazZones=[];   /* โซนอันตราย {x,z,hw,hd} เสียเลือดเมื่อยืนในโซน (เช่น บ่อกรด/ลาวา) */
const inHaz=(x,z,pad)=>hazZones.some(h=>Math.abs(x-h.x)<h.hw+pad&&Math.abs(z-h.z)<h.hd+pad);
let PSPD=1, ESPD=1;
let GRAV=25;   /* แรงโน้มถ่วงผู้เล่น (m/s²) ตั้งตามแมพ MAPS[id].grav */   // เพิ่มแมพใหม่: ใส่ id ที่นี่ + MAPS + PREV_DEF
let selMap=(()=>{ try{ const s=localStorage.getItem('ns_map'); return MAP_IDS.includes(s)?s:'rain'; }catch(e){ return 'rain'; } })();
function scaleUV(g,w,h,d,k){   // ให้ลายเท็กซ์เจอร์ขนาดคงที่ต่อเมตร ไม่ยืดตามขนาดกล่อง
  const uv=g.attributes.uv, f=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let i=0;i<24;i++){ const [a,b]=f[i>>2]; uv.setXY(i,uv.getX(i)*a*k,uv.getY(i)*b*k); }
  uv.needsUpdate=true;
}
function addBox(w,h,d,x,y,z,mat,collide=true,shadow=true,uvk=0){
  const g=new THREE.BoxGeometry(w,h,d); if(uvk) scaleUV(g,w,h,d,uvk);
  const m=new THREE.Mesh(g,mat); m.position.set(x,y,z);
  m.castShadow=shadow; m.receiveShadow=true; mapG.add(m);
  if(collide){ m.userData.col=true; worldMeshes.push(m); colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:y-h/2,maxY:y+h/2}); }
  return m;
}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
const boxFree=(x,z,hw,hd,pad)=>!colliders.some(b=>!b.ceil&&x+hw+pad>b.minX&&x-hw-pad<b.maxX&&z+hd+pad>b.minZ&&z-hd-pad<b.maxZ)&&!inHaz(x,z,Math.max(hw,hd)+pad);
const mkStd=o=>{ const m=new THREE.MeshStandardMaterial(o); mapRes.push(m); return m; };
const mkBasic=o=>{ const m=new THREE.MeshBasicMaterial(o); mapRes.push(m); return m; };
function skyDome(stops){
  const t=canvasTex(8,256,(g,w,h)=>{ const gr=g.createLinearGradient(0,0,0,h); stops.forEach(([p,c])=>gr.addColorStop(p,c)); g.fillStyle=gr; g.fillRect(0,0,w,h); });
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; mapRes.push({map:t,dispose(){}});
  const d=new THREE.Mesh(new THREE.SphereGeometry(450,24,16),mkBasic({map:t,side:THREE.BackSide,fog:false,depthWrite:false}));
  d.renderOrder=-10; mapG.add(d); return d;
}
function sunSprite(x,y,z,color,size,op=0.9){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTex,color,transparent:true,opacity:op,fog:false,blending:THREE.AdditiveBlending,depthWrite:false}));
  mapRes.push(s.material); s.scale.set(size,size,1); s.position.set(x,y,z); mapG.add(s); return s;
}
function dustPoints(n,col,size,op,top,additive){
  const p=new Float32Array(n*3); for(let i=0;i<n;i++) p.set([rand(-A,A),rand(0,top),rand(-A,A)],i*3);
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(p,3));
  const pt=new THREE.Points(g,mkBasic.call?new THREE.PointsMaterial({size,map:dotTex,color:col,transparent:true,opacity:op,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending}):null);
  mapRes.push(pt.material); mapG.add(pt); return {pt,p,g,n,top};
}
function buildRain(){
hemi.color.set(0x5566ff); hemi.groundColor.set(0x1a0a2a); hemi.userData.base=0.55; moon.color.set(0xa8b8ff); moon.userData.base=1.1; moon.position.set(-30,60,25);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(100,100), M.floor);
floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; mapG.add(floor); worldMeshes.push(floor);

// outer walls + neon trims
[[0,-A-0.5,2*A+2,1],[0,A+0.5,2*A+2,1],[-A-0.5,0,1,2*A+2],[A+0.5,0,1,2*A+2]].forEach(([x,z,w,d],i)=>{
  addBox(w,5,d,x,2.5,z,M.wall);
  const tx = x===0?0:x-Math.sign(x)*0.52, tz = z===0?0:z-Math.sign(z)*0.52;
  addBox(w===1?0.08:w,0.1,d===1?0.08:d,tx,4.9,tz,i%2?M.neonM:M.neonC,false,false);
  addBox(w===1?0.08:w,0.06,d===1?0.08:d,tx,0.25,tz,i%2?M.neonC:M.neonM,false,false);
});
// light poles along walls
for(let i=-3;i<=3;i++){ if(i===0) continue;
  [[i*10,-A+0.7],[i*10,A-0.7],[-A+0.7,i*10],[A-0.7,i*10]].forEach(([x,z],k)=>{
    addBox(0.15,6.5,0.15,x,3.25,z,M.dark,false,false);
    addBox(0.5,0.12,0.5,x,6.5,z,k%2?M.neonC:M.neonM,false,false);
  });
}
// towers
const towerCols=[0x00e5ff,0xff2bd6,0xff2bd6,0x00e5ff];
[[-16,-16],[16,-16],[-16,16],[16,16]].forEach(([x,z],i)=>{
  addBox(5,14,5,x,7,z,M.tower);
  const nm = towerCols[i]===0x00e5ff?M.neonC:M.neonM;
  [[-2.55,-2.55],[2.55,-2.55],[-2.55,2.55],[2.55,2.55]].forEach(([ox,oz])=>addBox(0.12,14,0.12,x+ox,7,z+oz,nm,false,false));
  addBox(5.2,0.15,5.2,x,4,z,nm,false,false);
  addBox(5.2,0.15,5.2,x,14.05,z,M.neonY,false,false);
  const pl = addLight(new THREE.PointLight(towerCols[i],1,26,2),45);
  pl.position.set(x-Math.sign(x)*4,3,z-Math.sign(z)*4);
});
// center platform + holo
addBox(8,0.8,8,0,0.4,0,M.dark);
[[0,4.02,8,0.08],[0,-4.02,8,0.08],[4.02,0,0.08,8],[-4.02,0,0.08,8]].forEach(([x,z,w,d])=>addBox(w,0.08,d,x,0.78,z,M.neonC,false,false));
const holo = new THREE.Group(); holo.position.set(0,5,0); mapG.add(holo);
const holoMat = new THREE.MeshBasicMaterial({color:hdr(0xff2bd6,2),transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false});
const holoR1 = new THREE.Mesh(new THREE.TorusGeometry(2.4,0.05,8,64),holoMat); holo.add(holoR1);
const holoR2 = new THREE.Mesh(new THREE.TorusGeometry(1.7,0.04,8,64),M.neonC); holo.add(holoR2);
const holoCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.7,0),new THREE.MeshBasicMaterial({color:hdr(0x00e5ff,1.6),wireframe:true})); holo.add(holoCore);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6,1.6,5,24,1,true),new THREE.MeshBasicMaterial({color:0x00e5ff,transparent:true,opacity:0.08,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
beam.position.set(0,3.3,0); mapG.add(beam);
addLight(new THREE.PointLight(0xff2bd6,1,18,2),25).position.set(0,4,0);
// cover walls
[[0,-12,8,1.3,0.8],[0,12,8,1.3,0.8],[-12,0,0.8,1.3,8],[12,0,0.8,1.3,8],[-27,-6,0.8,1.3,6],[27,6,0.8,1.3,6],[6,-27,6,1.3,0.8],[-6,27,6,1.3,0.8]].forEach(([x,z,w,h,d])=>{
  addBox(w,h,d,x,h/2,z,M.wall); addBox(w+0.02,0.06,d+0.02,x,h+0.01,z,M.neonY,false,false);
});
// crates (seeded)
const rng=mulberry32(1337), rr=(a,b)=>a+rng()*(b-a);
for(let placed=0,tries=0;placed<26&&tries<600;tries++){
  const s=rr(1.2,2.2), x=rr(-A+3,A-3), z=rr(-A+3,A-3);
  if(Math.hypot(x,z)<7||!boxFree(x,z,s/2,s/2,1.7)) continue;
  addBox(s,s,s,x,s/2,z,M.crate);
  if(rng()<0.35){ const s2=s*rr(0.55,0.8); addBox(s2,s2,s2,x+rr(-.2,.2),s+s2/2,z+rr(-.2,.2),M.crate); }
  placed++;
}
// signs
const sign1=new THREE.Mesh(new THREE.PlaneGeometry(16,4),mkBasic({map:signTex('NEON STRIKE','#ff2bd6'),transparent:true,color:new THREE.Color(1.8,1.8,1.8),depthWrite:false}));
sign1.position.set(0,8,-A+0.2); mapG.add(sign1);
const sign2=new THREE.Mesh(new THREE.PlaneGeometry(16,4),mkBasic({map:signTex('RAIN CITY','#00e5ff'),transparent:true,color:new THREE.Color(1.8,1.8,1.8),depthWrite:false}));
sign2.position.set(0,8,A-0.2); sign2.rotation.y=Math.PI; mapG.add(sign2);
// skyline
const unitBox=new THREE.BoxGeometry(1,1,1);
for(let i=0;i<70;i++){
  const ang=i/70*Math.PI*2+Math.random()*0.08, r=rand(58,115), w=rand(6,15), h=rand(18,85);
  const t=winTex.clone(); t.repeat.set(Math.max(1,Math.round(w/7)),Math.max(1,Math.round(h/14))); t.needsUpdate=true;
  const bm=new THREE.MeshBasicMaterial({map:t,color:new THREE.Color(1.25,1.25,1.25)}); mapRes.push(bm); const b=new THREE.Mesh(unitBox,bm);   // ลงทะเบียนเพื่อ dispose เท็กซ์เจอร์ที่ clone ตอนเปลี่ยนแมพ
  b.scale.set(w,h,w); b.position.set(Math.cos(ang)*r,h/2,Math.sin(ang)*r); mapG.add(b);
  if(Math.random()<0.4){ const n=new THREE.Mesh(unitBox,Math.random()<.5?M.neonC:M.neonM); n.scale.set(w+0.2,0.4,w+0.2); n.position.set(b.position.x,h*rand(0.6,1),b.position.z); mapG.add(n); }
  if(Math.random()<0.3){ const a=new THREE.Mesh(unitBox,new THREE.MeshBasicMaterial({color:hdr(0xff2020,3)})); a.scale.set(0.6,0.6,0.6); a.position.set(b.position.x,h+3,b.position.z); mapG.add(a); }
}
// moon + stars
const moonM=new THREE.Mesh(new THREE.SphereGeometry(12,32,16),new THREE.MeshBasicMaterial({color:hdr(0xdfe8ff,1.5),fog:false}));
moonM.position.set(-130,120,-180); mapG.add(moonM);
const moonGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTex,color:0x8899ff,transparent:true,opacity:0.5,fog:false,blending:THREE.AdditiveBlending,depthWrite:false}));
moonGlow.scale.set(90,90,1); moonGlow.position.copy(moonM.position); mapG.add(moonGlow);
{ const n=1500,p=new Float32Array(n*3); for(let i=0;i<n;i++){ const th=Math.random()*Math.PI*2, ph=Math.random()*Math.PI*0.45, R=300; p[i*3]=Math.cos(th)*Math.sin(ph)*R; p[i*3+1]=Math.cos(ph)*R; p[i*3+2]=Math.sin(th)*Math.sin(ph)*R; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(p,3));
  mapG.add(new THREE.Points(g,new THREE.PointsMaterial({size:1.2,color:0xaabbff,fog:false,sizeAttenuation:true}))); }

/* ================= AMBIENT FX: rain, motes ================= */
const RN=1800, rainPos=new Float32Array(RN*6);
for(let i=0;i<RN;i++){ const x=rand(-30,30),y=rand(0,25),z=rand(-30,30); rainPos.set([x,y,z,x+0.06,y+0.7,z],i*6); }
const rainGeo=new THREE.BufferGeometry(); rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:0x9ec5ff,transparent:true,opacity:0.35}));
rain.frustumCulled=false; mapG.add(rain);
const MN=300, motePos=new Float32Array(MN*3);
for(let i=0;i<MN;i++) motePos.set([rand(-A,A),rand(0,12),rand(-A,A)],i*3);
const moteGeo=new THREE.BufferGeometry(); moteGeo.setAttribute('position',new THREE.BufferAttribute(motePos,3));
const motes=new THREE.Points(moteGeo,new THREE.PointsMaterial({size:0.12,map:dotTex,color:hdr(0x00e5ff,1.5),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
mapG.add(motes);


mapUpd=(dt,time)=>{
  holo.rotation.y+=dt*0.6; holoR1.rotation.x=Math.sin(time*0.7)*0.6+Math.PI/2; holoR2.rotation.y+=dt*1.5; holoCore.rotation.x+=dt; holoCore.position.y=Math.sin(time*1.5)*0.3;
  const rnOn=S.rain&&S.quality!=='min'; rain.visible=rnOn;
  if(rnOn){ const cx=camera.position.x, cz=camera.position.z;
    for(let i=0;i<RN;i++){ const o=i*6; let y=rainPos[o+1]-dt*24, x=rainPos[o], z=rainPos[o+2];
      if(y<0||Math.abs(x-cx)>32||Math.abs(z-cz)>32){ y=rand(15,25); x=cx+rand(-30,30); z=cz+rand(-30,30); }
      rainPos[o]=x; rainPos[o+1]=y; rainPos[o+2]=z; rainPos[o+3]=x+0.06; rainPos[o+4]=y+0.7; rainPos[o+5]=z; }
    rainGeo.attributes.position.needsUpdate=true; }
  for(let i=0;i<MN;i++){ let y=motePos[i*3+1]+dt*0.3; if(y>12) y=0; motePos[i*3+1]=y; motePos[i*3]+=Math.sin(time+i)*dt*0.2; }
  moteGeo.attributes.position.needsUpdate=true;
};

}

/* ---------- แมพ 2: SANDSTONE BAZAAR (สไตล์คลาสสิกสมัยก่อน กลางวัน) ---------- */
function buildDesert(){
  hemi.color.set(0x9cc8ff); hemi.groundColor.set(0xc9a26b); hemi.userData.base=0.95;
  moon.color.set(0xfff0d0); moon.userData.base=2.3; moon.position.set(45,75,25);
  skyDome([[0,'#2f7fd8'],[0.3,'#6fb0ea'],[0.5,'#dbe9f2'],[0.56,'#e8d3a8'],[1,'#c9a26b']]);
  sunSprite(160,170,90,0xfff2c0,130);
  const shade=(c,v)=>`rgb(${Math.max(0,Math.min(255,c[0]+v))},${Math.max(0,Math.min(255,c[1]+v))},${Math.max(0,Math.min(255,c[2]+v))})`;
  const brickT=(base,mort)=>canvasTex(256,256,(g,w,h)=>{ g.fillStyle=mort; g.fillRect(0,0,w,h);
    for(let r=0;r<8;r++) for(let c=-1;c<5;c++){ const x=c*64+(r%2?32:0), v=Math.random()*26-13; g.fillStyle=shade(base,v); g.fillRect(x+2,r*32+2,60,28); }
    for(let i=0;i<500;i++){ g.fillStyle=`rgba(60,40,20,${Math.random()*0.08})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } });
  const sandT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#d2b27c'; g.fillRect(0,0,w,h);
    for(let i=0;i<4000;i++){ const v=Math.random(); g.fillStyle=v<0.5?`rgba(255,235,190,${Math.random()*0.18})`:`rgba(120,85,40,${Math.random()*0.16})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } },24,24);
  const plasterT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#e0c89c'; g.fillRect(0,0,w,h);
    for(let i=0;i<60;i++){ g.fillStyle=`rgba(120,90,50,${Math.random()*0.08})`; g.fillRect(Math.random()*w,Math.random()*h,Math.random()*60,Math.random()*30); }
    for(let i=0;i<1500;i++){ g.fillStyle=`rgba(80,60,30,${Math.random()*0.1})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } });
  const woodT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#8a5a2b'; g.fillRect(0,0,w,h);
    for(let r=0;r<6;r++){ g.fillStyle=shade([138,90,43],Math.random()*30-15); g.fillRect(0,r*43+2,w,39); for(let i=0;i<20;i++){ g.fillStyle='rgba(50,30,10,0.25)'; g.fillRect(Math.random()*w,r*43+4+Math.random()*34,Math.random()*60,1); } }
    g.strokeStyle='#4a2c12'; g.lineWidth=10; g.strokeRect(5,5,w-10,h-10); g.beginPath(); g.moveTo(0,0); g.lineTo(w,h); g.moveTo(w,0); g.lineTo(0,h); g.stroke(); });
  const brick=mkStd({map:brickT([196,150,98],'#8a6c46'),roughness:0.95,metalness:0,envMapIntensity:0.15});
  const brick2=mkStd({map:brickT([176,124,84],'#7a5a3c'),roughness:0.95,metalness:0,envMapIntensity:0.15});
  const plaster=mkStd({map:plasterT,roughness:0.95,metalness:0,envMapIntensity:0.15});
  const wood=mkStd({map:woodT,roughness:0.85,metalness:0,envMapIntensity:0.15});
  const trim=mkStd({color:0x6b4a2a,roughness:0.9,metalness:0}), dark=mkStd({color:0x24170d,roughness:1,metalness:0});
  const sand=mkStd({map:sandT,roughness:1,metalness:0,envMapIntensity:0.1});
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(130,130),sand); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; mapG.add(fl); worldMeshes.push(fl);
  const bx=(w,h,d,x,y,z,m,k=0.4)=>addBox(w,h,d,x,y,z,m,true,true,k), dec=(w,h,d,x,y,z,m)=>addBox(w,h,d,x,y,z,m,false,true);
  const Wt=1.2, H=6;
  [[0,-A-Wt/2,2*A+2*Wt,Wt],[0,A+Wt/2,2*A+2*Wt,Wt],[-A-Wt/2,0,Wt,2*A],[A+Wt/2,0,Wt,2*A]].forEach(([x,z,w,d])=>{ bx(w,H,d,x,H/2,z,brick); addBox(w+0.3,0.3,d+0.3,x,H+0.15,z,trim,false,true,0.4); });
  const bld=(x,z,w,d,h,m)=>{ bx(w,h,d,x,h/2,z,m); dec(w+0.4,0.35,d+0.4,x,h+0.17,z,trim);
    [1,-1].forEach(sg=>{ dec(1.6,2.4,0.1,x,1.2,z+sg*(d/2+0.03),dark); dec(1.1,1.1,0.1,x+w/4,3.6,z+sg*(d/2+0.03),dark); dec(1.1,1.1,0.1,x-w/4,3.6,z+sg*(d/2+0.03),dark); }); };
  const gate=(x,z,span,piece,h,m)=>{ const px=span/2+piece/2; bx(piece,h,6,x-px,h/2,z,m); bx(piece,h,6,x+px,h/2,z,m); bx(span+0.02,h-3.5,6,x,3.5+(h-3.5)/2,z,m); dec(span+0.5,0.3,6.2,x,3.5,z,trim); dec(piece+0.4,0.35,6.4,x-px,h+0.17,z,trim); dec(piece+0.4,0.35,6.4,x+px,h+0.17,z,trim); };
  bld(-22,-22,10,10,7,plaster); bld(22,22,10,10,7,plaster);
  bld(-33,6,6,14,6.5,brick2); bld(33,-6,6,14,6.5,brick2);
  bld(-33,-16,6,8,5,brick); bld(33,16,6,8,5,brick);
  gate(0,-30,6,5,6.5,brick); gate(0,30,6,5,6.5,brick);
  bx(1.2,3,10,-12,1.5,-6,brick2); bx(1.2,3,10,12,1.5,6,brick2);
  bx(2.4,1.1,2.4,0,0.55,-10,brick2); dec(2.8,0.2,2.8,0,1.2,-10,trim);          // บ่อน้ำกลางลาน
  const sites=[[-22,22,'A'],[22,-22,'B']];
  sites.forEach(([x,z,ch])=>{ const lt=canvasTex(256,256,(g,w,h)=>{ g.font='900 190px Arial'; g.textAlign='center'; g.textBaseline='middle'; g.fillStyle='rgba(150,30,20,0.75)'; g.fillText(ch,w/2,h/2+10); g.strokeStyle='rgba(150,30,20,0.6)'; g.lineWidth=10; g.strokeRect(14,14,w-28,h-28); });
    lt.wrapS=lt.wrapT=THREE.ClampToEdgeWrapping; const m=mkBasic({map:lt,transparent:true,depthWrite:false});
    const p=new THREE.Mesh(new THREE.PlaneGeometry(9,9),m); p.rotation.x=-Math.PI/2; p.position.set(x,0.03,z); mapG.add(p);
    bx(1.6,1.6,1.6,x-5.5,0.8,z+4,wood); bx(1.6,1.6,1.6,x-3.9,0.8,z+4.2,wood); bx(1.5,1.5,1.5,x-4.7,2.35,z+4.1,wood);
    bx(5,1,0.8,x+1,0.5,z-5.5,plaster,0.4); bx(0.8,1,4,x+6,0.5,z-3,plaster,0.4); });
  const rng=mulberry32(4242), rr=(a,b)=>a+rng()*(b-a);
  for(let placed=0,tries=0;placed<20&&tries<500;tries++){
    const s=rr(1.2,2.1), x=rr(-A+3,A-3), z=rr(-A+3,A-3);
    if(Math.hypot(x,z)<7||!boxFree(x,z,s/2,s/2,1.7)) continue;
    bx(s,s,s,x,s/2,z,wood,0.5); if(rng()<0.3){ const s2=s*rr(0.55,0.8); bx(s2,s2,s2,x+rr(-.2,.2),s+s2/2,z+rr(-.2,.2),wood,0.5); } placed++; }
  const dm=mkBasic({color:0xc8a878}), dm2=mkBasic({color:0xd2b07a});
  for(let i=0;i<16;i++){ const ang=i/16*Math.PI*2, r=rand(110,160), d=new THREE.Mesh(XSPH,dm2); d.scale.set(rand(35,65),rand(6,14),rand(35,65)); d.position.set(Math.cos(ang)*r,-1,Math.sin(ang)*r); mapG.add(d); }
  for(let i=0;i<34;i++){ const ang=rand(0,Math.PI*2), r=rand(60,105), w=rand(6,14), h=rand(6,15), b=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),dm); b.position.set(Math.cos(ang)*r,h/2,Math.sin(ang)*r); mapG.add(b); }
  const dust=dustPoints(220,0xe8d6b0,0.2,0.45,10,false);
  mapUpd=(dt,time)=>{ const p=dust.p; for(let i=0;i<dust.n;i++){ p[i*3]+=dt*(0.7+Math.sin(i)*0.25); p[i*3+1]+=Math.sin(time*0.5+i)*dt*0.1; if(p[i*3]>A) p[i*3]=-A; }
    dust.g.attributes.position.needsUpdate=true; };
}


/* ---------- แมพ 9: TEST YARD (ลานทดสอบกว้าง กลางวัน + แท่นดีดสูง 6 แท่น) ---------- */
function buildTestyard(){
  hemi.color.set(0xbfdcff); hemi.groundColor.set(0x7a8a6a); hemi.userData.base=1.0;
  moon.color.set(0xfff4dc); moon.userData.base=2.2; moon.position.set(70,120,45);
  skyDome([[0,'#2a78d0'],[0.35,'#68aee8'],[0.5,'#cfe6f6'],[0.56,'#dfe9ee'],[1,'#b9c9bd']]);
  sunSprite(200,210,110,0xfff4c8,150);
  const facade=(base,glass,lit)=>canvasTex(256,256,(g,w,h)=>{ g.fillStyle=base; g.fillRect(0,0,w,h);
    for(let r=0;r<4;r++) for(let c=0;c<4;c++){ g.fillStyle=lit&&Math.random()<0.25?'#ffe9a8':glass; g.fillRect(c*64+10,r*64+14,44,34); g.fillStyle='rgba(255,255,255,0.18)'; g.fillRect(c*64+10,r*64+14,44,6); }
    g.fillStyle='rgba(0,0,0,0.25)'; g.fillRect(0,252,w,4);
    for(let i=0;i<500;i++){ g.fillStyle=`rgba(0,0,0,${Math.random()*0.06})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } });
  const gridT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#8c9296'; g.fillRect(0,0,w,h);
    for(let i=0;i<3000;i++){ g.fillStyle=`rgba(${Math.random()<0.5?'255,255,255':'0,0,0'},${Math.random()*0.06})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); }
    g.strokeStyle='rgba(40,45,50,0.55)'; g.lineWidth=3; g.strokeRect(0,0,w,h); g.strokeStyle='rgba(40,45,50,0.25)'; g.lineWidth=1; g.beginPath(); g.moveTo(w/2,0); g.lineTo(w/2,h); g.moveTo(0,h/2); g.lineTo(w,h/2); g.stroke(); },38,38);
  const crateT=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#b98a4e'; g.fillRect(0,0,w,h); g.strokeStyle='#6d4a22'; g.lineWidth=8; g.strokeRect(4,4,w-8,h-8); g.beginPath(); g.moveTo(0,0); g.lineTo(w,h); g.moveTo(w,0); g.lineTo(0,h); g.stroke(); });
  const gl1=mkStd({map:facade('#5d6c7a','#9fd0ee',true),roughness:0.5,metalness:0.25,envMapIntensity:0.5});
  const gl2=mkStd({map:facade('#8a7767','#a8c8de',true),roughness:0.7,metalness:0.1,envMapIntensity:0.3});
  const gl3=mkStd({map:facade('#c4c8cc','#7ab0d4',false),roughness:0.6,metalness:0.15,envMapIntensity:0.4});
  const conc=mkStd({color:0x9a9fa3,roughness:0.95,metalness:0,envMapIntensity:0.1}), trim=mkStd({color:0x4a5056,roughness:0.9,metalness:0.1});
  const crate=mkStd({map:crateT,roughness:0.9,metalness:0}), steel=mkStd({color:0xd0d4d8,roughness:0.4,metalness:0.7,envMapIntensity:0.6});
  const orange=mkStd({color:0xe86a1a,roughness:0.7,metalness:0.1});
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(2*A+60,2*A+60),mkStd({map:gridT,roughness:1,metalness:0,envMapIntensity:0.1})); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; mapG.add(fl); worldMeshes.push(fl);
  const bx=(w,h,d,x,y,z,m,k=0.25)=>addBox(w,h,d,x,y,z,m,true,true,k), dec=(w,h,d,x,y,z,m)=>addBox(w,h,d,x,y,z,m,false,true);
  /* กำแพงรอบแมพสูงมาก กันบินออกนอก */
  [[0,-A-1,2*A+4,2],[0,A+1,2*A+4,2],[-A-1,0,2,2*A],[A+1,0,2,2*A]].forEach(([x,z,w,d])=>{ addBox(w,100,d,x,50,z,conc,true,false,0.1); });
  const tower=(x,z,w,d,h,m)=>{ bx(w,h,d,x,h/2,z,m); dec(w+0.6,0.5,d+0.6,x,h+0.25,z,trim);
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([a,b])=>bx(0.5,1,0.5,x+a*(w/2-0.3),h+1,z+b*(d/2-0.3),trim,0.5));   /* ขอบดาดฟ้า */
    const bc=new THREE.Mesh(XSPH,mkBasic({color:0xff3b30})); bc.scale.setScalar(0.5); bc.position.set(x,h+1.6,z); bc.userData.keep=true; mapG.add(bc);
    dec(2.4,1.6,2.4,x+w/4,h+1.1,z-d/4,steel); };
  tower(-30,-40,14,14,46,gl1);      /* ตึกสูงที่สุด */
  tower(35,-35,18,12,30,gl2); tower(-60,20,12,12,22,gl3); tower(0,-70,20,16,16,gl2);
  tower(55,30,10,10,38,gl1); tower(20,70,14,14,26,gl3); tower(-65,-30,16,16,12,gl2);
  tower(-20,40,24,14,10,gl3);
  /* ฐานต่างระดับ + ทางลาดบันได */
  bx(16,1.2,16,0,0.6,0,conc); bx(12,2.4,12,0,1.2,0,conc); bx(8,3.6,8,0,1.8,0,conc);
  for(let i=0;i<6;i++) bx(3,0.8*(i+1)/1.0*0.6,10,-14-i*3,0.4*(i+1)*0.6,-12,conc,0.5);
  /* ลังไม้/แบริเออร์/ตู้คอนเทนเนอร์กระจาย */
  const rng=mulberry32(9137), rr=(a,b)=>a+rng()*(b-a);
  for(let placed=0,tries=0;placed<46&&tries<900;tries++){
    const s=rr(1.4,2.6), x=rr(-A+6,A-6), z=rr(-A+6,A-6);
    if(Math.hypot(x,z)<14||!boxFree(x,z,s/2+0.3,s/2+0.3,2.5)) continue;
    bx(s,s,s,x,s/2,z,crate,0.4); if(rng()<0.35){ const s2=s*0.7; bx(s2,s2,s2,x+rr(-.2,.2),s+s2/2,z+rr(-.2,.2),crate,0.4); } placed++; }
  for(let placed=0,tries=0;placed<14&&tries<500;tries++){
    const w=rr(6,12), x=rr(-A+10,A-10), z=rr(-A+10,A-10), rot=rng()<0.5;
    const ww=rot?2.6:w, dd=rot?w:2.6;
    if(Math.hypot(x,z)<16||!boxFree(x,z,ww/2+0.3,dd/2+0.3,3.2)) continue;
    bx(ww,2.8,dd,x,1.4,z,orange,0.3); dec(ww+0.2,0.2,dd+0.2,x,2.9,z,trim); placed++; }
  for(let i=0;i<10;i++){ const x=rr(-A+8,A-8), z=rr(-A+8,A-8); if(Math.hypot(x,z)<12||!boxFree(x,z,1.2,3,1.2)) continue; bx(0.7,1.1,5,x,0.55,z,conc,0.4); }
  /* แท่นดีด 6 แท่น (ใกล้ตึกสูง ลอยอิสระได้) */
  const padG=new THREE.CylinderGeometry(2,2.2,0.3,24), padM=mkBasic({color:0x2affc8}), ringM=mkBasic({color:0xffffff,transparent:true,opacity:0.7,depthWrite:false});
  const pads=[[-10,-20],[28,-12],[-45,-4],[44,48],[-12,56],[10,-52]].map(([x,z])=>{
    const p=new THREE.Mesh(padG,padM); p.position.set(x,0.15,z); p.userData.keep=true; mapG.add(p);
    const r=new THREE.Mesh(new THREE.TorusGeometry(2.4,0.12,6,24),ringM); r.rotation.x=Math.PI/2; r.position.set(x,0.4,z); r.userData.keep=true; mapG.add(r);
    const b=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,14,6),mkBasic({color:0x2affc8,transparent:true,opacity:0.22,depthWrite:false})); b.position.set(x,7,z); b.userData.keep=true; mapG.add(b);
    return {x,z,r,b}; });
  let padCD=0;
  mapUpd=(dt,time)=>{
    padCD-=dt;
    for(let i=0;i<pads.length;i++){ const q=pads[i], s=1+0.12*Math.sin(time*4+i); q.r.scale.set(s,s,s); q.r.position.y=0.4+0.12*Math.abs(Math.sin(time*3+i));
      if(padCD<=0&&P.pos.y<1.6&&P.vel.y<=0.5&&Math.hypot(P.pos.x-q.x,P.pos.z-q.z)<2.3){ padCD=0.5; P.vel.y=58; P.onGround=false; airJumped=false; _tmpV.set(q.x,0.4,q.z); ringFX(_tmpV,0x2affc8,5,0.5); emit(_tmpV,26,0x2affc8,7,0.6,0.4); try{ sfx('djump'); }catch(e){} vib(20); } }
  };
}

/* ---------- แมพ 3: ASHFALL (เมืองพังวันสิ้นโลก สนธยา) ---------- */
function buildApoc(){
  hemi.color.set(0xff9a5a); hemi.groundColor.set(0x2a1a14); hemi.userData.base=0.6;
  moon.color.set(0xff7a3a); moon.userData.base=1.5; moon.position.set(-55,26,35);
  skyDome([[0,'#120a0a'],[0.3,'#3a1a12'],[0.46,'#b8461c'],[0.52,'#f08a3a'],[0.6,'#3a1a12'],[1,'#1a0e0a']]);
  sunSprite(-200,34,130,0xff8a40,170,0.8); sunSprite(-200,34,130,0xffd2a0,50,0.9);
  const asphT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#262322'; g.fillRect(0,0,w,h);
    for(let i=0;i<3000;i++){ g.fillStyle=`rgba(${Math.random()<.5?255:0},${Math.random()<.5?255:0},${Math.random()<.5?255:0},${Math.random()*0.06})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); }
    g.strokeStyle='rgba(0,0,0,0.6)'; g.lineWidth=2; for(let i=0;i<6;i++){ g.beginPath(); let x=Math.random()*w,y=Math.random()*h; g.moveTo(x,y); for(let k=0;k<6;k++){ x+=rand(-30,30); y+=rand(-30,30); g.lineTo(x,y);} g.stroke(); } },22,22);
  const concT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#6e6a64'; g.fillRect(0,0,w,h);
    for(let i=0;i<120;i++){ g.fillStyle=`rgba(${Math.random()<.5?20:140},${Math.random()<.5?20:130},${Math.random()<.5?20:120},${Math.random()*0.12})`; g.fillRect(Math.random()*w,Math.random()*h,Math.random()*40,Math.random()*20); }
    g.fillStyle='rgba(15,12,10,0.35)'; for(let i=0;i<14;i++) g.fillRect(Math.random()*w,0,rand(3,12),Math.random()*h*0.8);
    g.strokeStyle='rgba(30,28,26,0.5)'; g.lineWidth=2; for(let i=1;i<4;i++){ g.beginPath(); g.moveTo(0,i*64); g.lineTo(w,i*64); g.stroke(); } });
  const rustT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#5a3a26'; g.fillRect(0,0,w,h);
    for(let i=0;i<80;i++){ g.fillStyle=`rgba(${rand(90,170)|0},${rand(40,80)|0},20,${Math.random()*0.3})`; g.fillRect(Math.random()*w,Math.random()*h,rand(2,12),rand(10,60)); } });
  const asph=mkStd({map:asphT,roughness:0.95,metalness:0.05,envMapIntensity:0.1});
  const conc=mkStd({map:concT,roughness:0.95,metalness:0,envMapIntensity:0.12});
  const rust=mkStd({map:rustT,roughness:0.8,metalness:0.4,envMapIntensity:0.2});
  const burnt=mkStd({color:0x1c1512,roughness:0.9,metalness:0.2}), glassM=mkStd({color:0x050505,roughness:0.3,metalness:0.6});
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(130,130),asph); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; mapG.add(fl); worldMeshes.push(fl);
  const bx=(w,h,d,x,y,z,m,k=0.35)=>addBox(w,h,d,x,y,z,m,true,true,k), dec=(w,h,d,x,y,z,m)=>addBox(w,h,d,x,y,z,m,false,true);
  const rng=mulberry32(9001), rr=(a,b)=>a+rng()*(b-a);
  const stripe=mkBasic({color:0xb89a2a});
  for(let i=-8;i<=8;i++){ const p=new THREE.Mesh(new THREE.PlaneGeometry(2.2,0.25),stripe); p.rotation.x=-Math.PI/2; p.position.set(i*5,0.02,-0.6); mapG.add(p); }
  [[0,-A-0.6,2*A+2.4,1.2],[0,A+0.6,2*A+2.4,1.2],[-A-0.6,0,1.2,2*A],[A+0.6,0,1.2,2*A]].forEach(([x,z,w,d])=>{ bx(w,5,d,x,2.5,z,conc); });
  const ruin=(x,z,w,d)=>{ const h1=rr(5,9), h2=rr(3,7), h3=rr(2.5,6);
    bx(w,h1,0.9,x,h1/2,z-d/2,conc); bx(0.9,h2,d*0.7,x-w/2,h2/2,z-d*0.15,conc); bx(w*0.4,h3,0.9,x+w*0.3,h3/2,z+d/2,conc);
    for(let i=0;i<4;i++){ const s=rr(0.7,1.4); bx(s,s*0.8,s,x+rr(-w/3,w/3),s*0.4,z+rr(-d/4,d/4),conc,0.5); }
    const m=addBox(w*0.6,0.5,d*0.5,x,h1+0.9,z-d/2,conc,false,true,0.4); m.rotation.set(rr(-0.3,0.3),rr(0,3),rr(-0.35,0.35)); };
  ruin(-26,-24,12,10); ruin(26,-24,12,10); ruin(-28,22,12,10); ruin(28,24,12,10); ruin(0,-35,14,7); ruin(0,36,14,7);
  const car=(x,z,rot)=>{ const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rot?Math.PI/2:0; mapG.add(g);
    const body=new THREE.Mesh(new THREE.BoxGeometry(4.2,0.9,1.9),rust); body.position.y=0.75; body.castShadow=true; g.add(body);
    const cab=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.8,1.7),burnt); cab.position.set(-0.2,1.55,0); cab.castShadow=true; g.add(cab);
    const win=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.5,1.75),glassM); win.position.set(-0.2,1.55,0); g.add(win);
    [[-1.4,0.8],[1.4,0.8],[-1.4,-0.8],[1.4,-0.8]].forEach(([wx,wz])=>{ const w=new THREE.Mesh(XCYL,burnt); w.rotation.x=Math.PI/2; w.position.set(wx,0.35,wz); g.add(w); });
    const hw=rot?1.0:2.15, hd=rot?2.15:1.0; worldMeshes.push(body);
    colliders.push({minX:x-hw,maxX:x+hw,minZ:z-hd,maxZ:z+hd,minY:0,maxY:1.3}); };
  car(-14,10,0); car(10,-12,0); car(18,5,1); car(-6,16,1); car(-18,-8,1); car(6,22,0); car(14,-30,0);
  for(const [x,z,r] of [[-8,-4,0],[8,3,0],[-3,7,1],[3,-7,1],[-16,-14,0],[16,14,0],[0,-20,0],[0,20,0]]){ const w=r?0.7:3, d=r?3:0.7; bx(w,0.9,d,x,0.45,z,conc,0.5); }
  for(let placed=0,tries=0;placed<14&&tries<400;tries++){
    const x=rr(-A+3,A-3), z=rr(-A+3,A-3); if(Math.hypot(x,z)<7||!boxFree(x,z,1.2,1.2,1.2)) continue;
    for(let i=0;i<4;i++){ const s=rr(0.6,1.5); bx(s,s*0.7,s,x+rr(-1,1),s*0.35,z+rr(-1,1),conc,0.5); } placed++; }
  const fires=[], flameM=mkBasic({color:hdr(0xff7a1a,2.4),transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false});
  [[-9,-14],[11,-9],[-12,12],[13,16],[-3,-26],[4,28]].forEach(([x,z],i)=>{
    const b=new THREE.Mesh(XCYL,rust); b.scale.set(0.45,1.1,0.45); b.position.set(x,0.55,z); b.castShadow=true; mapG.add(b); worldMeshes.push(b); colliders.push({minX:x-0.45,maxX:x+0.45,minZ:z-0.45,maxZ:z+0.45,minY:0,maxY:1.1});
    const f=new THREE.Mesh(XCONE,flameM); f.scale.set(0.4,1.0,0.4); f.position.set(x,1.5,z); mapG.add(f);
    const l=addLight(new THREE.PointLight(0xff7a2a,1,16,2),30); l.position.set(x,2,z); fires.push({f,l}); });
  const smokeM=mkBasic({color:0x1a1210,transparent:true,opacity:0.28,depthWrite:false,side:THREE.DoubleSide});
  [[-26,-24],[26,-24],[-28,22],[28,24]].forEach(([x,z])=>{ const c=new THREE.Mesh(new THREE.CylinderGeometry(2.5,6,45,12,1,true),smokeM); c.position.set(x,22,z); mapG.add(c); });
  const skm=mkBasic({color:0x1c1210}), wnm=mkBasic({color:hdr(0xff8a3a,2)});
  for(let i=0;i<46;i++){ const ang=rand(0,Math.PI*2), r=rand(62,125), w=rand(7,16), h=rand(14,70), b=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),skm);
    b.position.set(Math.cos(ang)*r,h/2,Math.sin(ang)*r); b.rotation.z=rand(-0.05,0.05); mapG.add(b);
    if(Math.random()<0.5){ const wd=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.8,1.4),wnm); wd.position.set(b.position.x+(Math.random()<.5?-1:1)*w*0.3,h*rand(0.3,0.9),b.position.z+w/2); mapG.add(wd); } }
  const ash=dustPoints(380,0xd8c8b8,0.13,0.6,18,false);
  mapUpd=(dt,time)=>{ const p=ash.p; for(let i=0;i<ash.n;i++){ let y=p[i*3+1]-dt*(0.6+(i%5)*0.12); p[i*3]+=Math.sin(time*0.4+i)*dt*0.6+dt*0.8; if(y<0){ y=ash.top; p[i*3]=rand(-A,A); p[i*3+2]=rand(-A,A); } if(p[i*3]>A) p[i*3]=-A; p[i*3+1]=y; }
    ash.g.attributes.position.needsUpdate=true;
    fires.forEach((o,i)=>{ const fl=0.7+0.3*Math.sin(time*13+i*3)+Math.random()*0.12; o.l.intensity=o.l.userData.base*S.light*fl; o.f.scale.set(0.4*fl,0.8+fl*0.5,0.4*fl); }); };
}
/* ---------- แมพ 4: FROST STATION (สถานีวิจัยขั้วโลก กลางคืน ออโรร่า) · พื้นน้ำแข็งลื่น + พายุหิมะทุก ~60 วิ ---------- */
let iceZones=[], mapStart=null;
const onIce=(x,z)=>{ for(let i=0;i<iceZones.length;i++){ const q=iceZones[i]; if(x>q.x0&&x<q.x1&&z>q.z0&&z<q.z1) return true; } return false; };
const FROST_STORM={first:45,gap:60,dur:14,warn:5,fogMul:1.55};   // ปรับพายุ: เริ่มครั้งแรก/ทุกกี่วิ/นานกี่วิ/เตือนล่วงหน้า/ตัวคูณหมอก(1.55 = ทัศนวิสัยลด ~35%)
function buildFrost(){
  hemi.color.set(0x7fc4e0); hemi.groundColor.set(0x1a2a3c); hemi.userData.base=0.75;
  moon.color.set(0xcfe6ff); moon.userData.base=1.15; moon.position.set(-35,60,28);
  skyDome([[0,'#02050f'],[0.3,'#071530'],[0.46,'#0d3042'],[0.52,'#1d5a63'],[0.58,'#0b1a2a'],[1,'#05080f']]);
  sunSprite(-130,80,-170,0xcfe8ff,55,0.5);
  { const n=1600, p=new Float32Array(n*3); for(let i=0;i<n;i++){ const th=Math.random()*Math.PI*2, ph=Math.random()*Math.PI*0.48, R=330; p[i*3]=Math.cos(th)*Math.sin(ph)*R; p[i*3+1]=Math.cos(ph)*R; p[i*3+2]=Math.sin(th)*Math.sin(ph)*R; }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(p,3));
    const pm=new THREE.PointsMaterial({size:1.5,color:0xdde8ff,fog:false,sizeAttenuation:true}); mapRes.push(pm); mapG.add(new THREE.Points(g,pm)); }
  /* ออโรร่า: 3 แถบโปร่งแสงเรียงโค้ง ขยับด้วย vertex wave (CPU เล็กน้อย) + เลื่อน UV */
  const auT=canvasTex(512,128,(g,w,h)=>{ const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'rgba(120,255,190,0)'); gr.addColorStop(0.3,'rgba(110,255,170,0.75)'); gr.addColorStop(0.62,'rgba(150,110,255,0.55)'); gr.addColorStop(1,'rgba(180,80,255,0)'); g.fillStyle=gr; g.fillRect(0,0,w,h);
    for(let i=0;i<70;i++){ g.fillStyle=`rgba(255,255,255,${Math.random()*0.08})`; g.fillRect(Math.random()*w,0,rand(1,4),h); } });
  auT.wrapS=THREE.RepeatWrapping; auT.repeat.set(2,1);
  const auM=mkBasic({map:auT,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false,opacity:0.9});
  const aur=[]; [[0,88,-175,0,0],[-155,98,-70,Math.PI*0.32,1.7],[150,92,-40,-Math.PI*0.4,3.3]].forEach(([x,y,z,ry,ph])=>{
    const g=new THREE.PlaneGeometry(230,40,36,1), m=new THREE.Mesh(g,auM); m.position.set(x,y,z); m.rotation.y=ry; m.renderOrder=-5; mapG.add(m);
    aur.push({g,base:Float32Array.from(g.attributes.position.array),ph}); });
  /* เท็กซ์เจอร์ */
  const snowT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#d6e3ee'; g.fillRect(0,0,w,h);
    for(let i=0;i<40;i++){ g.fillStyle=`rgba(255,255,255,${Math.random()*0.18})`; g.beginPath(); g.ellipse(Math.random()*w,Math.random()*h,rand(10,40),rand(4,14),0,0,7); g.fill(); }
    for(let i=0;i<3500;i++){ g.fillStyle=Math.random()<0.5?`rgba(255,255,255,${Math.random()*0.35})`:`rgba(140,170,200,${Math.random()*0.18})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } },20,20);
  const iceT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='rgba(120,200,235,0.62)'; g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(255,255,255,0.55)'; g.lineWidth=1.5; for(let i=0;i<14;i++){ g.beginPath(); let x=Math.random()*w,y=Math.random()*h; g.moveTo(x,y); for(let k=0;k<5;k++){ x+=rand(-45,45); y+=rand(-45,45); g.lineTo(x,y); } g.stroke(); }
    for(let i=0;i<30;i++){ g.fillStyle=`rgba(255,255,255,${Math.random()*0.2})`; g.fillRect(Math.random()*w,Math.random()*h,rand(8,40),rand(2,6)); } },3,3);
  const panelT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#7b8fa3'; g.fillRect(0,0,w,h);
    for(let r=0;r<4;r++) for(let c=0;c<4;c++){ g.fillStyle=`rgba(${Math.random()<.5?255:0},${Math.random()<.5?255:0},255,${Math.random()*0.05})`; g.fillRect(c*64+2,r*64+2,60,60); }
    g.strokeStyle='rgba(30,45,60,0.55)'; g.lineWidth=2; for(let i=0;i<=4;i++){ g.beginPath(); g.moveTo(i*64,0); g.lineTo(i*64,h); g.moveTo(0,i*64); g.lineTo(w,i*64); g.stroke(); }
    g.fillStyle='rgba(20,30,40,0.5)'; for(let r=0;r<4;r++) for(let c=0;c<4;c++){ g.fillRect(c*64+6,r*64+6,3,3); g.fillRect(c*64+55,r*64+6,3,3); g.fillRect(c*64+6,r*64+55,3,3); g.fillRect(c*64+55,r*64+55,3,3); }
    for(let i=0;i<10;i++){ g.fillStyle=`rgba(230,240,250,${Math.random()*0.25})`; g.fillRect(Math.random()*w,0,rand(4,14),rand(8,40)); } });
  const snow=mkStd({map:snowT,roughness:0.92,metalness:0,envMapIntensity:0.2});
  const ice=mkStd({map:iceT,transparent:true,roughness:0.06,metalness:0.35,envMapIntensity:0.9,depthWrite:false});
  const wall=mkStd({map:panelT,roughness:0.75,metalness:0.25,envMapIntensity:0.3}), roof=mkStd({color:0xdce8f2,roughness:0.9,metalness:0});
  const dark=mkStd({color:0x1b2430,roughness:0.8,metalness:0.3}), orange=mkStd({color:0xd8602a,roughness:0.7,metalness:0.2});
  const block=mkStd({color:0xbfe4f5,roughness:0.15,metalness:0.2,transparent:true,opacity:0.92}), tankM=mkStd({color:0x8a9aa8,roughness:0.4,metalness:0.6});
  const crB=mkStd({color:0x4f6a86,roughness:0.7,metalness:0.2}), crO=mkStd({color:0xc4642a,roughness:0.7,metalness:0.2});
  const winM=mkBasic({color:hdr(0xffd890,1.8)}), cyanM=mkBasic({color:hdr(0x66e8ff,2)}), redM=mkBasic({color:hdr(0xff2a2a,3)});
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(130,130),snow); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; mapG.add(fl); worldMeshes.push(fl);
  const bx=(w,h,d,x,y,z,m,k=0.3)=>addBox(w,h,d,x,y,z,m,true,true,k), dec=(w,h,d,x,y,z,m)=>addBox(w,h,d,x,y,z,m,false,true);
  /* ลานน้ำแข็งลื่น (3 โซน) */
  iceZones=[]; [[0,12,14,10],[-22,-14,10,14],[24,-12,12,9]].forEach(([x,z,w,d])=>{
    const p=new THREE.Mesh(new THREE.PlaneGeometry(w,d),ice); p.rotation.x=-Math.PI/2; p.position.set(x,0.03,z); p.receiveShadow=true; p.renderOrder=1; mapG.add(p);
    dec(w+0.3,0.05,0.12,x,0.05,z-d/2,cyanM); dec(w+0.3,0.05,0.12,x,0.05,z+d/2,cyanM); dec(0.12,0.05,d+0.3,x-w/2,0.05,z,cyanM); dec(0.12,0.05,d+0.3,x+w/2,0.05,z,cyanM);
    iceZones.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2}); });
  /* กำแพงสันน้ำแข็งรอบสนาม */
  [[0,-A-1,2*A+4,2.4],[0,A+1,2*A+4,2.4],[-A-1,0,2.4,2*A],[A+1,0,2.4,2*A]].forEach(([x,z,w,d])=>{ bx(w,4,d,x,2,z,block,0.3); dec(w===2.4?0.1:w,0.08,d===2.4?0.1:d,x-(w===2.4?Math.sign(x)*1.22:0),3.9,z-(d===2.4?Math.sign(z)*1.22:0),cyanM); });
  const bld=(x,z,w,d,h,strips)=>{ bx(w,h,d,x,h/2,z,wall); dec(w+0.3,0.3,d+0.3,x,h+0.15,z,roof);
    [1,-1].forEach(sg=>{ for(let i=0;i<strips;i++){ const ox=(i-(strips-1)/2)*(w/strips*0.9); dec(w/strips*0.55,0.55,0.05,x+ox,h*0.62,z+sg*(d/2+0.03),winM); } dec(1.5,2.3,0.06,x+w*0.3,1.15,z+sg*(d/2+0.03),dark); }); };
  /* หอสังเกตการณ์ (ข้างจุดเกิด) */
  bx(6,5,6,-10,2.5,-10,wall); dec(6.3,0.3,6.3,-10,5.15,-10,roof);
  { const dm=new THREE.Mesh(new THREE.SphereGeometry(3.1,18,10,0,Math.PI*2,0,Math.PI/2),roof); dm.position.set(-10,5.3,-10); dm.castShadow=true; mapG.add(dm);
    dec(0.5,2.6,0.12,-10,6.4,-6.9,cyanM); dec(1.6,2.3,0.06,-8.5,1.15,-6.97,dark); dec(2.6,0.55,0.05,-10,3.2,-6.97,winM); }
  bld(-11,-31,17,9,6,4); bld(11,-31,17,9,6,4); dec(5.2,1.2,9,0,5.4,-31,wall);      /* อาคารหลัก (เว้นช่องกลาง 5 ม.) */
  bld(31,4,9,17,5,3); bld(-32,12,8,13,5,3); bld(-31,-19,7,7,4.5,2);
  /* ถังเชื้อเพลิง 2 ถัง */
  [26,32].forEach(z=>{ const t=new THREE.Mesh(XCYL,tankM); t.scale.set(1.6,7,1.6); t.rotation.z=Math.PI/2; t.position.set(16,1.8,z); t.castShadow=true; mapG.add(t);
    colliders.push({minX:12.5,maxX:19.5,minZ:z-1.6,maxZ:z+1.6,minY:0,maxY:3.4}); worldMeshes.push(t);
    dec(0.4,1.2,3.2,13.5,0.6,z,dark); dec(0.4,1.2,3.2,18.5,0.6,z,dark); dec(0.6,0.12,3.3,16,3.5,z,orange); });
  /* ปล่องความร้อน (ไอพ่น) */
  const steamM=mkBasic({color:0xcfe4f0,transparent:true,opacity:0.22,depthWrite:false}), vents=[];
  [[21,-4],[-22,20],[14,14],[-3,-22]].forEach(([x,z],i)=>{ bx(1.8,2.4,1.8,x,1.2,z,orange); dec(1.4,0.1,1.4,x,2.46,z,mkBasic({color:hdr(0xff8a3a,2.4)}));
    const s=new THREE.Mesh(XCYL,steamM); s.scale.set(0.6,5,0.6); s.position.set(x,5,z); mapG.add(s); vents.push({s,x,z,ph:i*1.7});
    if(i<2){ const l=addLight(new THREE.PointLight(0xff8a3a,1,13,2),22); l.position.set(x,3,z); vents[i].l=l; } });
  /* เสาอากาศ (ไฟแดงกะพริบ) */
  const masts=[]; [[-24,-4],[24,-9],[-2,36]].forEach(([x,z],i)=>{ bx(1.4,1,1.4,x,0.5,z,dark); const p=new THREE.Mesh(XCYL,dark); p.scale.set(0.12,17,0.12); p.position.set(x,9,z); p.castShadow=true; mapG.add(p);
    dec(3.2,0.12,0.12,x,13,z,dark); dec(0.12,0.12,2.4,x,15,z,dark); const r=new THREE.Mesh(XSPH,redM); r.scale.setScalar(0.25); r.position.set(x,17.6,z); mapG.add(r); masts.push({r,ph:i*0.9}); });
  /* บล็อกน้ำแข็งเตี้ยๆ เป็นที่กำบัง + กองลังทีม (ช่องว่างระหว่างสิ่งกีดขวางอย่างน้อย ~2.2 ม.) */
  [[10,-8,5,1.3,1],[-14,6,1,1.3,5],[8,19,1,1.3,5]].forEach(([x,z,w,h,d])=>{ bx(w,h,d,x,h/2,z,block,0.4); dec(w+0.02,0.06,d+0.02,x,h+0.01,z,cyanM); });
  const rng=mulberry32(7777), rr=(a,b)=>a+rng()*(b-a);
  for(let placed=0,tries=0;placed<18&&tries<700;tries++){
    const s=rr(1.3,2.2), x=rr(-A+4,A-4), z=rr(-A+4,A-4);
    if((Math.abs(x+3)<9&&Math.abs(z-3)<9)||!boxFree(x,z,s/2,s/2,1.2)) continue;
    const m=rng()<0.5?crB:crO; bx(s,s,s,x,s/2,z,m,0.5); if(rng()<0.3){ const s2=s*rr(0.55,0.8); bx(s2,s2,s2,x+rr(-.2,.2),s+s2/2,z+rr(-.2,.2),m,0.5); } placed++; }
  /* ภูเขาไกลๆ */
  { const mm=mkBasic({color:0x16263a}), mt=mkBasic({color:0x9ab8d0});
    for(let i=0;i<26;i++){ const ang=i/26*Math.PI*2+rand(-0.1,0.1), r=rand(125,190), R=rand(26,48), H=rand(28,62);
      const c=new THREE.Mesh(XCONE,mm); c.scale.set(R,H,R); c.position.set(Math.cos(ang)*r,H/2-2,Math.sin(ang)*r); mapG.add(c);
      const t=new THREE.Mesh(XCONE,mt); t.scale.set(R*0.36,H*0.36,R*0.36); t.position.set(c.position.x,H*0.82-2,c.position.z); mapG.add(t); } }
  /* หิมะตก: จุดวนรอบกล้อง ลมเฉียง · ตั้งค่า "ฝน" ใช้เปิด/ปิดหิมะ */
  const SN=1100, sx=new Float32Array(SN*3), ssp=new Float32Array(SN);
  for(let i=0;i<SN;i++){ sx.set([rand(-30,30),rand(0,24),rand(-30,30)],i*3); ssp[i]=rand(0.6,1.4); }
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(sx,3));
  const sm=new THREE.PointsMaterial({size:0.13,map:dotTex,color:0xffffff,transparent:true,opacity:0.85,depthWrite:false}); mapRes.push(sm);
  const snowP=new THREE.Points(sg,sm); snowP.frustumCulled=false; mapG.add(snowP);
  /* จุดอุ่นเรืองแสงหน้าต่าง (point light ทั้งแมพ 4 ดวง) */
  addLight(new THREE.PointLight(0xffd890,1,26,2),26).position.set(0,3.5,-24);
  addLight(new THREE.PointLight(0x66e8ff,1,14,2),9).position.set(-10,4,-3);
  /* พายุหิมะ */
  const st={t:FROST_STORM.first,phase:0,left:0,warned:false,k:0,hint:false};
  mapStart=()=>{ st.t=FROST_STORM.first; st.phase=0; st.left=0; st.warned=false; st.k=0; st.hint=false; };
  mapUpd=(dt,time)=>{
    const play=state==='play';
    if(play){ st.t-=dt;
      if(st.phase===0){ if(!st.warned&&st.t<=FROST_STORM.warn){ st.warned=true; banner('❄ พายุหิมะกำลังมา!','ทัศนวิสัยจะลดลงชั่วคราว',2600); }
        if(st.t<=0){ st.phase=1; st.left=FROST_STORM.dur; } }
      else { st.left-=dt; if(st.left<=0){ st.phase=0; st.t=FROST_STORM.gap-FROST_STORM.dur; st.warned=false; banner('พายุสงบลงแล้ว','',1800); } }
      if(!st.hint&&P.onGround&&onIce(P.pos.x,P.pos.z)){ st.hint=true; banner('พื้นน้ำแข็ง ลื่น!','เบรกยากกว่าปกติ',1800); } }
    st.k+=((st.phase===1?1:0)-st.k)*(1-Math.exp(-1.2*dt));
    scene.fog.density=MAPS.frost.fog*S.fog*(1+(FROST_STORM.fogMul-1)*st.k);
    snowP.visible=S.rain; sm.size=0.13+0.1*st.k; sm.opacity=0.85+0.1*st.k;
    if(S.rain){ const cx=camera.position.x, cz=camera.position.z, wind=1.2+6*st.k, fall=2.6+2.4*st.k;
      for(let i=0;i<SN;i++){ const o=i*3; let x=sx[o]+dt*(wind*ssp[i]+Math.sin(time*0.8+i)*0.4), y=sx[o+1]-dt*fall*ssp[i], z=sx[o+2]+Math.cos(time*0.6+i)*dt*0.3;
        if(y<0||Math.abs(x-cx)>32||Math.abs(z-cz)>32){ y=rand(12,24); x=cx+rand(-30,30); z=cz+rand(-30,30); }
        sx[o]=x; sx[o+1]=y; sx[o+2]=z; }
      sg.attributes.position.needsUpdate=true; }
    for(const a of aur){ const p=a.g.attributes.position.array, b=a.base; for(let i=0;i<p.length;i+=3){ const u=b[i]; p[i+1]=b[i+1]+Math.sin(time*0.35+u*0.03+a.ph)*4+(b[i+1]>0?Math.sin(time*0.6+u*0.05)*2.5:0); p[i+2]=b[i+2]+Math.sin(time*0.25+u*0.02+a.ph*2)*9; } a.g.attributes.position.needsUpdate=true; }
    auT.offset.x=(auT.offset.x+dt*0.006)%1; auM.opacity=0.8+0.15*Math.sin(time*0.5);
    for(const v of vents){ const f=0.8+0.25*Math.sin(time*1.6+v.ph); v.s.scale.set(0.55*f,4.6+f,0.55*f); if(v.l) v.l.intensity=v.l.userData.base*S.light*(0.85+0.15*Math.sin(time*7+v.ph)); }
    steamM.opacity=0.2+0.06*Math.sin(time*1.1);
    for(const m of masts) m.r.visible=((time*0.9+m.ph)%1.6)<0.35;
  };
}
/* ---------- แมพ 5: JUNGLE RUINS (ซากวิหารในป่า เช้าตรู่ หมอกเขียวทอง) · ที่ราบสูงกลางแท่นบูชา 2 ชั้นสำหรับสไนเปอร์ ---------- */
function buildJungle(){
  hemi.color.set(0xdff2c8); hemi.groundColor.set(0x3a5a2a); hemi.userData.base=0.9;
  moon.color.set(0xffe2a0); moon.userData.base=2.1; moon.position.set(55,38,-35);
  skyDome([[0,'#8fc4e0'],[0.3,'#cfe8c0'],[0.46,'#f2e8a0'],[0.52,'#d8e0a0'],[0.58,'#6a9a50'],[1,'#2a4a24']]);
  sunSprite(190,95,-120,0xffeeb0,150,0.85); sunSprite(190,95,-120,0xffffff,48,0.9);
  const shade=(c,v)=>`rgb(${Math.max(0,Math.min(255,c[0]+v))|0},${Math.max(0,Math.min(255,c[1]+v))|0},${Math.max(0,Math.min(255,c[2]+v))|0})`;
  const mossT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#4a5444'; g.fillRect(0,0,w,h);
    for(let r=0;r<6;r++) for(let c=-1;c<4;c++){ const x=c*86+(r%2?43:0), v=Math.random()*22-11; g.fillStyle=shade([112,124,106],v); g.fillRect(x+2,r*43+2,82,39); }
    for(let i=0;i<70;i++){ const y=h*(0.45+Math.random()*0.55); g.fillStyle=`rgba(${60+Math.random()*30|0},${120+Math.random()*40|0},40,${0.18+Math.random()*0.3})`; g.beginPath(); g.ellipse(Math.random()*w,y,rand(6,28),rand(3,10),0,0,7); g.fill(); }
    for(let i=0;i<500;i++){ g.fillStyle=`rgba(30,40,20,${Math.random()*0.12})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } });
  const carvT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#6a7462'; g.fillRect(0,0,w,h); g.strokeStyle='rgba(30,44,30,0.75)'; g.lineWidth=3;
    for(let r=0;r<4;r++) for(let c=0;c<4;c++){ const x=c*64+32, y=r*64+32, t=(r*4+c)%4; g.strokeRect(c*64+4,r*64+4,56,56); g.beginPath();
      if(t===0){ for(let a=0;a<14;a+=0.3){ g.lineTo(x+Math.cos(a)*a*1.8,y+Math.sin(a)*a*1.8); } } else if(t===1){ g.moveTo(x-20,y-12); g.lineTo(x-8,y+12); g.lineTo(x+4,y-12); g.lineTo(x+16,y+12); g.lineTo(x+22,y-8); }
      else if(t===2){ g.arc(x,y,16,0,7); g.moveTo(x-8,y); g.lineTo(x+8,y); } else { g.moveTo(x,y-20); g.lineTo(x+18,y+14); g.lineTo(x-18,y+14); g.closePath(); } g.stroke(); }
    for(let i=0;i<40;i++){ g.fillStyle=`rgba(80,130,50,${Math.random()*0.3})`; g.beginPath(); g.ellipse(Math.random()*w,h*(0.5+Math.random()*0.5),rand(5,20),rand(3,8),0,0,7); g.fill(); } });
  const mudT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#5a4a2a'; g.fillRect(0,0,w,h);
    for(let i=0;i<60;i++){ g.fillStyle=`rgba(${60+Math.random()*30|0},${110+Math.random()*50|0},40,${0.2+Math.random()*0.3})`; g.beginPath(); g.ellipse(Math.random()*w,Math.random()*h,rand(12,40),rand(6,18),Math.random()*3,0,7); g.fill(); }
    for(let i=0;i<260;i++){ g.fillStyle=['rgba(140,100,30,0.45)','rgba(60,110,30,0.5)','rgba(90,60,20,0.4)'][i%3]; g.save(); g.translate(Math.random()*w,Math.random()*h); g.rotate(Math.random()*6); g.fillRect(0,0,rand(3,8),rand(1.5,3)); g.restore(); }
    for(let i=0;i<2500;i++){ g.fillStyle=`rgba(30,22,10,${Math.random()*0.12})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } },22,22);
  const moss=mkStd({map:mossT,roughness:0.95,metalness:0,envMapIntensity:0.12}), carv=mkStd({map:carvT,roughness:0.9,metalness:0,envMapIntensity:0.12});
  const mud=mkStd({map:mudT,roughness:1,metalness:0,envMapIntensity:0.08}), bark=mkStd({color:0x4a3626,roughness:1,metalness:0}), leafM=mkStd({color:0xffffff,roughness:1,metalness:0});
  const vineM=mkStd({color:0x2a6a24,roughness:1,metalness:0}), goldM=mkBasic({color:hdr(0xffd36a,1.8)}), glowM=mkBasic({color:hdr(0x9affc0,2.2)});
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(140,140),mud); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; mapG.add(fl); worldMeshes.push(fl);
  const bx=(w,h,d,x,y,z,m,k=0.3)=>addBox(w,h,d,x,y,z,m,true,true,k), dec=(w,h,d,x,y,z,m)=>addBox(w,h,d,x,y,z,m,false,true);
  const rng=mulberry32(5150), rr=(a,b)=>a+rng()*(b-a);
  /* กำแพงหินตะไคร่รอบสนาม + เถาวัลย์ */
  [[0,-A-0.6,2*A+2.4,1.2],[0,A+0.6,2*A+2.4,1.2],[-A-0.6,0,1.2,2*A],[A+0.6,0,1.2,2*A]].forEach(([x,z,w,d])=>bx(w,5,d,x,2.5,z,moss,0.35));
  for(let i=0;i<46;i++){ const side=i%4, t=rr(-A+2,A-2), h=rr(1.8,4.2); const x=side===0?t:side===1?t:side===2?-A+0.1:A-0.1, z=side===0?-A+0.1:side===1?A-0.1:t; dec(0.14,h,0.14,x,4.9-h/2,z,vineM); }
  /* ที่ราบสูงกลาง: ขั้น 2 ชั้น + บันไดทุกด้าน (ขั้นละ 0.3 ม. เดินขึ้นเองได้) + แท่นบูชา */
  bx(20,0.9,20,0,0.45,0,carv,0.3); bx(10,0.9,10,0,1.35,0,carv,0.3);
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(([sx,sz])=>{ const hz=sx!==0;
    [[0.3,11.5],[0.6,10.5]].forEach(([h,off])=>{ bx(hz?1:7,h,hz?7:1,sx*off,h/2,sz*off,carv,0.3); });
    [[0.3,6.5],[0.6,5.5]].forEach(([h,off])=>{ bx(hz?1:5,h,hz?5:1,sx*off,0.9+h/2,sz*off,carv,0.3); }); });
  bx(3,1.3,3,0,2.45,0,carv,0.4); dec(2.2,0.1,2.2,0,3.14,0,glowM); dec(10.1,0.08,0.18,0,1.82,-5.04,goldM); dec(10.1,0.08,0.18,0,1.82,5.04,goldM); dec(0.18,0.08,10.1,-5.04,1.82,0,goldM); dec(0.18,0.08,10.1,5.04,1.82,0,goldM);
  addLight(new THREE.PointLight(0x9affc0,1,22,2),30).position.set(0,4.4,0);
  /* เสาวิหารรอบแท่น (บางต้นหัก) */
  const pill=(x,z,h)=>{ bx(1.6,h,1.6,x,h/2,z,carv,0.4); dec(2.0,0.35,2.0,x,0.18,z,moss); if(h>4){ dec(2.1,0.4,2.1,x,h+0.2,z,moss); } else { dec(1.2,0.5,1.0,x+rr(-.4,.4),h+0.25,z+rr(-.4,.4),moss); dec(0.9,0.5,0.9,x+2.1,0.25,z+rr(-1,1),moss); } };
  [[-17,-17,7],[17,-17,5],[-17,17,3.2],[17,17,7],[0,-19,6],[0,19,3.6],[-19,0,7],[19,0,4.2]].forEach(([x,z,h])=>pill(x,z,h));
  /* กำแพงซากวิหาร + รูปปั้นหิน */
  [[-28,-12,8,2.6,1.2],[28,12,8,2.6,1.2],[-12,29,1.2,2.6,8],[12,-29,1.2,2.6,8],[31,-19,1.2,2.6,6],[-31,19,1.2,2.6,6]].forEach(([x,z,w,h,d])=>{ bx(w,h,d,x,h/2,z,moss,0.4); dec(w*0.5,0.5,d===1.2?d*1.1:d*0.5,x+rr(-.5,.5),h+0.25,z+rr(-.5,.5),moss); });
  [[-27,-27],[27,-27],[-27,27],[27,27]].forEach(([x,z])=>{ bx(2.4,5.6,2.4,x,2.8,z,moss,0.4); dec(2.8,0.3,2.8,x,0.15,z,carv);
    const body=new THREE.Mesh(XCYL,carv); body.scale.set(0.8,3.2,0.8); body.position.set(x,3.0,z); body.castShadow=true; mapG.add(body);
    const head=new THREE.Mesh(XSPH,carv); head.scale.set(0.75,0.85,0.75); head.position.set(x,5.1,z); head.castShadow=true; mapG.add(head);
    dec(2.2,0.4,0.5,x,4.2,z+0.6,carv); dec(0.5,0.4,0.5,x-0.9,5.2,z+0.5,glowM); dec(0.5,0.4,0.5,x+0.9,5.2,z+0.5,glowM); });
  /* ต้นไม้ใหญ่: ลำต้นจริง (ชนได้) + พุ่มใบเป็น InstancedMesh (ใช้ geometry ร่วม) */
  const trunkG=new THREE.CylinderGeometry(0.55,0.85,1,8); trunkG.translate(0,0.5,0);
  const solid=[], back=[];
  for(let placed=0,tries=0;placed<22&&tries<900;tries++){
    const x=rr(-A+4,A-4), z=rr(-A+4,A-4);
    if(Math.hypot(x,z)<23||Math.hypot(x,z-22)<8||!boxFree(x,z,0.8,0.8,1.5)) continue;
    const h=rr(7,11); solid.push({x,z,h,r:rr(0.9,1.2)}); const tm=new THREE.Mesh(trunkG,bark); tm.scale.set(solid[placed].r,h,solid[placed].r); tm.position.set(x,0,z); tm.castShadow=true; mapG.add(tm); worldMeshes.push(tm);
    colliders.push({minX:x-0.8,maxX:x+0.8,minZ:z-0.8,maxZ:z+0.8,minY:0,maxY:h}); placed++; }
  for(let i=0;i<70;i++){ const ang=rr(0,Math.PI*2), r=rr(A+4,A+34); back.push({x:Math.cos(ang)*r,z:Math.sin(ang)*r,h:rr(10,17),r:rr(1.2,1.8)}); }
  const all=solid.concat(back), canIM=new THREE.InstancedMesh(XSPH,leafM,all.length*3), bkIM=new THREE.InstancedMesh(trunkG,bark,back.length);
  canIM.frustumCulled=false; bkIM.frustumCulled=false; const m4=new THREE.Matrix4(), q4=new THREE.Quaternion(), sc3=new THREE.Vector3(), p3=new THREE.Vector3(), cc=new THREE.Color(), greens=[0x2f7a2a,0x3e8f34,0x4a9a3a,0x2a6a30,0x5aa83e];
  all.forEach((t,i)=>{ for(let k=0;k<3;k++){ const R=rr(3,4.6), a=k*2.1+i; p3.set(t.x+Math.cos(a)*(k?2.2:0),t.h+rr(0,1.2)+(k?-0.8:0.6),t.z+Math.sin(a)*(k?2.2:0)); sc3.set(R,R*0.72,R); m4.compose(p3,q4,sc3); canIM.setMatrixAt(i*3+k,m4); canIM.setColorAt(i*3+k,cc.setHex(greens[(i*3+k)%greens.length])); } });
  back.forEach((t,i)=>{ p3.set(t.x,0,t.z); sc3.set(t.r,t.h,t.r); m4.compose(p3,q4,sc3); bkIM.setMatrixAt(i,m4); });
  mapG.add(canIM); mapG.add(bkIM); mapRes.push({dispose:()=>{ canIM.dispose(); bkIM.dispose(); }});
  /* ลำแสงอาทิตย์ลอดใบไม้ + หิ่งห้อย + ละอองเกสร */
  const shM=mkBasic({color:hdr(0xffe9a0,1),transparent:true,opacity:0.05,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}), shafts=[];
  [[-8,-6],[10,9],[-19,15],[21,-13],[-9,31],[-24,-4]].forEach(([x,z],i)=>{ const c=new THREE.Mesh(new THREE.CylinderGeometry(0.6,3.4,30,12,1,true),shM); c.position.set(x,14,z); c.rotation.z=0.28; c.rotation.y=i*1.1; mapG.add(c); shafts.push(c); });
  const FF=130, ffP=new Float32Array(FF*3); for(let i=0;i<FF;i++) ffP.set([rand(-A,A),rand(0.4,4.5),rand(-A,A)],i*3);
  const ffG=new THREE.BufferGeometry(); ffG.setAttribute('position',new THREE.BufferAttribute(ffP,3));
  const ffM=new THREE.PointsMaterial({size:0.26,map:dotTex,color:hdr(0xd8ff80,2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}); mapRes.push(ffM); const ff=new THREE.Points(ffG,ffM); ff.frustumCulled=false; mapG.add(ff);
  const pol=dustPoints(150,0xfff0c0,0.13,0.5,9,true);
  /* กระถางไฟบนชั้นแรก */
  const flameM=mkBasic({color:hdr(0xffb04a,2.2),transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false}), braz=[];
  [[-8,-8],[8,8]].forEach(([x,z])=>{ const b=new THREE.Mesh(XCYL,carv); b.scale.set(0.5,0.7,0.5); b.position.set(x,1.25,z); mapG.add(b); const f=new THREE.Mesh(XCONE,flameM); f.scale.set(0.35,0.9,0.35); f.position.set(x,2,z); mapG.add(f);
    const l=addLight(new THREE.PointLight(0xffa04a,1,15,2),22); l.position.set(x,2.5,z); braz.push({f,l}); });
  /* ภูเขาเขียวไกลๆ */
  { const mm=mkBasic({color:0x3a6a3a}); for(let i=0;i<18;i++){ const ang=i/18*Math.PI*2+rand(-0.1,0.1), r=rand(150,215), R=rand(34,60), H=rand(20,46); const c=new THREE.Mesh(XSPH,mm); c.scale.set(R,H,R); c.position.set(Math.cos(ang)*r,-4,Math.sin(ang)*r); mapG.add(c); } }
  mapUpd=(dt,time)=>{
    shM.opacity=0.05+0.02*Math.sin(time*0.5);
    for(let i=0;i<shafts.length;i++) shafts[i].rotation.y+=dt*0.015;
    for(let i=0;i<FF;i++){ const o=i*3; ffP[o]+=Math.sin(time*0.7+i*1.3)*dt*0.5; ffP[o+1]+=Math.cos(time*0.9+i*0.7)*dt*0.3; ffP[o+2]+=Math.sin(time*0.6+i*2.1)*dt*0.5; if(ffP[o+1]<0.3) ffP[o+1]=0.3; if(ffP[o+1]>5) ffP[o+1]=5; }
    ffG.attributes.position.needsUpdate=true; ffM.opacity=0.7+0.3*Math.sin(time*2.2);
    const p=pol.p; for(let i=0;i<pol.n;i++){ p[i*3]+=dt*(0.25+Math.sin(i)*0.1); p[i*3+1]+=Math.sin(time*0.4+i)*dt*0.12; if(p[i*3]>A) p[i*3]=-A; } pol.g.attributes.position.needsUpdate=true;
    braz.forEach((o,i)=>{ const f=0.75+0.25*Math.sin(time*11+i*4)+Math.random()*0.1; o.l.intensity=o.l.userData.base*S.light*f; o.f.scale.set(0.35*f,0.7+f*0.4,0.35*f); });
  };
}
/* ---------- แมพ 6: ORBITAL STATION (โถงสถานีอวกาศ หน้าต่างบานใหญ่มองโลกหมุน) · แรงโน้มถ่วงต่ำ GRAV=14 ---------- */
function buildOrbital(){
  hemi.color.set(0x9ab8ff); hemi.groundColor.set(0x1c2a40); hemi.userData.base=0.65;
  moon.color.set(0xd8e8ff); moon.userData.base=1.3; moon.position.set(30,70,-45);
  const WALL=14;
  /* ---------- textures (canvas) ---------- */
  const panelT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#8d9bb0'; g.fillRect(0,0,w,h);
    for(let r=0;r<2;r++) for(let c=0;c<2;c++){ const v=(Math.random()*16-8)|0; g.fillStyle=`rgb(${150+v},${164+v},${184+v})`; g.fillRect(c*128+3,r*128+3,122,122);
      g.fillStyle='rgba(30,40,60,0.55)'; for(const [px,py] of [[10,10],[112,10],[10,112],[112,112]]){ g.beginPath(); g.arc(c*128+px+3,r*128+py+3,3,0,7); g.fill(); } }
    g.strokeStyle='rgba(20,30,48,0.6)'; g.lineWidth=3; g.strokeRect(1,1,254,254); g.beginPath(); g.moveTo(128,0); g.lineTo(128,256); g.moveTo(0,128); g.lineTo(256,128); g.stroke();
    g.fillStyle='rgba(80,200,255,0.55)'; g.fillRect(20,60,40,4); g.fillStyle='rgba(255,150,50,0.6)'; g.fillRect(150,190,50,4);
    for(let i=0;i<500;i++){ g.fillStyle=`rgba(0,0,0,${Math.random()*0.08})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } });
  const floorT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#1c2330'; g.fillRect(0,0,w,h);
    for(let y=0;y<8;y++) for(let x=0;x<8;x++){ g.fillStyle='#0a0e16'; g.fillRect(x*32+6,y*32+6,20,20); g.fillStyle='rgba(140,170,210,0.2)'; g.fillRect(x*32+4,y*32+4,24,2); }
    g.strokeStyle='rgba(90,200,255,0.5)'; g.lineWidth=2; g.strokeRect(0,0,256,256);
    g.fillStyle='rgba(255,170,60,0.55)'; g.fillRect(0,126,256,4); },18,18);
  const hazT=canvasTex(128,32,(g,w,h)=>{ g.fillStyle='#e9b81a'; g.fillRect(0,0,w,h); g.fillStyle='#1a1a1a'; for(let i=-2;i<10;i++){ g.beginPath(); g.moveTo(i*16,0); g.lineTo(i*16+8,0); g.lineTo(i*16+8-h,h); g.lineTo(i*16-h,h); g.fill(); } },6,1);
  const crateT=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#b8651f'; g.fillRect(0,0,w,h); g.strokeStyle='#5a2e0a'; g.lineWidth=6; g.strokeRect(4,4,120,120);
    g.lineWidth=4; g.beginPath(); g.moveTo(4,4); g.lineTo(124,124); g.moveTo(124,4); g.lineTo(4,124); g.stroke(); g.fillStyle='rgba(255,230,160,0.8)'; g.fillRect(46,54,36,20); g.fillStyle='#5a2e0a'; g.fillRect(52,60,24,3); });
  const earthT=canvasTex(512,256,(g,w,h)=>{ const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#2c6cc0'); gr.addColorStop(0.5,'#1f56a8'); gr.addColorStop(1,'#2c6cc0'); g.fillStyle=gr; g.fillRect(0,0,w,h);
    const blob=(x,y,r,c)=>{ g.fillStyle=c; for(let i=0;i<9;i++){ g.beginPath(); g.ellipse(x+rand(-r,r),y+rand(-r*0.55,r*0.55),rand(r*0.25,r*0.6),rand(r*0.15,r*0.35),rand(0,3),0,7); g.fill(); } };
    blob(110,90,60,'#3f8a46'); blob(330,80,70,'#4f9a4a'); blob(390,160,45,'#b9a45a'); blob(190,180,50,'#3a8a52'); blob(255,40,25,'#e8f0f6'); blob(60,225,40,'#e8f0f6');
    g.fillStyle='rgba(255,255,255,0.5)'; for(let i=0;i<60;i++){ g.beginPath(); g.ellipse(Math.random()*w,Math.random()*h,rand(14,44),rand(3,9),rand(-0.3,0.3),0,7); g.fill(); } },1,1);
  earthT.wrapS=THREE.RepeatWrapping;
  const panel=mkStd({map:panelT,roughness:0.5,metalness:0.55,envMapIntensity:0.5}), floorM=mkStd({map:floorT,roughness:0.35,metalness:0.7,envMapIntensity:0.45});
  const haz=mkStd({map:hazT,roughness:0.7,metalness:0.2}), crate=mkStd({map:crateT,roughness:0.65,metalness:0.4,envMapIntensity:0.3});
  const dark=mkStd({color:0x2a3446,roughness:0.5,metalness:0.7}), pipeM=mkStd({color:0x9aa8bc,roughness:0.35,metalness:0.8,envMapIntensity:0.6});
  const glass=mkStd({color:0x8cc4ff,transparent:true,opacity:0.1,roughness:0.05,metalness:0.2,depthWrite:false});
  const cyanM=mkBasic({color:hdr(0x3fc8ff,1.35)}), orgM=mkBasic({color:hdr(0xff8a2a,1.35)}), stripM=mkBasic({color:hdr(0xd8ecff,1.2)});
  const warnM=mkBasic({color:0x550808}), warnOn=hdr(0xff3030,3), warnOff=new THREE.Color(0x550808);
  const bx=(w,h,d,x,y,z,m,k=0.25)=>addBox(w,h,d,x,y,z,m,true,true,k), dec=(w,h,d,x,y,z,m,sh=true)=>addBox(w,h,d,x,y,z,m,false,sh,0);
  const rng=mulberry32(6060), rr=(a,b)=>a+rng()*(b-a);
  /* ---------- พื้น + เพดาน ---------- */
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(2*A+4,2*A+4),floorM); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; mapG.add(fl); worldMeshes.push(fl);
  dec(2*A,0.5,2*A,0,WALL+0.25,0,panel,false);
  [-24,-8,8,24].forEach(x=>{ dec(1.2,0.12,2*A-6,x,WALL-0.05,0,stripM,false); });
  [-20,20].forEach(z=>{ dec(2*A-6,0.12,0.5,0,WALL-0.05,z,orgM,false); });
  /* ---------- ผนังรอบ: แถบล่างทึบ + เสากรอบ + กระจกบานใหญ่ (กันผู้เล่นออกนอก) ---------- */
  const T=1.2, H0=3.2, H1=12;
  const side=(hz,sg)=>{ const c=sg*(A+T/2), L=2*A+2*T;
    const put=(len,h,y,al,m,k)=>{ if(hz) bx(len,h,T,al,y,c,m,k); else bx(T,h,len,c,y,al,m,k); };
    put(L,H0,H0/2,0,panel,0.25); put(L,WALL-H1,(WALL+H1)/2,0,panel,0.25);
    dec(hz?L:0.1,0.3,hz?0.1:L,hz?0:sg*(A-0.05),0.16,hz?sg*(A-0.05):0,haz,false);
    for(let i=0;i<=6;i++){ const al=-A+i*(2*A/6); put(1.4,H1-H0,(H0+H1)/2,al,dark,0.25); }
    for(let i=0;i<6;i++){ const al=-A+(i+0.5)*(2*A/6); const w=2*A/6-1.4; const m=hz?bx(w,H1-H0,0.3,al,(H0+H1)/2,sg*(A+0.15),glass,0):bx(0.3,H1-H0,w,sg*(A+0.15),(H0+H1)/2,al,glass,0); m.castShadow=false; m.receiveShadow=false; }
  };
  side(true,-1); side(true,1); side(false,-1); side(false,1);
  /* ---------- นอกหน้าต่าง: ดวงดาว โลกหมุน ดวงอาทิตย์ ---------- */
  { const N=900, p=new Float32Array(N*3); for(let i=0;i<N;i++){ const a=rr(0,Math.PI*2), b=Math.acos(rr(-0.2,1)*(rng()<0.5?1:-1)), R=380; p.set([Math.sin(b)*Math.cos(a)*R,Math.cos(b)*R*0.8+20,Math.sin(b)*Math.sin(a)*R],i*3); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(p,3)); const pm=new THREE.PointsMaterial({size:2.6,color:0xffffff,fog:false,sizeAttenuation:true,transparent:true,opacity:0.9}); mapRes.push(pm); const st=new THREE.Points(g,pm); st.frustumCulled=false; mapG.add(st); }
  const earth=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),mkBasic({map:earthT,fog:false})); earth.scale.setScalar(70); earth.position.set(-45,20,-175); mapG.add(earth);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTex,color:0x5aa8ff,transparent:true,opacity:0.5,fog:false,blending:THREE.AdditiveBlending,depthWrite:false})); mapRes.push(halo.material); halo.scale.set(190,190,1); halo.position.set(-45,20,-176); mapG.add(halo);
  sunSprite(160,60,110,0xfff0c8,170,0.9); sunSprite(160,60,110,0xffffff,50,1);
  /* ---------- เสาไฟนีออน (น้ำเงิน-ส้ม) ---------- */
  const pil=[[-22,-22],[22,-22],[-22,22],[22,22],[-26,0],[26,0],[0,-26],[0,26]];
  pil.forEach(([x,z],i)=>{ bx(1.6,WALL-0.3,1.6,x,(WALL-0.3)/2,z,dark,0.25); const m=i%2?orgM:cyanM; [[0.82,0],[-0.82,0]].forEach(([o])=>{ dec(0.12,WALL-2,0.9,x+o,(WALL)/2,z,m,false); dec(0.9,WALL-2,0.12,x,(WALL)/2,z+o,m,false); }); dec(2.0,0.3,2.0,x,0.15,z,haz,false); });
  /* ---------- แกนกลางสถานี (ยิงบังได้) ---------- */
  bx(7,0.5,7,0,0.25,0,dark,0.25); bx(4.4,2.6,4.4,0,1.8,0,panel,0.25);
  const col=new THREE.Mesh(XCYL,cyanM); col.scale.set(1.3,WALL-4.5,1.3); col.position.set(0,3.1+(WALL-4.5)/2,0); mapG.add(col);
  const rings=[0,1,2].map(i=>{ const r=new THREE.Mesh(XCYL,i%2?orgM:cyanM); r.scale.set(2.6,0.12,2.6); r.position.set(0,5+i*2.6,0); mapG.add(r); return r; });
  addLight(new THREE.PointLight(0x58d8ff,1,24,2),20).position.set(0,6,0);
  /* ---------- คอนโซล / ลังสินค้า ---------- */
  [[-12,-10,0],[12,-10,0],[-12,10,0],[12,10,0],[-30,-16,1],[30,16,1],[16,-30,0],[-16,30,0]].forEach(([x,z,r])=>{ const w=r?1.3:3.2, d=r?3.2:1.3; bx(w,1.1,d,x,0.55,z,dark,0.25); dec(r?0.1:2.6,0.7,r?2.6:0.1,x+(r?(x<0?0.6:-0.6):0),1.5,z+(r?0:(z<0?0.6:-0.6)),cyanM,false); });
  let placed=0; for(let t=0;t<500&&placed<16;t++){ const x=rr(-A+4,A-4), z=rr(-A+4,A-4); if(Math.hypot(x,z-20)<7||Math.hypot(x,z)<7||!boxFree(x,z,1.1,1.1,1.3)) continue; const s=rr(1.2,2.1); bx(s,s,s,x,s/2,z,crate,0.5); if(rng()<0.4) dec(s*0.7,s*0.7,s*0.7,x,s+s*0.35,z,crate); placed++; }
  /* ---------- ท่อ + คาน + ช่องปล่อยไอน้ำ ---------- */
  [-10,0,10].forEach((z,i)=>{ const p=new THREE.Mesh(XCYL,pipeM); p.rotation.z=Math.PI/2; p.scale.set(0.35,2*A-6,0.35); p.position.set(0,WALL-1.2-(i%2)*0.9,z*1.7); mapG.add(p); });
  [-24,-8,8,24].forEach(x=>{ dec(0.8,0.8,2*A-6,x,WALL-0.8,0,dark,false); });
  const vents=[[-A+1.6,-18],[A-1.6,6],[6,-A+1.6]];
  vents.forEach(([x,z])=>{ const p=new THREE.Mesh(XCYL,pipeM); p.scale.set(0.4,3.2,0.4); p.position.set(x,1.6,z); p.castShadow=true; mapG.add(p); const cap=new THREE.Mesh(XCYL,dark); cap.scale.set(0.6,0.25,0.6); cap.position.set(x,3.3,z); mapG.add(cap); });
  const SN=120, sP=new Float32Array(SN*3), sL=new Float32Array(SN), sV=new Float32Array(SN*3);
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(sP,3));
  const sm=new THREE.PointsMaterial({size:1.1,map:dotTex,color:0xdfeeff,transparent:true,opacity:0.3,depthWrite:false,blending:THREE.AdditiveBlending}); mapRes.push(sm); const steam=new THREE.Points(sg,sm); steam.frustumCulled=false; mapG.add(steam);
  const resp=i=>{ const v=vents[i%vents.length]; sP[i*3]=v[0]+rr(-0.15,0.15); sP[i*3+1]=3.4; sP[i*3+2]=v[1]+rr(-0.15,0.15); sV[i*3]=(v[0]<0?1:v[0]>20?-1:0)*rr(0.2,0.9)+rr(-0.2,0.2); sV[i*3+1]=rr(1.6,3.2); sV[i*3+2]=(v[1]<-20?1:0)*rr(0.2,0.9)+rr(-0.2,0.2); sL[i]=rr(0.9,2.2); };
  for(let i=0;i<SN;i++){ resp(i); sL[i]=rr(0,2); }
  /* ---------- ไฟเตือนแดงกะพริบ ---------- */
  const warns=[[-A+1,WALL-2,-A+1],[A-1,WALL-2,-A+1],[-A+1,WALL-2,A-1],[A-1,WALL-2,A-1]];
  warns.forEach(([x,y,z])=>{ const w=new THREE.Mesh(XCONE,warnM); w.scale.set(0.5,0.7,0.5); w.position.set(x,y,z); mapG.add(w); });
  const wl=[warns[0],warns[3]].map(([x,y,z])=>{ const l=addLight(new THREE.PointLight(0xff2a2a,1,28,2),0); l.position.set(x,y-1,z); return l; });
  addLight(new THREE.PointLight(0xff9a40,1,24,2),22).position.set(0,3,-26);
  mapStart=()=>{ banner('LOW GRAVITY','แรงโน้มถ่วงต่ำ — กระโดดสูงและลอยนานขึ้น',3200); };
  mapUpd=(dt,time)=>{
    earth.rotation.y+=dt*0.03; halo.material.opacity=0.45+0.05*Math.sin(time*0.6);
    for(let i=0;i<rings.length;i++){ rings[i].position.y=5+i*2.6+Math.sin(time*1.2+i*2)*0.35; rings[i].rotation.y+=dt*(i%2?-0.8:0.8); }
    const ph=(time%3.2), on=ph<0.55||(ph>0.8&&ph<1.15); warnM.color.copy(on?warnOn:warnOff);
    wl.forEach((l,i)=>{ l.userData.base=on?(i?34:34):0; l.intensity=l.userData.base*S.light; });
    for(let i=0;i<SN;i++){ sL[i]-=dt; if(sL[i]<=0){ resp(i); continue; } sP[i*3]+=sV[i*3]*dt; sP[i*3+1]+=sV[i*3+1]*dt; sP[i*3+2]+=sV[i*3+2]*dt; sV[i*3+1]*=(1-0.25*dt); if(sP[i*3+1]>WALL-1) sL[i]=0; }
    sg.attributes.position.needsUpdate=true;
  };
}
/* ---------- แมพ 7: TOXIC FOUNDRY (โรงหลอมเคมี) · ชั้น 2 ทางเดินเหล็กยกสูง + บ่อกรด/ลาวา (hazZones เสียเลือด 8/วิ) ---------- */
function buildFoundry(){
  hemi.color.set(0xc09070); hemi.groundColor.set(0x2a1a10); hemi.userData.base=0.7;
  moon.color.set(0xffb878); moon.userData.base=1.25; moon.position.set(-35,45,30);
  skyDome([[0,'#3a3430'],[0.35,'#6a5848'],[0.47,'#a8805a'],[0.52,'#8a6a50'],[0.58,'#2a1e18'],[1,'#120c0a']]);
  const steelT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#4a4e54'; g.fillRect(0,0,w,h);
    for(let r=0;r<2;r++) for(let c=0;c<2;c++){ const v=(Math.random()*18-9)|0; g.fillStyle=`rgb(${74+v},${78+v},${86+v})`; g.fillRect(c*128+3,r*128+3,122,122);
      g.fillStyle='rgba(20,20,24,0.7)'; for(const [px,py] of [[10,10],[112,10],[10,112],[112,112]]){ g.beginPath(); g.arc(c*128+px+3,r*128+py+3,3,0,7); g.fill(); } }
    for(let i=0;i<60;i++){ g.fillStyle=`rgba(${120+Math.random()*50|0},${60+Math.random()*30|0},20,${Math.random()*0.3})`; g.fillRect(Math.random()*w,Math.random()*h,rand(2,10),rand(8,50)); }
    g.fillStyle='rgba(10,8,6,0.35)'; g.fillRect(0,h*0.8,w,h*0.2); });
  const gratT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#1e1c1c'; g.fillRect(0,0,w,h);
    for(let y=0;y<8;y++) for(let x=0;x<8;x++){ g.fillStyle='#0b0a0a'; g.fillRect(x*32+5,y*32+5,22,22); g.fillStyle='rgba(255,140,50,0.12)'; g.fillRect(x*32+3,y*32+3,26,2); }
    g.fillStyle='rgba(255,110,30,0.35)'; for(let i=0;i<6;i++) g.fillRect(Math.random()*w,Math.random()*h,rand(10,40),3); },20,20);
  const hazT=canvasTex(128,32,(g,w,h)=>{ g.fillStyle='#e9b81a'; g.fillRect(0,0,w,h); g.fillStyle='#1a1a1a'; for(let i=-2;i<10;i++){ g.beginPath(); g.moveTo(i*16,0); g.lineTo(i*16+8,0); g.lineTo(i*16+8-h,h); g.lineTo(i*16-h,h); g.fill(); } },10,1);
  const lavaT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#ff6a10'; g.fillRect(0,0,w,h);
    for(let i=0;i<46;i++){ g.fillStyle=`rgba(${50+Math.random()*30|0},20,10,${0.5+Math.random()*0.4})`; g.beginPath(); g.ellipse(Math.random()*w,Math.random()*h,rand(10,30),rand(6,16),Math.random()*3,0,7); g.fill(); }
    g.strokeStyle='rgba(255,230,120,0.85)'; g.lineWidth=2; for(let i=0;i<30;i++){ g.beginPath(); let x=Math.random()*w,y=Math.random()*h; g.moveTo(x,y); for(let k=0;k<4;k++){ x+=rand(-18,18); y+=rand(-18,18); g.lineTo(x,y); } g.stroke(); } },3,3);
  const acidT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#38c418'; g.fillRect(0,0,w,h);
    for(let i=0;i<40;i++){ g.fillStyle=`rgba(180,255,90,${0.2+Math.random()*0.3})`; g.beginPath(); g.ellipse(Math.random()*w,Math.random()*h,rand(14,40),rand(8,20),Math.random()*3,0,7); g.fill(); }
    g.strokeStyle='rgba(230,255,160,0.7)'; g.lineWidth=2; for(let i=0;i<34;i++){ g.beginPath(); g.arc(Math.random()*w,Math.random()*h,rand(3,10),0,7); g.stroke(); } },3,3);
  const beltT=canvasTex(128,64,(g,w,h)=>{ g.fillStyle='#232323'; g.fillRect(0,0,w,h); g.fillStyle='#3a3a3a'; for(let x=0;x<w;x+=16) g.fillRect(x,0,3,h); g.fillStyle='rgba(233,184,26,0.7)'; g.fillRect(0,0,w,3); g.fillRect(0,h-3,w,3); },9,1);
  const crateT=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#5a5030'; g.fillRect(0,0,w,h); g.strokeStyle='#2a2410'; g.lineWidth=6; g.strokeRect(4,4,120,120); g.lineWidth=4; g.beginPath(); g.moveTo(4,64); g.lineTo(124,64); g.stroke();
    g.fillStyle='#d8c020'; g.beginPath(); g.moveTo(64,20); g.lineTo(80,48); g.lineTo(48,48); g.closePath(); g.fill(); g.fillStyle='#111'; g.fillRect(62,28,4,10); g.fillRect(62,41,4,3); });
  const steel=mkStd({map:steelT,roughness:0.6,metalness:0.6,envMapIntensity:0.3}), floorM=mkStd({map:gratT,roughness:0.6,metalness:0.6,envMapIntensity:0.2});
  const haz=mkStd({map:hazT,roughness:0.7,metalness:0.2}), crate=mkStd({map:crateT,roughness:0.7,metalness:0.3}), dark=mkStd({color:0x1e1c1e,roughness:0.6,metalness:0.7}), pipeM=mkStd({color:0x7a5a40,roughness:0.5,metalness:0.8});
  const lavaM=mkBasic({map:lavaT,color:hdr(0xffffff,1.5)}), acidM=mkBasic({map:acidT,color:hdr(0xffffff,1.4)}), beltM=mkStd({map:beltT,roughness:0.9,metalness:0.2}), glowO=mkBasic({color:hdr(0xff8a2a,2)});
  const bx=(w,h,d,x,y,z,m,k=0.25)=>addBox(w,h,d,x,y,z,m,true,true,k), dec=(w,h,d,x,y,z,m,sh=true)=>addBox(w,h,d,x,y,z,m,false,sh,0);
  const air=m=>{ colliders[colliders.length-1].air=true; return m; };   /* ดาดฟ้า/บันได: ผู้เล่นชน ศัตรูบินผ่าน */
  const rng=mulberry32(7070), rr=(a,b)=>a+rng()*(b-a);
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(2*A+4,2*A+4),floorM); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; mapG.add(fl); worldMeshes.push(fl);
  /* กำแพงรอบ + ไฟช่องเตาสีส้ม + คานหลังคา */
  [[0,-A-0.6,2*A+2.4,1.2],[0,A+0.6,2*A+2.4,1.2],[-A-0.6,0,1.2,2*A],[A+0.6,0,1.2,2*A]].forEach(([x,z,w,d])=>bx(w,12,d,x,6,z,steel,0.25));
  for(let i=-3;i<=3;i++){ dec(4,0.7,0.1,i*11,8,-A+0.06,glowO,false); dec(4,0.7,0.1,i*11,8,A-0.06,glowO,false); dec(0.1,0.7,4,-A+0.06,8,i*11,glowO,false); dec(0.1,0.7,4,A-0.06,8,i*11,glowO,false); }
  [-30,-10,10,30].forEach(x=>dec(1,0.8,2*A,x,12.4,0,dark,false));
  for(const [x,z,w,d] of [[0,-A+0.3,2*A,0.5],[0,A-0.3,2*A,0.5],[-A+0.3,0,0.5,2*A],[A-0.3,0,0.5,2*A]]) dec(w,0.3,d,x,0.16,z,haz,false);
  /* เบ้าหลอมกลาง */
  bx(9,4.6,9,0,2.3,-6,steel,0.25); { const v=new THREE.Mesh(XCYL,dark); v.scale.set(4.4,0.5,4.4); v.position.set(0,4.85,-6); mapG.add(v); }
  const lava0=new THREE.Mesh(XCYL,lavaM); lava0.scale.set(3.9,0.1,3.9); lava0.position.set(0,5.05,-6); mapG.add(lava0);
  addLight(new THREE.PointLight(0xff8a30,1,30,2),34).position.set(0,7,-6);
  /* ปล่องควัน 4 ต้น */
  [[-34,26],[34,26],[-34,-12],[34,-12]].forEach(([x,z])=>{ bx(4.4,28,4.4,x,14,z,steel,0.25); const rim=new THREE.Mesh(XCYL,glowO); rim.scale.set(1.9,0.15,1.9); rim.position.set(x,28.1,z); mapG.add(rim); dec(4.8,0.6,4.8,x,0.3,z,haz,false); });
  /* ชั้น 2: ดาดฟ้าเหล็กยกสูง (บนสุด y=3.4) + เสารับ + ราวกัน + บันได 11 ขั้น */
  const DK=3.4;
  air(bx(59,0.4,4,-3.5,DK-0.2,-31,steel,0.25)); air(bx(4,0.4,35,-31,DK-0.2,-11.5,steel,0.25));
  [-30,-16,-2,12,24].forEach(x=>bx(0.7,DK-0.4,0.7,x,(DK-0.4)/2,-31,dark,0.25)); [-20,-5].forEach(z=>bx(0.7,DK-0.4,0.7,-31,(DK-0.4)/2,z,dark,0.25));
  [[-3.5,-29.1,59,0.12],[-3.5,-32.9,59,0.12]].forEach(([x,z,w,d])=>dec(w,1,d,x,DK+0.5,z,haz,false)); [[-29.1,-11.5],[-32.9,-11.5]].forEach(([x,z])=>dec(0.12,1,35,x,DK+0.5,z,haz,false));
  const NS=11;
  for(let k=1;k<=NS;k++){ const h=k*DK/NS, off=(NS-k)*0.6;
    air(bx(0.6,h,3,26.3+off,h/2,-31,steel,0.25));          /* บันไดฝั่งตะวันออกของดาดฟ้าเหนือ */
    air(bx(3,h,0.6,-31,h/2,6.3+off,steel,0.25)); }           /* บันไดปลายทิศใต้ของดาดฟ้าตะวันตก */
  /* บ่อกรด/ลาวา = โซนอันตราย */
  const pools=[[-20,-2,10,12,'acid'],[22,6,12,10,'lava'],[14,-24,10,10,'acid']], bub=[], plights=[];
  pools.forEach(([x,z,w,d,k])=>{ hazZones.push({x,z,hw:w/2,hd:d/2});
    const liq=new THREE.Mesh(new THREE.PlaneGeometry(w,d),k==='lava'?lavaM:acidM); liq.rotation.x=-Math.PI/2; liq.position.set(x,0.06,z); mapG.add(liq);
    dec(w+1.4,0.14,0.7,x,0.07,z-d/2-0.35,haz,false); dec(w+1.4,0.14,0.7,x,0.07,z+d/2+0.35,haz,false); dec(0.7,0.14,d,x-w/2-0.35,0.07,z,haz,false); dec(0.7,0.14,d,x+w/2+0.35,0.07,z,haz,false);
    for(let i=0;i<5;i++){ const b=new THREE.Mesh(XSPH,k==='lava'?lavaM:acidM); b.position.set(x+rr(-w/2+1,w/2-1),0.08,z+rr(-d/2+1,d/2-1)); b.userData.ph=rr(0,6); bub.push(b); mapG.add(b); }
    const l=addLight(new THREE.PointLight(k==='lava'?0xff7a20:0x70ff40,1,22,2),k==='lava'?30:24); l.position.set(x,2.2,z); plights.push({l,lava:k==='lava',x,z}); });
  /* สายพานลำเลียง (เคลื่อนเฉยๆ) */
  const belts=[[-15,16,18],[17,-14,18]], loads=[];
  belts.forEach(([x,z,len])=>{ bx(len,0.9,2.4,x,0.45,z,dark,0.25); const bt=new THREE.Mesh(new THREE.PlaneGeometry(len-0.4,1.9),beltM); bt.rotation.x=-Math.PI/2; bt.position.set(x,0.92,z); mapG.add(bt);
    for(let i=0;i<5;i++){ const c=new THREE.Mesh(XBOX,crate); c.scale.set(0.8,0.7,0.8); c.position.set(x-len/2+0.8+i*(len-1.6)/5,1.27,z); c.userData.b={x0:x-len/2+0.8,x1:x+len/2-0.8}; loads.push(c); mapG.add(c); } });
  /* เตาหลอมข้างกำแพงตะวันออก */
  [[37.5,-26],[37.5,-4]].forEach(([x,z])=>{ bx(4,5,4,x,2.5,z,steel,0.25); dec(0.12,1.6,2.4,x-2.02,1.4,z,glowO,false); });
  const furn=[[35.4,1.4,-26],[35.4,1.4,-4]];
  addLight(new THREE.PointLight(0xff7a20,1,24,2),26).position.set(33,2.2,-15);
  /* ท่อ + ช่องไอน้ำ */
  [-20,10,24].forEach((z,i)=>{ const p=new THREE.Mesh(XCYL,pipeM); p.rotation.z=Math.PI/2; p.scale.set(0.45,2*A-4,0.45); p.position.set(0,10.2-(i%2)*0.9,z); mapG.add(p); });
  const vents=[[-A+1.6,20],[A-1.6,16]];
  vents.forEach(([x,z])=>{ const p=new THREE.Mesh(XCYL,pipeM); p.scale.set(0.45,3,0.45); p.position.set(x,1.5,z); p.castShadow=true; mapG.add(p); const c=new THREE.Mesh(XCYL,dark); c.scale.set(0.7,0.25,0.7); c.position.set(x,3.1,z); mapG.add(c); });
  const SN=70, sP=new Float32Array(SN*3), sV=new Float32Array(SN*3), sL=new Float32Array(SN);
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(sP,3)); const sm=new THREE.PointsMaterial({size:1.5,map:dotTex,color:0xcfc8c0,transparent:true,opacity:0.28,depthWrite:false}); mapRes.push(sm); const steam=new THREE.Points(sg,sm); steam.frustumCulled=false; mapG.add(steam);
  const sResp=i=>{ const v=vents[i%2]; sP[i*3]=v[0]+rr(-0.2,0.2); sP[i*3+1]=3.2; sP[i*3+2]=v[1]+rr(-0.2,0.2); sV[i*3]=(v[0]<0?1:-1)*rr(0.3,1.2); sV[i*3+1]=rr(1.4,2.8); sV[i*3+2]=rr(-0.4,0.4); sL[i]=rr(1,2.4); };
  for(let i=0;i<SN;i++){ sResp(i); sL[i]=rr(0,2); }
  /* เศษไฟลอย (embers) + เถ้า */
  const EN=100, eP=new Float32Array(EN*3), eL=new Float32Array(EN), eg=new THREE.BufferGeometry(); eg.setAttribute('position',new THREE.BufferAttribute(eP,3));
  const em=new THREE.PointsMaterial({size:0.2,map:dotTex,color:hdr(0xffa040,2.2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}); mapRes.push(em); const embers=new THREE.Points(eg,em); embers.frustumCulled=false; mapG.add(embers);
  const eRes=i=>{ const s=(rng()<0.45)?{x:0,z:-6,r:4}:{x:22,z:6,r:5}; eP[i*3]=s.x+rr(-s.r,s.r); eP[i*3+1]=rr(0.3,5); eP[i*3+2]=s.z+rr(-s.r,s.r); eL[i]=rr(2,6); };
  for(let i=0;i<EN;i++){ eRes(i); }
  const ash=dustPoints(220,0x9a9088,0.17,0.5,16,false);
  /* วิวโรงงานไกลๆ */
  { const fm=mkBasic({color:0x2a1e18}); for(let i=0;i<16;i++){ const a=i/16*Math.PI*2+rr(-0.1,0.1), r=rr(80,130), w=rr(14,30), h=rr(10,34); const b=new THREE.Mesh(XBOX,fm); b.scale.set(w,h,w); b.position.set(Math.cos(a)*r,h/2-1,Math.sin(a)*r); mapG.add(b); if(i%3===0){ const t=new THREE.Mesh(XBOX,glowO); t.scale.set(w*0.5,1,w*0.5); t.position.set(b.position.x,h+0.5,b.position.z); mapG.add(t); } } }
  /* ลังกำบัง */
  for(let t=0,placed=0;t<600&&placed<14;t++){ const x=rr(-A+4,A-4), z=rr(-A+4,A-4); if(Math.hypot(x,z-32)<8||Math.hypot(x,z+6)<9||!boxFree(x,z,1.1,1.1,1.3)) continue; const s=rr(1.2,2.0); bx(s,s,s,x,s/2,z,crate,0.5); placed++; }
  /* ---------- logic ---------- */
  let hAcc=0, sparkT=0, bubT=0; const HAZ_DPS=8;
  mapStart=()=>{ hAcc=0; banner('โซนอันตราย','บ่อกรดเขียวและบ่อลาวาทำให้เสียเลือด 8 ต่อวินาที — ขึ้นดาดฟ้าชั้น 2 เพื่อยิงจากที่สูง',3600); };
  mapUpd=(dt,time)=>{
    lavaT.offset.x+=dt*0.015; lavaT.offset.y+=dt*0.01; acidT.offset.x-=dt*0.012; acidT.offset.y+=dt*0.018; beltT.offset.x-=dt*0.5;
    for(let i=0;i<loads.length;i++){ const c=loads[i], b=c.userData.b; c.position.x+=dt*1.5; if(c.position.x>b.x1) c.position.x=b.x0; }
    for(let i=0;i<bub.length;i++){ const b=bub[i], s=0.12+0.28*Math.max(0,Math.sin(time*1.6+b.userData.ph)); b.scale.set(s,s*0.7,s); }
    for(let i=0;i<plights.length;i++){ const o=plights[i], f=0.8+0.2*Math.sin(time*(o.lava?7:3)+i*2)+(o.lava?Math.random()*0.08:0); o.l.intensity=o.l.userData.base*S.light*f; }
    lava0.scale.x=lava0.scale.z=3.9+Math.sin(time*2)*0.08;
    for(let i=0;i<SN;i++){ sL[i]-=dt; if(sL[i]<=0){ sResp(i); continue; } sP[i*3]+=sV[i*3]*dt; sP[i*3+1]+=sV[i*3+1]*dt; sP[i*3+2]+=sV[i*3+2]*dt; sV[i*3+1]*=(1-0.2*dt); } sg.attributes.position.needsUpdate=true;
    for(let i=0;i<EN;i++){ eL[i]-=dt; if(eL[i]<=0||eP[i*3+1]>14){ eRes(i); continue; } eP[i*3]+=Math.sin(time+i)*dt*0.6; eP[i*3+1]+=dt*(1.2+(i%5)*0.25); eP[i*3+2]+=Math.cos(time*0.8+i)*dt*0.6; } eg.attributes.position.needsUpdate=true;
    const ap=ash.p; for(let i=0;i<ash.n;i++){ ap[i*3+1]-=dt*(0.5+(i%4)*0.12); ap[i*3]+=dt*0.35; if(ap[i*3+1]<0){ ap[i*3+1]=16; ap[i*3]=rand(-A,A); } if(ap[i*3]>A) ap[i*3]=-A; } ash.g.attributes.position.needsUpdate=true;
    sparkT-=dt; if(sparkT<=0&&state==='play'){ sparkT=rand(0.25,0.7); const f=furn[(Math.random()*2)|0]; _tmpV.set(f[0],f[1]+rand(-0.3,0.3),f[2]+rand(-0.8,0.8)); emit(_tmpV,5,0xffb040,4,0.5,0.6); }
    if(state==='play'){
      let near=1e9; for(let i=0;i<plights.length;i++) near=Math.min(near,Math.hypot(P.pos.x-plights[i].x,P.pos.z-plights[i].z));
      bubT-=dt; if(bubT<=0){ bubT=rand(0.2,0.55); if(near<16&&AU.ctx){ const c=AU.ctx, t=c.currentTime, f=rand(160,420); tn(c,AU.sfx,t,'sine',f,f*rand(1.6,2.4),0.07,0.03*clamp(1-near/16,0.15,1),0,0.005); } }
      if(P.onGround&&P.pos.y<0.6&&inHaz(P.pos.x,P.pos.z,P.radius*0.4)){ hAcc+=dt; if(hAcc>=0.5){ hAcc=0; hurt(HAZ_DPS*0.5); } } else hAcc=Math.max(0,hAcc-dt); }
  };
}
/* ---------- แมพ 8: SUNKEN METRO (สถานีรถไฟใต้ดินร้าง) · เพดานต่ำ + ไฟกระพริบ/ดับ (ไฟฉายปืน) + รถไฟผ่านหลังกระจก ---------- */
function buildMetro(){
  const CH=6.5;   /* ความสูงเพดาน (ศัตรูบินจำกัดด้วย MAPS.metro.flyMax) */
  hemi.color.set(0x8aa0b8); hemi.groundColor.set(0x1a2028); hemi.userData.base=0.85;
  moon.color.set(0xaabbd0); moon.userData.base=0.35; moon.position.set(20,60,15);
  const wallT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#7d858c'; g.fillRect(0,0,w,h);
    for(let y=0;y<8;y++) for(let x=0;x<8;x++){ const v=(Math.random()*18-9)|0; g.fillStyle=`rgb(${150+v},${158+v},${164+v})`; g.fillRect(x*32+1,y*32+1,30,30); }
    const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'rgba(20,24,20,0.0)'); gr.addColorStop(1,'rgba(20,28,22,0.55)'); g.fillStyle=gr; g.fillRect(0,0,w,h);
    for(let i=0;i<24;i++){ g.fillStyle=`rgba(30,40,30,${0.12+Math.random()*0.2})`; g.fillRect(Math.random()*w,0,rand(1,3),rand(30,140)); }
    for(let i=0;i<500;i++){ g.fillStyle=`rgba(0,0,0,${Math.random()*0.1})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } });
  const floorT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#4a4e52'; g.fillRect(0,0,w,h);
    for(let i=0;i<1200;i++){ const v=Math.random()*40|0; g.fillStyle=`rgba(${v+60},${v+64},${v+68},0.4)`; g.fillRect(Math.random()*w,Math.random()*h,rand(1,4),rand(1,4)); }
    g.strokeStyle='rgba(15,18,20,0.8)'; g.lineWidth=2; g.strokeRect(0,0,w,h); g.beginPath(); g.moveTo(0,128); g.lineTo(256,128); g.moveTo(128,0); g.lineTo(128,256); g.stroke();
    for(let i=0;i<6;i++){ g.strokeStyle='rgba(10,12,14,0.6)'; g.beginPath(); let x=Math.random()*w,y=Math.random()*h; g.moveTo(x,y); for(let k=0;k<5;k++){ x+=rand(-16,16); y+=rand(4,18); g.lineTo(x,y); } g.stroke(); }
    g.fillStyle='rgba(20,40,60,0.35)'; g.beginPath(); g.ellipse(70,190,40,18,0.3,0,7); g.fill(); },20,20);
  const platT=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#8a9096'; g.fillRect(0,0,w,h);
    for(let y=0;y<4;y++) for(let x=0;x<4;x++){ const v=(Math.random()*16-8)|0; g.fillStyle=`rgb(${150+v},${156+v},${160+v})`; g.fillRect(x*64+2,y*64+2,60,60); }
    g.fillStyle='rgba(30,36,30,0.25)'; g.fillRect(0,0,w,h); for(let i=0;i<600;i++){ g.fillStyle=`rgba(0,0,0,${Math.random()*0.1})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } },16,16);
  const trainT=canvasTex(512,128,(g,w,h)=>{ g.fillStyle='#6a2a24'; g.fillRect(0,0,w,h); g.fillStyle='#2a1210'; g.fillRect(0,h-26,w,26); g.fillRect(0,0,w,16);
    for(let i=0;i<8;i++){ g.fillStyle='#14181c'; g.fillRect(14+i*62,30,46,44); g.fillStyle='rgba(120,150,170,0.25)'; g.fillRect(16+i*62,32,18,40); }
    g.fillStyle='rgba(20,10,8,0.7)'; for(let i=0;i<30;i++) g.fillRect(Math.random()*w,Math.random()*h,rand(2,18),rand(1,3));
    g.fillStyle='#d9c27a'; g.fillRect(0,86,w,4); },1,1);
  const trainWinT=canvasTex(512,128,(g,w,h)=>{ g.fillStyle='#2a2e34'; g.fillRect(0,0,w,h); for(let i=0;i<8;i++){ g.fillStyle='#ffe9b0'; g.fillRect(10+i*62,26,48,48); } g.fillStyle='#14161a'; g.fillRect(0,h-20,w,20); },12,1);
  const signT=(txt,bg,fg)=>canvasTex(256,64,(g,w,h)=>{ g.fillStyle=bg; g.fillRect(0,0,w,h); g.strokeStyle=fg; g.lineWidth=4; g.strokeRect(3,3,w-6,h-6); g.fillStyle=fg; g.font='bold 34px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(txt,w/2,h/2+2); },1,1);
  const wallM=mkStd({map:wallT,roughness:0.85,metalness:0.05,envMapIntensity:0.15}), floorM=mkStd({map:floorT,roughness:0.75,metalness:0.1,envMapIntensity:0.2}), platM=mkStd({map:platT,roughness:0.8,metalness:0.05,envMapIntensity:0.15});
  const trainM=mkStd({map:trainT,roughness:0.6,metalness:0.35,envMapIntensity:0.25}), darkM=mkStd({color:0x20262c,roughness:0.6,metalness:0.4}), railM=mkStd({color:0x575d64,roughness:0.4,metalness:0.8});
  const yelM=mkStd({color:0xe0b020,roughness:0.7,metalness:0.1}), itemM=mkStd({color:0x59605a,roughness:0.8,metalness:0.2}), glassM=mkStd({color:0x2a3a48,transparent:true,opacity:0.25,roughness:0.05,metalness:0.4,depthWrite:false});
  const baseTube=hdr(0xdff6ff,1.7), tubeA=mkBasic({color:baseTube.clone()}), tubeB=mkBasic({color:baseTube.clone()});
  const bx=(w,h,d,x,y,z,m,k=0.25)=>addBox(w,h,d,x,y,z,m,true,true,k), dec=(w,h,d,x,y,z,m,sh=true)=>addBox(w,h,d,x,y,z,m,false,sh,0);
  const rng=mulberry32(8080), rr=(a,b)=>a+rng()*(b-a);
  const signs=[['ชานชาลา 1','#0c5a36','#eafff0',-20,-12.2],['ชานชาลา 2','#0c5a36','#eafff0',20,12.2],['ทางออก','#0b3f7a','#e8f4ff',0,-30],['ห้ามเข้า','#7a0b0b','#ffe8e8',-26,30]].map(([t,bg,fg,x,z])=>{
    const m=mkBasic({map:signT(t,bg,fg),color:0xffffff}); dec(3.4,0.85,0.12,x,CH-1.3,z,m,false); dec(0.06,1.1,0.06,x-1.5,CH-0.55,z,darkM,false); dec(0.06,1.1,0.06,x+1.5,CH-0.55,z,darkM,false); return {m,f:0,ph:Math.random()*9}; });
  const trainWinM=mkBasic({map:trainWinT,color:hdr(0xffffff,1.2),fog:false});
  /* พื้น + ชานชาลา 2 ฝั่ง (สูง 1.1 ม. มีบันไดลง) + รางตรงกลาง */
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(2*A+4,2*A+4),floorM); fl.rotation.x=-Math.PI/2; fl.receiveShadow=true; mapG.add(fl); worldMeshes.push(fl);
  for(const sg of [-1,1]){
    bx(2*A,1.1,13,0,0.55,sg*15.5,platM,0.3); dec(2*A,0.03,0.4,0,1.11,sg*9.5,yelM,false);
    [-24,0,24].forEach(x=>{ [[0.825,22.4],[0.55,23.2],[0.275,24.0]].forEach(([h,z])=>bx(5,h,0.8,x,h/2,sg*z,platM,0.3)); });
    [-30,-15,0,15,30].forEach(x=>bx(1.2,CH,1.2,x,CH/2,sg*12.5,wallM,0.3));
    [-20,20].forEach(x=>bx(1.2,CH,1.2,x,CH/2,sg*30,wallM,0.3)); }
  /* รางรถไฟ + หมอนรอง (InstancedMesh) */
  [-3.7,-2.3,2.3,3.7].forEach(z=>dec(2*A,0.12,0.12,0,0.06,z,railM,false));
  { const sl=new THREE.InstancedMesh(new THREE.BoxGeometry(0.3,0.1,2.6),darkM,2*Math.floor(2*A/0.9)), m4=new THREE.Matrix4(); let n=0; for(const z of [-3,3]) for(let x=-A+0.6;x<A-0.3;x+=0.9){ m4.makeTranslation(x,0.05,z); sl.setMatrixAt(n++,m4); } sl.count=n; sl.receiveShadow=true; mapG.add(sl); mapRes.push({dispose:()=>sl.dispose()}); }
  /* ผนังรอบ + เพดาน + หน้าต่างเหนือ (มองเห็นรถไฟในอุโมงค์ด้านหลัง) */
  bx(1.2,CH,2*A+2.4,-(A+0.6),CH/2,0,wallM,0.3); bx(1.2,CH,2*A+2.4,A+0.6,CH/2,0,wallM,0.3); bx(2*A,CH,1.2,0,CH/2,A+0.6,wallM,0.3);
  const NZ=-(A+0.6);
  bx(2*A,1.4,1.2,0,0.7,NZ,wallM,0.3); bx(2*A,CH-3.4,1.2,0,(CH+3.4)/2,NZ,wallM,0.3);
  [[-34,8],[-18,8],[0,12],[18,8],[34,8]].forEach(([x,w])=>bx(w,2,1.2,x,2.4,NZ,wallM,0.3));
  [-26,-10,10,26].forEach(x=>{ const g=bx(8,2,0.2,x,2.4,NZ,glassM,0); g.castShadow=false; });
  dec(2*A+2,0.2,6,0,-0.1,NZ-3.4,darkM,false); dec(2*A+2,0.3,6,0,4.2,NZ-3.4,darkM,false); dec(2*A+2,5,0.4,0,2.4,NZ-6.6,wallM,false);
  const train=new THREE.Mesh(new THREE.BoxGeometry(70,2.4,2.4),trainWinM); train.position.set(260,2.4,NZ-3.2); mapG.add(train);
  const ceil=bx(2*A,0.7,2*A,0,CH+0.35,0,wallM,0.2); ceil.castShadow=false; colliders[colliders.length-1].ceil=true;   /* ตัวเพดาน: ชนกระสุน/ศัตรู แต่ไม่นับเป็นสิ่งกีดขวางตอนหาจุดวาง (boxFree) */
  /* หลอดไฟเพดาน 2 กลุ่ม (กระพริบแยกกัน) */
  { const tg=new THREE.BoxGeometry(4.2,0.1,0.35), IA=new THREE.InstancedMesh(tg,tubeA,15), IB=new THREE.InstancedMesh(tg,tubeB,15), m4=new THREE.Matrix4(); let a=0,b=0;
    [-30,-18,-6,6,18,30].forEach((x,i)=>[-30,-15,0,15,30].forEach((z,j)=>{ if(a+b>=30) return; m4.makeTranslation(x,CH-0.1,z); ((i+j)%2?IA:IB).setMatrixAt((i+j)%2?a++:b++,m4); }));
    IA.count=a; IB.count=b; IA.frustumCulled=false; IB.frustumCulled=false; mapG.add(IA); mapG.add(IB); mapRes.push({dispose:()=>{ IA.dispose(); IB.dispose(); tg.dispose(); }}); }
  /* ตู้รถไฟพัง (ที่กำบังบนราง) + ซากเอียง */
  [[-16,3,16],[14,3,14],[2,-3,14]].forEach(([x,z,l])=>{ bx(l,3.1,2.8,x,1.85,z,trainM,0); dec(l+0.2,0.2,3,x,3.5,z,darkM,false); });
  { const w=dec(6,0.3,2.8,23.5,1.5,3,trainM); w.rotation.z=0.4; }
  /* บันไดเลื่อนพัง 2 จุด */
  [[-31,-30],[31,30]].forEach(([x,z])=>{ bx(2.4,1.2,9,x,0.6,z,darkM,0.3); const s=dec(2.2,0.2,9.6,x,1.45,z,railM); s.rotation.x=0.12; dec(0.1,0.9,9.6,x-1.15,1.9,z,darkM,false); dec(0.1,0.9,9.6,x+1.15,1.9,z,darkM,false); });
  /* ที่กำบังกระจาย: ม้านั่ง/ตู้/ถัง (เว้นรอบจุดเกิด) */
  for(let t=0,n=0;t<700&&n<18;t++){ const x=rr(-A+4,A-4), z=rr(-A+4,A-4), az=Math.abs(z); if(az<9.6||Math.hypot(x,z-30)<7||!boxFree(x,z,1.4,1.4,1.2)) continue;
    const y0=(az>9&&az<22)?1.1:0, k=n%3, w=k===0?2.4:k===1?1.2:1.0, h=k===0?0.55:k===1?2:1.1, d=k===0?0.8:k===1?0.9:1.0; bx(w,h,d,x,y0+h/2,z,itemM,0.4); n++; }
  for(let i=0;i<6;i++){ const p=new THREE.Mesh(XCYL,glassM); p.scale.set(rr(1.2,2.4),0.01,rr(1.2,2.4)); p.position.set(rr(-30,30),0.015,(i%2?1:-1)*rr(24,36)); mapG.add(p); }
  /* ไฟ: โคมกระพริบ 3 ดวง + ไฟฉุกเฉินเขียว + ไฟรถไฟ + ไฟฉายปืน (SpotLight ตามกล้อง) */
  const lamps=[[-22,5.4,0,26],[0,5.4,0,26],[22,5.4,0,26],[0,4.6,30,12]].map(([x,y,z,b],i)=>{ const l=addLight(new THREE.PointLight(i===3?0x6aff9a:0xcfe8ff,1,28,2),b); l.position.set(x,y,z); return l; });
  const tl=addLight(new THREE.PointLight(0xffe0a0,1,34,2),0); tl.position.set(0,2.6,-A+2);
  const spot=addLight(new THREE.SpotLight(0xdbeaff,0,36,0.6,0.7,1.5),60); spot.castShadow=false; mapG.add(spot.target);
  const pol=dustPoints(140,0xc8d8e8,0.1,0.3,CH-0.6,false);
  /* หยดน้ำจากเพดาน (Points ตกซ้ำ) */
  const DN=10, dP=new Float32Array(DN*3), dV=new Float32Array(DN), dg=new THREE.BufferGeometry(); dg.setAttribute('position',new THREE.BufferAttribute(dP,3));
  const dm=new THREE.PointsMaterial({size:0.16,map:dotTex,color:0xa8d0ff,transparent:true,opacity:0.8,depthWrite:false}); mapRes.push(dm); const drops=new THREE.Points(dg,dm); drops.frustumCulled=false; mapG.add(drops);
  const dropAt=i=>{ dP[i*3]=rr(-A+3,A-3); dP[i*3+2]=(rng()<0.5?-1:1)*rr(23,A-3); dP[i*3+1]=CH-0.3; dV[i]=-rr(-1,0); };
  for(let i=0;i<DN;i++){ dropAt(i); dP[i*3+1]=rr(0.5,CH-0.3); }
  mapStart=()=>{ banner('SUNKEN METRO','ไฟสถานีกระพริบและดับเป็นช่วงๆ — ใช้ไฟฉายปืนส่องทาง',3200); };
  const fv=new THREE.Vector3(), M={ph:'on',t:rr(12,20),k:1,fk:0,bf:0,tt:6,train:false,ft:0};
  mapUpd=(dt,time)=>{
    M.t-=dt; let k=1;
    if(M.ph==='on'){ if(M.t<=0){ M.ph='flk1'; M.t=1.4; } }
    else if(M.ph==='flk1'){ M.ft-=dt; if(M.ft<=0){ M.ft=rr(0.05,0.14); M.fk=Math.random()<0.5?1:0.1; } k=M.fk; if(M.t<=0){ M.ph='dark'; M.t=rr(5,8); } }
    else if(M.ph==='dark'){ k=0.02; M.bf-=dt; if(M.bf<=0&&Math.random()<dt*0.7) M.bf=0.12; if(M.bf>0) k=0.5; if(M.t<=0){ M.ph='flk2'; M.t=1.1; } }
    else { M.ft-=dt; if(M.ft<=0){ M.ft=rr(0.05,0.14); M.fk=Math.random()<0.55?1:0.1; } k=M.fk; if(M.t<=0){ M.ph='on'; M.t=rr(18,30); } }
    M.k=k; let kb=k; if(M.ph==='on'&&Math.random()<dt*0.12) M.bf=-0.25; if(M.ph==='on'&&M.bf<0){ M.bf+=dt; kb=0.15; if(M.bf>=0) M.bf=0; }
    tubeA.color.copy(baseTube).multiplyScalar(k); tubeB.color.copy(baseTube).multiplyScalar(kb);
    for(const s of signs){ if(s.f>0) s.f-=dt; else if(Math.random()<dt*0.25) s.f=rr(0.08,0.4); s.m.color.setScalar((0.25+0.75*k)*(s.f>0?0.2:1)); }
    for(let i=0;i<lamps.length;i++){ const l=lamps[i], f=(i<3?(i%2?kb:k):1)*(0.94+0.06*Math.sin(time*40+i)); l.intensity=l.userData.base*S.light*(i===3?(0.4+0.6*(1-k*0.0)):f); }
    hemi.intensity=hemi.userData.base*S.light*(0.35+0.65*k); moon.intensity=moon.userData.base*S.light*k;
    camera.getWorldDirection(fv); spot.position.copy(camera.position); spot.target.position.copy(camera.position).addScaledVector(fv,12); spot.intensity=spot.userData.base*S.light*(1-k)*0.9;
    /* รถไฟผ่านหลังกระจก */
    if(!M.train){ M.tt-=dt; if(M.tt<=0){ M.train=true; train.position.x=170; metroTrainSfx(); } }
    else { train.position.x-=46*dt; const x=train.position.x; tl.position.x=clamp(x,-A+3,A-3); tl.intensity=tl.userData.base*S.light*0+34*S.light*Math.max(0,1-Math.abs(x)/70)*(0.85+0.15*Math.sin(time*50)); if(x<-170){ M.train=false; M.tt=rr(26,38); tl.intensity=0; train.position.x=260; } }
    const p=pol.p; for(let i=0;i<pol.n;i++){ p[i*3]+=Math.sin(time*0.3+i)*dt*0.15; p[i*3+1]+=Math.cos(time*0.4+i*1.7)*dt*0.1; if(p[i*3+1]<0.2) p[i*3+1]=0.2; if(p[i*3+1]>CH-0.5) p[i*3+1]=CH-0.5; } pol.g.attributes.position.needsUpdate=true;
    for(let i=0;i<DN;i++){ dV[i]+=9.8*dt; dP[i*3+1]-=dV[i]*dt; const fy=(Math.abs(dP[i*3+2])>9&&Math.abs(dP[i*3+2])<22)?1.1:0; if(dP[i*3+1]<=fy){ _tmpV.set(dP[i*3],fy+0.05,dP[i*3+2]); emit(_tmpV,3,0xa8d0ff,1.2,0.25,0.5); dropAt(i); } }
    dg.attributes.position.needsUpdate=true;
  };
}
const XSPH=new THREE.SphereGeometry(1,14,8), XCYL=new THREE.CylinderGeometry(1,1,1,12), XCONE=new THREE.ConeGeometry(1,1,8), XBOX=new THREE.BoxGeometry(1,1,1);

const MAPS={
  rain:{name:'RAIN CITY',th:'เมืองนีออนฝนตก (ยามค่ำคืน)',desc:'แมพเดิม ลานกลางมีแท่นโฮโลแกรม ตึกนีออน 4 มุม',gim:'ฝนตก ฟ้าร้อง แท่นโฮโลแกรมกลางลาน',A:40,fog:0.016,bloom:1,rainSnd:true,spawnY:0.8,bg:0x05060f,fogC:0x0a0b1e,build:buildRain},
  desert:{name:'SANDSTONE BAZAAR',th:'ตลาดหินทราย สไตล์คลาสสิกสมัยก่อน',desc:'กลางวันแดดจัด ตรอกแคบ ประตูโค้ง จุด A/B สองฝั่ง',gim:'ตรอกแคบ ประตูโค้ง จุด A/B สองฝั่ง',A:38,fog:0.0055,bloom:0.3,rainSnd:false,spawnY:0.05,bg:0xdbe9f2,fogC:0xe6d2a6,build:buildDesert},
  frost:{name:'FROST STATION',th:'สถานีวิจัยขั้วโลก (กลางคืน ออโรร่า)',desc:'ลานหิมะ อาคารวิจัย หอสังเกตการณ์ ท้องฟ้าออโรร่า',gim:'พื้นน้ำแข็งลื่น + พายุหิมะทุก ~60 วิ',A:42,fog:0.0135,bloom:0.8,rainSnd:false,spawnY:0.05,spawn:{x:-3,z:3,yaw:0},bg:0x071530,fogC:0x16334a,build:buildFrost},
  jungle:{name:'JUNGLE RUINS',th:'ซากวิหารในป่า (เช้าตรู่ หมอกเขียวทอง)',desc:'ซากวิหารหิน ต้นไม้ใหญ่ ลำแสงลอดใบไม้ หิ่งห้อย',gim:'ที่ราบสูงกลางแท่นบูชา 2 ชั้น เป็นจุดสูงสำหรับสไนเปอร์',A:44,fog:0.011,bloom:0.45,glow:1.5,rainSnd:false,spawnY:0.05,spawn:{x:0,z:22,yaw:0},bg:0xcfe4b0,fogC:0xbcd49a,build:buildJungle},
  orbital:{name:'ORBITAL STATION',th:'สถานีอวกาศ (โถงหน้าต่างมองโลก)',desc:'โถงสถานีอวกาศ หน้าต่างบานใหญ่มองโลกหมุน เสานีออน ท่อไอน้ำ',gim:'แรงโน้มถ่วงต่ำ กระโดดสูงลอยนาน + ไฟเตือนแดงกะพริบ',A:36,fog:0.003,bloom:0.55,rainSnd:false,spawnY:0.05,spawn:{x:0,z:20,yaw:0},grav:14,bg:0x02040a,fogC:0x0b1a30,build:buildOrbital},
  foundry:{name:'TOXIC FOUNDRY',th:'โรงหลอมเคมี (ลาวา-กรดพิษ)',desc:'โรงงานหลอมโลหะ เบ้าหลอม ปล่องควัน ดาดฟ้าเหล็กชั้น 2 สายพาน',gim:'บ่อกรด/ลาวาเสียเลือด 8/วิ + ดาดฟ้าชั้น 2 ยิงจากที่สูง',A:40,fog:0.011,bloom:0.7,glow:1.2,rainSnd:false,spawnY:0.05,spawn:{x:0,z:32,yaw:0},bg:0x2a1e18,fogC:0x5a4030,build:buildFoundry},
  metro:{name:'SUNKEN METRO',th:'สถานีรถไฟใต้ดินร้าง (ในร่ม เพดานต่ำ)',desc:'ชานชาลายาว รางรถไฟ ตู้รถไฟพัง เสาคอนกรีต ป้ายไฟกระพริบ',gim:'ไฟสถานีกระพริบ/ดับเป็นช่วงๆ + รถไฟวิ่งผ่านหลังกระจก',A:38,fog:0.016,bloom:0.6,glow:1.3,flyMax:5.9,rainSnd:false,spawnY:0.05,spawn:{x:0,z:30,yaw:0},bg:0x06080c,fogC:0x0c1218,build:buildMetro},
  testyard:{name:'TEST YARD',th:'ลานทดสอบขนาดใหญ่ (กลางวัน) พร้อมแท่นดีดสูง',desc:'แมพกว้างโล่ง ตึกหลายระดับสูงสุด 46 ม. กล่อง/ตู้คอนเทนเนอร์ และแท่นดีด 6 แท่น',gim:'แท่นดีดสีเขียวพาขึ้นสูงถึงดาดฟ้า ลอยควบคุมทิศทางได้ · ผู้เล่นเร็ว +20% มอนสเตอร์เร็ว +15%',A:90,fog:0.0028,bloom:0.35,rainSnd:false,spawnY:0.05,spawn:{x:0,z:22,yaw:0},bg:0xbcd8f0,fogC:0xcfe2f0,glow:1.4,pSpd:1.2,eSpd:1.15,spawnR:50,shR:105,build:buildTestyard},
  apoc:{name:'ASHFALL',th:'เมืองพังวันสิ้นโลก (สนธยา)',desc:'ท้องฟ้าส้มแดง ควันดำ รถไหม้ ถังไฟ ซากตึก',gim:'ถังไฟ รถไหม้ ซากตึกเป็นที่กำบัง',A:42,fog:0.017,bloom:0.6,rainSnd:false,spawnY:0.05,bg:0x2a140c,fogC:0x4a2a1a,build:buildApoc},
};
function clearMap(){
  scene.remove(mapG);
  mapG.traverse(o=>{ if(o.geometry&&!o.geometry.userData.keep) o.geometry.dispose(); });
  mapRes.forEach(m=>{ if(m.map&&m.map.dispose) m.map.dispose(); m.dispose&&m.dispose(); }); mapRes=[];
  colliders.length=0; worldMeshes.length=0; lights.length=0; lights.push(hemi,moon); mapUpd=null; mapStart=null; iceZones=[]; hazZones.length=0;
  mapG=new THREE.Group(); scene.add(mapG);
}
function refreshMapEnv(){
  lights.forEach(l=>l.intensity=l.userData.base*S.light);
  scene.fog.density=MAPS[curMap].fog*S.fog; bloom.strength=S.bloomStr*MAPS[curMap].bloom;
  if(mapReady) applyVolumes();
}
/* โหมดกราฟิก "ต่ำที่สุด" (quality='min'): ไม่มีไฟพลวัต (เหลือแสงรอบทิศ), ไม่มีเงา/บลูม/ฝน/ฝุ่น/หิ่งห้อย, ซ่อนของตกแต่งชิ้นเล็กที่ไม่ชน, อนุภาคเหลือ 35%, ความละเอียด 50% */
function applyMinMode(){
  const mn=S.quality==='min';
  lights.forEach(l=>{ l.visible=!!l.isHemisphereLight||!mn; if(l.isHemisphereLight) l.intensity=l.userData.base*S.light*(mn?1.9:1); });
  try{ ppLights.forEach(l=>l.visible=!mn); flashLight.visible=!mn; }catch(e){}
  mapG.traverse(o=>{
    let hide=false;
    if(o.isPoints||o.isLineSegments) hide=true;
    else if(o.isMesh&&!o.userData.col&&!o.userData.keep){ const g=o.geometry; if(g){ if(!g.boundingSphere) g.computeBoundingSphere(); const sc=Math.max(o.scale.x,o.scale.y,o.scale.z); if(g.boundingSphere.radius*sc<0.7) hide=true; } }
    if(mn&&hide){ if(o.visible){ o.userData.minHid=true; o.visible=false; } }
    else if(o.userData.minHid){ o.visible=true; o.userData.minHid=false; }
  });
}
function buildMap(id){
  try{ setAcoustics(id); }catch(e){} /* AUDIO ประกาศหลังบรรทัดนี้ (TDZ) - initAudio จะตั้งค่าจาก curMap ให้ */
  clearMap(); curMap=id; const m=MAPS[id]; A=m.A; GRAV=m.grav||25; PSPD=m.pSpd||1; ESPD=m.eSpd||1;
  { const sc=moon.shadow.camera, R=m.shR||48; sc.left=-R; sc.right=R; sc.top=R; sc.bottom=-R; sc.far=m.shR?330:160; sc.updateProjectionMatrix(); }
  scene.background.set(m.bg); scene.fog.color.set(m.fogC);
  m.build(); refreshMapEnv(); applyEnemyGlow(); try{ applyMinMode(); }catch(e){}
}
function applyEnemyGlow(){   /* แมพสว่าง: คูณความเรืองแสงของศัตรู (MAPS[id].glow) ไม่เปลี่ยนสีประจำตัว */
  try{ const gm=MAPS[curMap].glow||1; for(const k in EGLOW) EGLOW[k].color.copy(hdr(ET[k].color,2.5*gm)); }catch(e){}
}
buildMap(selMap);

/* ================= PARTICLES ================= */
const PN=900, pPos=new Float32Array(PN*3).fill(-999), pCol=new Float32Array(PN*3), pVel=new Float32Array(PN*3), pBase=new Float32Array(PN*3), pLife=new Float32Array(PN), pMax=new Float32Array(PN), pGrav=new Float32Array(PN);
let pIdx=0;
const pGeo=new THREE.BufferGeometry();
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3)); pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
const particles=new THREE.Points(pGeo,new THREE.PointsMaterial({size:0.2,map:dotTex,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
particles.frustumCulled=false; scene.add(particles);
const _c=new THREE.Color();
function emit(pos,count,color,speed,life,grav=1,bright=2.5){
  if(S.quality==='min') count=(count*0.35+0.5)|0;
  _c.set(color);
  for(let i=0;i<count;i++){
    const k=pIdx; pIdx=(pIdx+1)%PN;
    pPos[k*3]=pos.x; pPos[k*3+1]=pos.y; pPos[k*3+2]=pos.z;
    const th=Math.random()*Math.PI*2, ph=Math.acos(rand(-1,1)), sp=speed*rand(0.3,1);
    pVel[k*3]=Math.sin(ph)*Math.cos(th)*sp; pVel[k*3+1]=Math.cos(ph)*sp+speed*0.3; pVel[k*3+2]=Math.sin(ph)*Math.sin(th)*sp;
    pBase[k*3]=_c.r*bright; pBase[k*3+1]=_c.g*bright; pBase[k*3+2]=_c.b*bright;
    pLife[k]=pMax[k]=life*rand(0.5,1); pGrav[k]=grav;
  }
}
function emitJet(pos,dir,n,color,speed,life,spread,bright=2.5){   /* อนุภาคพุ่งเป็นกรวยตามทิศ (พ่นไฟ/คลื่นเสียง) */
  _c.set(color);
  for(let i=0;i<n;i++){ const k=pIdx; pIdx=(pIdx+1)%PN; const sp=speed*rand(0.6,1);
    pPos[k*3]=pos.x+dir.x*0.05; pPos[k*3+1]=pos.y+dir.y*0.05; pPos[k*3+2]=pos.z+dir.z*0.05;
    pVel[k*3]=dir.x*sp+rand(-1,1)*sp*spread; pVel[k*3+1]=dir.y*sp+rand(-1,1)*sp*spread; pVel[k*3+2]=dir.z*sp+rand(-1,1)*sp*spread;
    pBase[k*3]=_c.r*bright; pBase[k*3+1]=_c.g*bright; pBase[k*3+2]=_c.b*bright; pLife[k]=pMax[k]=life*rand(0.75,1); pGrav[k]=-0.15; }
}
function emitIn(pos,tgt,color,life){   /* อนุภาคพุ่งเข้าหาจุดศูนย์กลาง (หลุมดำ) */
  _c.set(color); const k=pIdx; pIdx=(pIdx+1)%PN;
  pPos[k*3]=pos.x; pPos[k*3+1]=pos.y; pPos[k*3+2]=pos.z;
  const dx=tgt.x-pos.x, dy=tgt.y-pos.y, dz=tgt.z-pos.z, l=Math.hypot(dx,dy,dz)||1, sp=l/life;
  pVel[k*3]=dx/l*sp; pVel[k*3+1]=dy/l*sp; pVel[k*3+2]=dz/l*sp;
  pBase[k*3]=_c.r*2.5; pBase[k*3+1]=_c.g*2.5; pBase[k*3+2]=_c.b*2.5; pLife[k]=pMax[k]=life; pGrav[k]=0;
}
function updateParticles(dt){
  for(let k=0;k<PN;k++){
    if(pLife[k]<=0) continue;
    pLife[k]-=dt;
    if(pLife[k]<=0){ pPos[k*3+1]=-999; pCol[k*3]=pCol[k*3+1]=pCol[k*3+2]=0; continue; }
    pVel[k*3+1]-=9.8*pGrav[k]*dt;
    pPos[k*3]+=pVel[k*3]*dt; pPos[k*3+1]+=pVel[k*3+1]*dt; pPos[k*3+2]+=pVel[k*3+2]*dt;
    if(pPos[k*3+1]<0.03){ pPos[k*3+1]=0.03; pVel[k*3+1]*=-0.35; pVel[k*3]*=0.7; pVel[k*3+2]*=0.7; }
    const r=pLife[k]/pMax[k];
    pCol[k*3]=pBase[k*3]*r; pCol[k*3+1]=pBase[k*3+1]*r; pCol[k*3+2]=pBase[k*3+2]*r;
  }
  pGeo.attributes.position.needsUpdate=true; pGeo.attributes.color.needsUpdate=true;
}
// ring shockwaves
const ringGeo=new THREE.RingGeometry(0.85,1,48), fxRings=[];
function ringFX(pos,color,size,life=0.5){
  if(S.quality==='min') return;
  const m=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:hdr(color,2),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  m.position.copy(pos); scene.add(m); fxRings.push({m,life,max:life,size});
}
// tracers
const tracerGeo=new THREE.BoxGeometry(0.02,0.02,1); tracerGeo.translate(0,0,0.5);
const tracers=[];
for(let i=0;i<20;i++){ const m=new THREE.Mesh(tracerGeo,new THREE.MeshBasicMaterial({color:hdr(0xffe0a0,3),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); m.visible=false; scene.add(m); tracers.push({m,life:0,op:1}); }
let trIdx=0;
const TR_WARM=hdr(0xffe0a0,3), TR_ARC=hdr(0x7fe9ff,4);
function tracer(a,b,op=1,life=0.06,th=1,col=null){ const t=tracers[trIdx]; trIdx=(trIdx+1)%tracers.length; t.m.position.copy(a); t.m.lookAt(b); t.m.scale.set(th,th,a.distanceTo(b)); t.m.material.color.copy(col||TR_WARM); t.m.visible=true; t.life=life; t.mx=life; t.op=op; t.m.material.opacity=op; }

/* ================= GUN / WEAPONS ================= */
const gun=new THREE.Group(); camera.add(gun);
const gMat=new THREE.MeshStandardMaterial({color:0x2a2e3a,metalness:0.85,roughness:0.3,envMapIntensity:0.9});
const gMat2=new THREE.MeshStandardMaterial({color:0x111318,metalness:0.6,roughness:0.5,envMapIntensity:0.6});
const gWood=new THREE.MeshStandardMaterial({color:0x4a3326,metalness:0.15,roughness:0.75,envMapIntensity:0.4});
const gNeon=new THREE.MeshBasicMaterial({color:hdr(0x00e5ff,2.5)});
const gLens=new THREE.MeshBasicMaterial({color:hdr(0x66ccff,2.2)});
const gDot=new THREE.MeshBasicMaterial({color:hdr(0xff2bd6,4)});
const BX=(w,h,d)=>new THREE.BoxGeometry(w,h,d), CY=(r,l,s=12)=>new THREE.CylinderGeometry(r,r,l,s);
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
function newModel(){
  const g=new THREE.Group(); g.visible=false; gun.add(g);
  const add=(geo,mat,x,y,z,rx=0,into=g)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.rotation.x=rx; into.add(m); return m; };
  return [{g},add];
}
/* ความโปร่งใสของศูนย์เล็ง/ชิ้นส่วนที่บังตอนกดเล็ง (ADS) — ใช้วัสดุสำเนาเฉพาะชิ้น */
function fadeReg(o,k,...ms){ o.fade=o.fade||[]; o.fadeK=k; for(const m of ms){ m.material=m.material.clone(); m.material.transparent=true; o.fade.push(m); } }
function fadeSights(o,a){ if(o._fa===a) return; o._fa=a; const op=1-o.fadeK*a, vis=op>0.03; for(const m of o.fade){ m.material.opacity=op; m.visible=vis; } }
const GM={};
// ---- AR-77 (ปืนเดิม) ----
{ const [o,add]=newModel();
  add(BX(0.1,0.13,0.5),gMat,0,0,0);
  add(BX(0.085,0.09,0.25),gMat2,0,-0.01,-0.36);
  add(CY(0.018,0.22),gMat,0,0.005,-0.57,Math.PI/2);
  add(CY(0.03,0.07),gMat2,0,0.005,-0.68,Math.PI/2);
  add(BX(0.07,0.17,0.08),gMat2,0,-0.14,0.13,0.25);
  o.mag=add(BX(0.065,0.2,0.1),gMat,0,-0.15,-0.1,-0.15); o.magY=-0.15;
  add(BX(0.09,0.11,0.2),gMat2,0,-0.01,0.33);
  fadeReg(o,0.88,add(BX(0.06,0.05,0.12),gMat2,0,0.09,0.02),add(BX(0.012,0.012,0.004),gDot,0,0.09,-0.045));
  add(BX(0.102,0.012,0.42),gNeon,0,0.03,-0.02);
  add(BX(0.087,0.01,0.2),gNeon,0,-0.035,-0.36);
  o.mover=null; o.muzzle=[0,0.005,-0.74]; o.hip=V3(0.2,-0.2,-0.42); o.aim=V3(0,-0.092,-0.3); GM.ar=o; }
// ---- NX-9 ปืนพก ----
{ const [o,add]=newModel(), slide=new THREE.Group(); o.g.add(slide);
  add(BX(0.068,0.075,0.3),gMat,0,0.02,-0.12,0,slide);
  add(BX(0.072,0.008,0.2),gNeon,0,0.02,-0.12,0,slide);
  add(BX(0.012,0.016,0.012),gDot,0,0.068,-0.255,0,slide);
  add(BX(0.034,0.012,0.012),gMat2,0,0.063,0.015,0,slide);
  add(BX(0.06,0.04,0.28),gMat2,0,-0.03,-0.11);
  add(CY(0.014,0.07,10),gMat2,0,0.02,-0.3,Math.PI/2);
  add(BX(0.056,0.15,0.075),gMat2,0,-0.11,0.04,0.2);
  o.mag=add(BX(0.05,0.07,0.062),gMat,0,-0.195,0.055,0.2); o.magY=-0.195;
  o.mover=slide; o.moverBase=0; o.moverAmp=0.05; o.moverMode='kick';
  o.muzzle=[0,0.02,-0.34]; o.hip=V3(0.17,-0.17,-0.36); o.aim=V3(0,-0.068,-0.27); GM.pistol=o; }
// ---- VECTOR-X ปืนกลมือ ----
{ const [o,add]=newModel();
  add(BX(0.085,0.11,0.36),gMat2,0,0,-0.02);
  add(BX(0.09,0.06,0.4),gMat,0,0.04,-0.05);
  add(BX(0.075,0.075,0.2),gMat2,0,0,-0.3);
  add(CY(0.032,0.26),gMat2,0,0.005,-0.5,Math.PI/2);
  o.mag=add(BX(0.05,0.3,0.075),gMat,0,-0.2,-0.12,-0.05); o.magY=-0.2;
  add(BX(0.06,0.15,0.07),gMat2,0,-0.12,0.1,0.3);
  add(BX(0.05,0.1,0.05),gMat2,0,-0.08,-0.33);
  add(BX(0.04,0.06,0.2),gMat2,0,0,0.3);
  add(BX(0.06,0.1,0.04),gMat2,0,-0.01,0.42);
  fadeReg(o,0.88,add(BX(0.04,0.05,0.07),gMat2,0,0.095,-0.02),add(BX(0.012,0.012,0.004),gDot,0,0.1,-0.058));
  add(BX(0.092,0.01,0.3),gNeon,0,0.0,-0.02);
  add(BX(0.034,0.01,0.2),gNeon,0,0.005,-0.5);
  o.mover=null; o.muzzle=[0,0.005,-0.64]; o.hip=V3(0.2,-0.2,-0.4); o.aim=V3(0,-0.098,-0.28); GM.smg=o; }
// ---- BREAKER-12 ลูกซอง ----
{ const [o,add]=newModel(), pump=new THREE.Group(); o.g.add(pump); pump.position.z=-0.38;
  add(BX(0.09,0.12,0.3),gMat,0,0,0);
  add(CY(0.024,0.7),gMat,0,0.03,-0.5,Math.PI/2);
  add(CY(0.02,0.55),gMat2,0,-0.02,-0.42,Math.PI/2);
  add(BX(0.078,0.075,0.2),gWood,0,-0.02,0,0,pump);
  add(BX(0.082,0.012,0.12),gNeon,0,0.02,0,0,pump);
  add(BX(0.07,0.12,0.3),gWood,0,-0.03,0.32,0.1);
  add(BX(0.06,0.14,0.07),gMat2,0,-0.11,0.14,0.3);
  add(BX(0.02,0.01,0.5),gNeon,0,0.057,-0.45);
  add(BX(0.01,0.016,0.01),gDot,0,0.065,-0.84);
  o.mag=add(BX(0.06,0.04,0.1),gMat2,0,-0.08,0.02); o.magY=-0.08;
  o.mover=pump; o.moverBase=-0.38; o.moverAmp=0.14; o.moverMode='cycle';
  o.muzzle=[0,0.03,-0.88]; o.hip=V3(0.2,-0.19,-0.42); o.aim=V3(0,-0.068,-0.3); GM.shotgun=o; }
// ---- LONGBOW-X สไนเปอร์ ----
{ const [o,add]=newModel(), bolt=new THREE.Group(); o.g.add(bolt); bolt.position.z=0.05;
  add(BX(0.075,0.11,0.55),gMat2,0,0,0.05);
  add(CY(0.02,0.55),gMat,0,0.01,-0.5,Math.PI/2);
  add(CY(0.03,0.08),gMat2,0,0.01,-0.83,Math.PI/2);
  add(BX(0.07,0.14,0.32),gMat2,0,-0.02,0.42);
  add(BX(0.06,0.04,0.2),gMat2,0,0.07,0.4);
  o.mag=add(BX(0.06,0.12,0.09),gMat,0,-0.1,0.02); o.magY=-0.1;
  add(BX(0.06,0.14,0.07),gMat2,0,-0.1,0.2,0.3);
  add(CY(0.035,0.32),gMat,0,0.11,0,Math.PI/2);
  add(CY(0.046,0.07),gMat2,0,0.11,-0.19,Math.PI/2);
  add(CY(0.041,0.06),gMat2,0,0.11,0.17,Math.PI/2);
  add(CY(0.04,0.004),gLens,0,0.11,-0.228,Math.PI/2);
  add(BX(0.02,0.04,0.04),gMat2,0,0.075,-0.08);
  add(BX(0.02,0.04,0.04),gMat2,0,0.075,0.08);
  add(BX(0.077,0.01,0.4),gNeon,0,0.03,0.05);
  add(BX(0.1,0.014,0.014),gMat,0.06,0.02,0,0,bolt);
  add(new THREE.SphereGeometry(0.018,10,8),gMat2,0.115,0.02,0,0,bolt);
  o.mover=bolt; o.moverBase=0.05; o.moverAmp=0.1; o.moverMode='cycle';
  o.muzzle=[0,0.01,-0.88]; o.hip=V3(0.2,-0.21,-0.44); o.aim=V3(0,-0.12,-0.3); GM.sniper=o; }

/* ================= MELEE (อาวุธสั้น 5 ชนิด) ================= */
const mBlade=new THREE.MeshStandardMaterial({color:0xcfd8e8,metalness:0.95,roughness:0.15,envMapIntensity:1});
const mDark=new THREE.MeshStandardMaterial({color:0x15181f,metalness:0.7,roughness:0.45,envMapIntensity:0.6});
const mNeon=new THREE.MeshBasicMaterial({color:hdr(0xff2bd6,2.5)});
const MORDER=['katana','karambit','spatha','bat','butterfly'];
const MDEF={
  katana:{id:'katana',name:'KATANA-X',th:'คาตานะ',color:'#7fe9ff',desc:'ดาบยาว ระยะไกลพอสมควร ฟันเร็ว ดาเมจกลางค่อนสูง',dmg:55,cd:0.45,range:3.4,arc:1.15,kb:4,ui:[0.55,0.7,0.8,0.25]},
  karambit:{id:'karambit',name:'KARAMBIT',th:'คาลาบิด',color:'#ff7ad9',desc:'มีดงอ ฟันเป็นวงโค้งลง เร็วมาก ดาเมจต่อครั้งต่ำ',dmg:26,cd:0.22,range:2.2,arc:0.95,kb:2,ui:[0.3,0.95,0.45,0.15]},
  spatha:{id:'spatha',name:'SPATHA',th:'สปาต้า',color:'#ffd166',desc:'ดาบโรมัน ช้า หนัก แต่ดาเมจสูงมาก',dmg:85,cd:0.8,range:2.8,arc:1.0,kb:5,ui:[0.85,0.3,0.65,0.35]},
  bat:{id:'bat',name:'HOME-RUN BAT',th:'ไม้เบสบอล',color:'#ff8a00',desc:'ดาเมจสูง ผลักศัตรูกระเด็นไกลสุดๆ',dmg:70,cd:0.65,range:2.9,arc:1.2,kb:17,ui:[0.7,0.45,0.65,1]},
  butterfly:{id:'butterfly',name:'BUTTERFLY',th:'มีดผีเสื้อ',color:'#5dff7a',desc:'เร็วที่สุดในกลุ่ม ดาเมจต่ำ ท่าชักมีดหมุนสวย',dmg:20,cd:0.16,range:2.3,arc:0.9,kb:2,ui:[0.25,1,0.45,0.15]},
};
const MM={};
// ---- คาตานะ ----
{ const [o,add]=newModel();
  add(BX(0.014,0.05,0.85),mBlade,0,0.02,-0.55);
  add(BX(0.016,0.009,0.82),mNeon,0,-0.012,-0.55);
  add(BX(0.09,0.018,0.03),mDark,0,0,-0.11);
  add(CY(0.017,0.24,10),mDark,0,-0.01,0.03,Math.PI/2);
  add(BX(0.03,0.03,0.03),mNeon,0,-0.01,0.16);
  o.mag=null; o.mover=null; o.muzzle=[0,0,-0.5]; o.hip=V3(0.28,-0.3,-0.45); o.aim=V3(0.28,-0.3,-0.45); MM.katana=o; }
// ---- คาลาบิด ----
{ const [o,add]=newModel();
  add(new THREE.TorusGeometry(0.032,0.011,8,20),mDark,0,-0.02,0.05);
  const bl=add(new THREE.TorusGeometry(0.1,0.013,8,20,Math.PI*0.85),mBlade,0,0.05,-0.12);
  bl.rotation.set(Math.PI/2,0,Math.PI*0.6);
  add(BX(0.02,0.06,0.07),mDark,0,0,-0.02);
  add(BX(0.02,0.02,0.02),mNeon,0,0,-0.02);
  o.mag=null; o.mover=null; o.muzzle=[0,0,-0.3]; o.hip=V3(0.24,-0.26,-0.4); o.aim=V3(0.24,-0.26,-0.4); MM.karambit=o; }
// ---- สปาต้า ----
{ const [o,add]=newModel();
  add(BX(0.075,0.014,0.6),mBlade,0,0.01,-0.48);
  add(BX(0.04,0.016,0.12),mBlade,0,0.01,-0.83);
  add(BX(0.078,0.006,0.5),mNeon,0,0.02,-0.48);
  add(BX(0.15,0.03,0.045),mDark,0,0,-0.16);
  add(CY(0.02,0.2,10),mDark,0,-0.01,-0.03,Math.PI/2);
  add(new THREE.SphereGeometry(0.032,10,8),mDark,0,-0.01,0.08);
  o.mag=null; o.mover=null; o.muzzle=[0,0,-0.5]; o.hip=V3(0.27,-0.3,-0.45); o.aim=V3(0.27,-0.3,-0.45); MM.spatha=o; }
// ---- ไม้เบสบอล ----
{ const [o,add]=newModel();
  add(CY(0.024,0.45,10),gWood,0,0,-0.05,Math.PI/2);
  add(CY(0.045,0.4,10),gWood,0,0,-0.45,Math.PI/2);
  add(new THREE.TorusGeometry(0.052,0.008,8,20),mNeon,0,0,-0.6);
  add(CY(0.02,0.12,10),mDark,0,0,0.22,Math.PI/2);
  o.mag=null; o.mover=null; o.muzzle=[0,0,-0.6]; o.hip=V3(0.27,-0.28,-0.42); o.aim=V3(0.27,-0.28,-0.42); MM.bat=o; }
// ---- มีดผีเสื้อ ----
{ const [o,add]=newModel();
  add(BX(0.014,0.045,0.15),mDark,0.02,0,-0.02);
  add(BX(0.014,0.045,0.15),mDark,-0.02,0,-0.02);
  add(BX(0.01,0.04,0.24),mBlade,0,0.005,-0.24);
  add(BX(0.012,0.008,0.2),mNeon,0,0.03,-0.24);
  o.mag=null; o.mover=null; o.muzzle=[0,0,-0.4]; o.hip=V3(0.24,-0.27,-0.4); o.aim=V3(0.24,-0.27,-0.4); MM.butterfly=o; }

// ---- MAGNUM-R6 ปืนลูกโม่ ----
let spinT=0;
{ const [o,add]=newModel();
  add(BX(0.06,0.1,0.22),gMat,0,0,-0.02);
  o.mag=add(CY(0.041,0.1),gMat2,0,0.005,-0.13,Math.PI/2); o.magY=0.005;
  add(CY(0.022,0.32),gMat,0,0.03,-0.27,Math.PI/2);
  add(BX(0.03,0.025,0.3),gMat2,0,-0.01,-0.26);
  add(BX(0.052,0.14,0.07),gWood,0,-0.1,0.1,0.35);
  fadeReg(o,0.7,add(BX(0.012,0.018,0.02),gMat2,0,0.055,0.05),add(BX(0.006,0.009,0.006),gDot,0,0.0535,-0.42),add(BX(0.012,0.008,0.014),gMat2,0,0.052,0.03));
  add(BX(0.062,0.008,0.18),gNeon,0,0.052,-0.02);
  o.mover=null; o.muzzle=[0,0.03,-0.45]; o.hip=V3(0.18,-0.17,-0.38); o.aim=V3(0,-0.064,-0.28); GM.magnum=o; }
// ---- HAILSTORM มินิกัน (กลุ่มลำกล้องหมุนได้) ----
{ const [o,add]=newModel(), spin=new THREE.Group(); o.g.add(spin); spin.position.set(0,0.02,-0.42);
  for(let k=0;k<6;k++){ const a=k/6*Math.PI*2; add(CY(0.014,0.5),gMat,Math.cos(a)*0.04,Math.sin(a)*0.04,0,Math.PI/2,spin); }
  add(CY(0.058,0.03),gMat2,0,0,-0.24,Math.PI/2,spin);
  add(CY(0.058,0.03),gMat2,0,0,0.0,Math.PI/2,spin);
  add(BX(0.11,0.12,0.3),gMat2,0,0.0,-0.02);
  o.mag=add(BX(0.09,0.2,0.1),gMat,0,-0.13,-0.05); o.magY=-0.13;
  add(BX(0.05,0.14,0.06),gMat2,0,-0.12,0.1,0.3);
  add(BX(0.03,0.07,0.3),gMat2,0,0.1,-0.05);
  add(BX(0.115,0.01,0.28),gNeon,0,0.062,-0.1);
  add(BX(0.012,0.012,0.004),gDot,0,0.138,-0.2);
  o.spinG=spin; o.mover=null; o.muzzle=[0,0.02,-0.7]; o.hip=V3(0.22,-0.2,-0.42); o.aim=V3(0,-0.138,-0.3); GM.hailstorm=o; }
// ---- HAVOC เครื่องยิงจรวด ----
{ const [o,add]=newModel();
  add(CY(0.07,0.8,14),gMat2,0,0.03,-0.25,Math.PI/2);
  add(CY(0.085,0.12,14),gMat,0,0.03,-0.62,Math.PI/2);
  add(CY(0.082,0.1,14),gMat,0,0.03,0.18,Math.PI/2);
  add(BX(0.05,0.14,0.07),gMat2,0,-0.09,0.0,0.15);
  add(BX(0.05,0.14,0.07),gMat2,0,-0.09,-0.3);
  add(BX(0.05,0.05,0.2),gMat,0,0.12,-0.2);
  add(BX(0.055,0.04,0.09),gMat2,0,0.15,-0.22);
  add(BX(0.015,0.016,0.004),gDot,0,0.15,-0.27);
  add(BX(0.06,0.008,0.5),gNeon,0,0.101,-0.25);
  o.mag=add(BX(0.05,0.04,0.1),gMat,0,-0.05,0.1); o.magY=-0.05;
  o.mover=null; o.muzzle=[0,0.03,-0.7]; o.hip=V3(0.22,-0.2,-0.4); o.aim=V3(0,-0.15,-0.3); GM.havoc=o; }

const muzzle=new THREE.Object3D(); muzzle.position.set(0,0.005,-0.74); gun.add(muzzle);
const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTex,color:hdr(0xffc070,3),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
flash.scale.set(0.35,0.35,1); flash.visible=false; muzzle.add(flash);
const flashLight=new THREE.PointLight(0xffaa55,0,8,2); muzzle.add(flashLight);
gun.visible=false;
let curModel=GM.ar;
/* ================= REALISM PASS v1 : รายละเอียดปืน + วัสดุ + มือ + เอฟเฟกต์ยิง =================
 - ทุกอย่างสร้างจากกล่อง/ทรงกระบอก (ไม่ใช้โมเดลภายนอก) เผื่อทำโหมดปรับภาพในอนาคต
 - ปิดทั้งชุดได้ด้วย  REAL.on=false  (ซ่อนชิ้นส่วนเสริม/มือ/เอฟเฟกต์) - ปืนเดิมยังอยู่ครบ
 - ชิ้นส่วนเสริมถูกเก็บใน o.detail (Group) ต่อปืนแต่ละกระบอก  มือ: o.handR / o.handL                      */
const REAL={on:true,hands:true,casings:true,smoke:true,heatGlow:true};
const noiseTex=(w,h,fn,rx=1,ry=1,srgb=false)=>{ const t=canvasTex(w,h,fn,rx,ry); if(!srgb) t.colorSpace=THREE.NoColorSpace; return t; };
const brushedTex=noiseTex(128,128,(g,w,h)=>{ g.fillStyle='#bbb'; g.fillRect(0,0,w,h);
  for(let i=0;i<700;i++){ const v=150+Math.random()*100|0; g.fillStyle=`rgba(${v},${v},${v},${0.3+Math.random()*0.5})`; g.fillRect(Math.random()*w,Math.random()*h,10+Math.random()*60,1); } },1,1);
const grainTex=noiseTex(64,64,(g,w,h)=>{ g.fillStyle='#888'; g.fillRect(0,0,w,h);
  for(let i=0;i<900;i++){ const v=Math.random()*255|0; g.fillStyle=`rgb(${v},${v},${v})`; g.fillRect(Math.random()*w,Math.random()*h,2,2); } },2,2);
const stippleTex=noiseTex(64,64,(g,w,h)=>{ g.fillStyle='#777'; g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=4) for(let x=((y/4)%2)*2;x<w;x+=4){ g.fillStyle='#fff'; g.beginPath(); g.arc(x+1,y+1,1.2,0,7); g.fill(); } },3,3);
const fabricTex=noiseTex(64,64,(g,w,h)=>{ g.fillStyle='#888'; g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=3){ g.fillStyle='#bbb'; g.fillRect(0,y,w,1); } for(let x=0;x<w;x+=3){ g.fillStyle='#666'; g.fillRect(x,0,1,h); } },3,3);
const woodTex=canvasTex(128,128,(g,w,h)=>{ g.fillStyle='#4a3326'; g.fillRect(0,0,w,h);
  for(let i=0;i<70;i++){ g.strokeStyle=`rgba(${20+Math.random()*30|0},${10+Math.random()*20|0},5,${0.15+Math.random()*0.3})`; g.lineWidth=0.6+Math.random()*1.6;
    g.beginPath(); const y=Math.random()*h; g.moveTo(0,y); g.bezierCurveTo(w*0.3,y+rand(-6,6),w*0.6,y+rand(-6,6),w,y+rand(-5,5)); g.stroke(); } },1,1);
gMat.roughnessMap=brushedTex; gMat.bumpMap=brushedTex; gMat.bumpScale=0.5; gMat.needsUpdate=true;
gMat2.bumpMap=grainTex; gMat2.bumpScale=0.8; gMat2.needsUpdate=true;
gWood.map=woodTex; gWood.color.set(0xffffff); gWood.needsUpdate=true;
const gDark=new THREE.MeshStandardMaterial({color:0x050608,metalness:0.3,roughness:0.85});
const gSteel=new THREE.MeshStandardMaterial({color:0x8a919e,metalness:0.92,roughness:0.28,envMapIntensity:1,roughnessMap:brushedTex});
const gRubber=new THREE.MeshStandardMaterial({color:0x17181c,metalness:0.05,roughness:0.95,bumpMap:stippleTex,bumpScale:1.2});
const gBrass=new THREE.MeshStandardMaterial({color:0xd2a94c,metalness:1,roughness:0.28,envMapIntensity:1.2});
const gShell=new THREE.MeshStandardMaterial({color:0xc8301f,metalness:0.1,roughness:0.6});
const gGlove=new THREE.MeshStandardMaterial({color:0x1b1e25,metalness:0.05,roughness:0.9,bumpMap:fabricTex,bumpScale:0.8});
const gGlove2=new THREE.MeshStandardMaterial({color:0x2d323d,metalness:0.1,roughness:0.8,bumpMap:fabricTex,bumpScale:0.8});
const gSkinT=new THREE.MeshStandardMaterial({color:0xb48565,metalness:0,roughness:0.65});
const gSleeve=new THREE.MeshStandardMaterial({color:0x232830,metalness:0.05,roughness:0.95,bumpMap:fabricTex,bumpScale:1});
const gOrange=new THREE.MeshStandardMaterial({color:0xb8501f,metalness:0.4,roughness:0.5});
const RB=(w,h,d,r=0.004)=>new RoundedBoxGeometry(w,h,d,2,Math.max(0.0004,Math.min(r,w/2-0.0004,h/2-0.0004,d/2-0.0004)));
const PI2=Math.PI/2;
const _tmpV=new THREE.Vector3(), _tmpV2=new THREE.Vector3(), _tmpQ=new THREE.Quaternion(), _Z=new THREE.Vector3(0,0,1);

/* ---------- ตัวช่วยสร้างชิ้นส่วนเสริมของปืน ---------- */
function mkDetail(o){
  const det=new THREE.Group(); det.name='detail'; o.g.add(det); o.detail=det;
  const add=(geo,mat,x,y,z,rx=0,into=det,ry=0,rz=0)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); into.add(m); return m; };
  return add;
}
const rails=(add,y,z0,z1,w=0.03,into)=>{ for(let z=z0;z>=z1;z-=0.02) add(RB(w,0.006,0.008,0.001),gSteel,0,y,z,0,into); };
const guard=(add,y,zf,zr,into)=>{ add(RB(0.01,0.04,0.012,0.003),gMat2,0,y,zf,0,into); add(RB(0.012,0.01,zr-zf+0.012,0.003),gMat2,0,y-0.02,(zf+zr)/2,0,into); };
const trigger=(add,y,z,into)=>add(RB(0.008,0.028,0.01,0.002),gSteel,0,y,z,0.3,into);
const gripPanels=(add,x,y,z,h,d,rx,into)=>{ add(RB(0.005,h,d,0.002),gRubber,x,y,z,rx,into); add(RB(0.005,h,d,0.002),gRubber,-x,y,z,rx,into); };
const ribs=(add,mag,n,w,d,y0,dy)=>{ for(let i=0;i<n;i++) add(BX(w,0.004,d),gMat2,0,y0+i*dy,0,0,mag); };
const grooves=(add,z,y,r,n,dz,len=0.004)=>{ for(let i=0;i<n;i++) add(CY(r,len,14),gDark,0,y,z-i*dz,PI2); };
const heatSleeve=(o,add,r,len,x,y,z)=>{ const m=new THREE.MeshBasicMaterial({color:0xff5a1a,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
  const mesh=add(CY(r,len,16),m,x,y,z,PI2); o.heatMat=m; return mesh; };

/* ---------- มือ (ถุงมือยุทธวิธี) : แบบจับด้ามจับ (grip) และแบบประคอง (cradle) ---------- */
function makeHand(kind,gw,gd,sleeveDir){
  // kind='grip' : พันรอบด้ามตั้ง (แกน y)  |  kind='cradle' : ประคองใต้ลำปืน (หมุน 90° รอบ x)
  const root=new THREE.Group(), h=new THREE.Group(); root.add(h);
  const M=(geo,mat,x,y,z,rx=0,ry=0,rz=0)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.rotation.set(rx,ry,rz); h.add(m); return m; };
  M(RB(gw+0.025,0.11,0.034,0.012),gGlove,0,0,gd/2+0.016);                    // ฝ่ามือด้านหลังด้าม
  M(RB(0.03,0.11,0.02,0.006),gGlove2,gw/2+0.014,0,gd/2+0.002);                // สันมือ
  for(let i=0;i<4;i++){ const y=0.048-i*0.0325, L=1-(i===3?0.18:0)-(i===0?0.04:0);
    M(RB(0.024,0.028,gd*L+0.022,0.009),gGlove,gw/2+0.012,y,0);                // ท่อนโคนนิ้ว ขนานด้านขวา
    M(RB(gw+0.032,0.028,0.024,0.009),gGlove,0,y,-(gd/2+0.012));               // ข้อกลางพาดด้านหน้า
    M(RB(0.026,0.024,0.024,0.008),gSkinT,-(gw/2+0.006),y,-(gd/2+0.001));      // ปลายนิ้ว (ถุงมือตัดครึ่งนิ้ว)
    M(RB(0.006,0.01,0.01,0.002),gGlove2,gw/2+0.025,y+0.004,-gd*0.15);         // ปุ่มข้อนิ้ว/ตะเข็บ
  }
  M(RB(0.026,0.026,0.085,0.01),gGlove,-(gw/2+0.015),0.058,-0.0,0.0,0.18,0);   // นิ้วโป้ง ชี้ไปข้างหน้า
  M(RB(0.022,0.022,0.03,0.008),gSkinT,-(gw/2+0.022),0.058,-0.058,0,0.18,0);   // ปลายนิ้วโป้ง
  // แขนเสื้อ + ขอบสีนีออน
  const d=sleeveDir.clone().normalize(), q=new THREE.Quaternion().setFromUnitVectors(_Z,d);
  const sl=new THREE.Mesh(RB(0.07,0.07,0.4,0.018),gSleeve); sl.position.copy(d).multiplyScalar(0.24); sl.position.z+=gd/2; sl.quaternion.copy(q); root.add(sl);
  const cuff=new THREE.Mesh(RB(0.078,0.078,0.03,0.012),gGlove2); cuff.position.copy(d).multiplyScalar(0.05); cuff.position.z+=gd/2; cuff.quaternion.copy(q); root.add(cuff);
  const trim=new THREE.Mesh(BX(0.08,0.08,0.006),gNeon); trim.position.copy(d).multiplyScalar(0.068); trim.position.z+=gd/2; trim.quaternion.copy(q); root.add(trim);
  if(kind==='cradle') h.rotation.x=PI2;
  root.userData.h=h;
  return root;
}

/* ---------- รายละเอียดรายกระบอก ---------- */
// ---- AR-77 ----
{ const o=GM.ar, add=mkDetail(o);
  for(let i=0;i<5;i++){ const z=-0.29-i*0.035; add(BX(0.002,0.03,0.016),gDark,0.0432,-0.01,z); add(BX(0.002,0.03,0.016),gDark,-0.0432,-0.01,z); }
  add(BX(0.03,0.03,0.03),gSteel,0,0.012,-0.62); add(CY(0.006,0.14,10),gSteel,0,0.045,-0.57,PI2);
  add(RB(0.012,0.07,0.012,0.002),gSteel,0,0.055,-0.645); add(RB(0.003,0.03,0.006,0.001),gSteel,0.01,0.05,-0.645); add(RB(0.003,0.03,0.006,0.001),gSteel,-0.01,0.05,-0.645);
  add(RB(0.026,0.005,0.46,0.001),gMat2,0,0.0675,0); rails(add,0.0705,-0.23,-0.05); rails(add,0.0705,0.1,0.23);
  add(BX(0.002,0.035,0.09),gDark,0.0505,0.025,-0.02); add(BX(0.003,0.012,0.03),gSteel,0.0515,0.03,0.035);
  add(RB(0.05,0.012,0.04,0.003),gSteel,0,0.077,0.2); add(RB(0.03,0.02,0.025,0.003),gSteel,0,0.07,0.24);
  guard(add,-0.09,-0.01,0.08); trigger(add,-0.085,0.025);
  gripPanels(add,0.036,-0.14,0.13,0.15,0.065,0.25);
  add(RB(0.094,0.115,0.02,0.006),gRubber,0,-0.01,0.44); add(RB(0.07,0.02,0.14,0.004),gMat2,0,0.056,0.33);
  ribs(add,o.mag,5,0.067,0.102,-0.08,0.04); add(RB(0.07,0.01,0.108,0.003),gMat2,0,-0.102,0,0,o.mag); add(BX(0.05,0.012,0.07),gBrass,0,0.103,0,0,o.mag);
  grooves(add,-0.665,0.005,0.0305,3,0.015); heatSleeve(o,add,0.0195,0.2,0,0.005,-0.57);
  o.eject=[0.06,0.03,-0.02]; o.ejDir=1; o.casing='rif';
  o.handR=makeHand('grip',0.07,0.08,V3(0.7,-0.75,1)); o.handR.position.set(0,-0.14,0.13); o.handR.rotation.x=0.25; o.g.add(o.handR);
  o.handL=makeHand('cradle',0.085,0.09,V3(-0.55,-0.7,1)); o.handL.position.set(0.0,-0.045,-0.36); o.g.add(o.handL); o.handLBase=o.handL.position.clone(); }
// ---- NX-9 ----
{ const o=GM.pistol, add=mkDetail(o), slide=o.mover;
  for(let i=0;i<5;i++){ const z=0.0+i*0.007-0.0; add(BX(0.002,0.05,0.0035),gDark,0.0345,0.02,z-0.005,0,slide); add(BX(0.002,0.05,0.0035),gDark,-0.0345,0.02,z-0.005,0,slide); }
  for(let i=0;i<3;i++){ const z=-0.2+i*0.007; add(BX(0.002,0.05,0.0035),gDark,0.0345,0.02,z,0,slide); add(BX(0.002,0.05,0.0035),gDark,-0.0345,0.02,z,0,slide); }
  add(BX(0.002,0.025,0.05),gDark,0.0345,0.04,-0.1,0,slide); add(RB(0.01,0.012,0.012,0.002),gMat2,0.012,0.067,0.02,0,slide); add(RB(0.01,0.012,0.012,0.002),gMat2,-0.012,0.067,0.02,0,slide);
  add(RB(0.008,0.016,0.008,0.002),gSteel,0,0.066,-0.265,0,slide);
  add(RB(0.012,0.02,0.012,0.003),gSteel,0,0.045,0.04);
  guard(add,-0.067,-0.02,0.04); trigger(add,-0.055,0.005);
  gripPanels(add,0.029,-0.11,0.04,0.12,0.06,0.2); rails(add,-0.052,-0.17,-0.05,0.032);
  add(RB(0.054,0.008,0.066,0.002),gMat2,0,-0.237,0.055,0.2); heatSleeve(o,add,0.0145,0.07,0,0.02,-0.3);
  o.eject=[0.04,0.035,-0.1]; o.ejDir=1; o.casing='pst';
  o.handR=makeHand('grip',0.056,0.075,V3(0.7,-0.7,1)); o.handR.position.set(0,-0.11,0.04); o.handR.rotation.x=0.2; o.g.add(o.handR);
  o.handL=makeHand('cradle',0.06,0.06,V3(-0.6,-0.6,1)); o.handL.position.set(-0.2,-0.3,0.25); o.g.add(o.handL); o.handLBase=o.handL.position.clone(); o.handLHide=true; }
// ---- VECTOR-X ----
{ const o=GM.smg, add=mkDetail(o);
  for(let i=0;i<4;i++){ add(CY(0.034,0.006,16),gMat2,0,0.005,-0.42-i*0.06,PI2); }
  add(CY(0.02,0.004,14),gDark,0,0.005,-0.633,PI2);
  for(let i=0;i<4;i++){ const z=-0.24-i*0.035; add(BX(0.002,0.02,0.02),gDark,0.0378,0,z); add(BX(0.002,0.02,0.02),gDark,-0.0378,0,z); }
  add(RB(0.012,0.012,0.05,0.003),gSteel,-0.055,0.045,0.0); add(RB(0.018,0.018,0.018,0.004),gSteel,-0.055,0.045,0.03);
  add(BX(0.002,0.03,0.07),gDark,0.0455,0.045,-0.03);
  rails(add,0.073,-0.24,-0.09); rails(add,0.073,0.02,0.14);
  guard(add,-0.075,-0.04,0.07); trigger(add,-0.075,0.02);
  gripPanels(add,0.031,-0.12,0.1,0.1,0.06,0.3); gripPanels(add,0.0265,-0.08,-0.33,0.07,0.04,0);
  add(RB(0.062,0.102,0.012,0.004),gRubber,0,0.0,0.445);
  ribs(add,o.mag,6,0.052,0.077,-0.1,0.04); add(RB(0.056,0.01,0.082,0.003),gMat2,0,-0.152,0,0,o.mag);
  heatSleeve(o,add,0.0345,0.26,0,0.005,-0.5);
  o.eject=[0.05,0.045,-0.03]; o.ejDir=1; o.casing='pst';
  o.handR=makeHand('grip',0.06,0.07,V3(0.7,-0.75,1)); o.handR.position.set(0,-0.12,0.1); o.handR.rotation.x=0.3; o.g.add(o.handR);
  o.handL=makeHand('grip',0.05,0.05,V3(-0.5,-0.8,1)); o.handL.position.set(0,-0.08,-0.33); o.g.add(o.handL); o.handLBase=o.handL.position.clone(); }
// ---- BREAKER-12 ----
{ const o=GM.shotgun, add=mkDetail(o), pump=o.mover;
  for(let i=0;i<5;i++) add(RB(0.082,0.079,0.006,0.002),gMat2,0,-0.02,-0.07+i*0.03,0,pump);
  add(CY(0.026,0.03),gSteel,0,-0.02,-0.7,PI2); add(RB(0.05,0.075,0.03,0.004),gMat2,0,0.005,-0.7);
  add(CY(0.027,0.025),gSteel,0,0.03,-0.84,PI2); add(BX(0.002,0.04,0.1),gDark,0.0455,0.015,0.0);
  add(RB(0.03,0.016,0.05,0.004),gSteel,0,0.065,0.1);
  guard(add,-0.095,0.01,0.1); trigger(add,-0.085,0.055);
  gripPanels(add,0.031,-0.11,0.14,0.12,0.06,0.3);
  add(RB(0.074,0.124,0.02,0.006),gRubber,0,-0.034,0.475,0.1);
  heatSleeve(o,add,0.0255,0.5,0,0.03,-0.5);
  o.eject=[0.05,0.015,0.0]; o.ejDir=1; o.casing='shell'; o.ejDelay=0.24;
  o.handR=makeHand('grip',0.06,0.07,V3(0.7,-0.75,1)); o.handR.position.set(0,-0.11,0.14); o.handR.rotation.x=0.3; o.g.add(o.handR);
  o.handL=makeHand('cradle',0.078,0.075,V3(-0.55,-0.7,1)); o.handL.position.set(0,-0.055,-0.38); o.g.add(o.handL); o.handLBase=o.handL.position.clone(); o.handLFollow=pump; o.handLFollowBase=-0.38; }
// ---- LONGBOW-X ----
{ const o=GM.sniper, add=mkDetail(o);
  for(let i=0;i<3;i++) add(BX(0.064,0.01,0.012),gDark,0,0.01,-0.815-i*0.016);
  add(CY(0.012,0.025),gMat2,0,0.155,0.0); add(CY(0.012,0.02),gMat2,0.05,0.11,0.0,0,det_(o),0,PI2);
  add(CY(0.0375,0.012,18),gSteel,0,0.11,0.08,PI2); add(CY(0.0375,0.012,18),gSteel,0,0.11,-0.08,PI2);
  rails(add,0.058,-0.2,0.3,0.03); add(BX(0.002,0.03,0.08),gDark,0.0385,0.02,0.0);
  guard(add,-0.085,0.12,0.2); trigger(add,-0.075,0.15);
  gripPanels(add,0.036,-0.1,0.2,0.12,0.06,0.3);
  add(RB(0.074,0.144,0.02,0.006),gRubber,0,-0.02,0.585);
  heatSleeve(o,add,0.0215,0.4,0,0.01,-0.55);
  o.eject=[0.045,0.02,0.0]; o.ejDir=1; o.casing='rif'; o.ejDelay=0.32;
  o.handR=makeHand('grip',0.07,0.08,V3(0.7,-0.75,1)); o.handR.position.set(0,-0.1,0.2); o.handR.rotation.x=0.3; o.g.add(o.handR);
  o.handL=makeHand('cradle',0.075,0.11,V3(-0.55,-0.7,1)); o.handL.position.set(0,-0.04,-0.12); o.g.add(o.handL); o.handLBase=o.handL.position.clone(); }
function det_(o){ return o.detail; }
// ---- MAGNUM-R6 ----
{ const o=GM.magnum, add=mkDetail(o);
  for(let k=0;k<6;k++){ const a=k/6*Math.PI*2+Math.PI/6; add(BX(0.008,0.07,0.006),gDark,Math.cos(a)*0.041,0,Math.sin(a)*0.041,0,o.mag); }
  add(BX(0.012,0.008,0.3),gMat,0,0.056,-0.27); add(CY(0.007,0.12,10),gSteel,0,-0.03,-0.2,PI2); add(CY(0.0235,0.008,16),gSteel,0,0.03,-0.43,PI2);
  guard(add,-0.07,-0.01,0.05); trigger(add,-0.055,0.03);
  add(RB(0.012,0.02,0.014,0.003),gSteel,0,0.07,0.06,0.3);
  heatSleeve(o,add,0.0235,0.3,0,0.03,-0.27);
  o.eject=null; o.casing=null;
  o.handR=makeHand('grip',0.052,0.07,V3(0.7,-0.7,1)); o.handR.position.set(0,-0.1,0.1); o.handR.rotation.x=0.35; o.g.add(o.handR);
  o.handL=makeHand('cradle',0.06,0.06,V3(-0.6,-0.6,1)); o.handL.position.set(-0.2,-0.3,0.2); o.g.add(o.handL); o.handLBase=o.handL.position.clone(); o.handLHide=true; }
// ---- HAILSTORM ----
GM.hailstorm.g.scale.setScalar(1.12);   /* ขยายตัวปืนให้ใหญ่ขึ้นเล็กน้อย */
{ const o=GM.hailstorm, add=mkDetail(o), sp=o.spinG;
  add(CY(0.02,0.5),gMat2,0,0,0,PI2,sp); for(let k=0;k<6;k++){ const a=k/6*Math.PI*2; add(CY(0.009,0.004,10),gDark,Math.cos(a)*0.04,Math.sin(a)*0.04,-0.252,PI2,sp); }
  add(CY(0.07,0.06),gMat2,0,0.02,-0.2,PI2);
  for(let i=0;i<7;i++) add(RB(0.02,0.014,0.05,0.003),i%2?gBrass:gSteel,-0.065+Math.sin(i*0.5)*0.01,-0.02-i*0.018,-0.05);
  for(let i=0;i<3;i++) add(BX(0.004,0.17,0.012),gMat2,0.047,0,-0.03+i*0.03,0,o.mag);
  guard(add,-0.1,-0.01,0.12); trigger(add,-0.095,0.04);
  gripPanels(add,0.027,-0.12,0.1,0.12,0.05,0.3);
  o.eject=[0.06,0.0,-0.02]; o.ejDir=1; o.casing='rif';
  o.handR=makeHand('grip',0.05,0.06,V3(0.7,-0.75,1)); o.handR.position.set(0,-0.12,0.1); o.handR.rotation.x=0.3; o.g.add(o.handR);
  o.handL=makeHand('cradle',0.11,0.06,V3(-0.55,-0.7,1)); o.handL.position.set(0,-0.07,-0.2); o.g.add(o.handL); o.handLBase=o.handL.position.clone(); }
// ---- HAVOC ----
{ const o=GM.havoc, add=mkDetail(o);
  add(CY(0.06,0.01,16),gDark,0,0.03,0.236,PI2); add(CY(0.088,0.02,16),gSteel,0,0.03,0.24,PI2);
  add(CY(0.06,0.004,16),gDark,0,0.03,-0.683,PI2); const cone=add(new THREE.ConeGeometry(0.05,0.1,14),gOrange,0,0.03,-0.66,-PI2);
  add(CY(0.074,0.012,16),gMat,0,0.03,-0.4,PI2); add(CY(0.074,0.012,16),gMat,0,0.03,-0.1,PI2);
  rails(add,0.107,-0.4,-0.3,0.03); rails(add,0.107,-0.1,0.0,0.03);
  gripPanels(add,0.027,-0.09,0.0,0.12,0.05,0.15); gripPanels(add,0.027,-0.09,-0.3,0.12,0.05,0);
  o.eject=null; o.casing=null;
  o.handR=makeHand('grip',0.05,0.07,V3(0.7,-0.75,1)); o.handR.position.set(0,-0.09,0.0); o.handR.rotation.x=0.15; o.g.add(o.handR);
  o.handL=makeHand('grip',0.05,0.07,V3(-0.5,-0.8,1)); o.handL.position.set(0,-0.09,-0.3); o.g.add(o.handL); o.handLBase=o.handL.position.clone(); }

/* ================= buildGunModel: ตัวสร้างโมเดลปืนแบบ parametric (รอบ 3A) =================
   spec: rec[w,h,l] ตัวรับกระสุน, rm (1|2 สีหลัก), mover(slide|bolt|pump|lever|barrelspin), slideH,
   bl/br ลำกล้อง, hg[w,h,l] แฮนด์การ์ด, muzzle(bare|brake|suppressor|flashhider|choke), supL,
   stock(none|fixed|folding|skeleton), grip[w,h,d] + gz, fg[w,h,d,z] กริปหน้า,
   mag{t:straight|curved|drum|box|tube|cyl, s:[..], mz, my, rx},
   sight(iron|reddot|scope2x|scope4x|scope8x|thermal) + sz, neon, dual, hip, aim, aimZ, mmode, mvA
   คืนค่ารูปแบบเดียวกับ GM เดิม + icon (SVG อัตโนมัติ) + dual/muzzles (กรณีปืนคู่) */
const GC={};
const gB=(w,h,d)=>{ const k='b'+w+'|'+h+'|'+d; return GC[k]||(GC[k]=new THREE.BoxGeometry(w,h,d)); };
const gC=(r,l,s=12)=>{ const k='c'+r+'|'+l+'|'+s; return GC[k]||(GC[k]=new THREE.CylinderGeometry(r,r,l,s)); };
function iconFromSil(sil){
  let mn=1e9,mx=-1e9,top=-1e9,bot=1e9;
  sil.forEach(([z,y,l,h])=>{ mn=Math.min(mn,z-l/2); mx=Math.max(mx,z+l/2); top=Math.max(top,y+h/2); bot=Math.min(bot,y-h/2); });
  const len=Math.max(0.01,mx-mn), hh=Math.max(0.01,top-bot), k=Math.min(108/len,34/hh), cx=(mn+mx)/2, cy=(top+bot)/2;
  return sil.map(([z,y,l,h])=>{ const w=Math.max(2,l*k), ht=Math.max(2,h*k), x=60+(cx-z-l/2)*k, yy=20-(y+h/2-cy)*k;
    return '<rect x="'+x.toFixed(1)+'" y="'+yy.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+ht.toFixed(1)+'" rx="1.5"/>'; }).join('');
}
function buildGunModel(sp){
  const root=new THREE.Group(); root.visible=false; gun.add(root);
  const o={g:root,mag:null,magY:0,mover:null,moverBase:0,moverAmp:0.05,moverMode:'kick',spec:sp,sil:[],muzzle:null};
  const offs=sp.dual?[-0.14,0.14]:[0], parts=[];
  offs.forEach((ox,bi)=>{
    const body=new THREE.Group(); body.position.x=ox; root.add(body);
    const sil=bi===0?o.sil:[];
    const bx=(w,h,d,m,x,y,z,rx=0,into=body)=>{ const me=new THREE.Mesh(gB(w,h,d),m); me.position.set(x,y,z); if(rx) me.rotation.x=rx; into.add(me); sil.push([z+into.position.z,y+into.position.y,d,h]); return me; };
    const cy=(r,l,m,x,y,z,into=body,s=12)=>{ const me=new THREE.Mesh(gC(r,l,s),m); me.rotation.x=Math.PI/2; me.position.set(x,y,z); into.add(me); sil.push([z+into.position.z,y+into.position.y,l,r*2]); return me; };
    const [rw,rh,rl]=sp.rec, front=-rl/2, rear=rl/2, topY=rh/2, rm=sp.rm===2?gMat2:gMat, rm2=sp.rm===2?gMat:gMat2;
    bx(rw,rh,rl,rm,0,0,0);
    let by=sp.by??rh*0.25, tip=front, sightTop=topY, mv=null; const fadeL=[];
    // ตัวเลื่อน (สไลด์ / ลูกเลื่อน / ปั๊ม)
    if(sp.mover==='slide'){
      const sh=sp.slideH||0.07, cyc=topY+sh/2-0.012; mv=new THREE.Group(); body.add(mv); by=sp.by??cyc;
      bx(rw+0.008,sh,rl+0.02,gMat,0,cyc,-0.01,0,mv);
      if(sp.neon) bx(rw+0.012,0.008,rl*0.6,gNeon,0,cyc,-0.02,0,mv);
      bx(rw*0.5,0.012,0.04,gMat2,0,cyc+sh/2,rear-0.02,0,mv);
      sightTop=cyc+sh/2; tip=front-0.02;
    }
    // ลำกล้อง + แฮนด์การ์ด
    const bl=sp.bl??0.1, br=sp.br??0.018, nB=body.children.length;
    if(bl>0){ if(sp.twin){ cy(br,bl,gMat,-br*1.05,by,front-bl/2+0.03); cy(br,bl,gMat,br*1.05,by,front-bl/2+0.03); } else cy(br,bl,gMat,0,by,front-bl/2+0.03); tip=Math.min(tip,front-bl+0.03); if(sp.fadeBarrel) fadeL.push(...body.children.slice(nB)); }
    if(sp.hg){ const [hw,hh2,hl]=sp.hg; bx(hw,hh2,hl,rm2,0,by-0.005,front-hl/2+0.04);
      if(sp.neon) bx(hw+0.004,0.008,hl*0.7,gNeon,0,by+hh2/2-0.012,front-hl/2+0.04); tip=Math.min(tip,front-hl+0.04); }
    if(sp.crystal){ bx(0.02,0.05,0.24,gLens,0,by+0.04,front-0.14); bx(0.014,0.034,0.16,gLens,0,by+0.055,front-0.32); bx(0.01,0.02,0.1,gLens,0,by+0.065,front-0.46); }
    const tip0=tip;
    // ปากกระบอก
    const mz=sp.muzzle||'bare'; let dev=0;
    if(mz==='suppressor'){ dev=sp.supL||0.2; cy(br*2.4,dev,gMat2,0,by,tip-dev/2+0.02); if(sp.neon) cy(br*2.5,0.01,gNeon,0,by,tip-dev*0.3); }
    else if(mz==='brake'){ dev=0.05; cy(br*1.7,dev,gMat2,0,by,tip-dev/2+0.01); bx(br*4.2,br*0.6,0.018,gMat,0,by,tip-0.025); }
    else if(mz==='flashhider'){ dev=0.06; cy(br*1.5,dev,gMat2,0,by,tip-dev/2+0.01); bx(br*0.5,br*3.2,0.04,gMat2,0,by,tip-0.03); }
    else if(mz==='choke'){ dev=0.05; cy(br*1.6,dev,gMat2,0,by,tip-dev/2+0.01); }
    tip-=dev;
    // พานท้าย
    const st=sp.stock||'none';
    if(st==='fixed') bx(rw*0.9,rh*1.15,0.26,rm2,0,-0.015,rear+0.12,0.08);
    else if(st==='folding'){ bx(0.012,0.012,0.2,gMat2,rw*0.3,-0.01,rear+0.1); bx(0.012,0.012,0.2,gMat2,-rw*0.3,-0.01,rear+0.1); bx(rw*0.9,rh*1.1,0.025,gMat2,0,-0.01,rear+0.21); }
    else if(st==='skeleton'){ bx(0.014,0.014,0.26,gMat2,0,rh*0.25,rear+0.13); bx(0.014,0.014,0.26,gMat2,0,-rh*0.3,rear+0.13); bx(rw*0.9,rh*1.4,0.03,gMat2,0,-0.01,rear+0.26); }
    // กริป
    if(sp.grip){ const [gw,gh,gd]=sp.grip; bx(gw,gh,gd,gMat2,0,-rh/2-gh/2+0.02,rear-gd/2-(sp.gz??0.03),0.25); }
    if(sp.fg){ const [fw,fh,fd,fz]=sp.fg; bx(fw,fh,fd,gMat2,0,-rh/2-fh/2+0.01,fz,-0.1); }
    // ซองกระสุน
    let magMesh=null, magY=0;
    if(sp.mag){ const mg=sp.mag, [w,h,d]=mg.s, t=mg.t, mzz=mg.mz??0;
      if(t==='drum'){ const my=mg.my??(-rh/2-w+0.015); magMesh=new THREE.Mesh(gC(w,h,18),gMat); magMesh.rotation.z=Math.PI/2; magMesh.position.set(0,my,mzz); body.add(magMesh); sil.push([mzz,my,w*2,w*2]); }
      else if(t==='tube') magMesh=cy(0.016,d,gMat2,0,by-0.045,mzz,body,10);
      else if(t==='cyl') magMesh=cy(w,d,gMat2,0,0.005,mzz,body,16);
      else magMesh=bx(w,h,d,gMat,0,mg.my??(-rh/2-h/2+0.02),mzz,mg.rx??(t==='curved'?-0.3:0.1));
      magY=magMesh.position.y; }
    // ศูนย์เล็ง
    const sg=sp.sight||'iron', sz=sp.sz??0, nS=body.children.length; let dotY=sightTop+0.016;
    if(sg==='off'){}
    else if(sg==='iron'){ const rsH=sp.rsH??0.02; bx(0.012,rsH,0.012,gMat2,0,sightTop+rsH/2,rear-0.05); bx(0.01,0.018,0.01,gMat2,0,sightTop+0.009,sp.fz??(tip0+0.02)); bx(0.008,0.008,0.004,gDot,0,sightTop+0.0155,(sp.fz??(tip0+0.02))-0.006); }
    else if(sg==='reddot'){ bx(0.05,0.04,0.075,gMat2,0,sightTop+0.02,sz); bx(0.012,0.012,0.004,gDot,0,sightTop+0.03,sz-0.04); dotY=sightTop+0.03; }
    else if(sg==='thermal'){ bx(0.06,0.07,0.16,gMat2,0,sightTop+0.045,sz); bx(0.05,0.05,0.004,gLens,0,sightTop+0.045,sz-0.082); dotY=sightTop+0.045; }
    else { const n=sg==='scope8x'?8:sg==='scope4x'?4:2, r=0.022+0.004*(n/2), len=0.14+0.03*n, ty=sightTop+r+0.018;
      cy(r,len,gMat,0,ty,sz); cy(r*1.3,0.05,gMat2,0,ty,sz-len/2+0.02); cy(r*0.9,0.004,gLens,0,ty,sz-len/2-0.005);
      bx(0.02,0.03,0.03,gMat2,0,sightTop+0.01,sz-0.06); bx(0.02,0.03,0.03,gMat2,0,sightTop+0.01,sz+0.06); dotY=ty; }
    if(sp.fade&&!sp.fadeBarrel) fadeL.push(...body.children.slice(nS));
    if(sp.neon&&sp.mover!=='slide') bx(rw+0.004,0.01,rl*0.8,gNeon,0,rh*0.18,0);
    // ตัวเลื่อนอื่นๆ
    if(sp.mover==='bolt'||sp.mover==='lever'){ mv=new THREE.Group(); body.add(mv);
      bx(0.014,0.02,0.05,gMat2,rw/2+0.01,rh*0.2,rl*0.2,0,mv); bx(0.02,0.012,0.02,gMat,rw/2+0.025,rh*0.2,rl*0.2,0,mv); }
    else if(sp.mover==='pump'){ mv=new THREE.Group(); mv.position.z=sp.pumpZ??(front-0.1); body.add(mv);
      bx(rw*0.9,0.075,0.2,gWood,0,-0.02,0,0,mv); if(sp.neon) bx(rw*0.9,0.01,0.12,gNeon,0,0.02,0,0,mv); }
    else if(sp.mover==='barrelspin'){ const spg=new THREE.Group(); spg.position.set(0,by,front-0.2); body.add(spg);
      for(let k=0;k<6;k++){ const a=k/6*Math.PI*2, me=new THREE.Mesh(gC(0.014,0.4,8),gMat); me.rotation.x=Math.PI/2; me.position.set(Math.cos(a)*0.04,Math.sin(a)*0.04,0); spg.add(me); }
      o.spinG=spg; }
    parts.push({g:body,slide:mv,mag:magMesh,magY,muz:[ox,by,tip-0.03],dotY,fadeL});
  });
  const p0=parts[0];
  o.mag=p0.mag; o.magY=p0.magY;
  o.mover=sp.dual?null:p0.slide;
  o.moverBase=p0.slide?p0.slide.position.z:0;
  o.moverAmp=sp.mvA??(sp.mover==='pump'?0.14:sp.mover==='bolt'||sp.mover==='lever'?0.07:0.05);
  o.moverMode=sp.mmode||(sp.mover==='slide'?'kick':'cycle');
  o.muzzle=p0.muz;
  if(sp.dual){ o.muzzles=parts.map(p=>p.muz); o.dual=parts.map(p=>({g:p.g,slide:p.slide,mag:p.mag,magY:p.magY})); o.ejX=[-0.14,0.14];
    if(sp.cross){   /* ถือไขว้กัน: กระบอกซ้ายอยู่ฝั่งขวาแล้วเฉียงออกซ้าย (และกลับกัน) + ยกซ้ายสูงกว่านิดหน่อยกันทะลุ */
      const th=[0.05,-0.05], bx=[0.17,-0.17], by=[0,0];
      parts.forEach((p,i)=>{ const m=p.muz, ox=offs[i], dx=m[0]-ox, dz=m[2], c=Math.cos(th[i]), sn=Math.sin(th[i]);
        p.g.position.x=bx[i]; p.g.position.y+=by[i]; p.g.rotation.y=th[i];
        p.muz=[bx[i]+dx*c+dz*sn, m[1]+by[i], -dx*sn+dz*c]; });
      o.muzzles=parts.map(p=>p.muz); o.ejX=[0.17,-0.17]; } }
  o.hip=sp.hip||V3(0.2,-0.2,-0.42);
  o.aim=sp.aim||V3(0,-(p0.dotY+0.002),sp.aimZ??-0.3);
  o.icon=iconFromSil(o.sil);
  if(sp.fade) parts.forEach(pp=>{ if(pp.fadeL.length) fadeReg(o,sp.fade,...pp.fadeL); });
  return o;
}
// ---- ปืนใหม่รอบ 3A (5 กระบอก) ----
const GSPEC={
  hammer:{rec:[0.064,0.045,0.3],rm:2,mover:'slide',slideH:0.07,bl:0.03,br:0.018,grip:[0.058,0.16,0.08],gz:0,
    mag:{t:'straight',s:[0.052,0.07,0.066],mz:0.105,my:-0.185},sight:'iron',muzzle:'bare',stock:'none',neon:true,hip:V3(0.17,-0.17,-0.36),aimZ:-0.27},
  triplet:{rec:[0.056,0.05,0.28],rm:2,mover:'slide',slideH:0.066,bl:0.06,br:0.016,grip:[0.054,0.15,0.075],gz:0,
    mag:{t:'straight',s:[0.048,0.1,0.06],mz:0.103,my:-0.185},sight:'reddot',muzzle:'brake',stock:'none',neon:true,hip:V3(0.17,-0.17,-0.36),aimZ:-0.27},
  stinger:{rec:[0.068,0.07,0.26],rm:1,mover:'slide',slideH:0.055,bl:0.04,br:0.016,grip:[0.056,0.13,0.07],gz:0.02,fg:[0.036,0.07,0.04,-0.06],
    mag:{t:'straight',s:[0.046,0.17,0.058],mz:0.085,my:-0.18},sight:'iron',muzzle:'flashhider',stock:'none',neon:true,hip:V3(0.19,-0.18,-0.37),aimZ:-0.27},
  twin:{dual:true,rec:[0.054,0.04,0.25],rm:1,mover:'slide',slideH:0.06,bl:0.03,br:0.016,grip:[0.05,0.14,0.07],
    mag:{t:'straight',s:[0.045,0.07,0.058],mz:0.06,my:-0.165},sight:'iron',muzzle:'bare',stock:'none',neon:true,cross:true,
    hip:V3(0,-0.12,-0.42),aim:V3(0,-0.12,-0.42)},
  whisper:{rec:[0.078,0.095,0.34],rm:1,mover:'bolt',mmode:'kick',bl:0.16,br:0.016,hg:[0.07,0.07,0.16],grip:[0.056,0.14,0.07],
    mag:{t:'curved',s:[0.048,0.2,0.07],mz:-0.05,my:-0.16,rx:-0.3},sight:'reddot',sz:-0.06,muzzle:'suppressor',supL:0.22,stock:'folding',neon:true,
    hip:V3(0.2,-0.2,-0.4),aimZ:-0.28},
};
{ const F={triplet:0.88,whisper:0.88,stinger:0.8}; for(const k in F) GSPEC[k].fade=F[k]; }
for(const k in GSPEC) GM[k]=buildGunModel(GSPEC[k]);
// ---- มือ + ปลอกกระสุน ให้ปืนใหม่ (realism pass) ----
function attachGear(only){
  const place=(h,x,y,z,rx=0)=>{ h.position.set(x,y,z); h.rotation.x=rx; return h; };
  for(const k in GSPEC){ if(only&&k!==only) continue;
    const sp=GSPEC[k], o=GM[k], [rw,rh,rl]=sp.rec, rear=rl/2, gr=sp.grip, gy=-rh/2-gr[1]/2+0.02, gz=rear-gr[2]/2-(sp.gz??0.03);
    o.casing='pst'; o.ejDir=1; o.eject=[0.045,0.045,-0.01];
    if(sp.dual){
      o.eject=[0.18,0.045,-0.01];
      const hr=place(makeHand('grip',gr[0],gr[2],V3(1.3,-0.7,1)),0,gy,gz,0.25), hl=place(makeHand('grip',gr[0],gr[2],V3(-1.3,-0.7,1)),0,gy,gz,0.25);
      o.dual[1].g.add(hr); o.dual[0].g.add(hl); o.handR=hr; o.handR2=hl;
    } else {
      o.handR=place(makeHand('grip',gr[0],gr[2],V3(0.7,-0.75,1)),0,gy,gz,0.25); o.g.add(o.handR);
      if(k==='stinger'){ o.handL=makeHand('grip',0.05,0.05,V3(-0.5,-0.8,1)); o.handL.position.set(0,-0.07,sp.fg[3]); }
      else if(k==='whisper'){ o.handL=makeHand('cradle',0.075,0.1,V3(-0.55,-0.7,1)); o.handL.position.set(0,-0.03,-0.21); o.ejDelay=0.1; }
      else { o.handL=makeHand('cradle',0.06,0.06,V3(-0.6,-0.6,1)); o.handL.position.set(-0.2,-0.3,0.25); o.handLHide=true; }
      o.g.add(o.handL); o.handLBase=o.handL.position.clone();
    }
  }
}
attachGear();

/* ---- ปืนรอบ 4 (สร้างตอนใช้ครั้งแรก แล้ว cache ใน GM) ---- */
const LAZY={
  viper18:{rec:[0.06,0.045,0.26],rm:1,mover:'slide',slideH:0.062,bl:0.05,br:0.015,grip:[0.054,0.15,0.075],gz:0,
    mag:{t:'straight',s:[0.05,0.13,0.062],mz:0.1,my:-0.215},sight:'iron',muzzle:'brake',stock:'none',neon:true,hip:V3(0.17,-0.17,-0.36),aimZ:-0.27},
  triad3:{rec:[0.054,0.05,0.3],rm:2,mover:'slide',slideH:0.056,bl:0.08,br:0.014,hg:[0.05,0.04,0.1],grip:[0.052,0.15,0.075],gz:0.01,
    mag:{t:'straight',s:[0.046,0.11,0.058],mz:0.105,my:-0.19},sight:'reddot',muzzle:'brake',stock:'none',neon:true,hip:V3(0.17,-0.17,-0.37),aimZ:-0.27},
  ricochet:{rec:[0.07,0.07,0.22],rm:1,bl:0.2,br:0.02,grip:[0.058,0.14,0.08],gz:0,
    mag:{t:'cyl',s:[0.042,0.08,0.1],mz:-0.02},sight:'iron',muzzle:'bare',stock:'none',neon:true,hip:V3(0.18,-0.18,-0.38),aimZ:-0.28},
  taser:{rec:[0.076,0.082,0.2],rm:2,bl:0,br:0.02,hg:[0.05,0.05,0.12],grip:[0.06,0.14,0.07],gz:0.01,
    mag:{t:'straight',s:[0.04,0.07,0.05],mz:0.06,my:-0.15},sight:'iron',muzzle:'choke',stock:'none',neon:true,hip:V3(0.17,-0.17,-0.36),aimZ:-0.27},
  wasp:{rec:[0.07,0.08,0.36],rm:1,mover:'bolt',mmode:'kick',bl:0.12,br:0.014,hg:[0.062,0.06,0.14],grip:[0.054,0.14,0.07],fg:[0.04,0.08,0.04,-0.12],
    mag:{t:'curved',s:[0.044,0.2,0.06],mz:-0.02,my:-0.16,rx:-0.2},sight:'reddot',sz:-0.02,muzzle:'flashhider',stock:'folding',neon:true,hip:V3(0.2,-0.2,-0.4),aimZ:-0.28},
};
LAZY.tempest={rec:[0.068,0.075,0.3],rm:2,mover:'bolt',mmode:'kick',bl:0.1,br:0.014,hg:[0.06,0.055,0.13],grip:[0.052,0.14,0.07],fg:[0.04,0.08,0.04,-0.1],
    mag:{t:'curved',s:[0.046,0.17,0.06],mz:0.0,my:-0.15,rx:-0.25},sight:'reddot',sz:-0.01,muzzle:'brake',stock:'folding',neon:true,hip:V3(0.2,-0.2,-0.4),aimZ:-0.28};
LAZY.brawler={rec:[0.088,0.092,0.3],rm:1,mover:'bolt',mmode:'kick',bl:0.1,br:0.02,hg:[0.075,0.07,0.1],grip:[0.06,0.15,0.08],
    mag:{t:'drum',s:[0.058,0.075,0],mz:-0.02},sight:'iron',muzzle:'flashhider',stock:'none',neon:true,hip:V3(0.2,-0.2,-0.4),aimZ:-0.28};
LAZY.gale={rec:[0.07,0.09,0.42],rm:2,mover:'bolt',mmode:'kick',bl:0.3,br:0.015,hg:[0.066,0.06,0.2],grip:[0.054,0.14,0.07],
    mag:{t:'curved',s:[0.05,0.18,0.07],mz:0.02,my:-0.16,rx:-0.15},sight:'scope2x',sz:-0.02,muzzle:'brake',stock:'fixed',neon:true,hip:V3(0.2,-0.2,-0.42),aimZ:-0.3};
LAZY.bulwark={rec:[0.098,0.11,0.4],rm:1,mover:'bolt',mmode:'kick',bl:0.2,br:0.026,hg:[0.09,0.09,0.24],grip:[0.06,0.15,0.08],fg:[0.05,0.1,0.05,-0.2],
    mag:{t:'box',s:[0.07,0.2,0.1],mz:0.0,my:-0.19,rx:0},sight:'reddot',sz:-0.02,muzzle:'brake',stock:'fixed',neon:true,hip:V3(0.21,-0.21,-0.43),aimZ:-0.3};
LAZY.ranger={rec:[0.072,0.095,0.4],rm:2,mover:'bolt',mmode:'kick',bl:0.38,br:0.017,hg:[0.058,0.058,0.2],grip:[0.054,0.14,0.07],
    mag:{t:'straight',s:[0.05,0.14,0.07],mz:0.0,my:-0.16,rx:0},sight:'scope4x',sz:-0.03,muzzle:'flashhider',stock:'fixed',neon:true,hip:V3(0.2,-0.21,-0.44),aimZ:-0.3};
LAZY.cinder={rec:[0.072,0.085,0.34],rm:1,mover:'bolt',mmode:'kick',bl:0.22,br:0.017,hg:[0.066,0.06,0.18],grip:[0.054,0.14,0.07],
    mag:{t:'curved',s:[0.05,0.17,0.07],mz:0.0,my:-0.16,rx:-0.2},sight:'iron',muzzle:'flashhider',stock:'fixed',neon:true,hip:V3(0.2,-0.2,-0.42),aimZ:-0.3};
LAZY.frostbite={rec:[0.066,0.08,0.38],rm:2,mover:'bolt',mmode:'kick',bl:0.3,br:0.014,hg:[0.05,0.05,0.16],crystal:true,grip:[0.052,0.14,0.07],
    mag:{t:'straight',s:[0.046,0.16,0.065],mz:0.0,my:-0.16,rx:0},sight:'reddot',sz:-0.02,muzzle:'flashhider',stock:'skeleton',neon:true,hip:V3(0.2,-0.2,-0.42),aimZ:-0.3};
LAZY.twindrake={rec:[0.09,0.1,0.3],rm:1,bl:0.5,br:0.022,twin:true,hg:[0.1,0.05,0.2],grip:[0.06,0.15,0.08],gz:0.02,
    sight:'iron',muzzle:'bare',stock:'fixed',neon:true,hip:V3(0.2,-0.2,-0.44),aimZ:-0.3,shell:true,lh:[0,-0.07,-0.3]};
LAZY.autohail={rec:[0.09,0.1,0.36],rm:2,mover:'pump',bl:0.45,br:0.022,grip:[0.06,0.15,0.08],
    mag:{t:'drum',s:[0.07,0.11,0],mz:0.02},sight:'reddot',sz:-0.02,muzzle:'choke',stock:'fixed',neon:true,hip:V3(0.2,-0.2,-0.44),aimZ:-0.3,shell:true,lh:[0,-0.055,-0.3,1]};
LAZY.dragonbreath={rec:[0.082,0.1,0.32],rm:1,mover:'pump',bl:0.55,br:0.024,grip:[0.06,0.15,0.08],
    mag:{t:'tube',s:[0,0,0.5],mz:-0.28},sight:'iron',muzzle:'flashhider',stock:'fixed',neon:true,hip:V3(0.2,-0.2,-0.44),aimZ:-0.3,shell:true,lh:[0,-0.055,-0.3,1]};
LAZY.banshee={rec:[0.074,0.1,0.44],rm:2,mover:'bolt',mmode:'kick',bl:0.42,br:0.016,hg:[0.064,0.07,0.2],grip:[0.054,0.14,0.07],
    mag:{t:'curved',s:[0.05,0.2,0.07],mz:0.0,my:-0.17,rx:-0.2},sight:'scope4x',sz:-0.03,muzzle:'brake',stock:'fixed',neon:true,hip:V3(0.2,-0.21,-0.44),aimZ:-0.3};
LAZY.hawk={rec:[0.06,0.08,0.4],rm:1,mover:'bolt',mmode:'kick',bl:0.5,br:0.012,hg:[0.05,0.05,0.14],grip:[0.05,0.13,0.065],
    mag:{t:'straight',s:[0.044,0.1,0.06],mz:0.02,my:-0.12,rx:0},sight:'scope4x',sz:-0.03,muzzle:'flashhider',stock:'skeleton',neon:true,hip:V3(0.19,-0.19,-0.42),aimZ:-0.3};
LAZY.raillance={rec:[0.07,0.09,0.44],rm:2,bl:0.5,br:0.016,twin:true,hg:[0.06,0.05,0.3],crystal:true,grip:[0.054,0.14,0.07],
    mag:{t:'cyl',s:[0.03,0,0.16],mz:0.1},sight:'scope2x',sz:-0.02,muzzle:'bare',stock:'fixed',neon:true,hip:V3(0.2,-0.2,-0.46),aimZ:-0.3,noCasing:true};
LAZY.arccaster={rec:[0.08,0.09,0.3],rm:2,bl:0.1,br:0.02,hg:[0.074,0.07,0.16],crystal:true,grip:[0.056,0.14,0.07],
    mag:{t:'cyl',s:[0.034,0,0.12],mz:-0.04},sight:'iron',muzzle:'choke',stock:'none',neon:true,hip:V3(0.19,-0.2,-0.4),aimZ:-0.28,noCasing:true};
LAZY.plasma={rec:[0.08,0.09,0.32],rm:2,bl:0.14,br:0.02,hg:[0.074,0.07,0.16],crystal:true,grip:[0.056,0.14,0.07],
    mag:{t:'box',s:[0.05,0.14,0.08],mz:0.02,my:-0.14,rx:0},sight:'reddot',sz:-0.02,muzzle:'choke',stock:'folding',neon:true,hip:V3(0.2,-0.2,-0.4),aimZ:-0.28,noCasing:true};
LAZY.singularity={rec:[0.1,0.11,0.36],rm:2,bl:0.3,br:0.04,hg:[0.1,0.09,0.2],crystal:true,grip:[0.058,0.14,0.07],
    mag:{t:'cyl',s:[0.04,0,0.14],mz:-0.08},sight:'reddot',sz:-0.02,muzzle:'choke',stock:'folding',neon:true,hip:V3(0.21,-0.21,-0.44),aimZ:-0.3,noCasing:true};
LAZY.inferno={rec:[0.09,0.1,0.34],rm:1,bl:0.3,br:0.03,hg:[0.08,0.07,0.12],grip:[0.058,0.14,0.07],
    mag:{t:'drum',s:[0.07,0.2,0],mz:0.0},sight:'iron',muzzle:'choke',stock:'none',neon:true,hip:V3(0.2,-0.2,-0.42),aimZ:-0.3,noCasing:true};
LAZY.nailer={rec:[0.07,0.08,0.3],rm:2,mover:'bolt',mmode:'kick',bl:0.12,br:0.014,hg:[0.06,0.05,0.12],grip:[0.052,0.14,0.07],
    mag:{t:'box',s:[0.05,0.14,0.08],mz:0.02,my:-0.14,rx:0},sight:'reddot',sz:-0.02,muzzle:'flashhider',stock:'folding',neon:true,hip:V3(0.2,-0.2,-0.4),aimZ:-0.28,noCasing:true};
LAZY.quake={rec:[0.1,0.11,0.3],rm:1,mover:'pump',bl:0.2,br:0.05,hg:[0.11,0.09,0.22],crystal:true,grip:[0.06,0.15,0.08],
    mag:{t:'cyl',s:[0.034,0,0.12],mz:0.1},sight:'iron',muzzle:'choke',stock:'fixed',neon:true,hip:V3(0.21,-0.21,-0.44),aimZ:-0.3,noCasing:true,lh:[0,-0.06,-0.3,1]};
LAZY.lobber={rec:[0.09,0.1,0.28],rm:2,bl:0.22,br:0.04,hg:[0.09,0.08,0.14],grip:[0.058,0.14,0.07],
    mag:{t:'drum',s:[0.06,0.1,0],mz:0.0},sight:'iron',muzzle:'bare',stock:'fixed',neon:true,hip:V3(0.2,-0.2,-0.42),aimZ:-0.3,noCasing:true};
LAZY.nightbolt={rec:[0.07,0.09,0.42],rm:1,mover:'bolt',mmode:'kick',bl:0.3,br:0.02,hg:[0.05,0.05,0.3],grip:[0.052,0.14,0.07],
    mag:{t:'box',s:[0.04,0.05,0.12],mz:0.0,my:0.07,rx:0},sight:'reddot',sz:-0.02,muzzle:'bare',stock:'fixed',neon:true,hip:V3(0.21,-0.2,-0.44),aimZ:-0.3,noCasing:true};
LAZY.chakram={rec:[0.1,0.1,0.3],rm:1,bl:0.16,br:0.07,hg:[0.1,0.09,0.16],crystal:true,grip:[0.058,0.14,0.07],
    mag:{t:'drum',s:[0.07,0.1,0],mz:0.0},sight:'iron',muzzle:'bare',stock:'none',neon:true,hip:V3(0.2,-0.2,-0.42),aimZ:-0.3,noCasing:true};
LAZY.hornet={rec:[0.09,0.1,0.32],rm:2,bl:0.2,br:0.045,hg:[0.09,0.08,0.18],twin:true,grip:[0.058,0.14,0.07],
    mag:{t:'box',s:[0.05,0.08,0.1],mz:0.0,my:-0.1,rx:0},sight:'reddot',sz:-0.02,muzzle:'bare',stock:'folding',neon:true,hip:V3(0.2,-0.2,-0.42),aimZ:-0.3,noCasing:true};
LAZY.minelayer={rec:[0.09,0.11,0.3],rm:2,bl:0.2,br:0.05,hg:[0.09,0.08,0.14],grip:[0.058,0.14,0.07],
    mag:{t:'drum',s:[0.06,0.1,0],mz:0.0},sight:'iron',muzzle:'choke',stock:'fixed',neon:true,hip:V3(0.2,-0.2,-0.42),aimZ:-0.3,noCasing:true};
LAZY.sentry={rec:[0.12,0.1,0.26],rm:1,bl:0.06,br:0.03,hg:[0.08,0.08,0.08],crystal:true,grip:[0.058,0.14,0.07],
    mag:{t:'box',s:[0.06,0.1,0.1],mz:0.0,my:0.08,rx:0},sight:'none',muzzle:'bare',stock:'none',neon:true,hip:V3(0.2,-0.2,-0.4),aimZ:-0.28,noCasing:true};
{ const F={triad3:0.88,wasp:0.88,tempest:0.88,nailer:0.88,frostbite:0.88,plasma:0.88,nightbolt:0.88,gale:0.92,ranger:0.92,raillance:0.92,chakram:0.85};
  for(const k in F) LAZY[k].fade=F[k];
  LAZY.chakram.fadeBarrel=true; LAZY.bulwark.sight='off'; LAZY.autohail.sight='off'; LAZY.ricochet.rsH=0.013; }
function ensureGun(id){
  if(GM[id]||!LAZY[id]) return GM[id];
  GSPEC[id]=LAZY[id]; const o=GM[id]=buildGunModel(LAZY[id]); o.g.visible=false; attachGear(id); ICON[id]=o.icon;
  const L=LAZY[id];
  if(L.noCasing){ o.eject=null; o.casing=null; }
  if(L.shell){ o.casing='shell'; o.eject=[0.05,0.05,0]; if(L.mover==='pump') o.ejDelay=0.24; }
  if(L.lh&&o.handL){ o.handLHide=false; o.handL.position.set(L.lh[0],L.lh[1],L.lh[2]); o.handLBase=o.handL.position.clone(); if(L.lh[3]&&o.mover){ o.handLFollow=o.mover; o.handLFollowBase=o.moverBase; } }
  return o;
}
const gunUnlocked=id=>true;

/* ---------- เอฟเฟกต์ตอนยิง : แฟลชหลายชั้น, ควัน, ปลอกกระสุน 3D, ลำกล้องร้อน ---------- */
const flashTex2=canvasTex(128,128,(g,w,h)=>{
  g.translate(64,64);
  for(let i=0;i<4;i++){ g.rotate(Math.PI/4); const gr=g.createLinearGradient(0,0,62,0); gr.addColorStop(0,'rgba(255,240,200,.95)'); gr.addColorStop(1,'rgba(255,120,20,0)'); g.fillStyle=gr; g.beginPath(); g.moveTo(0,-2.2); g.lineTo(62,0); g.lineTo(0,2.2); g.fill(); }
  const gr=g.createRadialGradient(0,0,0,0,0,18); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,200,100,0)'); g.fillStyle=gr; g.beginPath(); g.arc(0,0,18,0,7); g.fill();
});
const flash2=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTex2,color:hdr(0xfff0c0,3.5),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
flash2.scale.set(0.5,0.5,1); flash2.visible=false; muzzle.add(flash2);
const FLASH_K={hammer:1.2,triplet:0.8,stinger:0.8,twin:0.8,whisper:0,pistol:0.8,magnum:1.4,smg:0.9,ar:1,shotgun:1.5,sniper:1.5,hailstorm:1.1,havoc:1.6};
const SMOKE_N=22, smokes=[], casings=[];
for(let i=0;i<SMOKE_N;i++){ const m=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTex,color:0xaab4c2,transparent:true,opacity:0,depthWrite:false})); m.visible=false; scene.add(m); smokes.push({m,life:0,max:1,v:new THREE.Vector3(),s0:0.1,s1:0.4}); }
const casGeo=new THREE.CylinderGeometry(0.0055,0.0065,0.04,8), casGeoSh=new THREE.CylinderGeometry(0.0105,0.0105,0.05,10);
for(let i=0;i<28;i++){ const m=new THREE.Mesh(casGeo,gBrass); m.visible=false; scene.add(m); casings.push({m,life:0,v:new THREE.Vector3(),w:new THREE.Vector3(),fy:0,b:0}); }
let smokeI=0, casI=0, heat=0; const ejQueue=[];
function spawnCasing(o){
  if(!REAL.casings||!o.eject) return;
  const c=casings[casI]; casI=(casI+1)%casings.length;
  gun.updateMatrixWorld(true); _tmpV.set(...o.eject); o.g.localToWorld(_tmpV); c.m.position.copy(_tmpV);
  const type=o.casing; c.m.geometry=type==='shell'?casGeoSh:casGeo; c.m.material=type==='shell'?gShell:gBrass;
  const k=type==='pst'?0.75:type==='shell'?1:1.2; c.m.scale.set(k,k,k);
  camera.getWorldDirection(_tmpV2); const fw=_tmpV2.clone(), rt=new THREE.Vector3().crossVectors(fw,new THREE.Vector3(0,1,0)).normalize();
  c.v.copy(rt).multiplyScalar(rand(1.5,2.5)*(o.ejDir||1)).addScaledVector(fw,rand(-0.6,0.3)); c.v.y=rand(1.1,2);
  c.w.set(rand(-18,18),rand(-18,18),rand(-18,18)); c.m.rotation.set(rand(0,6),rand(0,6),rand(0,6));
  c.fy=P.pos.y+0.012; c.life=3.2; c.b=0; c.m.visible=true;
}
function spawnSmoke(n,big){
  muzzle.getWorldPosition(_tmpV); camera.getWorldDirection(_tmpV2);
  for(let i=0;i<n;i++){ const s=smokes[smokeI]; smokeI=(smokeI+1)%SMOKE_N;
    s.m.position.copy(_tmpV).addScaledVector(_tmpV2,rand(0,0.1)); s.v.copy(_tmpV2).multiplyScalar(rand(0.3,0.9)); s.v.y+=rand(0.25,0.6); s.v.x+=rand(-0.15,0.15); s.v.z+=rand(-0.15,0.15);
    s.max=s.life=rand(0.55,1.0)*(big?1.4:1); s.s0=rand(0.05,0.1); s.s1=rand(0.3,0.5)*(big?1.6:1); s.m.material.opacity=0.3; s.m.visible=true; }
}
function fxShoot(Wd){
  if(!REAL.on||slot!==1) return; const o=curModel;
  const fk=FLASH_K[Wd.id]||1; flash2.visible=!Wd.silent; flash2.scale.setScalar(Wd.flash*1.25*fk); flash2.material.rotation=Math.random()*Math.PI;
  heat=Math.min(1,heat+0.045*(Wd.kick||1)+0.02);
  if(REAL.smoke){ spawnSmoke(Wd.pellets?3:1,Wd.id==='sniper'||Wd.id==='shotgun'||Wd.id==='magnum'); if(heat>0.5&&Math.random()<0.5) spawnSmoke(1); }
  if(o.eject){ if(o.ejDelay) ejQueue.push({t:o.ejDelay,o}); else spawnCasing(o); }
}
function fxUpdate(dt){
  const on=REAL.on&&slot===1, o=curModel;
  flash2.visible=on&&flash.visible;
  for(const k in GM){ const m=GM[k]; if(m.detail) m.detail.visible=REAL.on; if(m.handR) m.handR.visible=REAL.on&&REAL.hands; if(m.handR2) m.handR2.visible=REAL.on&&REAL.hands; }
  for(const k in MM){ const m=MM[k]; if(m.handR) m.handR.visible=REAL.on&&REAL.hands; }
  for(let i=ejQueue.length-1;i>=0;i--){ const q=ejQueue[i]; q.t-=dt; if(q.t<=0){ spawnCasing(q.o); ejQueue.splice(i,1); } }
  for(const c of casings){ if(c.life<=0) continue; c.life-=dt; if(c.life<=0){ c.m.visible=false; continue; }
    c.v.y-=9.8*dt; c.m.position.addScaledVector(c.v,dt); c.m.rotation.x+=c.w.x*dt; c.m.rotation.y+=c.w.y*dt; c.m.rotation.z+=c.w.z*dt;
    if(c.m.position.y<c.fy){ c.m.position.y=c.fy; if(Math.abs(c.v.y)>0.6&&c.b<3){ c.v.y*=-0.38; c.v.x*=0.55; c.v.z*=0.55; c.w.multiplyScalar(0.5); c.b++; } else { c.v.set(0,0,0); c.w.set(0,0,0); } }
    if(c.life<0.5) c.m.scale.multiplyScalar(0.94); }
  for(const s of smokes){ if(s.life<=0) continue; s.life-=dt; if(s.life<=0){ s.m.visible=false; continue; }
    const r=1-s.life/s.max; s.m.position.addScaledVector(s.v,dt); s.v.multiplyScalar(Math.exp(-1.8*dt)); s.m.scale.setScalar(s.s0+(s.s1-s.s0)*Math.sqrt(r)); s.m.material.opacity=0.3*(1-r)*(1-r); }
  heat=Math.max(0,heat-0.26*dt);
  if(o&&o.heatMat) o.heatMat.opacity=REAL.on&&REAL.heatGlow?heat*heat*0.55:0;
}

/* ================= ANIM SYSTEM (รอบ 9) : แอนิเมชันแบบ keyframe เป็นข้อมูล =================
   playAnim(name,opt) เริ่มท่า · endAnim(cancel) หยุด/คืนค่า · animCls(id) ประเภทปืนสำหรับเลือกท่า (pistol smg rifle shotgun sniper heavy launcher energy revolver)
   ANIM[ชื่อ_ประเภท] = { dur, g:[keys] ตัวปืน, L:[keys] มือซ้าย, R:[keys] มือขวา, M:[keys] ซองกระสุน, V:[keys] ตัวเลื่อน/ปั๊ม/ลูกเลื่อน,
                         hide:[[t0,t1]] ซ่อนซองกระสุน, ev:[[t,'อีเวนต์']], pr:[[t0,t1,'rocket|cell|shell',[x,y,z]]] ของในมือ }
   key = [t 0..1, ตำแหน่ง[x,y,z], มุม[rx,ry,rz], anchor, ease]
     ช่อง g/M/V = "ส่วนเพิ่ม" จากท่าปกติ (V = เท่าของ moverAmp ที่แกน z)   ช่อง L/R = จุดยึด (anchor) + ส่วนเพิ่ม
     anchor ของมือซ้าย: rest mag belt rack shell breech cyl · มือขวา: rest bolt     ease: 0 นุ่ม · 1 ออก · 2 เส้นตรง · 3 ค้างแล้วดีด
   ท่ารีโหลดอ่านเวลาจากสถานะรีโหลดจริง (sync) จึงตรงกับจังหวะเสียงรอบ 3 (reloadSeq) ทุกจังหวะ  ปรับท่า: แก้ตัวเลขในตาราง ANIM / CLS_FEEL */
const Z3=[0,0,0];
const K=(t,p,r,a,e)=>[t,p||Z3,r||Z3,a||'rest',e||0];
const ANIM={}; let ANM=null, swapQ=null, curFeel=null, bump=0, landDip=0, hurtK=0, hurtS=1, wallK=0, gunSide=1;
function animCls(id){
  if(id==='magnum') return 'revolver';
  if(id==='hailstorm') return 'heavy';
  if(id==='havoc'||id==='lobber'||id==='minelayer'||id==='singularity'||id==='quake'||id==='hornet') return 'launcher';
  if(id==='nightbolt') return 'sniper';
  const w=WDEF[id], c=w?w.cls:'rifle';
  if(c==='special') return 'energy';
  return (c==='pistol'||c==='smg'||c==='rifle'||c==='shotgun'||c==='sniper')?c:'rifle';
}
/* ความรู้สึกต่อประเภท: kp=แรงเด้งขึ้น kz=ถอยหลัง kr=บิดข้าง jit=สั่นถี่ sp=ท่าวิ่ง[ก้ม,หัน,เอียง,ลดต่ำ] bob=โยกตามเดิน adsDip=จมตอนเปลี่ยนเล็ง */
const CLS_FEEL={
  pistol:{kp:0.2,kz:0.05,kr:0.04,jit:0,sp:[0.35,0.5,0.25,0.05],bob:0.9,adsDip:0.02},
  revolver:{kp:0.3,kz:0.07,kr:0.06,jit:0,sp:[0.35,0.5,0.25,0.05],bob:0.9,adsDip:0.02},
  smg:{kp:0.09,kz:0.035,kr:0.02,jit:0.5,sp:[0.3,0.55,0.28,0.05],bob:1.1,adsDip:0.015},
  rifle:{kp:0.1,kz:0.06,kr:0.02,jit:0.15,sp:[0.25,0.6,0.3,0.05],bob:1,adsDip:0.015},
  shotgun:{kp:0.16,kz:0.1,kr:0.06,jit:0,sp:[0.3,0.65,0.35,0.06],bob:1.1,adsDip:0.02},
  sniper:{kp:0.2,kz:0.12,kr:0.05,jit:0,sp:[0.35,0.7,0.35,0.07],bob:1.2,adsDip:0.03},
  heavy:{kp:0.05,kz:0.04,kr:0.015,jit:0.8,sp:[0.3,0.5,0.4,0.08],bob:1.5,adsDip:0.03},
  launcher:{kp:0.12,kz:0.14,kr:0.05,jit:0,sp:[0.3,0.6,0.35,0.07],bob:1.3,adsDip:0.03},
  energy:{kp:0.08,kz:0.04,kr:0.02,jit:0.3,sp:[0.25,0.6,0.3,0.05],bob:1,adsDip:0.015},
  melee:{kp:0,kz:0,kr:0,jit:0,sp:[0.15,0.3,0.2,0.04],bob:1,adsDip:0}};
curFeel=CLS_FEEL.rifle;

/* ---------- ท่ารีโหลดแบบเปลี่ยนซอง (ปืนพก/SMG/ไรเฟิล/ปืนกลหนัก/พลังงาน) : เวลาตรงกับ reloadSeq ---------- */
function mkMagReload(c){
  const t=c.tilt||[-0.1,0.05,0.3], s=c.md||1, a=k=>[t[0]*k,t[1]*k,t[2]*k];
  const L=[K(0),K(c.rel+0.03,[0,-0.02,0],Z3,'mag'),K(c.out,[0,-0.1*s,0],Z3,'mag'),K(c.drop,[0,-0.15*s,0.02],Z3,'mag'),
    K(c.drop+0.07,Z3,Z3,'belt'),K(c.grab,[0,0.02,0],Z3,'belt'),K(c.near,[0,-0.1*s,0.02],Z3,'mag'),K(c.seat,[0,-0.01,0],Z3,'mag',1),K(c.seat+0.04,[0,-0.03,0],Z3,'mag')];
  const M=[K(0),K(c.rel),K(c.out,[0,-0.06*s,0]),K(c.drop,[0,-0.12*s,0.01]),K(c.grab,[-0.02,-0.3*s,0.1]),K(c.near,[0,-0.13*s,0.03]),K(c.seat,Z3,Z3,'rest',1),K(1)];
  const G=[K(0),K(c.rel-0.02),K(c.rel+0.05,[0.01,0,0.03],a(1)),K(c.seat-0.03,[0.01,0,0.03],a(1)),K(c.seat+0.01,[0.01,-0.012,0.05],a(0.8)),K(c.seat+0.07,[0,0,0.03],a(0.4))];
  let V=null;
  if(c.rk0!==undefined){
    L.push(K(c.rk0-0.04,Z3,Z3,'rack'),K(c.rk0,Z3,Z3,'rack'),K(c.rk0+0.04,[0,0,0.07],Z3,'rack'),K(c.rk1,Z3,Z3,'rack',1));
    V=[K(0),K(c.rk0),K(c.rk0+0.04,[0,0,1]),K(c.rk1,Z3,Z3,'rest',1),K(1)];
    G.push(K(c.rk0+0.04,[0,0.005,0.045],[-0.06,0,0.15]),K(c.rk1+0.02,[0,0,0.02],[0.04,0,0.05]));
  }
  L.push(K(c.end,Z3,Z3,'rest'),K(1)); G.push(K(1));
  return {g:G,L:L,M:M,V:V,hide:[[c.drop,c.grab]],ev:[[c.drop,c.cell?'cellOut':'dropMag'],[c.seat,c.cell?'cellFlash':'seat']]};
}
ANIM.reload_pistol=mkMagReload({rel:.08,out:.16,drop:.28,grab:.42,near:.52,seat:.62,rk0:.8,rk1:.86,end:.94,tilt:[-0.08,0.04,0.32]});
ANIM.reload_smg=mkMagReload({rel:.08,out:.16,drop:.28,grab:.42,near:.52,seat:.62,rk0:.8,rk1:.86,end:.94,tilt:[-0.1,0.06,0.36]});
ANIM.reload_rifle=mkMagReload({rel:.08,out:.2,drop:.38,grab:.46,near:.54,seat:.6,rk0:.82,rk1:.88,end:.96,tilt:[-0.12,0.08,0.38]});
ANIM.reload_heavy=mkMagReload({rel:.1,out:.18,drop:.26,grab:.4,near:.55,seat:.65,rk0:.86,rk1:.91,end:.97,tilt:[-0.25,0.1,0.45],md:2.2});
ANIM.reload_energy=mkMagReload({rel:.1,out:.22,drop:.3,grab:.4,near:.5,seat:.58,end:.84,tilt:[-0.1,0.05,0.3],cell:true});
/* ลูกซอง: ใส่กระสุนทีละนัด (จำนวนนัดตามเสียง reloadSeq = clamp(round(เวลา*3),3,8)) แล้วปั๊ม 2 ครั้ง */
ANIM.reload_shotgun=ctx=>{
  const n=clamp(Math.round(ctx.dur*3),3,8), seg=0.7/n, L=[K(0)], pr=[], ev=[];
  for(let i=0;i<n;i++){ const t=0.06+i*seg, tb=Math.max(0.01,t-seg*0.5); L.push(K(tb,[0,0.01,0],Z3,'belt'),K(t,Z3,Z3,'shell')); pr.push([tb,t,'shell',[0,0.03,0]]); ev.push([t,'shellIn']); }
  const te=0.06+(n-1)*seg; L.push(K(te+0.05,Z3,Z3,'shell'),K(0.8,Z3,Z3,'rest'),K(1));
  return {g:[K(0),K(0.04,[0,0.01,0.03],[-0.12,0.1,-0.42]),K(te+0.05,[0,0.01,0.03],[-0.12,0.1,-0.42]),K(0.8,[0,0,0.02],[-0.04,0,-0.1]),K(1)],
    L:L,V:[K(0),K(0.78),K(0.82,[0,0,1]),K(0.86),K(0.91),K(0.93,[0,0,1]),K(0.97),K(1)],pr:pr,ev:ev};
};
/* สไนเปอร์: ดึงลูกเลื่อน (มือขวา) → ถอดซอง → เสียบซอง → ดันลูกเลื่อนกลับ */
ANIM.reload_sniper={
  g:[K(0),K(0.05,[0,0.01,0.03],[-0.04,0.05,0.18]),K(0.7,[0,0.01,0.03],[-0.04,0.05,0.18]),K(0.8,[0,0,0.02],[0,0,0.05]),K(1)],
  R:[K(0),K(0.05,Z3,Z3,'bolt'),K(0.08,[0,0.03,0],[0,0,-0.3],'bolt'),K(0.15,[0,0.03,0.08],[0,0,-0.3],'bolt'),K(0.22,[0,0.03,0.08],[0,0,-0.3],'bolt'),K(0.3,Z3,Z3,'rest'),K(0.7,Z3,Z3,'rest'),
     K(0.76,[0,0.03,0.08],[0,0,-0.3],'bolt'),K(0.8,[0,0.03,0],[0,0,-0.3],'bolt'),K(0.85,Z3,Z3,'bolt'),K(0.93,Z3,Z3,'rest'),K(1)],
  L:[K(0),K(0.28,[0,-0.02,0],Z3,'mag'),K(0.36,[0,-0.1,0],Z3,'mag'),K(0.42,Z3,Z3,'belt'),K(0.47,[0,0.02,0],Z3,'belt'),K(0.52,[0,-0.1,0.02],Z3,'mag'),K(0.56,[0,-0.01,0],Z3,'mag',1),K(0.62,[0,-0.03,0],Z3,'mag'),K(0.7,Z3,Z3,'rest'),K(1)],
  M:[K(0),K(0.3),K(0.36,[0,-0.12,0.01]),K(0.42,[-0.02,-0.3,0.1]),K(0.52,[0,-0.13,0.03]),K(0.56,Z3,Z3,'rest',1),K(1)],
  hide:[[0.37,0.42]],V:[K(0),K(0.08),K(0.15,[0,0,1]),K(0.78,[0,0,1]),K(0.82,Z3,Z3,'rest',1),K(1)],
  ev:[[0.36,'dropMag'],[0.56,'seat'],[0.82,'clank']]};
/* ลูกโม่: ปลดกระบอก เทปลอก ใส่ speedloader ปิดกระบอก */
ANIM.reload_revolver={
  g:[K(0),K(0.06,[0,0,0.02],[-0.05,0,0.3]),K(0.18,[0,0.01,0.03],[-0.05,0,0.3]),K(0.22,[0,0.02,0.03],[0.9,0.05,0.4]),K(0.34,[0,0.02,0.03],[0.9,0.05,0.4]),K(0.42,[0,0,0.03],[-0.1,0.05,0.35]),K(0.78,[0,0,0.03],[-0.1,0.05,0.35]),K(0.84,[0,-0.01,0.04],[-0.05,0,0.1]),K(1)],
  M:[K(0),K(0.07),K(0.12,[-0.065,-0.01,0.03]),K(0.8,[-0.065,-0.01,0.03]),K(0.84,Z3,Z3,'rest',1),K(1)],
  L:[K(0),K(0.1,Z3,Z3,'cyl'),K(0.2,[0,-0.02,0],Z3,'cyl'),K(0.32,[0,-0.02,0],Z3,'cyl'),K(0.4,Z3,Z3,'belt'),K(0.5,[0,0.02,0],Z3,'belt'),K(0.6,Z3,Z3,'cyl'),K(0.86,Z3,Z3,'cyl'),K(0.93,Z3,Z3,'rest'),K(1)],
  ev:[[0.2,'shells'],[0.24,'shells'],[0.28,'shells'],[0.32,'shells'],[0.84,'seat']]};
/* เครื่องยิงจรวด/ท่อ: หยิบหัวจรวดจากเข็มขัด ยัดเข้าท้ายท่อ ล็อก */
ANIM.reload_launcher={
  g:[K(0),K(0.08,[0,0.01,0.05],[-0.12,0.1,0.35]),K(0.74,[0,0.01,0.05],[-0.12,0.1,0.35]),K(0.82,[0,-0.01,0.04],[-0.02,0,0.08]),K(1)],
  L:[K(0),K(0.12,Z3,Z3,'belt'),K(0.18,[0,0.02,0],Z3,'belt'),K(0.34,[0,0.01,0.05],Z3,'breech'),K(0.5,[0,0,0.02],Z3,'breech'),K(0.58,Z3,Z3,'breech',1),K(0.7,Z3,Z3,'rest'),K(1)],
  pr:[[0.16,0.56,'rocket',[0,0.03,0]]],ev:[[0.56,'seat'],[0.58,'clank']]};

/* ---------- ท่าชัก (draw) / เก็บ (holster) ต่างตามขนาดปืน: [เวลา, ตำแหน่งเริ่ม, มุมเริ่ม] ---------- */
const DRAW={
  pistol:[0.2,[0.08,-0.22,0.06],[-0.7,0.2,0.3]], revolver:[0.22,[0.08,-0.24,0.06],[-0.75,0.2,0.3]], smg:[0.24,[0.1,-0.26,0.07],[-0.8,0.22,0.32]],
  energy:[0.26,[0.1,-0.28,0.07],[-0.85,0.22,0.35]], rifle:[0.28,[0.1,-0.3,0.08],[-0.9,0.25,0.35]], shotgun:[0.32,[0.12,-0.34,0.1],[-1,0.28,0.4]],
  sniper:[0.38,[0.12,-0.38,0.1],[-1.05,0.3,0.4]], launcher:[0.42,[0.14,-0.4,0.12],[-1.1,0.3,0.45]], heavy:[0.46,[0.14,-0.42,0.12],[-1.1,0.3,0.45]], melee:[0.25,[0.1,-0.3,0.1],[-1,0.2,0.4]]};
for(const c in DRAW){ const [d,p,r]=DRAW[c], hL=[-0.06,-0.16,0.1], hR=[0.05,-0.12,0.1], sc=(v,k)=>v.map(x=>x*k);
  ANIM['draw_'+c]={dur:d,g:[K(0,p,r),K(1,Z3,Z3,'rest',1)],L:[K(0,hL),K(1,Z3,Z3,'rest',1)],R:[K(0,hR),K(1,Z3,Z3,'rest',1)]};
  ANIM['holster_'+c]={dur:Math.max(0.1,d*0.5),g:[K(0),K(1,sc(p,0.7),sc(r,0.7))],L:[K(0),K(1,hL)],R:[K(0),K(1,hR)]}; }
ANIM.draw_butterfly={dur:0.3,g:[K(0,[0.1,-0.3,0.1],[-1,0.2,6.7]),K(1,Z3,Z3,'rest',1)],L:[K(0),K(1)],R:[K(0,[0.05,-0.12,0.1]),K(1,Z3,Z3,'rest',1)]};


/* ---------- ท่าควงอาวุธ (กด G / ปุ่ม "ควง") : ยาว 1.5-2.5 วิ ต่อประเภท  แก้เวลา/ตัวเลขได้ที่ตารางนี้ ---------- */
{ const T2=6.2832, E=2, IK=(t,p,r,e)=>K(t,p,r,'rest',e), W_=[[0.12,'inspWhoosh']];
  ANIM.inspect_pistol={dur:1.9, // หมุนปืนรอบนิ้วเต็มวง แล้วพลิกดูด้านข้าง
    g:[K(0),IK(0.1,[0.01,0.05,0.07],[0.25,0,0.1]),IK(0.42,[0.01,0.08,0.06],[-T2*0.9,0,0.1],E),IK(0.5,[0,0.05,0.05],[-T2,0.1,0.2]),IK(0.62,[-0.03,0.04,0.06],[-T2,0.6,0.9]),IK(0.82,[-0.03,0.04,0.06],[-T2,0.6,0.9]),IK(1,Z3,[-T2,0,0])],
    L:[K(0),K(0.62,[0.02,0.02,0],Z3,'rack'),K(0.72,[0.02,0.02,0.05],Z3,'rack'),K(0.8,Z3,Z3,'rest')],
    ev:[[0.1,'inspWhoosh'],[0.5,'inspClick'],[0.72,'inspClick']]};
  ANIM.inspect_revolver={dur:2.1, // หมุนโม่ แล้วม้วนปืนรอบแกนยาว
    g:[K(0),IK(0.1,[0,0.06,0.07],[0.5,0,0]),IK(0.4,[0,0.09,0.06],[0.2,0,-T2],E),IK(0.55,[0,0.05,0.05],[-0.15,0.4,-T2]),IK(0.78,[0,0.04,0.05],[-0.15,0.4,-T2]),IK(1,Z3,[0,0,-T2])],
    ev:[[0.1,'inspWhoosh'],[0.55,'inspClick'],[0.62,'inspClick'],[0.7,'inspClick']]};
  ANIM.inspect_smg={dur:1.7, // ยกขึ้นพลิกด้านข้าง แล้วตบซอง
    g:[K(0),IK(0.14,[-0.04,0.06,0.07],[0.2,-0.3,0.5]),IK(0.4,[-0.06,0.07,0.07],[0.1,-0.6,1.3]),IK(0.7,[-0.06,0.07,0.07],[0.1,-0.6,1.3]),IK(0.86,[-0.02,0.03,0.04],[0.05,-0.1,0.3]),IK(1,Z3,Z3)],
    L:[K(0),K(0.45,[0,0,0],Z3,'rest'),K(0.6,[0.01,-0.01,0],Z3,'mag'),K(0.7,[0.01,-0.04,0],Z3,'mag'),K(0.8,Z3,Z3,'mag'),K(0.92,Z3,Z3,'rest')],
    M:[K(0),K(0.62),K(0.68,[0,0.02,0]),K(0.75,Z3)],ev:[[0.14,'inspWhoosh'],[0.68,'inspClick']]};
  ANIM.inspect_rifle={dur:2.2, // พลิกปืนโชว์ด้านข้าง แล้วดึงสไลด์ตรวจรัง
    g:[K(0),IK(0.16,[-0.06,0.05,0.08],[0.15,-0.4,0.7]),IK(0.36,[-0.1,0.06,0.09],[0.05,-0.7,1.5]),IK(0.58,[-0.1,0.06,0.09],[0.05,-0.7,1.5]),IK(0.72,[-0.04,0.04,0.06],[0.3,0.1,0.15]),IK(0.9,[-0.01,0.01,0.02],[0.05,0,0.03]),IK(1,Z3,Z3)],
    L:[K(0),K(0.55,Z3,Z3,'rest'),K(0.72,Z3,Z3,'rack'),K(0.78,[0,0,0.07],Z3,'rack'),K(0.86,Z3,Z3,'rack'),K(0.95,Z3,Z3,'rest')],
    V:[K(0),K(0.76),K(0.8,[0,0,1]),K(0.86,Z3),K(1)],ev:[[0.16,'inspWhoosh'],[0.78,'inspClick'],[0.86,'inspClick']]};
  ANIM.inspect_shotgun={dur:2.0, // เหวี่ยงปืนขึ้น ปั๊มโชว์ 2 ที แล้วหมุนปลายปืน
    g:[K(0),IK(0.14,[0,0.05,0.07],[0.55,0,0.1]),IK(0.55,[0,0.06,0.06],[0.55,0,0.1]),IK(0.78,[0,0.08,0.05],[-T2*0.6,0.1,0.1],E),IK(0.9,[0,0.04,0.04],[-T2,0,0.05]),IK(1,Z3,[-T2,0,0])],
    L:[K(0),K(0.2,[0,0,0],Z3,'rest'),K(0.3,Z3,Z3,'rest'),K(0.55,Z3,Z3,'rest'),K(0.7,Z3,Z3,'rest')],
    V:[K(0),K(0.2),K(0.28,[0,0,1]),K(0.36),K(0.44),K(0.52,[0,0,1]),K(0.6),K(1)],ev:[[0.14,'inspWhoosh'],[0.3,'inspClick'],[0.52,'inspClick'],[0.8,'inspWhoosh']]};
  ANIM.inspect_sniper={dur:2.4, // ยกขึ้นดูลำกล้อง ดึงลูกเลื่อนโชว์
    g:[K(0),IK(0.2,[-0.05,0.04,0.07],[0.1,-0.5,0.55]),IK(0.4,[-0.08,0.05,0.07],[0.1,-0.7,1.0]),IK(0.72,[-0.08,0.05,0.07],[0.1,-0.7,1.0]),IK(0.9,[-0.02,0.01,0.03],[0.05,-0.1,0.2]),IK(1,Z3,Z3)],
    R:[K(0),K(0.42,Z3,Z3,'rest'),K(0.48,Z3,Z3,'bolt'),K(0.52,[0,0.03,0],[0,0,-0.3],'bolt'),K(0.6,[0,0.03,0.08],[0,0,-0.3],'bolt'),K(0.66,[0,0.03,0.08],[0,0,-0.3],'bolt'),K(0.72,[0,0.03,0],[0,0,-0.3],'bolt'),K(0.77,Z3,Z3,'bolt'),K(0.85,Z3,Z3,'rest'),K(1)],
    V:[K(0),K(0.5),K(0.6,[0,0,1]),K(0.66,[0,0,1]),K(0.74,Z3),K(1)],ev:[[0.2,'inspWhoosh'],[0.52,'inspClick'],[0.76,'inspClick']]};
  ANIM.inspect_heavy={dur:2.3, // ยกกล่องกระสุนดู โยกตัวปืน แล้วตบซอง
    g:[K(0),IK(0.2,[0,0.06,0.06],[0.3,-0.4,0.3]),IK(0.4,[-0.03,0.07,0.06],[0.25,-0.8,0.55]),IK(0.55,[-0.03,0.08,0.06],[0.3,-0.8,0.5]),IK(0.7,[-0.03,0.07,0.06],[0.2,-0.8,0.55]),IK(0.88,[0,0.02,0.02],[0.05,-0.1,0.1]),IK(1,Z3,Z3)],
    L:[K(0),K(0.5,Z3,Z3,'rest'),K(0.62,[0.01,-0.02,0],Z3,'mag'),K(0.7,[0.01,-0.06,0],Z3,'mag'),K(0.78,[0.01,-0.02,0],Z3,'mag'),K(0.9,Z3,Z3,'rest')],
    ev:[[0.2,'inspWhoosh'],[0.7,'inspClick']]};
  ANIM.inspect_launcher={dur:2.4, // ยกท่อขึ้นบ่า หมุนดูท้ายท่อ เคาะท้ายท่อ
    g:[K(0),IK(0.2,[0,0.07,0.06],[0.45,-0.3,0.2]),IK(0.45,[-0.02,0.09,0.07],[0.6,-0.9,0.4]),IK(0.7,[-0.02,0.09,0.07],[0.6,-0.9,0.4]),IK(0.88,[0,0.03,0.03],[0.1,-0.1,0.1]),IK(1,Z3,Z3)],
    L:[K(0),K(0.5,Z3,Z3,'rest'),K(0.6,[0,0.02,0],Z3,'breech'),K(0.66,[0,0,0.03],Z3,'breech'),K(0.72,[0,0.02,0],Z3,'breech'),K(0.78,[0,0,0.03],Z3,'breech'),K(0.9,Z3,Z3,'rest')],
    ev:[[0.2,'inspWhoosh'],[0.66,'inspClick'],[0.78,'inspClick']]};
  ANIM.inspect_energy={dur:2.0, // ยกขึ้นดูพลังงาน หมุนข้าง แสงวาบที่เซลล์
    g:[K(0),IK(0.16,[0,0.06,0.07],[0.3,-0.4,0.3]),IK(0.4,[-0.02,0.08,0.07],[0.2,-0.8,-0.9]),IK(0.7,[-0.02,0.08,0.07],[0.2,-0.8,-0.9]),IK(0.88,[0,0.02,0.03],[0.05,-0.1,-0.1]),IK(1,Z3,Z3)],
    L:[K(0),K(0.45,Z3,Z3,'rest'),K(0.55,[0,0,0],Z3,'mag'),K(0.75,[0,0,0],Z3,'mag'),K(0.88,Z3,Z3,'rest')],
    ev:[[0.16,'inspWhoosh'],[0.5,'cellFlash'],[0.5,'inspClick']]};
  // อาวุธสั้น (อ่านด้วยชื่อ inspect_<id> ก่อน) : หมุนวนต้องจบที่ผลคูณของ 2π เพื่อให้ท่ากลับมาต่อเนื่อง
  ANIM.inspect_katana={dur:2.4, // ฟันเฉียง 2 ที แล้วเก็บเข้าฝัก
    g:[K(0),IK(0.14,[0.02,0.06,0.04],[0.5,-0.3,-0.5]),IK(0.26,[-0.08,-0.06,-0.1],[-1.3,0.7,0.5]),IK(0.4,[0.1,0.04,0],[0.6,-0.6,-0.9]),IK(0.52,[-0.1,-0.06,-0.1],[-1.2,0.6,0.7]),IK(0.66,[0.04,0.02,0.02],[0.2,0,-0.15]),IK(0.78,[0.12,-0.2,0.06],[0.55,0.1,0.2]),IK(0.9,[0.12,-0.2,0.06],[0.55,0.1,0.2]),IK(1,Z3,Z3)],
    ev:[[0.2,'inspWhoosh'],[0.46,'inspWhoosh'],[0.82,'inspClick']]};
  ANIM.inspect_karambit={dur:1.8, // หมุนมีดรอบนิ้ว 2 รอบ
    g:[K(0),IK(0.12,[0,0.05,0.05],[0.2,0,0]),IK(0.7,[0,0.07,0.05],[-T2*2,0,0.3],E),IK(0.88,[0,0.03,0.03],[-T2*2,0,0]),IK(1,Z3,[-T2*2,0,0])],
    ev:[[0.12,'inspWhoosh'],[0.4,'inspWhoosh'],[0.65,'inspWhoosh'],[0.88,'inspClick']]};
  ANIM.inspect_butterfly={dur:2.3, // ท่าผีเสียงหลายแบบ: ม้วนข้าง → พลิกหน้า → หมุนแนวตั้ง
    g:[K(0),IK(0.1,[0,0.05,0.04],[0.3,0,0]),IK(0.38,[0,0.07,0.04],[0.3,0,T2],E),IK(0.64,[0,0.07,0.05],[0.3+T2,0.5,T2],E),IK(0.88,[0,0.05,0.04],[0.3+T2,T2,T2],E),IK(1,Z3,[T2,T2,T2])],
    ev:[[0.1,'inspWhoosh'],[0.38,'inspClick'],[0.5,'inspWhoosh'],[0.64,'inspClick'],[0.76,'inspWhoosh'],[0.9,'inspClick']]};
  ANIM.inspect_spatha={dur:2.3, // ฟันกว้าง 2 ที แล้วชี้ปลายดาบขึ้น
    g:[K(0),IK(0.16,[0.03,0.04,0.04],[0.5,0.4,0.4]),IK(0.32,[-0.07,-0.04,-0.08],[-1.1,-0.7,-0.5]),IK(0.48,[0.05,0.02,0.02],[0.4,0.5,0.5]),IK(0.62,[-0.06,-0.04,-0.08],[-1.1,-0.7,-0.5]),IK(0.76,[0,0.1,0.02],[0.9,0,0]),IK(0.9,[0,0.1,0.02],[0.9,0,0]),IK(1,Z3,Z3)],
    ev:[[0.22,'inspWhoosh'],[0.54,'inspWhoosh'],[0.8,'inspClick']]};
  ANIM.inspect_bat={dur:2.0, // หมุนไม้บนมือ 2 รอบ
    g:[K(0),IK(0.14,[0,0.08,0.02],[0.4,0,0]),IK(0.78,[0,0.1,0.02],[0.4-T2*2,0,0.2],E),IK(0.9,[0,0.04,0.01],[-T2*2,0,0]),IK(1,Z3,[-T2*2,0,0])],
    ev:[[0.14,'inspWhoosh'],[0.4,'inspWhoosh'],[0.65,'inspWhoosh'],[0.9,'inspClick']]};
}
function quickMelee(){
  if(state!=='play'||slot!==1||reloading||swapQ||drawT>0||qmT>0||qmCD>0) return;
  cancelInspect(); const keepFire=firing;
  setSlotNow(2,true); prevSlot=1; mcT=0; swing();
  qmT=Math.max(0.42,MW.cd+0.1); if(keepFire) firing=false;
}
function inspect(){
  if(state!=='play'||slot<1||reloading||swapQ||drawT>0||firing||aiming||(ANM&&ANM.name!=='inspect')) return;
  playAnim('inspect');   // กด G ซ้ำ = เล่นท่าใหม่ตั้งแต่ต้น (ท่าค้าง/วนอยู่ก็เริ่มใหม่)
}
const cancelInspect=()=>{ if(ANM&&ANM.name==='inspect') endAnim(true); };

/* ---------- ของในมือ (หัวจรวด / ซองพลังงาน / กระสุนลูกซอง) สร้างตอนใช้ครั้งแรก ---------- */
const PROPS={};
function ensureProp(id){
  if(PROPS[id]) return PROPS[id];
  const g=new THREE.Group(), M=(geo,mat,x,y,z,rx)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); if(rx) m.rotation.x=rx; g.add(m); return m; };
  if(id==='rocket'){ M(gC(0.03,0.26,10),gMat2,0,0,0,PI2); M(new THREE.ConeGeometry(0.03,0.07,10),gOrange,0,0,-0.165,-PI2); M(gB(0.07,0.004,0.05),gNeon,0,0,0.1); }
  else if(id==='cell'){ M(gB(0.045,0.09,0.06),gMat,0,0,0); M(gB(0.047,0.02,0.062),gNeon,0,0.02,0); }
  else { M(gC(0.0105,0.05,10),gShell,0,0,0,PI2); M(gC(0.011,0.012,10),gBrass,0,0,0.03,PI2); }
  g.visible=false; gun.add(g); return PROPS[id]=g;
}
/* ซองกระสุนที่หล่นลงพื้นตอนรีโหลด (pool 4 ลูก ใช้ geometry/material เดิมของซอง) */
const dmPool=[]; let dmI=0;
function spawnDropMag(o){
  if(!o.mag||!REAL.on) return;
  if(!dmPool.length) for(let i=0;i<4;i++){ const m=new THREE.Mesh(o.mag.geometry,o.mag.material); m.visible=false; scene.add(m); dmPool.push({m,life:0,v:new THREE.Vector3(),w:new THREE.Vector3()}); }
  const d=dmPool[dmI]; dmI=(dmI+1)%dmPool.length; gun.updateMatrixWorld(true);
  d.m.geometry=o.mag.geometry; d.m.material=o.mag.material; o.mag.getWorldPosition(d.m.position); o.mag.getWorldQuaternion(d.m.quaternion); d.m.scale.set(1,1,1);
  camera.getWorldDirection(_tmpV2); const rt=_tmpV.crossVectors(_tmpV2,UP).normalize();
  d.v.copy(rt).multiplyScalar(rand(0.2,0.7)).addScaledVector(_tmpV2,rand(-0.2,0.3)); d.v.y=rand(-0.5,0.2); d.w.set(rand(-6,6),rand(-3,3),rand(-6,6)); d.life=1.8; d.m.visible=true;
}
const ANIM_EV={
  dropMag(o){ spawnDropMag(o); },
  seat(){ bump=1; vib(10); },
  clank(){ bump=Math.max(bump,0.7); },
  shellIn(){ bump=Math.max(bump,0.35); },
  inspWhoosh(){ sfx('inspWhoosh'); },
  inspClick(){ sfx('inspClick'); },
  cellOut(o){ if(o.mag){ o.mag.getWorldPosition(_tmpV); emit(_tmpV,14,0x00e5ff,3,0.4,0.6,3); } },
  cellFlash(o){ if(o.mag){ o.mag.getWorldPosition(_tmpV); emit(_tmpV,24,0x7fe9ff,5,0.5,0.2,4); ringFX(_tmpV,0x7fe9ff,0.6,0.25); } bump=1; },
  shells(o){ if(o.mag){ o.mag.getWorldPosition(_tmpV); emit(_tmpV,5,0xd2a94c,2.5,0.5,1.2,2.5); } bump=Math.max(bump,0.4); },
};

/* ---------- ตัวอ่านคีย์เฟรม ---------- */
const easeK=(f,e)=>e===1?1-(1-f)*(1-f)*(1-f):e===2?f:e===3?(f>=1?1:0):f*f*(3-2*f);
const _ap={p:[0,0,0],r:[0,0,0]};
function samp(keys,u,anch,out){
  const n=keys.length; let a=keys[0], b=a, f=0;
  if(u>=keys[n-1][0]) a=b=keys[n-1];
  else if(u>keys[0][0]){ let i=0; while(i<n-2&&u>=keys[i+1][0]) i++; a=keys[i]; b=keys[i+1]; f=easeK((u-a[0])/Math.max(1e-4,b[0]-a[0]),b[4]); }
  const pa=anch?anch(a[3]):Z3, pb=anch?anch(b[3]):Z3;
  for(let j=0;j<3;j++){ const x=pa[j]+a[1][j], y=pb[j]+b[1][j]; out.p[j]=x+(y-x)*f; out.r[j]=a[2][j]+(b[2][j]-a[2][j])*f; }
}
/* จุดยึดของมือต่อโมเดลปืน (พิกัดในกรอบปืน: -z = ทางปากกระบอก, +z = ทางผู้เล่น) */
function anchorsOf(o){
  if(o._an) return o._an;
  const my=o.magY!==undefined?o.magY:-0.15, mz=o.mag?o.mag.position.z:0, mx=o.mag?o.mag.position.x:0, sp=o.spec;
  const rl=sp?sp.rec[2]:0.4, rw=sp?sp.rec[0]:0.08, rh=sp?sp.rec[1]:0.1;
  return o._an={ L:{mag:[mx,my-0.1,mz],belt:[mx-0.03,my-0.33,mz+0.12],rack:[0.01,rh/2+0.03,rl/2-0.04],shell:[0,-0.1,0.04],breech:[0,0.02,rl/2+0.1],cyl:[mx-0.06,my,mz+0.03]}, R:{bolt:[rw/2+0.08,rh*0.2+0.01,rl*0.2+0.02]} };
}
/* ท่าควง (กด G): ปืน = เล่นช้าลงเหลือ INSP_GUN_SPEED เท่า แล้วโชว์ปืนค้างที่ u=INSP_HOLD[ประเภท] จนกว่าจะยิง/รีโหลด/เปลี่ยนอาวุธ ·
   มีด/ดาบ = วนช่วง INSP_LOOP[id]=[เริ่ม,จบ] (สัดส่วนของท่า) ไปเรื่อยๆ จนกว่าจะยกเลิก · กด G ซ้ำ = เริ่มท่าใหม่ */
const INSP_GUN_SPEED=0.5;
const INSP_HOLD={pistol:0.82,revolver:0.78,smg:0.7,rifle:0.72,shotgun:0.55,sniper:0.72,heavy:0.7,launcher:0.7,energy:0.7};
const INSP_LOOP={katana:[0.14,0.66],spatha:[0.16,0.48],karambit:[0,1],butterfly:[0,1],bat:[0,1]};
function endAnim(cancel){
  const A=ANM; if(!A) return; ANM=null; const o=A.o;
  if(o.mag&&o._m0){ o.mag.position.copy(o._m0); o.mag.rotation.copy(o._mr0); o.mag.visible=true; }
  for(const id in PROPS) PROPS[id].visible=false;
  if(!cancel&&A.onEnd) A.onEnd();
}
function playAnim(name,opt){
  const o=curModel; if(!o) return 0; opt=opt||{};
  const cls=slot===2?'melee':animCls(selW);
  let d=(slot===2&&ANIM[name+'_'+selM])||ANIM[name+'_'+cls]||ANIM[name]; if(!d) return 0;
  if(typeof d==='function') d=d({dur:opt.dur||1,cls});
  endAnim(true);
  if(o.mag&&!o._m0){ o._m0=o.mag.position.clone(); o._mr0=o.mag.rotation.clone(); }
  if(d.L&&d._L===undefined) d._L=d.L.some(k=>k[3]!=='rest');
  ANM={name,d,o,t:0,dur:opt.dur||d.dur||0.5,sync:opt.sync||null,fired:0,onEnd:opt.onEnd||null,holdU:undefined,loop:null,holding:false,dp:[0,0,0],dr:[0,0,0],dk:0};
  if(name==='inspect'){ if(slot===1){ ANM.dur/=INSP_GUN_SPEED; ANM.holdU=INSP_HOLD[cls]; } else ANM.loop=INSP_LOOP[selM]||null; }
  return ANM.dur;
}
const animName=()=>ANM?ANM.name:'';
const reloadSync=()=>reloading?1-reloadT/Math.max(0.01,reloadDur):1;
/* ใช้ทุกเฟรมหลังตั้งท่าปกติแล้ว: ใส่ท่า keyframe ทับ + จัดมือ + ของในมือ + ซองที่หล่น */
function animApply(dt){
  const o=curModel; if(!o) return;
  let A=ANM; if(A&&A.o!==o){ endAnim(true); A=null; }
  const real=REAL.on&&REAL.hands, an=anchorsOf(o), hb=o.handLBase, dual=!!o.dual;
  const fl=(o.handLFollow?o.handLFollow.position.z-o.handLFollowBase:0);
  const restL=hb?[hb.x,hb.y,hb.z+fl]:Z3;
  if(o.handR&&!o._hR0){ o._hR0=[o.handR.position.x,o.handR.position.y,o.handR.position.z]; o._hRr0=o.handR.rotation.x; }
  const restR=o._hR0||Z3;
  let u=0, d=null;
  if(A){ d=A.d; A.t+=dt; u=A.sync?clamp(A.sync(),0,1):clamp(A.t/A.dur,0,1);
    if(A.holdU!==undefined){ if(u>=A.holdU){ u=A.holdU; A.holding=true; } }   // โชว์ปืนค้างจนกว่าจะถูกยกเลิก
    else if(A.loop&&u>=A.loop[1]){   // วนท่า: กระโดดกลับจุดเริ่มวน + เฟดส่วนต่างท่า (หมุนเต็มรอบไม่นับ)
      if(d.g){ samp(d.g,A.loop[1],null,_ap); const e0=[_ap.p[0],_ap.p[1],_ap.p[2],_ap.r[0],_ap.r[1],_ap.r[2]]; samp(d.g,A.loop[0],null,_ap);
        for(let j=0;j<3;j++){ A.dp[j]=e0[j]-_ap.p[j]; let r=e0[3+j]-_ap.r[j]; r=r-Math.round(r/6.2832)*6.2832; A.dr[j]=r; } A.dk=1; }
      A.t=A.loop[0]*A.dur; u=A.loop[0]; A.fired=0; }
    if(u>=1){ endAnim(false); A=null; d=null; } }
  let lp=restL, lr=Z3, rp=restR, rr=Z3, lvis=real&&!o.handLHide;
  if(A){
    if(d.ev){ for(let i=0;i<d.ev.length;i++){ const e=d.ev[i]; if(!(A.fired>>i&1)&&u>=e[0]){ A.fired|=1<<i; const f=ANIM_EV[e[1]]; if(f) f(o); } } }
    if(d.g){ samp(d.g,u,null,_ap); gun.position.x+=_ap.p[0]; gun.position.y+=_ap.p[1]; gun.position.z+=_ap.p[2]; gun.rotation.x+=_ap.r[0]; gun.rotation.y+=_ap.r[1]; gun.rotation.z+=_ap.r[2];
      if(A.dk>0.002){ gun.position.x+=A.dp[0]*A.dk; gun.position.y+=A.dp[1]*A.dk; gun.position.z+=A.dp[2]*A.dk; gun.rotation.x+=A.dr[0]*A.dk; gun.rotation.y+=A.dr[1]*A.dk; gun.rotation.z+=A.dr[2]*A.dk; A.dk*=Math.exp(-9*dt); } else A.dk=0;
      if(A.holding){ gun.position.y+=Math.sin(A.t*1.7)*0.003; gun.rotation.z+=Math.sin(A.t*1.3)*0.012; } }
    if(d.M&&o.mag&&o._m0){ samp(d.M,u,null,_ap); o.mag.position.set(o._m0.x+_ap.p[0],o._m0.y+_ap.p[1],o._m0.z+_ap.p[2]); o.mag.rotation.set(o._mr0.x+_ap.r[0],o._mr0.y+_ap.r[1],o._mr0.z+_ap.r[2]); }
    if(d.hide&&o.mag){ let hd=false; for(const h of d.hide) if(u>=h[0]&&u<h[1]){ hd=true; break; } o.mag.visible=!hd; }
    if(d.V&&o.mover){ samp(d.V,u,null,_ap); o.mover.position.z+=_ap.p[2]*o.moverAmp; }
    if(!dual&&d.L&&hb){ samp(d.L,u,nm=>nm==='rest'?restL:(an.L[nm]||restL),_ap); lp=[_ap.p[0],_ap.p[1],_ap.p[2]]; lr=[_ap.r[0],_ap.r[1],_ap.r[2]]; if(o.handLHide) lvis=real&&d._L; }
    if(!dual&&d.R&&o.handR){ samp(d.R,u,nm=>nm==='rest'?restR:(an.R[nm]||restR),_ap); rp=[_ap.p[0],_ap.p[1],_ap.p[2]]; rr=[_ap.r[0],_ap.r[1],_ap.r[2]]; }
  }
  if(o.handL&&hb&&!dual){ o.handL.position.set(lp[0],lp[1],lp[2]); o.handL.rotation.set(lr[0],lr[1],lr[2]); o.handL.visible=lvis; }
  if(o.handR&&!dual){ o.handR.position.set(rp[0],rp[1],rp[2]); o.handR.rotation.x=o._hRr0+rr[0]; o.handR.rotation.y=rr[1]; o.handR.rotation.z=rr[2]; }
  // ของในมือ
  let pw=null; if(A&&d.pr){ for(const w of d.pr) if(u>=w[0]&&u<=w[1]){ pw=w; break; } }
  for(const id in PROPS) if(!pw||pw[2]!==id) PROPS[id].visible=false;
  if(pw){ const pm=ensureProp(pw[2]); pm.visible=true; pm.position.set(lp[0]+pw[3][0],lp[1]+pw[3][1],lp[2]+pw[3][2]); }
  // ซองหล่น
  for(const m of dmPool){ if(m.life<=0) continue; m.life-=dt; if(m.life<=0){ m.m.visible=false; continue; }
    m.v.y-=9.8*dt; m.m.position.addScaledVector(m.v,dt); m.m.rotation.x+=m.w.x*dt; m.m.rotation.z+=m.w.z*dt;
    const fy=P.pos.y+0.06; if(m.m.position.y<fy){ m.m.position.y=fy; m.v.y*=-0.3; m.v.x*=0.5; m.v.z*=0.5; m.w.multiplyScalar(0.4); }
    if(m.life<0.4) m.m.scale.multiplyScalar(0.92); }
  // แรงกระแทกเล็กๆ ตอนเสียบซอง/ปิดฝา
  if(bump>0.001){ gun.position.z+=bump*0.02; gun.rotation.x-=bump*0.03; bump*=Math.exp(-14*dt); } else bump=0;
}
/* ---------- มือของอาวุธสั้น (จับด้าม) : [ตำแหน่งมือขวา, มือซ้าย(ถ้าจับสองมือ)] = [x,y,z,gw,gd] ---------- */
const MH={
  katana:{R:[0,-0.01,-0.02,0.036,0.05],L:[0,-0.01,0.1,0.036,0.05]},
  karambit:{R:[0,0,0.0,0.03,0.05]},
  spatha:{R:[0,-0.01,-0.07,0.04,0.05],L:[0,-0.01,0.03,0.04,0.05]},
  bat:{R:[0,0,0.04,0.05,0.05],L:[0,0,0.14,0.05,0.05]},
  butterfly:{R:[0,0,-0.01,0.05,0.05]},
};
for(const k in MH){ const o=MM[k], h=MH[k];
  const mk=(s,dir)=>{ const m=makeHand('cradle',s[3],s[4],dir); m.position.set(s[0],s[1],s[2]); o.g.add(m); return m; };
  o.handR=mk(h.R,V3(0.7,-0.75,1)); o._hR0=null;
  if(h.L){ o.handL=mk(h.L,V3(-0.6,-0.75,1)); o.handLBase=o.handL.position.clone(); }
}

/* ================= สกินปืน 30 แบบ + ระบบช่องอาวุธ ================= */
const RAR={c:{th:'ทั่วไป',w:60,col:'#9fb2c8',ref:5},r:{th:'หายาก',w:28,col:'#3fa9ff',ref:10},e:{th:'มหาหายาก',w:10,col:'#c05cff',ref:15},l:{th:'ตำนาน',w:2,col:'#ffb300',ref:25}};
const SKINS=[
  {id:'default',n:'STANDARD โรงงาน',r:'c',def:true,c1:0x2a2e3a,c2:0x111318,neon:0x00e5ff},
  {id:'carbon',n:'คาร์บอนดำ',r:'c',c1:0x181a20,c2:0x0a0b0e,neon:0x00e5ff},
  {id:'storm',n:'สตอร์มเทา',r:'c',c1:0x3a4150,c2:0x1c2028,neon:0x7fe9ff},
  {id:'midnight',n:'มิดไนท์บลู',r:'c',c1:0x14203c,c2:0x0a1224,neon:0x3fa9ff},
  {id:'ember',n:'แดงเพลิง',r:'c',c1:0x4a1214,c2:0x1c0a0c,neon:0xff3b30},
  {id:'matrix',n:'กรีนเมทริกซ์',r:'c',c1:0x12321c,c2:0x0a1c10,neon:0x00ff88},
  {id:'volt',n:'สายฟ้าเหลือง',r:'c',c1:0x3c3410,c2:0x1c1808,neon:0xffe066},
  {id:'ultra',n:'ม่วงอัลตร้า',r:'c',c1:0x2c1440,c2:0x140a20,neon:0xb26bff},
  {id:'titanium',n:'ไทเทเนียม',r:'c',c1:0x8a93a5,c2:0x3a4150,neon:0xcfefff,m:0.95,ro:0.2},
  {id:'dune',n:'ทรายมรณะ',r:'c',c1:0x6b5a36,c2:0x2e2614,neon:0xffb300},
  {id:'cobalt',n:'โคบอลต์',r:'c',c1:0x1a2e5a,c2:0x0c1630,neon:0x62a0ff},
  {id:'neonstripe',n:'ลายทแยงนีออน',r:'c',c1:0x14161e,c2:0x0a0c12,neon:0x00e5ff,tex:'stripe'},
  {id:'citygrid',n:'กริดเมือง',r:'c',c1:0x101420,c2:0x0a0c14,neon:0xff2bd6,tex:'grid'},
  {id:'rust',n:'สนิมไซเบอร์',r:'c',c1:0x4a2c14,c2:0x20140a,neon:0xff6a00,m:0.5,ro:0.6},
  {id:'punk',n:'ชมพูพังก์',r:'c',c1:0x3c1028,c2:0x1c0814,neon:0xff7ad9},
  {id:'arctic',n:'น้ำแข็งขั้วโลก',r:'r',c1:0x9adfff,c2:0x2a5a7a,neon:0x00e5ff,ro:0.15},
  {id:'viper',n:'ไวเปอร์',r:'r',c1:0x2a3c1a,c2:0x101a0c,neon:0x5dff7a,tex:'camo'},
  {id:'huntercamo',n:'คาโมพิฆาต',r:'r',c1:0x3c3428,c2:0x1a1610,neon:0xffb300,tex:'camo'},
  {id:'chrome',n:'โครเมียม',r:'r',c1:0xc8d2e0,c2:0x5a6478,neon:0xffffff,m:1,ro:0.1},
  {id:'copper',n:'ทองแดงโบราณ',r:'r',c1:0x6e3c1e,c2:0x2c1608,neon:0xffa050,m:0.8},
  {id:'rainbow',n:'ลายสายรุ้ง',r:'r',c1:0x201040,c2:0x401028,neon:0xff2bd6,tex:'grad'},
  {id:'bloodline',n:'บลัดไลน์',r:'r',c1:0x200a0a,c2:0x100608,neon:0xff2d55,tex:'stripe'},
  {id:'amethyst',n:'อเมทิสต์',r:'r',c1:0x341452,c2:0x180a28,neon:0xc05cff,ro:0.2},
  {id:'radar',n:'เรดาร์กริด',r:'r',c1:0x0c1c14,c2:0x081410,neon:0x00ffa3,tex:'grid'},
  {id:'galaxy',n:'กาแล็กซี',r:'e',c1:0x0a0a2c,c2:0x3c1464,neon:0xb26bff,tex:'grad',m:0.9,ro:0.15},
  {id:'dragonfire',n:'ดราก้อนไฟร์',r:'e',c1:0x3c0a0a,c2:0x1c0606,neon:0xff8a00,tex:'camo'},
  {id:'ghost',n:'โกสต์เรดาร์',r:'e',c1:0xe8f6ff,c2:0x8ab8d0,neon:0x00e5ff,m:0.7,ro:0.25},
  {id:'neoncity',n:'นีออนซิตี้',r:'e',c1:0x0a0c17,c2:0x140a1c,neon:0xff2bd6,tex:'stripe'},
  {id:'venom',n:'เวนอม',r:'e',c1:0x0c2008,c2:0x061408,neon:0x00ff88,tex:'grad'},
  {id:'everglow',n:'เอเวอร์โกลว์',r:'l',c1:0x141428,c2:0x0a0a18,neon:0x00e5ff,tex:'grad'},
  {id:'stellargold',n:'สเตลลาร์โกลด์',r:'l',c1:0x2c2410,c2:0x6b5a1e,neon:0xffd166,m:1,ro:0.12},
  /* ===== รอบ 7: สกินใหม่ 50 แบบ (รวม 81) ===== */
  {id:'sandstorm',n:'พายุทราย',r:'c',c1:0x7a6a4a,c2:0x3a3022,neon:0xffd27a},
  {id:'olive',n:'โอลีฟทหาร',r:'c',c1:0x3a4a2a,c2:0x1a2210,neon:0xa4ff6a},
  {id:'slate',n:'หินชนวน',r:'c',c1:0x4a5260,c2:0x20242c,neon:0x9fd0ff},
  {id:'crimson',n:'ครอมสัน',r:'c',c1:0x5a1020,c2:0x24060c,neon:0xff4060},
  {id:'mint',n:'มิ้นต์ฟรอสต์',r:'c',c1:0x8ad8c8,c2:0x2a6a60,neon:0xbfffee},
  {id:'plum',n:'ลูกพลัม',r:'c',c1:0x4a1a48,c2:0x200a20,neon:0xff6ae0},
  {id:'ocean',n:'คลื่นทะเล',r:'c',c1:0x0e3a5a,c2:0x061c2c,neon:0x00c8ff},
  {id:'graphite',n:'กราไฟต์',r:'c',c1:0x2c2e34,c2:0x121316,neon:0xcfd4e0,m:0.9},
  {id:'sunset',n:'ตะวันรอน',r:'c',c1:0x5a2a14,c2:0x2a1008,neon:0xff8a3c,tex:'grad'},
  {id:'bubblegum',n:'หมากฝรั่ง',r:'c',c1:0xff9ad0,c2:0x7a3a60,neon:0x7fe9ff},
  {id:'tangerine',n:'ส้มสด',r:'c',c1:0xe06a10,c2:0x4a2408,neon:0xffe0a0},
  {id:'checker',n:'หมากรุก',r:'c',c1:0x15171d,c2:0x2a2e3a,neon:0xffffff,tex:'checker'},
  {id:'hexcell',n:'เฮกซ์เซลล์',r:'c',c1:0x14202a,c2:0x0c141c,neon:0x3fe0ff,tex:'hex'},
  {id:'circuit',n:'วงจรเก่า',r:'c',c1:0x10261a,c2:0x0a160f,neon:0x40ff90,tex:'circuit'},
  {id:'tigerstripe',n:'เสือโคร่ง',r:'r',c1:0xd07a1a,c2:0x2a1604,neon:0xffb000,tex:'stripe'},
  {id:'sakura',n:'ซากุระ',r:'r',c1:0xffc0d8,c2:0x8a4a64,neon:0xff7ab0,tex:'marble'},
  {id:'deepsea',n:'ใต้ทะเลลึก',r:'r',c1:0x061a3a,c2:0x0a3a5a,neon:0x00ffd0,tex:'waves'},
  {id:'emberglass',n:'แก้วถ่านไฟ',r:'r',c1:0x2a0c08,c2:0x6a1c0c,neon:0xff5a20,tex:'flame'},
  {id:'stormcell',n:'เมฆพายุ',r:'r',c1:0x2a3248,c2:0x10141f,neon:0xaad0ff,tex:'bolt'},
  {id:'cyberhex',n:'ไซเบอร์เฮกซ์',r:'r',c1:0x0c1a2e,c2:0x142e50,neon:0x00e5ff,tex:'hex'},
  {id:'dragonscale',n:'เกล็ดมังกร',r:'r',c1:0x1c4a2a,c2:0x0a1c10,neon:0xffd24a,tex:'scales'},
  {id:'toxic',n:'สารพิษ',r:'r',c1:0x1a2a08,c2:0x3a5a10,neon:0xc8ff00,tex:'grad'},
  {id:'bonewhite',n:'กระดูกขาว',r:'r',c1:0xe0dccc,c2:0x7a7466,neon:0xff3b3b},
  {id:'obsidian',n:'หินออบซิเดียน',r:'r',c1:0x0a0a10,c2:0x1c1830,neon:0xa070ff,m:0.95,ro:0.12},
  {id:'rosegold',n:'โรสโกลด์',r:'r',c1:0xd8a090,c2:0x6a3a30,neon:0xffd0c0,m:1,ro:0.15},
  {id:'nightcircuit',n:'วงจรราตรี',r:'r',c1:0x080c18,c2:0x101a30,neon:0x3a7bff,tex:'circuit'},
  {id:'zebra',n:'ม้าลายดิจิทัล',r:'r',c1:0xf0f0f0,c2:0x101010,neon:0xff2bd6,tex:'stripe'},
  {id:'lava',n:'ลาวาไหล',r:'r',c1:0x1a0a06,c2:0x7a1c06,neon:0xff6a00,tex:'flame',ro:0.4},
  {id:'woven',n:'ใยคาร์บอนแดง',r:'r',c1:0x1a0c0e,c2:0x3a1418,neon:0xff3050,tex:'weave'},
  {id:'aurora',n:'ออโรร่า',r:'r',c1:0x0a2a3a,c2:0x2a1a5a,neon:0x5affc8,tex:'grad'},
  {id:'sandglass',n:'นาฬิกาทราย',r:'r',c1:0x8a7a4a,c2:0x3a3220,neon:0xfff0b0,tex:'waves'},
  {id:'glitchcore',n:'กลิทช์คอร์',r:'e',c1:0x101018,c2:0x300a38,neon:0x00ffd0,tex:'glitch'},
  {id:'hologram',n:'โฮโลแกรม',r:'e',c1:0xa0e0ff,c2:0x6a4aff,neon:0xff7aff,tex:'holo',m:0.8,ro:0.1},
  {id:'thunderlord',n:'จ้าวสายฟ้า',r:'e',c1:0x10142a,c2:0x2a3a7a,neon:0xffe066,tex:'bolt'},
  {id:'infernal',n:'อินเฟอร์นัล',r:'e',c1:0x2a0404,c2:0x6a1006,neon:0xff3a00,tex:'flame'},
  {id:'cosmicdust',n:'ฝุ่นจักรวาล',r:'e',c1:0x0a0620,c2:0x2a0a5a,neon:0xc080ff,tex:'stars'},
  {id:'reefsiren',n:'ไซเรนแนวปะการัง',r:'e',c1:0x0a3a4a,c2:0x4a1a5a,neon:0x40ffe0,tex:'waves'},
  {id:'samurai',n:'ซามูไรแดง',r:'e',c1:0x1a0608,c2:0x6a0a14,neon:0xffd0a0,tex:'weave'},
  {id:'jadedragon',n:'มังกรหยก',r:'e',c1:0x0c3a28,c2:0x1a6a46,neon:0xfff080,tex:'scales',m:0.6},
  {id:'neonkoi',n:'ปลาคาร์ฟนีออน',r:'e',c1:0x14102a,c2:0xff6a2a,neon:0xff2bd6,tex:'grad'},
  {id:'plasmacore',n:'พลาสม่าคอร์',r:'e',c1:0x180a2a,c2:0x5a14aa,neon:0x40e0ff,tex:'holo'},
  {id:'venomfang',n:'เขี้ยวพิษ',r:'e',c1:0x0a1a0a,c2:0x1a4a14,neon:0x80ff00,tex:'scales'},
  {id:'ironforge',n:'เหล็กหลอม',r:'e',c1:0x2a2420,c2:0x6a4a2a,neon:0xffa040,tex:'hex',m:0.9},
  {id:'phantom',n:'ภูตผี',r:'e',c1:0x14182a,c2:0x6a7aaa,neon:0xdfe8ff,tex:'marble'},
  {id:'solarflare',n:'สุริยะเพลิง',r:'l',c1:0x3a1a04,c2:0xff8a00,neon:0xffd166,tex:'flame',m:0.9,ro:0.1,neon2:0xff5a00,fx:[0xffd166,0xff9a20,0xff5a00]},
  {id:'voidwalker',n:'ผู้เดินแห่งความว่างเปล่า',r:'l',c1:0x04040a,c2:0x2a0a4a,neon:0xb26bff,tex:'stars',neon2:0x5a2aff,fx:[0xb26bff,0x7a3aff,0xe6c8ff]},
  {id:'prismhue',n:'ปริซึมสายรุ้ง',r:'l',c1:0x1a1a2a,c2:0x3a3a5a,neon:0xffffff,tex:'holo',live:'rainbow'},
  {id:'crystalking',n:'ราชาคริสตัล',r:'l',c1:0xa8f0ff,c2:0x3a8ac0,neon:0xffffff,tex:'hex',m:1,ro:0.05,neon2:0xa8f0ff,fx:[0xdff8ff,0xa8f0ff,0xffffff]},
  {id:'dragonemperor',n:'จักรพรรดิมังกร',r:'l',c1:0x3a0a0a,c2:0xffb300,neon:0xff3b30,tex:'scales',m:1,ro:0.12,neon2:0xffb300,fx:[0xff3b30,0xffb300,0xffd24a]},
  {id:'chronos',n:'โครนอส',r:'l',c1:0x1a1a14,c2:0xd8c070,neon:0x7fe9ff,tex:'circuit',m:1,ro:0.1,neon2:0xd8c070,fx:[0x7fe9ff,0xd8c070,0xffffff]},
];
/* e/l: เติม live (pulse/lerp/rainbow) + fx{tracer,flash,spark} ให้ทุกใบอัตโนมัติ (สกินเดิมที่ไม่ระบุใช้สีนีออนของตัวเอง; l เดิมคงไล่สีรุ้งเหมือนเดิม) */
SKINS.forEach(k=>{ if(k.r==='e'||k.r==='l'){ if(!k.live) k.live=k.r==='e'?'pulse':(k.neon2?'lerp':'rainbow'); if(!k.fx) k.fx=[k.neon,k.neon,k.neon]; k.sx=k.r==='l'?0.06:0.03; k.sy=k.tex==='flame'?0.08:(k.tex==='waves'||k.tex==='bolt'?0.04:0); if(k.tex==='stars') k.sy=0.015; if(k.r==='e'&&['grad','camo','stripe','grid'].includes(k.tex)) k.sx=k.sy=0; } });
let SO=['default'], SEQ={};
try{ const a=JSON.parse(localStorage.getItem('ns_skins_owned')||'null'); if(Array.isArray(a)&&a.length) SO=[...new Set(['default',...a])]; }catch(e){}
try{ const o=JSON.parse(localStorage.getItem('ns_skin_equipped')||'null'); if(o&&typeof o==='object') SEQ=o; }catch(e){}
const hx6=n=>'#'+n.toString(16).padStart(6,'0');
const swCSS=sk=>`linear-gradient(135deg,${hx6(sk.c1)} 30%,${hx6(sk.c2)} 55%,${hx6(sk.c2)} 68%,${hx6(sk.neon)} 100%)`;
const skinTexCache={};
const NEWTEX=new Set(['checker','hex','circuit','scales','flame','bolt','marble','stars','waves','weave','glitch','holo']);
const _srnd=seed=>()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
function skinTex(kind,cA,cB,cC){
  const key=kind+'_'+cA+'_'+cB+'_'+(cC||0); if(skinTexCache[key]) return skinTexCache[key];
  const t=canvasTex(128,128,(g,w,h)=>{
    g.fillStyle=hx6(cA); g.fillRect(0,0,w,h);
    const A=hx6(cA), B=hx6(cB), C=hx6(cC||cB), R=_srnd(cA*7+cB*13+(cC||0)+kind.length*101);
    if(kind==='stripe'){ g.save(); g.translate(w/2,h/2); g.rotate(Math.PI/4); g.fillStyle=hx6(cB); for(let i=-200;i<200;i+=28) g.fillRect(i,-140,12,280); g.restore(); }
    else if(kind==='grid'){ g.strokeStyle=hx6(cB); g.lineWidth=3; for(let i=0;i<=w;i+=24){ g.beginPath(); g.moveTo(i,0); g.lineTo(i,h); g.stroke(); g.beginPath(); g.moveTo(0,i); g.lineTo(w,i); g.stroke(); } }
    else if(kind==='camo'){ g.fillStyle=hx6(cB); for(let i=0;i<26;i++){ g.beginPath(); g.ellipse(Math.random()*w,Math.random()*h,rand(8,26),rand(6,16),Math.random()*3,0,7); g.fill(); } }
    else if(kind==='grad'){ const gr=g.createLinearGradient(0,0,w,h); gr.addColorStop(0,hx6(cA)); gr.addColorStop(1,hx6(cB)); g.fillStyle=gr; g.fillRect(0,0,w,h); }
    else if(kind==='checker'){ for(let y=0;y<8;y++) for(let x=0;x<8;x++){ g.fillStyle=((x+y)&1)?B:A; g.fillRect(x*16,y*16,16,16); } g.strokeStyle=C; g.globalAlpha=.25; g.lineWidth=1; g.strokeRect(.5,.5,w-1,h-1); g.globalAlpha=1; }
    else if(kind==='hex'){ const r=16, hh=Math.sqrt(3)*r; g.lineWidth=2;
      for(let i=-1;i<=7;i++) for(let j=-1;j<=5;j++){ const cx=i*1.5*r, cy=j*hh+(i&1?hh/2:0); g.beginPath(); for(let k=0;k<6;k++){ const a=k*Math.PI/3; g[k?'lineTo':'moveTo'](cx+Math.cos(a)*(r-1),cy+Math.sin(a)*(r-1)); } g.closePath();
        if((i+j*2)%3===0){ g.fillStyle=B; g.fill(); } g.strokeStyle=C; g.globalAlpha=.8; g.stroke(); g.globalAlpha=1; } }
    else if(kind==='circuit'){ g.strokeStyle=C; g.fillStyle=C; g.lineWidth=2;
      for(let i=0;i<30;i++){ let x=((R()*8)|0)*16, y=((R()*8)|0)*16; g.beginPath(); g.moveTo(x,y);
        for(let k=0;k<3;k++){ const d=(R()*4)|0, l=16*(1+((R()*3)|0)); if(d===0) x+=l; else if(d===1) x-=l; else if(d===2) y+=l; else y-=l; g.lineTo(x,y); }
        g.globalAlpha=.55+R()*.4; g.stroke(); g.beginPath(); g.arc(x,y,3,0,7); g.fill(); }
      g.globalAlpha=1; g.fillStyle=B; for(let i=0;i<4;i++){ const x=R()*96, y=R()*96; g.fillRect(x,y,18,12); g.strokeRect(x+.5,y+.5,18,12); } }
    else if(kind==='scales'){ g.lineWidth=2; for(let r=-1;r<9;r++) for(let c=-1;c<5;c++){ const x=c*32+(r&1)*16, y=r*16; const gr=g.createRadialGradient(x,y+6,2,x,y+6,18); gr.addColorStop(0,B); gr.addColorStop(1,A); g.fillStyle=gr; g.beginPath(); g.arc(x,y,16,0,Math.PI); g.fill(); g.strokeStyle=C; g.globalAlpha=.55; g.stroke(); g.globalAlpha=1; } }
    else if(kind==='flame'){ const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,A); gr.addColorStop(1,B); g.fillStyle=gr; g.fillRect(0,0,w,h);
      for(let i=0;i<8;i++){ const x=i*16+8, tip=14+R()*58; g.fillStyle=C; g.globalAlpha=.75; g.beginPath(); g.moveTo(x-10,h); g.quadraticCurveTo(x-4,h-tip*.5,x+(R()-.5)*8,h-tip); g.quadraticCurveTo(x+4,h-tip*.5,x+10,h); g.fill();
        g.fillStyle=B; g.globalAlpha=.9; g.beginPath(); g.moveTo(x-5,h); g.quadraticCurveTo(x-2,h-tip*.35,x,h-tip*.55); g.quadraticCurveTo(x+2,h-tip*.35,x+5,h); g.fill(); } g.globalAlpha=1; }
    else if(kind==='bolt'){ g.lineJoin='round';
      for(let b=0;b<5;b++){ let x=R()*w; const pts=[[x,0]]; for(let y=10;y<=h;y+=10){ x+=(R()-.5)*26; pts.push([x,y]); }
        g.strokeStyle=B; g.globalAlpha=.5; g.lineWidth=5; g.beginPath(); pts.forEach((p,i)=>g[i?'lineTo':'moveTo'](p[0],p[1])); g.stroke();
        g.shadowColor=C; g.shadowBlur=6; g.strokeStyle=C; g.globalAlpha=1; g.lineWidth=1.6; g.beginPath(); pts.forEach((p,i)=>g[i?'lineTo':'moveTo'](p[0],p[1])); g.stroke(); g.shadowBlur=0; } }
    else if(kind==='marble'){ const gr=g.createLinearGradient(0,0,w,h); gr.addColorStop(0,A); gr.addColorStop(1,B); g.fillStyle=gr; g.fillRect(0,0,w,h);
      for(let v=0;v<10;v++){ let x=R()*w; g.strokeStyle=v<3?C:B; g.globalAlpha=v<3?.65:.4; g.lineWidth=v<3?1:1+R()*2.5; g.beginPath(); g.moveTo(x,0); for(let y=8;y<=h;y+=8){ x+=(R()-.5)*16; g.lineTo(x,y); } g.stroke(); } g.globalAlpha=1; }
    else if(kind==='stars'){ const gr=g.createLinearGradient(0,0,w,h); gr.addColorStop(0,A); gr.addColorStop(1,B); g.fillStyle=gr; g.fillRect(0,0,w,h);
      g.fillStyle=C; for(let i=0;i<90;i++){ g.globalAlpha=.3+R()*.7; g.beginPath(); g.arc(R()*w,R()*h,.4+R()*1.3,0,7); g.fill(); }
      g.strokeStyle=C; g.lineWidth=1; g.globalAlpha=.8; for(let i=0;i<6;i++){ const x=R()*w, y=R()*h, l=3+R()*3; g.beginPath(); g.moveTo(x-l,y); g.lineTo(x+l,y); g.moveTo(x,y-l); g.lineTo(x,y+l); g.stroke(); } g.globalAlpha=1; }
    else if(kind==='waves'){ g.lineWidth=2; for(let k=0;k<10;k++){ const y0=k*13+4; g.strokeStyle=(k%3)?B:C; g.globalAlpha=(k%3)?.7:.9; g.beginPath(); for(let x=0;x<=w;x+=4){ const y=y0+6*Math.sin(x/w*Math.PI*4+k); g[x?'lineTo':'moveTo'](x,y); } g.stroke(); } g.globalAlpha=1; }
    else if(kind==='weave'){ for(let y=0;y<16;y++) for(let x=0;x<16;x++){ g.fillStyle=((x+y)&1)?B:A; g.fillRect(x*8,y*8,8,8); g.fillStyle='rgba(255,255,255,.07)'; g.fillRect(x*8,y*8+((x+y)&1?0:4),8,2); }
      g.strokeStyle=C; g.globalAlpha=.55; g.lineWidth=1; for(let i=0;i<w;i+=32){ g.beginPath(); g.moveTo(i+.5,0); g.lineTo(i+.5,h); g.stroke(); } g.globalAlpha=1; }
    else if(kind==='glitch'){ const cols=[B,C,'#00ffff','#ff00ff','#ffffff'];
      for(let i=0;i<16;i++){ g.fillStyle=cols[(R()*cols.length)|0]; g.globalAlpha=.55+R()*.4; g.fillRect(R()*w*.6,R()*h,20+R()*w*.6,2+R()*10); } g.globalAlpha=.35; g.fillStyle='#000'; for(let y=0;y<h;y+=4) g.fillRect(0,y,w,1); g.globalAlpha=1; }
    else if(kind==='holo'){ const gr=g.createLinearGradient(0,0,w,h); gr.addColorStop(0,A); gr.addColorStop(1,B); g.fillStyle=gr; g.fillRect(0,0,w,h);
      const rb=g.createLinearGradient(0,0,w,h*.6); for(let i=0;i<=6;i++) rb.addColorStop(i/6,'hsla('+(i*60)+',100%,65%,.5)'); g.fillStyle=rb; g.fillRect(0,0,w,h);
      g.fillStyle='rgba(255,255,255,.12)'; for(let y=0;y<h;y+=6) g.fillRect(0,y,w,1); g.strokeStyle=C; g.globalAlpha=.4; g.lineWidth=1; for(let i=-h;i<w;i+=32){ g.beginPath(); g.moveTo(i,h); g.lineTo(i+h,0); g.stroke(); } g.globalAlpha=1; }
  });
  skinTexCache[key]=t; return t;
}
let legSkin=null;   // สกิน e/l ที่กำลังใส่ (มีชีวิต: เท็กซ์เจอร์ไหล + นีออนเต้น/ไล่สี) — คุมใน fxUpdate
const NEON_B=new THREE.Color(), NEON_B2=new THREE.Color(), _skc=new THREE.Color();
const TR_PLY=hdr(0xffe0a0,3);   // สีเส้นกระสุนของผู้เล่น (วัสดุร่วม เปลี่ยนสีด้วย copy ไม่สร้างใหม่)
const FLASH_DEF=hdr(0xffc070,3), FLIGHT_DEF=new THREE.Color(0xffaa55);
let SKFX=null;      // {spark:hex|null} สีประกายตอนโดนศัตรู (null = ค่าเดิม)
function applySkin(gunId){
  const id=(SEQ[gunId]&&SO.includes(SEQ[gunId]))?SEQ[gunId]:'default';
  const sk=SKINS.find(s=>s.id===id)||SKINS[0];
  const nt=!!(sk.tex&&NEWTEX.has(sk.tex));
  gMat.color.set(nt?0xffffff:sk.c1); gMat.metalness=sk.m??0.85; gMat.roughness=sk.ro??0.3;
  gMat.map=sk.tex?(nt?skinTex(sk.tex,sk.c1,sk.c2,sk.neon):skinTex(sk.tex,sk.c1,sk.neon)):null; if(gMat.map) gMat.map.offset.set(0,0); gMat.needsUpdate=true;
  gMat2.color.set(sk.c2); gNeon.color.set(sk.neon).multiplyScalar(2.5);
  NEON_B.set(sk.neon); NEON_B2.set(sk.neon2??sk.neon);
  legSkin=(sk.r==='e'||sk.r==='l')?sk:null;
  if(sk.fx){ TR_PLY.copy(hdr(sk.fx[0],3)); flash.material.color.copy(hdr(sk.fx[1],3)); flashLight.color.set(sk.fx[1]); SKFX={spark:sk.fx[2]}; }
  else { TR_PLY.copy(hdr(0xffe0a0,3)); flash.material.color.copy(FLASH_DEF); flashLight.color.copy(FLIGHT_DEF); SKFX=null; }
}
/* เรียกทุกเฟรม (ถูกมาก: ไม่สร้างอ็อบเจ็กต์) — สกิน e: เท็กซ์เจอร์เลื่อน + นีออนเต้นเป็นจังหวะ · สกิน l: ไล่สีรุ้ง หรือไล่สลับ 2 สี + สีเส้นกระสุน/แฟลชตามนีออน */
function skinLive(t){
  const sk=legSkin; if(!sk) return;
  const tm=gMat.map; if(tm){ tm.offset.x=(t*sk.sx)%1; tm.offset.y=(t*sk.sy)%1; }
  if(sk.live==='pulse') gNeon.color.copy(NEON_B).multiplyScalar(1.5+1.0*Math.sin(t*3.2));
  else if(sk.live==='lerp'){ _skc.copy(NEON_B).lerp(NEON_B2,0.5+0.5*Math.sin(t*1.4)); gNeon.color.copy(_skc).multiplyScalar(2.2+0.8*Math.sin(t*4)); }
  else { _skc.setHSL((t*0.12)%1,1,0.55); gNeon.color.copy(_skc).multiplyScalar(2.5);
    if(sk.id==='prismhue'){ TR_PLY.copy(_skc).multiplyScalar(3); flash.material.color.copy(_skc).multiplyScalar(3); flashLight.color.copy(_skc); SKFX.spark=_skc.getHex(); } }
}
/* ---- ช่องอาวุธ: 1 = ปืน, 2 = อาวุธสั้น ---- */
let slot=1, prevSlot=1, drawT=0, swingT=0;
/* ---- คอมโบ/ฟันหนัก/ตีด่วน (รอบ 9) : ปรับค่าได้ที่ตัวแปร const ชุดนี้ ---- */
const COMBO_WIN=0.6, COMBO3_MUL=1.3, HEAVY_HOLD=0.5, HEAVY_CD=2, HEAVY_MUL=2, HEAVY_LUNGE=2, HEAVY_LUNGE_T=0.14, FINISH_MUL=1.6, QM_CD=0.7;
/* ---- ท่าพิเศษ (สไลด์/กระโดดคู่/กระแทกพื้น) + ความรู้สึกมุมมอง : ปรับค่าที่นี่ ---- */
const SLIDE_T=0.7, SLIDE_DIST=7, SLIDE_V=2*SLIDE_DIST/SLIDE_T, SLIDE_CD=1.0, DJ_V=8.5, POUND_V=26, POUND_R=4, POUND_DMG=35, POUND_CD=6;
let slideT=0, slideDX=0, slideDZ=0, slideCD=0, slideK=0, slideId=0, airJumped=false, pounding=false, poundCD=0, camRoll=0, landA=0, landT=9, inspK=0;
const vfxV=()=>{ const v=+S.viewFx; return Number.isFinite(v)?clamp(v/100,0,1):1; };
let mcN=0, mcT=0, swingKind=0, swingRate=3, mHold=0, mHoldPrev=false, mSwung=false, mReady=false, heavyCD=0, lungeT=0, lungeDX=0, lungeDZ=0, heavyHitT=0, qmT=0, qmCD=0;
let curMode='semi', semiLatch=false, burstLeft=0, shotIdx=0, idleT=0, MS={};
function setSlot(n,instant,gid){
  const same=!gid||gid===selW;
  if(swapQ){ if(n===slot&&same){ swapQ=null; endAnim(true); } else { swapQ.n=n; swapQ.g=gid; } return; }   // กำลังเก็บอาวุธอยู่: เปลี่ยนเป้าหมาย/ยกเลิก
  if(n===slot&&same&&!instant) return;
  if(!instant&&state==='play'&&curModel&&curModel.g.visible){ const hd=playAnim('holster'); if(hd){ swapQ={n,t:hd,g:gid}; firing=false; return; } }
  setSlotNow(n,instant,gid);
}
/* เลือกช่องตามเลข UI: 1 ปืนหลัก · 2 ปืนพก · 3 อาวุธประชิด */
function uiSlot(k){
  if(state!=='play') return;
  if(k===3){ setSlot(2); return; }
  const gid=k===1?selP:selS; if(!gid||(slot===1&&gid===selW&&!swapQ)) return;
  setSlot(1,false,gid);
}
function swapGunNow(id){
  gunAmmo[selW]=ammo; selW=id; recalc(); ensureGun(id); setWeaponModel(id);
  ammo=gunAmmo[id]!==undefined?Math.min(gunAmmo[id],MAG):MAG; reloading=false; $('reloadT').style.display='none'; updAmmo();
}
function setSlotNow(n,instant,gid){
  if(n===slot&&!instant&&(!gid||gid===selW)) return;
  swapQ=null; endAnim(true);
  if(gid&&gid!==selW) swapGunNow(gid); qmT=0; heavyHitT=0; lungeT=0; mHoldPrev=false; mReady=false;
  if(!instant) mech('onSwap');
  burstLeft=0; semiLatch=false;
  chargeV=0; chargeRdy=false; prevSlot=slot; slot=n; drawT=instant?0:0.25; firing=false; swingT=0;
  if(slot===2){ aiming=false; reloading=false; $('reloadT').style.display='none'; }
  for(const k in GM) GM[k].g.visible=false; for(const k in MM) MM[k].g.visible=false;
  if(slot===1) ensureGun(selW); curModel=slot===1?(GM[selW]||GM.ar):(MM[selM]||MM.katana);
  if(slot===1&&curModel.muzzle) muzzle.position.set(...curModel.muzzle);
  curModel.g.visible=true;
  $('ammoWrap').style.display=slot===1?'':'none'; $('cross').style.display=slot===1?'':'none';
  { const ui=slot===2?3:(selW===selP?1:2); if(ui!==curUI){ prevUI=curUI; curUI=ui; } }
  $('wName').textContent='['+curUI+'] '+(slot===1?W.name:MW.name);
  curFeel=slot===1?(CLS_FEEL[animCls(selW)]||CLS_FEEL.rifle):CLS_FEEL.melee;
  if(!instant){ const dd=playAnim('draw'); if(dd) drawT=dd; }
  sfx('drawSnd');
}
function setWeaponModel(id){ applySkin(id); MS={}; fuelV=WDEF[id].fuel?WDEF[id].fuel.max:0; fuelShown=-1; heatV=0; heatLock=false; heatUsed=false; hotV=0; hotLock=false; hotStreak=0; hotIdle=1; hotShown=-1; chargeV=0; chargeRdy=false; burstLeft=0; semiLatch=false; shotIdx=0; curMode=(WDEF[id].mechParams&&WDEF[id].mechParams.defMode)||'semi'; setSlot(1,true); mech('init'); }

// ---- ข้อมูลอาวุธ (cd=วินาทีต่อนัด, ui=แถบสถิติ 0-1: ดาเมจ,ความเร็ว,กระสุน,ความแม่น) ----
const WORDER=['pistol','viper18','triad3','ricochet','taser','magnum','hammer','triplet','stinger','twin','wasp','tempest','brawler','smg','whisper','ar','cinder','frostbite','gale','bulwark','ranger','shotgun','twindrake','autohail','dragonbreath','sniper','banshee','hawk','raillance','arccaster','plasma','singularity','inferno','nailer','quake','lobber','nightbolt','chakram','hornet','minelayer','sentry','hailstorm','havoc'];
const CLS_ORDER=['pistol','smg','rifle','shotgun','sniper','lmg','special'];
const CLS_TH={pistol:'ปืนพก',smg:'SMG',rifle:'ไรเฟิล',shotgun:'ลูกซอง',sniper:'สไนเปอร์',lmg:'LMG',special:'พิเศษ'};
/* ===== ตาราง TTK (วินาที) ที่ 10 ม. ไม่มีอัปเกรด · ยิงต่อเนื่องรวมรีโหลด · เข้าลำตัว ·
   คิดเฉพาะดาเมจตรง (ปืนระเบิด/สถานะ/ทะลุ มีค่าเพิ่มจาก AOE-CC นอกตาราง) ·  DRONE40 / HUNTER32 / TITAN260 ======
   ปืน           DPS   DRONE HUNTER TITAN
   ar             101   0.40  0.32   2.57
   ranger         100   0.40  0.32   2.60
   plasma          98   0.41  0.33   2.66
   bulwark         96   0.42  0.33   2.71
   gale            91   0.44  0.35   2.87
   whisper         85   0.47  0.38   3.06
   hammer          83   0.48  0.38   3.12
   smg             83   0.48  0.38   3.12
   brawler         83   0.48  0.39   3.14
   pistol          82   0.48  0.39   3.15
   stinger         78   0.51  0.41   3.34
   twindrake       78   0.51  0.41   3.34
   hawk            77   0.52  0.41   3.36
   hailstorm       76   0.52  0.42   3.40
   banshee         76   0.53  0.42   3.43
   autohail        75   0.53  0.43   3.47
   wasp            75   0.54  0.43   3.48
   triplet         74   0.54  0.43   3.50
   minelayer       73   0.54  0.44   3.54
   cinder          73   0.55  0.44   3.55
   triad3          71   0.56  0.45   3.66
   sniper          71   0.57  0.45   3.69
   magnum          70   0.57  0.46   3.70
   raillance       68   0.59  0.47   3.81
   viper18         68   0.59  0.47   3.82
   tempest         67   0.60  0.48   3.89
   frostbite       67   0.60  0.48   3.90
   shotgun         65   0.62  0.49   4.00
   inferno         60   0.67  0.53   4.33
   ricochet        58   0.69  0.55   4.49
   lobber          54   0.74  0.59   4.83
   twin            53   0.75  0.60   4.87
   dragonbreath    48   0.83  0.66   5.40
   nightbolt       46   0.87  0.69   5.63
   havoc           46   0.87  0.70   5.66
   arccaster       45   0.89  0.71   5.78
   nailer          41   0.97  0.77   6.28
   chakram         33   1.22  0.97   7.90
   quake           31   1.27  1.02   8.27
   taser           26   1.51  1.21   9.84
   hornet          23   1.74  1.40  11.34
   singularity      2  17.50 14.00 113.75
   เป้าหมาย: ปืนเดี่ยวอยู่ในช่วง ~55–100 DPS · ปืนที่ต่ำกว่านั้น (taser/hornet/quake/chakram/singularity/arccaster/nailer) ชดเชยด้วย CC/AOE/ทะลุ ===== */
const WDEF={
  pistol:{id:'pistol',name:'NX-9 PISTOL',th:'ปืนพก',color:'#00e5ff',desc:'เบา แม่นยำ คริติคอลแรง เหมาะมือใหม่',dmg:22,cd:0.2,mag:15,reload:1.0,spread:0.005,crit:2.4,recoil:0.016,kick:1.2,zoom:0.25,flash:0.28,ui:[0.38,0.35,0.3,0.9]},
  smg:{id:'smg',name:'VECTOR-X SMG',th:'ปืนกลมือ',color:'#ff2bd6',desc:'ยิงรัวเร็วมาก กระสุนเยอะ แต่กระสุนกระจายง่าย',dmg:9.5,cd:0.055,mag:40,reload:1.45,spread:0.02,crit:2,recoil:0.005,kick:0.8,zoom:0.3,flash:0.3,ui:[0.2,1,0.8,0.35]},
  ar:{id:'ar',name:'AR-77 RIFLE',th:'ปืนไรเฟิล',color:'#7fe9ff',desc:'สมดุลทุกด้าน ใช้ง่าย (ปืนเดิมของเกม)',dmg:14,cd:0.095,mag:30,reload:1.3,spread:0.012,crit:2,recoil:0.011,kick:1,zoom:0.32,flash:0.35,ui:[0.4,0.7,0.6,0.7]},
  shotgun:{id:'shotgun',name:'BREAKER-12',th:'ลูกซอง',color:'#ffb300',desc:'แรงสุดในระยะใกล้ ยิง 8 เม็ดกระจาย',dmg:13,cd:0.85,mag:6,reload:2.1,spread:0.01,cone:0.05,pellets:8,crit:1.8,recoil:0.045,kick:1.8,zoom:0.2,flash:0.6,ui:[0.9,0.2,0.2,0.25]},
  magnum:{id:'magnum',name:'MAGNUM-R6',th:'ปืนลูกโม่',color:'#ffd166',desc:'6 นัด ดาเมจหนักสุดในปืนพก คริติคอลแรงมาก',dmg:62,cd:0.55,mag:6,reload:2.0,spread:0.004,crit:3,recoil:0.04,kick:2,zoom:0.28,flash:0.5,ui:[0.7,0.25,0.15,0.9]},
  hailstorm:{id:'hailstorm',name:'HAILSTORM',th:'ปืนกลหนัก',color:'#ff6a3d',desc:'กระสุน 120 นัด ยิงรัวมาก ต้องรอลำกล้องหมุน เดินช้าลง',dmg:7,cd:0.045,mag:120,reload:3.4,spread:0.035,crit:1.6,recoil:0.004,kick:0.5,zoom:0.15,flash:0.4,spinup:0.5,slow:0.7,ui:[0.15,1,1,0.15]},
  havoc:{id:'havoc',name:'HAVOC',th:'เครื่องยิงจรวด',color:'#c77dff',desc:'จรวดระเบิดวงกว้าง ไม่ทำดาเมจตัวเอง กระสุนน้อย',dmg:95,cd:1.0,mag:3,reload:3.2,spread:0.004,crit:1,rocket:true,recoil:0.05,kick:2.2,zoom:0.3,flash:0.7,ui:[1,0.15,0.1,0.8]},
  sniper:{id:'sniper',name:'LONGBOW-X',th:'สไนเปอร์',color:'#00ff88',desc:'ดาเมจมหาศาล ยิงทะลุศัตรูได้ ส่องกล้องเล็ง',dmg:110,cd:1.1,mag:5,reload:2.3,spread:0.0015,hip:6,crit:2.5,pierce:3,recoil:0.055,kick:2,zoom:0.72,aimSens:0.8,scope:true,flash:0.6,ui:[1,0.1,0.15,1]},
};
// ---- ปืนใหม่รอบ 3A (5 กระบอกแรก) ----
Object.assign(WDEF,{
  hammer:{id:'hammer',name:'HAMMER-45',th:'ปืนพก .45',color:'#ff8a3d',desc:'ปืนพกลำกล้องใหญ่ ดาเมจหนัก แรงถอยแรงแต่ฟื้นไว นัดสุดท้ายในแม็กแรงขึ้น 1.5 เท่า สไลด์จะค้างให้เห็น',
    dmg:38,cd:0.3,mag:8,reload:1.25,spread:0.006,crit:2.2,recoil:0.034,kick:2.2,zoom:0.26,flash:0.45,ui:[0.55,0.3,0.25,0.85],
    cls:'pistol',fireMode:'semi',ads:0.14,recoilRecover:0.15,mechanic:'lastRound'},
  triplet:{id:'triplet',name:'TRIPLET-3',th:'ปืนพกยิงชุด',color:'#ffe066',desc:'ลั่นไกครั้งเดียวยิง 3 นัดติด ถ้าโดนศัตรูครบ 3 นัด รีโหลดครั้งต่อไปจะเร็วเป็นพิเศษ',
    dmg:17,cd:0.36,mag:18,reload:1.3,spread:0.007,crit:2.1,recoil:0.02,kick:1.2,zoom:0.26,flash:0.3,ui:[0.4,0.55,0.4,0.85],
    cls:'pistol',fireMode:'burst',burst:3,burstGap:0.055,ads:0.14,mechanic:'burstChain'},
  stinger:{id:'stinger',name:'STINGER-MP',th:'ปืนกลมือขนาดพก',color:'#5dff7a',desc:'กด B สลับกึ่งอัตโนมัติ (แม่น ดาเมจสูงขึ้น) หรืออัตโนมัติ (รัวเร็วแต่กระสุนกระจายตามจำนวนนัดที่ยิงต่อเนื่อง)',
    dmg:8,cd:0.06,mag:28,reload:1.2,spread:0.016,crit:1.9,recoil:0.006,kick:0.7,zoom:0.28,flash:0.3,ui:[0.2,0.9,0.5,0.5],
    cls:'pistol',fireMode:'select',mechParams:{defMode:'semi'},ads:0.15,mechanic:'bloomSpray'},
  twin:{id:'twin',name:'TWIN-9',th:'ปืนพกคู่',color:'#7fb2ff',desc:'ปืนพกคู่ ไขว้แขนกว้างเป็นรูปกากบาท ปืนชี้ตรงไปข้างหน้า ยิงสลับซ้ายขวา ไม่มีการเล็ง วิ่งเร็วขึ้น 30% (วิ่งแล้วยิงความเร็วไม่ลด) ยิงเร็วขึ้น 30% กระสุนตามศัตรูได้เล็กน้อยใน 2 วินาทีแรก แล้วพุ่งตรงต่อ',
    dmg:12,cd:0.1,mag:30,reload:1.5,spread:0.02,crit:2,recoil:0.007,kick:0.9,zoom:0,flash:0.3,ui:[0.3,0.65,0.7,0.45],slow:1.3,
    proj:{speed:55,dmg:1,homing:true,turn:3.5,cone:0.9,homeT:2,life:3,size:0.09,color:0x7fb2ff,glow:true,glowSize:0.35},
    cls:'pistol',fireMode:'auto',noAds:true,noAim:true,runFire:true,ads:0.15,mechanic:'akimbo'},
  whisper:{id:'whisper',name:'WHISPER-S',th:'SMG ท่อเก็บเสียง',color:'#9fb2c8',desc:'ไม่มีแสงปากกระบอก เส้นกระสุนจาง เสียงเบา ศัตรูที่ถูกยิงครั้งแรกตอบสนองช้าลง แต่ดาเมจลดลงตามระยะไกล',
    dmg:9.5,cd:0.068,mag:32,reload:1.4,spread:0.014,crit:2,recoil:0.005,kick:0.6,zoom:0.3,flash:0,ui:[0.25,0.85,0.7,0.65],
    cls:'smg',silent:true,suppressed:true,ads:0.16,mechanic:'suppressed'},
});
Object.assign(WDEF,{
  viper18:{id:'viper18',name:'VIPER-18',th:'ปืนพกรัว',color:'#5dff7a',desc:'ปืนพกยิงรัว กระดกสูง กระจายปานกลาง เบา เดินเร็วขึ้นเล็กน้อยตอนถือ',
    dmg:9,cd:0.06,mag:24,reload:1.1,spread:0.02,crit:2,recoil:0.012,kick:0.8,zoom:0.25,flash:0.28,ui:[0.2,0.95,0.5,0.4],
    cls:'pistol',fireMode:'auto',slow:1.06,ads:0.13,mechanic:'quick'},
  triad3:{id:'triad3',name:'TRIAD-3',th:'ปืนพกยิงชุด 3 นัด',color:'#ffd166',desc:'ลั่นไกครั้งเดียวยิง 3 นัดแม่นมาก คริติคอลดี',
    dmg:15,cd:0.35,mag:18,reload:1.1,spread:0.004,crit:2.8,recoil:0.016,kick:1,zoom:0.26,flash:0.3,ui:[0.45,0.5,0.4,0.95],
    cls:'pistol',fireMode:'burst',burst:3,burstGap:0.05,ads:0.14},
  ricochet:{id:'ricochet',name:'RICOCHET-R',th:'ปืนพกกระสุนเด้ง',color:'#ffe066',desc:'กระสุนเด้งกำแพงได้ 2 ครั้ง ไปโดนศัตรูหลังที่กำบัง (ดาเมจลด 25% ต่อการเด้ง)',
    dmg:22,cd:0.28,mag:12,reload:1.2,spread:0.005,crit:2,recoil:0.02,kick:1.2,zoom:0.26,flash:0.35,ui:[0.45,0.45,0.35,0.85],
    cls:'pistol',fireMode:'semi',bounce:2,ads:0.14,mechanic:'ricochet'},
  taser:{id:'taser',name:'STINGER-T',th:'ปืนพกเทเซอร์',color:'#7fe9ff',desc:'ยิงโดนแล้วสตัน 0.8 วิ (TITAN/AEGIS ได้ผลน้อยกว่า) มีเส้นไฟฟ้า',
    dmg:14,cd:0.4,mag:10,reload:1.3,spread:0.005,crit:2,recoil:0.012,kick:0.9,zoom:0.26,flash:0.3,ui:[0.2,0.4,0.3,0.9],
    cls:'pistol',fireMode:'semi',ads:0.14,mechanic:'stunShot'},
  tempest:{id:'tempest',name:'TEMPEST',th:'SMG ยิงชุด 4 นัด',color:'#ff7ad9',desc:'ลั่นไกครั้งเดียวยิง 4 นัดหนักแน่น เดินคล่องกว่าปกติ',
    dmg:13,cd:0.3,mag:32,reload:1.5,spread:0.016,crit:2,recoil:0.007,kick:0.9,zoom:0.3,flash:0.35,ui:[0.35,0.7,0.65,0.6],
    cls:'smg',fireMode:'burst',burst:4,burstGap:0.045,slow:1.05,ads:0.16,mechanic:'agile'},
  brawler:{id:'brawler',name:'BRAWLER-45',th:'SMG ดาเมจหนัก',color:'#ff5a3d',desc:'ดาเมจต่อนัดสูง แรงสะท้อนแรง เหมาะระยะใกล้-กลาง',
    dmg:17,cd:0.1,mag:25,reload:1.6,spread:0.02,crit:2,recoil:0.016,kick:1.3,zoom:0.28,flash:0.45,ui:[0.5,0.7,0.5,0.45],
    cls:'smg',fireMode:'auto',ads:0.17},
  gale:{id:'gale',name:'GALE-AR',th:'ไรเฟิลยิงชุด 3 นัด',color:'#7fe9ff',desc:'ยิงชุด 3 นัดแม่นมาก เหมาะระยะกลาง-ไกล',
    dmg:16,cd:0.28,mag:30,reload:1.3,spread:0.004,crit:2.2,recoil:0.01,kick:1,zoom:0.36,flash:0.4,ui:[0.45,0.6,0.6,0.95],
    cls:'rifle',fireMode:'burst',burst:3,burstGap:0.06,ads:0.2},
  bulwark:{id:'bulwark',name:'BULWARK',th:'ไรเฟิลหนัก',color:'#ffb300',desc:'ดาเมจสูง แรงสะท้อนแรง เดินช้าลง 10% แต่ลดดาเมจที่ได้รับ 10% ตอนยิง',
    dmg:22,cd:0.15,mag:24,reload:1.9,spread:0.014,crit:2,recoil:0.02,kick:1.6,zoom:0.3,flash:0.5,ui:[0.65,0.55,0.45,0.6],
    cls:'rifle',fireMode:'auto',slow:0.9,fireDR:0.1,ads:0.24,mechanic:'heavyAr'},
  ranger:{id:'ranger',name:'RANGER-DMR',th:'ไรเฟิลมาร์กแมน',color:'#00ff88',desc:'ยิงแม่นระยะไกล ซูมได้ 2 ระดับ คริติคอล x2.5',
    dmg:40,cd:0.28,mag:15,reload:1.8,spread:0.0025,hip:3,crit:2.5,recoil:0.022,kick:1.4,zoom:0.5,zoom2:0.72,aimSens:0.7,flash:0.45,ui:[0.75,0.45,0.35,0.95],
    cls:'rifle',fireMode:'semi',ads:0.26,mechanic:'dmr'},
  cinder:{id:'cinder',name:'CINDER',th:'ไรเฟิลเพลิง',color:'#ff7a3d',desc:'กระสุนเพลิง ทุกนัดที่โดนทำให้ศัตรูติดไฟ 5/วินาที นาน 3 วินาที (ไม่ซ้อน แต่ต่อเวลา)',
    dmg:11,cd:0.1,mag:30,reload:1.5,spread:0.012,crit:2,recoil:0.01,kick:1,zoom:0.32,flash:0.4,ui:[0.4,0.7,0.6,0.7],
    cls:'rifle',fireMode:'auto',hitStatus:['burn',3,5],ads:0.2,mechanic:'burnShot'},
  frostbite:{id:'frostbite',name:'FROSTBITE',th:'ไรเฟิลน้ำแข็ง',color:'#8fe9ff',desc:'ทุกนัดสะสมความเย็น ช้าลง 35% ครบ 5 ชั้นแข็งตัว 1.5 วิ ศัตรูที่แข็งรับดาเมจ +30% และแตกกระจายเมื่อตาย',
    dmg:10,cd:0.1,mag:30,reload:1.5,spread:0.011,crit:2,recoil:0.009,kick:0.9,zoom:0.32,flash:0.35,ui:[0.35,0.7,0.6,0.75],
    cls:'rifle',fireMode:'auto',hitStatus:['slow',1],ads:0.2,mechanic:'frost'},
  twindrake:{id:'twindrake',name:'TWIN-DRAKE',th:'ลูกซองสองลำกล้อง',color:'#ff5a3d',desc:'ยิงได้ 2 ช็อตติดกันแล้วต้องรีโหลด ระยะใกล้แรงมาก',
    dmg:14,cd:0.25,mag:2,reload:2.2,spread:0.01,cone:0.07,pellets:10,crit:1.8,recoil:0.05,kick:2.3,zoom:0.2,flash:0.8,ui:[1,0.3,0.1,0.2],
    cls:'shotgun',fireMode:'double',ads:0.22,mechanic:'dbl'},
  autohail:{id:'autohail',name:'AUTO-HAIL',th:'ลูกซองอัตโนมัติ',color:'#ffb300',desc:'ลูกซองรัว ยิงต่อเนื่องแล้วกระสุนจะกระจายกว้างขึ้นเรื่อยๆ',
    dmg:7,cd:0.22,mag:12,reload:2.4,spread:0.012,cone:0.04,pellets:6,crit:1.7,recoil:0.02,kick:1.3,zoom:0.22,flash:0.55,ui:[0.6,0.55,0.45,0.3],
    cls:'shotgun',fireMode:'auto',ads:0.22,mechanic:'hailBloom'},
  dragonbreath:{id:'dragonbreath',name:"DRAGON'S BREATH",th:'ลูกซองเพลิง',color:'#ff6a3d',desc:'เม็ดกระสุนเป็นไฟ ศัตรูที่โดนติดไฟ มีประกายไฟพุ่งยาวจากปากกระบอก',
    dmg:11,cd:0.8,mag:6,reload:2.4,spread:0.01,cone:0.05,pellets:7,crit:1.6,recoil:0.04,kick:2,zoom:0.2,flash:0.8,ui:[0.7,0.2,0.3,0.3],
    cls:'shotgun',fireMode:'semi',hitStatus:['burn',3,5],ads:0.22,mechanic:'dragon'},
  banshee:{id:'banshee',name:'BANSHEE',th:'สไนเปอร์กึ่งอัตโนมัติ',color:'#c77dff',desc:'ยิงติดกันได้ ซูมกลาง ทะลุศัตรู 2 ตัว',
    dmg:55,cd:0.45,mag:8,reload:2.2,spread:0.002,hip:5,crit:2.2,pierce:2,recoil:0.03,kick:1.6,zoom:0.6,aimSens:0.75,scope:true,flash:0.55,ui:[0.75,0.4,0.3,0.9],
    cls:'sniper',fireMode:'semi',ads:0.3,mechanic:'pierce2'},
  hawk:{id:'hawk',name:'HAWK-L',th:'สไนเปอร์เบา',color:'#9fffd0',desc:'เบา เล็งไว เดินคล่อง ซูมน้อยกว่า LONGBOW กระสุนไม่กระจายแม้ไม่เล็ง',
    dmg:80,cd:0.7,mag:6,reload:2.0,spread:0.002,hip:1.5,crit:2.3,recoil:0.035,kick:1.5,zoom:0.45,aimSens:0.85,scope:true,slow:1.08,flash:0.5,ui:[0.85,0.3,0.25,0.95],
    cls:'sniper',fireMode:'semi',ads:0.18,mechanic:'light'},
  raillance:{id:'raillance',name:'RAIL-LANCE',th:'เรลกัน',color:'#7fe9ff',desc:'กดค้างชาร์จ 0.8 วิ ปล่อยแล้วเป็นลำแสงทะลุศัตรูทุกตัวในแนว',
    dmg:140,cd:0.6,mag:4,reload:2.6,spread:0.001,crit:2.6,pierce:99,pierceF:1,chargeT:0.8,beamLife:0.25,beamThick:6,recoil:0.05,kick:2.5,zoom:0.3,flash:0.9,ui:[1,0.15,0.15,1],
    cls:'special',fireMode:'charge',ads:0.25,mechanic:'rail'},
  arccaster:{id:'arccaster',name:'ARC-CASTER',th:'ปืนสายฟ้า',color:'#7fe9ff',desc:'ลำสายฟ้าต่อเนื่อง ไม่ใช้กระสุนแต่ใช้ความร้อน กระโดดลูกโซ่ไปศัตรูใกล้เคียง 3 ตัว ติดสถานะช็อต',
    dmg:45,dps:45,range:35,mag:100,reload:1,cd:0.1,spread:0.008,crit:1,recoil:0.001,kick:0.2,zoom:0.2,flash:0.3,ui:[0.6,1,1,0.75],
    heat:{max:100,perSec:40,cool:26},beamStatus:['shock',9],cls:'special',fireMode:'beam',ads:0.2,mechanic:'arc'},
  plasma:{id:'plasma',name:'ARTMA CABINE 01',th:'คาร์บินพลาสมา',color:'#00e5ff',desc:'โพรเจกไทล์พลาสมา 60 ม./วิ ระเบิดเล็กเมื่อชน กระสุนไม่จำกัด ยิงต่อเนื่องยิ่งเร็วขึ้น +2%/นัด สุ่ม 30% ยิงสามนัด แต่ยิงต่อเนื่องเกิน 30 นัดปืนจะร้อนขึ้น +2% ต่อนัด ร้อน 100% ต้องรอเย็น 10 วิ',
    dmg:19,cd:0.15,mag:36,reload:1.6,spread:0.01,crit:1,recoil:0.00933,kick:0.8,zoom:0.3,flash:0.3,ui:[0.45,0.65,0.65,0.7],
    proj:{speed:60,dmg:1,aoeR:2.5,aoeMul:0.5,aoeFall:0.4,life:3,color:0x00e5ff,glow:true,glowSize:1.0,size:0.16,trail:1,trailColor:0x7fe9ff,light:true,noShake:true},
    hot:{free:30,heat:2,cool:80,lockT:10,triple:0.3,step:0.02},cls:'rifle',fireMode:'projectile',ads:0.2,mechanic:'plasmaM'},
  singularity:{id:'singularity',name:'SINGULARITY',th:'เครื่องยิงหลุมดำ',color:'#b26bff',desc:'ยิงลูกพลังงานตกที่เป้า สร้างหลุมดำนาน 3 วิ รัศมี 8 ม. ดูดศัตรูและทำดาเมจต่อเนื่อง (TITAN ดูดยาก)',
    dmg:8,cd:2.5,mag:3,reload:3.0,spread:0.004,crit:1,recoil:0.04,kick:2,zoom:0.25,flash:0.7,ui:[0.5,0.1,0.1,0.6],
    proj:{speed:34,grav:0.6,life:2.6,size:0.28,color:0xb26bff,glow:true,glowSize:1.6,trail:1,trailColor:0xb26bff,light:true,hole:{R:8,dur:3,dps:8}},
    cls:'special',fireMode:'semi',ads:0.25,mechanic:'singM'},
  inferno:{id:'inferno',name:'INFERNO',th:'พ่นไฟ',color:'#ff7a1a',desc:'พ่นไฟเป็นกรวยระยะ 8 ม. ติดไฟ ใช้เชื้อเพลิง 100 หน่วย หมดแล้วต้องรีโหลด ไม่ทะลุกำแพง',
    dmg:60,dps:60,range:8,cone:0.4,fuel:{max:100,perSec:26},mag:100,reload:2.5,cd:0.05,spread:0.01,crit:1,recoil:0.0005,kick:0.15,zoom:0.15,flash:0,silent:true,ui:[0.85,1,0.5,0.5],
    cls:'special',fireMode:'beam',ads:0.3,noAds:true,mechanic:'flameM'},
  nailer:{id:'nailer',name:'NAILER',th:'ปืนตอกตะปู',color:'#ffd166',desc:'ตะปูปักติดศัตรู/กำแพง แล้วระเบิดหลัง 1.2 วิ ติดอยู่ได้พร้อมกันสูงสุด 30 ตัว',
    dmg:6,cd:0.1,mag:40,reload:1.8,spread:0.012,crit:1,recoil:0.004,kick:0.6,zoom:0.3,flash:0.3,ui:[0.3,0.9,0.85,0.6],
    proj:{speed:70,dmg:1,sticky:true,fuse:1.2,aoeR:2,aoeMul:5,aoeFall:0.3,quiet:true,nail:true,maxStuck:30,life:3,size:0.07,color:0xffd166,glow:true,glowSize:0.45},
    cls:'smg',fireMode:'projectile',ads:0.17,mechanic:'nailerM'},
  quake:{id:'quake',name:'QUAKE-12',th:'ปืนคลื่นเสียง',color:'#ffd166',desc:'ยิงคลื่นกระแทกเป็นกรวยระยะสั้น 7 ม. ผลักถอยแรงมาก ไม่ทะลุกำแพง',
    dmg:55,cd:1.2,mag:4,reload:2.2,spread:0.001,crit:1,recoil:0.06,kick:2.6,zoom:0.22,flash:0.8,sonic:{range:7,half:0.5,kb:22},ui:[0.8,0.2,0.2,0.4],
    cls:'special',fireMode:'semi',ads:0.22,mechanic:'quakeM'},
  lobber:{id:'lobber',name:'LOBBER',th:'ปืนยิงลูกระเบิด',color:'#9fff5d',desc:'ลูกระเบิดวิถีโค้ง เด้งกำแพง/พื้นได้ ระเบิดเมื่อชนศัตรูหรือครบ 1.5 วิ ไม่ทำดาเมจผู้เล่น',
    dmg:70,cd:0.9,mag:6,reload:2.4,spread:0.006,crit:1,recoil:0.03,kick:1.8,zoom:0.25,flash:0.6,ui:[0.85,0.25,0.3,0.5],
    proj:{speed:26,lift:4,grav:1,bounces:4,bdamp:0.5,aoeR:5,aoeMul:1,aoeFall:0.5,life:1.5,size:0.16,color:0x9fff5d,glow:true,glowSize:0.7,trail:1,trailColor:0x9fff5d},
    cls:'special',fireMode:'semi',ads:0.25,mechanic:'lobM'},
  nightbolt:{id:'nightbolt',name:'NIGHTBOLT',th:'หน้าไม้',color:'#6dff9a',desc:'หน้าไม้เสียงเงียบ ลูกศรฝังกำแพง/ศัตรูได้ แล้วระเบิด 3 ม. ยิงโดนหัวดาเมจ x2.5',
    dmg:60,cd:0.9,mag:5,reload:2.0,spread:0.002,crit:2.5,recoil:0.04,kick:1.6,zoom:0.4,flash:0.2,silent:true,ui:[0.8,0.25,0.2,0.7],
    proj:{speed:120,grav:0.12,dmg:1,sticky:true,fuse:0.45,aoeR:3,aoeMul:0.4167,aoeFall:0.3,headMul:2.5,nail:true,nth:1.6,len:2.6,maxStuck:6,life:3,size:0.06,color:0x6dff9a,glow:true,glowSize:0.5},
    cls:'special',fireMode:'semi',ads:0.22,mechanic:'xbowM'},
  chakram:{id:'chakram',name:'CHAKRAM',th:'เครื่องยิงจานตัด',color:'#7df9ff',desc:'จานตัดพุ่ง 25 ม. แล้ววนกลับหาผู้เล่น ทะลุศัตรู โดนได้ 2 ครั้ง (ไป-กลับ) จานที่กลับมาเติมกระสุนเอง',
    dmg:34,cd:0.7,mag:6,reload:2.0,spread:0.004,crit:1,recoil:0.02,kick:1.2,zoom:0.25,flash:0.4,ui:[0.5,0.45,0.6,0.5],
    proj:{speed:42,dmg:1,pierce:999,boomer:25,disc:true,life:7,size:0.32,color:0x7df9ff,glow:true,glowSize:1.0},
    cls:'special',fireMode:'projectile',ads:0.22,mechanic:'chakM'},
  hornet:{id:'hornet',name:'HORNET',th:'จรวดไมโครนำวิถี',color:'#ffb347',desc:'ยิงจรวดจิ๋ว 4 ลูก/ชุด ตามเป้าใกล้ศูนย์เล็งแบบอ่อน ระเบิดเล็ก',
    dmg:22,cd:1.4,mag:8,reload:2.8,spread:0.02,crit:1,recoil:0.03,kick:1.4,zoom:0.25,flash:0.5,ui:[0.6,0.4,0.4,0.5],
    proj:{speed:30,dmg:0,aoeR:2.2,aoeMul:1,aoeFall:0.4,homing:true,turn:2.4,cone:0.9,scatter:2.5,trail:1,trailColor:0xdddddd,life:3.5,size:0.1,color:0xffb347,glow:true,glowSize:0.5},
    cls:'special',fireMode:'burst',burst:4,burstGap:0.09,ads:0.22,mechanic:'hornetM'},
  minelayer:{id:'minelayer',name:'MINELAYER',th:'ปืนวางทุ่นระเบิด',color:'#ff3b6b',desc:'ยิงทุ่นไปติดพื้น/กำแพง กะพริบแล้วระเบิดเมื่อศัตรูเข้าใกล้ วางได้ 4 ลูก ไม่ทำดาเมจผู้เล่น',
    dmg:90,cd:0.6,mag:4,reload:2.5,spread:0.006,crit:1,recoil:0.03,kick:1.6,zoom:0.25,flash:0.5,ui:[0.85,0.3,0.2,0.4],
    proj:{speed:26,grav:1,dmg:0,sticky:true,mine:2.4,fuse:150,life:150,aoeR:4,aoeMul:1,aoeFall:0.4,maxStuck:4,size:0.17,color:0xff3b6b,glow:true,glowSize:0.9},
    cls:'special',fireMode:'semi',ads:0.25,mechanic:'mineM'},
  sentry:{id:'sentry',name:'SENTRY-KIT',th:'ชุดตั้งป้อมปืน',color:'#2cf2ff',desc:'กดยิงเพื่อวางป้อมตรงที่เล็ง อยู่ 15 วิ ยิงศัตรูใกล้สุดในระยะ 22 ม. เลือด 80 คูลดาวน์ 20 วิ',
    dmg:6,cd:0.5,mag:1,reload:1,spread:0,crit:1,recoil:0,kick:0.6,zoom:0.2,flash:0,silent:true,ui:[0.5,0.9,0.3,0.4],
    deploy:{t:15,cd:20,hp:80,range:22},cls:'smg',fireMode:'deploy',ads:0.2,noAds:true,mechanic:'sentryM'},
  wasp:{id:'wasp',name:'WASP-PDW',th:'SMG ยิงเร็วสุด',color:'#ff9d3d',desc:'ยิงเร็วสุดในกลุ่ม แรงสะท้อนต่ำ แต่กระสุนกระจายกว้าง',
    dmg:7,cd:0.045,mag:50,reload:1.5,spread:0.03,crit:1.9,recoil:0.003,kick:0.5,zoom:0.3,flash:0.3,ui:[0.18,1,0.9,0.3],
    cls:'smg',fireMode:'auto',ads:0.17,mechanic:'sprayer'},
});
const WDEF_DEFAULT={cls:'rifle',fireMode:'auto',burst:0,burstGap:0.06,ads:0.2,recoilPattern:null,recoilRecover:0.3,mechanic:null,mechParams:{},silent:false,noAds:false};
const WX={pistol:{cls:'pistol',ads:0.14},magnum:{cls:'pistol',ads:0.16},smg:{cls:'smg',ads:0.17},ar:{cls:'rifle',ads:0.2},shotgun:{cls:'shotgun',ads:0.22},sniper:{cls:'sniper',ads:0.35},hailstorm:{cls:'lmg',ads:0.3},havoc:{cls:'special',ads:0.28}};
for(const k in WDEF){ WDEF[k]=Object.assign({},WDEF_DEFAULT,WX[k]||{},WDEF[k]); }
const ICON={
  magnum:'<rect x="30" y="11" width="56" height="7" rx="2"/><rect x="26" y="9" width="24" height="12" rx="3"/><polygon points="30,21 44,21 40,37 32,37"/><rect x="86" y="13" width="10" height="4"/>',
  hailstorm:'<rect x="40" y="11" width="62" height="4"/><rect x="40" y="17" width="62" height="4"/><rect x="40" y="23" width="62" height="4"/><rect x="18" y="9" width="26" height="20" rx="3"/><rect x="24" y="29" width="14" height="9"/><rect x="6" y="14" width="14" height="6"/>',
  havoc:'<rect x="14" y="10" width="86" height="14" rx="5"/><rect x="98" y="8" width="12" height="18" rx="3"/><rect x="40" y="24" width="8" height="13"/><rect x="66" y="24" width="8" height="12"/><rect x="50" y="3" width="22" height="7" rx="2"/>',

  pistol:'<rect x="26" y="10" width="62" height="11" rx="2"/><polygon points="34,21 52,21 47,37 37,37"/><rect x="86" y="13" width="10" height="5"/>',
  smg:'<rect x="14" y="13" width="66" height="12" rx="2"/><rect x="80" y="16" width="30" height="7" rx="3"/><rect x="48" y="25" width="9" height="14"/><polygon points="30,25 42,25 40,38 32,38"/><rect x="4" y="15" width="12" height="6"/>',
  ar:'<rect x="24" y="12" width="58" height="10" rx="2"/><rect x="80" y="15" width="34" height="4"/><rect x="46" y="22" width="9" height="15"/><polygon points="34,22 44,22 42,36 35,36"/><polygon points="4,12 24,12 24,24 6,28"/><rect x="40" y="7" width="18" height="5"/>',
  shotgun:'<rect x="40" y="12" width="74" height="4"/><rect x="40" y="18" width="58" height="3"/><rect x="26" y="11" width="22" height="11" rx="2"/><rect x="62" y="17" width="18" height="7" rx="2" opacity=".6"/><polygon points="3,14 28,11 28,23 8,29"/>',
  sniper:'<rect x="46" y="17" width="70" height="3"/><rect x="18" y="14" width="34" height="9" rx="2"/><rect x="30" y="5" width="36" height="7" rx="3"/><rect x="36" y="23" width="8" height="9"/><polygon points="3,14 18,14 18,24 5,29"/>',
  katana:'<rect x="8" y="17" width="70" height="5" rx="2"/><rect x="76" y="14" width="4" height="11"/><rect x="80" y="16" width="26" height="7" rx="3"/>',
  karambit:'<circle cx="30" cy="26" r="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M38 22 Q70 30 84 10 Q66 18 40 16 Z"/>',
  spatha:'<rect x="10" y="15" width="58" height="9" rx="2"/><rect x="66" y="11" width="5" height="17"/><rect x="71" y="14" width="22" height="11" rx="4"/>',
  bat:'<rect x="40" y="15" width="66" height="11" rx="5"/><rect x="10" y="17" width="32" height="7" rx="3"/>',
  butterfly:'<rect x="52" y="6" width="4" height="12" rx="2"/><rect x="60" y="6" width="4" height="12" rx="2"/><polygon points="50,18 66,18 58,38"/>',
};

for(const k in GSPEC) ICON[k]=GM[k].icon;

/* ================= MECH: ระบบกลไกพิเศษแบบ plug-in =================
   เพิ่มกลไกใหม่ได้โดยเพิ่มชื่อใน MECH แล้วใส่ mechanic:'ชื่อ' ใน WDEF ไม่ต้องแก้ฟังก์ชันหลัก
   hook ที่รองรับ (ใส่เฉพาะที่ต้องใช้):
   init()                 ตอนเริ่มเกม/เลือกปืน
   onFire(ctx)            ก่อนยิงแต่ละนัด แก้ ctx ได้: dmgMul, cdMul, flashMul (ctx.last = นัดสุดท้ายในแม็ก, ctx.bi = ลำดับนัดในชุด burst)
   hitMul(e,t,crit)       ตัวคูณดาเมจต่อเป้า (t = ระยะทาง) คืน 1 ถ้าไม่เปลี่ยน
   onHit(rec)             ทุกครั้งที่นัดนั้นโดนศัตรู (rec.e, rec.dmg, rec.crit)
   onShot(ctx,recs)       หลังจบนัด recs = รายการเป้าที่โดน
   onUpdate(dt)           ทุกเฟรมขณะถือปืน
   onPose(rp)             ตอนจัดท่าปืน rp = ความคืบหน้าท่ารีโหลด 0-1
   onReload(rc)           ตอนเริ่มรีโหลด แก้ rc.mul เพื่อคูณเวลารีโหลด
   onReloadDone()         ตอนรีโหลดเสร็จ
   onSwap()               ตอนสลับออกจากปืน
   spreadMul()            ตัวคูณการกระจายกระสุน
   mover(k)               แก้ค่าการเคลื่อนที่ของสไลด์/ลูกเลื่อน 0-1
   hud()                  ข้อความแสดงใน HUD */
const mech=(h,a,b)=>{ if(slot!==1) return undefined; const m=MECH[W.mechanic]; return (m&&m[h])?m[h](a,b):undefined; };
const bar5=v=>{ const n=Math.round(clamp(v,0,1)*5); return '▮'.repeat(n)+'▯'.repeat(5-n); };
const MECH={
  // 1) HAMMER-45: นัดสุดท้ายแรง x1.5 และสไลด์ค้างจนกว่าจะรีโหลดเสร็จ
  lastRound:{tag:'นัดสุดท้ายแรง x1.5',
    onFire(c){ if(c.last){ c.dmgMul*=1.5; c.flashMul=1.5; } },
    mover(k){ return (ammo<=0&&ocT<=0)?1:k; },
    hud(){ return (ammo<=0&&ocT<=0)?'สไลด์ค้าง — กด R รีโหลด':(ammo===1?'นัดสุดท้าย ดาเมจ x1.5':''); }},
  // 2) TRIPLET-3: โดนครบ 3 นัดในชุดเดียว → รีโหลดครั้งต่อไปเร็วขึ้น
  burstChain:{tag:'ชุดแม่น = รีโหลดไว',
    init(){ MS.n=0; MS.hits=0; MS.fast=false; },
    onFire(c){ if(c.bi===0){ MS.n=0; MS.hits=0; } },
    onShot(c,recs){ MS.n=(MS.n||0)+1; if(recs.length) MS.hits=(MS.hits||0)+1; if(MS.n>=W.burst&&MS.hits>=W.burst) MS.fast=true; },
    onReload(rc){ if(MS.fast){ rc.mul*=0.45; MS.fast=false; } },
    hud(){ return MS.fast?'โบนัสรีโหลดไว พร้อม!':''; }},
  // 3) STINGER-MP: โหมด auto กระจายมากขึ้นตามนัดต่อเนื่อง / โหมด semi แม่นและแรงกว่า
  bloomSpray:{tag:'สลับโหมด N · ยิงรัวกระจาย',
    init(){ MS.bloom=0; },
    onFire(c){ if(curMode==='auto') MS.bloom=Math.min(1,(MS.bloom||0)+0.07); else { c.dmgMul*=1.35; c.cdMul*=1.45; } },
    onUpdate(dt){ if(!firing||curMode!=='auto') MS.bloom=Math.max(0,(MS.bloom||0)-dt*2.2); },
    spreadMul(){ return curMode==='auto'?1+(MS.bloom||0)*3.5:0.5; },
    hud(){ return curMode==='auto'?'กระจาย '+bar5(MS.bloom||0):''; }},
  // 4) TWIN-9: ปืนคู่ ยิงสลับซ้าย-ขวา ใช้โมเดลสอง g
  akimbo:{tag:'ปืนคู่ ยิงสลับซ้าย-ขวา',
    init(){ MS.side=0; MS.kk=[0,0]; },
    onFire(){ const kk=MS.kk||(MS.kk=[0,0]); MS.side=MS.side?0:1; muzzle.position.set(...GM.twin.muzzles[MS.side]); kk[MS.side]=1; GM.twin.eject=[(GM.twin.ejX?GM.twin.ejX[MS.side]:(MS.side?0.14:-0.14))+0.04,0.045,-0.01]; },
    onUpdate(dt){ const kk=MS.kk; if(!kk) return; for(let i=0;i<2;i++){ kk[i]=Math.max(0,kk[i]-dt*8); const d=GM.twin.dual[i]; d.slide.position.z=kk[i]*0.045; d.g.rotation.x=kk[i]*0.12; } },
    onPose(rp){ const d=GM.twin.dual[1]; if(d.mag) d.mag.position.y=d.magY-rp*0.15; },
    onSwap(){ if(MS.kk){ MS.kk[0]=MS.kk[1]=0; GM.twin.dual.forEach(d=>{ d.slide.position.z=0; d.g.rotation.x=0; }); } },
    hud(){ return 'ซ้าย '+Math.ceil(ammo/2)+' · ขวา '+Math.floor(ammo/2); }},
  // 5) WHISPER-S: เก็บเสียง ไม่มีแฟลช ดาเมจตกตามระยะ ศัตรูที่ถูกยิงครั้งแรกตอบสนองช้า 0.6 วิ
  suppressed:{tag:'เก็บเสียง · ศัตรูตอบสนองช้า',
    hitMul(e,t){ return clamp(1.15-t/45,0.45,1); },
    onHit(r){ const e=r.e; if(e.T.fireRate&&!e.alerted){ e.alerted=true; e.cd+=0.6; } },
    hud(){ return 'เก็บเสียง'; }},
  quick:{tag:'เบา เดินเร็ว +6%'},
  ricochet:{tag:'กระสุนเด้งกำแพง 2 ครั้ง'},
  stunShot:{tag:'สตัน 0.8 วิ',onHit(r){ applyStatus(r.e,'stun',0.8); tracer(_m,r.e.pos,1); emit(r.e.pos,8,0x7fe9ff,3,0.3,0.2,3); sfx('stun',8,0); }},
  sprayer:{tag:'ยิงเร็วสุด กระจายกว้าง'},
  agile:{tag:'ยิงชุด 4 นัด เดินคล่อง'},
  singM:{tag:'หลุมดำ 3 วิ ดูดรัศมี 8 ม.'},
  flameM:{tag:'พ่นไฟกรวย 8 ม. ใช้เชื้อเพลิง'},
  nailerM:{tag:'ตะปูปักติด ระเบิดหลัง 1.2 วิ'},
  quakeM:{tag:'คลื่นกระแทกกรวย ผลักแรง'},
  lobM:{tag:'ระเบิดวิถีโค้ง เด้งได้'},
  xbowM:{tag:'เงียบ ฝังกำแพง หัว x2.5 ระเบิด 3 ม.'},
  chakM:{tag:'จานวนกลับ ทะลุ โดนไป-กลับ'},
  hornetM:{tag:'จรวด 4 ลูก นำวิถีอ่อน'},
  mineM:{tag:'ทุ่นเรืองแสง วางได้ 4 ลูก'},
  sentryM:{tag:'วางป้อมอัตโนมัติ 15 วิ'},
  pierce2:{tag:'ยิงติด · ทะลุ 2 ตัว'},
  light:{tag:'เบา เล็งไว เดินคล่อง'},
  plasmaM:{tag:'กระสุนไม่จำกัด · ยิงเร็วขึ้นต่อเนื่อง · ปืนร้อน · 30% ยิง 3 นัด',hud(){ return hotLock?'ร้อนเกิน — รอเย็น':(hotStreak>0?'ยิงเร็ว +'+(2*hotStreak)+'%':''); }},
  arc:{tag:'สายฟ้าลูกโซ่ 3 ตัว · ใช้ความร้อน',hud(){ return heatLock?'ร้อนเกิน — รอเย็น':(heatV>70?'ใกล้ร้อนเกิน':''); }},
  rail:{tag:'ชาร์จ 0.8 วิ · ทะลุทุกตัว',
    hud(){ return chargeV>=1?'พร้อมยิง — ปล่อยปุ่ม':(chargeV>0?'กำลังชาร์จ...':''); },
    onShot(){ camera.getWorldDirection(_bd); _bh.copy(_m);
      for(let k=1;k<=8;k++){ _bh2.copy(_m).addScaledVector(_bd,k*6); _bh2.x+=rand(-0.3,0.3); _bh2.y+=rand(-0.3,0.3); _bh2.z+=rand(-0.3,0.3);
        tracer(_bh,_bh2,0.9,0.25,1.6,TR_ARC); emit(_bh2,3,0x7fe9ff,3,0.4,0,3); _bh.copy(_bh2); }
      ringFX(_m,0x7fe9ff,2.5,0.3); }},
  burnShot:{tag:'กระสุนเพลิง ติดไฟ 5/วิ 3 วิ'},
  frost:{tag:'ช้า 35% → แข็ง 1.5 วิ (+30%)'},
  dbl:{tag:'ยิง 2 ช็อตแล้วรีโหลด',hud(){ return ammo>0?('เหลือ '+ammo+' ช็อต'):'รีโหลด [R]'; }},
  hailBloom:{tag:'ยิงนานกระสุนยิ่งกระจาย',
    init(){ MS.bloom=0; },
    onFire(){ MS.bloom=Math.min(1,(MS.bloom||0)+0.16); },
    onUpdate(dt){ if(!firing) MS.bloom=Math.max(0,(MS.bloom||0)-dt*1.6); },
    spreadMul(){ return 1+(MS.bloom||0)*3; },
    hud(){ return 'กระจาย '+bar5(MS.bloom||0); }},
  dragon:{tag:'เม็ดไฟ ติดไฟ · ประกายพุ่งยาว',
    onShot(){ camera.getWorldDirection(_bd); for(let k=0;k<9;k++){ _bh.copy(_m).addScaledVector(_bd,0.6+k*1.3+rand(0,0.8)); _bh.x+=rand(-0.15,0.15); _bh.y+=rand(-0.15,0.15); emit(_bh,3,k<4?0xffd166:0xff6a1a,2.5,0.5,0.15,3); } }},
  heavyAr:{tag:'ทนขึ้น 10% ตอนยิง · เดินช้า 10%',hud(){ return firing?'ลดดาเมจรับ 10%':''; }},
  dmr:{tag:'ซูม 2 ระดับ [Z/ล้อเมาส์/แตะเล็ง]',hud(){ return aiming?('ซูม ระดับ '+(zoomLvl?2:1)):''; }},
};
/* ---- โหมดยิง / ตัวควบคุมการลั่นไก ---- */
const fireModeNow=()=>W.fireMode==='select'?curMode:W.fireMode;
const FM_TH={semi:'กึ่งอัตโนมัติ',auto:'อัตโนมัติ',burst:'ยิงชุด 3 นัด',double:'ยิงได้ 2 ช็อต',deploy:'วางป้อม',projectile:'โพรเจกไทล์',charge:'ชาร์จพลัง',beam:'ลำแสงต่อเนื่อง'};
function zoomToggle(){ if(state==='play'&&slot===1&&W.zoom2&&aiming){ zoomLvl=zoomLvl?0:1; sfx('mode'); vib(8); } }
function toggleFireMode(){
  if(slot!==1||W.fireMode!=='select'||state!=='play') return;
  curMode=curMode==='auto'?'semi':'auto'; semiLatch=false; burstLeft=0; sfx('mode'); vib(10); updMechHUD();
}
function fireLogic(hs){
  let mode=fireModeNow();
  if(mode==='double') mode='semi'; else if(mode==='projectile') mode='auto';
  if(mode==='deploy'){ if(!firing) semiLatch=false; else if(!semiLatch&&!reloading&&fireCD<=0){ semiLatch=true; deploySentry(); } return; }
  if(mode==='beam'&&W.fuel){   // พ่นไฟ: ใช้เชื้อเพลิง หมดแล้วรีโหลด
    if(firing&&!reloading){
      if(fuelV>0){ flameAct=true; fuelV=Math.max(0,fuelV-W.fuel.perSec*frameDt); flameTick(frameDt); const fi=Math.round(fuelV); if(fi!==fuelShown){ fuelShown=fi; updAmmo(); } }
      else if(fireCD<=0){ sfx('empty'); fireCD=0.3; startReload(); } }
    return; }
  if(mode==='beam'){   // ยิงต่อเนื่อง ใช้ความร้อนแทนกระสุน
    if(firing&&!heatLock&&!reloading&&W.heat){ beamAct=true; heatUsed=true; heatV=Math.min(W.heat.max,heatV+W.heat.perSec*frameDt); beamTick(frameDt);
      if(heatV>=W.heat.max){ heatLock=true; sfx('overheat'); updAmmo(); } }
    return; }
  if(mode==='charge'){   // กดค้างชาร์จ ปล่อยเพื่อยิง
    if(reloading||drawT>0){ chargeV=0; chargeRdy=false; return; }
    if(firing&&(ammo>0||ocT>0)){ if(chargeV===0) sfx('railCharge'); chargeV=Math.min(1,chargeV+frameDt/(W.chargeT||0.8)); if(chargeV>=1&&!chargeRdy){ chargeRdy=true; sfx('beep',60); } }
    else if(!firing&&chargeV>0){ if(chargeV>=1&&fireCD<=0&&(ammo>0||ocT>0)) shoot(hs,0,WS.cd); chargeV=0; chargeRdy=false; }
    else if(firing&&ammo<=0&&ocT<=0&&fireCD<=0){ sfx('empty'); fireCD=0.3; startReload(); }
    return; }
  if(burstLeft>0){
    if(reloading||(ammo<=0&&ocT<=0)){ burstLeft=0; return; }
    if(fireCD<=0){ const bi=W.burst-burstLeft; burstLeft--; shoot(hs,bi,burstLeft>0?W.burstGap:WS.cd); }
    return;
  }
  if(!firing){ semiLatch=false; return; }
  if(reloading||fireCD>0) return;
  if(W.hot&&hotLock){ if(!semiLatch){ semiLatch=true; sfx('empty'); } return; }
  if(W.spinup&&spinT<1) return;
  if((mode==='semi'||mode==='burst')&&semiLatch) return;
  if(ammo>0||ocT>0){
    if(mode==='burst'){ semiLatch=true; burstLeft=Math.max(0,(W.burst||3)-1); shoot(hs,0,burstLeft>0?W.burstGap:WS.cd); }
    else { if(mode==='semi') semiLatch=true; shoot(hs,0,WS.cd); }
  } else { sfx('empty'); fireCD=0.3; startReload(); }
}
/* ---- beam / heat / charge HUD ---- */
const SEN={on:false,t:0,cd:0,hp:0,dmg:6,pos:new THREE.Vector3(),g:null,head:null,hpm:null,tgt:null,scanT:0,fireT:0,n:0,shown:-2};
let flameAct=false, flameT=0, fuelV=0, fuelShown=-1, beamAct=false, zoomLvl=0, frameDt=0, heatV=0, heatLock=false, heatUsed=false, heatShown=-1, hotV=0, hotLock=false, hotStreak=0, hotIdle=1, hotShown=-1, beamT=0, chargeV=0, chargeRdy=false, chgShown=false;
function beamDmg(e,d){ if(e.dead) return; hitT=0.12;
  if(e.shield>0){ e.shield-=d; e.shieldFlash=1; if(e.shield<=0) breakShield(e); return; }
  if(e.st.freeze>0) d*=1.3; e.hp-=d; e.flash=Math.max(e.flash,0.6); if(e.hp<=0) killEnemy(e); }
function beamTick(dt){
  camera.updateMatrixWorld(true); muzzle.getWorldPosition(_m);
  _d.set(rand(-1,1)*curSpread,rand(-1,1)*curSpread,-1).normalize().applyQuaternion(camera.quaternion); _o.copy(camera.position);
  const R=W.range||40; ray.set(_o,_d); ray.far=R;
  const wh=ray.intersectObjects(worldMeshes,false)[0]; let bt=wh?wh.distance:R, be=null;
  for(const e of enemies){ const t=raySphere(_o,_d,e.pos,e.T.r*1.08); if(t>0&&t<bt){ bt=t; be=e; } }
  _bh.copy(_o).addScaledVector(_d,bt); _bh2.copy(_m).lerp(_bh,0.5); _bh2.x+=rand(-0.25,0.25); _bh2.y+=rand(-0.25,0.25); _bh2.z+=rand(-0.25,0.25);
  tracer(_m,_bh2,0.9,0.05,2.2,TR_ARC); tracer(_bh2,_bh,0.9,0.05,2.2,TR_ARC); if(Math.random()<dt*14) sfx('arcPop');
  if(Math.random()<dt*30) emit(_bh,2,0x7fe9ff,3,0.25,0.5);
  beamT-=dt;
  if(be){ beamDmg(be,W.dps*(WS.dmg/W.dmg)*dt);
    if(beamT<=0&&!be.dead&&W.beamStatus){ beamT=0.2; applyStatus(be,W.beamStatus[0],W.beamStatus[1],W.beamStatus[2]); } }
}
let flameLast=0;
function flameTick(dt){
  camera.updateMatrixWorld(true); muzzle.getWorldPosition(_m); camera.getWorldDirection(_bd);
  const R=W.range||8, cosC=Math.cos(W.cone||0.4);
  for(let i=0;i<6;i++) emitJet(_m,_bd,1,i%3===0?0xffd166:(i%3===1?0xff7a1a:0xff3b1a),R*2.9,0.3+rand(0,0.1),0.3,2.6);
  ray.set(camera.position,_bd); ray.far=R; const wh=ray.intersectObjects(worldMeshes,false)[0];
  if(wh&&Math.random()<dt*20){ _bh.copy(camera.position).addScaledVector(_bd,Math.max(0,wh.distance-0.1)); emit(_bh,1,0xff5a1a,0.6,1.2,-0.25,2.5); }
  flameT-=dt; const proc=flameT<=0; if(proc) flameT=0.25;
  const mult=W.dps*(WS.dmg/W.dmg);
  for(let i=enemies.length-1;i>=0;i--){ const e=enemies[i]; if(!e||e.dead) continue;
    _bn.subVectors(e.pos,camera.position); const len=_bn.length(); if(len-e.T.r>R) continue; _bn.divideScalar(len);
    if(_bn.dot(_bd)<cosC-Math.min(0.25,e.T.r/len)) continue;
    ray.set(camera.position,_bn); ray.far=len; if(ray.intersectObjects(worldMeshes,false).length) continue;
    beamDmg(e,mult*dt); if(proc&&!e.dead) applyStatus(e,'burn',3,5);
    if(!e.dead&&Math.random()<dt*12) emit(e.pos,1,0xff7a1a,1.5,0.4,-0.2,2.5); }
}
function sonicBlast(){   /* QUAKE-12: คลื่นกระแทกกรวยสั้น ไม่ทะลุกำแพง ไม่ทำดาเมจผู้เล่น */
  const Sn=W.sonic; camera.updateMatrixWorld(true); camera.getWorldDirection(_bd); muzzle.getWorldPosition(_m);
  const R=Sn.range, cosC=Math.cos(Sn.half);
  for(let i=enemies.length-1;i>=0;i--){ const e=enemies[i]; if(!e||e.dead) continue;
    _bn.subVectors(e.pos,camera.position); const len=_bn.length(); if(len-e.T.r>R) continue; _bn.divideScalar(len);
    if(_bn.dot(_bd)<cosC-Math.min(0.3,e.T.r/len)) continue;
    ray.set(camera.position,_bn); ray.far=len; if(ray.intersectObjects(worldMeshes,false).length) continue;
    const big=e.key==='titan'||e.key==='aegis'; _bn.y=0; _bn.normalize();
    damageEnemy(e,WS.dmg*(1-0.35*Math.max(0,len-e.T.r)/R),e.pos,false,_bn);
    if(!e.dead){ e.vel.addScaledVector(_bn,Sn.kb*(big?0.25:1)); applyStatus(e,'stun',0.4); } }
  for(let k=0;k<3;k++){ _bh.copy(_m).addScaledVector(_bd,1.2+k*1.8); ringFX(_bh,0xffd166,1.6+k*1.1,0.35+k*0.08); }
  emitJet(_m,_bd,40,0xffe3a0,R*2.4,0.3,0.3,2); shake+=0.25;
}
function heatStep(dt){
  flameSnd(flameAct&&slot===1); flameAct=false;
  beamSnd(beamAct&&slot===1); beamAct=false;
  if(slot===1&&W.hot) hotStep(dt);
  if(slot!==1||!W.heat) return;
  if(!heatUsed) heatV=Math.max(0,heatV-W.heat.cool*dt); heatUsed=false;
  if(heatLock&&heatV<=W.heat.max*0.3){ heatLock=false; updAmmo(); }
  const sh=Math.round(heatV/W.heat.max*100); if(sh!==heatShown){ heatShown=sh; updAmmo(); }
}
function updChargeHUD(){
  const on=slot===1&&W.fireMode==='charge'&&chargeV>0, el=$('chg');
  if(on){ el.style.display='block'; el.style.setProperty('--p',(chargeV*100)+'%'); chgShown=true; }
  else if(chgShown){ el.style.display='none'; chgShown=false; }
}
let mechTxtCache='', fmShown=null;
function refreshFmBtn(){
  const el=$('c_fm'); if(!el) return;
  const on=editing||(slot===1&&W.fireMode==='select');
  if(on!==fmShown){ fmShown=on; el.style.display=on?'':'none'; }
}
function updMechHUD(){
  let s='';
  if(slot===1){
    const fm=fireModeNow();
    if(W.fireMode==='select') s='โหมด: '+FM_TH[fm]+' [N]'; else if(W.fireMode!=='auto') s=fm==='burst'?'ยิงชุด '+(W.burst||3)+' นัด':(FM_TH[fm]||'');
    const h=mech('hud'); if(h) s+=(s?' · ':'')+h;
  }
  if(s!==mechTxtCache){ mechTxtCache=s; const el=$('mechT'); if(el) el.textContent=s; }
  refreshFmBtn();
}

/* ================= AUDIO v2 : สังเคราะห์ด้วยโค้ดล้วน (ไม่ใช้ไฟล์เสียง) =================
 วิธีติดตั้ง
  1) ในไฟล์เกม ลบตั้งแต่บรรทัด  `/* ================= AUDIO =================`
     ไปจนถึงบรรทัด  `const vib=p=>{ ... };`  (รวมบรรทัด vib) แล้ววางไฟล์นี้แทนทั้งก้อน
  2) ตอนสร้างแมพ (buildMap) เรียก  setAcoustics('rain' | 'desert' | 'apoc' | 'sandbox' | 'market')
     ฟังก์ชันจะเปลี่ยนเสียงก้อง เสียงบรรยากาศ เสียงพื้นผิวเดิน และเพลงให้ตรงแมพอัตโนมัติ
  3) (ไม่บังคับ) เพิ่มเสียงเดิน ใน update() หลังบรรทัด `if(P.onGround&&hs>0.5) bobT+=dt*hs*1.5;`
        const ph=Math.floor(bobT/Math.PI); if(P.onGround&&hs>0.5&&ph!==window._lsp){ window._lsp=ph; sfx('step',hs); }
  4) (ไม่บังคับ) เสียงศัตรูแบบมีทิศทาง/ระยะ: เปลี่ยน sfx('eshoot',dist) เป็น sfxAt('eshoot',e.pos)
     ทำแบบเดียวกันกับ 'boom' 'blink' 'beep' 'spawn' ได้
  ปืนใหม่: ฟังก์ชันอ่านฟิลด์จาก WDEF[id] ได้เอง  cls, caliber, suppressed, sound, action
     caliber ที่รองรับ: c9 c45 c44 c57 c556 c762 c308 c338 c50 c12   sound พิเศษ: launch flame taser xbow flare
     ถ้าไม่ระบุ จะเดาจาก cls  และปืนแต่ละกระบอกจะมีโทนเสียงต่างกันเล็กน้อยโดยอัตโนมัติ
  เสียงเพิ่มที่เรียกได้: step rocket bounce spinUp spinDown jam overheat scan inspect leap slam acid summon stun laser */

const AU={ctx:null,vc:0,pending:'rain',bufs:{},rq:[],rrun:false,theme:'rain',surface:'concrete',wet:0.9,int:0.1,step:0,next:0,lastT:0,
  evAt:0,irCache:{},ambCur:null,ambBus:null,ambKind:'',lead:3,warned:false,conv:null};
const mtof=m=>440*Math.pow(2,(m-69)/12)*(AU.mp||1);   /* AU.mp/AU.mr: สโลว์โมชั่นทำให้เพลงต่ำลง/ช้าลงเล็กน้อย */
const NB={};
const SHAPE=(()=>{ const cv=new Float32Array(1024); for(let i=0;i<1024;i++){ const x=i/512-1; cv[i]=Math.tanh(x*2.2)/Math.tanh(2.2); } return cv; })();
const lowOK=()=>AU.vc<44;

/* ---------- พื้นฐาน: noise / tone ---------- */
function makeNoise(c){
  const N=Math.floor(c.sampleRate*3);
  const mk=fn=>{ const b=c.createBuffer(1,N,c.sampleRate), d=b.getChannelData(0); fn(d); return b; };
  NB.len=3;
  NB.white=mk(d=>{ for(let i=0;i<N;i++) d[i]=Math.random()*2-1; });
  NB.pink=mk(d=>{ let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0; for(let i=0;i<N;i++){ const w=Math.random()*2-1;
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759; b2=0.969*b2+w*0.153852; b3=0.8665*b3+w*0.3104856; b4=0.55*b4+w*0.5329522; b5=-0.7616*b5-w*0.016898;
    d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926; } });
  NB.brown=mk(d=>{ let l=0; for(let i=0;i<N;i++){ const w=Math.random()*2-1; l=(l+0.02*w)/1.02; d[i]=l*3.5; } });
}
function nz(c,dst,t,dur,type,f0,f1,g,q=1,kind='white'){
  const s=c.createBufferSource(); s.buffer=NB[kind]||NB.white;
  const f=c.createBiquadFilter(); f.type=type; f.Q.value=q; f.frequency.setValueAtTime(Math.max(20,f0),t);
  if(f1&&f1!==f0) f.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  const gn=c.createGain(); gn.gain.setValueAtTime(Math.max(g,0.0002),t); gn.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  s.connect(f); f.connect(gn); gn.connect(dst);
  s.start(t,Math.random()*Math.max(0,NB.len-dur-0.1)); s.stop(t+dur+0.03);
  if(c===AU.ctx){ AU.vc++; s.onended=()=>{ AU.vc--; }; }
}
function tn(c,dst,t,type,f0,f1,dur,g,filt,atk){
  const o=c.createOscillator(); o.type=type; o.frequency.setValueAtTime(Math.max(10,f0),t);
  if(f1&&f1!==f0) o.frequency.exponentialRampToValueAtTime(Math.max(10,f1),t+dur);
  const gn=c.createGain(), a=atk||0.006; g=Math.max(g,0.0002);
  gn.gain.setValueAtTime(0.0001,t); gn.gain.exponentialRampToValueAtTime(g,t+a); gn.gain.exponentialRampToValueAtTime(0.0001,t+Math.max(dur,a+0.01));
  let n=o; if(filt){ const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=filt; f.Q.value=2; o.connect(f); n=f; }
  n.connect(gn); gn.connect(dst); o.start(t); o.stop(t+dur+0.05);
  if(c===AU.ctx){ AU.vc++; o.onended=()=>{ AU.vc--; }; }
}
function tone(type,f0,f1,dur,gain,dest,at,filt){ const c=AU.ctx; if(!c) return; tn(c,dest||AU.sfx,at??c.currentTime,type,f0,f1,dur,gain,filt); }
function noise(dur,type,f0,f1,gain,q=1,dest,at){ const c=AU.ctx; if(!c) return; nz(c,dest||AU.sfx,at??c.currentTime,dur,type,f0,f1,gain,q); }
const T0=()=>AU.ctx.currentTime;
/* ช่องส่งเสียงแบบมีระยะ/ทิศ: อากาศดูดความถี่สูง + ลดความดัง + แพนซ้ายขวา */
function out(d,pan){
  const c=AU.ctx, inp=c.createGain(); let n=inp;
  if(d>2.5){ const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=clamp(16000/(1+d/8),900,16000);
    const g=c.createGain(); g.gain.value=clamp(1.1-d/60,0.1,1); n.connect(lp); lp.connect(g); n=g; }
  if(pan&&c.createStereoPanner){ const p=c.createStereoPanner(); p.pan.value=clamp(pan,-1,1); n.connect(p); n=p; }
  n.connect(AU.sfx); const w=c.createGain(); w.gain.value=clamp(0.25+d/60,0.25,0.8)*AU.wet*0.6; inp.connect(w); w.connect(AU.verbIn);
  return inp;
}
function sbus(amt=0.5){ const c=AU.ctx, g=c.createGain(); g.connect(AU.sfx); const w=c.createGain(); w.gain.value=amt*AU.wet; g.connect(w); w.connect(AU.verbIn); return g; }

/* ---------- เสียงก้องตามแมพ + บรรยากาศ ---------- */
const ACOU={
  rain:   {len:2.0,decay:3.0,damp:0.5,slap:[[0.085,0.5],[0.17,0.35],[0.31,0.22]],wet:0.95,surface:'wet',theme:'rain'},
  desert: {len:1.1,decay:4.5,damp:0.35,slap:[[0.38,0.12]],wet:0.45,surface:'sand',theme:'desert'},
  apoc:   {len:2.8,decay:2.2,damp:0.7,slap:[[0.14,0.3],[0.29,0.25]],wet:1.05,surface:'rubble',theme:'apoc'},
  sandbox:{len:0.8,decay:5.0,damp:0.3,slap:[[0.45,0.08]],wet:0.35,surface:'concrete',theme:'sandbox'},
  market: {len:1.3,decay:3.6,damp:0.4,slap:[[0.055,0.55],[0.11,0.4],[0.2,0.2]],wet:0.8,surface:'stone',theme:'market'},
  ruins:  {len:2.2,decay:2.9,damp:0.6,slap:[[0.12,0.25],[0.26,0.2]],wet:0.85,surface:'grass',theme:'ruins'},
  cave:   {len:2.4,decay:2.0,damp:0.5,slap:[[0.04,0.5],[0.09,0.4],[0.17,0.3],[0.3,0.18]],wet:1.0,surface:'concrete',theme:'cave'},
  indoor: {len:1.5,decay:2.5,damp:0.3,slap:[[0.05,0.5],[0.11,0.4],[0.19,0.25]],wet:0.95,surface:'metal',theme:'foundry'},
  space:  {len:2.6,decay:2.4,damp:0.45,slap:[[0.06,0.4],[0.13,0.32],[0.24,0.2]],wet:0.9,surface:'metal',theme:'space'},
  snow:   {len:1.5,decay:5.2,damp:0.82,slap:[[0.34,0.1]],wet:0.5,surface:'snow',theme:'snow'},
};
const ACOU_ALIAS=[[/metro|subway|tunnel|cave|underground/i,'cave'],[/foundry|toxic|factory|forge|indoor/i,'indoor'],[/orbital|space|station|orbit/i,'space'],[/sandbox|lab|grid|test/i,'sandbox'],[/frost|snow|ice|polar/i,'snow'],[/jungle|temple|forest/i,'ruins'],[/rain|neon/i,'rain'],[/desert|dust/i,'desert'],[/apoc|ruin|doom|waste|burn/i,'apoc'],[/market|town|bazaar|alley|site|city2/i,'market']];
const acouKey=id=>{ id=String(id||''); if(ACOU[id]) return id; for(const [re,k] of ACOU_ALIAS) if(re.test(id)) return k; return 'rain'; };
function buildIR(c,sp){
  const sr=c.sampleRate, N=Math.floor(sr*sp.len), ir=c.createBuffer(2,N,sr);
  for(let ch=0;ch<2;ch++){ const d=ir.getChannelData(ch); let lp=0;
    for(let i=0;i<N;i++){ const x=i/N, k=clamp(0.5-sp.damp*0.5*x,0.04,0.6); lp+=((Math.random()*2-1)-lp)*k; d[i]=lp*Math.pow(1-x,sp.decay)*(i<160?i/160:1); }
    const bl=Math.floor(sr*0.012);
    for(const [dl,g] of sp.slap){ const o=Math.floor(dl*(ch?1.07:0.95)*sr); for(let j=0;j<bl&&o+j<N;j++) d[o+j]+=(Math.random()*2-1)*g*Math.pow(1-j/bl,2); } }
  return ir;
}
function setAcoustics(id){
  const key=acouKey(id); AU.pending=key; if(!AU.ctx) return key;
  const c=AU.ctx, sp=ACOU[key];
  if(!AU.irCache[key]) AU.irCache[key]=buildIR(c,sp);
  const cv=c.createConvolver(); cv.buffer=AU.irCache[key]; AU.verbIn.connect(cv); cv.connect(AU.verbWet);
  if(AU.conv){ const old=AU.conv; setTimeout(()=>{ try{ AU.verbIn.disconnect(old); old.disconnect(); }catch(e){} },300); }
  AU.conv=cv; AU.wet=sp.wet; AU.surface=sp.surface;
  if(AU.theme!==sp.theme||!AU.ambKind){ AU.theme=sp.theme; AU.step=0; AU.next=c.currentTime+0.1; AU.lead=3; }
  setAmbience(key); return key;
}
function ambLayer(c,out_,n,kind,type,f,q,g,lfoHz,lfoDepth){
  const s=c.createBufferSource(); s.buffer=NB[kind]; s.loop=true; s.start(0,Math.random()*2);
  const fl=c.createBiquadFilter(); fl.type=type; fl.frequency.value=f; fl.Q.value=q;
  const gn=c.createGain(); gn.gain.value=g; s.connect(fl); fl.connect(gn); gn.connect(out_); n.push(s);
  if(lfoHz){ const o=c.createOscillator(); o.frequency.value=lfoHz; const og=c.createGain(); og.gain.value=lfoDepth; o.connect(og); og.connect(gn.gain); o.start(); n.push(o); }
}
function setAmbience(kind){
  const c=AU.ctx; if(!c||AU.ambKind===kind) return;
  const old=AU.ambCur; if(old){ old.g.gain.setTargetAtTime(0,c.currentTime,0.5); setTimeout(()=>old.n.forEach(x=>{ try{ x.stop(); }catch(e){} }),3000); }
  const g=c.createGain(); g.gain.value=0; g.connect(AU.ambBus); g.gain.setTargetAtTime(1,c.currentTime,0.6);
  const n=[]; AU.ambCur={g,n}; AU.ambKind=kind;
  if(kind==='rain'){
    const rb=c.createGain(); rb.connect(g); AU.rainBus=rb; rb.gain.value=S.rain?1:0;
    ambLayer(c,rb,n,'pink','bandpass',3200,0.5,0.10); ambLayer(c,rb,n,'white','highpass',7000,0.7,0.018); ambLayer(c,rb,n,'pink','lowpass',900,0.7,0.05,0.2,0.02);
    ambLayer(c,g,n,'brown','lowpass',380,0.7,0.12,0.08,0.07);
    const o=c.createOscillator(); o.frequency.value=55; const og=c.createGain(); og.gain.value=0.012; o.connect(og); og.connect(g); o.start(); n.push(o);
  } else if(kind==='desert'){
    ambLayer(c,g,n,'brown','lowpass',520,0.6,0.16,0.10,0.06); ambLayer(c,g,n,'pink','bandpass',1400,6,0.012,0.05,0.02); ambLayer(c,g,n,'pink','bandpass',200,0.5,0.04);
  } else if(kind==='apoc'){
    ambLayer(c,g,n,'brown','lowpass',130,0.5,0.28); ambLayer(c,g,n,'brown','lowpass',700,0.8,0.12,0.06,0.09); ambLayer(c,g,n,'pink','highpass',4500,0.5,0.01);
  } else if(kind==='ruins'){
    ambLayer(c,g,n,'brown','lowpass',520,0.6,0.13,0.09,0.06); ambLayer(c,g,n,'pink','bandpass',3100,6,0.014,0.3,0.012); ambLayer(c,g,n,'pink','bandpass',5200,9,0.006,0.17,0.005); ambLayer(c,g,n,'pink','lowpass',700,0.5,0.04);
  } else if(kind==='cave'){
    ambLayer(c,g,n,'brown','lowpass',200,0.6,0.24,0.05,0.06); ambLayer(c,g,n,'pink','bandpass',1700,1.5,0.012,0.15,0.008); ambLayer(c,g,n,'pink','lowpass',600,0.6,0.03,0.09,0.02);
    const o=c.createOscillator(); o.frequency.value=100; const og=c.createGain(); og.gain.value=0.008; o.connect(og); og.connect(g); o.start(); n.push(o);
  } else if(kind==='indoor'){
    ambLayer(c,g,n,'brown','lowpass',230,0.6,0.26,0.06,0.07); ambLayer(c,g,n,'pink','bandpass',1300,1.2,0.02,0.2,0.012); ambLayer(c,g,n,'pink','highpass',5200,0.5,0.008,0.4,0.005);
    const o=c.createOscillator(); o.frequency.value=50; const og=c.createGain(); og.gain.value=0.02; o.connect(og); og.connect(g); o.start(); n.push(o);
  } else if(kind==='space'){
    ambLayer(c,g,n,'brown','lowpass',180,0.6,0.22,0.05,0.06); ambLayer(c,g,n,'pink','bandpass',2400,8,0.008,0.12,0.006); ambLayer(c,g,n,'pink','bandpass',700,2,0.03,0.07,0.02);
    const o=c.createOscillator(); o.frequency.value=62; const og=c.createGain(); og.gain.value=0.02; o.connect(og); og.connect(g); o.start(); n.push(o);
  } else if(kind==='snow'){
    ambLayer(c,g,n,'brown','lowpass',420,0.6,0.2,0.07,0.1); ambLayer(c,g,n,'pink','bandpass',950,1.2,0.05,0.11,0.035); ambLayer(c,g,n,'white','highpass',6500,0.5,0.008,0.05,0.004);
  } else if(kind==='sandbox'){
    ambLayer(c,g,n,'pink','lowpass',700,0.5,0.05,0.04,0.05); ambLayer(c,g,n,'brown','lowpass',300,0.6,0.05);
  } else {
    ambLayer(c,g,n,'pink','lowpass',650,0.5,0.045,0.05,0.04); ambLayer(c,g,n,'pink','bandpass',520,1.4,0.05,0.03,0.02); ambLayer(c,g,n,'pink','bandpass',1400,1.8,0.02,0.37,0.01);
  }
}
function thunder(){ const c=AU.ctx, t=c.currentTime+rand(0,0.3), far=Math.random()<0.6, b=sbus(0.7);
  nz(c,b,t,0.12,'highpass',1800,1200,far?0.05:0.18); nz(c,b,t+0.05,far?3.2:2.4,'lowpass',far?420:900,50,far?0.35:0.8,0.7,'brown'); tn(c,b,t+0.05,'sine',48,28,3,far?0.18:0.35); }
function crackle(){ const c=AU.ctx, t=c.currentTime; for(let i=0;i<3;i++) nz(c,AU.sfx,t+i*rand(0.03,0.12),0.02,'highpass',rand(1500,3500),2000,0.07,1); if(Math.random()<0.3) tn(c,AU.sfx,t,'sawtooth',90,60,0.9,0.04,300); }
function bird(){ const c=AU.ctx, t=c.currentTime, f=rand(2600,3800), n=2+(Math.random()*3|0); for(let i=0;i<n;i++) tn(c,AU.sfx,t+i*0.11,'sine',f,f*rand(1.15,1.4),0.07,0.025,0,0.01); }
function clatter(){ const c=AU.ctx, t=c.currentTime; for(let i=0;i<2;i++) nz(c,AU.sfx,t+i*rand(0.08,0.3),0.05,'bandpass',rand(1500,2800),1600,0.05,3); }
function beep(){ const c=AU.ctx, t=c.currentTime, f=rand(900,1500); tn(c,AU.sfx,t,'sine',f,f,0.09,0.03,0,0.005); tn(c,AU.sfx,t+0.14,'sine',f*1.25,f*1.25,0.09,0.03,0,0.005); }
function drip(){ const c=AU.ctx, t=c.currentTime, f=rand(900,1600); tn(c,AU.sfx,t,'sine',f,f*0.55,0.09,0.035,0,0.003); tn(c,AU.sfx,t+0.11,'sine',f*0.8,f*0.45,0.07,0.012,0,0.003); }
function metroTrainSfx(){ const c=AU.ctx; if(!c||!AU.sfx) return; const t=c.currentTime; nz(c,AU.sfx,t,7,'lowpass',260,70,0.5,1,'brown'); tn(c,AU.sfx,t,'sawtooth',52,34,7,0.06,150,2.2); for(let i=0;i<14;i++) nz(c,AU.sfx,t+1+i*0.38,0.12,'bandpass',900,400,0.05,3); }
function ambEvents(now){
  if(now<AU.evAt) return; const k=AU.ambKind; let nx=rand(10,22);
  if(k==='rain'&&S.rain){ thunder(); nx=rand(18,45); } else if(k==='apoc'){ crackle(); nx=rand(2.5,7); }
  else if(k==='sandbox'){ bird(); nx=rand(5,14); } else if(k==='ruins'){ bird(); nx=rand(3,9); } else if(k==='space'){ beep(); nx=rand(6,15); } else if(k==='cave'){ drip(); nx=rand(1.5,5); } else if(k==='indoor'){ clatter(); nx=rand(5,13); } else if(k==='market'){ clatter(); nx=rand(6,16); }
  AU.evAt=now+nx;
}

/* ---------- เสียงปืน: พารามิเตอร์ตามคาลิเบอร์ ---------- */
const CAL={
  c9:  {crackF:3000,crack:.42,bodyF0:5200,bodyF1:600,bodyDur:.09,body:.4,thumpF0:190,thumpF1:70,thump:.35,thumpDur:.09,tail:.15,tailDur:.55,tailF:3400,ring:.3,ringF:2300,sonic:0,casing:'b9'},
  c45: {crackF:2300,crack:.45,bodyF0:4300,bodyF1:420,bodyDur:.11,body:.5,thumpF0:150,thumpF1:52,thump:.45,thumpDur:.12,tail:.17,tailDur:.65,tailF:3000,ring:.3,ringF:1700,sonic:0,casing:'b45'},
  c44: {crackF:1900,crack:.52,bodyF0:4800,bodyF1:260,bodyDur:.17,body:.6,thumpF0:122,thumpF1:38,thump:.62,thumpDur:.2,tail:.24,tailDur:1.0,tailF:2600,ring:.4,ringF:1200,sonic:.25,casing:'none'},
  c57: {crackF:4200,crack:.4,bodyF0:7000,bodyF1:900,bodyDur:.07,body:.34,thumpF0:220,thumpF1:80,thump:.28,thumpDur:.07,tail:.12,tailDur:.4,tailF:4000,ring:.2,ringF:3200,sonic:.25,casing:'b9'},
  c556:{crackF:3000,crack:.5,bodyF0:5200,bodyF1:520,bodyDur:.12,body:.46,thumpF0:160,thumpF1:52,thump:.42,thumpDur:.14,tail:.2,tailDur:.8,tailF:3000,ring:.25,ringF:2000,sonic:.3,casing:'rif'},
  c762:{crackF:2000,crack:.52,bodyF0:4400,bodyF1:330,bodyDur:.15,body:.52,thumpF0:130,thumpF1:44,thump:.52,thumpDur:.16,tail:.24,tailDur:.95,tailF:2700,ring:.3,ringF:1500,sonic:.35,casing:'rif'},
  c308:{crackF:1800,crack:.55,bodyF0:4600,bodyF1:300,bodyDur:.17,body:.56,thumpF0:118,thumpF1:40,thump:.58,thumpDur:.18,tail:.26,tailDur:1.05,tailF:2500,ring:.3,ringF:1300,sonic:.4,casing:'rif'},
  c338:{crackF:1600,crack:.58,bodyF0:5000,bodyF1:200,bodyDur:.26,body:.64,thumpF0:100,thumpF1:32,thump:.7,thumpDur:.3,tail:.34,tailDur:1.5,tailF:2200,ring:.4,ringF:1000,sonic:.55,casing:'rif'},
  c50: {crackF:1300,crack:.6,bodyF0:5200,bodyF1:150,bodyDur:.32,body:.72,thumpF0:86,thumpF1:26,thump:.8,thumpDur:.42,tail:.42,tailDur:1.9,tailF:1900,ring:.4,ringF:800,sonic:.6,casing:'rif'},
  c12: {crackF:1300,crack:.5,bodyF0:3800,bodyF1:150,bodyDur:.26,body:.7,thumpF0:100,thumpF1:32,thump:.7,thumpDur:.28,tail:.3,tailDur:1.3,tailF:2300,ring:.2,ringF:900,sonic:0,casing:'shell'},
};
const GUNS={pistol:['c9'],smg:['c9',{bodyDur:.07,thump:.28,tailDur:.42}],ar:['c556'],shotgun:['c12'],sniper:['c338'],
  magnum:['c44'],hammer:['c45',{bodyDur:.13,thump:.58,tailDur:.8}],triplet:['c9',{bodyDur:.085,crack:.4,thump:.34}],stinger:['c9',{bodyDur:.065,thump:.26,tailDur:.4}],twin:['c9',{thumpF0:200,tailDur:.5}],whisper:['c9',{bodyDur:.07,tailDur:.4}],hailstorm:['c762',{bodyDur:.08,tailDur:.5,tail:.12,thump:.34,casing:'rif'}],havoc:['launch'],
  banshee:['c308',{bodyDur:.14,crack:.5,thump:.5}],hawk:['c308',{crackF:2700,bodyDur:.12,thump:.4,tailDur:.8}],raillance:['rail'],arccaster:['c9'],plasma:['plasma'],singularity:['sing'],inferno:['flame'],quake:['quake'],lobber:['lob'],nightbolt:['xbow'],chakram:['whistle'],hornet:['lob'],minelayer:['mine'],sentry:['c9',{bodyDur:.05,thump:.2,tailDur:.25}],nailer:['c9',{crackF:5200,crack:.5,bodyF0:7000,bodyDur:.05,thump:.18,ring:.5,ringF:3800,tailDur:.3}],
  viper18:['c9',{bodyDur:.06,thump:.24,tailDur:.38}],triad3:['c9',{bodyDur:.085,crack:.45,thump:.34}],ricochet:['c45',{crackF:3200,ring:.5,tailDur:.7}],taser:['taser'],wasp:['c9',{bodyDur:.05,thump:.22,tailDur:.35}],
  cinder:['c556',{crackF:2500,thump:.46,ring:.15,tailDur:.85}],frostbite:['c556',{crackF:4300,ring:.5,ringF:3400,bodyDur:.09,thump:.34,tailDur:.7}],
  twindrake:['c12',{thumpF0:76,thump:1,bodyDur:.32,tailDur:1.6,crack:.6}],autohail:['c12',{bodyDur:.2,thump:.5,tailDur:.9}],dragonbreath:['c12',{crackF:1000,thump:.64,bodyDur:.3,tailDur:1.25,ring:.1}],
  tempest:['c9',{bodyDur:.075,thump:.3,tailDur:.45}],brawler:['c45',{bodyDur:.12,thump:.58,tailDur:.75,crack:.5}],gale:['c556',{crack:.46,bodyDur:.1}],
  bulwark:['c762',{thumpF0:108,thump:.66,tailDur:1.05,bodyDur:.16}],ranger:['c308',{bodyDur:.15,thump:.55,tailDur:.95}]};
const CLS_CAL={pistol:'c9',smg:'c9',rifle:'c556',shotgun:'c12',sniper:'c308',lmg:'c762',special:'c556'};
const SPECIAL_KEYS=['launch','flame','taser','xbow','flare'];
const GSN={};
function suppress(p){ return Object.assign({},p,{crack:p.crack*0.22,crackF:p.crackF*0.55,body:p.body*0.3,bodyF0:p.bodyF0*0.45,thump:p.thump*0.3,tail:p.tail*0.2,tailDur:p.tailDur*0.5,sup:true,ring:0}); }
function soundFor(id){
  const w=typeof WDEF!=='undefined'?WDEF[id]:null, sup=!!(w&&(w.suppressed||(w.mechParams&&w.mechParams.suppressed)));
  let sp=(w&&w.sound)||null, g=GUNS[id];
  if(sp&&SPECIAL_KEYS.includes(sp)) return sp;
  if(g&&SPECIAL_KEYS.includes(g[0])) return g[0];
  let cal=sp&&CAL[sp]?sp:(g?g[0]:((w&&CAL[w.caliber]&&w.caliber)||CLS_CAL[(w&&w.cls)||'rifle']||'c556'));
  const key=g&&g[1]?id+(sup?'_s':''):cal+(sup?'_s':'');
  if(!GSN[key]){ let p=Object.assign({},CAL[cal],g&&g[1]||{}); if(sup) p=suppress(p); GSN[key]=p; }
  return key;
}
function pitchOf(id){ let h=0; const s=String(id); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return 0.95+(h%11)*0.01; }

/* วางเลเยอร์เสียงยิง: แคร็ก + บอดี้ + ซับเบส + เสียงก้องลำกล้อง + แรงอัดเหนือเสียง + หางเสียง (ใช้ได้ทั้ง live และ pre-render) */
function buildGun(c,dst,t,p,v){
  const ws=c.createWaveShaper(); ws.curve=SHAPE; const bus=c.createGain(); bus.connect(ws); ws.connect(dst);
  nz(c,bus,t,0.012+p.bodyDur*0.12,'highpass',p.crackF*v,p.crackF*v,p.crack,0.7);
  nz(c,bus,t,p.bodyDur,'lowpass',p.bodyF0*v,p.bodyF1,p.body,0.9);
  nz(c,bus,t,p.bodyDur*0.75,'bandpass',900*v,300,p.body*0.45,1.2);
  tn(c,dst,t,'sine',p.thumpF0*v,p.thumpF1,p.thumpDur,p.thump,0,0.004);
  tn(c,dst,t,'triangle',p.thumpF0*1.9*v,p.thumpF1*1.6,p.thumpDur*0.6,p.thump*0.3);
  if(p.ring) tn(c,dst,t+0.003,'sine',p.ringF*v,p.ringF*v*0.97,0.14,p.ring*0.1,0,0.002);
  if(p.sonic) nz(c,bus,t+0.01,0.03,'highpass',5200,3500,p.sonic*0.45,0.8);
  if(p.sup) nz(c,bus,t,0.09,'bandpass',2000,1200,0.2,1.2);
  nz(c,dst,t+0.004,p.tailDur,'lowpass',p.tailF,180,p.tail,0.6,'pink');
}
async function renderGun(key){
  const c0=AU.ctx, p=GSN[key], OC=window.OfflineAudioContext||window.webkitOfflineAudioContext; if(!p||!OC) return;
  const sr=c0.sampleRate, dur=p.tailDur+0.45, arr=[];
  for(let v=0;v<3;v++){ const oc=new OC(1,Math.ceil(sr*dur),sr); buildGun(oc,oc.destination,0.005,p,rand(0.95,1.05));
    arr.push(await oc.startRendering()); await new Promise(r=>setTimeout(r,16)); }
  AU.bufs[key]=arr;
}
function queueRender(key){ if(AU.bufs[key]||AU.rq.includes(key)||!GSN[key]) return; AU.rq.push(key); if(!AU.rrun) runQ(); }
async function runQ(){ AU.rrun=true; while(AU.rq.length){ const k=AU.rq.shift(); try{ await renderGun(k); }catch(e){} await new Promise(r=>setTimeout(r,24)); } AU.rrun=false; }
function playGun(key,id){
  const c=AU.ctx, arr=AU.bufs[key], p=GSN[key], gv=rand(0.92,1), b=c.createGain(); b.gain.value=gv; b.connect(AU.sfx);
  const w=c.createGain(); w.gain.value=AU.wet*(p.sup?0.25:1); b.connect(w); w.connect(AU.verbIn);
  if(arr&&arr.length){ const s=c.createBufferSource(); s.buffer=arr[Math.random()*arr.length|0]; s.playbackRate.value=pitchOf(id)*rand(0.97,1.03); s.connect(b); s.start(); AU.vc++; s.onended=()=>{ AU.vc--; }; }
  else { buildGun(c,b,c.currentTime,p,rand(0.93,1.07)*pitchOf(id)); queueRender(key); }
}
const SPECIAL={
  launch(c,t){ const b=sbus(0.8); tn(c,b,t,'sine',95,38,0.22,0.6); nz(c,b,t,0.45,'bandpass',350,2200,0.35,1,'pink'); nz(c,b,t,0.6,'lowpass',1800,200,0.3); fClick(t,0.2,2500); },
  flame(c,t){ const b=sbus(0.4); nz(c,b,t,0.22,'bandpass',2500,1500,0.25,1,'pink'); tn(c,b,t,'sine',70,60,0.2,0.2); for(let i=0;i<2;i++) nz(c,b,t+rand(0,0.15),0.015,'highpass',3000,3000,0.1,1); },
  taser(c,t){ const b=sbus(0.4); tn(c,b,t,'sawtooth',2200,300,0.16,0.22); for(let i=0;i<3;i++) nz(c,b,t+i*0.04,0.02,'highpass',5000,5000,0.2,1); tn(c,b,t,'square',120,110,0.2,0.08); },
  xbow(c,t){ const b=sbus(0.3); tn(c,b,t,'triangle',190,95,0.09,0.3); nz(c,b,t,0.05,'bandpass',800,800,0.25,2); tn(c,b,t,'sine',70,45,0.1,0.3); nz(c,b,t+0.03,0.18,'bandpass',2500,800,0.06,1.2); },
  flare(c,t){ const b=sbus(0.7); nz(c,b,t,0.1,'lowpass',2500,300,0.4); tn(c,b,t,'sine',200,70,0.12,0.4); nz(c,b,t+0.05,0.5,'highpass',2500,2500,0.08,1,'pink'); },
};
const ACT={shotgun:'pump',sniper:'bolt'};
SPECIAL.rail=(c,t)=>{ const b=sbus(0.9); nz(c,b,t,0.04,'highpass',2500,2500,0.5,1); tn(c,b,t,'sine',180,30,0.5,0.8); nz(c,b,t,0.5,'bandpass',4000,300,0.35,1.2); tn(c,b,t,'sawtooth',1200,90,0.3,0.15,2500);
  for(let i=0;i<5;i++) nz(c,b,t+0.05+i*0.06,0.03,'highpass',3500,5000,0.12,1); };
SPECIAL.plasma=(c,t)=>{ const b=sbus(0.5); tn(c,b,t,'sine',1000,180,0.18,0.28); tn(c,b,t,'sawtooth',320,90,0.12,0.1,1800); nz(c,b,t,0.1,'bandpass',3000,1200,0.1,2); };
SPECIAL.sing=(c,t)=>{ const b=sbus(0.8); tn(c,b,t,'sine',300,60,0.4,0.4); tn(c,b,t,'sawtooth',90,500,0.35,0.12,1500); nz(c,b,t,0.4,'bandpass',500,2500,0.2,1.5); };
SPECIAL.quake=(c,t)=>{ const b=sbus(0.9); tn(c,b,t,'sine',130,28,0.45,0.9); nz(c,b,t,0.5,'lowpass',1800,90,0.6,1); nz(c,b,t,0.03,'highpass',2500,2500,0.3,1); tn(c,b,t,'triangle',260,50,0.3,0.2); };
SPECIAL.lob=(c,t)=>{ const b=sbus(0.6); tn(c,b,t,'sine',150,50,0.16,0.5); nz(c,b,t,0.16,'lowpass',1400,200,0.3,1); fClick(t+0.02,0.2,2200); };
SPECIAL.whistle=(c,t)=>{ const b=sbus(0.6); tn(c,b,t,'sine',1800,900,0.3,0.25); tn(c,b,t,'triangle',2400,1200,0.25,0.12); nz(c,b,t,0.15,'highpass',4000,4000,0.15,1); };
SPECIAL.xbow=(c,t)=>{ const b=sbus(0.5); tn(c,b,t,'triangle',180,70,0.12,0.4); nz(c,b,t,0.05,'bandpass',2500,2500,0.25,2); tn(c,b,t+0.02,'sine',900,300,0.18,0.12); };
SPECIAL.mine=(c,t)=>{ const b=sbus(0.6); tn(c,b,t,'sine',200,90,0.14,0.4); nz(c,b,t,0.1,'lowpass',1500,300,0.3,1); tn(c,b,t+0.06,'square',1400,1400,0.04,0.12); };
SPECIAL_KEYS.push('rail','plasma','sing','quake','lob','whistle','xbow','mine');
const FLM={on:false,g:null};
function flameSnd(on){   /* เสียงพ่นไฟต่อเนื่อง: noise ลูปเปิด/ปิดด้วย gain */
  const c=AU.ctx; if(!c||on===FLM.on) return;
  if(!FLM.g){ const g=c.createGain(); g.gain.value=0; g.connect(AU.sfx);
    const s=c.createBufferSource(); s.buffer=NB.pink; s.loop=true; const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=700; bp.Q.value=0.6; const ng=c.createGain(); ng.gain.value=0.9;
    s.connect(bp); bp.connect(ng); ng.connect(g); s.start();
    const lf=c.createOscillator(); lf.frequency.value=7; const lg=c.createGain(); lg.gain.value=260; lf.connect(lg); lg.connect(bp.frequency); lf.start();
    const s2=c.createBufferSource(); s2.buffer=NB.white; s2.loop=true; const hp=c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=3200; const hg=c.createGain(); hg.gain.value=0.05; s2.connect(hp); hp.connect(hg); hg.connect(g); s2.start();
    FLM.g=g; }
  FLM.on=on; FLM.g.gain.setTargetAtTime(on?0.22:0,c.currentTime,0.05);
}
const ARC={on:false,g:null};
function beamSnd(on){   /* เสียงสายฟ้าต่อเนื่อง: oscillator ลูปตัวเดียว เปิด/ปิดด้วย gain ไม่สร้าง node ใหม่ต่อเฟรม */
  const c=AU.ctx; if(!c||on===ARC.on) return;
  if(!ARC.g){ const g=c.createGain(); g.gain.value=0; g.connect(AU.sfx);
    const o=c.createOscillator(); o.type='sawtooth'; o.frequency.value=96; const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=700; o.connect(f); f.connect(g); o.start();
    const lf=c.createOscillator(); lf.frequency.value=23; const lg=c.createGain(); lg.gain.value=40; lf.connect(lg); lg.connect(o.frequency); lf.start();
    const s=c.createBufferSource(); s.buffer=NB.white; s.loop=true; const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=3200; bp.Q.value=1.2; const ng=c.createGain(); ng.gain.value=0.05; s.connect(bp); bp.connect(ng); ng.connect(g); s.start();
    ARC.g=g; }
  ARC.on=on; ARC.g.gain.setTargetAtTime(on?0.16:0,c.currentTime,0.04);
}
function casing(type,t0){
  const c=AU.ctx; if(!type||type==='none') return;
  const pan=rand(-0.6,0.6), o=out(8,pan);
  [0,0.07,0.12].forEach((dt,i)=>{ const g=0.04*Math.pow(0.5,i), tt=t0+dt;
    if(type==='shell'){ nz(c,o,tt,0.05,'lowpass',900,400,g*3,1); if(i===0) tn(c,o,tt,'sine',2500,2400,0.05,g*0.5); }
    else { const f=({b9:5200,b45:4300,rif:3500})[type]*rand(0.95,1.05); tn(c,o,tt,'sine',f,f*0.97,0.07,g); tn(c,o,tt,'triangle',f*1.5,f*1.5,0.04,g*0.4); } });
}
function gunshot(id){
  const c=AU.ctx, t=c.currentTime, key=soundFor(id), w=typeof WDEF!=='undefined'?WDEF[id]:null;
  if(SPECIAL[key]){ SPECIAL[key](c,t); duckMusic(0.88,0.1); return; }
  playGun(key,id); duckMusic(0.85,0.12);
  const p=GSN[key], act=(w&&w.action)||ACT[(w&&w.cls)||id]||'none';
  if(lowOK()) casing(p.casing,t+rand(0.2,0.34));
  if(act==='pump'){ fPump(t+0.3); }
  else if(act==='bolt'){ fBolt(t+0.45); }
  else if(act==='lever'){ fClank(t+0.18,0.22,900); fClick(t+0.26,0.25,2600); }
}

/* ---------- เสียงกลไก (foley) ---------- */
function fClick(t,g=0.22,f=3200){ const c=AU.ctx; nz(c,AU.sfx,t,0.016,'highpass',f,f,g,1); tn(c,AU.sfx,t,'square',rand(1100,1500),520,0.03,g*0.2); }
function fThunk(t,g=0.35){ const c=AU.ctx; nz(c,AU.sfx,t,0.07,'lowpass',1100,220,g,1); tn(c,AU.sfx,t,'sine',160,62,0.09,g); }
function fSlide(t,d,g=0.16){ nz(AU.ctx,AU.sfx,t,d,'bandpass',1400,2800,g,2.2); }
function fRustle(t,d,g=0.12){ for(let i=0;i<3;i++) nz(AU.ctx,AU.sfx,t+i*d/3,d/3,'bandpass',rand(1800,3200),1200,g*rand(0.6,1),0.7,'pink'); }
function fClank(t,g=0.3,f=700){ const c=AU.ctx; nz(c,AU.sfx,t,0.12,'bandpass',f,f,g,6); tn(c,AU.sfx,t,'sine',f*1.5,f*1.48,0.12,g*0.2); tn(c,AU.sfx,t,'sine',f*2.4,f*2.38,0.08,g*0.12); }
function fPump(t){ fSlide(t,0.1,0.18); fClick(t+0.09,0.3,2400); fThunk(t+0.1,0.22); }
function fBolt(t){ fClick(t,0.3,2600); fSlide(t+0.02,0.12,0.15); fThunk(t+0.2,0.2); fClick(t+0.24,0.32,2200); }
const RSTYLE={pistol:'pistol',smg:'pistol',rifle:'rifle',shotgun:'shotgun',sniper:'bolt',lmg:'lmg',special:'launcher'};
const RID={pistol:'pistol',smg:'pistol',ar:'rifle',shotgun:'shotgun',sniper:'bolt',magnum:'revolver',hailstorm:'lmg',havoc:'launcher',hammer:'pistol',triplet:'pistol',stinger:'pistol',twin:'pistol',whisper:'rifle'};
function reloadSeq(id,k){
  const t=T0(), w=typeof WDEF!=='undefined'?WDEF[id]:null, st=(w&&w.reloadStyle)||RID[id]||RSTYLE[(w&&w.cls)||'rifle']||'rifle';
  const A=x=>t+k*x;
  if(st==='shotgun'){ const n=clamp(Math.round(k*3),3,8); for(let i=0;i<n;i++){ const tt=A(0.06+i*(0.7/n)); fClick(tt,0.25,2800); fThunk(tt+0.02,0.14); } fPump(A(0.82)); fPump(A(0.93)); }
  else if(st==='bolt'){ fBolt(A(0.08)); fSlide(A(0.35),0.12,0.2); fThunk(A(0.55),0.4); fClick(A(0.56),0.28,2600); fBolt(A(0.8)); }
  else if(st==='lmg'){ fClick(A(0.1),0.3,2400); fClank(A(0.18),0.4,500); fRustle(A(0.4),0.2,0.2); fThunk(A(0.65),0.45); fClank(A(0.75),0.4,550); fSlide(A(0.88),0.1,0.2); fClick(A(0.92),0.3,2200); }
  else if(st==='launcher'){ fClick(A(0.1),0.3,2000); fSlide(A(0.3),0.15,0.2); fThunk(A(0.55),0.5); fClank(A(0.58),0.25,600); fClick(A(0.8),0.35,2400); }
  else if(st==='revolver'){ fClick(A(0.07),0.3,2800); for(let i=0;i<4;i++) fClick(A(0.2+i*0.04),0.15,3600); fRustle(A(0.5),0.18,0.14); fClank(A(0.82),0.3,900); fClick(A(0.84),0.3,2400); }
  else if(st==='pistol'){ fClick(A(0.08),0.3,3000); fSlide(A(0.16),0.08,0.16); fThunk(A(0.3),0.12); fRustle(A(0.42),0.1,0.1); fSlide(A(0.55),0.08,0.16); fThunk(A(0.62),0.42); fClick(A(0.64),0.3,2600); fSlide(A(0.82),0.08,0.18); fClick(A(0.88),0.35,2400); fThunk(A(0.9),0.2); }
  else { fClick(A(0.08),0.3,3000); fSlide(A(0.2),0.14,0.2); fThunk(A(0.4),0.12); fRustle(A(0.46),0.12,0.1); fThunk(A(0.58),0.42); fClick(A(0.6),0.3,2600); fClick(A(0.82),0.35,2400); fSlide(A(0.84),0.08,0.18); fThunk(A(0.9),0.2); }
}
function duckMusic(a,dur){ if(!AU.musBus) return; const c=AU.ctx, g=AU.musBus.gain, n=c.currentTime; g.cancelScheduledValues(n); g.setTargetAtTime(a,n,0.015); g.setTargetAtTime(1,n+dur,0.25); }

/* ---------- เอฟเฟกต์เสียงทั้งหมด ---------- */
const SFX={
  shoot(id){ gunshot(id); },
  hit(cr){ const t=T0(), c=AU.ctx; nz(c,AU.sfx,t,0.05,'bandpass',cr?3000:1700,cr?1800:700,cr?0.3:0.22,1.5); tn(c,AU.sfx,t,'sine',cr?900:260,cr?500:120,0.07,cr?0.18:0.2);
    nz(c,AU.sfx,t,0.06,'lowpass',1400,400,0.12,1,'pink'); if(cr){ tn(c,AU.sfx,t,'sine',2600,2200,0.12,0.09); tn(c,AU.sfx,t+0.01,'sine',3900,3600,0.1,0.05); } },
  reload(id,dur){ reloadSeq(id,dur||1.3); },
  empty(){ const t=T0(); fClick(t,0.4,2200); tn(AU.ctx,AU.sfx,t,'triangle',700,420,0.04,0.06); },
  mode(){ const t=T0(); fClick(t,0.3,2000); fThunk(t+0.02,0.12); tn(AU.ctx,AU.sfx,t+0.03,'triangle',900,600,0.05,0.05); },
  slide(){ const c=AU.ctx; nz(c,AU.sfx,T0(),0.55,'bandpass',1900,260,0.2,0.9); },
  djump(){ const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'sine',360,820,0.14,0.22); nz(c,AU.sfx,t,0.18,'bandpass',1200,3200,0.1,1.2); },
  poundHit(){ const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'sine',130,34,0.5,0.7); nz(c,AU.sfx,t,0.3,'lowpass',2400,200,0.45,1); fClank(t,0.15,900); },
  inspWhoosh(){ const c=AU.ctx; nz(c,AU.sfx,T0(),0.26,'bandpass',500,2400,0.13,1.4); },
  inspClick(){ const t=T0(); fClick(t,0.18,2800); fClank(t+0.012,0.07,2200); },
  swing(heavy){ const c=AU.ctx; nz(c,AU.sfx,T0(),heavy?0.24:0.16,'bandpass',heavy?400:700,heavy?2600:3400,0.28,1.6); },
  mhit(){ const t=T0(), c=AU.ctx; nz(c,AU.sfx,t,0.09,'lowpass',2600,280,0.5,1); tn(c,AU.sfx,t,'sine',320,80,0.12,0.4); fClank(t,0.18,1800); },
  drawSnd(){ const t=T0(); fClick(t,0.22,2600); fSlide(t+0.03,0.1,0.14); },
  dash(){ const c=AU.ctx, t=T0(); nz(c,AU.sfx,t,0.28,'bandpass',500,2600,0.3,1.4); tn(c,AU.sfx,t,'sine',220,720,0.22,0.1); nz(c,AU.sfx,t,0.12,'lowpass',500,200,0.15,1,'pink'); },
  shock(){ const c=AU.ctx, t=T0(), b=sbus(0.9); nz(c,AU.dist||b,t,0.7,'lowpass',2200,70,0.85,1); tn(c,b,t,'sine',130,30,0.55,0.65); nz(c,b,t,0.8,'lowpass',1500,120,0.3,0.6,'pink'); nz(c,b,t,0.04,'highpass',3000,3000,0.3,1); duckMusic(0.55,0.4); },
  slow(){ const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'sine',1400,160,0.7,0.16); tn(c,AU.sfx,t,'sine',900,110,0.9,0.09); nz(c,AU.sfx,t,0.9,'lowpass',3000,150,0.18,1,'pink'); for(let i=0;i<3;i++) tn(c,AU.sfx,t+i*0.25,'sine',70,60,0.12,0.25); },
  over(){ const t=T0(), c=AU.ctx; [440,660,880,1320].forEach((f,i)=>tn(c,AU.sfx,t+i*0.07,'square',f,null,0.12,0.11,2400)); tn(c,AU.sfx,t,'sawtooth',200,1600,0.4,0.06,1800); },
  barrier(){ const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'sine',320,920,0.45,0.14); tn(c,AU.sfx,t,'sine',480,1380,0.45,0.07); nz(c,AU.sfx,t,0.35,'highpass',1800,4200,0.1,1); },
  gacha(){ const t=T0(), c=AU.ctx; [523,659,784,1047,1319].forEach((f,i)=>{ tn(c,AU.sfx,t+i*0.08,'triangle',f,null,0.22,0.15); tn(c,AU.sfx,t+i*0.08,'sine',f*2.76,null,0.3,0.03); }); },
  combo(n){ const c=AU.ctx, t=T0(), st=[0,2,4,7,9,12,14,16,19,21,24,26][Math.min(Math.max(n-2,0),11)], f=523.25*Math.pow(2,st/12);   /* คอมโบสูง = เสียงสูงเป็นขั้น */
    tn(c,AU.sfx,t,'triangle',f,f*1.01,0.16,0.16,0,0.004); tn(c,AU.sfx,t+0.05,'sine',f*2,f*2,0.14,0.08,0,0.004); if(n>=5) tn(c,AU.sfx,t+0.1,'sine',f*1.5,f*1.5,0.16,0.07,0,0.004); },
  kill(big){ const c=AU.ctx, t=T0(), b=sbus(big?0.8:0.4); nz(c,b,t,big?1.2:0.6,'lowpass',2500,60,0.8,1); tn(c,b,t,'sawtooth',big?200:320,30,big?0.9:0.45,0.2); tn(c,b,t,'sine',80,25,0.5,0.6); nz(c,b,t,0.05,'highpass',4000,4000,0.15,1); },
  deploy(){ const c=AU.ctx, t=T0(), b=sbus(0.7); nz(c,b,t,0.1,'highpass',3000,3000,0.4,1); tn(c,b,t+0.08,'square',500,900,0.12,0.2); tn(c,b,t+0.2,'sine',1200,1800,0.08,0.2); },
  holeOpen(){ const c=AU.ctx, t=T0(), b=sbus(0.9); tn(c,b,t,'sine',200,40,0.9,0.5); nz(c,b,t,0.9,'lowpass',2000,80,0.5,1); tn(c,b,t,'sawtooth',60,180,1,0.1,900,0.3); },
  railCharge(){ const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'sawtooth',90,900,0.8,0.1,1800,0.3); tn(c,AU.sfx,t,'sine',220,2200,0.8,0.08,0,0.3); nz(c,AU.sfx,t,0.8,'bandpass',500,5000,0.08,1.5); },
  arcPop(){ const c=AU.ctx, t=T0(); nz(c,AU.sfx,t,0.02,'highpass',rand(2500,4500),3000,0.1,1); },
  eshoot(d,pan){ const c=AU.ctx, t=T0(), o=out(d||10,pan); tn(c,o,t,'sawtooth',1100,180,0.28,0.13,2500); nz(c,o,t,0.1,'bandpass',2500,900,0.07,1.5); },
  /* ---- เสียงท่าโจมตีศัตรู (รอบ 8): warn = สัญญาณเตือนตอนตั้งท่า แยกตามท่า · go = ตอนลงมือ · stagger = ถูกขัดท่า · healwave = คลื่นฮีล ---- */
  warn(d,pan,kind){ const c=AU.ctx, t=T0(), o=out(d||10,pan);
    if(kind==='pounce'){ tn(c,o,t,'sawtooth',150,80,0.4,0.16,900); nz(c,o,t,0.35,'bandpass',500,250,0.12,2); }
    else if(kind==='slam'){ tn(c,o,t,'sine',50,160,0.7,0.35); tn(c,o,t+0.1,'sawtooth',70,200,0.55,0.08,600); nz(c,o,t,0.7,'lowpass',300,900,0.15,1,'brown'); }
    else if(kind==='heal'){ [660,880,1100,1320].forEach((f,i)=>tn(c,o,t+i*0.16,'sine',f,f*1.02,0.3,0.1)); }
    else if(kind==='leap'){ tn(c,o,t,'triangle',220,700,0.5,0.14); tn(c,o,t+0.15,'sine',330,990,0.4,0.08); nz(c,o,t,0.3,'highpass',2500,4000,0.05,1); }
    else if(kind==='charge'){ tn(c,o,t,'sawtooth',70,420,0.8,0.14,1500); nz(c,o,t,0.8,'bandpass',400,3000,0.1,1.5); tn(c,o,t+0.4,'square',900,900,0.08,0.06); }
    else if(kind==='mortar'){ tn(c,o,t,'sine',160,60,0.4,0.3); tn(c,o,t+0.05,'square',900,400,0.15,0.08,2000); }
    else if(kind==='laser'){ tn(c,o,t,'sine',400,2400,1.0,0.1); tn(c,o,t,'sine',200,1200,1.0,0.06); }
    else if(kind==='spawn'){ tn(c,o,t,'triangle',120,180,0.5,0.14); tn(c,o,t+0.1,'sine',700,900,0.3,0.06); nz(c,o,t,0.4,'bandpass',2000,3500,0.06,2); }
    else { tn(c,o,t,'square',700,1500,0.3,0.09,2600); } },
  mortarFire(d,pan){ const c=AU.ctx, t=T0(), o=out(d||15,pan); tn(c,o,t,'sine',200,40,0.35,0.45); nz(c,o,t,0.25,'lowpass',2000,200,0.4,1); },
  lancerFire(d,pan){ const c=AU.ctx, t=T0(), o=out(d||20,pan); tn(c,o,t,'sawtooth',2600,300,0.35,0.16,4000); tn(c,o,t,'sine',1200,200,0.3,0.2); nz(c,o,t,0.15,'highpass',3000,6000,0.2,1); },
  go(d,pan,kind){ const c=AU.ctx, t=T0(), o=out(d||10,pan); nz(c,o,t,0.28,'bandpass',600,2800,0.24,1.2); tn(c,o,t,'sawtooth',kind==='charge'?120:220,90,0.25,0.13,1200); if(kind==='charge') tn(c,o,t,'sine',60,35,0.5,0.35); },
  stagger(d,pan){ const c=AU.ctx, t=T0(), o=out(d||8,pan); tn(c,o,t,'square',500,120,0.2,0.14,2000); nz(c,o,t,0.1,'highpass',3000,3000,0.2,1); tn(c,o,t+0.05,'sine',1800,900,0.15,0.08); },
  healwave(d,pan){ const c=AU.ctx, t=T0(), o=out(d||8,pan); [523,784,1047,1568].forEach((f,i)=>tn(c,o,t+i*0.04,'sine',f,f,0.5,0.1)); nz(c,o,t,0.5,'highpass',2000,5000,0.06,1); },
  hurt(){ const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'square',160,55,0.25,0.26); nz(c,AU.sfx,t,0.18,'bandpass',900,300,0.45,2); nz(c,AU.sfx,t,0.1,'lowpass',500,150,0.3,1,'pink'); tn(c,AU.sfx,t+0.05,'sine',5500,5400,0.5,0.025,0,0.05); },
  pickup(){ const t=T0(), c=AU.ctx; [523,659,784,1047].forEach((f,i)=>{ tn(c,AU.sfx,t+i*0.06,'triangle',f,null,0.18,0.18); tn(c,AU.sfx,t+i*0.06,'sine',f*2,null,0.2,0.04); }); },
  jump(){ nz(AU.ctx,AU.sfx,T0(),0.12,'highpass',900,2000,0.12,1); },
  land(){ const c=AU.ctx, t=T0(), s=AU.surface; if(s==='sand'){ nz(c,AU.sfx,t,0.15,'lowpass',700,200,0.3,1,'pink'); } else if(s==='rubble'){ nz(c,AU.sfx,t,0.14,'bandpass',900,400,0.4,1.5); nz(c,AU.sfx,t+0.03,0.05,'highpass',2500,2500,0.1,1); } else { nz(c,AU.sfx,t,0.12,'lowpass',600,150,0.35,1); tn(c,AU.sfx,t,'sine',110,50,0.1,0.25); if(s==='wet') nz(c,AU.sfx,t+0.02,0.12,'highpass',3000,2000,0.06,1,'pink'); } },
  wave(){ const t=T0(), c=AU.ctx; [220,277,330,440].forEach((f,i)=>tn(c,AU.sfx,t+i*0.12,'sawtooth',f,null,0.7,0.09,1800,0.05)); tn(c,AU.sfx,t,'sine',60,40,0.9,0.4); nz(c,AU.sfx,t,0.7,'bandpass',300,3000,0.08,1); },
  spawn(d,pan){ const c=AU.ctx, o=out(d||15,pan); tn(c,o,T0(),'sine',200,900,0.35,0.05); nz(c,o,T0(),0.2,'highpass',3000,5000,0.03,1); },
  levelup(){ const t=T0(), c=AU.ctx; [392,523,659,784,1047].forEach((f,i)=>{ tn(c,AU.sfx,t+i*0.07,'triangle',f,null,0.28,0.16); tn(c,AU.sfx,t+i*0.07,'sine',f*2,null,0.2,0.05); }); },
  shieldhit(){ const t=T0(), c=AU.ctx; tn(c,AU.sfx,t,'sine',1800,900,0.1,0.12); nz(c,AU.sfx,t,0.05,'highpass',5000,5000,0.12,1); tn(c,AU.sfx,t,'sine',2760,2700,0.12,0.04); },
  shieldbreak(){ const t=T0(), c=AU.ctx; nz(c,AU.sfx,t,0.4,'bandpass',4000,300,0.4,1.5); tn(c,AU.sfx,t,'sawtooth',900,120,0.4,0.18); tn(c,AU.sfx,t,'sine',90,35,0.3,0.4); for(let i=0;i<4;i++) nz(c,AU.sfx,t+i*0.05,0.03,'highpass',5000,6000,0.12,1); },
  beep(d,pan){ const o=out(d||10,pan); tn(AU.ctx,o,T0(),'square',1500,1500,0.05,0.09); },
  boom(d,pan){ d=d||12; const c=AU.ctx, t=T0(), o=out(d,pan), a=clamp(1-d/45,0.25,1);
    nz(c,o,t,0.02,'highpass',3000,3000,0.4*a,1); nz(c,o,t,0.9,'lowpass',3000,60,0.8*a,1); nz(c,o,t,1.2,'lowpass',1800,100,0.3*a,0.6,'pink'); tn(c,o,t,'sine',95,26,0.7,0.8*a);
    for(let i=0;i<5;i++) nz(c,o,t+0.15+i*rand(0.05,0.14),0.03,'bandpass',rand(800,3000),1200,0.08*a,3); duckMusic(0.6,0.5); },
  blink(d,pan){ const c=AU.ctx, o=out(d||15,pan), a=clamp(1-(d||15)/50,0.2,1); nz(c,o,T0(),0.3,'bandpass',600,3200,0.22*a,2); tn(c,o,T0(),'sine',1200,300,0.25,0.07*a); },
  split(){ const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'sine',520,140,0.25,0.14); nz(c,AU.sfx,t,0.18,'lowpass',1600,300,0.2,1); },
  /* ---- เสียงใหม่ ---- */
  step(sp){ const c=AU.ctx; if(!lowOK()) return; const t=T0(), s=AU.surface, g=clamp((sp||7)/9,0.4,1.3)*0.18;
    if(s==='metal'){ nz(c,AU.sfx,t,0.05,'bandpass',2200,1200,g*1.1,2); tn(c,AU.sfx,t,'sine',170,90,0.07,g*0.9); }
    else if(s==='grass') nz(c,AU.sfx,t,0.1,'lowpass',800,300,g*1.1,1,'pink');
    else if(s==='snow') nz(c,AU.sfx,t,0.09,'bandpass',1700,800,g*1.2,1,'pink');
    else if(s==='sand') nz(c,AU.sfx,t,0.1,'lowpass',900,350,g*1.2,1,'pink');
    else if(s==='rubble'){ nz(c,AU.sfx,t,0.08,'bandpass',1100,500,g*1.5,1.5); nz(c,AU.sfx,t+0.02,0.03,'highpass',3000,3000,g*0.4,1); }
    else if(s==='wet'){ nz(c,AU.sfx,t,0.07,'lowpass',1200,300,g*1.3,1); nz(c,AU.sfx,t,0.12,'highpass',3500,2500,g*0.5,1,'pink'); }
    else { nz(c,AU.sfx,t,0.06,'lowpass',1500,350,g*1.4,1); tn(c,AU.sfx,t,'sine',120,60,0.06,g); } },
  rocket(){ SPECIAL.launch(AU.ctx,T0()); },
  bounce(d,pan){ const o=out(d||6,pan); fClank(T0(),0.15,1200); tn(AU.ctx,o,T0(),'sine',200,90,0.06,0.2); },
  spinUp(d){ d=d||0.5; const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'sawtooth',70,380,d,0.12,900,0.05); nz(c,AU.sfx,t,d,'bandpass',300,1500,0.1,1); for(let i=0;i<10;i++) fClick(t+d*Math.pow(i/10,0.7),0.1,2400); },
  spinDown(){ const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'sawtooth',380,60,0.6,0.1,900); nz(c,AU.sfx,t,0.5,'bandpass',1500,300,0.08,1); },
  jam(){ const t=T0(); fClank(t,0.3,500); fClick(t+0.08,0.3,2000); fSlide(t+0.16,0.1,0.15); },
  overheat(){ const c=AU.ctx, t=T0(); nz(c,AU.sfx,t,0.5,'highpass',3000,5000,0.12,1,'pink'); tn(c,AU.sfx,t,'sine',1200,1000,0.2,0.05); },
  scan(){ const c=AU.ctx, t=T0(); tn(c,AU.sfx,t,'sine',300,2200,0.6,0.12,0,0.1); tn(c,AU.sfx,t+0.6,'triangle',1800,1800,0.08,0.1); },
  inspect(){ const t=T0(); fClick(t,0.12,2800); fSlide(t+0.4,0.2,0.08); fClick(t+1.3,0.12,2600); },
  leap(d,pan){ const o=out(d||10,pan); nz(AU.ctx,o,T0(),0.25,'bandpass',500,2000,0.2,1.2); tn(AU.ctx,o,T0(),'sawtooth',180,420,0.2,0.07,1200); },
  slam(d,pan){ const c=AU.ctx, o=out(d||10,pan), t=T0(); tn(c,o,t,'sine',90,28,0.5,0.7); nz(c,o,t,0.4,'lowpass',1800,100,0.5,1); nz(c,o,t,0.02,'highpass',2500,2500,0.25,1); duckMusic(0.7,0.3); },
  acid(d,pan){ const c=AU.ctx, o=out(d||10,pan), t=T0(); nz(c,o,t,0.4,'bandpass',2500,5000,0.12,2,'pink'); tn(c,o,t,'sine',600,200,0.15,0.08); },
  summon(d,pan){ const c=AU.ctx, o=out(d||15,pan), t=T0(); tn(c,o,t,'sawtooth',110,330,0.8,0.1,1400,0.2); tn(c,o,t,'sine',55,110,0.8,0.2); nz(c,o,t,0.8,'highpass',2000,6000,0.05,1); },
  stun(d,pan){ const c=AU.ctx, o=out(d||8,pan), t=T0(); tn(c,o,t,'square',90,70,0.5,0.1); for(let i=0;i<5;i++) nz(c,o,t+i*0.08,0.02,'highpass',4500,4500,0.12,1); },
  laser(d,pan){ const o=out(d||20,pan); tn(AU.ctx,o,T0(),'sine',500,1800,1.2,0.07,0,0.3); },
};
/* ---- ตัวคุมจำนวนเสียงพร้อมกัน (กันเสียงขาด/แตกตอนมีเสียงถล่มพร้อมกัน) ----
   SFX_PRI: 3 = เสียงผู้เล่น (ตัดทีหลังสุด) · 2 = ปกติ · 1 = เสียงศัตรู/เสียงเล็กๆ (ตัดก่อน) · SFX_GAP = เว้นระยะขั้นต่ำต่อเสียงชนิดเดียวกัน (วิ)
   VOICE_LIM: เพดาน AU.vc ต่อระดับความสำคัญ */
const SFX_PRI={shoot:3,reload:3,empty:3,hurt:3,swing:3,mhit:3,inspWhoosh:2,inspClick:2,slide:3,djump:3,poundHit:3,mode:3,drawSnd:3,dash:3,shock:3,slow:3,barrier:3,over:3,eshoot:1,beep:1,arcPop:1,step:1,bounce:1,hit:2};
const SFX_GAP={inspWhoosh:0.12,inspClick:0.05,eshoot:0.045,hit:0.03,beep:0.07,arcPop:0.05,step:0.1,bounce:0.05,kill:0.05,warn:0.09,go:0.09,stagger:0.09,shieldhit:0.06,bounceSnd:0.05};
const VOICE_LIM={1:40,2:72,3:120}, sfxLast={};
function sfxOK(n){
  const c=AU.ctx; if(!c||!SFX[n]||c.state!=='running') return false;
  const g=SFX_GAP[n]; if(g){ const now=c.currentTime; if(now-(sfxLast[n]||-9)<g) return false; sfxLast[n]=now; }
  return AU.vc<=VOICE_LIM[SFX_PRI[n]||2];
}
/* ช่องเสียงแยกหมวด: ส่งเสียงเข้าบัสของหมวดชั่วคราว (AU.sfx ถูกอ่านตอนสร้างโหนด) และคูณรีเวิร์บด้วยค่าเดียวกัน ให้สไลเดอร์ 0 = เงียบสนิท */
const SFX_CAT={}; { const m={gun:['shoot','reload','empty','mode','drawSnd','rocket','spinUp','spinDown','jam','overheat','deploy','holeOpen','railCharge','arcPop','bounce'],
  enemy:['eshoot','mortarFire','lancerFire','laser','leap','slam','acid','summon','split','warn','spawn'],melee:['swing','mhit'],hurt:['hurt','shieldhit','shieldbreak']};
  for(const k in m) m[k].forEach(n=>SFX_CAT[n]=k); }
const CAT_VOL={gun:'gunVol',enemy:'enemyVol',melee:'meleeVol',hurt:'hurtVol'};
function catCall(n,fn){
  const k=SFX_CAT[n], cb=k&&AU.cat&&AU.cat[k]; if(!cb) return fn();
  const v=(S[CAT_VOL[k]]??100)/100, ps=AU.sfx, pw=AU.wet; if(v<=0) return;
  cb.gain.value=v; AU.sfx=cb; AU.wet=pw*v;   // บัสคุมเสียงตรง · AU.wet คุมรีเวิร์บ
  try{ fn(); } finally{ AU.sfx=ps; AU.wet=pw; }
}
const sfx=(n,...a)=>{ if(sfxOK(n)) try{ catCall(n,()=>SFX[n](...a)); }catch(e){ if(!AU.warned){ AU.warned=true; console.warn('sfx error',n,e); } } };
/* เสียงตามตำแหน่งศัตรู: คำนวณระยะ+ทิศจากกล้อง แล้วส่งเป็นอาร์กิวเมนต์ (d,pan) ให้เอฟเฟกต์ที่รองรับ */
function sfxAt(name,pos,...rest){
  if(!sfxOK(name)) return;
  let d=10, pan=0;
  try{ const cp=camera.position, e=camera.matrixWorld.elements, dx=pos.x-cp.x, dy=pos.y-cp.y, dz=pos.z-cp.z; d=Math.hypot(dx,dy,dz); pan=clamp((dx*e[0]+dy*e[1]+dz*e[2])/Math.max(d,1),-1,1); }catch(e2){}
  try{ catCall(name,()=>SFX[name](d,pan,...rest)); }catch(e3){ if(!AU.warned){ AU.warned=true; console.warn('sfxAt error',name,e3); } }
}

/* ---------- ระบบเพลงแบบ adaptive (แต่ละแมพมีธีมของตัวเอง ความเข้มขึ้นกับสถานการณ์) ---------- */
const MT={
  rain:   {bpm:112,chords:[[57,60,64],[53,57,60],[60,64,67],[55,59,62]],bass:[33,29,36,31],kick:'X...X...X...X...',snare:'....X.......X...',hat:'..x...x...x...x.',bassP:'x.xxx.xxx.xxx.xx',arp:'0.1.2.1.0.2.1.2.',arpW:'triangle',scale:[0,2,3,5,7,8,10],leadRoot:69,leadP:'x..x..x.x..x..x.',bassW:'sawtooth',padG:0.03},
  desert: {bpm:100,chords:[[50,53,57],[51,55,58],[50,53,57],[48,52,55]],bass:[26,27,26,24],kick:'X.....x...x.....',snare:'........X.......',hat:'x.x.x.x.x.x.x.x.',perc:'x.x..x.xx..x.x..',bassP:'x..x..x.x..x..x.',arp:'0.12.0..1.20.1..',arpW:'pluck',scale:[0,1,3,5,7,8,10],leadRoot:62,leadP:'x.x..x..x.x..x..',bassW:'sawtooth',padG:0.022},
  apoc:   {bpm:84,chords:[[52,55,59],[48,52,55],[45,48,52],[47,50,54]],bass:[28,24,21,23],kick:'X..x....X..x....',snare:'........X.......',hat:'',perc:'',metal:'x.......x...x...',bassP:'x...............',arp:'0...1...2...1...',arpW:'bell',scale:[0,2,3,5,7,8,10],leadRoot:64,leadP:'x.......x.......',bassW:'sawtooth',padG:0.04,bell:true},
  sandbox:{bpm:124,chords:[[60,64,67],[55,59,62],[57,60,64],[53,57,60]],bass:[36,31,33,29],kick:'X...X...X...X...',snare:'....X.......X...',hat:'.x.x.x.x.x.x.x.x',bassP:'x...x.x.x...x.x.',arp:'0.1.2.1.0.1.2.3.',arpW:'triangle',scale:[0,2,4,7,9],leadRoot:72,leadP:'x.x...x.x.x...x.',bassW:'square',padG:0.026},
  market: {bpm:108,chords:[[55,58,62],[51,55,58],[48,51,55],[50,54,57]],bass:[31,27,24,26],kick:'X..x..x...X.x...',snare:'....X.......X..x',hat:'x.xxx.xxx.xxx.xx',perc:'..x..x..x..x..x.',bassP:'x..xx..xx..xx.x.',arp:'0.1.2.0.1.2.1.0.',arpW:'pluck',scale:[0,2,3,5,7,8,11],leadRoot:67,leadP:'x..x.x..x..x.x..',bassW:'sawtooth',padG:0.022},
};
MT.ruins=Object.assign({},MT.desert,{bpm:92,arpW:'pluck',kick:'X.......x.......',snare:'........X.......',hat:'x...x...x...x...'});
MT.foundry=Object.assign({},MT.apoc,{bpm:92,kick:'X..x..X...x.....',snare:'........X.......',hat:'x.x.x.x.x.x.x.x.',arpW:'pluck'});
MT.space=Object.assign({},MT.rain,{bpm:96,chords:[[57,60,64],[53,57,60],[55,59,62],[52,55,59]],bass:[33,29,31,28],kick:'X.......X.......',snare:'........X.......',hat:'x.x.x.x.x.x.x.x.',arpW:'bell'});
MT.cave=Object.assign({},MT.apoc,{bpm:78,kick:'X.......X.......',snare:'................',hat:'..x...x...x...x.',arpW:'bell'});
MT.snow=Object.assign({},MT.rain,{bpm:88,chords:[[57,60,64],[55,59,62],[52,55,59],[53,57,60]],bass:[33,31,28,29],kick:'X.......X.......',snare:'........X.......',hat:'..x.......x.....',arpW:'bell'});   // ธีมเพลงแมพหิมะ: ช้า เย็น
const has=(str,s)=>!!str&&str[s]!==undefined&&str[s]!=='.';
function mDuck(t){ const g=AU.musIn.gain; g.cancelScheduledValues(t); g.setValueAtTime(0.5,t); g.linearRampToValueAtTime(1,t+0.22); }
function mKick(t,v=1){ const c=AU.ctx; tn(c,AU.musDry,t,'sine',160,42,0.28,0.8*v); nz(c,AU.musDry,t,0.02,'highpass',3000,3000,0.15*v,1); mDuck(t); }
function mSnare(t,v=1){ const c=AU.ctx; nz(c,AU.musDry,t,0.16,'bandpass',1900,1200,0.35*v,0.9); tn(c,AU.musDry,t,'triangle',220,140,0.1,0.25*v); const s=c.createGain(); s.gain.value=0.3; s.connect(AU.mvIn); nz(c,s,t,0.3,'highpass',3000,3000,0.12*v,1); }
function mHat(t,v=1){ nz(AU.ctx,AU.musDry,t,0.04,'highpass',8500,8500,0.08*v,1); }
function mPerc(t,v=1){ const c=AU.ctx; tn(c,AU.musDry,t,'sine',330,190,0.09,0.3*v); nz(c,AU.musDry,t,0.04,'bandpass',1800,1800,0.15*v,1); }
function mMetal(t){ const c=AU.ctx; nz(c,AU.musDry,t,0.3,'bandpass',1100,900,0.15,8); tn(c,AU.musDry,t,'square',380,370,0.2,0.04,1500); }
function mBass(t,f,d,cut,wave){ const c=AU.ctx, o=c.createOscillator(); o.type=wave||'sawtooth'; o.frequency.value=f;
  const fl=c.createBiquadFilter(); fl.type='lowpass'; fl.Q.value=6; fl.frequency.setValueAtTime(cut,t); fl.frequency.exponentialRampToValueAtTime(120,t+d);
  const g=c.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.26,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  o.connect(fl); fl.connect(g); g.connect(AU.musIn); o.start(t); o.stop(t+d+0.05); tn(c,AU.musIn,t,'sine',f,f,d,0.18); }
function mPad(t,notes,d,pg){ const c=AU.ctx; notes.forEach(m=>{ for(let k=0;k<2;k++){ const o=c.createOscillator(); o.type='sawtooth'; o.frequency.value=mtof(m); o.detune.value=rand(-12,12);
  const fl=c.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=1000; const g=c.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(pg||0.03,t+0.6); g.gain.linearRampToValueAtTime(0.0001,t+d);
  o.connect(fl); fl.connect(g); g.connect(AU.musIn); g.connect(AU.mvIn); o.start(t); o.stop(t+d+0.1); } }); }
function mPluck(t,f,d){ const c=AU.ctx, o=c.createOscillator(); o.type='sawtooth'; o.frequency.value=f; const fl=c.createBiquadFilter(); fl.type='lowpass'; fl.Q.value=3; fl.frequency.setValueAtTime(3500,t); fl.frequency.exponentialRampToValueAtTime(300,t+d);
  const g=c.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.09,t+0.005); g.gain.exponentialRampToValueAtTime(0.0001,t+d); o.connect(fl); fl.connect(g); g.connect(AU.musIn); g.connect(AU.mvIn); o.start(t); o.stop(t+d+0.05); }
function mBell(t,f){ const c=AU.ctx; tn(c,AU.musIn,t,'sine',f,f,1.4,0.06,0,0.004); tn(c,AU.musIn,t,'sine',f*2.76,f*2.76,0.9,0.025,0,0.004); const s=c.createGain(); s.gain.value=0.5; s.connect(AU.mvIn); tn(c,s,t,'sine',f,f,1.4,0.05,0,0.004); }
function mLead(t,f,d){ const c=AU.ctx; for(const dt of [-8,8]){ const o=c.createOscillator(); o.type='sawtooth'; o.frequency.value=f; o.detune.value=dt; const fl=c.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=2400;
  const g=c.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.045,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+d); o.connect(fl); fl.connect(g); g.connect(AU.musIn); g.connect(AU.mvIn); o.start(t); o.stop(t+d+0.05); } }
function mRiser(t,d){ const c=AU.ctx, s=c.createBufferSource(); s.buffer=NB.white; const f=c.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.2; f.frequency.setValueAtTime(300,t); f.frequency.exponentialRampToValueAtTime(6000,t+d);
  const g=c.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.12,t+d); g.gain.linearRampToValueAtTime(0,t+d+0.02); s.connect(f); f.connect(g); g.connect(AU.musDry); s.start(t,0); s.stop(t+d+0.05); }
function musicStep(t,i,th,it,menu){
  const s=i%16, bar=((i/16)|0)%4, ch=th.chords[bar], st=60/th.bpm/4;
  if(s===0){ mPad(t,ch,st*16,th.padG); if(th.bell&&it>0.25) mBell(t+st*2,mtof(ch[(Math.random()*3)|0]+24)); }
  if(has(th.bassP,s)&&(it>0.35||s%4===0)) mBass(t,mtof(th.bass[bar]+(((s%8===6)||(s%8===7))&&it>0.5?12:0)),st*1.8,400+it*1400,th.bassW);
  const kk=th.kick[s];
  if(!menu&&it>0.15&&(kk==='X'||(kk==='x'&&it>0.5))) mKick(t,kk==='X'?1:0.7); else if(menu&&kk==='X'&&s%8===0) mKick(t,0.4);
  if(it>0.35){ if(has(th.snare,s)) mSnare(t,1); if(has(th.perc,s)) mPerc(t,1); }
  if(it>0.3&&has(th.hat,s)&&th.hat[s]==='x') mHat(t,s%2?0.7:1);
  if(it>0.8&&th.hat&&s%2===1) mHat(t+st*0.5,0.5);
  if(it>0.4&&has(th.metal,s)) mMetal(t);
  if(has(th.arp,s)&&(it>0.55||(menu&&s%4===0))){ const idx=+th.arp[s], m=ch[idx%3]+12*(1+((idx/3)|0)), f=mtof(m);
    if(th.arpW==='pluck') mPluck(t,f,st*2); else if(th.arpW==='bell') mBell(t,f); else tn(AU.ctx,AU.musIn,t,'triangle',f,f,st*1.6,0.045); }
  if(it>0.8&&has(th.leadP,s)){ const L=th.scale.length; AU.lead=clamp(AU.lead+((Math.random()*5|0)-2),0,L*2-1); mLead(t,mtof(th.leadRoot-12+th.scale[AU.lead%L]+12*((AU.lead/L)|0)),st*2); }
  if(bar===3&&s===0&&it>0.6&&((i/64)|0)%2===1) mRiser(t,st*16);
}
function musicTarget(){
  if(typeof state==='undefined'||state==='menu') return [0.12,true];
  if(state==='play'){ let it=0.28; try{ const n=enemies.length; if(n>0||toSpawn>0) it=0.5+Math.min(n/9,0.3)+Math.min(wave*0.015,0.1); if(P.hp<P.maxHp*0.3) it+=0.12; }catch(e){} return [clamp(it,0,1),false]; }
  if(state==='over') return [0.05,false];
  return [0.2,false];
}
function musicTick(){
  const c=AU.ctx; if(!c||c.state==='suspended') return;
  const now=c.currentTime; ambEvents(now);
  if(S.music<=0) return;
  const th=MT[AU.theme]||MT.rain, [tg,menu]=musicTarget();
  AU.int+=(tg-AU.int)*Math.min(1,(now-(AU.lastT||now))*0.7); AU.lastT=now;
  const st=60/th.bpm/4/(AU.mr||1); if(AU.next<now-0.2) AU.next=now+0.05;
  while(AU.next<now+0.12){ musicStep(AU.next,AU.step,th,AU.int,menu); AU.next+=st; AU.step++; }
}

/* ---------- เริ่มระบบเสียง / ระดับเสียง ---------- */
function initAudio(){
  if(AU.ctx){ if(AU.ctx.state==='suspended') AU.ctx.resume(); return; }
  const C=window.AudioContext||window.webkitAudioContext; if(!C) return;
  const ctx=new C({latencyHint:'interactive'}); AU.ctx=ctx; makeNoise(ctx);
  const G=()=>ctx.createGain();
  AU.master=G(); const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-8; comp.knee.value=18; comp.ratio.value=4; comp.attack.value=0.004; comp.release.value=0.18;
  AU.master.connect(comp); comp.connect(ctx.destination);
  AU.sfx=G(); AU.sfx.connect(AU.master); AU.mus=G(); AU.mus.connect(AU.master); AU.ambBus=G(); AU.ambBus.connect(AU.master);
  AU.dist=ctx.createWaveShaper(); AU.dist.curve=SHAPE; AU.dist.connect(AU.sfx);
  AU.cat={}; for(const k of ['gun','enemy','melee','hurt']){ AU.cat[k]=G(); AU.cat[k].connect(AU.sfx); }
  AU.verbIn=G(); AU.verbWet=G(); AU.verbWet.gain.value=0.9; AU.verbWet.connect(AU.sfx);
  AU.musBus=G(); AU.musBus.connect(AU.mus); AU.musIn=G(); AU.musIn.connect(AU.musBus); AU.musDry=G(); AU.musDry.connect(AU.musBus);
  AU.mvIn=G(); { const cv=ctx.createConvolver(); cv.buffer=buildIR(ctx,{len:2.2,decay:2.6,damp:0.6,slap:[]}); const og=G(); og.gain.value=0.5; AU.mvIn.connect(cv); cv.connect(og); og.connect(AU.musBus); }
  AU.next=ctx.currentTime+0.1; AU.step=0; AU.evAt=ctx.currentTime+6;
  setAcoustics(curMap); applyVolumes();
  if(typeof WDEF!=='undefined') Object.keys(WDEF).forEach(id=>{ const k=soundFor(id); if(!SPECIAL[k]) queueRender(k); });
}
function applyVolumes(){
  if(!AU.ctx) return;
  AU.master.gain.value=S.master/100; AU.sfx.gain.value=S.sfx/100; AU.mus.gain.value=S.music/100*0.45; AU.ambBus.gain.value=S.amb/100;
  if(AU.cat){ AU.cat.gun.gain.value=1; AU.cat.enemy.gain.value=1; AU.cat.melee.gain.value=1; AU.cat.hurt.gain.value=1; }
  if(AU.rainBus) AU.rainBus.gain.value=S.rain?1:0;
}
const vib=p=>{ if(S.vibrate&&navigator.vibrate) try{ navigator.vibrate(p); }catch(e){} };

/* ================= GAME STATE ================= */
let state='menu', editing=false, editReturn='menu', setReturn='menu';
const P={pos:new THREE.Vector3(0,0.8,0),vel:new THREE.Vector3(),yaw:0,pitch:0,onGround:true,hp:100,maxHp:100,radius:0.45};
let MAG=30, reloadDur=1.3;
let ammo=MAG, reloading=false, reloadT=0, fireCD=0, firing=false, aiming=false, sprintT=false;
let score=0, kills=0, wave=0, toSpawn=0, spawnT=0, waveBreak=0, combo=0, comboT=0;
let hpT=0, slE=9, slOn=false, lastCrit=false;   /* hit-pause (วินาทีจริงที่เหลือ) · สโลว์โมชั่น (เวลาที่ผ่านไป/เปิดอยู่) */
let shake=0, gunKick=0, flashT=0, bobT=0, aimLerp=0, sprintLerp=0, swayX=0, swayY=0, vigA=0, hitT=0, curSpread=0.012, lastGap=-1;
const keys={}, joy={x:0,y:0};
const enemies=[], projs=[], pickups=[];
const UP=new THREE.Vector3(0,1,0);
const _v=new THREE.Vector3(), _o=new THREE.Vector3(), _d=new THREE.Vector3(), _w=new THREE.Vector3(), _m=new THREE.Vector3();
const ray=new THREE.Raycaster();

/* ================= COLLISION ================= */
function collide(pos,r,feetY,headY,en){
  let ground=0;
  for(const b of colliders){
    if(en&&b.air) continue;   /* ดาดฟ้า/บันได (air): ศัตรูบินผ่านได้ */
    const cx=clamp(pos.x,b.minX,b.maxX), cz=clamp(pos.z,b.minZ,b.maxZ);
    const dx=pos.x-cx, dz=pos.z-cz, d2=dx*dx+dz*dz;
    if(d2>=r*r) continue;
    if(feetY>=b.maxY-0.35){ ground=Math.max(ground,b.maxY); continue; }
    if(headY<=b.minY) continue;
    if(d2>1e-8){ const d=Math.sqrt(d2); pos.x+=dx/d*(r-d); pos.z+=dz/d*(r-d); }
    else { const l=pos.x-b.minX, rt=b.maxX-pos.x, f=pos.z-b.minZ, bk=b.maxZ-pos.z, m=Math.min(l,rt,f,bk);
      if(m===l) pos.x=b.minX-r; else if(m===rt) pos.x=b.maxX+r; else if(m===f) pos.z=b.minZ-r; else pos.z=b.maxZ+r; }
  }
  return ground;
}
const inBox=q=>colliders.some(b=>q.x>b.minX&&q.x<b.maxX&&q.z>b.minZ&&q.z<b.maxZ&&q.y>b.minY&&q.y<b.maxY);

/* ================= ENEMIES ================= */
const ET={
  drone:{hp:40,speed:4.2,r:0.55,fly:2.3,color:0xff2bd6,score:100,xp:10,fireRate:2.6,dmg:8,proj:15},
  hunter:{hp:32,speed:7.8,r:0.5,fly:0.9,color:0xff3b30,score:150,xp:12,melee:18},
  titan:{hp:260,speed:2.2,r:1.2,fly:2.4,color:0xffb300,score:600,xp:60,res:{stun:0.375,slow:0.5,freeze:0.6,burn:0.7},pref:13,fireRate:2.3,dmg:11,proj:12,spread:3},
  // ---- มอนเตอร์ใหม่ 5 ตัว ----
  splitter:{name:'SPLITTER',tip:'แตกเป็นเศษเล็ก 3 ตัวเมื่อตาย',hp:75,speed:3.3,r:0.85,fly:1.3,color:0x2f7bff,score:180,xp:15,melee:14,split:3},
  bomber:{name:'BOMBER',tip:'วิ่งเข้าใส่แล้วระเบิด — ยิงตั้งแต่ไกลๆ',hp:24,speed:6,r:0.5,fly:0.9,color:0xff6a00,score:160,xp:12,boom:{r:5,dmg:36}},
  wraith:{name:'WRAITH',tip:'หายตัว เทเลพอร์ต แล้วยิงรัว 3 นัด',hp:48,speed:3,r:0.62,fly:1.7,color:0xb26bff,score:240,xp:18,pref:11,fireRate:2.4,dmg:9,proj:19},
  aegis:{name:'AEGIS',tip:'มีโล่พลังงาน — ทำลายโล่ก่อน แล้วมันจะคลั่ง',hp:95,shield:150,speed:2.7,r:0.95,fly:1.9,color:0x00ffd0,score:380,xp:26,res:{stun:0.375,slow:0.5,freeze:0.6,burn:0.7},pref:12,fireRate:2.7,dmg:12,proj:12,spread:2},
  mender:{name:'MENDER',tip:'ฮีลเลือดศัตรูตัวอื่น — ฆ่าก่อน!',hp:60,speed:3.8,r:0.62,fly:3.2,color:0x5dff7a,score:320,xp:24,pref:17,fireRate:2.6,dmg:6,proj:14,heal:14,range:20},
  // ---- รอบ 8 ส่วน ก: มอนเตอร์ใหม่ ----
  leaper:{name:'LEAPER',tip:'ย่อตัวแล้วกระโดดตะครุบ — ดูวงแดงบนพื้นแล้วเคลื่อนที่หนี',hp:70,speed:6,r:0.6,fly:0.9,color:0xd4ff00,score:260,xp:20,pref:8},
  charger:{name:'CHARGER',tip:'เกราะหน้าแข็งมาก — เห็นเส้นแดงให้หลบข้าง ยิงตา/ด้านหลังรับดาเมจเต็ม',hp:160,speed:3,r:0.9,fly:1.0,color:0xe8f0ff,score:420,xp:34,pref:14,armor:{front:0.4,back:1.5}},
  // ---- รอบ 8 ส่วน ข ----
  mortar:{name:'MORTAR',tip:'ยิงครกโค้ง — ดูวงแดงหดตัวบนพื้นแล้วย้ายหนี',hp:85,speed:2,r:0.7,fly:1.2,color:0xff7a9c,score:300,xp:26,pref:22},
  hive:{name:'HIVE',tip:'ปล่อยแมลง MITE — ยิงตอนท้องเปิดรับดาเมจ +50% ตายแล้วแมลงระเบิดหมด',hp:220,speed:1.5,r:1.0,fly:4,color:0xffcf8a,score:500,xp:44,pref:16},
  lancer:{name:'LANCER',tip:'เลเซอร์ซุ่มยิง — เห็นเส้นขาวกะพริบให้หลุดแนวทันที ยิงตาตอนชาร์จเพื่อขัด',hp:60,speed:2.5,r:0.6,fly:1.5,color:0xff1744,score:340,xp:28,pref:28},
  // แมลงของ HIVE (ไม่เกิดเองตามเวฟ)
  mite:{hp:10,speed:7,r:0.25,fly:0.9,color:0xffcf8a,score:10,xp:1,melee:6},
  // เศษที่แตกออกจาก SPLITTER (ไม่เกิดเองตามเวฟ)
  shard:{hp:16,speed:8.5,r:0.32,fly:0.7,color:0x62a0ff,score:40,xp:3,melee:8},
};
/* ===== ท่าโจมตีของศัตรู (รอบ 8) — ปรับค่าได้ที่นี่ =====
   shoot : wind=ตั้งท่า(วิ) n=จำนวนนัด nw=เวฟที่เริ่ม +1 นัด gap=ห่างนัด rec=พัก back=ถอยหลังตอนพัก aim=เส้นเล็ง
   pounce: spd=ความเร็วพุ่ง dur=ระยะเวลาพุ่ง dmg rec cd=[min,max]คูลดาวน์ rng=ระยะที่เริ่มใช้ w=ความกว้างเส้นเตือน enr=ใช้ตอนคลั่งเท่านั้น shake=สั่นตัวตอนตั้งท่า
   slam  : r=รัศมี AoE dmg rng=ระยะที่เริ่มใช้ · heal: r pct=% เลือดสูงสุด cd
   leap  : fly=เวลาลอย arc=ความสูง r=รัศมีลงพื้น dmg min/max=ช่วงระยะ · charge: spd dur dmg w stun=มึนเมื่อชนกำแพง
   windup ต่ำสุดเสมอ ATK_MINWIND (0.35 วิ) */
const ATKD={
  drone:{shoot:{wind:0.35,n:2,nw:5,gap:0.12,rec:0.45,back:1}},
  hunter:{pounce:{wind:0.4,spd:22,dur:0.3,dmg:18,rec:0.6,cd:[1.2,2],rng:8,w:1.3}},
  titan:{shoot:{wind:0.5,n:1,gap:0,rec:0.4},slam:{wind:0.7,r:5,dmg:20,rec:0.8,cd:[5,7],rng:11}},
  splitter:{pounce:{wind:0.5,spd:13,dur:0.4,dmg:14,rec:0.5,cd:[1.4,2.2],rng:7,w:1.6,shake:1}},
  wraith:{shoot:{wind:0.35,n:3,gap:0.2,rec:0.3,aim:1}},
  aegis:{shoot:{wind:0.45,n:1,gap:0,rec:0.4},pounce:{wind:0.6,spd:15,dur:0.7,dmg:20,rec:0.8,cd:[6,6],rng:16,w:2,enr:1}},
  mender:{shoot:{wind:0.4,n:1,gap:0,rec:0.4},heal:{wind:0.8,r:8,pct:0.15,rec:0.5,cd:8}},
  leaper:{leap:{wind:0.6,fly:0.7,arc:3.4,r:2.5,dmg:22,rec:0.5,cd:[3,4.5],min:3.5,max:20}},
  charger:{charge:{wind:0.8,spd:22,dur:1.4,dmg:30,rec:0.9,cd:[4,6],min:6,max:32,w:1.8,stun:2}},
  // ส่วน ข — mortar: fly=เวลาบินของกระสุน r=รัศมี dmg gap=ห่างลูกที่ 2 (เวฟ n2w ขึ้นไปยิง 2 ลูก) · laser: aim=เล็งตาม lock=ล็อก(วิ) dmg · spawn: n=ต่อครั้ง max=สูงสุดพร้อมกัน
  mortar:{mortar:{wind:0.5,fly:1.6,r:4,dmg:34,rec:0.5,cd:[4,4],gap:0.4,n2w:8}},
  lancer:{laser:{aim:1.2,lock:0.6,dmg:45,rec:0.5,cd:[5,5]}},
  hive:{spawn:{wind:0.5,n:2,max:8,rec:0.3,cd:[6,6]}},
};
for(const k in ATKD){ ET[k].A=ATKD[k]; ET[k].atkSys=true; }
ET.titan.noStagger=true; ET.aegis.noStagger=true;
const EGEO={}; for(const k in ET){ const r=ET[k].r; EGEO[k]={body:new THREE.IcosahedronGeometry(r,1),ring:new THREE.TorusGeometry(r*1.3,r*0.07,8,40),eye:new THREE.SphereGeometry(r*0.3,16,12),spike:new THREE.ConeGeometry(r*0.18,r*0.7,6)}; }
const EGLOW={}; for(const k in ET) EGLOW[k]=new THREE.MeshBasicMaterial({color:hdr(ET[k].color,2.5)});
applyEnemyGlow();
const XG={sph:new THREE.SphereGeometry(1,16,12),cone:new THREE.ConeGeometry(1,1,10,1,true),dodeca:new THREE.DodecahedronGeometry(1,0),octa:new THREE.OctahedronGeometry(1,0),
  ico2:new THREE.IcosahedronGeometry(1,2),pod:new THREE.IcosahedronGeometry(1,0),icoW:new THREE.IcosahedronGeometry(1,2),box:new THREE.BoxGeometry(1,1,1)};
const beamGeo=new THREE.BoxGeometry(0.07,0.07,1); beamGeo.translate(0,0,0.5);
const ICO_DIRS=(()=>{ const p=(1+Math.sqrt(5))/2, a=[]; for(const s1 of [-1,1]) for(const s2 of [-1,1]) a.push([0,s1,s2*p],[s1,s2*p,0],[s2*p,0,s1]);
  return a.map(v=>{ const l=Math.hypot(v[0],v[1],v[2]); return new THREE.Vector3(v[0]/l,v[1]/l,v[2]/l); }); })();
function makeEnemy(key){
  const T=ET[key], G=EGEO[key], R=T.r, g=new THREE.Group(), mats=[], ex={};
  const bodyMat=new THREE.MeshStandardMaterial({color:0x1a1d28,metalness:0.9,roughness:0.28,flatShading:true,emissive:0xffffff,emissiveIntensity:0,envMapIntensity:0.9});
  mats.push(bodyMat);
  let glow=EGLOW[key], body, ring=null, ring2=null, eye=null;
  const mkEye=(sc=1,x=0,y=0,z=R*0.85)=>{ const m=new THREE.Mesh(G.eye,glow); m.scale.setScalar(sc); m.position.set(x,y,z); g.add(m); return m; };
  const mkRing=(sc=1)=>{ const m=new THREE.Mesh(G.ring,glow); m.rotation.x=Math.PI/2; m.scale.setScalar(sc); g.add(m); return m; };
  if(key==='splitter'){            // ก้อนเจลสีน้ำเงิน มีลูกอ่อน 3 ลูกโคจรรอบตัว
    bodyMat.flatShading=false;
    body=new THREE.Mesh(XG.ico2,bodyMat); body.scale.setScalar(R); body.castShadow=true; g.add(body);
    ring=mkRing(); eye=mkEye();
    const pods=new THREE.Group();
    for(let k=0;k<3;k++){ const a=k/3*Math.PI*2, m=new THREE.Mesh(XG.pod,glow); m.scale.setScalar(R*0.26); m.position.set(Math.cos(a)*R*1.3,Math.sin(a*2)*R*0.3,Math.sin(a)*R*1.3); pods.add(m); }
    g.add(pods); ex.spin=pods;
  } else if(key==='bomber'){       // ทุ่นระเบิดหนามรอบตัว แกนกลางกะพริบ
    glow=new THREE.MeshBasicMaterial({color:hdr(T.color,2.5*(MAPS[curMap].glow||1))}); mats.push(glow); ex.glowMat=glow;
    body=new THREE.Mesh(G.body,bodyMat); body.scale.setScalar(0.8); body.castShadow=true; g.add(body);
    ICO_DIRS.forEach(d=>{ const s=new THREE.Mesh(G.spike,glow); s.position.copy(d).multiplyScalar(R*0.95); s.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d); g.add(s); });
    ring=mkRing(1.05); eye=mkEye(1.5);
  } else if(key==='wraith'){       // วิญญาณโปร่งแสง ตาเป็นร่องเรืองแสง
    bodyMat.flatShading=false; bodyMat.transparent=true; bodyMat.opacity=0.55; bodyMat.side=THREE.DoubleSide; bodyMat.depthWrite=false; bodyMat.color.set(0x2a1a44);
    body=new THREE.Mesh(XG.sph,bodyMat); body.scale.setScalar(R*0.62); body.position.y=R*0.5; g.add(body);
    const cloak=new THREE.Mesh(XG.cone,bodyMat); cloak.scale.set(R*0.9,R*2.3,R*0.9); cloak.rotation.x=Math.PI; cloak.position.y=-R*0.7; g.add(cloak);
    eye=mkEye(1,0,R*0.55,R*0.52); eye.scale.set(1.7,0.45,0.6);
    ring=mkRing(0.55); ring.position.y=R*1.25;
    const am=new THREE.MeshBasicMaterial({color:hdr(0xff4060,2.5),transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,depthWrite:false}); mats.push(am);   // ไฟเล็งก่อนยิงรัว (mesh เดียวต่อตัว)
    const ab=new THREE.Mesh(beamGeo,am); ab.visible=false; ab.frustumCulled=false; scene.add(ab); ex.aim=ab;
  } else if(key==='leaper'){       // กบเหล็กย่อตัว: ขาหลังสปริงเรืองแสง ตาเป็นแถบ หนามหลัง
    body=new THREE.Mesh(XG.ico2,bodyMat); body.scale.set(R*0.9,R*0.7,R*1.05); body.castShadow=true; g.add(body);
    eye=mkEye(1,0,R*0.28,R*0.8); eye.scale.set(2.0,0.5,0.6);
    ring=mkRing(0.6); ring.position.y=R*0.75;
    for(const s of [-1,1]){
      const th=new THREE.Mesh(XG.box,bodyMat); th.scale.set(R*0.34,R*0.95,R*0.55); th.position.set(s*R*0.85,-R*0.1,-R*0.45); th.rotation.z=-s*0.35; g.add(th);
      const sp=new THREE.Mesh(G.ring,glow); sp.rotation.x=Math.PI/2; sp.scale.setScalar(0.4); sp.position.set(s*R*0.95,-R*0.5,-R*0.45); g.add(sp);
    }
    for(let i=0;i<3;i++){ const s=new THREE.Mesh(G.spike,glow); s.position.set(0,R*0.62,-R*(0.1+i*0.28)); s.rotation.x=-0.5; g.add(s); }
  } else if(key==='charger'){      // รถบดเกราะหนัก: แผ่นเกราะหน้าสีขาว เขาคู่ ช่องตาแนวนอน
    const pm=new THREE.MeshStandardMaterial({color:0xdfe8ff,metalness:0.8,roughness:0.3,flatShading:true}); mats.push(pm);
    body=new THREE.Mesh(XG.box,bodyMat); body.scale.set(R*1.5,R*1.0,R*1.7); body.castShadow=true; g.add(body);
    const plate=new THREE.Mesh(XG.box,pm); plate.scale.set(R*1.7,R*1.15,R*0.28); plate.position.z=R*0.95; g.add(plate);
    for(const s of [-1,1]){ const h=new THREE.Mesh(G.spike,glow); h.rotation.x=Math.PI/2; h.scale.set(1.5,2.4,1.5); h.position.set(s*R*0.7,R*0.4,R*1.15); g.add(h); }
    eye=mkEye(1,0,R*0.12,R*1.12); eye.scale.set(2.4,0.4,0.5);
    ring=mkRing(0.8); ring.position.z=-R*0.9;
  } else if(key==='mortar'){       // ปืนครกลอยตัว: ลำกล้องเอียงชี้ฟ้า ปากกระบอกเรืองแสง
    body=new THREE.Mesh(XG.dodeca,bodyMat); body.scale.set(R*0.95,R*0.6,R*0.95); body.castShadow=true; g.add(body);
    const bar=new THREE.Mesh(XG.box,bodyMat); bar.scale.set(R*0.4,R*1.7,R*0.4); bar.position.set(0,R*0.9,R*0.2); bar.rotation.x=0.6; g.add(bar);
    const mz=new THREE.Mesh(XG.sph,glow); mz.scale.setScalar(R*0.22); mz.position.set(0,R*1.7,R*0.7); g.add(mz);
    eye=mkEye(0.8,0,R*0.1,R*0.8); ring=mkRing(0.9); ring.position.y=-R*0.3;
    for(const s of [-1,1]){ const p=new THREE.Mesh(XG.sph,glow); p.scale.setScalar(R*0.2); p.position.set(s*R*0.9,-R*0.2,0); g.add(p); }
  } else if(key==='hive'){         // รังแมลงลอยสูง: ปีกบาง เซลล์เรืองแสง ท้องเปิดได้ (ex.belly)
    body=new THREE.Mesh(XG.ico2,bodyMat); body.scale.set(R,R*0.8,R); body.castShadow=true; g.add(body);
    eye=mkEye(1,0,R*0.15,R*0.9); ring=mkRing(1.05);
    for(let i=0;i<6;i++){ const a=i/6*Math.PI*2, c=new THREE.Mesh(XG.pod,glow); c.scale.setScalar(R*0.17); c.position.set(Math.cos(a)*R*0.85,R*0.25,Math.sin(a)*R*0.85); g.add(c); }
    for(const s of [-1,1]){ const w=new THREE.Mesh(XG.box,glow); w.scale.set(R*1.5,0.03,R*0.5); w.position.set(s*R*1.3,R*0.45,-R*0.2); w.rotation.z=s*0.25; g.add(w); }
    const bl=new THREE.Mesh(XG.sph,glow); bl.scale.set(R*0.65,R*0.2,R*0.65); bl.position.y=-R*0.7; bl.visible=false; g.add(bl); ex.belly=bl;
  } else if(key==='lancer'){       // ซุ่มยิงรูปเข็ม: ลำตัวสูงเรียว ลำกล้องเลเซอร์ยาวเรืองแสง
    body=new THREE.Mesh(XG.octa,bodyMat); body.scale.set(R*0.5,R*1.3,R*0.5); body.castShadow=true; g.add(body);
    const bar=new THREE.Mesh(XG.box,glow); bar.scale.set(R*0.12,R*0.12,R*2.2); bar.position.set(0,R*0.1,R*1.1); g.add(bar);
    eye=mkEye(1,0,R*0.1,R*0.5); eye.scale.set(1.3,1.3,1.3); ring=mkRing(0.8); ring.position.y=R*0.9;
    const am=new THREE.MeshBasicMaterial({color:COL_RED,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,depthWrite:false}); mats.push(am);
    const ab=new THREE.Mesh(beamGeo,am); ab.visible=false; ab.frustumCulled=false; scene.add(ab); ex.aim=ab;
  } else if(key==='aegis'){        // เกราะทรงเพชรมีโล่พลังงานล้อมรอบ
    body=new THREE.Mesh(XG.dodeca,bodyMat); body.scale.setScalar(R*0.72); body.castShadow=true; g.add(body);
    ring=mkRing(); ring2=new THREE.Mesh(G.ring,glow); ring2.scale.setScalar(0.8); g.add(ring2);
    eye=mkEye(1,0,0,R*0.62);
    const sm=new THREE.MeshBasicMaterial({color:hdr(T.color,1.2),transparent:true,opacity:0.14,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
    const wm=new THREE.MeshBasicMaterial({color:hdr(T.color,2.2),wireframe:true,transparent:true,opacity:0.4,blending:THREE.AdditiveBlending,depthWrite:false});
    mats.push(sm,wm);
    const sg=new THREE.Group(), s1=new THREE.Mesh(XG.sph,sm), s2=new THREE.Mesh(XG.icoW,wm); s1.scale.setScalar(R*1.5); s2.scale.setScalar(R*1.5); sg.add(s1,s2); g.add(sg);
    ex.shieldGrp=sg; ex.shieldMat=sm; ex.shieldWire=wm;
  } else if(key==='mender'){       // ดรอนหมอ สัญลักษณ์กากบาท ยิงลำแสงฮีลศัตรู
    body=new THREE.Mesh(XG.octa,bodyMat); body.scale.setScalar(R*0.95); body.castShadow=true; g.add(body);
    ring=mkRing();
    const c1=new THREE.Mesh(XG.box,glow), c2=new THREE.Mesh(XG.box,glow);
    c1.scale.set(R*0.75,R*0.2,R*0.16); c2.scale.set(R*0.2,R*0.75,R*0.16); c1.position.z=c2.position.z=R*1.0; g.add(c1,c2);
    eye=mkEye(0.6,0,0,R*1.04);
    const orbs=new THREE.Group();
    for(let k=0;k<3;k++){ const a=k/3*Math.PI*2, m=new THREE.Mesh(XG.sph,glow); m.scale.setScalar(R*0.12); m.position.set(Math.cos(a)*R*1.35,0,Math.sin(a)*R*1.35); orbs.add(m); }
    g.add(orbs); ex.spin=orbs;
    ex.beams=[0,1].map(()=>{ const bm=new THREE.MeshBasicMaterial({color:hdr(T.color,2.5),transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false}); mats.push(bm);
      const m=new THREE.Mesh(beamGeo,bm); m.visible=false; m.frustumCulled=false; scene.add(m); return m; });
  } else {                         // drone / hunter / titan / shard (แบบเดิม)
    body=new THREE.Mesh(G.body,bodyMat); body.castShadow=true; g.add(body);
    ring=mkRing(); eye=mkEye();
    if(key==='hunter'){ for(let i=0;i<6;i++){ const s=new THREE.Mesh(G.spike,glow); const a=i/6*Math.PI*2; s.position.set(Math.cos(a)*R,Math.sin(a)*R,-0.1); s.rotation.z=a-Math.PI/2; g.add(s);} }
    if(key==='titan'){ ring2=new THREE.Mesh(G.ring,glow); ring2.scale.setScalar(0.8); g.add(ring2); }
  }
  return {g,body,bodyMat,ring,ring2,eye,eyeBase:eye.scale.clone(),mats,ex};
}
function disposeEnemy(e){ scene.remove(e.g); e.parts.mats.forEach(m=>m.dispose()); if(e.parts.ex.beams) e.parts.ex.beams.forEach(b=>scene.remove(b)); if(e.parts.ex.aim) scene.remove(e.parts.ex.aim); decFree(e.dec); e.dec=null; }
// ศัตรูที่เกิดตามเวฟ (เวฟ 2 ขึ้นไปเริ่มมีตัวใหม่ทยอยปลดล็อก)
const INTRO={2:['splitter','bomber'],3:['wraith','aegis'],4:['mender'],5:['leaper'],6:['charger','mortar'],7:['lancer'],8:['hive']};
let introQ=[];
const HEAVY={titan:1,aegis:1,charger:1,hive:1}, SNIPER={mortar:1,lancer:1};   // ตัวหนัก: จำกัดจำนวนพร้อมกัน (heavyCap)
const heavyCap=()=>2+(wave>=9?1:0)+(wave>=12?1:0);
function pickType(){
  /* ศัตรูชนิดใหม่เข้าเวฟแรกที่ครึ่งน้ำหนัก (rw) แล้วเต็มในเวฟถัดไป — ไม่ให้ความยากกระโดด */
  const rw=w0=>wave===w0?0.5:1;
  const L=[['drone',10]];
  if(wave>=2) L.push(['hunter',4.5*rw(2)],['splitter',3.5*rw(2)]);
  if(wave>=3) L.push(['bomber',3.5*rw(3)],['wraith',3*rw(3)],['titan',Math.min(1+wave*0.35,4)*rw(3)]);
  if(wave>=4) L.push(['aegis',3*rw(4)]);
  if(wave>=5) L.push(['mender',2.2*rw(5)],['leaper',3*rw(5)]);
  if(wave>=6) L.push(['charger',2.2*rw(6)],['mortar',2.4*rw(6)]);
  if(wave>=7) L.push(['lancer',2.2*rw(7)]);
  if(wave>=8) L.push(['hive',1.6*rw(8)]);
  let nh=0; for(const o of enemies) if(HEAVY[o.key]) nh++;
  if(nh>=heavyCap()) for(let i=L.length-1;i>=0;i--) if(HEAVY[L[i][0]]) L.splice(i,1);
  let ns=0; for(const o of enemies) if(SNIPER[o.key]) ns++;   // จำกัด MORTAR+LANCER พร้อมกัน
  if(ns>=2+(wave>=10?1:0)) for(let i=L.length-1;i>=0;i--) if(SNIPER[L[i][0]]) L.splice(i,1);
  let s=0; L.forEach(x=>s+=x[1]); let r=Math.random()*s;
  for(const [k,w] of L){ if((r-=w)<=0) return k; } return 'drone';
}
function spawnEnemy(key,at){
  const T=ET[key]; let x=0,z=0;
  if(at){ x=at.x; z=at.z; }
  else for(let i=0;i<25;i++){ const sR=MAPS[curMap].spawnR; if(sR){ const a=rand(0,Math.PI*2), dd=rand(18,sR); x=clamp(P.pos.x+Math.cos(a)*dd,-A+3,A-3); z=clamp(P.pos.z+Math.sin(a)*dd,-A+3,A-3); } else { x=rand(-A+3,A-3); z=rand(-A+3,A-3); } if(Math.hypot(x-P.pos.x,z-P.pos.z)>18 && boxFree(x,z,T.r,T.r,0.3)) break; }
  const parts=makeEnemy(key), mult=1+(wave-1)*0.08, hp=T.hp*mult;
  const e={key,T,parts,g:parts.g,pos:new THREE.Vector3(x,T.fly,z),vel:new THREE.Vector3(),hp,maxHp:hp,cd:rand(1.5,3),strafe:Math.random()<.5?1:-1,strafeT:rand(1,3),phase:rand(0,6),spawn:at?0.55:0,atk:0,flash:0,
    shield:T.shield?T.shield*(1+(wave-1)*0.06):0,shieldFlash:0,enraged:false,fuse:0,beepT:rand(0.3,0.9),blinkT:rand(2,3.5),blinkPh:0,alpha:0.55,burst:0,burstT:0,others:1,dead:false,st:{burn:0,dps:5,acc:0,nacc:0,nt:0,slowT:0,slowN:0,freeze:0,stun:0,shock:0}};
  Object.assign(e,atkInit());
  e.g.position.copy(e.pos); e.g.scale.setScalar(0.01); scene.add(e.g); enemies.push(e);
  emit(e.pos,at?8:25,T.color,5,0.6,0.3); if(!at){ ringFX(e.pos,T.color,3,0.6); sfx('spawn'); } updScore();
  return e;
}
/* ================= STATUS EFFECTS (burn / slow→freeze / stun / shock) =================
   applyStatus(e,type,a,b): burn(วินาที,ดาเมจ/วิ) · slow(จำนวนชั้น) · stun(วินาที) · shock(ดาเมจลูกโซ่)
   ค่าต้านทานต่อชนิดศัตรูอยู่ใน ET[...].res (ตัวคูณ ยิ่งน้อยยิ่งทน) */
/* ตัวเลข/ข้อความลอย: pool 30 ช่อง · InstancedMesh ใบเดียว (1 draw call) + atlas canvas เดียว ช่องละ 128x40 วาดข้อความลงช่องที่ว่าง
   อัปโหลด texture อย่างมากครั้งเดียวต่อเฟรม · ไม่สร้างวัตถุใหม่ตอนเล่น · เปิด/ปิดที่ S.dmgNum (ข้อความสถานะ เช่น "สตัน" แสดงเสมอ) */
const DN_N=30, DN_W=128, DN_H=40, DN_COLS=4, DN_ROWS=Math.ceil(DN_N/DN_COLS);
let dnCv=null, dnCx=null, dnTex=null, dnMesh=null, dnPos=null, dnCell=null, dnDirty=false, dnNext=0; const dnSlot=[];
function dnInit(){
  dnCv=document.createElement('canvas'); dnCv.width=DN_W*DN_COLS; dnCv.height=DN_H*DN_ROWS; dnCx=dnCv.getContext('2d');
  dnTex=new THREE.CanvasTexture(dnCv); dnTex.colorSpace=THREE.SRGBColorSpace; dnTex.minFilter=THREE.LinearFilter; dnTex.generateMipmaps=false;
  const g=new THREE.InstancedBufferGeometry(); g.copy(new THREE.PlaneGeometry(1,1)); g.instanceCount=DN_N;
  dnPos=new THREE.InstancedBufferAttribute(new Float32Array(DN_N*4),4); dnCell=new THREE.InstancedBufferAttribute(new Float32Array(DN_N*2),2);
  dnPos.setUsage(THREE.DynamicDrawUsage); dnCell.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iPos',dnPos); g.setAttribute('iCell',dnCell);
  const mat=new THREE.ShaderMaterial({uniforms:{map:{value:dnTex}},transparent:true,depthTest:false,depthWrite:false,
    vertexShader:`attribute vec4 iPos; attribute vec2 iCell; varying vec2 vUv; varying float vA;
      void main(){ vec4 mv=viewMatrix*vec4(iPos.xyz,1.0); float dist=max(1.0,-mv.z); float sc=iPos.w*(0.3+0.05*dist); mv.xy+=position.xy*vec2(3.2,1.0)*sc;
        float cell=iCell.x; float col=mod(cell,${DN_COLS}.0), row=floor(cell/${DN_COLS}.0);
        vUv=(vec2(col,${DN_ROWS-1}.0-row)+uv)/vec2(${DN_COLS}.0,${DN_ROWS}.0); vA=iCell.y; gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`uniform sampler2D map; varying vec2 vUv; varying float vA;
      void main(){ vec4 c=texture2D(map,vUv); c.a*=vA; if(c.a<0.01) discard; gl_FragColor=c;
      #include <colorspace_fragment>
      }`});
  dnMesh=new THREE.Mesh(g,mat); dnMesh.frustumCulled=false; dnMesh.renderOrder=999; scene.add(dnMesh);
  for(let i=0;i<DN_N;i++) dnSlot.push({on:false,t:0,life:1,x:0,y:0,z:0,vy:0,sc:1}); dnTex.needsUpdate=true;
}
function dmgNum(pos,txt,col,big){
  const isNum=typeof txt==='number'||/^[0-9]+$/.test(String(txt)); if(isNum&&!S.dmgNum) return;
  if(!dnMesh) dnInit();
  let k=-1; for(let n=0;n<DN_N;n++){ const q=(dnNext+n)%DN_N; if(!dnSlot[q].on){ k=q; break; } } if(k<0) k=dnNext; dnNext=(k+1)%DN_N;
  const d=dnSlot[k], cx=(k%DN_COLS)*DN_W, cy=Math.floor(k/DN_COLS)*DN_H, str=String(txt);
  dnCx.clearRect(cx,cy,DN_W,DN_H); let fs=big?34:isNum?26:22; dnCx.font='900 '+fs+'px sans-serif'; const w=dnCx.measureText(str).width; if(w>DN_W-12){ fs=Math.floor(fs*(DN_W-12)/w); dnCx.font='900 '+fs+'px sans-serif'; }
  dnCx.textAlign='center'; dnCx.textBaseline='middle'; dnCx.lineJoin='round'; dnCx.lineWidth=big?7:5; dnCx.strokeStyle='rgba(0,0,0,0.85)'; dnCx.strokeText(str,cx+DN_W/2,cy+DN_H/2+1); dnCx.fillStyle=col||'#fff'; dnCx.fillText(str,cx+DN_W/2,cy+DN_H/2+1);
  dnDirty=true; d.on=true; d.t=0; d.life=big?1.05:0.85; d.x=pos.x+rand(-0.35,0.35); d.y=pos.y+(isNum?0.9:1.35)+rand(0,0.2); d.z=pos.z+rand(-0.35,0.35); d.vy=isNum?2.2:1.4; d.sc=big?1.45:isNum?1:0.9; d.cell=k;
}
function dnUpdate(dt){
  if(!dnMesh) return;
  for(let i=0;i<DN_N;i++){ const d=dnSlot[i];
    if(d.on){ d.t+=dt; d.y+=d.vy*dt; d.vy*=Math.max(0,1-2.2*dt); if(d.t>=d.life) d.on=false; }
    if(d.on){ const u=d.t/d.life, pop=u<0.12?1.35-2.9*u:1; dnPos.setXYZ(i,d.x,d.y,d.z); dnPos.array[i*4+3]=d.sc*pop; dnCell.setXY(i,d.cell,u>0.6?1-(u-0.6)/0.4:1); }
    else { dnPos.array[i*4+3]=0; dnCell.setXY(i,0,0); } }
  dnPos.needsUpdate=true; dnCell.needsUpdate=true; if(dnDirty){ dnTex.needsUpdate=true; dnDirty=false; }
}
function dnReset(){ for(const d of dnSlot) d.on=false; dnUpdate(0); }
function dotHit(e,d){ if(e.dead) return; lastCrit=false; e.hp-=d; if(e.hp<=0) killEnemy(e); }
function applyStatus(e,type,a,b){
  if(e.dead||!e.st) return; const s=e.st, rs=(e.T.res&&e.T.res[type])||1;
  if(type==='burn'){ if(s.burn<=0) dmgNum(e.pos,'ติดไฟ!','#ff8a3a'); s.burn=a||3; s.dps=(b||5)*rs; }
  else if(type==='slow'){ s.slowT=2.5; if(s.freeze<=0){ s.slowN+=(a||1); if(s.slowN>=5){ s.slowN=0; s.freeze=1.5*rs; s.slowT=0; dmgNum(e.pos,'แช่แข็ง! +30%','#bfefff'); ringFX(e.pos,0x8fe9ff,3,0.4); emit(e.pos,20,0xbfefff,5,0.5,0.5,3); } } }
  else if(type==='stun'){ s.stun=Math.max(s.stun,(a||0.8)*rs); dmgNum(e.pos,'สตัน','#ffe066'); emit(e.pos,10,0xffe066,4,0.3,0.2,3); }
  else if(type==='shock'){ s.shock=0.6; let n=0; const d=a||8;
    for(let i=enemies.length-1;i>=0&&n<3;i--){ const o=enemies[i]; if(o===e||o.dead) continue;
      if(o.pos.distanceTo(e.pos)<7){ n++; tracer(e.pos,o.pos,0.8); emit(o.pos,6,0x7fe9ff,3,0.3,0.2,3); dotHit(o,d*Math.pow(0.6,n)); dmgNum(o.pos,Math.max(1,Math.round(d*Math.pow(0.6,n))),'#ffe066'); } } }
}
function updStatus(e,dt,time){
  const s=e.st, m=e.parts.bodyMat; let col=0, em=0;
  if(s.burn>0){ s.burn-=dt; s.nt-=dt; s.acc+=s.dps*dt; if(s.acc>=1){ const d=Math.floor(s.acc); s.acc-=d; s.nacc+=d; dotHit(e,d); if(e.dead){ dmgNum(e.pos,s.nacc,'#ff8a3a'); return; } }
    if(s.nt<=0&&s.nacc>0){ dmgNum(e.pos,s.nacc,'#ff8a3a'); s.nacc=0; s.nt=0.5; }
    if(Math.random()<dt*32) emit(e.pos,1,0xff7a1a,1.8,0.5,-0.3,2.5); }
  if(s.slowT>0){ s.slowT-=dt; if(s.slowT<=0) s.slowN=0; }
  if(s.freeze>0) s.freeze-=dt;
  if(s.stun>0){ s.stun-=dt; if(Math.random()<dt*20) emit(e.pos,1,0xffe066,2.5,0.25,0.2,3); }
  if(s.shock>0) s.shock-=dt;
  if(s.freeze>0){ col=0x8fe9ff; em=0.55; }
  else if(s.burn>0){ col=0xff5a1a; em=0.35+0.15*Math.sin(time*20); }
  else if(s.stun>0){ col=0xffe066; em=Math.sin(time*40)>0?0.5:0.1; }
  else if(s.shock>0){ col=0x7fe9ff; em=0.5; }
  else if(s.slowT>0){ col=0x5fc8ff; em=0.18; }
  if(!col&&e.tele>0){ col=e.T.color; em=0.15+0.55*e.tele*(0.6+0.4*Math.sin(time*32)); }   // telegraph: ตัวเรืองสว่างกะพริบก่อนโจมตี
  if(e.flash>0){ col=0xffffff; em=Math.max(em,e.flash*0.8); }
  m.emissive.setHex(col||0xffffff); m.emissiveIntensity=em;
}
function blinkTo(e){   // เทเลพอร์ต WRAITH ไปรอบตัวผู้เล่น
  for(let i=0;i<14;i++){ const a=Math.random()*Math.PI*2, d=rand(8,14), x=P.pos.x+Math.cos(a)*d, z=P.pos.z+Math.sin(a)*d;
    if(Math.abs(x)<A-2&&Math.abs(z)<A-2&&boxFree(x,z,e.T.r,e.T.r,0.3)){ e.pos.x=x; e.pos.z=z; e.vel.set(0,0,0); return true; } }
  return false;
}
function hasLOS(e){
  _d.subVectors(camera.position,e.pos); const len=_d.length(); _d.divideScalar(len);
  ray.set(e.pos,_d); ray.far=len; const h=ray.intersectObjects(worldMeshes,false); return h.length===0;
}
const projGeo=new THREE.SphereGeometry(0.16,12,8), projMats={};
function spawnProj(pos,vel,dmg,color){
  if(!projMats[color]) projMats[color]=new THREE.MeshBasicMaterial({color:hdr(color,4)});
  const g=new THREE.Group(); g.add(new THREE.Mesh(projGeo,projMats[color]));
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTex,color:hdr(color,2),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); s.scale.set(0.9,0.9,1); g.add(s);
  g.position.copy(pos); scene.add(g); projs.push({g,vel,dmg,color,life:5});
}
function enemyFire(e,dist){
  const n=e.T.spread||1;
  _v.set(camera.position.x+P.vel.x*0.25,camera.position.y-0.3,camera.position.z+P.vel.z*0.25).sub(e.pos).normalize();
  for(let i=0;i<n;i++){ const d=_v.clone().applyAxisAngle(UP,(i-(n-1)/2)*0.16);
    spawnProj(e.pos.clone().addScaledVector(d,e.T.r+0.25),d.multiplyScalar(e.T.proj),e.T.dmg,e.T.color); }
  sfx('eshoot',dist);
}
function breakShield(e){
  e.shield=0; e.enraged=true; const ex=e.parts.ex; if(ex.shieldGrp) e.g.remove(ex.shieldGrp);
  emit(e.pos,50,e.T.color,8,0.7,0.3); ringFX(e.pos,e.T.color,6,0.5); sfx('shieldbreak'); shake+=0.25;
}
/* ================= ENEMY ATTACK SYSTEM (รอบ 8) =================
   e.atkState: 'idle' → 'windup'(ตั้งท่า+telegraph) → 'strike'(ลงมือ) → 'recover'(พัก) → 'idle' · 'stagger' = ถูกขัดท่า 0.4 วิ
   e.atkKind: shoot | pounce | slam | heal | leap | charge (พารามิเตอร์ใน ATKD) · e.cdk[kind] = คูลดาวน์เฉพาะท่า · e.atkCD = เว้นช่วงระหว่างท่า
   e.mv (ควบคุมการเคลื่อนที่): free | hold | slow | back | goto | dash
   Telegraph: ตาโต + วงแหวนหมุนเร็ว + ตัวหด-ยืด + เรืองสว่าง + เสียงเตือน + decal วงแดง/เส้นแดง (decPool — pool ไม่สร้างใหม่ทุกครั้ง) */
const ATK_MINWIND=0.35, ATK_COL=0xff2244, HEAL_COL=0x5dff7a;
const decPool={circ:[],line:[]};
const decFillGeo=new THREE.CircleGeometry(1,40).rotateX(-Math.PI/2);
const decEdgeGeo=new THREE.RingGeometry(0.93,1,40).rotateX(-Math.PI/2);
const decLineGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2).translate(0,0,0.5);
const decMat=op=>new THREE.MeshBasicMaterial({color:ATK_COL,transparent:true,opacity:op,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
function decGet(kind,max){
  const L=decPool[kind]; let d=L.find(x=>!x.busy);
  if(!d){ if(L.length>=max) return null;
    const g=new THREE.Group(), fill=new THREE.Mesh(kind==='line'?decLineGeo:decFillGeo,decMat(0.25)); fill.renderOrder=2; g.add(fill);
    let edge=null; if(kind==='circ'){ edge=new THREE.Mesh(decEdgeGeo,decMat(0.9)); edge.renderOrder=3; g.add(edge); }
    scene.add(g); d={g,fill,edge,busy:false}; L.push(d); }
  d.busy=true; d.g.visible=true; return d;
}
function decFree(d){ if(d){ d.busy=false; d.g.visible=false; } }
/* ความสูงพื้น ณ จุด (ชานชาลา/บันได/ดาดฟ้าเตี้ย) → วงเตือนไม่จมใต้พื้น */
function groundAt(x,z){ let g=0; for(const b of colliders){ if(b.ceil||b.maxY>1.6||x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ) continue; if(b.maxY>g) g=b.maxY; } return g; }
function decCirc(d,x,z,r,col,prog,pu){ if(!d) return; d.g.position.set(x,groundAt(x,z)+0.07,z); d.edge.scale.set(r,1,r); const s=Math.max(0.04,prog)*r; d.fill.scale.set(s,1,s);
  d.fill.material.color.setHex(col).multiplyScalar(1.5); d.edge.material.color.setHex(col).multiplyScalar(2); d.fill.material.opacity=0.3+0.2*pu; d.edge.material.opacity=0.8+0.2*pu; }
function decLine(d,x,z,dx,dz,len,w,col,pu){ if(!d) return; d.g.position.set(x,groundAt(x,z)+0.07,z); d.g.rotation.y=Math.atan2(dx,dz); d.fill.scale.set(w,1,len); d.fill.material.color.setHex(col).multiplyScalar(1.7); d.fill.material.opacity=0.36+0.3*pu; }
function atkInit(){ return {atkState:'idle',atkKind:'',atkT:0,atkD:0,atkCD:rand(0.5,1.5),cdk:{shoot:rand(1.2,2.8),pounce:rand(0.3,1),slam:rand(1,3),heal:rand(5,8),leap:rand(0.5,1.5),charge:rand(1.5,3),mortar:rand(1.5,3),laser:rand(2,4),spawn:rand(1,3)},
  tele:0,mv:'free',dv:new THREE.Vector3(),dec:null,critHits:0,tx:0,tz:0,ax:0,az:1,fx:0,fz:1,shots:0,shotT:0,jy:0,wallStun:0,hitWall:false,pDone:false,healing:false,owner:null,locked:false,ll:60,lx:0,ly:0,lz:0,bx:0,by:0,bz:1}; }
const atkWk=()=>Math.max(0.8,1-wave*0.02);
function atkFree(e){ decFree(e.dec); e.dec=null; if(e.parts.ex.aim) e.parts.ex.aim.visible=false; }
function healNear(e){ const R=e.T.A.heal.r; for(const o of enemies){ if(o!==e&&!o.dead&&o.hp<o.maxHp*0.96&&Math.hypot(o.pos.x-e.pos.x,o.pos.z-e.pos.z)<R) return true; } return false; }
/* ย่นจุดปลายทางไม่ให้ทะลุกำแพง/ที่กำบัง (ใช้กับ LEAPER) → เก็บใน e.tx,e.tz */
function clearPoint(e,tx,tz,mg){
  const lim=A-1.5; tx=clamp(tx,-lim,lim); tz=clamp(tz,-lim,lim);
  _o.set(e.pos.x,Math.max(e.pos.y,0.9),e.pos.z); _d.set(tx-e.pos.x,0,tz-e.pos.z); let len=_d.length();
  if(len>0.01){ _d.divideScalar(len); ray.set(_o,_d); ray.far=len; const h=ray.intersectObjects(worldMeshes,false)[0]; if(h) len=Math.max(0,h.distance-mg); }
  let x=e.pos.x+_d.x*len, z=e.pos.z+_d.z*len;
  for(let i=0;i<6&&!boxFree(x,z,e.T.r,e.T.r,0.2);i++){ len*=0.75; x=e.pos.x+_d.x*len; z=e.pos.z+_d.z*len; }
  e.tx=x; e.tz=z;
}
/* ระยะที่ว่างตามทิศ (ax,az) จนถึงกำแพง — ใช้ตัดความยาวเส้นเตือนของ CHARGER */
function freeLen(e,ax,az,max){
  _o.set(e.pos.x,Math.max(e.pos.y,0.9),e.pos.z); _d.set(ax,0,az).normalize(); ray.set(_o,_d); ray.far=max;
  const h=ray.intersectObjects(worldMeshes,false)[0]; return h?Math.max(1,h.distance-e.T.r):max;
}
function leapAim(e){ clearPoint(e,P.pos.x+P.vel.x*0.4,P.pos.z+P.vel.z*0.4,e.T.r+0.3); }
function pickAtk(e,dist){
  if(e.atkCD>0) return null;
  const AD=e.T.A, c=e.cdk;
  if(AD.heal&&c.heal<=0){ if(healNear(e)) return 'heal'; c.heal=1; }
  if(AD.slam&&dist<AD.slam.rng&&c.slam<=0) return 'slam';
  if(AD.pounce&&c.pounce<=0&&dist<AD.pounce.rng&&(!AD.pounce.enr||e.enraged)) return 'pounce';
  if(AD.leap&&c.leap<=0&&dist>AD.leap.min&&dist<AD.leap.max) return 'leap';
  if(AD.charge&&c.charge<=0&&dist>AD.charge.min&&dist<AD.charge.max){ if(hasLOS(e)) return 'charge'; c.charge=0.6; }
  if(AD.mortar&&c.mortar<=0){ if(dist<42&&hasLOS(e)) return 'mortar'; c.mortar=0.8; }
  if(AD.laser&&c.laser<=0){ if(dist<46&&hasLOS(e)) return 'laser'; c.laser=0.6; }
  if(AD.spawn&&c.spawn<=0){ let n=0; for(const o of enemies) if(o.owner===e) n++; if(n<=AD.spawn.max-AD.spawn.n) return 'spawn'; c.spawn=1; }
  if(AD.shoot&&c.shoot<=0){
    if(sentFoe(e,dist)){ c.shoot=e.T.fireRate*rand(0.7,1.3); return null; }
    if(dist<48&&hasLOS(e)) return 'shoot'; c.shoot=0.5;
  }
  return null;
}
function atkBegin(e,kind,dist,dx,dz){
  const AD=e.T.A; let w=0.4;
  e.atkKind=kind; e.atkState='windup'; e.atkT=0; e.critHits=0; e.mv='hold'; e.hitWall=false; e.fx=dx; e.fz=dz; e.ax=dx; e.az=dz;
  if(kind==='shoot'){ const s=AD.shoot; w=s.wind; e.mv='slow'; e.shots=s.n+(s.nw&&wave>=s.nw?1:0); }
  else if(kind==='pounce'){ w=AD.pounce.wind; e.dec=decGet('line',4); }
  else if(kind==='slam'){ w=AD.slam.wind; const L=Math.min(Math.max(dist-1,1),6.5); e.tx=e.pos.x+dx*L; e.tz=e.pos.z+dz*L; e.dec=decGet('circ',12); e.mv='goto'; }
  else if(kind==='heal'){ w=AD.heal.wind; e.dec=decGet('circ',12); }
  else if(kind==='leap'){ leapAim(e);
    if(Math.hypot(e.tx-e.pos.x,e.tz-e.pos.z)<2){ e.atkState='idle'; e.mv='free'; e.cdk.leap=0.8; return; }   // ติดสิ่งกีดขวางชิด → ไม่กระโดด
    w=AD.leap.wind; e.dec=decGet('circ',12); }
  else if(kind==='charge'){ w=AD.charge.wind; e.dec=decGet('line',4); }
  else if(kind==='mortar'){ const s=AD.mortar; w=s.wind; e.mv='slow'; e.shots=1+(wave>=s.n2w?1:0); }
  else if(kind==='laser'){ w=AD.laser.aim+AD.laser.lock; e.locked=false; e.beepT=0; }
  else if(kind==='spawn'){ w=AD.spawn.wind; }
  e.atkD=Math.max(ATK_MINWIND,w*atkWk());
  sfxAt('warn',e.pos,kind);
}
function atkWind(e,dt,p,dist,dx,dz,time){
  const k=e.atkKind, AD=e.T.A, pu=Math.sin(time*26)*0.5+0.5;
  if(k==='shoot'){ const am=e.parts.ex.aim;
    if(am&&AD.shoot.aim){ am.visible=true; am.position.copy(e.pos); _v.set(camera.position.x,camera.position.y-0.3,camera.position.z); am.lookAt(_v); am.scale.set(0.45,0.45,Math.min(e.pos.distanceTo(_v),45)); am.material.opacity=0.3+0.6*p*(0.5+0.5*pu); } }
  else if(k==='pounce'){ const s=AD.pounce; if(p<0.7){ e.ax=dx; e.az=dz; } e.fx=e.ax; e.fz=e.az; decLine(e.dec,e.pos.x,e.pos.z,e.ax,e.az,s.spd*s.dur,s.w,ATK_COL,pu); }
  else if(k==='slam'){ e.jy=0.8*p; decCirc(e.dec,e.tx,e.tz,AD.slam.r,ATK_COL,p,pu); }
  else if(k==='heal'){ decCirc(e.dec,e.pos.x,e.pos.z,AD.heal.r,HEAL_COL,p,pu); }
  else if(k==='leap'){ if(p<0.65) leapAim(e); e.jy=-0.25*Math.sin(p*Math.PI/2); decCirc(e.dec,e.tx,e.tz,AD.leap.r,ATK_COL,p,pu); }
  else if(k==='laser'||k==='spawn') atkWindB(e,dt,p,dist,time);
  else if(k==='charge'){ const s=AD.charge; if(p<0.75){ e.ax=dx; e.az=dz; e.cl=freeLen(e,dx,dz,Math.min(dist+4,s.spd*s.dur)); } e.fx=e.ax; e.fz=e.az;
    decLine(e.dec,e.pos.x,e.pos.z,e.ax,e.az,e.cl||8,s.w,ATK_COL,pu); }
}
function atkWindB(e,dt,p,dist,time){   // ท่าของส่วน ข: laser (เล็งตาม → ล็อก) / spawn (ท้องเปิด)
  const k=e.atkKind, AD=e.T.A;
  if(k==='laser'){ const s=AD.laser, am=e.parts.ex.aim, lockP=s.aim/(s.aim+s.lock);
    am.visible=true; am.position.copy(e.pos);
    if(p<lockP){ e.lx=P.pos.x; e.ly=P.pos.y+1.0; e.lz=P.pos.z; }
    else if(!e.locked){ e.locked=true; _d.set(e.lx-e.pos.x,e.ly-e.pos.y,e.lz-e.pos.z).normalize(); e.bx=_d.x; e.by=_d.y; e.bz=_d.z;
      ray.set(e.pos,_d); ray.far=60; const h=ray.intersectObjects(worldMeshes,false)[0]; e.ll=h?h.distance:60; }
    if(e.locked) _v.set(e.pos.x+e.bx,e.pos.y+e.by,e.pos.z+e.bz); else _v.set(e.lx,e.ly,e.lz);
    am.lookAt(_v);
    if(!e.locked){ am.scale.set(0.3,0.3,e.pos.distanceTo(_v)); am.material.color.copy(COL_RED); am.material.opacity=0.55; }
    else { const on=Math.sin(time*50)>0; am.scale.set(on?0.9:0.5,on?0.9:0.5,e.ll); am.material.color.copy(on?COL_WHT:COL_RED); am.material.opacity=on?1:0.8;
      e.beepT-=dt; if(e.beepT<=0){ sfxAt('beep',e.pos); e.beepT=0.09; } } }
}
const COL_RED=hdr(0xff1744,2.5), COL_WHT=hdr(0xffffff,3);
/* ---- กระสุนครก MORTAR: pool mesh + decal วงแดงหดตัวตรงจุดตก ---- */
const shellGeo=new THREE.SphereGeometry(0.28,12,10), shellMat=new THREE.MeshBasicMaterial({color:hdr(0xff7a9c,3)});
const shells=[], shellPool=[];
function fireShell(e){
  const s0=e.T.A.mortar, lim=A-1.5, tx=clamp(P.pos.x+P.vel.x*s0.fly*0.55,-lim,lim), tz=clamp(P.pos.z+P.vel.z*s0.fly*0.55,-lim,lim);
  const d=decGet('circ',12); if(!d) return;
  let m=shellPool.pop(); if(!m) m=new THREE.Mesh(shellGeo,shellMat);
  m.position.copy(e.pos); scene.add(m);
  shells.push({m,d,x0:e.pos.x,y0:e.pos.y,z0:e.pos.z,tx,tz,t:0,fly:s0.fly,r:s0.r,dmg:s0.dmg});
  sfxAt('mortarFire',e.pos); emit(e.pos,10,e.T.color,5,0.3,0.2);
}
function freeShell(s){ scene.remove(s.m); shellPool.push(s.m); decFree(s.d); }
function updShells(dt,time){
  for(let i=shells.length-1;i>=0;i--){ const s=shells[i]; s.t+=dt; const u=Math.min(1,s.t/s.fly);
    s.m.position.set(s.x0+(s.tx-s.x0)*u, s.y0*(1-u)+0.15*u+15*4*u*(1-u), s.z0+(s.tz-s.z0)*u);
    decCirc(s.d,s.tx,s.tz,s.r,ATK_COL,u,Math.sin(time*(14+u*30))*0.5+0.5); const k=s.r*(1+1.4*(1-u)); s.d.edge.scale.set(k,1,k);
    if(u>=1){ _w.set(s.tx,0.15,s.tz); const dd=Math.hypot(P.pos.x-s.tx,P.pos.z-s.tz);
      ringFX(_w,0xff7a9c,s.r*1.5,0.5); ringFX(_w,0xffffff,s.r*0.8,0.3); emit(_w,70,0xff7a9c,10,0.8,0.5); emit(_w,35,0xffaa33,7,0.6,0.3); sfxAt('boom',_w);
      shake+=Math.max(0,0.8-dd/s.r*0.25);
      if(state==='play'&&dd<s.r+P.radius&&P.pos.y<2.2){ hurt(Math.round(s.dmg*(1-0.6*Math.min(1,dd/s.r))),s.tx,s.tz); const l=dd||1; P.vel.x+=(P.pos.x-s.tx)/l*8; P.vel.z+=(P.pos.z-s.tz)/l*8; P.vel.y+=5; }
      freeShell(s); shells.splice(i,1); } }
}
function clearShells(){ shells.forEach(freeShell); shells.length=0; }
function atkToRec(e,d){ e.atkState='recover'; e.atkT=0; e.atkD=d; e.mv=(e.atkKind==='shoot'&&e.T.A.shoot.back)?'back':'hold'; e.tele=0; }
function atkStrike0(e,dist,dx,dz){
  const k=e.atkKind, AD=e.T.A, T=e.T; e.atkState='strike'; e.atkT=0; e.tele=1;
  if(k==='shoot'){ e.atkD=9; e.shotT=0; e.mv='slow'; if(e.parts.ex.aim) e.parts.ex.aim.visible=false; }
  else if(k==='pounce'){ const s=AD.pounce; e.atkD=s.dur; e.mv='dash'; e.pDone=false; e.dv.set(e.ax*s.spd,0,e.az*s.spd); decFree(e.dec); e.dec=null; sfxAt('go',e.pos,'pounce'); emit(e.pos,10,T.color,4,0.3,0.2); }
  else if(k==='slam'){ const s=AD.slam; e.jy=-1.3; _w.set(e.tx,0.1,e.tz);
    ringFX(_w,T.color,s.r*1.1,0.5); ringFX(_w,0xffffff,s.r*0.7,0.3); emit(_w,60,T.color,9,0.7,0.5); emit(_w,30,0xffaa33,6,0.5,0.3); sfxAt('slam',_w);
    const dd=Math.hypot(P.pos.x-e.tx,P.pos.z-e.tz); shake+=Math.max(0,0.9-dd/s.r*0.35);
    if(state==='play'&&dd<s.r+P.radius&&P.onGround){ hurt(s.dmg,e.tx,e.tz); const l=dd||1; P.vel.x+=(P.pos.x-e.tx)/l*8; P.vel.z+=(P.pos.z-e.tz)/l*8; P.vel.y+=4; }
    atkFree(e); atkToRec(e,s.rec); }
  else if(k==='heal'){ const s=AD.heal; for(const o of enemies){ if(o===e||o.dead) continue; if(Math.hypot(o.pos.x-e.pos.x,o.pos.z-e.pos.z)<s.r){ o.hp=Math.min(o.maxHp,o.hp+o.maxHp*s.pct); emit(o.pos,10,HEAL_COL,3,0.5,-0.2); } }
    _w.set(e.pos.x,0.1,e.pos.z); ringFX(_w,HEAL_COL,s.r*1.1,0.7); ringFX(e.pos,0xffffff,s.r*0.6,0.4); emit(e.pos,30,HEAL_COL,6,0.6,0); sfxAt('healwave',e.pos);
    atkFree(e); atkToRec(e,s.rec); }
  else if(k==='leap'){ const s=AD.leap; e.atkD=s.fly; e.mv='dash'; e.dv.set((e.tx-e.pos.x)/s.fly,0,(e.tz-e.pos.z)/s.fly); sfxAt('go',e.pos,'leap'); emit(e.pos,12,T.color,5,0.3,0.2); }
  else if(k==='mortar'){ e.atkD=9; e.shotT=0; e.mv='slow'; }
  else if(k==='laser'){ const s=AD.laser, o=e.pos; e.parts.ex.aim.visible=false; _d.set(e.bx,e.by,e.bz);
    let best=9; for(const yy of [0.3,1.0,1.6]){ _w.set(P.pos.x,P.pos.y+yy,P.pos.z).sub(o); const t=_w.dot(_d); if(t>0&&t<e.ll+0.5){ _m.copy(_d).multiplyScalar(t); best=Math.min(best,_w.sub(_m).length()); } }
    _v.copy(o).addScaledVector(_d,e.ll); tracer(o,_v,1,0.15,4,COL_WHT); emit(_v,14,0xffffff,5,0.3,0.2); sfxAt('lancerFire',e.pos);
    if(state==='play'&&best<0.65){ hurt(s.dmg,e.pos.x,e.pos.z); shake+=0.5; }
    atkToRec(e,s.rec); }
  else if(k==='spawn'){ const s=AD.spawn; let n=0; for(const o of enemies) if(o.owner===e) n++;
    for(let i=0;i<s.n&&n<s.max;i++,n++){ const a=Math.random()*Math.PI*2, m=spawnEnemy('mite',{x:clamp(e.pos.x+Math.cos(a)*1.2,-A+2,A-2),z:clamp(e.pos.z+Math.sin(a)*1.2,-A+2,A-2)}); m.owner=e; m.jy=3; m.vel.set(Math.cos(a)*5,0,Math.sin(a)*5); }
    sfx('split'); emit(e.pos,16,e.T.color,4,0.5,0.3); atkToRec(e,s.rec); }
  else if(k==='charge'){ const s=AD.charge; e.atkD=s.dur; e.mv='dash'; e.dv.set(e.ax*s.spd,0,e.az*s.spd); decFree(e.dec); e.dec=null; sfxAt('go',e.pos,'charge'); emit(e.pos,16,T.color,5,0.4,0.2); }
}
function atkStrike(e,dt,dist,dx,dz,time){
  const k=e.atkKind, AD=e.T.A, T=e.T, pp=P.pos;
  if(k==='shoot'){ const s=AD.shoot;
    e.shotT-=dt; if(e.shotT<=0&&e.shots>0){ enemyFire(e,dist); e.shots--; e.shotT=s.gap||0.1; }
    if(e.shots<=0) atkToRec(e,s.rec); }
  else if(k==='mortar'){ const s=AD.mortar; e.shotT-=dt;
    if(e.shotT<=0&&e.shots>0){ fireShell(e); e.shots--; e.shotT=s.gap; }
    if(e.shots<=0) atkToRec(e,s.rec); }
  else if(k==='pounce'){ const s=AD.pounce;
    if(!e.pDone&&state==='play'&&dist<T.r+P.radius+0.5&&Math.abs(e.pos.y-(pp.y+1))<1.6){ e.pDone=true; hurt(s.dmg,e.pos.x,e.pos.z); P.vel.x+=e.ax*9; P.vel.z+=e.az*9; P.vel.y+=3; emit(e.pos,20,T.color,5,0.4); shake+=0.15; atkToRec(e,s.rec); return; }
    if(e.atkT>=e.atkD||e.hitWall) atkToRec(e,s.rec); }
  else if(k==='leap'){ const s=AD.leap, u=Math.min(1,e.atkT/e.atkD); e.jy=s.arc*4*u*(1-u);
    if(e.dec) decCirc(e.dec,e.tx,e.tz,s.r,ATK_COL,1,Math.sin(time*40)*0.5+0.5);
    if(u>=1||e.hitWall){ e.jy=0; _w.set(e.pos.x,0.1,e.pos.z); ringFX(_w,T.color,s.r*1.3,0.45); emit(_w,30,T.color,6,0.5,0.4); sfxAt('slam',_w);
      const dd=Math.hypot(pp.x-e.pos.x,pp.z-e.pos.z); if(state==='play'&&dd<s.r+P.radius&&pp.y<1.4){ hurt(s.dmg,e.pos.x,e.pos.z); P.vel.x+=(pp.x-e.pos.x)/(dd||1)*7; P.vel.z+=(pp.z-e.pos.z)/(dd||1)*7; P.vel.y+=3; }
      shake+=Math.max(0,0.5-dd/25); atkFree(e); atkToRec(e,s.rec); } }
  else if(k==='charge'){ const s=AD.charge;
    if(state==='play'&&dist<T.r+P.radius+0.3&&pp.y<e.pos.y+T.r-0.1){ hurt(s.dmg,e.pos.x,e.pos.z); P.vel.x+=e.ax*16; P.vel.z+=e.az*16; P.vel.y+=4; shake+=0.8; emit(e.pos,30,T.color,7,0.5,0.3); sfx('hurt'); atkToRec(e,s.rec); return; }
    if(e.hitWall){ e.wallStun=s.stun; e.atkState='recover'; e.atkT=0; e.atkD=s.stun; e.mv='hold'; e.tele=0; e.vel.set(0,0,0);
      const dc=Math.hypot(pp.x-e.pos.x,pp.z-e.pos.z); shake+=Math.max(0.2,1-dc/25); emit(e.pos,50,T.color,8,0.6,0.5); emit(e.pos,25,0xffe066,6,0.5,0.4); ringFX(e.pos,T.color,5,0.45); sfxAt('slam',e.pos);
      dmgNum(e.pos,'ชนกำแพง! x2','#ffe066'); return; }
    if(e.atkT>=e.atkD) atkToRec(e,s.rec); }
}
function atkEnd(e){
  const T=e.T, AD=T.A, k=e.atkKind, c=e.cdk, sc=Math.max(0.6,1-wave*0.03);
  if(k==='shoot') c.shoot=T.fireRate*rand(0.7,1.3)*Math.max(0.55,1-wave*0.04)*(e.enraged?0.6:1)*(e.healing?1.6:1);
  else if(k==='heal') c.heal=AD.heal.cd;
  else if(AD[k]&&AD[k].cd) c[k]=rand(AD[k].cd[0],AD[k].cd[1])*sc;
  e.atkCD=0.4; e.atkState='idle'; e.mv='free'; e.jy=0; e.tele=0; atkFree(e);
}
function atkCancel(e,cd){   // ถูกสตัน/แช่แข็ง: ยกเลิกท่า
  const k=e.atkKind; if(k) e.cdk[k]=Math.max(e.cdk[k]||0,cd); e.atkState='idle'; e.mv='free'; e.jy=0; e.tele=0; atkFree(e);
}
function atkStagger(e){     // ขัดท่าตอน windup ด้วยการเล็งดี (crit ต่อเนื่อง / อาวุธสั้น / ดาเมจแรง)
  const k=e.atkKind; atkFree(e); e.cdk[k]=Math.max(e.cdk[k]||0,k==='heal'?3:1.0);
  e.atkState='stagger'; e.atkT=0; e.atkD=0.4; e.mv='hold'; e.tele=0; e.jy=0; e.vel.x=-e.fx*3; e.vel.z=-e.fz*3;
  dmgNum(e.pos,'ขัดท่า!','#ffe066'); emit(e.pos,16,0xffe066,5,0.4,0.2,3); ringFX(e.pos,0xffe066,2.2,0.3); sfxAt('stagger',e.pos);
}
function updAtk(e,dt,time,dist,dx,dz){
  for(const k in e.cdk) if(e.cdk[k]>0) e.cdk[k]-=dt;
  if(e.atkCD>0) e.atkCD-=dt; if(e.wallStun>0) e.wallStun-=dt;
  const st=e.atkState;
  if(st==='idle'){ e.tele=Math.max(0,e.tele-dt*4); e.fx=dx; e.fz=dz;
    if(e.spawn<1||(e.key==='wraith'&&e.blinkPh!==0)) return;
    const k=pickAtk(e,dist); if(k) atkBegin(e,k,dist,dx,dz); return; }
  e.atkT+=dt;
  if(st==='windup'){ const p=clamp(e.atkT/e.atkD,0,1); e.tele=p; atkWind(e,dt,p,dist,dx,dz,time); if(e.atkT>=e.atkD) atkStrike0(e,dist,dx,dz); }
  else if(st==='strike') atkStrike(e,dt,dist,dx,dz,time);
  else if(st==='recover'){ e.tele=Math.max(0,e.tele-dt*5); if(e.jy!==0) e.jy+=(0-e.jy)*Math.min(1,dt*5); if(e.atkT>=e.atkD) atkEnd(e); }
  else if(st==='stagger'){ if(e.atkT>=e.atkD){ e.atkState='idle'; e.mv='free'; e.atkCD=0.3; } }
}
function damageEnemy(e,dmg,pt,crit,dir,heavy){
  if(e.dead) return;
  hitT=0.12;
  if(e.shield>0){   // AEGIS: โล่ดูดดาเมจก่อน
    e.shield-=dmg; e.shieldFlash=1; $('hitm').classList.remove('crit'); sfx('shieldhit'); emit(pt,5,e.T.color,3,0.3,0.4);
    if(e.shield<=0) breakShield(e); return;
  }
  if(e.T.armor&&dir){   // CHARGER: เกราะด้านหน้ารับ 40% (ยกเว้นยิงตา) ด้านหลังรับ 150%
    const n=Math.hypot(dir.x,dir.z)||1, q=(dir.x*e.fx+dir.z*e.fz)/n;
    if(q<-0.25){ if(!crit) dmg*=e.T.armor.front; } else if(q>0.45) dmg*=e.T.armor.back; }
  if(e.st.freeze>0) dmg*=1.3;
  if(e.atkKind==='leap'&&e.atkState==='strike') dmg*=1.3;   // LEAPER กลางอากาศเปราะ +30%
  if(e.key==='hive'&&e.atkKind==='spawn'&&(e.atkState==='windup'||e.atkState==='strike'||e.atkState==='recover')) dmg*=1.5;   // ท้องเปิด = จุดอ่อน +50%
  if(e.wallStun>0) dmg*=2;                                   // CHARGER มึนหลังชนกำแพง x2
  e.hp-=dmg; e.flash=1; $('hitm').classList.toggle('crit',crit); lastCrit=crit;
  { const hs=W&&W.hitStatus?W.hitStatus[0]:'', ice=e.st.freeze>0||e.st.slowT>0||hs==='slow';   /* สีตัวเลข: ปกติขาว · คริ แดง · ไฟ ส้ม · น้ำแข็ง ฟ้า · ฟ้าผ่า เหลือง */
    dmgNum(pt,Math.max(1,Math.round(dmg)),crit?'#ff3b3b':hs==='burn'?'#ff8a3a':ice?'#8fe9ff':hs==='shock'?'#ffe066':'#ffffff',crit); }
  sfx('hit',crit); emit(pt,crit?14:8,crit?0xffffff:e.T.color,4,0.35,1);
  if(e.key!=='titan'&&e.key!=='aegis'&&e.atkState!=='strike') e.vel.addScaledVector(dir,1.5);
  if(e.hp<=0){ killEnemy(e); return; }
  if(e.atkState==='windup'&&!e.T.noStagger){   // stagger: crit ต่อเนื่อง 2 ครั้ง / crit แรง / อาวุธสั้น / นัดแรงมาก
    if(crit) e.critHits++;
    if(heavy||dmg>=e.maxHp*0.45||(crit&&(e.critHits>=2||dmg>=e.maxHp*0.25))) atkStagger(e); }
}
function blast(e){   // ระเบิดของ BOMBER ทำดาเมจทั้งผู้เล่นและศัตรูรอบข้าง
  const B=e.T.boom, p=e.pos.clone();
  emit(p,100,0xff6a00,13,0.9,0.5); emit(p,60,0xffe066,9,0.6,0.3); ringFX(p,0xff6a00,B.r*1.7,0.5); ringFX(p,0xffffff,B.r*1.1,0.3);
  const dpl=Math.hypot(P.pos.x-p.x,P.pos.y+0.9-p.y,P.pos.z-p.z);
  sfx('boom',dpl); shake+=Math.max(0,0.9-dpl/B.r*0.5);
  if(dpl<B.r&&state==='play'){ hurt(Math.round(B.dmg*(1-0.6*dpl/B.r)),p.x,p.z);
    const dx=P.pos.x-p.x, dz=P.pos.z-p.z, l=Math.hypot(dx,dz)||1; P.vel.x+=dx/l*10; P.vel.z+=dz/l*10; P.vel.y+=4; }
  for(const o of enemies.slice()){ if(o.dead) continue; const od=o.pos.distanceTo(p);
    if(od<B.r){ const d=new THREE.Vector3().subVectors(o.pos,p).normalize(); damageEnemy(o,70*(1-0.5*od/B.r),o.pos.clone(),false,d); } }
}
function killEnemy(e,self){
  const i=enemies.indexOf(e); if(i<0) return; enemies.splice(i,1); e.dead=true;
  if(e.st&&e.st.freeze>0){ emit(e.pos,60,0xbfefff,9,0.9,0.9,3); emit(e.pos,25,0xffffff,6,0.6,0.6,3); ringFX(e.pos,0x8fe9ff,6,0.5); }
  const T=e.T, big=e.key==='titan'||e.key==='aegis'||e.key==='charger'||e.key==='hive', sm=T.r<0.4;
  emit(e.pos,sm?16:big?120:60,T.color,big?11:8,0.9,0.8); emit(e.pos,sm?8:big?60:30,0xffaa33,big?7:5,0.7,0.5);
  ringFX(e.pos,T.color,sm?2.5:big?9:5,0.55);
  disposeEnemy(e);
  if(T.boom) blast(e);
  if(e.key==='hive'){ for(const o of enemies.slice()) if(o.owner===e) killEnemy(o,true); }   // แมลงของ HIVE ระเบิดหมด ไม่ให้คะแนน
  if(T.split){   // SPLITTER แตกตัว
    for(let k=0;k<T.split;k++){ const a=k/T.split*Math.PI*2+rand(0,1), s=spawnEnemy('shard',{x:clamp(e.pos.x+Math.cos(a)*1.0,-A+2,A-2),z:clamp(e.pos.z+Math.sin(a)*1.0,-A+2,A-2)}); s.vel.set(Math.cos(a)*7,0,Math.sin(a)*7); }
    sfx('split');
  }
  if(!self){
    if(e.key!=='mite') addGold(big?2:1); kills++; combo=comboT>0?combo+1:1; comboT=3;
    score+=Math.round(T.score*(1+(Math.min(combo,10)-1)*0.25));
    if(combo>1){ const c=$('combo'); c.textContent=`x${combo} COMBO`; c.style.opacity=1; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); sfx('combo',combo); }
    if(S.hitPause&&state==='play'&&(big||lastCrit)) hpT=Math.max(hpT,big?0.08:0.06);   /* หยุดเกมสั้นๆ: สังหารคริ/ศัตรูหนัก */
    addXP(T.xp||5);
    if(upg.vamp){ P.hp=Math.min(P.maxHp,P.hp+1.5*upg.vamp); updHP(); }
    sfx('kill',big); vib(big?[60,40,80]:35); shake+=big?0.7:0.22;
    if(!sm&&Math.random()<(big?1:0.2)) spawnPickup(e.pos);
  }
  updScore();
}

const pickGeo=new THREE.OctahedronGeometry(0.28,0), pickMat=new THREE.MeshBasicMaterial({color:hdr(0x00ff88,3)});
function spawnPickup(pos){ const m=new THREE.Mesh(pickGeo,pickMat); m.position.set(pos.x,0.8,pos.z); scene.add(m); pickups.push({m,life:15}); }

/* ================= WAVES ================= */
function startWave(){ wave++; toSpawn=4+wave*2; spawnT=0.8; introQ=(INTRO[wave]||[]).slice();
  const sub=introQ.length?('ศัตรูใหม่!<br>'+introQ.map(k=>ET[k].name+' — '+ET[k].tip).join('<br>')):(wave>=3?'ระวัง TITAN!':'กำจัดศัตรูทั้งหมด');
  banner('WAVE '+wave,sub,introQ.length?4200:2200); sfx('wave'); updScore(); }
function waveClear(){ const bonus=wave*250; score+=bonus; P.hp=Math.min(P.maxHp,P.hp+25); addXP(wave*8); updHP(); updScore(); banner('เคลียร์เวฟ!','โบนัส +'+bonus+' · ฟื้นเลือด +25'); waveBreak=4; vib([30,50,30]); if(S.slowmo){ slOn=true; slE=0; } }

/* ================= PLAYER ACTIONS ================= */
function jump(){
  if(state!=='play'||pounding) return; slideT=0;
  if(P.onGround){ P.vel.y=9; P.onGround=false; sfx('jump'); }
  else if(!airJumped){ airJumped=true; P.vel.y=DJ_V; _tmpV.set(P.pos.x,P.pos.y+0.1,P.pos.z); ringFX(_tmpV,0x7fe9ff,2.4,0.35); emit(_tmpV,14,0x7fe9ff,4,0.35,0.5); sfx('djump'); vib(10); }   // กระโดดคู่ 1 ครั้งต่อการลอย
}
/* ---------- สไลด์ / กระแทกพื้น (ปุ่ม X · พื้น=สไลด์ กลางอากาศ=กระแทก) ---------- */
function stunEnemy(e,t){   // ทำให้ศัตรูเซ (ไม่ทำดาเมจ) ใช้ได้ทุกสถานะยกเว้นกำลังพุ่งโจมตี และข้ามบอสที่ noStagger
  if(e.dead||e.T.noStagger) return; const st=e.atkState;
  if(st==='strike') return;
  if(st==='windup') atkStagger(e);
  else { if(st==='recover') atkEnd(e); e.atkState='stagger'; e.atkT=0; e.atkD=t; e.mv='hold'; e.tele=0; e.jy=0; dmgNum(e.pos,'เซ!','#ffe066'); emit(e.pos,10,0xffe066,4,0.3,0.2,3); sfxAt('stagger',e.pos); }
}
function slideStart(){
  if(state!=='play'||!P.onGround||slideT>0||slideCD>0||lungeT>0||pounding) return;
  let dx=P.vel.x, dz=P.vel.z, h=Math.hypot(dx,dz);
  if(h<1.5){ dx=-Math.sin(P.yaw); dz=-Math.cos(P.yaw); h=1; }
  slideDX=dx/h; slideDZ=dz/h; slideT=SLIDE_T; slideCD=SLIDE_CD; slideId++; cancelInspect(); sfx('slide'); vib(15);
}
function slideHit(){
  for(const e of enemies){ if(e.dead||e.slideId===slideId) continue;
    const dx=e.pos.x-P.pos.x, dz=e.pos.z-P.pos.z; if(dx*dx+dz*dz>(e.T.r+P.radius+0.45)**2||Math.abs(e.pos.y-P.pos.y-0.9)>2.2) continue;
    e.slideId=slideId; stunEnemy(e,0.8); e.vel.x+=slideDX*3; e.vel.z+=slideDZ*3; sfx('mhit'); shake+=0.1; }
}
function poundStart(){
  if(state!=='play'||P.onGround||pounding||poundCD>0){ if(state==='play'&&!P.onGround&&poundCD>0) sfx('empty'); return; }
  pounding=true; slideT=0; P.vel.y=-POUND_V; P.vel.x*=0.2; P.vel.z*=0.2; cancelInspect(); sfx('dash'); vib(20);
}
function poundHit(){
  poundCD=POUND_CD; _tmpV.set(P.pos.x,P.pos.y+0.1,P.pos.z);
  ringFX(_tmpV,0xffb300,POUND_R*2,0.45); ringFX(_tmpV,0xffffff,POUND_R*1.2,0.3); emit(_tmpV,40,0xffb300,8,0.5,0.8); shake+=0.4; vib([40,30,50]); sfx('poundHit');
  for(const e of enemies.slice()){ if(e.dead) continue;
    const dx=e.pos.x-P.pos.x, dz=e.pos.z-P.pos.z, d=Math.hypot(dx,dz); if(d>POUND_R+e.T.r*0.5||Math.abs(e.pos.y-P.pos.y)>3.2) continue;
    const dir=_w.set(dx/(d||1),0,dz/(d||1)).clone(); damageEnemy(e,POUND_DMG,e.pos.clone(),false,dir,true); if(!e.dead) stunEnemy(e,0.9); }
}
const slideOrPound=()=>{ if(P.onGround) slideStart(); else poundStart(); };
/* ---------- แพตเทิร์นแรงสะท้อนคงที่ต่อประเภทปืน: ขึ้นแล้วเลี้ยงซ้าย/ขวาเล็กน้อย (seed จากชื่อประเภท) ---------- */
const RAMP={pistol:0.5,revolver:0.5,smg:0.8,rifle:0.7,shotgun:0.3,sniper:0.2,heavy:0.9,launcher:0.25,energy:0.5}, RPAT={};
function recoilPat(cls){ let p=RPAT[cls]; if(p) return p; p=RPAT[cls]=new Float32Array(32);
  let h=0; for(let i=0;i<cls.length;i++) h=(h*31+cls.charCodeAt(i))>>>0;
  const bs=(h&1)?1:-1, ph=(h%628)/100, amp=RAMP[cls]||0.65;
  for(let i=0;i<32;i++) p[i]=amp*(bs*Math.min(1,i/8)*0.45+0.55*Math.sin(i*0.85+ph)*Math.min(1,i/5));
  return p; }
const rktGeo=new THREE.CylinderGeometry(0.06,0.06,0.5,8); rktGeo.rotateX(Math.PI/2);
/* ================= PLAYER PROJECTILES (pool กลาง) =================
   spawnPProj(o): o = {speed,grav,bounces,bdamp,aoeR,aoeMul,aoeFall,aoeStatus,dmg(เท่าของ WS.dmg),status,
                       homing,turn,pierce,sticky,fuse,life,size,color,trail,rocket}
   ระเบิดไม่ทำดาเมจผู้เล่น · ปืนอ้างได้ผ่าน WDEF[id].proj  */
const ppLights=[0,1].map(()=>{ const l=new THREE.PointLight(0x00e5ff,0,10,2); scene.add(l); return l; });
const chakGeo=new THREE.CylinderGeometry(0.32,0.32,0.03,16);
const nailGeo=new THREE.CylinderGeometry(0.014,0.014,0.24,6); nailGeo.rotateX(Math.PI/2);
const PPN=48, pprojs=[], ppGeo=new THREE.SphereGeometry(0.12,10,8), ppMats={};
const ppMat=c=>ppMats[c]||(ppMats[c]=new THREE.MeshBasicMaterial({color:hdr(c,3)}));
let ppIdx=0;
const _bn=new THREE.Vector3(), _bh=new THREE.Vector3(), _bh2=new THREE.Vector3(), _bo=new THREE.Vector3(), _bd=new THREE.Vector3();
for(let i=0;i<PPN;i++){ const m=new THREE.Mesh(ppGeo,ppMat(0xff9a3a)); m.visible=false; m.frustumCulled=false; scene.add(m);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:dotTex,color:0x00e5ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false})); sp.visible=false; m.add(sp);
  pprojs.push({m,sp,on:false,o:null,v:new THREE.Vector3(),ao:new THREE.Vector3(),att:null,tgt:null,hits:[],life:0,b:0,pierce:0,fuse:0,dmg:0,aoeDmg:0,stuck:false}); }
/* ระยะใกล้สุดจากจุด q ถึงเส้นทางกระสุนช่วงเฟรมนี้ (ox,oy,oz)→b : กันกระสุนเร็วทะลุศัตรูเวลา FPS ต่ำ */
function segDist(q,ox,oy,oz,b){ const dx=b.x-ox, dy=b.y-oy, dz=b.z-oz, l2=dx*dx+dy*dy+dz*dz; let t=l2>1e-9?((q.x-ox)*dx+(q.y-oy)*dy+(q.z-oz)*dz)/l2:0; t=t<0?0:t>1?1:t;
  const x=ox+dx*t-q.x, y=oy+dy*t-q.y, z=oz+dz*t-q.z; return Math.sqrt(x*x+y*y+z*z); }
function spawnPProj(o){
  if(o.sticky){ let n=0, old=null; for(const q of pprojs) if(q.on&&q.stuck&&q.o===o){ n++; if(!old||q.fuse<old.fuse) old=q; } if(n>=(o.maxStuck||30)&&old){ if(o.mine){ old.on=false; old.m.visible=false; emit(old.m.position,6,o.color,2,0.3,0); } else old.fuse=0; } }
  let p=null; for(const q of pprojs) if(!q.on){ p=q; break; }
  if(!p){ p=pprojs[ppIdx]; ppIdx=(ppIdx+1)%PPN; }
  camera.updateMatrixWorld(true); muzzle.getWorldPosition(_m);
  p.on=true; p.o=o; p.stuck=false; p.att=null; p.hits.length=0; p.tgt=null;
  p.ret=false; p.trav=0; p.sp.material.opacity=1; p.life=o.life||4; p.b=o.bounces||0; p.pierce=o.pierce||0; p.fuse=o.fuse||0;
  p.dmg=o.dmg?WS.dmg*o.dmg:0; p.aoeDmg=WS.dmg*(o.aoeMul===undefined?1:o.aoeMul); p.hmul=WS.dmg/W.dmg;
  p.m.geometry=o.rocket?rktGeo:(o.nail?nailGeo:(o.disc?chakGeo:ppGeo)); p.m.material=ppMat(o.color||0xff9a3a);
  if(o.nail) p.m.scale.set(o.nth||1,o.nth||1,o.len||1); else if(o.rocket) p.m.scale.setScalar(1); else p.m.scale.setScalar((o.size||0.2)/(o.disc?0.32:0.12));
  if(o.glow){ p.sp.visible=true; p.sp.material.color.setHex(o.color||0xffffff).multiplyScalar(2); p.sp.scale.setScalar(o.glowSize||1.1); } else p.sp.visible=false;
  p.m.position.copy(_m);
  _d.set(rand(-1,1)*curSpread,rand(-1,1)*curSpread,-1).normalize().applyQuaternion(camera.quaternion);
  _w.copy(camera.position).addScaledVector(_d,60); p.v.copy(_w).sub(_m).normalize().multiplyScalar(o.speed||30); if(o.lift) p.v.y+=o.lift; if(o.scatter){ p.v.x+=rand(-1,1)*o.scatter; p.v.y+=rand(-1,1)*o.scatter; p.v.z+=rand(-1,1)*o.scatter; }
  p.m.lookAt(_w); p.m.visible=true; emit(_m,10,0xffaa55,3,0.3,0);
  return p;
}
function pBoom(p){
  const o=p.o, R=o.aoeR||4, base=p.aoeDmg, pos=p.m.position, dc=pos.distanceTo(camera.position), fall=o.aoeFall===undefined?0.65:o.aoeFall;
  p.on=false; p.m.visible=false; p.att=null;
  emit(pos,o.rocket?110:Math.round(14+R*8),o.color||0xff7a1a,13*Math.min(1,R/6)+2,0.9,0.5); emit(pos,o.rocket?60:Math.round(8+R*4),0xffe066,9,0.6,0.3);
  if(!o.quiet){ ringFX(pos,o.color||0xff7a1a,R*1.7,0.5); ringFX(pos,0xffffff,R*1.1,0.3); }
  if(o.quiet) sfx('split'); else { sfx('boom',dc); if(!o.noShake) shake+=Math.max(0,0.6-dc/40); }
  for(let i=enemies.length-1;i>=0;i--){ const e=enemies[i]; if(!e||e.dead) continue; const od=e.pos.distanceTo(pos)-e.T.r;
    if(od<R){ _bn.subVectors(e.pos,pos).normalize(); damageEnemy(e,base*(1-fall*Math.max(0,od)/R),e.pos,false,_bn); if(!e.dead&&o.aoeStatus) applyStatus(e,o.aoeStatus[0],o.aoeStatus[1],o.aoeStatus[2]); } }
}
function pStick(p,e){ p.stuck=true; p.fuse=p.o.fuse||1; p.v.set(0,0,0); p.life=Math.max(p.life,p.fuse+0.5);
  if(e){ p.att=e; p.ao.subVectors(p.m.position,e.pos); } }
function updPProj(dt){
  for(const p of pprojs){
    if(!p.on) continue; const o=p.o, pos=p.m.position; p.life-=dt;
    if(p.stuck){
      if(p.att){ if(p.att.dead){ p.att=null; p.fuse=Math.min(p.fuse,0.05); } else pos.copy(p.att.pos).add(p.ao); }
      if(o.mine){ p.sp.material.opacity=(((p.life*5)|0)%2)?1:0.25;
        if(p.fuse<o.fuse-0.7){ for(const e of enemies){ if(!e.dead&&e.pos.distanceTo(pos)<o.mine+e.T.r){ p.fuse=0; break; } } } }
      p.fuse-=dt; if(o.nail&&p.fuse<0.5&&Math.random()<dt*30) emit(pos,1,0xff5a1a,0.8,0.25,0,3);
      if(p.fuse<=0||p.life<=0){ if(o.aoeR) pBoom(p); else { p.on=false; p.m.visible=false; } }
      continue; }
    if(o.homing&&(!o.homeT||(o.life||4)-p.life<o.homeT)){
      if(!p.tgt||p.tgt.dead){ p.tgt=null; let bd=o.cone||0.85; _bd.copy(p.v).normalize();
        for(const e of enemies){ _bn.subVectors(e.pos,pos).normalize(); const dd=_bd.dot(_bn); if(dd>bd){ bd=dd; p.tgt=e; } } }
      if(p.tgt){ _bd.copy(p.v).normalize(); _bn.subVectors(p.tgt.pos,pos).normalize(); _bd.lerp(_bn,Math.min(1,(o.turn||2)*dt)).normalize(); p.v.copy(_bd).multiplyScalar(o.speed||30); }
    }
    if(o.boomer){   // CHAKRAM: พุ่งออกแล้ววนกลับหาผู้เล่น
      if(!p.ret){ p.trav+=o.speed*dt; if(p.trav>=o.boomer){ p.ret=true; p.hits.length=0; } }
      else { _bn.copy(camera.position); _bn.y-=0.5; _bn.sub(pos); const dd=_bn.length();
        if(dd<1.4){ p.on=false; p.m.visible=false; if(W.proj===o&&ammo<MAG){ ammo++; updAmmo(); } sfx('bounce',8,0); continue; }
        p.v.copy(_bn).multiplyScalar(o.speed*1.15/dd); } }
    if(o.disc){ p.m.rotateY(dt*35); if(Math.random()<dt*40) emit(pos,1,o.color,1.2,0.25,0,2); }
    if(o.grav) p.v.y-=9.8*o.grav*(GRAV/25)*dt;
    const ox=pos.x, oy=pos.y, oz=pos.z;
    pos.addScaledVector(p.v,dt);
    if(o.trail&&Math.random()<0.8) emit(pos,1,o.trailColor||0xffaa55,0.6,0.35,0,2);
    if(o.rocket){ _bo.copy(pos).add(p.v); p.m.lookAt(_bo); }
    let end=false;
    if(o.boomer&&(pos.y<0.05||inBox(pos))){ pos.set(ox,Math.max(oy,0.06),oz); if(!p.ret){ p.ret=true; p.hits.length=0; } }
    else if(pos.y<0.05){
      if(o.sticky){ pos.y=0.05; pStick(p,null); continue; }
      else if(p.b>0){ pos.y=0.05; p.v.y=Math.abs(p.v.y)*(o.bdamp===undefined?0.6:o.bdamp); p.v.x*=0.8; p.v.z*=0.8; p.b--; sfx('bounce',8,0); }
      else end=true;
    } else if(inBox(pos)){
      if(o.sticky){ pos.set(ox,oy,oz); pStick(p,null); continue; }
      else if(p.b>0){
        _bo.set(ox,pos.y,pos.z);
        if(!inBox(_bo)){ pos.x=ox; p.v.x*=-1; }
        else { _bo.set(pos.x,oy,pos.z); if(!inBox(_bo)){ pos.y=oy; p.v.y*=-1; } else { pos.z=oz; p.v.z*=-1; } }
        p.v.multiplyScalar(o.bdamp===undefined?0.6:o.bdamp); p.b--; emit(pos,6,0xffd28a,3,0.25,1); sfx('bounce',8,0);
      } else end=true;
    }
    if(!end&&!o.mine){ const rr=o.rocket?0.45:(o.size||0.2);
      for(let i=enemies.length-1;i>=0;i--){ const e=enemies[i]; if(!e||p.hits.includes(e)) continue;
        if(segDist(e.pos,ox,oy,oz,pos)<e.T.r*1.1+rr){
          if(o.sticky){ if(p.dmg>0){ _bn.copy(p.v).normalize(); const hd=o.headMul&&pos.y>e.pos.y+e.T.r*0.3; damageEnemy(e,p.dmg*(hd?o.headMul:1),pos,!!hd,_bn); } pStick(p,e.dead?null:e); break; }
          if(p.dmg>0){ _bn.copy(p.v).normalize(); damageEnemy(e,p.dmg,pos,false,_bn); if(!e.dead&&o.status) applyStatus(e,o.status[0],o.status[1],o.status[2]); }
          if(o.aoeR||o.hole){ end=true; break; }
          if(p.pierce>0){ p.pierce--; p.hits.push(e); } else { end=true; break; } } } }
    if(p.stuck) continue;
    if(end||p.life<=0){ if(o.hole){ p.on=false; p.m.visible=false; spawnHole(p.m.position,o.hole,p.hmul); } else if(o.aoeR) pBoom(p); else { p.on=false; p.m.visible=false; if(o.boomer&&W.proj===o&&ammo<MAG){ ammo++; updAmmo(); } } }
  }
  let li=0; for(const p of pprojs){ if(li>=2) break; if(p.on&&!p.stuck&&p.o.light){ ppLights[li].position.copy(p.m.position); ppLights[li].color.setHex(p.o.color||0xffffff); ppLights[li].intensity=14*S.light; li++; } }
  for(;li<2;li++) ppLights[li].intensity=0;
}
/* ================= BLACK HOLE (SINGULARITY) — pool 2 ลูก ใช้วงแหวน/อนุภาค ไม่ใช้ shader ================= */
const holes=[], holeCoreG=new THREE.SphereGeometry(1,16,12), holeRingG=new THREE.TorusGeometry(1,0.05,8,48), holeFlG=new THREE.TorusGeometry(1,0.02,6,64);
const holeCoreM=new THREE.MeshBasicMaterial({color:0x000000}), holeRingM=new THREE.MeshBasicMaterial({color:hdr(0xb26bff,2.4),transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,depthWrite:false}),
  holeFlM=new THREE.MeshBasicMaterial({color:hdr(0xb26bff,1.2),transparent:true,opacity:0.3,blending:THREE.AdditiveBlending,depthWrite:false});
for(let i=0;i<2;i++){ const g=new THREE.Group(); g.visible=false; scene.add(g);
  const core=new THREE.Mesh(holeCoreG,holeCoreM); core.scale.setScalar(0.85); g.add(core);
  const r1=new THREE.Mesh(holeRingG,holeRingM); r1.scale.setScalar(1.7); g.add(r1);
  const r2=new THREE.Mesh(holeRingG,holeRingM); r2.scale.setScalar(2.6); g.add(r2);
  const fl=new THREE.Mesh(holeFlG,holeFlM); fl.rotation.x=Math.PI/2; g.add(fl);
  holes.push({on:false,g,r1,r2,fl,pos:new THREE.Vector3(),t:0,dur:3,R:8,dps:8}); }
function spawnHole(pos,h,mul){
  let H=null; for(const x of holes) if(!x.on){ H=x; break; } if(!H){ H=holes[0]; for(const x of holes) if(x.t<H.t) H=x; }
  H.on=true; H.pos.copy(pos); H.pos.y=Math.max(pos.y,1.4); H.t=H.dur=h.dur; H.R=h.R; H.dps=h.dps*(mul||1); H.fl.scale.setScalar(h.R); H.fl.position.y=0;
  H.g.position.copy(H.pos); H.g.visible=true; sfx('holeOpen'); emit(H.pos,30,0xb26bff,7,0.6,0,3); shake+=0.2;
}
function updHoles(dt,time){
  for(const H of holes){ if(!H.on) continue;
    H.t-=dt; if(H.t<=0){ H.on=false; H.g.visible=false; emit(H.pos,50,0xb26bff,10,0.7,0.2,3); ringFX(H.pos,0xb26bff,H.R*0.7,0.45); sfx('boom',H.pos.distanceTo(camera.position)); continue; }
    const s=Math.min(1,(H.dur-H.t)*4)*Math.min(1,H.t*3);
    H.g.scale.setScalar(Math.max(0.01,s)); H.r1.rotation.set(time*2.1,time*1.3,0); H.r2.rotation.set(1.1,time*-1.7,time*0.6);
    H.fl.position.y=-H.pos.y+0.06; H.fl.scale.setScalar(H.R/Math.max(0.01,s));
    for(let i=enemies.length-1;i>=0;i--){ const e=enemies[i]; if(!e||e.dead) continue;
      _bn.subVectors(H.pos,e.pos); const d=_bn.length(); if(d>H.R) continue;
      const k=(e.key==='titan'||e.key==='aegis')?0.3:1, sp=(2+7*(1-d/H.R))*k;
      if(d>1.2){ _bn.multiplyScalar(sp*dt/d); e.pos.add(_bn); }
      beamDmg(e,H.dps*dt); }
    for(let j=0;j<4;j++){ const a=rand(0,6.283), r=H.R*rand(0.3,1); _bh.set(H.pos.x+Math.cos(a)*r,H.pos.y+rand(-1.5,1.5),H.pos.z+Math.sin(a)*r); emitIn(_bh,H.pos,0xb26bff,0.7); }
  }
}
/* ================= SENTRY-KIT — ป้อมเดียว ใช้ geometry/material ร่วม สร้างครั้งแรกที่วาง ================= */
const senGeo={base:new THREE.CylinderGeometry(0.34,0.44,0.16,8),post:new THREE.BoxGeometry(0.12,0.62,0.12),head:new THREE.BoxGeometry(0.34,0.24,0.46),bar:new THREE.CylinderGeometry(0.03,0.03,0.5,6),strip:new THREE.BoxGeometry(0.3,0.04,0.02),hp:new THREE.BoxGeometry(0.6,0.07,0.04)};
senGeo.bar.rotateX(Math.PI/2);
let senMats=null;
function buildSentry(){
  if(!senMats) senMats={dark:new THREE.MeshStandardMaterial({color:0x252a38,roughness:0.5,metalness:0.7}),neon:new THREE.MeshBasicMaterial({color:hdr(0x2cf2ff,2.2)}),hp:new THREE.MeshBasicMaterial({color:hdr(0x7dff7a,2)})};
  const g=new THREE.Group(), M=senMats;
  const base=new THREE.Mesh(senGeo.base,M.dark); base.position.y=0.08; g.add(base);
  const post=new THREE.Mesh(senGeo.post,M.dark); post.position.y=0.47; g.add(post);
  const head=new THREE.Group(); head.position.y=0.92; g.add(head);
  head.add(new THREE.Mesh(senGeo.head,M.dark));
  const bar=new THREE.Mesh(senGeo.bar,M.dark); bar.position.set(0,0,-0.42); head.add(bar);
  const st=new THREE.Mesh(senGeo.strip,M.neon); st.position.set(0,0.1,-0.24); head.add(st);
  const hp=new THREE.Mesh(senGeo.hp,M.hp); hp.position.y=1.35; g.add(hp);
  g.visible=false; scene.add(g); SEN.g=g; SEN.head=head; SEN.hpm=hp;
}
function deploySentry(){
  const D=W.deploy;
  if(SEN.on||SEN.cd>0){ sfx('empty'); fireCD=0.3; return; }
  camera.updateMatrixWorld(true); camera.getWorldDirection(_bd); ray.set(camera.position,_bd); ray.far=16;
  const h=ray.intersectObjects(worldMeshes,false)[0];
  _bh.copy(camera.position).addScaledVector(_bd,h?Math.max(1,h.distance-0.6):7);
  _bh.y=0.5; for(let i=0;i<12&&inBox(_bh);i++){ _bh.x-=_bd.x*0.4; _bh.z-=_bd.z*0.4; } _bh.y=0;
  if(!SEN.g) buildSentry();
  SEN.on=true; SEN.t=D.t; SEN.cd=D.cd; SEN.hp=D.hp; SEN.dmg=WS.dmg; SEN.tgt=null; SEN.scanT=0; SEN.fireT=0.2; SEN.pos.copy(_bh);
  SEN.g.position.copy(_bh); SEN.g.visible=true; SEN.head.rotation.set(0,P.yaw,0);
  fireCD=0.5; emit(_bh,16,0x2cf2ff,5,0.4,0.2); ringFX(_bh,0x2cf2ff,2,0.35); sfx('deploy'); SEN.shown=-2; updAmmo();
}
function killSentry(broken){
  if(SEN.g) SEN.g.visible=false; SEN.on=false; SEN.tgt=null;
  _bh.copy(SEN.pos); _bh.y+=0.6; emit(_bh,broken?40:16,broken?0xff7a1a:0x2cf2ff,7,0.6,0.3); if(broken){ ringFX(_bh,0xff7a1a,3,0.4); sfx('boom',_bh.distanceTo(camera.position)); }
  SEN.shown=-2; if(W.deploy) updAmmo();
}
function clearSentry(){ if(SEN.g) SEN.g.visible=false; SEN.on=false; SEN.cd=0; SEN.tgt=null; SEN.shown=-2; }
function hurtSentry(d){ if(!SEN.on) return; SEN.hp-=d; emit(_bo.set(SEN.pos.x,SEN.pos.y+0.9,SEN.pos.z),2,0xffaa55,2,0.2,0.2); }
function sentFoe(e,dist){   /* ศัตรูไกลผู้เล่นแต่ใกล้ป้อม → ยิงป้อมแทน */
  if(!SEN.on) return false; const ds=e.pos.distanceTo(SEN.pos); if(ds>30||ds>dist*0.8) return false;
  _bo.set(SEN.pos.x,SEN.pos.y+0.9,SEN.pos.z); _bn.subVectors(_bo,e.pos); const len=_bn.length(); _bn.divideScalar(len);
  ray.set(e.pos,_bn); ray.far=len; if(ray.intersectObjects(worldMeshes,false).length) return false;
  hurtSentry(e.T.dmg||8); tracer(e.pos,_bo,0.8,0.08,1.2,null); sfx('eshoot',dist); return true;
}
function updSentry(dt,time){
  if(SEN.cd>0) SEN.cd=Math.max(0,SEN.cd-dt);
  if(SEN.on){
    SEN.t-=dt;
    for(const e of enemies){ if(e.dead) continue; if(e.pos.distanceTo(SEN.pos)<2.2+e.T.r) hurtSentry((e.T.dmg||10)*dt*0.7); }
    if(SEN.t<=0||SEN.hp<=0) killSentry(SEN.hp<=0);
    else {
      _bo.set(SEN.pos.x,SEN.pos.y+0.92,SEN.pos.z);
      SEN.scanT-=dt;
      if(SEN.scanT<=0){ SEN.scanT=0.15; SEN.tgt=null; let bd=22;
        for(const e of enemies){ if(e.dead) continue; const d=e.pos.distanceTo(_bo)-e.T.r; if(d>=bd) continue;
          _bn.subVectors(e.pos,_bo); const len=_bn.length(); _bn.divideScalar(len); ray.set(_bo,_bn); ray.far=len;
          if(ray.intersectObjects(worldMeshes,false).length) continue; bd=d; SEN.tgt=e; } }
      const e=SEN.tgt;
      if(e&&!e.dead){
        _bn.subVectors(e.pos,_bo); SEN.head.rotation.set(Math.atan2(_bn.y,Math.hypot(_bn.x,_bn.z)),Math.atan2(-_bn.x,-_bn.z),0,'YXZ');
        SEN.fireT-=dt;
        if(SEN.fireT<=0){ SEN.fireT=0.1; _bd.copy(_bn).normalize(); SEN.head.updateWorldMatrix(true,false); _bh.set(0,0,-0.7); SEN.head.localToWorld(_bh);
          tracer(_bh,e.pos,0.9,0.05,0.6,null); emit(_bh,1,0x2cf2ff,1,0.1,0,2); if((SEN.n++&1)===0) sfx('shoot','wasp');
          damageEnemy(e,SEN.dmg,e.pos,false,_bd); }
      } else SEN.head.rotation.y+=dt*0.9;
      SEN.hpm.scale.x=Math.max(0.01,SEN.hp/W_SEN_HP); SEN.hpm.rotation.y=Math.atan2(camera.position.x-SEN.pos.x,camera.position.z-SEN.pos.z);
    }
  }
  const sh=SEN.on?Math.ceil(SEN.t):(SEN.cd>0?1000+Math.ceil(SEN.cd):-1);
  if(sh!==SEN.shown){ SEN.shown=sh; if(W.deploy) updAmmo(); }
}
const W_SEN_HP=80;
function clearPProj(){ clearSentry(); for(const p of pprojs){ p.on=false; p.stuck=false; p.att=null; p.tgt=null; p.m.visible=false; } ppLights.forEach(l=>l.intensity=0); for(const h of holes){ h.on=false; h.g.visible=false; } }
const HAVOC_P={rocket:true,speed:38,aoeR:6,aoeMul:1,aoeFall:0.65,trail:1,life:4,color:0xff9a3a};
function fireRocket(){ spawnPProj(HAVOC_P); }

function startReload(){ cancelInspect(); if(slot===2||W.heat||W.hot||W.deploy||ocT>0||reloading||(W.fuel?fuelV>=W.fuel.max:ammo===MAG)||state!=='play'||swapQ) return; burstLeft=0; const rc={mul:1}; mech('onReload',rc); reloading=true; reloadDur=WS.reload*rc.mul; reloadT=reloadDur; sfx('reload',W.id,reloadDur); playAnim('reload',{sync:reloadSync,dur:reloadDur}); updAmmo(); }
function raySphere(o,d,c,r){ const ox=o.x-c.x, oy=o.y-c.y, oz=o.z-c.z; const b=ox*d.x+oy*d.y+oz*d.z; const cc=ox*ox+oy*oy+oz*oz-r*r; const h=b*b-cc; if(h<0) return -1; return -b-Math.sqrt(h); }
/* ARTMA CABINE 01: กระสุนไม่จำกัด + ยิงเร็วขึ้นต่อเนื่อง + ระบบปืนร้อน (+2% ต่อนัด หลังยิงต่อเนื่องเกิน 30 นัด) */
function hotAdd(){ return W.hot.heat/(1+0.25*upg.mag); }          /* การ์ดช่องกระสุน: ลดความร้อนที่เพิ่มต่อนัด (2% → 1.6% → 1.33% ...) */
function hotCoolK(){ return Math.pow(0.85,upg.reload); }          /* การ์ดรีโหลด: ปืนเย็นเร็วขึ้น */
function hotShot(ctx){
  const H=W.hot; ctx.cdMul/=(1+H.step*hotStreak); hotStreak++; hotIdle=0;
  if(hotStreak>H.free){ hotV+=hotAdd(); if(hotV>=100){ hotV=100; hotLock=true; hotStreak=0; sfx('overheat'); } }
  updAmmo(); updMechHUD();
}
function hotStep(dt){
  hotIdle+=dt;
  if(hotLock){ hotV=Math.max(0,hotV-100/(W.hot.lockT*hotCoolK())*dt); if(hotV<=0){ hotLock=false; hotV=0; } }
  else if(hotIdle>0.25){ if(hotStreak){ hotStreak=0; updMechHUD(); } if(hotV>0) hotV=Math.max(0,hotV-W.hot.cool/hotCoolK()*dt); }
  const sh=Math.round(hotV)+(hotLock?1000:0); if(sh!==hotShown){ hotShown=sh; updAmmo(); }
}
function shoot(hs,bi=0,cdv){
  const ctx={dmgMul:1,cdMul:1,flashMul:1,last:(ammo===1&&ocT<=0),bi};
  mech('onFire',ctx);
  if(W.hot) hotShot(ctx); else if(ocT<=0) ammo--;
  fireCD+=(cdv??WS.cd)*ctx.cdMul*(ocT>0?0.667:1); updAmmo();
  sfx('shoot',W.id); vib(W.pellets||W.pierce?30:12);
  let ry,rp;
  if(W.recoilPattern&&W.recoilPattern.length){ const pt=W.recoilPattern[shotIdx%W.recoilPattern.length]; ry=pt[0]; rp=pt[1]; }
  else { ry=recoilPat(animCls(W.id))[shotIdx&31]; rp=1+0.06*Math.sin(shotIdx*1.7); }
  shotIdx++; idleT=0;
  P.pitch+=W.recoil*rp*(1-0.5*aimLerp); P.yaw+=W.recoil*ry*vfxV(); gunKick=W.kick; gunSide=Math.random()<0.5?-1:1; cycleT=1;
  if(W.silent){ flashT=0; } else { flashT=0.05; flash.material.rotation=Math.random()*Math.PI; flash.scale.setScalar(W.flash*ctx.flashMul); }
  fxShoot(W);
  if(W.recoil>0.03) shake+=0.12;
  camera.updateMatrixWorld(true);
  muzzle.getWorldPosition(_m);
  if(W.rocket){ fireRocket(); mech('onShot',ctx,[]); return; }
  if(W.proj){ if(W.hot&&Math.random()<W.hot.triple){ _tmpV.set(0,1,0).applyQuaternion(camera.quaternion); spawnPProj(W.proj); for(const a of [0.07,-0.07]){ const q=spawnPProj(W.proj); if(q) q.v.applyAxisAngle(_tmpV,a); } } else spawnPProj(W.proj); mech('onShot',ctx,[]); return; }
  if(W.sonic){ sonicBlast(); mech('onShot',ctx,[]); return; }
  const n=W.pellets||1, cone=W.cone||0, sp=curSpread, hitMap=new Map(), trOp=W.silent?0.25:1;
  for(let k=0;k<n;k++){
    _d.set(rand(-1,1)*(sp+cone),rand(-1,1)*(sp+cone),-1).normalize().applyQuaternion(camera.quaternion);
    _o.copy(camera.position);
    ray.set(_o,_d); ray.far=200;
    const wh=ray.intersectObjects(worldMeshes,false)[0], wd=wh?wh.distance:200;
    const cand=[];
    for(const e of enemies){ const t=raySphere(_o,_d,e.pos,e.shield>0?e.T.r*1.5:e.T.r*1.08); if(t>0&&t<wd) cand.push([t,e]); }
    cand.sort((a,b)=>a[0]-b[0]);
    const maxHit=Math.min(W.pierce||1,cand.length); let f=1, endD=cand.length?cand[0][0]:wd;
    for(let j=0;j<maxHit;j++){
      const t=cand[j][0], e=cand[j][1], pt=_o.clone().addScaledVector(_d,t);
      e.parts.eye.getWorldPosition(_w);
      const crit=e.shield<=0&&pt.distanceTo(_w)<e.T.r*0.5;
      let dmg=WS.dmg*ctx.dmgMul*(crit?WS.critMul:1)*f;
      if(n>1) dmg*=clamp(1.25-t/32,0.3,1);   // ลูกซอง: ไกลแล้วดาเมจตก
      const hm=mech('hitMul',e,t,crit); if(hm!==undefined) dmg*=hm;
      let rec=hitMap.get(e); if(!rec){ rec={e,dmg:0,crit:false,pt,dir:_d.clone()}; hitMap.set(e,rec); }
      rec.dmg+=dmg; rec.crit=rec.crit||crit; f*=(W.pierceF||0.7);
    }
    if(W.pierce) endD=wd;   // กระสุนทะลุไปจนชนกำแพง
    const hit=_o.clone().addScaledVector(_d,endD);
    if(W.bounce&&wh&&!cand.length) bounceTrace(_o,_d,wh,hitMap,ctx,trOp);
    if(!cand.length&&wh){ emit(hit,n>1?3:10,0xffd28a,4,0.35,1.2); if(n===1) emit(hit,4,0x00e5ff,2,0.5,0.2); }
    if(k<3) tracer(_m,hit,trOp,W.beamLife,W.beamThick,W.beamLife?TR_ARC:TR_PLY);
  }
  const recs=[...hitMap.values()];
  for(const rec of recs){ if(SKFX) emit(rec.pt,5,SKFX.spark,4,0.3,0.6,3); mech('onHit',rec); damageEnemy(rec.e,rec.dmg,rec.pt,rec.crit,rec.dir); if(W.hitStatus&&!rec.e.dead) applyStatus(rec.e,W.hitStatus[0],W.hitStatus[1],W.hitStatus[2]); }
  mech('onShot',ctx,recs);
}
/* กระสุนเด้ง (W.bounce = จำนวนครั้ง, ดาเมจลด 25% ต่อการเด้ง) ใช้ตัวแปรชั่วคราวร่วม ไม่สร้าง Vector3 ต่อนัด */
function bounceTrace(o0,d0,wh,hitMap,ctx,trOp){
  _bh.copy(o0).addScaledVector(d0,wh.distance); _bd.copy(d0); let ho=wh;
  for(let b=1;b<=W.bounce;b++){
    if(!ho||!ho.face) break;
    _bn.copy(ho.face.normal).transformDirection(ho.object.matrixWorld);
    _bd.addScaledVector(_bn,-2*_bd.dot(_bn)).normalize();
    emit(_bh,10,0xffe066,4,0.3,1); emit(_bh,4,0x00e5ff,3,0.3,0.2); sfx('bounce',6,0);
    _bo.copy(_bh).addScaledVector(_bn,0.03); ray.set(_bo,_bd); ray.far=120;
    const w2=ray.intersectObjects(worldMeshes,false)[0], wd2=w2?w2.distance:120;
    let be=null, bt=wd2; for(const e of enemies){ const t=raySphere(_bo,_bd,e.pos,e.T.r*1.08); if(t>0&&t<bt){ bt=t; be=e; } }
    _bh2.copy(_bo).addScaledVector(_bd,bt); tracer(_bo,_bh2,trOp*0.8,0.06,1,TR_PLY);
    if(be){ be.parts.eye.getWorldPosition(_w); const crit=be.shield<=0&&_bh2.distanceTo(_w)<be.T.r*0.5;
      const dmg=WS.dmg*ctx.dmgMul*Math.pow(0.75,b)*(crit?WS.critMul:1);
      let rec=hitMap.get(be); if(!rec){ rec={e:be,dmg:0,crit:false,pt:_bh2.clone(),dir:_bd.clone()}; hitMap.set(be,rec); }
      rec.dmg+=dmg; rec.crit=rec.crit||crit; break; }
    if(!w2) break; _bh.copy(_bh2); ho=w2;
  }
}
/* ตัวชี้ทิศทางดาเมจ: pool 6 ชิ้น DOM สร้างครั้งเดียว หมุนรอบกลางจอตามมุมกล้อง */
const ddEls=[], ddSrc=[]; let ddI=0;
function ddAdd(sx,sz){ if(!S.dmgDir) return;
  if(!ddEls.length){ const box=$('dmgdir'); for(let i=0;i<6;i++){ const d=document.createElement('div'); d.className='ddi'; box.appendChild(d); ddEls.push(d); ddSrc.push({x:0,z:0,t:0}); } }
  const a0=Math.atan2(sx-P.pos.x,sz-P.pos.z); let k=-1; for(let i=0;i<6;i++){ if(ddSrc[i].t>0&&Math.abs(Math.atan2(Math.sin(a0-Math.atan2(ddSrc[i].x-P.pos.x,ddSrc[i].z-P.pos.z)),Math.cos(a0-Math.atan2(ddSrc[i].x-P.pos.x,ddSrc[i].z-P.pos.z))))<0.35){ k=i; break; } }
  if(k<0){ k=ddI; ddI=(ddI+1)%6; } ddSrc[k].x=sx; ddSrc[k].z=sz; ddSrc[k].t=1.3; }
function ddUpdate(dt){ if(!ddEls.length) return; const R=Math.min(innerWidth,innerHeight)*0.36, sy=Math.sin(P.yaw), cy=Math.cos(P.yaw);
  for(let i=0;i<6;i++){ const s=ddSrc[i], el=ddEls[i]; if(s.t<=0){ if(el.style.opacity!=='0') el.style.opacity=0; continue; } s.t-=dt;
    const dx=s.x-P.pos.x, dz=s.z-P.pos.z, th=Math.atan2(dx*cy-dz*sy,-dx*sy-dz*cy);
    el.style.transform='rotate('+th+'rad) translateY(-'+R+'px)'; el.style.opacity=state==='play'?Math.min(1,s.t/0.5):0; } }
function ddReset(){ for(const s of ddSrc) s.t=0; ddUpdate(0); }
function hurt(d,sx,sz){
  if(state!=='play'||invulnT>0) return;
  if(sx!==undefined) ddAdd(sx,sz);
  cancelInspect();
  if(barrierHp>0){ barrierHp-=d*DIFF.dm; emit(camera.position,10,0x44aaff,3,0.3,0.5);
    if(barrierHp<=0){ barrierHp=0; barrierT=0; barrierMesh.visible=false; sfx('shieldbreak'); } else sfx('shieldhit');
    return; }
  d*=DIFF.dm; d*=Math.pow(0.92,upg.armor); if(W.fireDR&&firing&&slot===1) d*=1-W.fireDR;
  hurtK=1; hurtS=Math.random()<0.5?-1:1; P.hp-=d; vigA=Math.min(1,0.35+d/25); shake+=0.35; vib([50]); sfx('hurt'); updHP();
  if(P.hp<=0) gameOver();
}

/* ================= GOLD (เหรียญทอง) ================= */
/* ระดับความยาก (ns_diff): hp = เลือดตั้งต้น (อัปเกรดเลือดบวกเพิ่มต่อจากนี้) · dm = ตัวคูณดาเมจที่ได้รับ · gold = ตัวคูณเงินที่ได้ */
const DIFFS={
  easy:{id:'easy',th:'ง่าย',hp:300,dm:0.70,gold:1,col:'#5dff7a',desc:'เลือด 300 · ได้รับดาเมจลด 30% · เงิน ×1'},
  normal:{id:'normal',th:'กลาง',hp:200,dm:0.85,gold:1.5,col:'#7fe9ff',desc:'เลือด 200 · ได้รับดาเมจลด 15% · เงิน ×1.5'},
  hard:{id:'hard',th:'ยาก',hp:150,dm:1.00,gold:2,col:'#ffd166',desc:'เลือด 150 · ดาเมจปกติ · เงิน ×2'},
  hell:{id:'hell',th:'นรก',hp:100,dm:1.10,gold:2.25,col:'#ff4060',desc:'เลือด 100 · ได้รับดาเมจเพิ่ม 10% · เงิน ×2.25'}};
let DIFF=DIFFS.hard; try{ const d=localStorage.getItem('ns_diff'); if(DIFFS[d]) DIFF=DIFFS[d]; }catch(e){}
let gold=+localStorage.getItem('ns_gold')||0, runGold=0, goldFrac=0;
const saveGold=()=>{ try{ localStorage.setItem('ns_gold',gold); }catch(e){} };
function addGold(n){ goldFrac+=n*DIFF.gold; const w=Math.floor(goldFrac); goldFrac-=w; gold+=w; runGold+=w; saveGold(); updGold(); }   // เศษทศนิยม (×1.5/×2.25) สะสมไว้ ไม่หาย
function updGold(){ const g=$('goldT'); if(g) g.textContent='🪙 '+gold.toLocaleString();
  const gm=$('goldMenu'); if(gm) gm.textContent='ทองคงเหลือ: 🪙 '+gold.toLocaleString();
  const gg=$('gGold'); if(gg) gg.textContent='ทอง: 🪙 '+gold.toLocaleString(); }

/* ================= SKILLS 5 อย่าง ================= */
const SKILLS=[
  {id:'dash',key:'E',th:'พุ่ง',cd:6,t:0},
  {id:'shock',key:'F',th:'คลื่นกระแทก',cd:15,t:0},
  {id:'slow',key:'C',th:'ชะลอเวลา',cd:25,t:0},
  {id:'over',key:'V',th:'โอเวอร์ชาร์จ',cd:30,t:0},
  {id:'barrier',key:'B',th:'บาเรีย',cd:20,t:0},
];
let invulnT=0, tsT=0, ocT=0, barrierHp=0, barrierT=0;
const cdMult=()=>Math.pow(0.9,upg.cdr||0);
const barrierMesh=new THREE.Mesh(new THREE.SphereGeometry(1.15,24,16),new THREE.MeshBasicMaterial({color:hdr(0x44aaff,1.6),transparent:true,opacity:0.14,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
barrierMesh.visible=false; scene.add(barrierMesh);
function buildSkillBar(){ const b=$('skbar'); b.innerHTML=''; SKILLS.forEach((s,i)=>{ const d=document.createElement('div'); d.className='sk rdy'+(RK.canSkill(s.id)?'':' rklock'); d.id='sk'+i;
  d.innerHTML=`<b>${s.key}</b><span>${s.th}</span><div class="cd"></div>`; b.appendChild(d); }); }
function updSkillHUD(){ SKILLS.forEach((s,i)=>{ const el=$('sk'+i); if(!el) return; const tot=s.cd*cdMult();
  el.querySelector('.cd').style.height=(tot>0?clamp(s.t/tot,0,1)*100:0)+'%';
  el.classList.toggle('rdy',s.t<=0);
  el.classList.toggle('act',(s.id==='slow'&&tsT>0)||(s.id==='over'&&ocT>0)||(s.id==='barrier'&&barrierHp>0)); }); }
function useSkill(i){
  const s=SKILLS[i]; if(!s||state!=='play'||s.t>0) return;
  if(!RK.canSkill(s.id)){ if(!(useSkill._w>performance.now())){ useSkill._w=performance.now()+2500; banner('🔒 สกิล'+s.th+'ใช้ไม่ได้','ต้องใช้ยศ GUNNER ขึ้นไป',1800); } return; }
  s.t=s.cd*cdMult();
  if(s.id==='dash'){ invulnT=0.4; const sy=Math.sin(P.yaw), cy=Math.cos(P.yaw);
    P.vel.x+=-sy*26; P.vel.z+=-cy*26; P.vel.y=Math.max(P.vel.y,2);
    emit(P.pos.clone().setY(P.pos.y+1),22,0x00e5ff,5,0.4,0.2); sfx('dash'); vib(20); }
  else if(s.id==='shock'){ const pc=P.pos.clone().setY(P.pos.y+1);
    ringFX(pc,0x7fe9ff,9,0.55); ringFX(pc,0xffffff,5,0.35); emit(pc,60,0x7fe9ff,9,0.6,0.6);
    sfx('shock'); shake+=0.45; vib([40,30,60]);
    for(const e of enemies.slice()){ if(e.dead) continue; const d=e.pos.distanceTo(P.pos);
      if(d<9){ const dir=e.pos.clone().sub(P.pos).setY(0).normalize(); damageEnemy(e,60,e.pos.clone(),false,dir,true);
        if(!e.dead) e.vel.addScaledVector(dir,(e.key==='titan'||e.key==='aegis')?5:16); } } }
  else if(s.id==='slow'){ tsT=4; ringFX(P.pos.clone().setY(P.pos.y+1),0xb26bff,7,0.6); sfx('slow'); vib(30); }
  else if(s.id==='over'){ ocT=6; reloading=false; $('reloadT').style.display='none'; emit(P.pos.clone().setY(P.pos.y+1),25,0xffb300,4,0.5,0.3); sfx('over'); vib(30); }
  else if(s.id==='barrier'){ barrierHp=80; barrierT=8; barrierMesh.visible=true; emit(P.pos.clone().setY(P.pos.y+1),25,0x44aaff,4,0.5,0.2); sfx('barrier'); vib(30); }
  updSkillHUD();
}

/* ---------- เอฟเฟกต์เส้นฟัน (pool 4 อัน ใช้ geometry ร่วม วัสดุต่ออันเพื่อเปลี่ยนสี/ความจางได้) ---------- */
const slashArcGeo=new THREE.RingGeometry(0.72,1,28,1,0,2.3), slashLineGeo=new THREE.PlaneGeometry(0.07,1.7);
const slashPool=[]; let slashI=0;
function slashFx(kind){
  if(!slashPool.length) for(let i=0;i<4;i++){ const m=new THREE.Mesh(slashArcGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,side:THREE.DoubleSide})); m.visible=false; m.renderOrder=50; m.position.set(0,0,-1.4); camera.add(m); slashPool.push({m,life:0,max:0.24,k:0}); }
  const d=slashPool[slashI], m=d.m; slashI=(slashI+1)%slashPool.length;
  const stab=(kind===2&&(selM==='katana'||selM==='butterfly'));
  m.geometry=(kind===2)?slashLineGeo:slashArcGeo; m.material.color.set(kind===3?'#ffffff':MW.color).multiplyScalar(kind===3?4:3);
  m.rotation.set(0,0,kind===0?-0.5:kind===1?2.2:kind===2?(stab?PI2*0.0:0.12):-0.2); m.scale.set(kind===1?-1:1,1,1);
  m.position.set(kind===1?0.05:-0.05,0,-1.4); d.life=d.max=kind===3?0.34:0.22; d.k=kind; m.visible=true;
}
function slashUpdate(dt){
  for(const d of slashPool){ if(d.life<=0) continue; d.life-=dt; const m=d.m; if(d.life<=0){ m.visible=false; continue; }
    const f=1-d.life/d.max, sc=(d.k===3?1.5:1.1)*(0.7+f*0.45); m.material.opacity=Math.min(1,d.life/d.max*1.6)*0.85;
    if(d.k===2) m.scale.set(1,sc*(0.5+f),1); else m.scale.set(m.scale.x<0?-sc:sc,sc,1); }
}
/* ================= MELEE ATTACK (ฟันเป็นกรวย ห้ามทะลุกำแพง) ================= */
function meleeHit(mul,rangeAdd){
  const Md=MW, dmg=Md.dmg*(1+0.15*upg.dmg)*mul;
  const fx=-Math.sin(P.yaw), fz=-Math.cos(P.yaw);
  camera.updateMatrixWorld(true);
  let hitAny=false, lab=false;
  for(const e of enemies.slice()){
    if(e.dead) continue;
    const dx=e.pos.x-P.pos.x, dz=e.pos.z-P.pos.z, d=Math.hypot(dx,dz);
    if(d>Md.range+rangeAdd+e.T.r) continue;
    if(Math.acos(clamp((dx*fx+dz*fz)/(d||1),-1,1))>Md.arc) continue;
    _d.subVectors(e.pos,camera.position); const len=_d.length(); _d.divideScalar(len);
    ray.set(camera.position,_d); ray.far=len; if(ray.intersectObjects(worldMeshes,false).length) continue;
    const dir=_w.set(dx/(d||1),0,dz/(d||1)).clone();
    const fin=e.atkState==='stagger'||e.slideStun>0;   // ฟินิชเชอร์: ศัตรูที่กำลังเซ เสียเลือดมากขึ้น
    if(fin){ dmgNum(e.pos,'ฟินิชเชอร์!','#ff5a5a'); }
    else if(!lab&&(mul>=COMBO3_MUL)){ lab=true; dmgNum(e.pos,mul>=HEAVY_MUL?'ฟันหนัก!':'คอมโบ!','#ff8a00'); }
    damageEnemy(e,dmg*(fin?FINISH_MUL:1),e.pos.clone(),false,dir,true);   // อาวุธสั้น = heavy (ขัดท่า windup ได้)
    if(!e.dead) e.vel.addScaledVector(dir,((e.key==='titan'||e.key==='aegis')?Md.kb*0.25:Md.kb)*(mul>=HEAVY_MUL?1.4:1));
    hitAny=true;
  }
  if(hitAny){ sfx('mhit'); vib(mul>1?45:25); shake+=mul>1?0.16:0.08; if(S.hitPause&&state==='play') hpT=Math.max(hpT,0.04); }
}
/* heavy=true: ฟันหนัก (เงียบ ไม่มีเสียงฟัน) · ปกติ: คอมโบ 3 ท่า ซ้าย→ขวา→ลง/แทง (ต่อได้ถ้าฟันซ้ำภายใน COMBO_WIN วิ หลังคูลดาวน์) */
function swing(heavy){
  const Md=MW;
  if(heavy){ swingKind=3; swingRate=2.4; fireCD=Math.max(fireCD,0.4); heavyCD=HEAVY_CD; mcT=0; mcN=0;
    lungeT=HEAVY_LUNGE_T; lungeDX=-Math.sin(P.yaw)*HEAVY_LUNGE/HEAVY_LUNGE_T; lungeDZ=-Math.cos(P.yaw)*HEAVY_LUNGE/HEAVY_LUNGE_T; heavyHitT=HEAVY_LUNGE_T; }
  else { mcN=mcT>0?(mcN+1)%3:0; mcT=Md.cd+COMBO_WIN; swingKind=mcN; swingRate=3; fireCD=Md.cd; sfx('swing',mcN===2); }
  swingT=1; slashFx(swingKind);
  if(!heavy) meleeHit(mcN===2?COMBO3_MUL:1,0);
}

/* ================= HUD ================= */
function updHP(){ const h=Math.max(0,Math.round(P.hp)), pc=Math.max(0,P.hp/P.maxHp); $('hpFill').style.width=(pc*100)+'%'; $('hpText').textContent=h; $('hpFill').classList.toggle('low',pc<0.3); $('lowhp').classList.toggle('on',pc<0.3&&h>0); }
function updAmmo(){
  if(W.deploy){ const on=SEN.on, cd=SEN.cd>0; $('ammo').textContent=on?Math.ceil(SEN.t):(cd?Math.ceil(SEN.cd):'พร้อม'); $('ammoMax').textContent=on?' วิ ป้อมทำงาน':(cd?' วิ คูลดาวน์':''); $('ammo').classList.remove('low'); $('reloadT').style.display='none'; return; }
  if(W.fuel){ $('ammo').textContent=Math.round(fuelV); $('ammoMax').textContent='/'+W.fuel.max+' เชื้อเพลิง'; $('ammo').classList.toggle('low',fuelV<=W.fuel.max*0.2);
    $('reloadT').textContent='กำลังเติมเชื้อเพลิง...'; $('reloadT').style.display=reloading?'block':'none'; return; }
  if(W.hot){ $('ammo').textContent=Math.round(hotV); $('ammoMax').textContent='% ร้อน · ∞'; $('ammo').classList.toggle('low',hotLock||hotV>60);
    $('reloadT').textContent='ร้อนเกิน! รอเย็น'; $('reloadT').style.display=hotLock?'block':'none'; return; }
  if(W.heat){ $('ammo').textContent=Math.round(heatV/W.heat.max*100); $('ammoMax').textContent='% ร้อน'; $('ammo').classList.toggle('low',heatLock);
    $('reloadT').textContent=heatLock?'ร้อนเกิน! รอเย็น':'กำลังรีโหลด...'; $('reloadT').style.display=heatLock?'block':'none'; return; }
  $('ammo').textContent=ammo; $('ammoMax').textContent='/'+MAG; $('ammo').classList.toggle('low',ammo<=MAG*0.2);
  $('reloadT').textContent='กำลังรีโหลด...'; $('reloadT').style.display=reloading?'block':'none'; }
function updScore(){ $('scoreT').textContent=score.toLocaleString(); $('enemT').textContent='ศัตรู: '+(enemies.length+toSpawn); $('waveT').textContent='WAVE '+wave; }
function banner(t,sub,ms=2200){ const b=$('banner'); b.innerHTML=t+(sub?`<small>${sub}</small>`:''); b.classList.add('show'); clearTimeout(b._t); b._t=setTimeout(()=>b.classList.remove('show'),ms); }

/* ================= WEAPON SELECT / XP / UPGRADES ================= */
let selW=(()=>{ try{ const s=localStorage.getItem('ns_weapon'); return WDEF[s]?s:'ar'; }catch(e){ return 'ar'; } })();
let selM=(()=>{ try{ const s=localStorage.getItem('ns_melee'); return MDEF[s]?s:'katana'; }catch(e){ return 'katana'; } })();
/* ---- 3 ช่องอาวุธ: 1 ปืนหลัก (ไม่รวมปืนพก) · 2 ปืนพก · 3 อาวุธประชิด ----
   selW = ปืนที่ถืออยู่ตอนนี้ (โค้ดเดิมทั้งหมดอ้างอิงตัวนี้) · selP = ปืนหลักที่เลือก · selS = ปืนพกที่เลือก */
const isPistolId=id=>!!WDEF[id]&&WDEF[id].cls==='pistol';
let selP=isPistolId(selW)?'ar':selW;
let selS=(()=>{ try{ const s=localStorage.getItem('ns_sidearm'); return isPistolId(s)?s:'pistol'; }catch(e){ return 'pistol'; } })();
selW=selP;
let gunAmmo={}, curUI=1, prevUI=1, wMode='main';
let selCls='all';
try{ const s=localStorage.getItem('ns_wcls'); if(s==='all'||CLS_ORDER.includes(s)) selCls=s; }catch(e){}
let MW=MDEF[selM];
let W=WDEF[selW], WS={dmg:14,cd:0.095,reload:1.3,spread:0.012,critMul:2};
let cycleT=0, lastScoped=false;
let lvl=1, xp=0, xpNeed=40, pendingLv=0, upPicks=[];
const UPG=[
  {id:'dmg',ic:'💥',t:'พลังยิง',d:'ดาเมจกระสุน +15% ทุกระดับ',max:12},
  {id:'rate',ic:'⚡',t:'ความเร็วยิง',d:'ยิงเร็วขึ้น +10%',max:6},
  {id:'mag',ic:'📦',t:'แม็กกาซีนใหญ่',d:'ความจุกระสุน +25%',max:6},
  {id:'reload',ic:'🔄',t:'รีโหลดไว',d:'ลดเวลารีโหลด 15%',max:5},
  {id:'acc',ic:'🎯',t:'แม่นยำขึ้น',d:'กระสุนกระจายน้อยลง 20%',max:5},
  {id:'crit',ic:'👁️',t:'ยิงตาแรงขึ้น',d:'ดาเมจยิงโดนตา (คริติคอล) +0.3x',max:6},
  {id:'hp',ic:'❤️',t:'เลือดสูงสุด',d:'HP สูงสุด +20 และฟื้นทันที 20',max:8},
  {id:'armor',ic:'🛡️',t:'เกราะ',d:'ลดดาเมจที่ได้รับ 8%',max:6},
  {id:'vamp',ic:'🩸',t:'ดูดเลือด',d:'ฟื้น HP +1.5 ทุกครั้งที่ฆ่าศัตรู',max:5},
  {id:'cdr',ic:'⏱️',t:'สกิลไวขึ้น',d:'ลดคูลดาวน์สกิล 10% ต่อระดับ',max:5},
];
let upg={}; function resetUpg(){ UPG.forEach(u=>upg[u.id]=0); } resetUpg();
const needFor=l=>Math.round(40+(l-1)*30+(l-1)*(l-1)*4);
function recalc(){
  W=WDEF[selW]; MW=MDEF[selM];
  WS={dmg:W.dmg*(1+0.15*upg.dmg),cd:W.cd/(1+0.10*upg.rate),reload:W.reload*Math.pow(0.85,upg.reload),spread:W.spread*Math.pow(0.8,upg.acc),critMul:W.crit+0.3*upg.crit};
  MAG=Math.round(W.mag*(1+0.25*upg.mag)); P.maxHp=DIFF.hp+20*upg.hp; reloadDur=WS.reload;
}
recalc();
function addXP(n){ xp+=n; while(xp>=xpNeed){ xp-=xpNeed; lvl++; xpNeed=needFor(lvl); pendingLv++; } updXP(); }
function updXP(){ $('lvT').textContent='LV '+lvl; $('xpFill').style.width=Math.min(100,xp/xpNeed*100)+'%'; }
function hideScope(){ lastScoped=false; $('scope').style.display='none'; }
function openUpgrade(){
  const pool=UPG.filter(u=>u.id!=='dmg'&&upg[u.id]<u.max);
  for(let i=pool.length-1;i>0;i--){ const j=Math.random()*(i+1)|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const picks=[]; if(upg.dmg<UPG[0].max) picks.push(UPG[0]);   // การ์ด "พลังยิง" มาเสมอ
  while(picks.length<3&&pool.length) picks.push(pool.shift());
  if(!picks.length){ pendingLv=0; return; }
  state='upgrade'; chargeV=0; chargeRdy=false; beamSnd(false); flameSnd(false); firing=false; aiming=false; joy.x=joy.y=0; updToggles(); hideScope(); if(locked()) document.exitPointerLock();
  upPicks=picks;
  $('upSub').textContent=`เลเวล ${lvl} — เลือกอัปเกรด 1 อย่าง`;
  const box=$('uCards'); box.innerHTML='';
  picks.forEach(u=>{ const d=document.createElement('div'); d.className='wcard ucard';
    d.innerHTML=`<div class="ic">${u.ic}</div><h3>${u.t}</h3><div class="desc">${u.d}</div><div class="lvl">Lv ${upg[u.id]} → ${upg[u.id]+1}</div>`;
    d.onclick=()=>pickUpgrade(u.id); box.appendChild(d); });
  showScreen('upScr'); sfx('levelup'); vib([40,40,80]);
}
function pickUpgrade(id){
  if(state!=='upgrade') return;
  upg[id]++; recalc(); if(id==='hp') P.hp=Math.min(P.maxHp,P.hp+20);
  updHP(); sfx('pickup'); pendingLv=Math.max(0,pendingLv-1);
  if(pendingLv>0){ openUpgrade(); if(pendingLv>0) return; }
  ammo=MAG; reloading=false; updAmmo(); state='play'; showScreen(null); if(!S.touchUI) lockPointer();
}
/* ---- ป้ายกลไกพิเศษบนการ์ดปืน ---- */
function mechTagsOf(w){
  const t=[];
  if(w.fireMode==='burst') t.push('ยิงชุด '+(w.burst||3)+' นัด');
  if(w.fireMode==='select') t.push('สลับโหมด [N]');
  const m=MECH[w.mechanic]; if(m&&m.tag) t.push(m.tag);
  if(w.noAim) t.push('ไม่มีการเล็ง'); else if(w.noAds) t.push('ไม่มี ADS');
  return t;
}
function buildWeaponTabs(){
  const tb=$('wTabs'); tb.innerHTML='';
  const mk=(key,label)=>{ const b=document.createElement('button'); b.className='tab'+(selCls===key?' on':''); b.textContent=label;
    b.onclick=()=>{ selCls=key; try{ localStorage.setItem('ns_wcls',key); }catch(e){} buildWeaponCards(); }; tb.appendChild(b); };
  const md=$('wMode'); md.innerHTML='';
  [['main','ปืนหลัก (ช่อง 1)'],['side','ปืนพก (ช่อง 2)']].forEach(([k,l])=>{ const b=document.createElement('button'); b.className='tab'+(wMode===k?' on':''); b.textContent=l; b.onclick=()=>{ wMode=k; buildWeaponCards(); }; md.appendChild(b); });
  tb.style.display=wMode==='main'?'':'none';
  if(wMode==='main'){ mk('all','ทั้งหมด'); CLS_ORDER.filter(c=>c!=='pistol').forEach(c=>mk(c,CLS_TH[c])); }
}
/* ---- ระบบยศ: ตรวจสิทธิ์ก่อนเล่น / ข้อความล็อค / ปุ่มปลดล็อค ---- */
function rankLockMsg(r){ banner('🔒 ต้องใช้ยศ '+RK.RANKS[r].name,'กดปุ่ม "ปลดล็อคยศ" ที่หน้าเมนูเพื่อใส่รหัส',2200); RK.openRankUI(r); }
function sanitizeRank(){
  if(!RK.canGun(selP)){ selP='ar'; try{ localStorage.setItem('ns_weapon',selP); }catch(e){} }
  if(!RK.canGun(selS)){ selS='pistol'; try{ localStorage.setItem('ns_sidearm',selS); }catch(e){} }
  if(state!=='play') selW=selP;
  if(!RK.canMelee(selM)){ selM='bat'; MW=MDEF.bat; try{ localStorage.setItem('ns_melee',selM); }catch(e){} }
  if(!RK.canMap(selMap)){ selMap='rain'; try{ localStorage.setItem('ns_map',selMap); }catch(e){} applyMenuTheme('rain'); }
}
function updRankBadge(){ const b=$('bUnlock'); if(b) b.textContent='🔑 ปลดล็อคยศ · '+RK.RANKS[RK.state.rank].name+(RK.state.user?' ('+RK.state.user+')':''); }
function buildWeaponCards(){
  buildWeaponTabs();
  const box=$('wCards'); box.innerHTML='';
  const cl=(wMode==='main'&&selCls==='pistol')?'all':selCls;
  const list=WORDER.filter(id=>(wMode==='side'?WDEF[id].cls==='pistol':(WDEF[id].cls!=='pistol'&&(cl==='all'||WDEF[id].cls===cl)))&&gunUnlocked(id)); list.forEach(id=>ensureGun(id));
  if(!list.length){ box.innerHTML='<div class="desc" style="padding:20px;opacity:.7">ยังไม่มีปืนในหมวดนี้</div>'; return; }
  list.forEach(id=>{ const w=WDEF[id], d=document.createElement('div'), lk=!RK.canGun(id); d.className='wcard'+(id===(wMode==='main'?selP:selS)?' sel':'')+(lk?' rklock':''); if(lk) d.dataset.lock='🔒 '+RK.RANKS[RK.minRankGun(id)].name;
    d.innerHTML=`<svg viewBox="0 0 120 40" style="color:${w.color};fill:currentColor">${ICON[id]||''}</svg><h3>${w.name}</h3><div class="cls">${CLS_TH[w.cls]||''} · ${w.th}</div>`
      +['ดาเมจ','ความเร็ว','กระสุน','ความแม่น'].map((n,i)=>`<div class="stat"><span>${n}</span><div><i style="width:${w.ui[i]*100}%"></i></div></div>`).join('')
      +mechTagsOf(w).map(t=>`<span class="mechTag">${t}</span>`).join('')
      +`<div class="desc">${w.desc}</div>`;
    d.onclick=()=>{ if(lk){ rankLockMsg(RK.minRankGun(id)); return; } if(wMode==='main'){ selP=id; selW=id; try{ localStorage.setItem('ns_weapon',id); }catch(e){} } else { selS=id; try{ localStorage.setItem('ns_sidearm',id); }catch(e){} } buildWeaponCards(); };
    box.appendChild(d); });
}
function buildMeleeCards(){
  const box=$('mCards'); box.innerHTML='';
  MORDER.forEach(id=>{ const w=MDEF[id], d=document.createElement('div'), lk=!RK.canMelee(id); d.className='wcard'+(id===selM?' sel':'')+(lk?' rklock':''); if(lk) d.dataset.lock='🔒 '+RK.RANKS[RK.minRankMelee(id)].name;
    d.innerHTML=`<svg viewBox="0 0 120 40" style="color:${w.color};fill:currentColor">${ICON[id]}</svg><h3>${w.name}</h3><div class="cls">${w.th}</div>`
      +['ดาเมจ','ความเร็ว','ระยะ','ผลักถอย'].map((n,i)=>`<div class="stat"><span>${n}</span><div><i style="width:${w.ui[i]*100}%"></i></div></div>`).join('')
      +`<div class="desc">${w.desc}</div>`;
    d.onclick=()=>{ if(lk){ rankLockMsg(RK.minRankMelee(id)); return; } selM=id; MW=MDEF[id]; try{ localStorage.setItem('ns_melee',id); }catch(e){} buildMeleeCards(); };
    box.appendChild(d); });
}
/* ---------- ภาพพรีวิวแมพ (วาดด้วย canvas เล็กๆ ครั้งเดียวแล้ว cache เป็น dataURL) ---------- */
const PREV_DEF={
  rain:{sky:[[0,'#0a0820'],[0.65,'#1a1040'],[1,'#2a2a70']],ground:'#06101c',type:'city',col:'#0a0f24',acc:['#00e5ff','#ff2bd6']},
  desert:{sky:[[0,'#3b86d8'],[0.7,'#dbe9f2'],[1,'#e8d3a8']],ground:'#c9a26b',type:'dunes',col:'#b8935a',acc:['#fff2c0']},
  apoc:{sky:[[0,'#2a0e08'],[0.65,'#d9501a'],[1,'#f08a3a']],ground:'#1c1210',type:'ruins',col:'#120a08',acc:['#ff7a1a']},
  frost:{sky:[[0,'#02050f'],[0.55,'#0d3a4a'],[1,'#1d6a63']],ground:'#cfdde8',type:'frost',col:'#2a4258',acc:['#6dffb0','#b26bff']},
  jungle:{sky:[[0,'#e8f0b0'],[0.6,'#a8d080'],[1,'#4a7a40']],ground:'#2c4a24',type:'jungle',col:'#16341a',acc:['#ffe9a0']},
  foundry:{sky:[[0,'#2a2420'],[0.6,'#7a5a40'],[1,'#c07a3a']],ground:'#1c1816',type:'foundry',col:'#120e0c',acc:['#ff7a1a','#6aff3a']},
  metro:{sky:[[0,'#0a0e12'],[1,'#1a2228']],ground:'#3a3e42',type:'metro',col:'#586068',acc:['#dff6ff','#e0b020']},
  orbital:{sky:[[0,'#02030a'],[1,'#0a1a30']],ground:'#1e2a3a',type:'orbital',col:'#2a3a52',acc:['#66e8ff','#ff8a3a']}};
const MAPPREV={};
function mapPrev(id){
  if(MAPPREV[id]) return MAPPREV[id];
  const d=PREV_DEF[id]||PREV_DEF.rain, c=document.createElement('canvas'); c.width=230; c.height=104; const g=c.getContext('2d'), W_=230, H_=104, hz=70, rg=mulberry32(id.length*977+id.charCodeAt(0));
  const gr=g.createLinearGradient(0,0,0,hz); d.sky.forEach(([p,col])=>gr.addColorStop(p,col)); g.fillStyle=gr; g.fillRect(0,0,W_,hz);
  g.fillStyle=d.ground; g.fillRect(0,hz,W_,H_-hz);
  if(d.type==='frost'||d.type==='orbital'||d.type==='city'){ for(let i=0;i<70;i++){ g.fillStyle=`rgba(255,255,255,${0.3+rg()*0.6})`; g.fillRect(rg()*W_,rg()*hz*0.8,1,1); } }
  if(d.type==='frost'){ for(let k=0;k<3;k++){ const gg=g.createLinearGradient(0,10,0,45); gg.addColorStop(0,'rgba(109,255,176,0)'); gg.addColorStop(0.5,k%2?'rgba(178,107,255,0.5)':'rgba(109,255,176,0.55)'); gg.addColorStop(1,'rgba(109,255,176,0)'); g.fillStyle=gg; g.beginPath(); g.moveTo(0,25+k*6); for(let x=0;x<=W_;x+=10) g.lineTo(x,22+k*8+Math.sin(x*0.04+k)*8); g.lineTo(W_,48+k*6); g.lineTo(0,52+k*6); g.fill(); } }
  g.fillStyle=d.col;
  if(d.type==='city'){ for(let x=0;x<W_;x+=14){ const h=14+rg()*44, w=10+rg()*6; g.fillRect(x,hz-h,w,h); g.fillStyle=d.acc[rg()<.5?0:1]; g.fillRect(x+2,hz-h+3,w-4,1.5); g.fillStyle=d.col; } }
  else if(d.type==='dunes'){ g.beginPath(); g.moveTo(0,hz); for(let x=0;x<=W_;x+=8) g.lineTo(x,hz-8-Math.sin(x*0.03)*7-rg()*4); g.lineTo(W_,hz); g.fill(); g.fillStyle='#8a6c46'; g.fillRect(70,hz-30,16,30); g.fillRect(150,hz-24,22,24); g.fillRect(100,hz-34,12,34); }
  else if(d.type==='ruins'){ for(let x=6;x<W_;x+=22){ const h=14+rg()*40; g.fillRect(x,hz-h,10+rg()*8,h); g.fillRect(x+6,hz-h-6,6,6); } g.fillStyle=d.acc[0]; g.beginPath(); g.arc(150,hz-4,6,0,7); g.fill(); }
  else if(d.type==='frost'){ g.beginPath(); g.moveTo(0,hz); for(let x=0;x<=W_;x+=26){ g.lineTo(x,hz-12-rg()*30); g.lineTo(x+13,hz-4); } g.lineTo(W_,hz); g.fill(); g.fillStyle='#9ab8d0'; g.fillRect(60,hz-14,60,14); g.fillRect(150,hz-10,34,10); g.fillStyle='#ffd890'; g.fillRect(66,hz-9,10,3); g.fillRect(84,hz-9,10,3); g.fillRect(100,hz-9,10,3); }
  else if(d.type==='jungle'){ for(let x=-6;x<W_;x+=18){ const h=24+rg()*34; g.fillRect(x+7,hz-h,4,h); g.beginPath(); g.arc(x+9,hz-h,10+rg()*6,0,7); g.fill(); } g.fillStyle='#6a7a6a'; g.fillRect(90,hz-26,50,26); g.fillRect(98,hz-36,8,10); g.fillRect(124,hz-36,8,10); }
  else if(d.type==='foundry'){ for(let x=10;x<W_;x+=46){ g.fillRect(x,hz-52+rg()*14,14,52); g.fillStyle=d.acc[0]; g.fillRect(x,hz-52,14,3); g.fillStyle=d.col; } g.fillRect(0,hz-18,W_,18); g.fillStyle=d.acc[1]; g.fillRect(30,hz+6,60,10); g.fillStyle=d.acc[0]; g.fillRect(130,hz+8,50,9); g.fillStyle='#e9b81a'; g.fillRect(100,hz-24,70,3); }
  else if(d.type==='metro'){ g.fillStyle='#2a3036'; g.fillRect(0,0,W_,14); g.fillStyle=d.acc[0]; for(let x=12;x<W_;x+=46) g.fillRect(x,12,24,2); g.fillStyle=d.col; for(let x=20;x<W_;x+=50) g.fillRect(x,14,8,hz-14); g.fillStyle='#6a2a24'; g.fillRect(40,hz-28,110,28); g.fillStyle='#14181c'; for(let x=48;x<145;x+=18) g.fillRect(x,hz-22,12,10); g.fillStyle=d.acc[1]; g.fillRect(0,hz,W_,3); }
  else if(d.type==='orbital'){ g.fillStyle='#1a5ab0'; g.beginPath(); g.arc(165,34,22,0,7); g.fill(); g.fillStyle='#3a9a5a'; g.fillRect(155,28,12,8); g.fillStyle=d.col; g.fillRect(0,hz-4,W_,4); for(let x=8;x<W_;x+=30){ g.fillRect(x,hz-20,6,20); } g.fillStyle='#0a1220'; g.fillRect(18,8,70,40); g.strokeStyle=d.acc[0]; g.strokeRect(18,8,70,40); }
  const sh=g.createLinearGradient(0,hz,0,H_); sh.addColorStop(0,'rgba(0,0,0,0.0)'); sh.addColorStop(1,'rgba(0,0,0,0.35)'); g.fillStyle=sh; g.fillRect(0,hz,W_,H_-hz);
  return MAPPREV[id]=c.toDataURL();
}
function buildMapCards(){
  const box=$('mapCards'); box.innerHTML='';
  MAP_IDS.forEach(id=>{ const m=MAPS[id], bk=+localStorage.getItem('ns_best_'+id)||0, d=document.createElement('div'), lk=!RK.canMap(id); d.className='wcard mcard'+(id===selMap?' sel':'')+(lk?' rklock':''); if(lk) d.dataset.lock='🔒 '+RK.RANKS[RK.minRankMap(id)].name;
    d.innerHTML=`<div class="mprev" style="background:url(${mapPrev(id)}) center/cover"></div><h3>${m.name}</h3><div class="cls">${m.th}</div><div class="desc">${m.gim||m.desc}</div><div class="mmeta">📐 ${m.A*2}×${m.A*2} ม. · 🏆 ${bk?bk.toLocaleString():'—'}</div>`;
    d.onclick=()=>{ if(lk){ rankLockMsg(RK.minRankMap(id)); return; } selMap=id; try{ localStorage.setItem('ns_map',id); }catch(e){} applyMenuTheme(id); if(curMap!==id){ clearFX(); withLoading(()=>{ buildMap(id); buildMapCards(); }); } buildMapCards(); };
    box.appendChild(d); if(id===selMap) setTimeout(()=>{ try{ d.scrollIntoView({inline:'center',block:'nearest'}); }catch(e){} },0); });
}
function openMaps(){ buildMapCards(); showScreen('mapScr'); }

function openWeapons(){ buildWeaponCards(); buildMeleeCards(); showScreen('wpnScr'); }

/* ================= UPDATE ================= */
function update(dt,time){
  frameDt=dt;
  // โหมดเมาส์ไม่ล็อก: เมาส์ชิดขอบจอ = หมุนต่อเนื่อง (เพราะเคอร์เซอร์ออกนอกจอไม่ได้)
  if(noLock&&!S.touchUI&&mouseX>=0&&!locked()){
    const ed=60, sp=700*dt;
    if(mouseX<ed) applyLook(-(1-mouseX/ed)*sp,0,0.0022); else if(mouseX>innerWidth-ed) applyLook((1-(innerWidth-mouseX)/ed)*sp,0,0.0022);
    if(mouseY<ed) applyLook(0,-(1-mouseY/ed)*sp*0.6,0.0022); else if(mouseY>innerHeight-ed) applyLook(0,(1-(innerHeight-mouseY)/ed)*sp*0.6,0.0022);
  }
  // movement
  let fx=0,fz=0;
  if(keys.KeyW||keys.ArrowUp) fz+=1; if(keys.KeyS||keys.ArrowDown) fz-=1;
  if(keys.KeyD||keys.ArrowRight) fx+=1; if(keys.KeyA||keys.ArrowLeft) fx-=1;
  fx+=joy.x; fz-=joy.y;
  const ml=Math.hypot(fx,fz); if(ml>1){ fx/=ml; fz/=ml; }
  const sprint=(keys.ShiftLeft||keys.ShiftRight||sprintT)&&fz>0.3&&!aiming&&(!firing||!!W.runFire);
  const spd=(sprint?11:7)*(aiming?0.55:1)*(slot===2?1.3:(W.slow||1))*PSPD;
  const sy=Math.sin(P.yaw), cy=Math.cos(P.yaw);
  let tx=(-sy*fz+cy*fx)*spd, tz=(-cy*fz-sy*fx)*spd;
  let k=1-Math.exp(-(P.onGround?(iceZones.length&&onIce(P.pos.x,P.pos.z)?2.2:14):3)*dt);   // พื้นน้ำแข็ง: เสียดทานต่ำ (2.2 แทน 14)
  if(pounding){ tx*=0.15; tz*=0.15; }
  if(slideT>0){ slideT=Math.max(0,slideT-dt); const v=SLIDE_V*(slideT/SLIDE_T); tx=slideDX*v; tz=slideDZ*v; k=1; slideHit(); }
  P.vel.x+=(tx-P.vel.x)*k; P.vel.z+=(tz-P.vel.z)*k; P.vel.y-=GRAV*dt; if(pounding&&P.vel.y>-POUND_V) P.vel.y=-POUND_V;
  P.pos.x+=P.vel.x*dt; P.pos.z+=P.vel.z*dt; P.pos.y+=P.vel.y*dt;
  if(lungeT>0){ const st=Math.min(lungeT,dt); P.pos.x+=lungeDX*st; P.pos.z+=lungeDZ*st; lungeT-=st; }   // พุ่งฟันหนักไปข้างหน้า HEAVY_LUNGE ม. (collide ด้านล่างกันทะลุกำแพง)
  const g=collide(P.pos,P.radius,P.pos.y,P.pos.y+1.8);
  if(P.pos.y<=g){ const wasAir=!P.onGround, vy=-P.vel.y;
    if(wasAir&&vy>3.5) landDip=Math.min(1,Math.max(landDip,(vy-3)/14));
    if(wasAir&&vy>7){ shake+=0.12; vib(15); sfx('land'); }
    if(wasAir&&vy>4){ landA=Math.min(1,(vy-4)/18); landT=0; }     // เด้งกล้องตามความสูงที่ตก
    P.pos.y=g; P.vel.y=0; P.onGround=true; airJumped=false;
    if(pounding){ pounding=false; landA=1; landT=0; poundHit(); } }
  else if(P.pos.y>g+0.05) P.onGround=false;

  // camera
  const hs=Math.hypot(P.vel.x,P.vel.z);
  if(P.onGround&&hs>0.5) bobT+=dt*hs*1.5;
  const bobAmt=Math.min(hs/7,1.5)*(P.onGround?1:0);
  const adsRate=slot===1?3/Math.max(0.06,W.ads||0.2):14;
  aimLerp+=((aiming?1:0)-aimLerp)*(1-Math.exp(-adsRate*dt));
  sprintLerp+=(((sprint&&!(firing&&W.runFire))?1:0)-sprintLerp)*(1-Math.exp(-8*dt));
  if(!aiming) zoomLvl=0;
  const tf=S.fov*(1-((W.zoom2&&zoomLvl)?W.zoom2:(W.zoom||0.32))*aimLerp)+sprintLerp*6;
  if(Math.abs(camera.fov-tf)>0.01){ camera.fov+=(tf-camera.fov)*(1-Math.exp(-12*dt)); camera.updateProjectionMatrix(); }
  P.pitch=clamp(P.pitch,-1.5,1.5);
  const vfx=vfxV(); slideK+=((slideT>0?1:0)-slideK)*(1-Math.exp(-14*dt)); landT+=dt;
  const landE=landA*Math.exp(-7*landT)*Math.cos(landT*15);
  camera.position.set(P.pos.x,P.pos.y+1.65+Math.sin(bobT*2)*0.045*bobAmt*(1-aimLerp)-slideK*0.65-landE*0.2*vfx,P.pos.z);
  if(shake>0){ camera.position.x+=rand(-1,1)*shake*0.12*vfx; camera.position.y+=rand(-1,1)*shake*0.12*vfx; shake=Math.max(0,shake-dt*2.5); }
  const rollT=(-clamp((P.vel.x*cy-P.vel.z*sy)/7,-1.2,1.2)*0.028*(1-aimLerp*0.7)*(P.onGround?1:0.5)+hurtS*hurtK*0.05-slideK*0.06)*vfx;   // เอียงตามการเดินซ้ายขวา/โดนดาเมจ/สไลด์
  camRoll+=(rollT-camRoll)*(1-Math.exp(-9*dt));
  camera.rotation.set(P.pitch-landE*0.03*vfx,P.yaw,camRoll);

  // weapon
  fireCD=Math.max(fireCD-dt,-dt);
  if(drawT>0) drawT=Math.max(0,drawT-dt);
  if(swapQ){ swapQ.t-=dt; if(swapQ.t<=0){ const nn=swapQ.n, gg=swapQ.g; swapQ=null; setSlotNow(nn,false,gg); } }
  if(swingT>0) swingT=Math.max(0,swingT-dt*swingRate);
  slideCD=Math.max(0,slideCD-dt); poundCD=Math.max(0,poundCD-dt);
  mcT=Math.max(0,mcT-dt); heavyCD=Math.max(0,heavyCD-dt); qmCD=Math.max(0,qmCD-dt); slashUpdate(dt);
  if(heavyHitT>0){ heavyHitT-=dt; if(heavyHitT<=0&&slot===2) meleeHit(HEAVY_MUL,0.6); }
  if(qmT>0){ qmT-=dt; if(qmT<=0){ qmT=0; qmCD=QM_CD; if(slot===2) setSlotNow(1,false); } }
  if(slot===2||W.noAim) aiming=false;
  if(ANM&&ANM.name==='inspect'&&(firing||aiming||reloading||swapQ)) endAnim(true);
  if(reloading){ reloadT-=dt; if(reloadT<=0){ reloading=false; ammo=MAG; if(W.fuel) fuelV=W.fuel.max; updAmmo(); mech('onReloadDone'); } }
  if(W.spinup&&slot===1){ if(firing&&!reloading&&drawT<=0){ if(spinT===0) sfx('spinup'); spinT=Math.min(1,spinT+dt/W.spinup); } else spinT=Math.max(0,spinT-dt/0.8); } else spinT=0;
  if(firing) idleT=0; else { idleT+=dt; if(idleT>(W.recoilRecover||0.3)) shotIdx=0; }
  if(slot===2){
    if(firing&&drawT<=0&&!swapQ){
      if(!mHoldPrev){ mHoldPrev=true; mHold=0; mSwung=false; mReady=false; }
      else mHold+=dt;
      if(!mSwung&&fireCD<=0&&mHold<0.3){ mSwung=true; swing(); }     // กดค้างจะไม่ฟันรัว: ค้าง 0.5 วิแล้วปล่อย = ฟันหนัก
      if(mHold>=HEAVY_HOLD&&!mReady&&heavyCD<=0){ mReady=true; emit(_tmpV.set(camera.position.x,camera.position.y-0.2,camera.position.z).addScaledVector(camera.getWorldDirection(_tmpV2),1.2),10,0xffffff,2.5,0.3,0,4); vib(12); }
    } else if(mHoldPrev){ mHoldPrev=false; if(mHold>=HEAVY_HOLD&&heavyCD<=0&&drawT<=0&&!swapQ&&fireCD<=0.35) swing(true); mHold=0; mReady=false; }
  }
  else if(drawT<=0&&!swapQ){ mHoldPrev=false; mHold=0; mReady=false; fireLogic(hs); } else { mHoldPrev=false; mHold=0; mReady=false; }
  mech('onUpdate',dt); heatStep(dt); updChargeHUD();
  const smul=mech('spreadMul');
  const sb=WS.spread*(1+(W.hip||0)*(1-aimLerp))*(smul===undefined?1:smul);
  curSpread=(sb+Math.min(hs/7,1.5)*sb*1.5+(P.onGround?0:sb*2.5))*(1-(W.noAds?0.5:0.8)*aimLerp)+gunKick*sb*0.5;
  const gap=Math.round(6+curSpread*420);
  if(gap!==lastGap){ $('cross').style.setProperty('--g',gap+'px'); lastGap=gap; }
  if(slot===1) $('cross').style.opacity=W.noAds?1:1-aimLerp;

  // gun pose
  const aimE=aimLerp*aimLerp*(3-2*aimLerp), ft=curFeel, adsMid=Math.sin(aimLerp*Math.PI);
  inspK+=((ANM&&ANM.name==='inspect'?1:0)-inspK)*(1-Math.exp(-10*dt)); const spl=sprintLerp*(1-inspK);   // ควงขณะวิ่งได้: ท่าวิ่งจางลงตอนควง
  gun.position.lerpVectors(curModel.hip,curModel.aim,aimE);
  const ba=bobAmt*(1-aimLerp*0.85)*ft.bob;
  gun.position.x+=Math.cos(bobT)*0.012*ba+swayX*0.6;
  gun.position.y+=-Math.abs(Math.sin(bobT))*0.012*ba+swayY*0.6-spl*ft.sp[3]-adsMid*ft.adsDip-slideK*0.02;
  gun.position.z+=gunKick*ft.kz*(1-aimLerp*0.5);
  const rp=reloading?Math.sin((1-reloadT/reloadDur)*Math.PI):0;
  gun.rotation.set(gunKick*ft.kp-spl*ft.sp[0], swayX*2+spl*ft.sp[1], gunKick*ft.kr*gunSide+spl*ft.sp[2]+adsMid*0.05+slideK*0.2);
  if(ft.jit&&gunKick>0.02){ const jk=ft.jit*gunKick; gun.position.x+=rand(-1,1)*0.004*jk; gun.position.y+=rand(-1,1)*0.003*jk; gun.rotation.z+=rand(-1,1)*0.012*jk; }
  // ท่ากระโดด/ลงพื้น/โดนดาเมจ/ชิดกำแพง (ยกปากกระบอกขึ้น)
  landDip*=Math.exp(-9*dt); hurtK*=Math.exp(-9*dt);
  const airK=P.onGround?0:clamp(P.vel.y/10,-1,1);
  gun.position.y+=airK*0.012-landDip*0.05-hurtK*0.02; gun.rotation.x+=airK*0.05-landDip*0.12-hurtK*0.08; gun.rotation.z+=hurtS*hurtK*0.12;
  { _tmpV.set(camera.position.x-Math.sin(P.yaw)*0.8,camera.position.y-0.25,camera.position.z-Math.cos(P.yaw)*0.8); wallK+=((inBox(_tmpV)?1:0)-wallK)*(1-Math.exp(-12*dt)); }
  if(wallK>0.01){ gun.position.z+=wallK*0.1; gun.position.y-=wallK*0.03; gun.rotation.x+=wallK*0.35; gun.rotation.y+=wallK*0.25; }
  if(curModel.mag) curModel.mag.position.y=curModel.magY;
  mech('onPose',rp);
  if(curModel.spinG) curModel.spinG.rotation.z+=dt*spinT*38;
  cycleT=Math.max(0,cycleT-dt*1.4);
  const mv=curModel.mover;
  if(mv){ let mk; if(curModel.moverMode==='kick') mk=Math.min(1,gunKick/(W.kick||1)); else mk=cycleT>0.7?0:Math.sin((0.7-cycleT)/0.7*Math.PI);
    const mo=mech('mover',mk); if(mo!==undefined) mk=mo;
    mv.position.z=curModel.moverBase+mk*curModel.moverAmp; }
  if(curModel&&curModel.fade) fadeSights(curModel,aimLerp);
  const scoped=!!W.scope&&aimLerp>0.85; gun.visible=!scoped; if(scoped!==lastScoped){ lastScoped=scoped; $('scope').style.display=scoped?'block':'none'; }
  gunKick=Math.max(0,gunKick-dt*12); swayX*=Math.exp(-10*dt); swayY*=Math.exp(-10*dt);
  flashT-=dt; flash.visible=flashT>0; flashLight.intensity=flashT>0?14*S.light:0; fxUpdate(dt); animApply(dt);
  if(slot===2&&swingT>0){ const e=1-swingT, sw=Math.sin(e*Math.PI), k=swingKind, kar=selM==='karambit';
    if(k===0){ gun.rotation.x-=sw*(kar?1.6:1.15); gun.rotation.y+=sw*(kar?-0.5:0.45); gun.position.z-=sw*0.08; }
    else if(k===1){ gun.rotation.x-=sw*(kar?1.3:0.9); gun.rotation.y-=sw*(kar?-0.9:1.0); gun.rotation.z+=sw*0.7; gun.position.z-=sw*0.08; gun.position.x-=sw*0.05; }
    else if(k===2){ if(selM==='katana'||selM==='butterfly'){ gun.position.z-=sw*0.34; gun.position.y+=sw*0.02; gun.rotation.x-=sw*0.22; }   // แทง
      else { const a=e<0.35?0.8*Math.sin(e/0.35*PI2):e<0.7?0.8-2.3*((e-0.35)/0.35):-1.5*(1-(e-0.7)/0.3); gun.rotation.x+=a; gun.position.y+=a>0?a*0.05:a*0.03; gun.position.z-=sw*0.1; } }   // ฟันลง
    else { gun.rotation.x-=sw*1.7; gun.rotation.y+=sw*1.1; gun.rotation.z+=sw*0.6; gun.position.z-=sw*0.2; } }
  if(slot===2&&mHoldPrev&&heavyCD<=0&&mHold>0.12&&swingT<=0){ const c=clamp((mHold-0.12)/(HEAVY_HOLD-0.12),0,1);   // ง้างดาบรอฟันหนัก
    gun.rotation.x+=c*0.5; gun.rotation.y-=c*0.45; gun.rotation.z-=c*0.3; gun.position.z+=c*0.06; gun.position.x+=c*0.05+(c>=1?rand(-1,1)*0.003:0); }

  updMechHUD();
  // สกิล: ตัวจับเวลา / คูลดาวน์ (หยุดเมื่อไม่ได้อยู่ใน state 'play' อัตโนมัติ)
  invulnT=Math.max(0,invulnT-dt); tsT=Math.max(0,tsT-dt); ocT=Math.max(0,ocT-dt);
  for(const s of SKILLS) s.t=Math.max(0,s.t-dt);
  if(barrierHp>0){ barrierT-=dt; barrierMesh.position.set(P.pos.x,P.pos.y+1,P.pos.z);
    barrierMesh.material.opacity=0.12+Math.sin(time*6)*0.05;
    if(barrierT<=0){ barrierHp=0; barrierMesh.visible=false; } }
  updSkillHUD();
  // enemies (Time Slow: ศัตรูและกระสุนศัตรูช้าลงเหลือ 35%)
  const rdt=dt; if(tsT>0) dt*=0.35;
  const pp=P.pos, boomQ=[];
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i]; if(!e) continue; const T=e.T, key=e.key, ex=e.parts.ex, dis=e.st.stun>0||e.st.freeze>0;
    if(e.spawn<1){ e.spawn=Math.min(1,e.spawn+dt*1.8); e.g.scale.setScalar(Math.max(0.01,easeOutBack(e.spawn))); }
    let dx=pp.x-e.pos.x, dz=pp.z-e.pos.z; const dist=Math.hypot(dx,dz)||0.001; dx/=dist; dz/=dist;
    let mx=0,mz=0, spd=T.speed*ESPD*(e.enraged?1.5:1)*(dis?0:(e.st.slowT>0?0.65:1));
    if(T.melee||T.boom){ mx=dx; mz=dz; if(T.boom&&dist<14) spd*=1.35; }
    else { const pref=key==='mender'?(e.others>0?17:8):(T.pref||10);
      if(dist>pref+3){ mx=dx; mz=dz; } else if(dist<pref-4){ mx=-dx; mz=-dz; }
      e.strafeT-=dt; if(e.strafeT<0){ e.strafe*=-1; e.strafeT=rand(1.5,4); }
      mx+=-dz*e.strafe*0.7; mz+=dx*e.strafe*0.7; }
    for(const o of enemies){ if(o===e) continue; const sx=e.pos.x-o.pos.x, sz=e.pos.z-o.pos.z, d=Math.hypot(sx,sz), mn=T.r+o.T.r+0.8;
      if(d<mn&&d>0.001){ mx+=sx/d*(mn-d)*1.5; mz+=sz/d*(mn-d)*1.5; } }
    if(key==='wraith'&&e.blinkPh!==0){ mx=0; mz=0; }
    // ท่าโจมตี: ควบคุมการเคลื่อนที่ระหว่างตั้งท่า/โจมตี/พัก (e.mv)
    const as=e.atkState, mvOn=as!=='idle';
    if(mvOn){ const mv=e.mv;
      if(mv==='hold'){ mx=0; mz=0; } else if(mv==='slow'){ spd*=0.3; } else if(mv==='back'){ mx=-dx; mz=-dz; spd*=0.7; }
      else if(mv==='goto'){ const gx=e.tx-e.pos.x, gz=e.tz-e.pos.z, gl=Math.hypot(gx,gz); if(gl>0.4){ mx=gx/gl; mz=gz/gl; spd=6.5; } else { mx=0; mz=0; } } }
    const l2=Math.hypot(mx,mz); if(l2>1){ mx/=l2; mz/=l2; }
    const ek=1-Math.exp(-(mvOn&&e.mv==='hold'?10:4)*dt);
    e.vel.x+=(mx*spd-e.vel.x)*ek; e.vel.z+=(mz*spd-e.vel.z)*ek;
    const dashing=as==='strike'&&e.mv==='dash'; if(dashing){ e.vel.x=e.dv.x; e.vel.z=e.dv.z; }
    e.pos.x+=e.vel.x*dt; e.pos.z+=e.vel.z*dt;
    e.pos.y=T.fly+Math.sin(time*((T.melee||T.boom)?5:2.2)+e.phase)*0.25+e.jy;
    { const fm=MAPS[curMap].flyMax; if(fm&&e.pos.y>fm-T.r) e.pos.y=fm-T.r; }   /* แมพเพดานต่ำ: ศัตรูบินไม่เกินเพดาน */
    const bx=e.pos.x, bz=e.pos.z;
    collide(e.pos,T.r,e.pos.y-T.r,e.pos.y+T.r,true);
    if(hazZones.length&&T.fly<1.4){ for(const h of hazZones){ const dx=e.pos.x-h.x, dz=e.pos.z-h.z, px=h.hw+T.r+0.3-Math.abs(dx), pz=h.hd+T.r+0.3-Math.abs(dz); if(px>0&&pz>0){ if(px<pz) e.pos.x+=dx<0?-px:px; else e.pos.z+=dz<0?-pz:pz; } } }   /* ศัตรูภาคพื้นดินเลี่ยงบ่อกรด/ลาวา */
    if(dashing){   // พุ่งชนกำแพง/ที่กำบัง/ขอบสนาม → e.hitWall (CHARGER มึน, LEAPER ลงพื้น)
      const lim=A-1.2; if(Math.abs(e.pos.x)>lim||Math.abs(e.pos.z)>lim){ e.pos.x=clamp(e.pos.x,-lim,lim); e.pos.z=clamp(e.pos.z,-lim,lim); e.hitWall=true; }
      else if(Math.hypot(e.pos.x-bx,e.pos.z-bz)>0.015) e.hitWall=true; }
    e.g.position.copy(e.pos);
    if(key==='charger'&&as==='strike'){ _v.set(e.pos.x+e.ax,e.pos.y,e.pos.z+e.az); e.g.lookAt(_v); } else e.g.lookAt(camera.position);
    if(e.spawn>=1){ const tl=e.tele; e.g.scale.set(1+0.08*tl,1-0.14*tl,1+0.08*tl);   // telegraph: ตัวหด-ยืด
      if(tl>0&&e.atkKind==='pounce'&&T.A.pounce.shake){ e.g.position.x+=rand(-1,1)*0.07*tl; e.g.position.z+=rand(-1,1)*0.07*tl; } }
    e.parts.ring.rotation.y+=dt*3*(1+e.tele*5); if(e.parts.ring2) e.parts.ring2.rotation.x+=dt*2;
    if(e.tele>0||e.eyeD){ e.parts.eye.scale.copy(e.parts.eyeBase).multiplyScalar(1+e.tele*0.9); e.eyeD=e.tele>0; }
    if(ex.spin){ ex.spin.rotation.y+=dt*2.4; ex.spin.rotation.x+=dt*1.1; }
    if(ex.belly){ const op=e.atkKind==='spawn'&&(as==='windup'||as==='strike'||as==='recover'); ex.belly.visible=op&&Math.sin(time*40)>-0.3; }
    if(key==='mite'&&e.jy>0.01) e.jy*=Math.exp(-3*dt);
    e.flash=Math.max(0,e.flash-dt*7); updStatus(e,dt,time); if(e.dead) continue;

    // ---- AEGIS: โล่พลังงานกะพริบเมื่อโดนยิง ----
    if(ex.shieldMat&&e.shield>0){ e.shieldFlash=Math.max(0,e.shieldFlash-dt*5);
      ex.shieldMat.opacity=0.12+Math.sin(time*3+e.phase)*0.03+e.shieldFlash*0.5; ex.shieldWire.opacity=0.35+e.shieldFlash*0.6; ex.shieldGrp.rotation.y+=dt*0.7; }

    // ---- WRAITH: หายตัว → เทเลพอร์ต → โผล่มายิงรัว 3 นัด ----
    if(key==='wraith'){
      e.blinkT-=dt;
      if(e.blinkPh===0){ if(e.blinkT<=0&&e.spawn>=1&&e.atkState==='idle'){ e.blinkPh=1; sfx('blink',dist); emit(e.pos,18,T.color,4,0.5,0.2); ringFX(e.pos,T.color,2.5,0.4); } }
      else if(e.blinkPh===1){ e.alpha=Math.max(0.04,e.alpha-dt*4.5);
        if(e.alpha<=0.04){ if(blinkTo(e)){ emit(e.pos,18,T.color,4,0.5,0.2); ringFX(e.pos,T.color,2.5,0.4); } e.blinkPh=2; } }
      else { e.alpha=Math.min(0.55,e.alpha+dt*4.5); if(e.alpha>=0.55){ e.blinkPh=0; e.blinkT=rand(3,5.2); e.cdk.shoot=0; e.atkCD=0; } }   // โผล่แล้วเข้าท่ายิงรัว 3 นัด (มีไฟเล็งก่อน)
      e.parts.bodyMat.opacity=e.alpha;
    }

    // ---- MENDER: ฮีลศัตรูที่เลือดน้อยสุด 2 ตัวในระยะ ----
    if(key==='mender'){
      const inj=[]; let others=0;
      for(const o of enemies){ if(o===e||o.key==='mender') continue; others++; if(o.hp<o.maxHp&&o.pos.distanceTo(e.pos)<T.range) inj.push(o); }
      e.others=others; e.healing=inj.length>0; inj.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);
      for(let k=0;k<2;k++){ const bm=ex.beams[k], o=inj[k];
        if(o&&e.spawn>=1){ o.hp=Math.min(o.maxHp,o.hp+T.heal*dt); bm.visible=true; bm.position.copy(e.pos); bm.lookAt(o.pos); bm.scale.z=e.pos.distanceTo(o.pos);
          bm.material.opacity=0.55+Math.sin(time*18+k)*0.25; if(Math.random()<dt*6) emit(o.pos,1,T.color,1.5,0.5,0); }
        else bm.visible=false; }
    }

    // ---- โจมตี ----
    if(T.atkSys){         // ศัตรูที่ใช้ระบบท่าโจมตีกลาง (ตั้งท่า → โจมตี → พัก)
      if(dis){ if(e.atkState!=='idle') atkCancel(e,1); e.tele=Math.max(0,e.tele-dt*4); }   // สตัน/แช่แข็ง = ยกเลิกท่า
      else updAtk(e,dt,time,dist,dx,dz);
    } else if(T.melee){   // shard (ชนตัวตรงๆ)
      e.atk-=dt;
      if(dist<T.r+P.radius+0.5&&Math.abs(e.pos.y-(pp.y+1))<1.6&&e.atk<=0&&e.spawn>=0.6&&!dis){
        hurt(T.melee,e.pos.x,e.pos.z); e.atk=1.1; P.vel.x+=dx*9; P.vel.z+=dz*9; P.vel.y+=3; e.vel.x=-dx*8; e.vel.z=-dz*8;
        emit(e.pos,20,T.color,5,0.4); }
    } else if(T.boom){    // BOMBER: จุดชนวนเมื่อเข้าใกล้ แล้วระเบิด — ไฟกะพริบถี่ขึ้นเมื่อเข้าใกล้ + วงแดงแสดงรัศมีระเบิดตอนติดชนวน
      if(e.fuse>0){ e.fuse-=dt; if(e.fuse<=0) boomQ.push(e); }
      else if(dist<3.2&&Math.abs(e.pos.y-(pp.y+1))<2.4&&e.spawn>=1&&!dis){ e.fuse=0.5; sfx('beep',dist); if(!e.dec) e.dec=decGet('circ',12); }
      if(e.dec){ if(e.fuse>0) decCirc(e.dec,e.pos.x,e.pos.z,T.boom.r,ATK_COL,1-e.fuse/0.5,Math.sin(time*45)*0.5+0.5); else { decFree(e.dec); e.dec=null; } }
      e.beepT-=dt; if(e.beepT<=0){ sfx('beep',dist); e.beepT=e.fuse>0?0.07:clamp(dist/24,0.12,0.9); }
      const hz=e.fuse>0?45:6+(1-clamp(dist/22,0,1))*26;
      const on=Math.sin(time*hz+e.phase)>0; ex.glowMat.color.set(on?0xffffff:T.color).multiplyScalar(2.5*(MAPS[curMap].glow||1));
      e.tele=e.fuse>0?1:clamp(1-dist/14,0,0.7)*(on?1:0.5);
    }
  }
  for(const e of boomQ){ if(enemies.indexOf(e)>=0) killEnemy(e,true); }   // BOMBER ระเบิดตัวเอง (ไม่ได้คะแนน)
  // projectiles
  for(let i=projs.length-1;i>=0;i--){
    const p=projs[i]; p.life-=dt; p.g.position.addScaledVector(p.vel,dt); const q=p.g.position;
    const cyy=clamp(q.y,pp.y+0.2,pp.y+1.75), d2=(q.x-pp.x)**2+(q.y-cyy)**2+(q.z-pp.z)**2;
    if(d2<0.3){ hurt(p.dmg,q.x-p.vel.x*0.7,q.z-p.vel.z*0.7); emit(q,15,p.color,4,0.4); scene.remove(p.g); projs.splice(i,1); continue; }
    if(q.y<0.05||p.life<=0||inBox(q)){ emit(q,12,p.color,3,0.4); scene.remove(p.g); projs.splice(i,1); }
  }
  updShells(dt,time);
  dt=rdt;
  updPProj(dt); updHoles(dt,time); updSentry(dt,time);
  // pickups
  for(let i=pickups.length-1;i>=0;i--){
    const u=pickups[i]; u.life-=dt; u.m.rotation.y+=dt*3; u.m.position.y=0.8+Math.sin(time*3+i)*0.15;
    u.m.visible=u.life>3||Math.sin(time*20)>0;
    if(Math.hypot(u.m.position.x-pp.x,u.m.position.z-pp.z)<1.3&&Math.abs(pp.y+0.8-u.m.position.y)<1.5){
      P.hp=Math.min(P.maxHp,P.hp+25); updHP(); sfx('pickup'); vib(30); emit(u.m.position,25,0x00ff88,4,0.6,0.3);
      scene.remove(u.m); pickups.splice(i,1); continue; }
    if(u.life<=0){ scene.remove(u.m); pickups.splice(i,1); }
  }
  // waves
  if(waveBreak>0){ waveBreak-=dt; if(waveBreak<=0) startWave(); }
  else if(toSpawn>0){ spawnT-=dt; if(spawnT<=0&&(enemies.length-enemies.filter(o=>o.key==='mite').length)<Math.min(5+wave,12)){ spawnEnemy(introQ.length?introQ.shift():pickType()); toSpawn--; spawnT=rand(0.6,1.6)*Math.max(0.4,1-wave*0.05); updScore(); } }
  else if(enemies.length===0) waveClear();
  if(comboT>0){ comboT-=dt; if(comboT<=0){ combo=0; $('combo').style.opacity=0; } }
  hitT-=dt; $('hitm').style.opacity=hitT>0?1:0;
  if(pendingLv>0&&state==='play') openUpgrade();
}
function updateWorld(dt,time){
  if(mapUpd) mapUpd(dt,time);
  updateParticles(dt);
  for(let i=fxRings.length-1;i>=0;i--){ const f=fxRings[i]; f.life-=dt; const r=1-f.life/f.max;
    f.m.scale.setScalar(0.2+r*f.size); f.m.material.opacity=1-r; f.m.lookAt(camera.position);
    if(f.life<=0){ scene.remove(f.m); f.m.material.dispose(); fxRings.splice(i,1); } }
  for(const t of tracers){ if(t.life>0){ t.life-=dt; t.m.material.opacity=Math.max(0,t.life/(t.mx||0.06))*(t.op===undefined?1:t.op); if(t.life<=0) t.m.visible=false; } }
  skinLive(time);
}

/* ================= GAME FLOW ================= */
const locked=()=>document.pointerLockElement===renderer.domElement;
let noLock=false, mouseX=-1, mouseY=-1;   // noLock = เบราว์เซอร์ล็อกเมาส์ไม่ได้ → ใช้โหมดเมาส์แบบไม่ล็อก
function lockPointer(){
  try{ const p=renderer.domElement.requestPointerLock(); if(p&&p.catch) p.catch(()=>{ noLock=true; }); }catch(e){ noLock=true; }
  if(!renderer.domElement.requestPointerLock) noLock=true;
  setTimeout(()=>{ if(state==='play'&&!S.touchUI&&!locked()) noLock=true; },700);
}
document.addEventListener('pointerlockerror',()=>{ noLock=true; });
// ตรวจจับอุปกรณ์ป้อนข้อมูลอัตโนมัติ: ขยับ/คลิกเมาส์ → ปิดปุ่มสัมผัส, แตะนิ้ว → เปิดปุ่มสัมผัส
function setInputMode(touch){ if(S.touchUI===touch) return; S.touchUI=touch; document.body.classList.toggle('touch',touch); if(touch){ noLock=false; firing=false; aiming=false; } }
addEventListener('pointerdown',e=>{ if(e.pointerType==='mouse') setInputMode(false); else if(e.pointerType==='touch'&&isTouch) setInputMode(true); },{passive:true,capture:true});
addEventListener('pointermove',e=>{ if(e.pointerType==='mouse'&&state!=='play') setInputMode(false); },{passive:true});
function showScreen(id){ ['menuScr','pauseScr','reviveScr','overScr','setScr','wpnScr','upScr','skinScr','invScr','mapScr'].forEach(s=>$(s).classList.toggle('show',s===id)); }
/* ล้างเอฟเฟกต์ที่ค้างทั้งหมด: อนุภาค · วงแหวน · เส้นกระสุน · วงเตือน · ตัวเลขลอย · ตัวชี้ทิศ */
function clearFX(){
  pLife.fill(0); pPos.fill(-999); pCol.fill(0); pGeo.attributes.position.needsUpdate=true; pGeo.attributes.color.needsUpdate=true;
  for(const f of fxRings){ scene.remove(f.m); f.m.material.dispose(); } fxRings.length=0;
  for(const t of tracers){ t.life=0; t.m.visible=false; }
  for(const k in decPool) for(const d of decPool[k]) decFree(d);
  for(const d of dmPool){ d.life=0; d.m.visible=false; }
  for(const d of slashPool){ d.life=0; d.m.visible=false; }
  dnReset(); ddReset();
}
function clearWorld(){
  clearPProj(); spinT=0; clearShells(); clearFX();
  enemies.forEach(e=>disposeEnemy(e)); enemies.length=0;
  projs.forEach(p=>scene.remove(p.g)); projs.length=0;
  pickups.forEach(u=>scene.remove(u.m)); pickups.length=0;
}
function withLoading(fn){
  const L=$('loading'); L.classList.add('on');
  requestAnimationFrame(()=>setTimeout(()=>{ try{ fn(); } finally{ L.classList.remove('on'); } },30));
}
function startGame(){
  sanitizeRank();
  initAudio();
  if(curMap!==selMap){ if($('loading').classList.contains('on')) return; withLoading(startGame2); } else startGame2();
}
function startGame2(){
  try{ localStorage.setItem('ns_map',selMap); }catch(e){} applyMenuTheme(selMap);
  initAudio(); if(curMap!==selMap) buildMap(selMap); setAcoustics(curMap); clearWorld(); resetUpg(); selW=selP; gunAmmo={}; curUI=1; prevUI=1; recalc(); ensureGun(selS); setWeaponModel(selW);
  dnReset(); ddReset(); hpT=0; slOn=false; AU.mp=1; AU.mr=1;
  SKILLS.forEach(s=>s.t=0); tsT=ocT=invulnT=barrierT=0; barrierHp=0; barrierMesh.visible=false; runGold=0; revives=0; rvConfirm=false; swingT=0; mcT=0; mcN=0; slideT=0; slideCD=0; poundCD=0; pounding=false; airJumped=false; landA=0; camRoll=0; heavyCD=0; qmT=0; qmCD=0; lungeT=0; heavyHitT=0; mHoldPrev=false; updGold(); updSkillHUD();
  { const sp=MAPS[curMap].spawn||{x:0,z:0,yaw:0}; Object.assign(P,{yaw:sp.yaw||0,pitch:0,hp:P.maxHp,onGround:true}); P.pos.set(sp.x||0,MAPS[curMap].spawnY,sp.z||0); if(mapStart) mapStart(); } P.vel.set(0,0,0);
  ammo=MAG; reloading=false; firing=false; aiming=false; sprintT=false; updToggles();
  fireCD=0; cycleT=0; introQ.length=0; hideScope(); burstLeft=0; semiLatch=false; shotIdx=0; idleT=0; mech('init'); updMechHUD();
  lvl=1; xp=0; xpNeed=needFor(1); pendingLv=0; updXP(); $('wName').textContent='[1] '+W.name;
  score=0; kills=0; wave=0; toSpawn=0; combo=0; comboT=0; waveBreak=1.2; vigA=0; shake=0;
  camera.fov=S.fov; camera.updateProjectionMatrix();
  updHP(); updAmmo(); updScore();
  state='play'; gun.visible=true; document.body.classList.add('playing'); showScreen(null);
  if(S.touchUI){ try{ document.documentElement.requestFullscreen?.().catch(()=>{}); }catch(e){} }
  else lockPointer();
}
function pause(){ if(state!=='play') return; state='pause'; chargeV=0; chargeRdy=false; beamSnd(false); flameSnd(false); firing=false; aiming=false; joy.x=joy.y=0; updToggles(); hideScope(); showScreen('pauseScr'); if(locked()) document.exitPointerLock(); }
function resume(){ state='play'; showScreen(null); if(!S.touchUI) lockPointer(); }
let revives=0, rvConfirm=false;
function gameOver(){
  state='over'; firing=false; aiming=false; hideScope(); if(locked()) document.exitPointerLock();
  if(revives<3){ rvConfirm=false; showRevive(); vib([100,50]); return; }
  finishOver();
}
function showRevive(){
  const left=3-revives, can=gold>=100;
  $('rvInfo').innerHTML=rvConfirm?`<b style="color:#ffd166">แน่ใจหรือไม่?</b> จะใช้ 100 🪙 เพื่อคืนชีพ (เหลือ ${left}/3 ครั้ง)`:`คืนชีพได้อีก <b>${left}/3</b> ครั้งในเกมนี้ · ทองของคุณ <b style="color:#ffd166">${gold.toLocaleString()} 🪙</b>${can?'':'<br><span style="color:#ff6b6b">ทองไม่พอ (ต้องใช้ 100 🪙)</span>'}`;
  const b=$('bRevive'); b.textContent=rvConfirm?'✔ ยืนยัน คืนชีพ':'💖 คืนชีพ (100 🪙)'; b.disabled=!can; b.style.opacity=can?'':'0.45';
  $('bRvNo').textContent=rvConfirm?'ยกเลิก':'ไม่คืนชีพ (จบเกม)';
  showScreen('reviveScr');
}
function doRevive(){
  if(state!=='over'||revives>=3) return;
  if(!rvConfirm){ rvConfirm=true; showRevive(); return; }
  if(gold<100){ rvConfirm=false; showRevive(); return; }
  gold-=100; saveGold(); updGold(); revives++; rvConfirm=false;
  P.hp=P.maxHp; invulnT=3; vigA=0; hurtK=0; updHP();
  state='play'; showScreen(null); if(!S.touchUI) lockPointer();
  banner('คืนชีพ!','ใช้ 100 🪙 · เหลือ '+(3-revives)+'/3 ครั้ง · อมตะ 3 วินาที'); sfx('pickup'); vib([40,40,80]);
}
function noRevive(){
  if(rvConfirm){ rvConfirm=false; showRevive(); return; }
  finishOver();
}
function finishOver(){
  state='over'; firing=false; hideScope(); if(locked()) document.exitPointerLock();
  const best=Math.max(score,+localStorage.getItem('ns_best')||0); localStorage.setItem('ns_best',best); try{ const bk='ns_best_'+curMap; localStorage.setItem(bk,Math.max(score,+localStorage.getItem(bk)||0)); }catch(e){}
  $('overStats').innerHTML=`ความยาก: <b style="color:${DIFF.col}">${DIFF.th}</b> (เงิน ×${DIFF.gold})<br>คะแนน: <b>${score.toLocaleString()}</b><br>ถึงเวฟ: <b>${wave}</b> · กำจัด: <b>${kills}</b><br>เลเวล: <b>${lvl}</b> · อาวุธ: <b>${W.name}</b><br>ทองที่เก็บได้รอบนี้: <b>+${runGold.toLocaleString()} 🪙</b><br>สถิติสูงสุด: <b>${best.toLocaleString()}</b>`;
  vib([100,50,200]); showScreen('overScr');
}
function toMenu(){ state='menu'; selW=selP; clearWorld(); hideScope(); gun.visible=false; document.body.classList.remove('playing'); $('lowhp').classList.remove('on'); showScreen('menuScr'); updBest(); }
function updBest(){ const b=+localStorage.getItem('ns_best')||0; $('bestT').textContent=b?'สถิติสูงสุด: '+b.toLocaleString():''; updGold(); }

/* ================= SETTINGS UI ================= */
const SET_UI=[
  {tab:'ภาพ',items:[
    {k:'quality',type:'select',label:'คุณภาพกราฟิก',opts:[['min','ต่ำที่สุด (ไม่มีแสง/เงา/บลูม)'],['low','ต่ำ (ลื่นสุด)'],['med','กลาง'],['high','สูง'],['ultra','สูงสุด']]},
    {k:'res',type:'range',label:'ความละเอียด %',min:40,max:100,step:5},
    {k:'shadows',type:'check',label:'เงา'},
    {k:'bloom',type:'check',label:'แสงเรือง (Bloom)'},
    {k:'rain',type:'check',label:'ฝนตก'},
    {k:'fov',type:'range',label:'มุมมอง (FOV)',min:60,max:110,step:1},
    {k:'fps',type:'check',label:'แสดง FPS'},
    {k:'dmgNum',type:'check',label:'ตัวเลขดาเมจลอย'},
    {k:'hitPause',type:'check',label:'หยุดเกมสั้นๆ ตอนสังหารหนัก/ฟันโดน'},
    {k:'slowmo',type:'check',label:'สโลว์โมชั่นตอนกำจัดศัตรูตัวสุดท้ายของเวฟ'},
    {k:'dmgDir',type:'check',label:'ตัวชี้ทิศทางที่โดนยิง'}]},
  {tab:'แสง',items:[
    {k:'exposure',type:'range',label:'ความสว่างภาพ',min:0.4,max:2.2,step:0.05},
    {k:'light',type:'range',label:'ความแรงแสงไฟ',min:0.2,max:2.5,step:0.05},
    {k:'bloomStr',type:'range',label:'ความเรืองแสง',min:0,max:2.5,step:0.05},
    {k:'fog',type:'range',label:'หมอก',min:0,max:2.5,step:0.05}]},
  {tab:'เสียง',items:[
    {k:'master',type:'range',label:'เสียงรวม',min:0,max:100,step:1},
    {k:'sfx',type:'range',label:'เสียงเอฟเฟกต์ (รวม)',min:0,max:100,step:1},
    {k:'gunVol',type:'range',label:'เสียงยิงปืนของเรา',min:0,max:100,step:1},
    {k:'enemyVol',type:'range',label:'เสียงมอนเตอร์ตอนยิง/โจมตี',min:0,max:100,step:1},
    {k:'meleeVol',type:'range',label:'เสียงฟัน',min:0,max:100,step:1},
    {k:'hurtVol',type:'range',label:'เสียงโดนโจมตี',min:0,max:100,step:1},
    {k:'music',type:'range',label:'เพลงประกอบ',min:0,max:100,step:1},
    {k:'amb',type:'range',label:'เสียงบรรยากาศ',min:0,max:100,step:1}]},
  {tab:'ควบคุม',items:[
    {k:'sens',type:'range',label:'ความไวการหัน',min:0.2,max:3,step:0.05},
    {k:'viewFx',type:'range',label:'ความแรงการสั่น/โยกของมุมมอง (%)',min:0,max:100,step:1},
    {k:'vibrate',type:'check',label:'ระบบสั่น'+(navigator.vibrate?'':' (เครื่องนี้ไม่รองรับ)')},
    {k:'touchUI',type:'check',label:'ปุ่มสัมผัสบนจอ'},
    {type:'button',label:'ปรับแต่งตำแหน่ง/ขนาดปุ่ม',action:()=>openEditor(setReturn)},
    {type:'button',get label(){ return 'ชุดปุ่มที่ใช้: ชุด '+LSLOT+' (แตะเพื่อสลับ 1→2→3)'; },action:()=>{ setLSlot(LSLOT%3+1); buildSettings(); }}]},
];
let curTab=0;
function buildSettings(){
  const tabs=$('tabs'); tabs.innerHTML='';
  SET_UI.forEach((sec,i)=>{ const b=document.createElement('button'); b.className='tab'+(i===curTab?' on':''); b.textContent=sec.tab;
    b.onclick=()=>{ curTab=i; buildSettings(); }; tabs.appendChild(b); });
  const body=$('setBody'); body.innerHTML='';
  SET_UI[curTab].items.forEach(it=>{
    const row=document.createElement('div'); row.className='row';
    if(it.type==='button'){ const b=document.createElement('button'); b.className='sbtn hl'; b.style.width='100%'; b.textContent=it.label; b.onclick=it.action; row.appendChild(b); body.appendChild(row); return; }
    const lab=document.createElement('label'); lab.textContent=it.label; row.appendChild(lab);
    if(it.type==='range'){
      const w=document.createElement('div'); w.style.cssText='display:flex;align-items:center;gap:8px;flex:1;max-width:60%';
      const r=document.createElement('input'); r.type='range'; r.min=it.min; r.max=it.max; r.step=it.step; r.value=S[it.k];
      const v=document.createElement('span'); v.className='val'; v.textContent=S[it.k];
      r.oninput=()=>{ S[it.k]=parseFloat(r.value); v.textContent=r.value; applySettings(); if(it.k==='sfx') sfx('hit'); };
      w.append(r,v); row.appendChild(w);
    } else if(it.type==='check'){
      const c=document.createElement('input'); c.type='checkbox'; c.checked=S[it.k];
      c.onchange=()=>{ S[it.k]=c.checked; applySettings(); if(it.k==='vibrate'&&c.checked) vib(80); }; row.appendChild(c);
    } else if(it.type==='select'){
      const s=document.createElement('select'); it.opts.forEach(([v,t])=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; s.appendChild(o); });
      s.value=S[it.k]; s.onchange=()=>{ S[it.k]=s.value; applySettings(); }; row.appendChild(s);
    }
    body.appendChild(row);
  });
}
let lastPR=0;
function applySettings(){
  const q={min:{pr:0.5,sm:256},low:{pr:0.75,sm:512},med:{pr:1,sm:1024},high:{pr:1.5,sm:2048},ultra:{pr:2,sm:4096}}[S.quality]||{pr:1,sm:1024};
  const pr=Math.min(devicePixelRatio,q.pr)*S.res/100;
  if(pr!==lastPR){ lastPR=pr; renderer.setPixelRatio(pr); composer.setPixelRatio(pr); onResize(); }
  if(moon.shadow.mapSize.x!==q.sm){ moon.shadow.mapSize.set(q.sm,q.sm); if(moon.shadow.map){ moon.shadow.map.dispose(); moon.shadow.map=null; } }
  const shOn=S.shadows&&S.quality!=='min';
  if(renderer.shadowMap.enabled!==shOn){ renderer.shadowMap.enabled=shOn; scene.traverse(o=>{ if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true); }); }
  renderer.toneMappingExposure=S.exposure;
  refreshMapEnv(); applyMinMode();
  if(state!=='play'){ camera.fov=S.fov; camera.updateProjectionMatrix(); }
  $('fps').style.display=S.fps?'block':'none';
  document.body.classList.toggle('touch',S.touchUI);
  applyVolumes(); saveS();
}
function openSettings(from){ setReturn=from; buildSettings(); showScreen('setScr'); }

/* ================= UI EDITOR ================= */
let selCtl='fire', drag=null;
function applyLayout(){
  CTRL_IDS.forEach(id=>{ const el=$('c_'+id), c=L[id]; el.style.left=c.x+'%'; el.style.top=c.y+'%'; el.style.width=el.style.height=c.s+'px'; el.style.fontSize=Math.max(11,c.s*0.2)+'px'; });
  $('controls').style.opacity=L.op/100;
}
function selectCtl(id){ selCtl=id; CTRL_IDS.forEach(i=>$('c_'+i).classList.toggle('sel',i===id)); $('ebSel').textContent=CTRL_NAMES[id];
  $('ebSize').value=L[id].s; $('ebSizeV').textContent=L[id].s+'px'; $('ebOp').value=L.op; $('ebOpV').textContent=L.op+'%'; }
function openEditor(from){ editReturn=from; editing=true; document.body.classList.add('editing'); showScreen(null); applyLayout(); refreshFmBtn(); selectCtl(selCtl); }
function closeEditor(){ editing=false; drag=null; document.body.classList.remove('editing'); CTRL_IDS.forEach(i=>$('c_'+i).classList.remove('sel')); saveL(); refreshFmBtn(); showScreen(editReturn==='pause'?'pauseScr':'menuScr'); }
CTRL_IDS.forEach(id=>{ const el=$('c_'+id);
  el.addEventListener('pointerdown',e=>{ if(!editing) return; e.preventDefault(); e.stopImmediatePropagation(); selectCtl(id);
    drag={id,pid:e.pointerId,ox:e.clientX-L[id].x/100*innerWidth,oy:e.clientY-L[id].y/100*innerHeight}; el.setPointerCapture(e.pointerId); });
});
addEventListener('pointermove',e=>{ if(!drag||e.pointerId!==drag.pid) return;
  L[drag.id].x=clamp((e.clientX-drag.ox)/innerWidth*100,2,98); L[drag.id].y=clamp((e.clientY-drag.oy)/innerHeight*100,2,98); applyLayout(); });
addEventListener('pointerup',e=>{ if(drag&&e.pointerId===drag.pid) drag=null; });
$('ebSize').oninput=e=>{ L[selCtl].s=+e.target.value; $('ebSizeV').textContent=L[selCtl].s+'px'; applyLayout(); };
$('ebOp').oninput=e=>{ L.op=+e.target.value; $('ebOpV').textContent=L.op+'%'; applyLayout(); };
$('ebReset').onclick=()=>{ L=JSON.parse(JSON.stringify(DEF_L)); applyLayout(); selectCtl(selCtl); };
$('ebDone').onclick=closeEditor;
document.querySelectorAll('#ebSlots .lsb').forEach(b=>b.onclick=()=>setLSlot(+b.dataset.n)); refreshLSlotUI();

/* ================= TOUCH CONTROLS ================= */
const lookEl=$('look'), joyEl=$('c_joy'), knob=$('knob'), fireEl=$('c_fire');
function applyLook(dx,dy,k){ const s=k*S.sens*(1-(W.aimSens||0.5)*aimLerp); P.yaw-=dx*s; P.pitch-=dy*s; P.pitch=clamp(P.pitch,-1.5,1.5); swayX=clamp(swayX-dx*0.00025,-0.03,0.03); swayY=clamp(swayY+dy*0.00025,-0.03,0.03); }
let joyId=null;
function updJoy(e){ const r=joyEl.getBoundingClientRect(), max=r.width/2; let dx=e.clientX-(r.left+max), dy=e.clientY-(r.top+max); const d=Math.hypot(dx,dy);
  if(d>max){ dx*=max/d; dy*=max/d; } joy.x=dx/max; joy.y=dy/max; knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`; }
joyEl.addEventListener('pointerdown',e=>{ if(editing||state!=='play') return; e.preventDefault(); e.stopPropagation(); joyId=e.pointerId; joyEl.setPointerCapture(e.pointerId); updJoy(e); });
joyEl.addEventListener('pointermove',e=>{ if(e.pointerId===joyId) updJoy(e); });
const endJoy=e=>{ if(e.pointerId!==joyId) return; joyId=null; joy.x=joy.y=0; knob.style.transform='translate(-50%,-50%)'; };
joyEl.addEventListener('pointerup',endJoy); joyEl.addEventListener('pointercancel',endJoy);
let lookId=null, lx=0, ly=0;
// โซนปัดหมุนมุมมองใช้ได้เฉพาะฝั่งตรงข้ามจอยเดิน (45% ของจอฝั่งจอยจะไม่ตอบสนองการหมุนเลย)
function inDeadZone(x){ const r=joyEl.getBoundingClientRect(), left=(r.left+r.width/2)<innerWidth/2, zone=innerWidth*0.45; return left?x<zone:x>innerWidth-zone; }
lookEl.addEventListener('pointerdown',e=>{ if(editing||state!=='play'||lookId!==null) return; if(inDeadZone(e.clientX)) return; lookId=e.pointerId; lx=e.clientX; ly=e.clientY; lookEl.setPointerCapture(e.pointerId); });
lookEl.addEventListener('pointermove',e=>{ if(e.pointerId!==lookId) return; applyLook(e.clientX-lx,e.clientY-ly,0.0055); lx=e.clientX; ly=e.clientY; });
const endLook=e=>{ if(e.pointerId===lookId) lookId=null; };
lookEl.addEventListener('pointerup',endLook); lookEl.addEventListener('pointercancel',endLook);
let fireId=null, fx0=0, fy0=0;
fireEl.addEventListener('pointerdown',e=>{ if(editing||state!=='play') return; e.preventDefault(); fireId=e.pointerId; fx0=e.clientX; fy0=e.clientY; fireEl.setPointerCapture(e.pointerId); firing=true; sprintT=false; updToggles(); fireEl.classList.add('active'); });
fireEl.addEventListener('pointermove',e=>{ if(e.pointerId!==fireId) return; applyLook(e.clientX-fx0,e.clientY-fy0,0.0045); fx0=e.clientX; fy0=e.clientY; });
const endFire=e=>{ if(e.pointerId!==fireId) return; fireId=null; firing=false; fireEl.classList.remove('active'); };
fireEl.addEventListener('pointerup',endFire); fireEl.addEventListener('pointercancel',endFire);
function tapBtn(id,fn){ const el=$('c_'+id); el.addEventListener('pointerdown',e=>{ if(editing||state!=='play') return; e.preventDefault(); fn(); el.classList.add('active'); setTimeout(()=>updToggles(),120); }); }
tapBtn('jump',jump); tapBtn('reload',startReload);
tapBtn('aim',()=>{ if(slot===2) return; if(W.zoom2&&aiming){ if(zoomLvl===0) zoomLvl=1; else { zoomLvl=0; aiming=false; } } else { aiming=!aiming; if(aiming) sprintT=false; } });
tapBtn('sprint',()=>{ sprintT=!sprintT; if(sprintT) aiming=false; });
tapBtn('swap',()=>uiSlot(curUI%3+1)); tapBtn('inspect',inspect); tapBtn('qmelee',quickMelee); tapBtn('slide',slideOrPound);
tapBtn('fm',toggleFireMode);
tapBtn('sk1',()=>useSkill(0)); tapBtn('sk2',()=>useSkill(1)); tapBtn('sk3',()=>useSkill(2)); tapBtn('sk4',()=>useSkill(3)); tapBtn('sk5',()=>useSkill(4));
function updToggles(){ $('c_aim').classList.toggle('active',aiming); $('c_sprint').classList.toggle('active',sprintT); ['c_jump','c_reload','c_swap','c_fm','c_sk1','c_sk2','c_sk3','c_sk4','c_sk5','c_inspect','c_qmelee','c_slide'].forEach(i=>$(i).classList.remove('active')); }
$('pauseBtn').addEventListener('pointerdown',e=>{ e.preventDefault(); pause(); });

/* ================= KEYBOARD / MOUSE ================= */
addEventListener('keydown',e=>{ keys[e.code]=true;
  if(state==='play'){ if(e.code==='Space'){ if(!e.repeat) jump(); e.preventDefault(); } if(e.code==='KeyR') startReload(); if(e.code==='KeyP'||(e.code==='Escape'&&noLock)) pause();
    if(e.code==='KeyN') toggleFireMode(); if(e.code==='KeyB') useSkill(4); if(!e.repeat){ if(e.code==='KeyG') inspect(); if(e.code==='KeyT') quickMelee(); if(e.code==='KeyX') slideOrPound(); } if(e.code==='KeyZ') zoomToggle();
    if(e.code==='Digit1') uiSlot(1); if(e.code==='Digit2') uiSlot(2); if(e.code==='Digit3') uiSlot(3); if(e.code==='KeyQ') uiSlot(prevUI);
    if(e.code==='KeyE') useSkill(0); if(e.code==='KeyF') useSkill(1); if(e.code==='KeyC') useSkill(2); if(e.code==='KeyV') useSkill(3); }
  else if(state==='pause'&&e.code==='KeyP') resume();
  else if(state==='upgrade'&&/^Digit[1-3]$/.test(e.code)){ const u=upPicks[+e.code[5]-1]; if(u) pickUpgrade(u.id); } });
addEventListener('keyup',e=>{ keys[e.code]=false; });
addEventListener('mousedown',e=>{ if(state!=='play'||S.touchUI||(!locked()&&!noLock)) return; if(e.button===3||e.button===4){ e.preventDefault(); quickMelee(); return; } if(e.button===0) firing=true; if(e.button===2) aiming=true; });
addEventListener('mouseup',e=>{ if(e.button===0&&!S.touchUI) firing=false; if(e.button===2) aiming=false; });
addEventListener('mousemove',e=>{ mouseX=e.clientX; mouseY=e.clientY; if(state==='play'&&!S.touchUI&&(locked()||noLock)) applyLook(e.movementX,e.movementY,0.0022); });
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('wheel',e=>{ if(state==='play'&&!S.touchUI) zoomToggle(); },{passive:true});
renderer.domElement.addEventListener('click',()=>{ if(state==='play'&&!S.touchUI&&!locked()&&!noLock) lockPointer(); });
document.addEventListener('pointerlockchange',()=>{ if(locked()) noLock=false; else if(state==='play'&&!S.touchUI&&!noLock) pause(); });
document.addEventListener('visibilitychange',()=>{ if(document.hidden) pause(); });
addEventListener('pointerdown',()=>initAudio(),{once:false,passive:true});
addEventListener('keydown',()=>initAudio(),{once:true});

/* ================= BUTTONS ================= */
function buildDiff(){
  const bar=$('diffBar'); bar.innerHTML='';
  Object.values(DIFFS).forEach(d=>{ const b=document.createElement('button'); b.className='tab'+(d===DIFF?' on':''); b.textContent=d.th; b.style.color=d.col;
    b.onclick=()=>{ DIFF=d; try{ localStorage.setItem('ns_diff',d.id); }catch(e){} buildDiff(); }; bar.appendChild(b); });
  $('diffDesc').innerHTML='<span style="color:'+DIFF.col+'">'+DIFF.th+'</span> — '+DIFF.desc;
}
buildDiff();
/* ธีมหน้าเมนูตามแมพล่าสุดที่เลือก/เล่น (ns_map): สีหัวข้อ/ปุ่ม/พื้นหลัง + ชื่อแมพภาษาอังกฤษและคำอธิบายไทย — แก้สีที่ตารางนี้ [สี1, สี2, สีพื้นหลัง] */
const MENU_TH={rain:['#00e5ff','#ff2bd6','10,10,50'],desert:['#ffd27a','#ff7a3d','60,36,10'],apoc:['#ff6a3a','#ffb000','56,18,8'],frost:['#7fe9ff','#b26bff','8,30,52'],
  jungle:['#6aff7a','#ffd24a','10,44,20'],orbital:['#9fb8ff','#ff6ad9','14,16,60'],foundry:['#c8ff00','#ff8a00','40,36,6'],metro:['#40e0d0','#ffd166','8,38,40'],testyard:['#2affc8','#ffd24a','10,40,56']};
function applyMenuTheme(id){
  const th=MENU_TH[id]||MENU_TH.rain, m=MAPS[id]||MAPS.rain, st=document.documentElement.style;
  st.setProperty('--m1',th[0]); st.setProperty('--m2',th[1]); st.setProperty('--m1l',th[0]); st.setProperty('--m2g',th[1]+'99'); st.setProperty('--m2g2',th[1]+'59'); st.setProperty('--mbg','rgba('+th[2]+',.5)');
  $('menuSub').textContent=[...m.name].map(ch=>ch===' '?'\u00a0':ch).join(' ');
  $('menuMapTh').textContent=m.th||'';
}
applyMenuTheme(selMap);
$('bStart').onclick=openMaps; $('bRevive').onclick=doRevive; $('bRvNo').onclick=noRevive; $('bRetry').onclick=startGame; $('bRetryW').onclick=openMaps; $('bMapGo').onclick=openWeapons; $('bMapBack').onclick=toMenu; $('bGo').onclick=startGame; $('bWBack').onclick=toMenu;
$('bResume').onclick=resume; $('bQuit').onclick=toMenu; $('bQuit2').onclick=toMenu;
$('bSet1').onclick=()=>openSettings('menu'); $('bSet2').onclick=()=>openSettings('pause');
$('bEdit1').onclick=()=>openEditor('menu'); $('bEdit2').onclick=()=>openEditor('pause');
$('bGacha').onclick=openGacha; $('bInv').onclick=openInv; $('bRoll').onclick=rollSkin;
$('bUnlock').onclick=()=>RK.openRankUI();
RK.onRankChange(()=>{ try{ updRankBadge(); sanitizeRank(); if($('wpnScr').classList.contains('show')){ buildWeaponCards(); buildMeleeCards(); } if($('mapScr').classList.contains('show')) buildMapCards(); buildSkillBar(); }catch(e){} });
$('bGB').onclick=toMenu; $('bIB').onclick=toMenu; $('bInv2').onclick=openInv;
$('bSetBack').onclick=()=>showScreen(setReturn==='pause'?'pauseScr':'menuScr');
$('bSetReset').onclick=()=>{ S={...DEF}; buildSettings(); applySettings(); };


/* ================= SKIN GACHA / INVENTORY ================= */
let rolling=false;
function updRollBtn(){ $('bRoll').disabled=gold<25||rolling; }
/* ระบบการันตี (ns_pity): a = ครั้งที่สุ่มไม่ได้ e+ ติดกัน (ครบ 20 → ครั้งที่ 20 ได้ e/l แน่นอน) · b = ครั้งที่สุ่มไม่ได้ l ติดกัน (ครบ 60 → ครั้งที่ 60 ได้ l แน่นอน) */
const PITY_E=20, PITY_L=60;
let PITY={a:0,b:0};
try{ const p=JSON.parse(localStorage.getItem('ns_pity')||'null'); if(p&&typeof p==='object') PITY={a:Math.max(0,Math.min(PITY_E-1,+p.a||0)),b:Math.max(0,Math.min(PITY_L-1,+p.b||0))}; }catch(e){}
const savePity=()=>{ try{ localStorage.setItem('ns_pity',JSON.stringify(PITY)); }catch(e){} };
function updPity(){ const el=$('pityT'); if(el) el.innerHTML=`การันตี: มหาหายากขึ้นไปใน <b>${PITY_E-PITY.a}</b> ครั้ง · ตำนานใน <b>${PITY_L-PITY.b}</b> ครั้ง (สุ่มได้แล้ว ${SO.length-1}/${SKINS.length-1} แบบ)`; }
function openGacha(){ updGold(); $('gcMsg').textContent=''; $('reel').textContent='???'; $('reel').style.color='#7fe9ff'; $('rollRes').innerHTML=''; updRollBtn(); updPity(); showScreen('skinScr'); }
function pickSkin(minRar){   // เลือกระดับตามอัตรา 60/28/10/2 ก่อน แล้วสุ่มสม่ำเสมอในระดับนั้น (การันตีจำกัดระดับขั้นต่ำ)
  const rs=minRar==='l'?['l']:minRar==='e'?['e','l']:['c','r','e','l'];
  let tw=0; rs.forEach(k=>tw+=RAR[k].w); let rl=Math.random()*tw, rk=rs[0];
  for(const k of rs){ if((rl-=RAR[k].w)<=0){ rk=k; break; } }
  const pool=SKINS.filter(s=>!s.def&&s.r===rk); return pool[Math.random()*pool.length|0];
}
function rollSkin(){ if(!RK.canGacha()){ rankLockMsg('protecter'); return; }
  if(rolling||gold<25) return;
  gold-=25; saveGold(); updGold();
  const pool=SKINS.filter(s=>!s.def);
  const guarL=PITY.b>=PITY_L-1, guarE=PITY.a>=PITY_E-1;
  const pick=pickSkin(guarL?'l':guarE?'e':null);
  PITY.a=(pick.r==='e'||pick.r==='l')?0:PITY.a+1; PITY.b=pick.r==='l'?0:PITY.b+1; savePity();
  rolling=true; updRollBtn(); $('rollRes').innerHTML='';
  const reel=$('reel'); let n=0;
  const iv=setInterval(()=>{
    n++; const s2=pool[Math.random()*pool.length|0];
    reel.textContent=s2.n; reel.style.color=RAR[s2.r].col; if(n%2) sfx('beep',60);
    if(n>=16){ clearInterval(iv);
      reel.textContent=pick.n; reel.style.color=RAR[pick.r].col;
      const dup=SO.includes(pick.id); let msg;
      if(dup){ const rf=RAR[pick.r].ref; gold+=rf; saveGold(); msg='ได้สกินซ้ำ — คืนทอง +'+rf+' 🪙'; }
      else { SO.push(pick.id); try{ localStorage.setItem('ns_skins_owned',JSON.stringify(SO)); }catch(e){} msg='สกินใหม่! สวมใส่ได้ในคลังสกิน'; }
      if(guarL||guarE) msg+=' (การันตี)';
      updGold(); updPity();
      $('rollRes').innerHTML=`<div class="wcard skcard ${pick.r}" style="margin:10px auto;cursor:default"><div class="swatch" style="background:${swCSS(pick)}"></div><h3>${pick.n}</h3><div class="rar" style="color:${RAR[pick.r].col}">${RAR[pick.r].th}</div><div class="desc">${msg}</div></div>`;
      sfx(dup?'pickup':'gacha'); vib([40,40,80]);
      rolling=false; updRollBtn();
    }
  },85);
}
let invGun='ar';
function openInv(){ invGun=selP; buildInv(); showScreen('invScr'); }
let invRar='all', invQG='', invQS='', invOwnOnly=false, invPrevId=null;
const RAR_TABS=[['all','ทั้งหมด'],['c','ทั่วไป'],['r','หายาก'],['e','มหาหายาก'],['l','ตำนาน']];
function skinPrev(sk){   // ตัวอย่างสี: ไล่สี + เท็กซ์เจอร์จริง + แถบนีออน (ไม่ต้องมีสกิน)
  const c=$('invPrevC'), g=c.getContext('2d'), w=c.width, h=c.height;
  const gr=g.createLinearGradient(0,0,w,0); gr.addColorStop(0,hx6(sk.c1)); gr.addColorStop(.6,hx6(sk.c2)); gr.addColorStop(1,hx6(sk.c2)); g.fillStyle=gr; g.fillRect(0,0,w,h);
  if(sk.tex){ const nt=NEWTEX.has(sk.tex); const im=(nt?skinTex(sk.tex,sk.c1,sk.c2,sk.neon):skinTex(sk.tex,sk.c1,sk.neon)).image; if(im){ g.save(); g.globalAlpha=.9; g.fillStyle=g.createPattern(im,'repeat'); g.fillRect(0,0,w*.8,h*.7); g.restore(); } }
  g.fillStyle=hx6(sk.neon); g.shadowColor=hx6(sk.neon); g.shadowBlur=10; g.fillRect(8,h-14,w*.7,5); g.shadowBlur=0;
}
function buildInv(){
  // แท็บปืนเลื่อนแนวนอนได้ จัดกลุ่มตามหมวด + ค้นหาชื่อปืน
  const tg=$('invGuns'); tg.innerHTML=''; const qg=invQG.trim().toLowerCase();
  CLS_ORDER.forEach(c=>{
    const ids=WORDER.filter(id=>WDEF[id].cls===c&&(!qg||(WDEF[id].th+' '+WDEF[id].name+' '+id).toLowerCase().includes(qg))); if(!ids.length) return;
    const lb=document.createElement('span'); lb.className='grpL'; lb.textContent=CLS_TH[c]; tg.appendChild(lb);
    ids.forEach(id=>{ const b=document.createElement('button'); b.className='tab'+(id===invGun?' on':''); b.textContent=WDEF[id].th; b.onclick=()=>{ invGun=id; buildInv(); }; tg.appendChild(b); });
  });
  const on=tg.querySelector('.tab.on'); if(on&&on.scrollIntoView) try{ on.scrollIntoView({block:'nearest',inline:'center'}); }catch(e){}
  const rb=$('invRar'); rb.innerHTML='';
  RAR_TABS.forEach(([k,t])=>{ const b=document.createElement('button'); b.className='tab'+(invRar===k?' on':''); b.textContent=t; if(k!=='all') b.style.color=RAR[k].col; b.onclick=()=>{ invRar=k; buildInv(); }; rb.appendChild(b); });
  $('invCnt').textContent=`สะสมแล้ว ${SO.length}/${SKINS.length}`;
  const eqId=SEQ[invGun]&&SO.includes(SEQ[invGun])?SEQ[invGun]:'default', qs=invQS.trim().toLowerCase();
  let list=SKINS.filter(sk=>(invRar==='all'||sk.r===invRar)&&(!invOwnOnly||SO.includes(sk.id))&&(!qs||(sk.n+' '+sk.id).toLowerCase().includes(qs)));
  list.sort((a,b)=>(b.id===eqId)-(a.id===eqId)||(SO.includes(b.id)-SO.includes(a.id)));   // ใบที่ใส่อยู่ไว้บนสุด แล้วใบที่มี
  const gr=$('invGrid'); gr.innerHTML='';
  if(!list.length){ gr.innerHTML='<div class="help">ไม่พบสกินที่ตรงกับตัวกรอง</div>'; }
  list.forEach(sk=>{ const own=SO.includes(sk.id), eq=eqId===sk.id;
    const d=document.createElement('div'); d.className='wcard skcard '+sk.r+(own?'':' lock')+(eq?' sel':'');
    d.innerHTML=`<div class="swatch" style="background:${own?swCSS(sk):'#151a26'}"></div><h3>${sk.n}</h3><div class="rar" style="color:${RAR[sk.r].col}">${RAR[sk.r].th}${sk.live?' ✦':''}</div><div class="desc">${own?(eq?'✓ กำลังสวมใส่':'แตะเพื่อสวมใส่'):'ยังไม่มี — แตะดูตัวอย่างสี'}</div>`;
    d.onclick=()=>{ invPrevId=sk.id; showPrev(sk,own);
      if(own){ SEQ[invGun]=sk.id; try{ localStorage.setItem('ns_skin_equipped',JSON.stringify(SEQ)); }catch(e){} if(invGun===selW) applySkin(selW); sfx('pickup'); buildInv(); } };
    gr.appendChild(d); });
  const ps=SKINS.find(k=>k.id===invPrevId); if(ps) showPrev(ps,SO.includes(ps.id)); else $('invPrev').classList.remove('on');
}
function showPrev(sk,own){ $('invPrev').classList.add('on'); skinPrev(sk);
  $('invPrevT').innerHTML=`<b style="color:${RAR[sk.r].col}">${sk.n}</b> · ${RAR[sk.r].th}<br>${own?'มีแล้ว':'ตัวอย่างสี (ยังไม่มีสกินนี้)'}${sk.live?' · มีเอฟเฟกต์เคลื่อนไหว':''}${sk.fx?' · เส้นกระสุน/แฟลช/ประกายสีเฉพาะ':''}`; }
$('invQG').oninput=e=>{ invQG=e.target.value; buildInv(); $('invQG').focus(); };
$('invQS').oninput=e=>{ invQS=e.target.value; buildInv(); $('invQS').focus(); };
$('invOwn').onchange=e=>{ invOwnOnly=e.target.checked; buildInv(); };

/* ================= RESIZE / LOOP ================= */
function onResize(){ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); composer.setSize(innerWidth,innerHeight); }
addEventListener('resize',onResize);
addEventListener('orientationchange',()=>setTimeout(onResize,300));

const clock=new THREE.Clock(); let time=0, fpsT=0, fpsN=0;
/* แนะนำลดคุณภาพอัตโนมัติ: เฉลี่ย FPS จริง 3 วิ (ขณะเล่น) < 30 → ขึ้นแถบถามครั้งเดียวต่อเซสชัน ไม่บังคับ */
const QL=['ultra','high','med','low','min'], QN={ultra:'สูงสุด',high:'สูง',med:'กลาง',low:'ต่ำ',min:'ต่ำที่สุด'};
let qwT=0, qwN=0, qwLast=0, qwShown=false;
function qualWatch(playing){
  const now=performance.now(); const d=now-qwLast; qwLast=now;
  if(!playing||qwShown||d>1500){ qwT=0; qwN=0; return; }   // หยุดนับตอนพัก/แท็บซ่อน/สะดุดใหญ่ (เช่นสลับหน้า)
  qwT+=d; qwN++;
  if(qwT>=3000){ const fps=qwN*1000/qwT; qwT=0; qwN=0;
    const i=QL.indexOf(S.quality); if(fps<30&&i>=0&&i<QL.length-1){ qwShown=true; const nq=QL[i+1];
      $('qHintT').textContent='FPS เฉลี่ย '+Math.round(fps)+' ต่ำ — ลดคุณภาพเป็น "'+QN[nq]+'" ไหม?';
      $('qHintYes').onclick=()=>{ S.quality=nq; applySettings(); $('qHint').classList.remove('on'); qwShown=false; qwT=0; qwN=0; };
      $('qHintNo').onclick=()=>{ $('qHint').classList.remove('on'); };
      $('qHint').classList.add('on'); } }
}
function loop(){
  requestAnimationFrame(loop);
  const dtR=Math.min(clock.getDelta(),0.05); let dt=dtR;
  if(state==='play'){   /* hit-pause / สโลว์โมชั่น คุมเวลาเกมทั้งหมด (ตอนพัก/อัปเกรดรีเซ็ตทิ้ง) */
    if(hpT>0){ hpT-=dtR; dt=dtR*0.03; } else if(slOn){ slE+=dtR; const sc=slE<0.35?0.3:slE<0.7?0.3+0.7*(slE-0.35)/0.35:1; dt=dtR*sc; if(slE>=0.7){ slOn=false; AU.mp=1; AU.mr=1; } else { AU.mp=0.9+0.1*((sc-0.3)/0.7); AU.mr=AU.mp; } } }
  else if(hpT>0||slOn){ hpT=0; slOn=false; AU.mp=1; AU.mr=1; }
  time+=dt;
  if(state==='play') update(dt,time);
  else if(state==='menu'){ const a=time*0.07; camera.position.set(Math.cos(a)*26,8+Math.sin(time*0.3),Math.sin(a)*26); camera.lookAt(0,3,0); }
  updateWorld(dt,time); dnUpdate(dt); ddUpdate(dtR);
  vigA=Math.max(0,vigA-dt*2); $('vig').style.opacity=vigA;
  $('clickHint').classList.toggle('on',state==='play'&&!S.touchUI&&!locked()&&!noLock);
  { const cur=(state==='play'&&!S.touchUI&&(noLock||locked()))?'none':''; if(document.body.style.cursor!==cur) document.body.style.cursor=cur; }
  if(state!=='play'){ if(ARC.on) beamSnd(false); if(FLM.on) flameSnd(false); }
  musicTick();
  if(S.bloom&&S.quality!=='min') composer.render(); else renderer.render(scene,camera);
  qualWatch(state==='play'&&!document.hidden);
  fpsN++; fpsT+=dtR; if(fpsT>0.5){ if(S.fps) $('fps').textContent=Math.round(fpsN/fpsT)+' FPS'; fpsN=0; fpsT=0; }
}
mapReady=true; refreshMapEnv(); buildSkillBar(); applySkin(selW); updGold(); applyLayout(); applySettings(); updBest(); loop();

/* ---- ควบคุมเมนูด้วยคีย์บอร์ด: ลูกศร/WASD เลื่อน · Enter เลือก · Backspace ย้อนกลับ ---- */
const KNAV_SEL='button:not([disabled]),.wcard,#uCards>*,input:not([type=hidden]),select';
let knavEl=null;
function knavScreen(){ const l=[...document.querySelectorAll('.screen.show')].filter(e=>e.offsetParent!==null||getComputedStyle(e).position==='fixed'); return l.length?l[l.length-1]:null; }
function knavList(sc){ return [...sc.querySelectorAll(KNAV_SEL)].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>2&&r.height>2&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[style*="display: none"],[style*="display:none"]'); }); }
function knavSet(e){ if(knavEl) knavEl.classList.remove('kfocus'); knavEl=e; if(e){ e.classList.add('kfocus'); try{ e.scrollIntoView({block:'nearest',inline:'nearest'}); }catch(x){} if(e.tagName==='INPUT'||e.tagName==='SELECT'){ try{ e.focus({preventScroll:true}); }catch(x){} } else if(document.activeElement&&document.activeElement.blur) document.activeElement.blur(); } }
function knavMove(sc,dir){
  const list=knavList(sc); if(!list.length) return;
  if(!knavEl||!list.includes(knavEl)){ knavSet(sc.querySelector('.wcard.sel')&&list.includes(sc.querySelector('.wcard.sel'))?sc.querySelector('.wcard.sel'):(list.find(e=>e.classList.contains('primary'))||list[0])); return; }
  const c=r=>[r.left+r.width/2,r.top+r.height/2], [cx,cy]=c(knavEl.getBoundingClientRect()); let best=null,bs=1e9;
  for(const e of list){ if(e===knavEl) continue; const [x,y]=c(e.getBoundingClientRect()), dx=x-cx, dy=y-cy;
    const main=dir==='R'?dx:dir==='L'?-dx:dir==='D'?dy:-dy, off=(dir==='R'||dir==='L')?Math.abs(dy):Math.abs(dx);
    if(main<6) continue; const sc2=main+off*2.2; if(sc2<bs){ bs=sc2; best=e; } }
  if(best) knavSet(best);
}
function knavBack(sc){
  const id=sc.id, ids={pauseScr:'bResume',overScr:'bQuit2',reviveScr:'bRvNo'}; let b=ids[id]&&document.getElementById(ids[id]);
  if(!b) b=sc.querySelector('#bMapBack,#bWBack,#bGB,#bIB,#bSetBack,[data-a=close]');
  if(!b) b=[...sc.querySelectorAll('button')].find(x=>/^(กลับ|ปิด)/.test(x.textContent.trim()));
  if(b){ knavSet(null); b.click(); return true; } return false;
}
window.addEventListener('keydown',e=>{
  if(state==='play'||editing||e.ctrlKey||e.metaKey||e.altKey) return;
  const sc=knavScreen(); if(!sc) return;
  const ae=document.activeElement, typing=ae&&((ae.tagName==='INPUT'&&/^(text|password|search|number|email|tel)$/.test(ae.type))||ae.tagName==='TEXTAREA');
  const k=e.code, dirMap={ArrowUp:'U',ArrowDown:'D',ArrowLeft:'L',ArrowRight:'R',KeyW:'U',KeyS:'D',KeyA:'L',KeyD:'R'};
  const dir=dirMap[k];
  if(typing){ if(k==='ArrowUp'||k==='ArrowDown'){ e.preventDefault(); knavEl=ae; knavMove(sc,dir); } else if(k==='Enter'){ const f=ae.closest('form'); const pb=f&&f.querySelector('button.primary'); if(pb){ e.preventDefault(); pb.click(); } } return; }
  if(dir){
    const cur=knavEl&&document.contains(knavEl)?knavEl:null;
    if(cur&&cur.tagName==='INPUT'&&cur.type==='range'&&(dir==='L'||dir==='R')){ e.preventDefault(); const st=+cur.step||1; cur.value=String(+cur.value+(dir==='R'?st:-st)); cur.dispatchEvent(new Event('input',{bubbles:true})); cur.dispatchEvent(new Event('change',{bubbles:true})); return; }
    if(cur&&cur.tagName==='SELECT'&&(dir==='L'||dir==='R')){ e.preventDefault(); const i=cur.selectedIndex+(dir==='R'?1:-1); if(i>=0&&i<cur.options.length){ cur.selectedIndex=i; cur.dispatchEvent(new Event('change',{bubbles:true})); } return; }
    e.preventDefault(); knavMove(sc,dir); return; }
  if(k==='Enter'||k==='NumpadEnter'){ if(knavEl&&document.contains(knavEl)&&!e.repeat){ e.preventDefault(); if(knavEl.tagName==='SELECT') return; knavEl.click(); setTimeout(()=>{ if(knavEl&&!document.contains(knavEl)||(knavEl&&knavEl.offsetParent===null)) knavEl=null; },50); } return; }
  if(k==='Backspace'){ e.preventDefault(); if(!e.repeat) knavBack(sc); return; }
},true);
window.addEventListener('mousedown',()=>{ if(knavEl){ knavEl.classList.remove('kfocus'); knavEl=null; } },true);

/* รหัสแจกของ: เงิน + สกินที่ระบุ + สกินสุ่ม (ซ้ำ = คืนทองตามระดับ) */
RK.setGiftHandler(j=>{
  const parts=[]; const g=Math.max(0,Math.floor(+j.gold||0)); let gain=g;
  if(g) parts.push('ทอง +'+g.toLocaleString()+' 🪙');
  const got=[], dups=[];
  const give=sk=>{ if(SO.includes(sk.id)){ gain+=RAR[sk.r].ref; dups.push(sk.n); } else { SO.push(sk.id); got.push(sk.n); } };
  (Array.isArray(j.skins)?j.skins:[]).forEach(id=>{ const sk=SKINS.find(x=>x.id===id&&!x.def); if(sk) give(sk); });
  for(let i=0,n=Math.min(50,+j.randomSkins||0);i<n;i++){ const sk=pickSkin(null); if(sk) give(sk); }
  if(got.length){ try{ localStorage.setItem('ns_skins_owned',JSON.stringify(SO)); }catch(e){} parts.push('สกินใหม่: '+got.slice(0,6).join(', ')+(got.length>6?' +'+(got.length-6):'')); }
  if(dups.length) parts.push('สกินซ้ำ '+dups.length+' ใบ คืนทองให้แล้ว');
  if(gain){ gold+=gain; saveGold(); updGold(); }
  try{ updPity(); }catch(e){}
  sfx('gacha'); return 'รับของสำเร็จ! '+(parts.join(' · ')||'—');
});
{ const gb=$('bGift'), gi=$('gcIn'), gm=$('gcMsg'); let busy=false;
  gb.onclick=async()=>{ if(busy) return; busy=true; gb.disabled=true; gm.style.color='#7fe9ff'; gm.textContent='กำลังตรวจสอบ...';
    try{ gm.textContent=await RK.redeemGift(gi.value); gm.style.color='#7dff9a'; gi.value=''; updGold(); }
    catch(e){ gm.textContent=e.message; gm.style.color='#ff6b6b'; }
    busy=false; gb.disabled=false; };
  gi.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); gb.click(); } }); }
updRankBadge(); RK.initRank();
