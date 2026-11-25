'use strict';
/* СНР OS v1 — Vanilla JS. Разделы: 1 хранилище · 2 аудио · 3 пульс (ввод/rPPG) · 4 сканер · 5 сессии · 6 экраны · 7 CSV */

/* ===== 1. Хранилище и утилиты ===== */
let ADMIN_PW='';
const isAdmin=()=>!!(S.admin&&ADMIN_PW&&!S.preview);
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const APP_VER='11.2.3';const BASES=['shield','booster','peak','reset','custom'];
const baseName=b=>PR[b]?PR[b].n:'Собственный протокол';const SHARED_API='https://snr-os-scenario.gregorynabokov.workers.dev';const KEY='snr_os_v1', PROBE=30;let LEN=180;
const S=Object.assign({courses:[],base:null,hr:[],disc:[],vuln:null,plan:null,done:{},log:[],scans:[],lv:{shield:.15,booster:.3,peak:.3},cam:false,set:{vol:.8,len:180,vib:1},seen:0},JSON.parse(localStorage.getItem(KEY)||'{}'));
const save=()=>localStorage.setItem(KEY,JSON.stringify(S));
// Миграция: старый скан имел 4 оси (вакуум — индекс 2). Убираем её из сохранённых результатов.
if(S.vuln&&S.vuln.length===4)S.vuln=[S.vuln[0],S.vuln[1],S.vuln[3]];
(S.scans||[]).forEach(x=>{if(x.vuln&&x.vuln.length===4)x.vuln=[x.vuln[0],x.vuln[1],x.vuln[3]]});
const vib=n=>S.set.vib&&navigator.vibrate?.(n);
let navSilent=false;
const TAB_ORDER=['home','stats','set','lib','ai'];
const chrome=n=>{document.body.classList.remove('run');document.querySelectorAll('#tabs button').forEach(b=>{const on=b.dataset.t===n;b.classList.toggle('on',on);b.setAttribute('aria-current',on?'page':'false')});applyAdmin();if(!navSilent&&TAB_ORDER.includes(n)&&!(history.state&&history.state.k===n))history.pushState({k:n},'')};
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const $=s=>document.querySelector(s), app=$('#app'), html=h=>{app.innerHTML=h;app.classList.remove('fade');void app.offsetWidth;app.classList.add('fade')};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)), sleep=ms=>new Promise(r=>setTimeout(r,ms)), rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const click=sel=>new Promise(r=>{$(sel).onclick=r});
const PR={shield:{n:'Сенсорный щит',orb:1},booster:{n:'Когнитивный бустер'},peak:{n:'Симулятор пиковых нагрузок'},reset:{n:'Экстренный сброс',orb:1}};
const AX=['Акустика','Зрение','Давление'], AXP=['shield','shield','peak'];

/* ===== 2. Аудио (Web Audio API) ===== */
const A={ctx:null,nodes:[],timers:[],alive:false,
 init(){if(!this.ctx){this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.connect(this.ctx.destination)}this.ctx.resume();this.master.gain.value=S.set.vol;this.alive=true},
 gain(v){const g=this.ctx.createGain();g.gain.value=v;g.connect(this.master);this.nodes.push(g);return g},
 filt(t,f,q=1){const x=this.ctx.createBiquadFilter();x.type=t;x.frequency.value=f;x.Q.value=q;this.nodes.push(x);return x},
 bufs:{},
 noise(type){const c=this.ctx;let b=this.bufs[type];
  if(!b){b=this.bufs[type]=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const d=b.getChannelData(0);let l=0; // кэш: не пересчитываем 100k сэмплов
   for(let i=0;i<d.length;i++){const w=Math.random()*2-1;if(type==='brown'){l=(l+.02*w)/1.02;d[i]=l*3.5}else d[i]=w}}
  const s=c.createBufferSource();s.buffer=b;s.loop=true;s.start();this.nodes.push(s);return s},
 crowd(){const out=this.gain(0),n=this.noise('white'),f=this.filt('bandpass',900,.6),f2=this.filt('bandpass',2400,.8),mod=this.ctx.createGain();
  mod.gain.value=.6;out.mod=mod;n.connect(f);f.connect(f2);f2.connect(mod);mod.connect(out);return out}, // гул толпы
 tone(f,d=.2,v=.1,type='sine'){const c=this.ctx,o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type=type;o.frequency.value=f;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+Math.min(.05,d/3));g.gain.linearRampToValueAtTime(0,t+d);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+d+.05)},
 click(v){this.tone(3500+Math.random()*2500,.03,v,'square')},
 tock(v){const c=this.ctx,t=c.currentTime,len=Math.floor(c.sampleRate*.03),b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(len*.18));
  const src=c.createBufferSource();src.buffer=b;const hp=c.createBiquadFilter();hp.type='highpass';hp.frequency.value=2200;
  const g=c.createGain();g.gain.value=v;src.connect(hp);hp.connect(g);g.connect(this.master);src.start(t);this.tone(1700,.03,v*.5,'sine')}, // резкий высокочастотный импульс
 tick(hi){this.tone(hi?900:700,.04,.15)},
 every(fn,ms){this.timers.push(setInterval(fn,ms))},
 stop(){this.alive=false;this.timers.forEach(clearInterval);this.timers=[];this.nodes.forEach(n=>{try{n.stop?.()}catch(e){}try{n.disconnect()}catch(e){}});this.nodes=[]}};

/* ===== 3. Пульс: ручной ввод + экспериментальный rPPG (зелёный канал лица) ===== */
const R={buf:[],
 async start(){if(this.v)return;this.st=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:160,height:120}});
  const v=this.v=document.createElement('video');v.srcObject=this.st;v.muted=true;v.playsInline=true;await v.play();
  this.c=document.createElement('canvas');this.c.width=40;this.c.height=30;this.x=this.c.getContext('2d',{willReadFrequently:true});this.buf=[];
  const samp=()=>{if(this.v!==v)return;this.x.drawImage(v,0,0,40,30);const d=this.x.getImageData(10,5,20,12).data;let g=0;for(let i=1;i<d.length;i+=4)g+=d[i];
   const n=performance.now();this.buf.push([n,g/(d.length/4)]);while(this.buf[0][0]<n-20000)this.buf.shift();
   v.requestVideoFrameCallback?v.requestVideoFrameCallback(samp):this.iv=setTimeout(samp,33)}; // по кадрам камеры, без дублей
  samp()},
 bpm(){const b=this.buf;if(b.length<150||b.at(-1)[0]-b[0][0]<10000)return null;
  const sm=(a,w)=>a.map((_,i)=>{let s=0,n=0;for(let j=Math.max(0,i-w);j<=Math.min(a.length-1,i+w);j++){s+=a[j];n++}return s/n});
  const v=b.map(p=>p[1]),t=b.map(p=>p[0]),f=sm(v,2),bs=sm(v,15),y=f.map((x,i)=>x-bs[i]),th=Math.sqrt(y.reduce((s,x)=>s+x*x,0)/y.length)*.3,pk=[];
  for(let i=1;i<y.length-1;i++)if(y[i]>th&&y[i]>y[i-1]&&y[i]>=y[i+1]&&(!pk.length||t[i]-pk.at(-1)>350))pk.push(t[i]);
  if(pk.length<6)return null;const iv=pk.slice(1).map((p,i)=>p-pk[i]).sort((a,b)=>a-b),r=Math.round(60000/iv[iv.length>>1]);return r>45&&r<150?r:null},
 stop(){clearInterval(this.iv);this.st?.getTracks().forEach(t=>t.stop());this.v=null},
 async measure(sec,tick){await this.start();const t0=Date.now();while(Date.now()-t0<sec*1000){tick(Math.ceil(sec-(Date.now()-t0)/1000));await sleep(250)}const r=this.bpm();this.stop();return r}};

/* Bluetooth LE: стандартный сервис Heart Rate (0x180D / 0x2A37). Chrome на Android и ПК. */
const HRM={dev:null,last:null,
 async connect(){
  if(!navigator.bluetooth)throw new Error('Bluetooth недоступен в этом браузере');
  this.dev=await navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}]});
  this.dev.addEventListener('gattserverdisconnected',()=>{this.last=null;});
  const srv=await this.dev.gatt.connect();
  const ch=await (await srv.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged',e=>{this.last={bpm:this.parse(e.target.value),t:Date.now()}});
  await ch.startNotifications();
  return this.dev.name},
 parse(dv){const flags=dv.getUint8(0);return flags&1?dv.getUint16(1,true):dv.getUint8(1)}, // bit0: 0 = uint8, 1 = uint16
 fresh(){return this.last&&Date.now()-this.last.t<5000?this.last.bpm:null},
 connected(){return !!this.dev?.gatt?.connected}, // HRM.connected() в интерфейсе
};
function pulseForm(title,withDisc,cb,pre){
 html(`<h2>${title}</h2>${pre?`<p class="m">С датчика получено: ${pre} уд/мин (медиана). Проверьте и нажмите «Дальше».</p>`:''}<p class="m">Пульс, уд/мин: измерьте камерой (лицо в кадре, не двигаться) или введите значение, замеренное смартфоном.</p>
 <input id="hr" type="number" inputmode="numeric" placeholder="например, 72" value="${pre??''}">
 ${withDisc?`<label>Дискомфорт: <b id="dv">0</b>/10</label><input id="ds" type="range" min="0" max="10" value="0">`:''}
 ${HRM.connected()?'<button id="bl" class="ghost">Взять с датчика</button>':''}${S.cam?'<button id="cam" class="ghost">Измерить камерой (15 с)</button>':''}<p id="st" class="m"></p><button id="ok">Дальше</button>`);
 if(withDisc)$('#ds').oninput=e=>$('#dv').textContent=e.target.value;
 const bl=$('#bl');if(bl)bl.onclick=()=>{const v=HRM.fresh();if(v){$('#hr').value=v;$('#st').textContent='Пульс с датчика: '+v}else $('#st').textContent='Датчик не передаёт данные. Проверьте контакт.'};
 const camBtn=$('#cam');if(camBtn)camBtn.onclick=async()=>{try{const b=await R.measure(15,s=>$('#st').textContent='Смотрите в камеру… '+s);
  $('#st').textContent=b?'Пульс по камере: '+b:'Сигнал слабый. Добавьте света или введите пульс вручную.';if(b)$('#hr').value=b}catch(e){R.stop();$('#st').textContent='Нет доступа к камере. Введите пульс вручную.'}};
 $('#ok').onclick=()=>{const hr=+$('#hr').value;if(!(hr>=40&&hr<=200))return $('#st').textContent='Введите пульс от 40 до 200.';try{cb(hr,withDisc?+$('#ds').value:0)}catch(e){$('#st').textContent='Не удалось сохранить: '+e.message;console.error(e)}}}

/* ===== 4. Сенсорный лабиринт ===== */
const PB=[{n:'Акустический спектр',d:'Гул толпы и нарастающий свип до резких высоких импульсов. Нужны наушники.'},
 {n:'Визуально-ритмический спектр',d:'Мягкое пульсирующее свечение по краям экрана, около одного раза в секунду. Смотрите в центр, глаза не напрягайте.'},
 {n:'Когнитивно-социальный прессинг',d:'Часы тикают всё быстрее. Время давит.'}];
const SETUP=[
 len=>{const g=A.crowd(),t=A.ctx.currentTime;g.gain.setValueAtTime(.05,t);g.gain.linearRampToValueAtTime(.7,t+len);
  A.every(()=>{if(g.mod)g.mod.gain.setTargetAtTime(.25+Math.random()*.75,A.ctx.currentTime,.09)},170)},
 ()=>{},
 len=>{const t0=performance.now();let hi=0;(function tk(){if(!A.alive)return;A.tock(hi^=1?.22:.14);setTimeout(tk,1000*60/(60+120*Math.min(1,(performance.now()-t0)/1000/len)))})()}];

async function runVisualProbe(len){
 A.init();
 html(`<div class="vis glow" id="glow"></div><h2>${PB[1].n}</h2><p class="m" id="vst">Свечение по краям станет ярче и чаще. Нажмите «Здесь неприятно», как только станет некомфортно.</p><div class="bar"><i id="pg"></i></div><button id="vmark">Здесь неприятно</button><button id="stop" class="ghost">Прервать</button>`);
 const g=$('#glow'),pg=$('#pg');let stop=false,mark=null,lvl=0,fq=.5,elapsed=0;
 $('#stop').onclick=()=>stop=true;
 $('#vmark').onclick=()=>{if(mark!==null)return;mark={t:Math.round(elapsed/1000),level:+lvl.toFixed(2),freq:+fq.toFixed(2)};
  $('#vst').textContent='Отмечено. Можно продолжить или прервать.';$('#vmark').disabled=true};
 const t0=performance.now();
 while(!stop&&elapsed<len*1000){
  elapsed=performance.now()-t0;const k=elapsed/(len*1000);
  lvl=Math.min(.5,.08+.42*k);fq=Math.min(1.4,.5+.9*k);
  const ph=Math.sin(2*Math.PI*fq*elapsed/1000)*.5+.5;
  if(g)g.style.opacity=(lvl*ph).toFixed(3);
  if(pg)pg.style.width=(k*100)+'%';
  await sleep(33)}
 A.stop();window.__visThr=mark;return !stop}
async function runProbe(i,len){ // i=-1 — базовый покой
 if(i===1)return runVisualProbe(len);
 A.init();html(`<div class="vis ${i===1?'v1':''}"></div><h2>${i<0?'Базовый покой':PB[i].n}</h2><div id="cd" class="cd"></div><div class="bar"><i id="pg"></i></div><button id="stop" class="ghost">Прервать</button>`);
 if(i>=0)SETUP[i](len);let stop=false;$('#stop').onclick=()=>stop=true;const t0=Date.now();
 const pg=$('#pg');pg.style.transition=`width ${len}s linear`;requestAnimationFrame(()=>pg.style.width='100%');
 while(!stop&&Date.now()-t0<len*1000){if(i===2)$('#cd').textContent=Math.ceil(len-(Date.now()-t0)/1000);await sleep(250)}
 A.stop();return !stop}

