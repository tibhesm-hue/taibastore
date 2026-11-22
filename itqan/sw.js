/* v2: الصفحة تُجلب من الشبكة دائماً حتى يصل كل تحديث فوراً */
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;if(r.mode==='navigate'||/\.html$/.test(u.pathname)||u.pathname.endsWith('/')){e.respondWith(fetch(r,{cache:'no-store'}).catch(()=>fetch(r)))}});
