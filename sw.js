/* Service worker: офлайн-кэш оболочки (cache-first). Меняйте VER при обновлении файлов. */
const VER='snr-v11211',FILES=['./','index.html','style.css','app.js','manifest.json','icon.svg','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VER).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==VER).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
 // Запросы к серверу (библиотека, ИИ) не кэшируем: иначе у пользователей остаются старые протоколы.
 if(new URL(e.request.url).origin!==self.location.origin)return;
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{const cp=n.clone();caches.open(VER).then(c=>c.put(e.request,cp));return n}).catch(()=>caches.match('index.html'))))});