const med=a=>{if(!a.length)return null;const x=[...a].sort((p,q)=>p-q);return x[x.length>>1]};
function sensorSample(){const arr=[];const iv=setInterval(()=>{const v=HRM.fresh();if(v)arr.push(v)},1000);return()=>{clearInterval(iv);return arr}};
async function scan(){if(S.vuln&&!confirm('Новый скан заново задаст начальные уроки. История уроков сохранится. Продолжить?'))return home();
 document.body.classList.add('run');
 html(`<h2>Перед началом</h2><div class="card"><p>Программа не является медицинским изделием и не ставит диагноз. Это исследовательский инструмент.</p>
 <p>В пробе 2 мягко пульсирует свет по краям экрана. Не проходите её при светочувствительной эпилепсии. В любой момент можно нажать «Прервать».</p><p>Сядьте удобно, наденьте наушники, сделайте громкость комфортной. Если есть датчик пульса, подключите его заранее: тогда пульс запишется сам.</p></div>
 <button id="go">Понятно, начать</button><button id="no" class="ghost">Назад</button>`);
 $('#no').onclick=()=>home();await click('#go');
 html(`<h2>Базовый покой</h2><p class="m">30 секунд тишины. Сядьте удобно и дышите спокойно.</p><button id="go">Начать</button>`);await click('#go');
 let stop=sensorSample();
 if(!await runProbe(-1,PROBE))return home();
 const baseRaw=stop(),base=await new Promise(r=>pulseForm('Пульс в покое',false,r,med(baseRaw)));
 const hr=[],disc=[],raw=[];let visThr=null;
 for(let i=0;i<PB.length;i++){
  html(`<h2>Проба ${i+1} из ${PB.length}: ${PB[i].n}</h2><p>${PB[i].d}</p><button id="go">Запустить (30 с)</button>`);await click('#go');
  stop=sensorSample();
  if(!await runProbe(i,PROBE))return home();
  if(i===1)visThr=window.__visThr||null;
  const sm=stop();
  await new Promise(r=>pulseForm(PB[i].n+': пульс и дискомфорт',true,(h,d)=>{hr.push(h);disc.push(d);r()},med(sm)));
  raw.push(sm);
 }
 html(`<h2>Отдых</h2><p class="m">20 секунд спокойствия. Так измеряется, как пульс возвращается к норме.</p><button id="go">Начать</button>`);await click('#go');
 stop=sensorSample();
 if(!await runProbe(-1,20))return home();
 const recRaw=stop(),rec=await new Promise(r=>pulseForm('Пульс после отдыха',false,r,med(recRaw)));
 S.base=base;S.hr=hr;S.disc=disc;S.vuln=hr.map((h,i)=>clamp(Math.round(Math.max(0,(h-base)/base*100)*3.5+disc[i]*4.5),0,100));
 const o=S.vuln.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]),p1=AXP[o[0][1]],p2=AXP[o.find(x=>AXP[x[1]]!==p1)[1]];
 S.courseStart=lessonCount();if(S.plan)(S.courses=S.courses||[]).push({endedAt:new Date().toISOString(),plan:S.plan,done:S.done,vuln:S.vuln});S.plan={};for(let d=1;d<=14;d++)S.plan[d]=d%7===0?'reset':d%2?p1:p2;S.done={};
 S.scans.push({v:APP_VER,t:new Date().toISOString(),base,rec,hr,disc,vuln:S.vuln,visThr,raw:raw.map(a=>a.map(Math.round))});
 S.log=S.log.filter(l=>l.type!=='scan');S.log.push(...hr.map((h,i)=>({type:'scan',t:new Date().toISOString(),proto:AX[i],pre:base,post:h,disc:disc[i],lvl:S.vuln[i]})));
 save();home('Профиль построен. Начинаем с уроков из скана, дальше курс подстроится под вашу реакцию.')}

/* ===== 5. Тренировочные протоколы ===== */
async function breathe(c,onCycle){const orb=$('#orb'),lb=$('#lbl'),ph=[['Вдох',4,1,60],['Пауза',2,1,0],['Выдох',6,.45,20]];
 while(c.alive){for(const[n,s,sc,v]of ph){if(!c.alive)return;lb.textContent=n;orb.style.transition=REDUCE?'none':`transform ${s}s ease-in-out`;orb.style.transform=`scale(${sc})`;
  for(let i=0;i<s&&c.alive;i++){if(v)vib(v);if(n==='Вдох')A.tone(300+i*60,.9,.03);if(n==='Выдох')A.tone(420-i*45,.9,.03);await sleep(1000)}}onCycle?.()}}
async function reaction(c){const f=$('#task');f.innerHTML='<div class="field" id="fld"></div>';const fl=$('#fld'),rts=[];let miss=0;
 while(c.alive){await sleep(500+Math.random()*1200);if(!c.alive)break;const b=document.createElement('button');b.className='tgt';b.style.left=Math.random()*80+'%';b.style.top=Math.random()*80+'%';fl.append(b);
  const t0=performance.now(),ok=await new Promise(r=>{b.onclick=()=>r(true);setTimeout(()=>r(false),1500/(1+c.lvl))});b.remove();ok?rts.push(performance.now()-t0):miss++}
 c.res={n:rts.length,miss,rt:rts.length?Math.round(rts.reduce((a,b)=>a+b)/rts.length):''}}
async function math(c){const box=$('#task');let ok=0,bad=0;
 while(c.alive){const a=rnd(10,40+Math.round(c.lvl*50)),b=rnd(3,9+Math.round(c.lvl*10)),x=rnd(2,9),ans=a+b*x,o=new Set([ans]);
  while(o.size<4)o.add(ans+rnd(1,9)*(Math.random()<.5?-1:1));const lim=Math.max(4,10-c.lvl*5)*1000;
  box.innerHTML=`<p class="q">${a} + ${b} × ${x}</p><div class="opts">${[...o].sort(()=>Math.random()-.5).map(v=>`<button data-v="${v}">${v}</button>`).join('')}</div><div class="bar"><i id="tm" style="width:100%"></i></div>`;
  const r=await new Promise(res=>{const t0=Date.now(),done=v=>{clearInterval(iv);res(v)};box.onclick=e=>e.target.dataset.v&&done(+e.target.dataset.v===ans);
   const iv=setInterval(()=>{const f=(Date.now()-t0)/lim;$('#tm')&&($('#tm').style.width=(100-f*100)+'%');if(f>=1||!c.alive)done(false)},100)});
  r?ok++:bad++;c.lvl=clamp(c.lvl+(r?.03:-.03),.1,1)}
 c.res={n:ok+bad,miss:bad,ok}}
const SET={
 shield(c){const g=A.crowd();c.apply=()=>g.gain.setTargetAtTime(c.lvl*.7,A.ctx.currentTime,.4);c.apply();
  A.every(()=>{if(Math.random()<c.lvl+.2)A.click(c.lvl*.3)},1300);breathe(c,()=>{c.lvl=Math.min(1,c.lvl+.03);c.apply()})},
 booster(c){const n=A.noise('white'),f=A.filt('bandpass',1600,.6),g=A.gain(.08);n.connect(f);f.connect(g);
  const ch=[[220,261.6,329.6],[174.6,220,261.6],[196,261.6,329.6],[196,246.9,293.7]];let k=0;const cd=()=>ch[k++%4].forEach(fr=>A.tone(fr,6,.035));cd();A.every(cd,6000);
  A.every(()=>A.tone(2000+Math.random()*1500,.1,.03),2500);reaction(c)},
 peak(c){const g=A.crowd();g.gain.value=.25+c.lvl*.4;A.every(()=>A.click(.06),2000);let h=0;A.every(()=>A.tock(h^=1?.22:.14),1000);math(c)},
 async reset(c){const orb=$('#orb'),lb=$('#lbl'),st=Math.max(66,c.pre),x=A.ctx,mk=(f,pan)=>{const o=x.createOscillator(),p=x.createStereoPanner(),g=A.gain(.05);o.frequency.value=f;p.pan.value=pan;o.connect(p);p.connect(g);o.start();A.nodes.push(o);return o};
  mk(200,-1);const rr=mk(212,1),n=A.noise('brown');n.connect(A.gain(.05));const t0=Date.now(); // бинауральный бит 12→6 Гц (наушники)
  while(c.alive){const e=Math.min(1,(Date.now()-t0)/(LEN*1000)),bpm=st+(60-st)*e,p=60/bpm;rr.frequency.setTargetAtTime(206+6*(1-e),x.currentTime,.1);
   lb.textContent=Math.round(bpm)+' уд/мин';A.tone(55,.25,.25);vib(30);
   orb.style.transition=`transform ${p*.35}s ease-out`;orb.style.transform='scale(1)';await sleep(p*350);
   orb.style.transition=`transform ${p*.6}s ease-in`;orb.style.transform='scale(.6)';await sleep(p*650)}}};

const SHORT={shield:'Щит',booster:'Бустер',peak:'Пик',reset:'Сброс'};
const BRIEF={
 shield:{short:'Дыхание 4-2-6 и мягкий звук. Нагрузка подстраивается под вас.',steps:['Наденьте наушники и сядьте прямо, плечи расслаблены.','Следите за голубым кругом: вдох — круг растёт (4 секунды), пауза (2 секунды), выдох — круг сжимается (6 секунд).','Звук будет нарастать. Если он мешает, нажмите «Мне некомфортно»: громкость и нагрузка снизятся.','Не нужно дышать «правильно». Просто возвращайтесь к кругу, когда отвлеклись.']},
 booster:{short:'Фон кофейни и быстрые задачи на внимание.',steps:['Включите наушники или колонки на тихой громкости.','Фон помогает сосредоточиться. Не выключайте его до конца сессии.','Нажимайте на появляющиеся персиковые круги как можно быстрее.','Промахи не страшны: сложность подстроится сама.']},
 peak:{short:'Арифметика на время под шум аудитории и тиканье часов.',steps:['Выбирайте ответ до того, как полоска времени закончится.','Шум и тиканье — это тренировка концентрации. Не отвлекайтесь на них, возвращайтесь к примеру.','Ошибка не отменяет сессию. Продолжайте.','Если становится тревожно, нажмите «Мне некомфортно».']},
 reset:{short:'Быстрое успокоение за несколько минут. Только слушайте и дышите.',steps:['Наденьте наушники: звук создаёт ритм, который работает только в наушниках.','Следите за пульсом на экране: он будет плавно замедляться.','Дышите в ритме круга. Задач нет.','Если хотите остановиться раньше, нажмите «Завершить».']}
};
function session(p,test){brief(p,test)}
function testSession(p){session(p,true)}
function profileSummary(p){const L=S.log.filter(l=>l.type==='session').slice(-5);
 return {protocol:p,day:Math.min(curDay(),10000),vuln:S.vuln,recent:L.map(l=>({proto:l.proto,delta:l.post-l.pre,disc:l.disc}))}}
function cleanScenario(j){if(!j||typeof j.title!=='string'||!Array.isArray(j.intro))return null;
 const intro=j.intro.filter(x=>typeof x==='string').slice(0,4).map(x=>x.slice(0,200));
 return intro.length?{title:j.title.slice(0,60),intro}:null}
async function fetchScenario(p){
 const url=S.set.api||SHARED_API;if(!navigator.onLine||!S.vuln)return null;
 const key=curDay()+'|'+p+'|'+S.vuln.join('.');
 const cache=JSON.parse(localStorage.getItem('snr_scn')||'{}');if(cache[key])return cache[key];
 const ctrl=new AbortController(),to=setTimeout(()=>ctrl.abort(),8000);
 try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(profileSummary(p)),signal:ctrl.signal});
  if(!r.ok)return null;const sc=cleanScenario(await r.json());if(!sc)return null;
  cache[key]=sc;const ks=Object.keys(cache);ks.slice(0,Math.max(0,ks.length-20)).forEach(k=>delete cache[k]);
  localStorage.setItem('snr_scn',JSON.stringify(cache));return sc}
 catch(e){return null}finally{clearTimeout(to)}}
function localIntro(p){const v=S.vuln||[0,0,0,0],top=AX[v.indexOf(Math.max(...v))].toLowerCase();
 const last=S.log.filter(l=>l.type==='session').at(-1);
 return {title:metaOf(p).n,intro:[`Сегодня: ${metaOf(p).n.toLowerCase()}. По вашему скану сильнее всего нагружен спектр «${top}».`,
  last&&last.post<last.pre?'В прошлый раз пульс снизился. Повторите то, что помогло.':'Не спешите. Дыхание важнее результата.',
  'Сядьте удобно и начинайте, когда будете готовы.']}}
SET.custom=()=>{};
function brief(p,test){chrome('home');const b=metaOf(p);
 html(`${test?'<p class="toast">Тестовый запуск: не учитывается в статистике, уроках и расписании.</p>':''}${ICON[metaOf(p).base]||''}<h2>${metaOf(p).n}</h2><p class="m">${b.short} Длительность: ${1} мин.</p>
 <div class="card" id="ai"><span class="m">Вступление к сессии</span><p id="aiT">Готовим вступление…</p></div>
 <div class="card"><h2>Как проходить</h2><ol class="steps">${b.steps.map(x=>`<li>${x}</li>`).join('')}</ol></div>
 <div class="card"><p class="m">Перед стартом измерим пульс: датчиком, камерой или вручную. После сессии спросим про самочувствие.</p></div>
 <button id="go">Начать</button><button id="back" class="ghost">Назад</button>`);
 $('#back').onclick=()=>home();$('#go').onclick=()=>sessionRun(p,test);
 fetchScenario(metaOf(p).base).then(sc0=>{const sc=sc0||localIntro(p);const box=$('#ai');if(!box)return;box.innerHTML='';
  const lab=document.createElement('span');lab.className='m';lab.textContent='Вступление к сессии';box.append(lab);
  
  const h=document.createElement('h3');h.textContent=sc.title;box.append(h);
  sc.intro.forEach(x=>{const q=document.createElement('p');q.textContent=x;box.append(q)})})}
function withPre(p,cb){
 if(!HRM.connected())return pulseForm(metaOf(p).n+': пульс до',false,cb);
 html(`<h2>${metaOf(p).n}</h2><p class="m">Измеряем покой с датчика: 10 секунд. Сидите спокойно.</p><div id="cd" class="cd">10</div>`);
 const stop=sensorSample();let k=10;const iv=setInterval(()=>{k--;const el=$('#cd');if(el)el.textContent=Math.max(0,k)},1000);
 setTimeout(()=>{clearInterval(iv);cb(med(stop())||HRM.fresh()||S.base||70)},10000)}
function discForm(post,cb){
 html(`<h2>Как вы себя чувствуете?</h2><p class="m">Пульс после сессии записан с датчика: ${post} уд/мин.</p><label>Дискомфорт: <b id="dv">0</b>/10</label><input id="ds" type="range" min="0" max="10" value="0"><button id="ok">Дальше</button>`);
 $('#ds').oninput=e=>$('#dv').textContent=e.target.value;$('#ok').onclick=()=>cb(post,+$('#ds').value)}
function sessionRun(p,test){document.body.classList.add('run');const base=metaOf(p).base,cust=PR[p]?null:findCustom(p);withPre(p,pre=>{A.init();LEN=60;const orbOn=PR[base]?PR[base].orb:!!(cust&&(cust.sound||[]).includes('дыхание'));
  const c={p:base,pid:p,test:!!test,custom:cust?cust.id:null,pre,alive:true,lvl:S.lv[base]??.2,eases:0,auto:0,res:{}};
  html(`<h2>${metaOf(p).n}</h2><p id="tl" class="lbl" style="text-align:center;min-height:3.2em;padding:0 12px"></p><div class="stage ${orbOn?'':'hide'}"><div class="orb" id="orb" role="img" aria-label="Дыхательный круг: вдох растёт, выдох сжимается"></div><div class="lbl" id="lbl" aria-live="polite"></div></div><div id="task"></div>
  <div class="session-foot"><p class="m" id="hrl" aria-live="polite" style="text-align:center"></p><canvas id="ecg" height="90" style="width:100%;display:block"></canvas><p class="m" id="ecgh" style="text-align:center"></p><div class="bar"><i id="pg"></i></div><div class="row"><button id="ease" class="ghost">Мне некомфортно</button><button id="end">Завершить</button></div></div>`);
  const t0=Date.now();let iv;navigator.wakeLock?.request('screen').then(w=>c.wl=w).catch(()=>{});
  window.__abort=()=>{if(!c.alive)return;c.alive=false;clearInterval(iv);clearInterval(c.samp);clearInterval(c.tlTimer);A.stop();stopLayers();R.stop();c.wl?.release();window.__abort=null;home('Урок прерван, запись не сохранена.')};
  const end=()=>{if(!c.alive)return;c.alive=false;clearInterval(iv);clearInterval(c.samp);clearInterval(c.tlTimer);A.stop();stopLayers();R.stop();c.wl?.release();finish(c)};
  $('#end').onclick=end;$('#ease').onclick=()=>{c.eases++;c.lvl*=.7;c.apply?.()};
  c.hrs=[];c.gaps=0;
  const hrl=$('#hrl');
  const tick=()=>{ecgPush(c,HRM.fresh()??(S.cam&&!HRM.connected()?R.bpm():null));const sec=Math.round((Date.now()-t0)/1000),ble=HRM.fresh(),b=ble??(S.cam&&!HRM.connected()?R.bpm():null),src=ble?'ble':'cam';
   if(b){c.hrs.push([sec,b,src]);hrl.textContent='Пульс: '+b+' уд/мин'+(ble?' (датчик)':'');
    if(S.base&&b>S.base*1.15&&base!=='reset'&&c.hrs.length>3){c.lvl*=.85;c.auto++;c.apply?.()}}
   else{c.gaps++;hrl.textContent='Пульс: нет сигнала'+(HRM.connected()?' от датчика':', смотрите в камеру')}};
  const start=()=>{c.samp=setInterval(tick,1500)}; // запись каждые 1,5 с
  if(HRM.connected()){hrl.textContent='Пульс: датчик подключён';start()}
  else if(S.cam)R.start().then(()=>{hrl.textContent='Пульс: сбор данных…';start()}).catch(()=>{hrl.textContent='Камера недоступна: пульс не записывается'});
  else hrl.textContent='Запись пульса выключена: подключите датчик или включите камеру в настройках';
  setTimeout(()=>{if(c.alive){(SET[base]||SET.custom)(c);if(cust)startLayers(cust)}},50); // orb: старт с scale(.45) из CSS
  const pg=$('#pg');pg.style.transition=`width ${LEN}s linear`;requestAnimationFrame(()=>pg.style.width='100%');
  iv=setInterval(()=>{if(Date.now()-t0>=LEN*1000)end()},500);startTimeline(c,cust,t0)})}
let CUST_AUDIO=null;
function startLayers(cust){
 const snd=cust.sound||[],vis=cust.visual||[];
 if(snd.includes('гул')){const g=A.crowd();g.gain.value=.35;A.every(()=>{if(g.mod)g.mod.gain.setTargetAtTime(.25+Math.random()*.75,A.ctx.currentTime,.09)},170)}
 if(snd.includes('тиканье'))A.every(()=>A.tock(.18),1000);
 if(snd.includes('шелест'))A.every(()=>{const n=A.noise('white'),f=A.filt('bandpass',4500,.9),g=A.gain(0);n.connect(f);f.connect(g);
  const t=A.ctx.currentTime;g.gain.setValueAtTime(.05,t);g.gain.exponentialRampToValueAtTime(.0001,t+.15);setTimeout(()=>{try{n.stop()}catch(e){}},200)},600);
 if(snd.includes('дыхание'))A.every(()=>A.tone(220,1.2,.03),3000);
 if(vis.includes('мягкое свечение'))document.body.insertAdjacentHTML('beforeend','<div class="vis v1 custom-glow"></div>');
 if(cust.sound_file)playLinkedFile(cust.sound_file)}
async function playLinkedFile(id){
 try{const remote=(S.pubFiles||[]).find(f=>f.id===id);
  let url=null;
  if(remote)url=SHARED_API+'/files/'+id;
  else{const db=await libDB();const rec=await new Promise(res=>{const q=db.transaction('files').objectStore('files').get(id);q.onsuccess=()=>res(q.result)});
   if(rec)url=URL.createObjectURL(rec.blob)}
  if(!url)return;
  CUST_AUDIO=new Audio(url);CUST_AUDIO.loop=true;CUST_AUDIO.volume=.5;CUST_AUDIO.play().catch(()=>{})}catch(e){}}
function stopLayers(){
 document.querySelectorAll('.custom-glow').forEach(e=>e.remove());
 if(CUST_AUDIO){CUST_AUDIO.pause();CUST_AUDIO=null}}
function startTimeline(c,cust,t0){
 if(!cust||!cust.timeline||!cust.timeline.length)return;
 c.tlTimer=setInterval(()=>{
  const e=(CUST_AUDIO&&!CUST_AUDIO.paused)?CUST_AUDIO.currentTime:(Date.now()-t0)/1000;let cur=null;
  for(const it of cust.timeline) if(it.t<=e) cur=it;
  if(cur&&cur!==c.tlCur){c.tlCur=cur;const el=$('#tl');if(el)el.textContent=cur.text}
 },250)}
function ecgPush(c,b){
 c.ecg=c.ecg||[];
 const recent=c.ecg.filter(v=>v!=null).slice(-5);
 const med=recent.length?[...recent].sort((x,y)=>x-y)[recent.length>>1]:null;
 const ok=(b!=null)&&(med==null||Math.abs(b-med)<=15);
 c.ecg.push(ok?b:null); if(c.ecg.length>60)c.ecg.shift();
 ecgDraw(c);
 const last=c.ecg.slice(-6);const valid=last.filter(v=>v!=null);
 let hint='';
 if(last.slice(-3).every(v=>v==null)) hint=HRM.connected()?'Датчик молчит: прижмите его к пальцу посильнее.':'Нет сигнала: посмотрите в камеру и не двигайтесь.';
 else if(valid.length>=4){const mean=valid.reduce((a,v)=>a+v,0)/valid.length;const sd=Math.sqrt(valid.reduce((a,v)=>a+(v-mean)**2,0)/valid.length);
  if(sd>6) hint='Не шевелите палец: сигнал прыгает.';}
 const el=$('#ecgh'); if(el) el.textContent=hint;
}
function ecgDraw(c){
 const cv=$('#ecg'); if(!cv||!c.ecg)return;
 const dpr=devicePixelRatio||1,W=cv.clientWidth||340,H=90;cv.width=W*dpr;cv.height=H*dpr;
 const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,H);
 x.strokeStyle=cssv('--ln');x.lineWidth=1;[50,100,150].forEach(v=>{const y=H-((v-40)/160)*H;x.beginPath();x.moveTo(0,y);x.lineTo(W,y);x.stroke()});
 x.strokeStyle=cssv('--ac');x.lineWidth=2;x.beginPath();let pen=false;
 c.ecg.forEach((v,i)=>{if(v==null){pen=false;return}const px=i*(W/60),py=H-((v-40)/160)*H;pen?x.lineTo(px,py):x.moveTo(px,py);pen=true});
 x.stroke();
}
function finishTest(c,post,disc){
 S.tests=S.tests||[];S.tests.push({t:new Date().toISOString(),pid:c.pid,pre:c.pre,post,disc,v:APP_VER});save();
 document.body.classList.remove('run');
 html(`<h2>Тест завершён</h2><div class="card"><p>Протокол: ${esc(metaOf(c.pid).n)}</p><p class="m">Пульс: ${c.pre} → ${post} уд/мин, дискомфорт ${disc}/10.</p>
  <p class="m">Тестовый запуск не учитывается в статистике, уроках и расписании.</p></div>
  <div class="row"><button id="tAgain">Ещё раз</button><button id="tLib" class="ghost">В библиотеку</button></div>`);
 $('#tAgain').onclick=()=>testSession(c.pid);$('#tLib').onclick=()=>lib('proto')}
function finish(c){const afterForm=cb=>{if(HRM.connected()){const post=med((c.hrs||[]).slice(-10).map(x=>x[1]))||c.pre;discForm(post,cb)}else pulseForm('Как вы себя чувствуете? Пульс после',true,cb)};
afterForm((post,disc)=>{
 if(c.test){finishTest(c,post,disc);return}
 const good=disc<=4&&c.eases<=1;S.lv[c.p]=clamp(c.lvl+(good?.05:-.08),.1,1);
 S.log.push({type:'session',v:APP_VER,t:new Date().toISOString(),day:curDay(),lesson:curDay(),planned:(S.plan&&(curDay()-(S.courseStart||0))<=14)?S.plan[curDay()-(S.courseStart||0)]:null,proto:c.p,custom:c.custom||null,pre:c.pre,post,disc,lvl:+c.lvl.toFixed(2),eases:c.eases+c.auto,hr_series:c.hrs||[],hr_gaps:c.gaps||0,n:c.res.n??'',miss:c.res.miss??'',rt:c.res.rt??'',ok:c.res.ok??''});
 save();summary(S.log.at(-1))})}

/* ===== 6. Экраны, графики ===== */
const lessonCount=()=>S.log.filter(l=>l.type==='session').length;
const curDay=()=>lessonCount()+1;
// Первые 4 урока — из скана. Дальше протокол подстраивается под реакцию на прошлый урок.
const PROTOS_OK=['shield','booster','peak','reset'];
function nextLesson(){
 const n=curDay(),k=n-(S.courseStart||0);
 if(S.aiNext&&S.aiNext.lesson===n&&PROTOS_OK.includes(S.aiNext.proto))return {n,proto:S.aiNext.proto,why:'Решение советника ИИ, подтверждено администратором: '+S.aiNext.reason};
 const sc=(S.schedule||[]).find(x=>x.lesson===n-(S.courseStart||0));
 if(sc){const pid=PR[sc.id]?sc.id:(PR[protoBase(sc.id)]?protoBase(sc.id):'shield');return {n,proto:pid,why:'Расписание: '+PR[pid].n+(sc.note?' — '+sc.note:'')}};
 if(!S.vuln)return {n,proto:null,why:'Сначала пройдите сенсорный лабиринт.'};
 const rank=S.vuln.map((_,i)=>i).sort((a,b)=>S.vuln[b]-S.vuln[a]);
 if(k<=4&&S.plan)return {n,proto:S.plan[k],why:`Начальный урок из скана: главный спектр «${AX[rank[0]].toLowerCase()}» (${S.vuln[rank[0]]}%).`};
 const last=S.log.filter(l=>l.type==='session').at(-1),d=last.post-last.pre;
 if(last.disc>=6||d>=5)return {n,proto:last.proto==='reset'?'shield':'reset',why:'В прошлый раз пульс вырос или было неприятно, поэтому урок спокойнее.'};
 const harder=last.disc<=3&&d<=0;
 const order=harder?['booster','peak'].concat(rank.map(i=>AXP[i])):rank.map(i=>AXP[i]).concat(['shield','booster','peak']);
 return {n,proto:order.find(x=>x!==last.proto)||'shield',
  why:harder?'Пульс снизился, а нагрузка была переносимой: можно чуть сложнее.':'Продолжаем по главному спектру, протоколы чередуются.'}}
function radar(cv,v,v0){const n=v.length,x=cv.getContext('2d'),W=cv.width=400,H=cv.height=340,cx=200,cy=170,R0=72;
 const pt=(i,k)=>{const t=i*2*Math.PI/n;return [cx+Math.sin(t)*R0*k,cy-Math.cos(t)*R0*k]};
 x.clearRect(0,0,W,H);x.strokeStyle=cssv('--ln');x.fillStyle=cssv('--mu');x.font='12px system-ui';x.textAlign='center';
 for(const k of[.25,.5,.75,1]){x.beginPath();for(let i=0;i<n;i++){const[a,b]=pt(i,k);i?x.lineTo(a,b):x.moveTo(a,b)}x.closePath();x.stroke()}
 for(let i=0;i<n;i++){const[a,b]=pt(i,1),[lx,ly]=pt(i,1.2);x.beginPath();x.moveTo(cx,cy);x.lineTo(a,b);x.stroke();
  const sx=Math.sin(i*2*Math.PI/n);x.textAlign=Math.abs(sx)<.2?'center':sx>0?'left':'right';x.fillText(`${AX[i]} ${v[i]}%`,lx,ly+4)}
 if(v0){x.beginPath();v0.forEach((s,i)=>{const[a,b]=pt(i,s/100);i?x.lineTo(a,b):x.moveTo(a,b)});x.closePath();x.setLineDash([5,4]);x.strokeStyle=cssv('--wr');x.lineWidth=2;x.stroke();x.setLineDash([])}
 x.beginPath();v.forEach((s,i)=>{const[a,b]=pt(i,s/100);i?x.lineTo(a,b):x.moveTo(a,b)});x.closePath();x.fillStyle=cssv('--ac')+'44';x.fill();x.strokeStyle=cssv('--ac');x.lineWidth=2;x.stroke()}
function dyn(cv){const x=cv.getContext('2d'),W=cv.width=340,H=cv.height=160,L=S.log.filter(l=>l.type==='session');x.clearRect(0,0,W,H);x.fillStyle=cssv('--mu');x.font='13px system-ui';
 if(L.length<2){x.textAlign='center';x.fillText('График появится после двух тренировок',W/2,H/2);return}
 const all=L.flatMap(l=>[l.pre,l.post]),lo=Math.min(...all)-5,hi=Math.max(...all)+5,X=i=>20+i*(W-40)/(L.length-1),Y=v=>H-20-(v-lo)/(hi-lo)*(H-40);
 [['pre',cssv('--mu')],['post',cssv('--ac')]].forEach(([k,col])=>{x.beginPath();x.strokeStyle=col;x.lineWidth=2;L.forEach((l,i)=>i?x.lineTo(X(i),Y(l[k])):x.moveTo(X(i),Y(l[k])));x.stroke()});
 x.textAlign='left';x.fillText('серый — до, голубой — после (уд/мин)',8,14)}
const ICON={shield:'<svg class="pico" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l16 6v12c0 10-7 18-16 22C15 40 8 32 8 22V10z" fill="none" style="stroke:var(--ac)" stroke-width="2.4"/></svg>',
 booster:'<svg class="pico" viewBox="0 0 48 48" aria-hidden="true"><path d="M4 30c5-8 9-8 14 0s9 8 14 0 8-6 12 0" fill="none" style="stroke:var(--mint)" stroke-width="2.4" stroke-linecap="round"/></svg>',
 peak:'<svg class="pico" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18" fill="none" style="stroke:var(--wr)" stroke-width="2.4"/><path d="M24 12v12l8 5" fill="none" style="stroke:var(--wr)" stroke-width="2.4" stroke-linecap="round"/></svg>',
 reset:'<svg class="pico" viewBox="0 0 48 48" aria-hidden="true"><path d="M30 6a18 18 0 1 0 12 26A14 14 0 0 1 30 6z" fill="none" style="stroke:var(--lav)" stroke-width="2.4"/></svg>'};
function home(msg){
 if(!S.seen)return onboard();chrome('home');if(navigator.onLine)syncLibrary();
 const has=!!S.vuln,nx=nextLesson(),log=S.log.filter(l=>l.type==='session');
 const scanCard=`<div class="card hero"><span class="m">Начните здесь</span><h2>Сенсорный лабиринт</h2><p>Около 6 минут. Три короткие пробы покажут, какие раздражители вам трудно переносить. По итогам начнётся курс.</p><button id="scan">Запустить сенсорный лабиринт</button></div>`;
 const lessonCard=has?`<div class="card hero"><span class="m">Урок ${nx.n}</span><h2>${metaOf(nx.proto).n}</h2><p>${metaOf(nx.proto).short}</p><p class="m">${nx.why}</p><button data-p="${nx.proto}">Начать урок (${1} мин)</button></div>`:'';
 const path=`<div class="card"><h2>Путь</h2><p class="m">Уроков пройдено: ${log.length}. Серия: ${streak()} дн.</p><div class="path">${log.slice(-10).map((l,i,arr)=>`<div class="day done"><span class="dn">${l.lesson??(log.length-arr.length+i+1)}</span>${SHORT[l.proto]||metaOf(l.custom||l.proto).n}</div>`).join('')||'<p class="m">Пока пусто</p>'}</div></div>`;
 html(`<header><h1>СНР OS</h1><p class="m">Сенсорная нейропластическая рекалибровка</p></header>${(S.admin&&ADMIN_PW)?`<div class="adminbar"><label class="switch"><input type="checkbox" id="pvTop" ${S.preview?'checked':''}><span></span></label><span>${S.preview?'Предпросмотр: вы видите приложение как пользователь':'Режим администратора'}</span></div>`:''}${msg?`<p class="toast">${msg}</p>`:''}
 ${!has?scanCard:lessonCard}
 ${has?hero():''}
 ${has?path:''}
 ${has?`<div class="card"><h2>Радар болевых спектров</h2><canvas id="rad"></canvas></div>
 <div class="card"><h2>Динамика пульса</h2><canvas id="dyn"></canvas></div>
 <button id="scan" class="ghost">Пройти сканер заново</button>`:''}
 <details class="card"><summary>Другие протоколы</summary><div class="row">${Object.keys(PR).map(p=>`<button class="ghost" data-p="${p}">${SHORT[p]}</button>`).join('')}</div></details>
 <div class="card"><h2>Выгрузка</h2><div class="row"><button class="ghost" id="csv">CSV: сессии</button><button class="ghost" id="csv2">CSV: по урокам</button></div><div class="row"><button class="ghost" id="csv3">CSV: пульс по секундам</button></div></div>
 <p class="m">Не медицинское изделие. При дискомфорте остановитесь.</p>`);
 if(has){radar($('#rad'),S.vuln);dyn($('#dyn'))}
 document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>session(b.dataset.p));
 const sc=$('#scan');if(sc)sc.onclick=scan;
 $('#csv').onclick=csv;$('#csv2').onclick=csvDaily;$('#csv3').onclick=csvHR;const pt=$('#pvTop');if(pt)pt.onchange=e=>{S.preview=e.target.checked?1:0;save();applyAdmin();home()}}

/* ===== 7. Экспорт CSV ===== */
function csv(){const H='type,time,day,protocol,hr_pre,hr_post,hr_delta,discomfort,level,eases,trials,errors,mean_rt_ms,correct\n';
 const rows=S.log.map(l=>[l.type,l.t,l.day??'',l.proto,l.pre,l.post,l.post-l.pre,l.disc,l.lvl,l.eases??'',l.n??'',l.miss??'',l.rt??'',l.ok??''].join(',')).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+H+rows],{type:'text/csv'}));a.download='snr_os_'+new Date().toISOString().slice(0,10)+'.csv';a.click()}

/* ===== 8. Аналитика ===== */
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN,
 sd=a=>{if(a.length<2)return NaN;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1))},
 slope=a=>{const n=a.length;if(n<3)return NaN;const mx=(n-1)/2,my=mean(a);let u=0,d=0;a.forEach((y,i)=>{u+=(i-mx)*(y-my);d+=(i-mx)**2});return u/d}, // МНК-наклон на сессию
 f1=(x,d=1)=>Number.isFinite(x)?(+x.toFixed(d)).toString().replace('.',','):'—';
function lines(cv,ser,o={}){const dpr=devicePixelRatio||1,W=340,H=170;cv.width=W*dpr;cv.height=H*dpr;const x=cv.getContext('2d');x.scale(dpr,dpr);x.font='12px system-ui';
 const all=ser.flatMap(s=>s.v).filter(Number.isFinite);if(all.length<2){x.fillStyle=cssv('--mu');x.textAlign='center';x.fillText('Недостаточно данных',W/2,H/2);return}
 const lo=o.lo??Math.min(...all),hi=o.hi??Math.max(...all),N=Math.max(...ser.map(s=>s.v.length)),X=i=>32+i*(W-44)/Math.max(1,N-1),Y=v=>H-22-(v-lo)/((hi-lo)||1)*(H-44);
 x.strokeStyle=cssv('--ln');x.fillStyle=cssv('--mu');x.textAlign='right';[lo,(lo+hi)/2,hi].forEach(g=>{x.beginPath();x.moveTo(34,Y(g));x.lineTo(W-6,Y(g));x.stroke();x.fillText(f1(g,0),30,Y(g)+4)});
 ser.forEach((q,k)=>{x.strokeStyle=x.fillStyle=q.c;x.lineWidth=2;x.beginPath();let st=0;q.v.forEach((y,i)=>{if(Number.isFinite(y)){st?x.lineTo(X(i),Y(y)):x.moveTo(X(i),Y(y));st=1}});x.stroke();q.v.forEach((y,i)=>{if(Number.isFinite(y)){x.beginPath();x.arc(X(i),Y(y),4,0,7);x.fill()}});x.textAlign='left';x.fillText(q.n,36+ser.slice(0,k).reduce((a,t)=>a+x.measureText(t.n).width+16,0),12)})}
const COL={shield:cssv('--ac'),booster:cssv('--mint'),peak:cssv('--wr'),reset:cssv('--lav')};
function stats(){chrome('stats');const lastHR=[...S.log].reverse().find(l=>l.type==='session'&&l.hr_series?.length)?.hr_series;
 const L=S.log.filter(l=>l.type==='session'),D=L.map(l=>l.post-l.pre),dz=mean(D)/sd(D);
 const rows=Object.keys(PR).map(p=>{const q=L.filter(l=>l.proto===p);if(!q.length)return'';const d=q.map(l=>l.post-l.pre);
  return `<tr><td>${PR[p].n.split(' ')[0]}</td><td>${q.length}</td><td>${f1(mean(d))}${Number.isFinite(sd(d))?'±'+f1(sd(d)):''}</td><td>${f1(mean(q.map(l=>l.disc)))}</td><td>${f1(q[0].lvl*100,0)}→${f1(q.at(-1).lvl*100,0)}</td></tr>`}).join('');
 const m=(k,v)=>`<div><span class="m">${k}</span><b>${v}</b></div>`;
 const nM=L.reduce((a,l)=>a+(l.hr_series?.length||0),0)+S.scans.reduce((a,x)=>a+(x.raw?.flat().length||0),0);
 const nD=new Set(L.map(l=>l.day)).size;
 const countsCard=`<div class="card"><h2>Собрано данных</h2><div class="grid">${m('Сессий',L.length)}${m('Дней с сессиями',nD)}${m('Замеров пульса',nM)}${m('Завершённых курсов',(S.courses||[]).length)}</div><p class="m">Замеры: пульс в сессиях и пробы сканера.</p></div>`;
 const wt0=L.length?new Date(L[0].t).getTime():0;const wk={};L.forEach(l=>{const w=Math.floor((new Date(l.t).getTime()-wt0)/604800000)+1;(wk[w]??=[]).push(l)});
 const weeksCard=`<div class="card"><h2>По неделям</h2>${L.length?`<div class="sc"><table><tr><th>Неделя</th><th>Сессий</th><th>Δ пульса</th><th>Диском.</th></tr>${Object.keys(wk).map(w=>{const q=wk[w];return `<tr><td>${w}</td><td>${q.length}</td><td>${f1(mean(q.map(l=>l.post-l.pre)))}</td><td>${f1(mean(q.map(l=>l.disc)))}</td></tr>`}).join('')}</table></div>`:'<p class="m">Пока нет сессий.</p>'}<p class="m">Это просто записи по неделям, без выводов о причинах.</p></div>`;
 html(`<h2>Аналитика</h2>${L.length?'':'<p class="toast">Пока нет сессий: данные появятся после первой тренировки.</p>'}
 <div class="card"><div class="grid">${m('Сессий',L.length)}${m('Уроков пройдено',lessonCount())}${m('Δ пульса, уд/мин',f1(mean(D)))}
 </div>
 <p class="m">Минус — пульс после урока ниже, чем до. ${L.length<10?'Данных мало, оценки предварительные.':''}</p></div>
 ${countsCard}${weeksCard}<div class="card"><h2>По протоколам</h2><div class="sc"><table><tr><th>Режим</th><th>N</th><th>Δ пульса</th><th>Диском.</th><th>Нагрузка, %</th></tr>${rows}</table></div></div>
 <div class="card"><h2>Нагрузка, %</h2><canvas id="c1"></canvas></div>
 <div class="card"><h2>Изменение пульса за урок, уд/мин</h2><canvas id="c2"></canvas></div>
 <div class="card"><h2>Дискомфорт, 0–10</h2><canvas id="c3"></canvas></div>
 ${S.scans.length>1?'<div class="card"><h2>Сканер: первый (пунктир) и последний</h2><canvas id="c4"></canvas></div>':''}
 ${lastHR?'<div class="card"><h2>Пульс в последней сессии</h2><p class="m">По порядку записей, раз в 1,5 с</p><canvas id="c5"></canvas></div>':''}
 <button id="bk">Назад</button>`);
 const P=Object.keys(PR),ser=f=>P.map(p=>({n:PR[p].n.split(' ')[0],c:COL[p],v:L.filter(l=>l.proto===p).map(f)})).filter(q=>q.v.length);
 lines($('#c1'),ser(l=>l.lvl*100),{lo:0,hi:100});lines($('#c2'),[{n:'Δ',c:cssv('--ac'),v:D}]);lines($('#c3'),ser(l=>l.disc),{lo:0,hi:10});
 if(S.scans.length>1)radar($('#c4'),S.scans.at(-1).vuln,S.scans[0].vuln);if(lastHR)lines($('#c5'),[{n:'уд/мин',c:cssv('--wr'),v:lastHR.map(x=>x[1])}]);
 $('#bk').onclick=()=>home()}
function csvDaily(){const g={};S.log.filter(l=>l.type==='session').forEach(l=>(g[l.day+'|'+l.proto]??=[]).push(l));
 const n=x=>Number.isFinite(x)?+x.toFixed(2):'',H='lesson,protocol,sessions,hr_pre_mean,hr_post_mean,hr_delta_mean,discomfort_mean,level_end,mean_rt_ms\n';
 const rows=Object.entries(g).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).map(([k,q])=>{const[d,p]=k.split('|'),pre=mean(q.map(l=>l.pre)),post=mean(q.map(l=>l.post));
  return [d,p,q.length,n(pre),n(post),n(post-pre),n(mean(q.map(l=>l.disc))),q.at(-1).lvl,n(mean(q.map(l=>l.rt).filter(Number.isFinite)))].join(',')}).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+H+rows],{type:'text/csv'}));a.download='snr_os_daily_'+new Date().toISOString().slice(0,10)+'.csv';a.click()}

/* ===== 9. Онбординг, главный экран, итог сессии, настройки ===== */
const OB=[['Добро пожаловать','СНР OS тренирует спокойствие: дыхание и дозированные раздражители помогают нервной системе меньше реагировать на стресс.'],
 ['Как это работает','Сначала сканер (около 6 минут) покажет ваш профиль. Затем уроки по 3 минуты: дыхание, звук и задачи. Курс без ограничения по длине.'],
 ['Безопасность','Это не медицинское изделие. Не проходите пробу с мерцанием при светочувствительной эпилепсии. Остановиться можно в любой момент. Нужны наушники.']];
function onboard(i=0){document.body.classList.add('run');html(`<div class="stage"><div class="orb" style="transform:scale(.7)"></div><h2>${OB[i][0]}</h2><p class="m" style="text-align:center">${OB[i][1]}</p><div class="dots">${OB.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')}</div></div><button id="nx">${i<2?'Далее':'Начать'}</button>`);
 $('#nx').onclick=()=>i<2?onboard(i+1):(S.seen=1,save(),home())}
const streak=()=>{const f=d=>d.toLocaleDateString('sv'),s=new Set(S.log.filter(l=>l.type==='session').map(l=>f(new Date(l.t))));let n=0,d=new Date();if(!s.has(f(d)))d.setDate(d.getDate()-1);while(s.has(f(d))){n++;d.setDate(d.getDate()-1)}return n};
const ADV=['Слух перегружается первым: начинайте с «Щита» и держите громкость комфортной.','Зрение чувствительно к контрасту и мельканию: вечером убавляйте яркость экрана.','Давление времени действует сильнее всего: тренируйте «Пик» и дыхание 4-2-6 перед дедлайном.'];
const kv=(k,v)=>`<div><span class="m">${k}</span><b>${v}</b></div>`;
function hero(){const i=S.vuln.indexOf(Math.max(...S.vuln));return `<div class="card hero"><span class="m">Ваш главный спектр</span><h2>${AX[i]}: ${S.vuln[i]}%</h2><p>${ADV[i]}</p><div class="row kv">${kv('Серия',streak()+' дн.')}${kv('Уроков',lessonCount())}${kv('Покой',S.base+' уд/мин')}</div></div>`}
function summary(l){chrome('home');const d=l.post-l.pre,t=d<=-3?'Пульс заметно снизился: нервная система перешла в более спокойный режим.':d>=3?'Пульс вырос. На сложных протоколах это бывает. В следующий раз начните со «Щита» или «Сброса».':'Пульс почти не изменился. Эффект накапливается за несколько сессий.';
 html(`<div class="card hero"><span class="m">${metaOf(l.custom||l.proto).n}</span><div class="big">${d>0?'+':''}${d}</div><p class="m">уд/мин (${l.pre} → ${l.post})</p><p>${t}</p><div class="row kv">${kv('Дискомфорт',l.disc+'/10')}${l.hr_series?.length?kv('Средний в сессии',Math.round(mean(l.hr_series.map(x=>x[1])))+' уд/мин'):''}${kv('Нагрузка',Math.round(l.lvl*100)+'%')}${kv('Серия',streak()+' дн.')}</div></div><button id="ok">Готово</button>`);
 $('#ok').onclick=()=>home(l.lesson?`Урок ${l.lesson} засчитан.`:'')}
function settings(){chrome('set');html(`<h2>Настройки</h2><div class="card"><label>Громкость: <b id="vv">${Math.round(S.set.vol*100)}</b>%</label><input id="vol" type="range" min="10" max="100" value="${S.set.vol*100}">
 <p class="m">Все уроки длятся одну минуту.</p>
 <label><input type="checkbox" id="vb" ${S.set.vib?'checked':''}> Вибрация в такт дыханию (Android)</label>
 </div>
 <details class="card"><summary>Словарик: что означают термины</summary><dl class="gl">
 <dt>Радар болевых спектров</dt><dd>Диаграмма из четырёх направлений: звук, зрение и давление времени. Чем дальше точка от центра, тем сильнее реакция.</dd>
 <dt>Уязвимость, %</dt><dd>Насколько сильно организм реагирует на этот тип ситуации: 0 — почти нет реакции, 100 — сильная.</dd>
 <dt>Дискомфорт, 0–10</dt><dd>Ваша оценка: 0 — всё нормально, 10 — очень неприятно.</dd>
 <dt>Нагрузка, %</dt><dd>Насколько сильный раздражитель вы выдерживаете спокойно. Растёт, если сессии проходят легко.</dd>
 <dt>Δ пульса</dt><dd>Пульс после сессии минус пульс до. Минус — пульс снизился.</dd>
 <dt>Эффект d</dt><dd>Насколько заметно изменение пульса по сравнению с разбросом. Верить ему стоит только при 10 и более сессиях.</dd>
 <dt>Протокол</dt><dd>Один тип тренировки: «Щит», «Бустер», «Пик» или «Сброс».</dd>
 <dt>Дыхание 4-2-6</dt><dd>Вдох 4 секунды, пауза 2, выдох 6. Длинный выдох помогает успокоиться.</dd>
 <dt>Габитуация</dt><dd>Привыкание: мозг перестаёт бурно реагировать на безопасный повторяющийся сигнал.</dd>
 <dt>Бинауральный бит</dt><dd>Звук, где каждое ухо слышит немного разную частоту. Работает только в наушниках.</dd>
</dl></details>
 <div class="card"><h2>Установка на экран</h2><p class="m">Установленное приложение открывается полноэкранно и работает без интернета.</p>
 <p class="m">Android: Chrome → меню ⋮ → «Установить приложение».</p>
 <p class="m">iPhone: Safari → «Поделиться» → «На экран «Домой»».</p>
 <button id="inst" class="ghost" hidden>Установить приложение</button></div>
 <div class="card"><h2>Политика данных</h2><p class="m">Аккаунта нет. Все данные хранятся только на этом устройстве: сессии, сканы, курсы и настройки.</p>
 <p class="m">Сторонним сервисам уходит только сводка по спектрам для вступления, без имени, сырых пульсовых рядов и идентификаторов. Передача включается, только если указан адрес сервера в настройках.</p>
 <p class="m">Данные удаляются кнопкой «Удалить все данные и кэш» ниже или очисткой данных браузера.</p>
 <button id="wipe" class="ghost">Удалить все данные и кэш</button></div>
 <div class="card"><h2>Экспериментальные функции</h2><p class="m">Работают нестабильно, точность не проверена. Данные могут быть неверными.</p>
 <label><input type="checkbox" id="cm" ${S.cam?'checked':''}> Измерение пульса камерой: кнопка в формах и запись во время сессий</label></div>
 <div class="card"><h2>Конфиденциальность и данные</h2><p class="m">Резервная копия содержит сессии, сканы и курсы. Файл можно восстановить на другом устройстве.</p>
 <div class="row"><button id="bk1" class="ghost">Сохранить копию</button><button id="bk2" class="ghost">Восстановить из файла</button></div>
 <input type="file" id="bkf" accept="application/json" hidden></div>
 ${scheduleCard()}
 <div class="card"><h2>Администратор</h2>${(S.admin&&ADMIN_PW)?'<p class="m">Вход выполнен.</p><label class="switch"><input type="checkbox" id="pv" '+(S.preview?'checked':'')+'><span></span></label> Предпросмотр: приложение как у пользователя<div class="row"><button id="chk" class="ghost">Проверить сервер</button><button id="alo" class="ghost">Выйти из режима администратора</button></div><p class="m" id="chkm"></p>':'<label>Пароль администратора</label><input id="apw" type="password" inputmode="numeric" autocomplete="off"><button id="ali">Войти</button><p class="m" id="alm"></p>'}</div>
 <div class="card"><h2>Тема</h2><div class="row"><button id="th1" class="${S.set.theme==='light'?'ghost':''}">Тёмная</button><button id="th2" class="${S.set.theme==='light'?'':'ghost'}">Светлая</button></div></div>
 <div class="card"><label>Адрес сервера вступлений (ИИ)</label><input id="api" type="url" value="${S.set.api||''}" placeholder="подключён автоматически"><p class="m">Сервер подключён автоматически и общий для всех. Поле нужно, только если хотите использовать свой сервер. Ключ API хранится на сервере, не в приложении.</p></div>
 <div class="card"><h2>Датчик пульса (Bluetooth)</h2><p class="m" id="bst">${!navigator.bluetooth?'Bluetooth недоступен в этом браузере':HRM.connected()?'Подключён: '+HRM.dev.name:'Не подключён'}</p>
 <div class="row"><button id="bc" class="${HRM.connected()?'ghost':''}">${HRM.connected()?'Отключить':'Подключить датчик'}</button></div>
 <p class="m">Нагрудные ремни и часы, передающие стандартный пульс (Polar H10, Wahoo, Garmin и др.). Нужны Chrome на Android или ПК. Safari на iPhone Bluetooth в браузере не поддерживает.</p></div>
 <div class="card"><h2>О приложении</h2><p class="m">СНР OS, версия ${APP_VER}. Это версия сайта, которую вы сейчас используете.</p></div>
 <button id="ob" class="ghost">Показать вводный тур</button>`);
 $('#vol').oninput=e=>{S.set.vol=e.target.value/100;$('#vv').textContent=e.target.value;save()};
  $('#vb').onchange=e=>{S.set.vib=+e.target.checked;save()};$('#cm').onchange=e=>{S.cam=e.target.checked;save()};
 $('#ob').onclick=()=>{S.seen=0;save();home()};
 $('#api').onchange=e=>{S.set.api=e.target.value.trim();save()};
 $('#bk1').onclick=exportData;$('#bk2').onclick=()=>$('#bkf').click();$('#bkf').onchange=importData;
 $('#wipe').onclick=wipeAll;
 $('#th1').onclick=()=>{S.set.theme='dark';save();applyTheme();settings()};
 if($('#alo'))$('#alo').onclick=()=>{adminLogout();settings()};
 if($('#pv'))$('#pv').onchange=e=>{S.preview=e.target.checked?1:0;save();applyAdmin();settings()};
 if($('#chk'))$('#chk').onclick=async()=>{$('#chkm').textContent='Проверка…';
  if(!ADMIN_PW){$('#chkm').textContent='Пароль не сохранён после перезагрузки. Выйдите и войдите заново.';return}
  try{const r=await fetch(SHARED_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin-check',password:ADMIN_PW})});
   $('#chkm').textContent=r.ok?'Сервер отвечает, пароль принят.':r.status===403?'Сервер не принял пароль (проверьте ADMIN_PASSWORD).':'Сервер ответил кодом '+r.status+'.'}
  catch(e){$('#chkm').textContent='Нет связи: '+e.message+'. Проверьте VPN и адрес сервера.'}};
 document.querySelectorAll('[data-si]').forEach(sel=>sel.onchange=e=>{S.schedule[+sel.dataset.si].id=e.target.value;save()});
 if($('#sclr'))$('#sclr').onclick=()=>{S.schedule=[];save();settings()};
 if($('#ali'))$('#ali').onclick=async()=>{const pw=$('#apw').value;$('#alm').textContent='Проверка…';
  let ok=false;try{ok=await adminLogin(pw)}catch(e){}
  if(ok)settings();else $('#alm').textContent=pw?'Неверный пароль или нет связи с сервером.':'Введите пароль.'};$('#th2').onclick=()=>{S.set.theme='light';save();applyTheme();settings()};
 $('#inst').onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;settings()};
 $('#bc').onclick=async()=>{
  if(HRM.connected()){HRM.dev.gatt.disconnect();return settings()}
  try{$('#bst').textContent='Поиск датчика…';await HRM.connect();settings()}
  catch(e){settings();$('#bst').textContent=e.name==='NotFoundError'?'Датчик не выбран':'Не подключено: '+e.message}};
 }
$('#tabs').onclick=e=>{const t=e.target.closest('button')?.dataset.t;if(t)({home:()=>home(),stats,set:settings,lib:()=>lib('proto'),ai:()=>aiScreen()})[t]()};

function csvHR(){const rows=S.log.filter(l=>l.type==='session'&&l.hr_series?.length).flatMap(l=>l.hr_series.map(([sec,b,src='cam'])=>[l.t,l.day??'',l.proto,sec,b,src].join(','))).join('\n');
 if(!rows)return alert('Пока нет записей пульса. Включите запись пульса камерой в настройках и пройдите сессию.');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+'session_time,day,protocol,sec,bpm,source\n'+rows],{type:'text/csv'}));a.download='snr_os_hr_'+new Date().toISOString().slice(0,10)+'.csv';a.click()}
function exportData(){const blob=new Blob([JSON.stringify({app:APP_VER,exported:new Date().toISOString(),data:S},null,1)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='snr_os_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click()}
async function importData(e){const f=e.target.files[0];if(!f)return;
 try{const obj=JSON.parse(await f.text());const d=obj.data||obj;
  if(!d||!Array.isArray(d.log)||!Array.isArray(d.scans))throw new Error('файл не похож на резервную копию СНР OS');
  if(!confirm('Заменить текущие данные данными из файла? Текущие данные будут потеряны.'))return;
  localStorage.setItem(KEY,JSON.stringify(d));location.reload()}
 catch(err){alert('Не удалось восстановить: '+err.message)}}
window.addEventListener('beforeunload',e=>{if(document.body.classList.contains('run')){e.preventDefault();e.returnValue=''}});
let swX=0,swY=0,swT=0;
document.addEventListener('touchstart',e=>{const t=e.touches[0];swX=t.clientX;swY=t.clientY;swT=Date.now()},{passive:true});
document.addEventListener('touchend',e=>{
 if(document.body.classList.contains('run'))return;
 if(e.target.closest('input,textarea,select,canvas,.switch,.ai-wrap .side'))return;
 const t=e.changedTouches[0],dx=t.clientX-swX,dy=t.clientY-swY;
 if(Math.abs(dx)<70||Math.abs(dy)>60||Date.now()-swT>700)return;
 const btns=[...document.querySelectorAll('#tabs button')].filter(b=>!b.hidden);
 const cur=btns.findIndex(b=>b.classList.contains('on'));
 const nxt=btns[cur+(dx<0?1:-1)];
 if(nxt)nxt.click()},{passive:true});
function goTab(k){if(k==='home')home();else if(k==='stats')stats();else if(k==='set')settings();else if(k==='lib')lib('proto');else if(k==='ai')aiScreen();else home()}
window.addEventListener('popstate',e=>{
 if(document.body.classList.contains('run')){
  if(confirm('Прервать урок? Запись урока не сохранится.')){if(window.__abort)window.__abort()}
  else history.pushState({k:'run'},'');
  return}
 navSilent=true;try{goTab(e.state&&e.state.k?e.state.k:'home')}finally{navSilent=false}});
if(!history.state)history.replaceState({k:'home'},'');
let deferredInstall=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;const b=$('#inst');if(b)b.hidden=false});
window.addEventListener('appinstalled',()=>{deferredInstall=null});
// --- 6. приватность: полное удаление данных, включая кэш приложения
async function wipeAll(){if(!confirm('Удалить все данные, курс и кэш приложения на этом устройстве? Сначала можно сохранить резервную копию.'))return;
 localStorage.clear();
 if('caches' in window)for(const k of await caches.keys())await caches.delete(k);
 if(navigator.serviceWorker)for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();
 location.reload()}
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
applyTheme();
home();

function applyTheme(){
 document.documentElement.dataset.theme=S.set.theme==='light'?'light':'dark';
 const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=S.set.theme==='light'?'#F8F6FC':'#1E1D2E';
 COL.shield=cssv('--ac');COL.booster=cssv('--mint');COL.peak=cssv('--wr');COL.reset=cssv('--lav');
}

/* ===== 10. Администратор: вход, библиотека, советник ИИ ===== */
function applyAdmin(){document.querySelectorAll('[data-t=lib],[data-t=ai]').forEach(b=>b.hidden=!isAdmin())}
async function adminLogin(pw){
 const r=await fetch(SHARED_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin-check',password:pw})});
 if(!r.ok)return false;ADMIN_PW=pw;S.admin=1;save();applyAdmin();return true}
function adminLogout(){ADMIN_PW='';S.admin=0;save();applyAdmin()}
function libDB(){return new Promise((res,rej)=>{const r=indexedDB.open('snr-lib',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function libAll(kind){const db=await libDB();return new Promise(res=>{const q=db.transaction('files').objectStore('files').getAll();q.onsuccess=()=>res(q.result.filter(x=>x.kind===kind))})}
async function libAdd(kind,file){const db=await libDB();const rec={id:Date.now()+'-'+Math.random().toString(36).slice(2,7),kind,name:file.name,type:file.type,size:file.size,blob:file};
 return new Promise((res,rej)=>{const t=db.transaction('files','readwrite');t.objectStore('files').put(rec);t.oncomplete=()=>res(rec);t.onerror=()=>rej(t.error)})}
async function libDel(id){const db=await libDB();return new Promise(res=>{const t=db.transaction('files','readwrite');t.objectStore('files').delete(id);t.oncomplete=()=>res()})}
const LIB_SUBS={sound:'Звуки',media:'Картинки и видео'};
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
async function lib(sub='proto'){
 chrome('lib');if(!isAdmin())return settings();
 const tabs=`<div class="row">${[['proto','Протоколы'],['sound','Звуки'],['media','Картинки и видео']].map(([k,v])=>`<button class="${sub===k?'':'ghost'}" data-sub="${k}">${v}</button>`).join('')}</div>`;
 if(sub==='proto'){
  const bcards=Object.keys(PR).map(p=>`<div class="card pcard"><div class="ptext"><h3>${PR[p].n}</h3><p class="m">${BRIEF[p].short}</p><p class="m">Код: ${p}</p></div>
    <div class="pbtns"><button class="icon" data-play="${p}" title="Тест (не учитывается в статистике)">▶</button><button class="icon" data-pen="${p}" title="Редактировать с ИИ">✎</button></div></div>`).join('');
  const ccards=(S.library||[]).map(x=>`<div class="card pcard"><div class="ptext"><h3>${esc(x.name)}</h3><p class="m">${esc(x.description||'')}</p><p class="m">Основа: ${baseName(x.base)}${x.source==='base'?' · своя версия':' · из студии'}</p></div>
    <div class="pbtns"><button class="icon" data-play="${x.id}" title="Тест (не учитывается в статистике)">▶</button><button class="icon" data-pen="${x.id}" title="Редактировать с ИИ">✎</button></div></div>`).join('');
  html(`<h2>Библиотека</h2>${tabs}<div class="card"><h3>Опубликовать для всех пользователей</h3><p class="m">Протоколы попадают пользователям после публикации. Нажмите, когда протокол готов.</p><button id="pubP">Опубликовать библиотеку</button><p class="m" id="pubPM"></p></div>${bcards}${ccards}`);
 }else{
  const files=await libAll(sub);
  html(`<h2>Библиотека</h2>${tabs}<div class="card"><h3>${LIB_SUBS[sub]}</h3><p class="m">Файлы хранятся на этом устройстве. Чтобы пользователи получали их, нужен сервер хранения (следующий шаг).</p>
   <input type="file" id="up" accept="${sub==='sound'?'audio/*':'image/*,video/*'}"><input type="file" id="replIn" hidden></div>
   <div class="card"><h3>Опубликовать для всех пользователей</h3><p class="m">Публикуются одобренные протоколы и список файлов. Файлы загружаются на сервер вместе с публикацией.</p><button id="pubL">Опубликовать библиотеку</button><p class="m" id="pubM"></p></div>
   ${sub==='sound'?`<div class="card"><h3>Звук для протокола</h3><select id="lnkP">${(S.library||[]).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><select id="lnkF">${files.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select><button id="lnkB" class="ghost">Привязать</button></div>`:''}`+
   (files.length?files.map(f=>`<div class="card"><b>${esc(f.name)}</b><span class="m">${(f.size/1024).toFixed(0)} КБ</span>${previewMedia(f)}${(f.type||'').startsWith('audio')?`<button class="ghost" data-trans="${f.id}">Расшифровать</button>`:''}<button class="ghost" data-repl="${f.id}">Заменить</button>${(f.type||'').startsWith('audio')?`<button class="ghost" data-trim="${f.id}">Обрезать</button>`:''}${(f.type||'').startsWith('image')?`<button class="ghost" data-trim="${f.id}">Обрезать</button>`:''}<button class="ghost" data-del="${f.id}">Удалить</button></div>`).join(''):'<p class="m">Файлов пока нет.</p>'));
  $('#up').onchange=async e=>{const f=e.target.files[0];if(!f)return;await libAdd(sub,f);lib(sub)};
  $('#pubL').onclick=async()=>{$('#pubM').textContent='Публикую…';try{await publishLibrary();$('#pubM').textContent='Опубликовано.'}catch(e){$('#pubM').textContent='Не удалось: '+e.message}};
  if($('#lnkB'))$('#lnkB').onclick=async()=>{const p=(S.library||[]).find(x=>x.id===$('#lnkP').value);if(!p)return;p.sound_file=$('#lnkF').value;const fr=(await libAll('sound')).find(x=>x.id===p.sound_file);if(fr&&fr.segments&&fr.segments.length)p.timeline=segsToTl(fr.segments);save();$('#pubM').textContent='Привязано к «'+p.name+'». Опубликуйте библиотеку.'};
  document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{await libDel(b.dataset.del);lib(sub)});
  document.querySelectorAll('[data-trans]').forEach(b=>b.onclick=async()=>{const rec=files.find(x=>x.id===b.dataset.trans);if(!rec)return;
   if(rec.blob.size>6000000){alert('Файл больше 6 МБ, расшифровка не поддерживается.');return}
   try{const segs=(await callAdmin({action:'transcribe',audio:toB64(await rec.blob.arrayBuffer()),mime:rec.type,name:rec.name})).segments||[];
    await libSetSegments(rec.id,segs);$('#pubM').textContent='Расшифровано: '+segs.length+' фраз с отметками времени.';lib(sub)}
   catch(e){$('#pubM').textContent=e.message==='auth'?'Сессия истекла, войдите заново.':'Не удалось расшифровать. Проверьте, что провайдер поддерживает расшифровку.'}});
  document.querySelectorAll('[data-repl]').forEach(b=>b.onclick=()=>{window.__repl=b.dataset.repl;$('#replIn').click()});
  $('#replIn').onchange=async e=>{const f=e.target.files[0];if(f&&window.__repl){await libUpdate(window.__repl,f);lib(sub)}};
  document.querySelectorAll('[data-trim]').forEach(b=>b.onclick=()=>{const f=files.find(x=>x.id===b.dataset.trim);if(f&&(f.type||'').startsWith('audio'))trimAudio(f.id);else if(f)cropImage(f.id)});
 }
 document.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>lib(b.dataset.sub));
 if($('#pubP'))$('#pubP').onclick=async()=>{$('#pubPM').textContent='Публикую…';try{await publishLibrary();$('#pubPM').textContent='Опубликовано. Пользователи получат протоколы при открытии приложения.'}catch(e){$('#pubPM').textContent='Не удалось: '+e.message}};
 document.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>testSession(b.dataset.play));
 document.querySelectorAll('[data-pen]').forEach(b=>b.onclick=()=>{const id=b.dataset.pen;protoEditor(PR[id]?draftFromBase(id):id)})}

async function syncLibrary(){
 try{const r=await fetch(SHARED_API+'/library');if(!r.ok)return;const j=await r.json();
  S.pub=Array.isArray(j.protocols)?j.protocols:[];S.pubFiles=Array.isArray(j.files)?j.files:[];save()}catch(e){}}
async function publishLibrary(){
 if(!ADMIN_PW)throw new Error('нужен вход администратора');
 const files=[...(await libAll('sound')),...(await libAll('media'))].map(f=>({id:f.id,name:f.name,type:f.type,kind:f.kind,size:f.size}));
 const r=await fetch(SHARED_API+'/library',{method:'PUT',headers:{'Content-Type':'application/json','X-Admin-Password':ADMIN_PW},
  body:JSON.stringify({protocols:(S.library||[]),files})});
 if(!r.ok)throw new Error('сервер ответил '+r.status);
 S.pub=(S.library||[]);S.pubFiles=files;save();return r.json()}
async function uploadShared(rec){
 const r=await fetch(SHARED_API+'/files/'+rec.id,{method:'PUT',headers:{'Content-Type':rec.type||'application/octet-stream','X-Admin-Password':ADMIN_PW},body:rec.blob});
 if(!r.ok)throw new Error('сервер ответил '+r.status)}
function previewMedia(f){
 if(!f.blob)return '';const u=URL.createObjectURL(f.blob);
 if((f.type||'').startsWith('image'))return `<img src="${u}" alt="" style="max-width:100%;border-radius:10px;margin-top:8px">`;
 if((f.type||'').startsWith('video'))return `<video controls src="${u}" style="max-width:100%;border-radius:10px;margin-top:8px"></video>`;
 return `<audio controls src="${u}" style="width:100%;margin-top:8px"></audio>`}
function previewProto(id){
 const x=findCustom(id)||(PR[id]?{name:PR[id].n,steps:BRIEF[id].steps,description:BRIEF[id].short,sound:[],visual:[]}:null);
 if(!x)return;
 html(`<h2>Предпросмотр: ${esc(x.name)}</h2><p class="m">${esc(x.description||'')}</p>
  <div class="card"><ol class="steps">${(x.steps||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ol>
  <p class="m">Звук: ${esc((x.sound||[]).join(', ')||'—')}. Визуально: ${esc((x.visual||[]).join(', ')||'—')}.</p></div>
  <div class="row"><button id="pvPlay">Проиграть 12 секунд</button><button id="pvBack" class="ghost">Назад</button></div>`);
 $('#pvBack').onclick=()=>chrome('lib')||lib('proto');
 $('#pvPlay').onclick=()=>{if(!findCustom(id))return;A.init();startLayers(findCustom(id));setTimeout(()=>stopLayers(),12000)}}
let ED_COLL=false;
function draftFromBase(p){const m=metaOf(p);const id='c_'+Date.now().toString(36);S.library=S.library||[];
 S.library.push({id,name:m.n+' (своя версия)',base:p,description:m.short,steps:m.steps||[],sound:[],visual:[],duration_s:180,stop_if_discomfort:6,sound_file:null,source:'base'});
 save();return id}
function applyDraft(x,p){const keep={id:x.id,source:x.source,sound_file:x.sound_file};Object.assign(x,p,keep);save()}
function protoEditor(id){
 const x=(S.library||[]).find(q=>q.id===id);if(!x){lib('proto');return}
 S.edChat=S.edChat||{};const msgs=S.edChat[id]||[];
 html(`<h2>Редактирование</h2>
  <div class="ed-wrap">
   <div class="card ed-preview pcard"><div class="ptext">
    <h3>${esc(x.name)}</h3><p class="m">${esc(x.description||'')}</p>
    <ol class="steps">${(x.steps||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ol>
    <p class="m">Основа: ${baseName(x.base)} · ${x.duration_s} с · остановка при дискомфорте ${x.stop_if_discomfort}/10</p>
    <p class="m">Звук: ${esc((x.sound||[]).join(', ')||'—')} · Визуал: ${esc((x.visual||[]).join(', ')||'—')}</p>
    <div class="row"><button id="edDel" class="ghost">Удалить протокол</button></div></div><div class="pbtns"><button id="edPlay" class="icon" title="Тест (не учитывается в статистике)">▶</button><button id="edLayers" class="icon" title="Слушать слои">♪</button><button id="edBack" class="icon" title="Назад в библиотеку">←</button></div></div>
   <div class="card ed-chat ${ED_COLL?'collapsed':''}">
    <div class="row"><button id="edToggle" class="ghost">${ED_COLL?'▸ Чат с ИИ':'▾ Чат с ИИ'}</button><span class="m" id="edSt"></span></div>
    <div class="ed-body">
     <div id="edMsgs">${msgs.map(m=>`<div class="msg ${m.role}"><span class="m">${m.role==='user'?'Вы':'ИИ'}</span><p>${esc(m.content).replace(/\n/g,'<br>')}</p></div>`).join('')||'<p class="m">Опишите, что изменить: «добавь шелест», «сделай короче», «новые шаги».</p>'}</div>
     <textarea id="edInp" rows="2" placeholder="Что изменить"></textarea>
     <div class="row"><button id="edSend">Отправить</button></div>
    </div>
   </div>
  </div>`);
 $('#edBack').onclick=()=>lib('proto');
 $('#edPlay').onclick=()=>testSession(id);
 $('#edLayers').onclick=()=>{A.init();startLayers(x);setTimeout(()=>stopLayers(),12000)};
 $('#edDel').onclick=()=>{if(!confirm('Удалить протокол из библиотеки?'))return;S.library=(S.library||[]).filter(q=>q.id!==id);save();lib('proto')};
 $('#edToggle').onclick=()=>{ED_COLL=!ED_COLL;protoEditor(id)};
 $('#edSend').onclick=async()=>{const t=$('#edInp').value.trim();if(!t)return;
  const ctx={role:'user',content:'Текущий протокол (JSON): '+JSON.stringify({name:x.name,base:x.base,description:x.description,steps:x.steps,sound:x.sound,visual:x.visual,duration_s:x.duration_s,stop_if_discomfort:x.stop_if_discomfort})+'. Внеси изменения по просьбе администратора и верни блок ```json с протоколом целиком.'};
  const list=S.edChat[id]||[];list.push({role:'user',content:t});S.edChat[id]=list;save();
  $('#edSt').textContent='ИИ думает…';
  try{const r=await callAdmin({action:'chat',mode:'create',messages:[ctx,...list.slice(-18).map(m=>({role:m.role,content:m.content}))]});
   list.push({role:'assistant',content:r.reply||'(пусто)'});
   if(r.proposal){applyDraft(x,r.proposal);list.push({role:'assistant',content:'Черновик обновлён и сохранён.'})}
   S.edChat[id]=list.slice(-40);save();protoEditor(id);
  }catch(e){$('#edSt').textContent=e.message==='auth'?'Сессия истекла, войдите заново.':'Нет связи с сервером'}};
}
function editProto(id){
 const x=(S.library||[]).find(q=>q.id===id);if(!x)return;
 const sndOpts=['гул','тиканье','тишина','шелест','дыхание'],visOpts=['мягкое свечение','тишина','спокойный фон'];
 html(`<h2>Редактирование протокола</h2><div class="card">
  <label>Название</label><input id="ePn" value="${esc(x.name)}">
  <label>Описание</label><textarea id="ePd" rows="2">${esc(x.description||'')}</textarea>
  <label>Шаги (каждый с новой строки)</label><textarea id="ePs" rows="4">${esc((x.steps||[]).join('\n'))}</textarea>
  <label>Основа</label><select id="ePb">${['custom','shield','booster','peak','reset'].map(b=>`<option value="${b}" ${x.base===b?'selected':''}>${baseName(b)}</option>`).join('')}</select>
  <label>Длительность, с</label><select id="ePt">${[60,120,180,300].map(v=>`<option value="${v}" ${x.duration_s===v?'selected':''}>${v}</option>`).join('')}</select>
  <label>Остановка при дискомфорте (3–10)</label><input id="ePx" type="number" min="3" max="10" value="${x.stop_if_discomfort||6}">
  <p class="m">Звуки</p>${sndOpts.map(o=>`<label class="chk"><input type="checkbox" data-snd="${o}" ${(x.sound||[]).includes(o)?'checked':''}> ${o}</label>`).join('')}
  <p class="m">Визуал</p>${visOpts.map(o=>`<label class="chk"><input type="checkbox" data-vis="${o}" ${(x.visual||[]).includes(o)?'checked':''}> ${o}</label>`).join('')}
  <div class="row"><button id="ePsave">Сохранить</button><button id="ePcancel" class="ghost">Назад</button></div><p class="m" id="ePm"></p></div>`);
 $('#ePcancel').onclick=()=>lib('proto');
 $('#ePsave').onclick=()=>{x.name=$('#ePn').value.trim().slice(0,60)||x.name;x.description=$('#ePd').value.slice(0,300);
  x.steps=$('#ePs').value.split('\n').map(t=>t.trim()).filter(Boolean).slice(0,6);x.base=$('#ePb').value;x.duration_s=+$('#ePt').value;
  x.stop_if_discomfort=Math.min(10,Math.max(3,+$('#ePx').value||6));
  x.sound=[...document.querySelectorAll('[data-snd]:checked')].map(e=>e.dataset.snd);
  x.visual=[...document.querySelectorAll('[data-vis]:checked')].map(e=>e.dataset.vis);save();$('#ePm').textContent='Сохранено.'}}
function encodeWav(buf){
 const ch=buf.numberOfChannels,sr=buf.sampleRate,len=buf.length,data=new Int16Array(len*ch);
 for(let c=0;c<ch;c++){const d=buf.getChannelData(c);for(let i=0;i<len;i++){const v=Math.max(-1,Math.min(1,d[i]));data[i*ch+c]=v<0?v*0x8000:v*0x7fff}}
 const out=new DataView(new ArrayBuffer(44+data.length*2));const w=(o,t)=>{for(let k=0;k<t.length;k++)out.setUint8(o+k,t.charCodeAt(k))};
 w(0,'RIFF');out.setUint32(4,36+data.length*2,true);w(8,'WAVE');w(12,'fmt ');out.setUint32(16,16,true);out.setUint16(20,1,true);
 out.setUint16(22,ch,true);out.setUint32(24,sr,true);out.setUint32(28,sr*ch*2,true);out.setUint16(32,ch*2,true);out.setUint16(34,16,true);
 w(36,'data');out.setUint32(40,data.length*2,true);
 for(let i=0;i<data.length;i++)out.setInt16(44+i*2,data[i],true);
 return new Blob([out],{type:'audio/wav'})}
async function getRec(db,id){return new Promise(res=>{const q=db.transaction('files').objectStore('files').get(id);q.onsuccess=()=>res(q.result)})}
async function libUpdate(id,file){
 const db=await libDB();const rec=await getRec(db,id);if(!rec)return;
 const nr={...rec,name:file.name,type:file.type,size:file.size,blob:file};
 await new Promise((res,rej)=>{const t=db.transaction('files','readwrite');t.objectStore('files').put(nr);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function trimAudio(id){
 const db=await libDB();const rec=await getRec(db,id);if(!rec)return;const url=URL.createObjectURL(rec.blob);
 html(`<h2>Обрезка звука</h2><div class="card"><p class="m">${esc(rec.name)}</p><audio controls src="${url}" style="width:100%"></audio>
  <label>Начало, с</label><input id="tS" type="number" min="0" step="0.1" value="0">
  <label>Конец, с (0 — до конца)</label><input id="tE" type="number" min="0" step="0.1" value="0">
  <div class="row"><button id="tApply">Применить</button><button id="tCancel" class="ghost">Назад</button></div><p class="m" id="tM"></p></div>`);
 $('#tCancel').onclick=()=>lib('sound');
 $('#tApply').onclick=async()=>{try{$('#tM').textContent='Обрабатываю…';
   const ctx=new (window.AudioContext||window.webkitAudioContext)();const buf=await ctx.decodeAudioData(await rec.blob.arrayBuffer());
   const st=Math.max(0,+$('#tS').value||0),en=(+$('#tE').value>0)?Math.min(buf.duration,+$('#tE').value):buf.duration;
   if(en<=st){$('#tM').textContent='Конец должен быть больше начала.';return}
   const s0=Math.floor(st*buf.sampleRate),s1=Math.floor(en*buf.sampleRate);
   const out=ctx.createBuffer(buf.numberOfChannels,s1-s0,buf.sampleRate);
   for(let c=0;c<buf.numberOfChannels;c++)out.getChannelData(c).set(buf.getChannelData(c).subarray(s0,s1));
   const wav=encodeWav(out);await libUpdate(id,new File([wav],rec.name.replace(/\.[^.]+$/,'')+'_обрезка.wav',{type:'audio/wav'}));lib('sound')}
  catch(e){$('#tM').textContent='Не удалось обрезать: '+e.message}}}
async function cropImage(id){
 const db=await libDB();const rec=await getRec(db,id);if(!rec)return;const url=URL.createObjectURL(rec.blob);
 html(`<h2>Обрезка картинки</h2><div class="card"><img id="cImg" src="${url}" alt="" style="max-width:100%;border-radius:10px"><p class="m" id="cSz"></p>
  <div class="grid"><label>X<input id="cX" type="number" min="0" value="0"></label><label>Y<input id="cY" type="number" min="0" value="0"></label>
  <label>Ширина<input id="cW" type="number" min="1"></label><label>Высота<input id="cH" type="number" min="1"></label></div>
  <div class="row"><button id="cApply">Применить</button><button id="cCancel" class="ghost">Назад</button></div><p class="m" id="cM"></p></div>`);
 const img=$('#cImg');img.onload=()=>{$('#cW').value=img.naturalWidth;$('#cH').value=img.naturalHeight;$('#cSz').textContent='Размер: '+img.naturalWidth+'×'+img.naturalHeight+' px'};
 $('#cCancel').onclick=()=>lib('media');
 $('#cApply').onclick=async()=>{try{const bmp=await createImageBitmap(rec.blob);
   const x=Math.max(0,+$('#cX').value||0),y=Math.max(0,+$('#cY').value||0);
   const w=Math.min(bmp.width-x,+$('#cW').value),h=Math.min(bmp.height-y,+$('#cH').value);
   if(w<1||h<1){$('#cM').textContent='Неверная область.';return}
   const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(bmp,x,y,w,h,0,0,w,h);
   const b=await new Promise(res=>cv.toBlob(res,'image/png'));
   await libUpdate(id,new File([b],rec.name.replace(/\.[^.]+$/,'')+'_обрезка.png',{type:'image/png'}));lib('media')}
  catch(e){$('#cM').textContent='Не удалось: '+e.message}}}
function adviseSummary(){
 const L=S.log.filter(l=>l.type==='session').slice(-10);
 return {vuln:S.vuln,base:S.base,sessions:L.map(l=>({proto:l.proto,delta:l.post-l.pre,disc:l.disc,lvl:l.lvl,series:(l.hr_series||[]).map(x=>x[1])}))}}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
function findCustom(id){return (S.pub||[]).find(x=>x.id===id)||(S.library||[]).find(x=>x.id===id)}
function metaOf(p){if(PR[p])return {n:PR[p].n,short:BRIEF[p].short,steps:BRIEF[p].steps,base:p};const c=findCustom(p);return c?{n:c.name,short:c.description,steps:c.steps||[],base:c.base}:{n:String(p),short:'',steps:[],base:'shield'}}
function protoName(id){return metaOf(id).n}
function protoBase(id){return metaOf(id).base}
function libProtos(){return [...Object.keys(PR).map(id=>({id,name:PR[id].n,base:id,description:BRIEF[id].short})),...(S.library||[]).map(x=>({id:x.id,name:x.name,base:x.base,description:x.description}))]}
async function callAdmin(body){
 const r=await fetch(SHARED_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,password:ADMIN_PW})});
 if(r.status===403){adminLogout();throw new Error('auth')}
 if(!r.ok)throw new Error('http '+r.status);return r.json()}
let AI_SUB='create';
const chatsAll=()=>{if(!S.chats){S.chats=[];if(S.studio&&S.studio.length)S.chats.push({id:'h_old',kind:'create',title:'Прошлый чат',msgs:S.studio,t:Date.now()})}return S.chats};
const chatsOf=k=>chatsAll().filter(c=>c.kind===k);
const newId=()=>'h'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
function activeChat(k){S.active=S.active||{};let c=chatsOf(k).find(x=>x.id===S.active[k]);
 if(!c){c={id:newId(),kind:k,title:'Новый чат',msgs:[],t:Date.now()};chatsAll().push(c);S.active[k]=c.id;save()}return c}
function newChat(k){S.active=S.active||{};const c={id:newId(),kind:k,title:'Новый чат',msgs:[],t:Date.now()};chatsAll().push(c);S.active[k]=c.id;
 S.chats=chatsAll().slice(-60);save();aiScreen(k)}
function setActive(k,id){S.active=S.active||{};S.active[k]=id;save();aiScreen(k)}
function delChat(k,id){S.chats=chatsAll().filter(c=>c.id!==id);if(S.active&&S.active[k]===id)S.active[k]=null;save();aiScreen(k)}
function saveProposal(p){S.library=S.library||[];const ex=S.library.find(x=>x.name===p.name&&x.base===p.base);
 if(ex){Object.assign(ex,p);save();return ex.id}
 const id='c_'+Date.now().toString(36);S.library.push({id,...p,source:'ai'});save();return id}
function scenarioPrompt(extra){
 const v=S.vuln||[],names=['звук','зрение','давление времени'];const top=v.length?v.indexOf(Math.max(...v)):-1;
 const last=S.log.filter(l=>l.type==='session').slice(-5);
 const ctx=`Контекст пользователя (без имени): главный спектр — ${top>=0?names[top]+' '+v[top]+'%':'не определён'}. `+
  `Последние уроки: ${last.map(l=>`${metaOf(l.proto).n}, пульс ${l.post-l.pre>0?'+':''}${l.post-l.pre}, дискомфорт ${l.disc}`).join('; ')||'уроков ещё нет'}.`;
 return ctx+'\n\n'+(extra||'Предложи 3–4 вымышленные ситуации в формате «Пульс повысился, когда …» для разных спектров (звук, зрение, тишина, давление времени, покой). Коротко опиши, что происходит в каждой. Я выберу одну, и мы доработаем её в протокол.')}
function extractScenarios(text){
 return String(text||'').split('\n').map(l=>l.replace(/^[\s\-\*\d\.\)]+/,'').replace(/\*\*/g,'').trim())
  .filter(l=>/пульс повысился/i.test(l)).slice(0,5)}
function newSituationChat(sit){S.active=S.active||{};
 const c={id:newId(),kind:'create',title:sit.slice(0,40),situation:sit,msgs:[],t:Date.now(),
  startPrompt:`Ситуация: «${sit}». Предложи 2–3 идеи протокола для этой ситуации: название, цель, ощущения, звуковые и визуальные слои, шаги. Не давай медицинских обещаний. Потом я выберу идею, и мы будем уточнять её и делать прототипы.`};
 chatsAll().push(c);S.active.create=c.id;S.chats=chatsAll().slice(-60);save();aiScreen('create')}
function toB64(buf){let s='';const u=new Uint8Array(buf);for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}
function segsToTl(segs){return (segs||[]).slice(0,8).map(x=>({t:Math.min(55,Math.max(0,Math.round(x.start||0))),text:String(x.text||'').slice(0,140)})).filter(x=>x.text)}
async function libSetSegments(id,segs){const db=await libDB();const rec=await getRec(db,id);if(!rec)return;
 await new Promise((res,rej)=>{const t=db.transaction('files','readwrite');t.objectStore('files').put({...rec,segments:segs});t.oncomplete=res;t.onerror=()=>rej(t.error)})}
function applyAttach(a,files){
 const p=(S.library||[]).find(x=>x.id===a.protocol);const f=files.find(x=>x.id===a.file);
 if(!p||!f){$('#sst').textContent='Не нашёл протокол или звук для прикрепления.';return}
 p.sound_file=f.id;if(f.segments&&f.segments.length)p.timeline=segsToTl(f.segments);save();
 $('#sst').textContent='Звук «'+f.name+'» прикреплён к протоколу «'+p.name+'»'+(p.timeline&&p.timeline.length?' с надписями по звуку.':'.')}
function lastSavedFor(C){
 const pm=[...C.msgs].reverse().find(m=>m.proposal);if(!pm)return null;
 return (S.library||[]).find(x=>x.name===pm.proposal.name&&x.base===pm.proposal.base)||null}
function renderMsg(m,i){
 if(m.hidden)return '';
 const ideas=(m.ideas||[]).map((d,j)=>`<div class="card idea"><b>${esc(d.name)}</b><p class="m">${esc(d.mechanic)}</p><p class="m">Звук: ${esc(d.sound||'—')} · Визуал: ${esc(d.visual||'—')}</p><button class="ghost" data-idea="${i}:${j}">Выбрать</button></div>`).join('');
 const asts=(m.assets||[]).map((a,j)=>`<div class="card asset"><b>Нужен: ${esc(a.label)}</b><p class="m">${esc(a.purpose||'')}</p>
   <div class="row"><label class="filebtn ghost">Загрузить файл<input type="file" data-asset="${i}:${j}" accept="${a.kind==='sound'?'audio/*':'image/*,video/*'}" hidden></label>
   ${a.kind==='sound'?`<button class="ghost" data-asynth="${i}:${j}">Синтез вместо файла</button>`:''}</div></div>`).join('');
 const scn=(m.role==='assistant'&&!m.proposal)?extractScenarios(m.content):[];
 const scnBtns=scn.map((t,j)=>`<button class="ghost scn" data-scn="${i}:${j}">Создать протокол: ${esc(t.slice(0,70))}</button>`).join('');
 const p=m.proposal;
 const card=p?`<div class="card"><b>${esc(p.name)}</b> <span class="m">основа: ${baseName(p.base)}, ${p.duration_s} с</span><p>${esc(p.description)}</p>
  <ol class="steps">${p.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
  ${(p.timeline&&p.timeline.length)?`<ol class="tl-list">${p.timeline.map(t=>`<li><b>${t.t} с</b> ${esc(t.text)}</li>`).join('')}</ol>`:''}
  <p class="m">Звук: ${esc(p.sound.join(', ')||'—')}. Визуально: ${esc(p.visual.join(', ')||'—')}. Остановка при дискомфорте от ${p.stop_if_discomfort}/10.</p>
  <button data-save="${i}">В библиотеку</button> <button data-test="${i}" class="ghost">Тест</button> <button class="ghost" data-fix="${i}">Доработать</button></div>`:'';
 return `<div class="msg ${m.role}"><span class="m">${m.role==='user'?'Вы':'ИИ'}</span><p>${esc(m.content).replace(/\n/g,'<br>')}</p>${scnBtns}${ideas}${card}${asts}</div>`}
async function sendMsg(text,opts={}){
 const k=AI_SUB,C=activeChat(k);
 text=(text||'').trim();if(!text)return;
 C.msgs.push({role:'user',content:text,hidden:!!opts.hidden});
 if(C.title==='Новый чат'&&!opts.hidden)C.title=text.slice(0,40);
 save();aiScreen(k);$('#sst').textContent='ИИ думает…';
 try{const fullFiles=await libAll('sound');const r=await callAdmin({action:'chat',mode:k==='create'?'create':'chat',messages:C.msgs.slice(-20).map(m=>({role:m.role,content:m.content})),files:fullFiles.map(x=>({id:x.id,name:x.name})),protocols:(S.library||[]).map(x=>({id:x.id,name:x.name}))});
  C.msgs.push({role:'assistant',content:r.reply||'(пустой ответ)',proposal:r.proposal||null,assets:r.assets||null,ideas:r.ideas||null});C.msgs=C.msgs.slice(-40);C.t=Date.now();
  if(r.proposal){saveProposal(r.proposal);$('#sst')&&($('#sst').textContent='')}
  save();aiScreen(k);
  if(r.attach)applyAttach(r.attach,fullFiles);
  if(k==='create'&&!r.proposal&&!opts.hidden&&!opts.noRetry&&/протокол|создай|сделай/i.test(text))
   sendMsg('Оформи протокол полностью в блоке ```json: name, base, description, steps, sound, visual, duration_s, stop_if_discomfort и timeline с надписями по секундам. Если нужен звук, запроси его в блоке ```assets.',{hidden:true,noRetry:true});
 }catch(e){aiScreen(k);$('#sst').textContent=e.message==='auth'?'Сессия истекла, войдите заново.':'Нет связи с сервером: '+e.message}}
function aiScreen(k){
 k=k||AI_SUB;AI_SUB=k;chrome('ai');if(!isAdmin())return settings();
 const C=activeChat(k);
 if(k==='create'&&!C.msgs.length&&!C.autostarted){C.autostarted=true;save();setTimeout(()=>sendMsg(C.startPrompt||scenarioPrompt(),{hidden:true}),0)}
 const list=chatsOf(k).slice().sort((x,y)=>(y.t||0)-(x.t||0));
 const sideOn=S.sideOpen??(window.innerWidth>=640);
 html(`<h2>ИИ</h2>
 <div class="row">${[['create','Создание протокола'],['chat','Чат']].map(([id,t])=>`<button data-aisub="${id}" class="${k===id?'':'ghost'}">${t}</button>`).join('')}</div>
 <div class="ai-wrap">
  <aside class="side ${sideOn?'open':''}"><button id="newC" class="ghost">+ Новый чат</button>
   ${list.map(c=>`<div class="citem ${c.id===C.id?'on':''}"><span data-pick="${c.id}">${esc(c.title)}</span><button class="ghost" data-del="${c.id}">✕</button></div>`).join('')}
  </aside>
  <div class="ai-main">
   <div class="row chat-head"><button id="togSide" class="ghost">☰ Чаты (${list.length})</button><select id="chatSel" class="chat-sel">${list.map(c=>`<option value="${c.id}" ${c.id===C.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select><button id="newBr" class="ghost">+ Ветка</button><button id="themeQ" class="ghost">${S.set.theme==='light'?'Тёмная':'Светлая'}</button></div>
   ${C.situation?`<div class="card hero"><span class="m">Ситуация</span><p>${esc(C.situation)}</p></div>`:''}
   <div id="chat">${C.msgs.map((m,i)=>renderMsg(m,i)).join('')||'<p class="m">Сообщений пока нет.</p>'}</div>
   ${k==='create'?'<div class="row"><button id="moreS" class="ghost">Другие ситуации</button></div>':''}<div class="card"><textarea id="inp" rows="3" placeholder="${k==='create'?'Ответьте на ситуацию или попросите оформить протокол':'Сообщение'}"></textarea>
    <div class="row"><button id="send">Отправить</button>${SR?'<button id="mic" class="ghost">Голос</button>':''}<label class="filebtn ghost">Файл<input type="file" id="att" hidden></label></div>
    <p class="m" id="sst"></p></div>
   ${k==='chat'?`<div class="card"><h3>Пульс и расписание</h3><div class="row"><button id="adv" class="ghost">Решение по пульсу</button><button id="sch" class="ghost">Составить расписание</button></div><p class="m" id="aiOut"></p><div id="aiRes"></div></div>`:''}
  </div>
 </div>`);
 document.querySelectorAll('[data-aisub]').forEach(b=>b.onclick=()=>aiScreen(b.dataset.aisub));
 $('#togSide').onclick=()=>{S.sideOpen=!S.sideOpen;save();aiScreen(k)};
 $('#newC').onclick=()=>newChat(k);
 $('#chatSel').onchange=e=>setActive(k,e.target.value);
 $('#newBr').onclick=()=>newChat(k);
 $('#themeQ').onclick=()=>{S.set.theme=S.set.theme==='light'?'dark':'light';save();applyTheme();aiScreen(k)};
 document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{S.sideOpen=false;setActive(k,b.dataset.pick)});
 document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{if(confirm('Удалить чат?'))delChat(k,b.dataset.del)});
 $('#send').onclick=()=>sendMsg($('#inp').value);
 if($('#moreS'))$('#moreS').onclick=()=>sendMsg(scenarioPrompt('Предложи другие ситуации, не повторяя прошлые: другие спектры и другие обстоятельства (когда пульс повысился). Формат: «Пульс повысился, когда …».'),{hidden:true});
 if($('#mic'))$('#mic').onclick=()=>{const rec=new SR();rec.lang='ru-RU';rec.interimResults=false;
  rec.onresult=e=>{$('#inp').value+=e.results[0][0].transcript};rec.onerror=()=>{$('#sst').textContent='Голос не распознан.'};rec.start();$('#sst').textContent='Говорите…'};
 $('#att').onchange=async e=>{const f=e.target.files[0];if(!f)return;
  if(/text\/|json|\.md$|\.txt$/.test(f.type+' '+f.name)){const t=(await f.text()).slice(0,4000);sendMsg('Вложение «'+f.name+'»:\n'+t)}
  else{await libAdd('media',f);$('#sst').textContent='Файл сохранён в библиотеку: '+f.name}};
 document.querySelectorAll('[data-idea]').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset.idea.split(':').map(Number);const d=C.msgs[i].ideas[j];sendMsg('Выбрана идея «'+d.name+'». Сделай прототип протокола и спроси, нужен ли звук или картинка.')});
 document.querySelectorAll('[data-asset]').forEach(inp=>inp.onchange=async e=>{const f=e.target.files[0];if(!f)return;const [i,j]=inp.dataset.asset.split(':').map(Number);
  const a=C.msgs[i].assets[j];const rec=await libAdd(a.kind==='sound'?'sound':'media',f);const P=lastSavedFor(C);
  if(P&&a.kind==='sound'){P.sound_file=rec.id;save()}
  $('#sst').textContent=P&&a.kind==='sound'?'Файл добавлен и привязан к протоколу «'+P.name+'».':'Файл сохранён в библиотеку: '+f.name});
 document.querySelectorAll('[data-asynth]').forEach(b=>b.onclick=()=>{const P=lastSavedFor(C);if(!P){$('#sst').textContent='Сначала сохраните протокол.';return}
  if(!(P.sound||[]).includes('гул'))P.sound=[...(P.sound||[]),'гул'];save();$('#sst').textContent='Добавлен синтезированный гул в протокол «'+P.name+'».'});
 document.querySelectorAll('[data-scn]').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset.scn.split(':').map(Number);const sit=extractScenarios(C.msgs[i].content)[j];if(sit)newSituationChat(sit)});
 document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>{const p=C.msgs[+b.dataset.save].proposal;saveProposal(p);$('#sst').textContent='«'+p.name+'» сохранён в библиотеку.'});
 document.querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>{const p=C.msgs[+b.dataset.test].proposal;testSession(saveProposal(p))});
 document.querySelectorAll('[data-fix]').forEach(b=>b.onclick=()=>{$('#inp').value='Доработай протокол «'+C.msgs[+b.dataset.fix].proposal.name+'»: ';$('#inp').focus()});
 if($('#adv'))$('#adv').onclick=async()=>{$('#aiOut').textContent='Думаю…';
  try{const a=await callAdmin({action:'advise',summary:adviseSummary()});$('#aiOut').textContent='';
   $('#aiRes').innerHTML=`<div class="card hero"><span class="m">${a.significant_change?'Изменение значимое':'Изменение незначимое'}</span><p>${esc(a.summary)}</p><h3>Следующий: ${esc(protoName(a.next_protocol))}</h3><p class="m">${esc(a.reason)}</p><button id="apply">Применить к уроку ${curDay()}</button></div>`;
   $('#apply').onclick=()=>{S.aiNext={lesson:curDay(),proto:a.next_protocol,reason:a.reason};save();$('#aiOut').textContent='Применено.'}}
  catch(e){$('#aiOut').textContent=e.message==='auth'?'Сессия истекла, войдите заново.':'Нет связи с сервером.'}};
 if($('#sch'))$('#sch').onclick=async()=>{$('#aiOut').textContent='Составляю расписание…';
  try{const r=await callAdmin({action:'schedule',library:libProtos().map(x=>({id:x.id,name:x.name,base:x.base,description:x.description})),summary:adviseSummary(),days:14});
   S.schedule=r.schedule;save();$('#aiOut').textContent='Расписание составлено. Его можно изменить в Настройках → Расписание.'}
  catch(e){$('#aiOut').textContent=e.message==='auth'?'Сессия истекла, войдите заново.':'Не удалось составить расписание.'}}}

function scheduleCard(){
 const L=libProtos();
 const rows=(S.schedule||[]).map((x,i)=>`<div class="row"><span>Урок ${x.lesson}</span><select data-si="${i}">${L.map(p=>`<option value="${esc(p.id)}" ${p.id===x.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><p class="m">${esc(x.note||'')}</p>`).join('');
 return `<div class="card"><h2>Расписание</h2>${rows||'<p class="m">Расписание не задано: уроки подбираются по вашей реакции.</p>'}
  ${S.schedule&&S.schedule.length?'<button id="sclr" class="ghost">Вернуть автоматический выбор</button>':''}</div>`}
