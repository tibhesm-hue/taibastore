self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
/* owner 24 Nov: the POS page (and what it needs) is kept on the laptop, so it opens and sells even when the internet is cut; sales wait in the browser and go to the ledger when it is back */
const POSC='pos-v1';
const posKeep=u=>u.origin===self.location.origin?(/^\/pos\/?$/.test(u.pathname)||u.pathname==='/qr.js'):(u.hostname==='unpkg.com'&&u.pathname.indexOf('@zxing/library')>=0);
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);
 if(posKeep(u)){e.respondWith(fetch(e.request).then(async r=>{try{if(r&&r.ok){const c=r.clone();let ok=true;if(u.origin===self.location.origin&&u.pathname!=='/qr.js'){const t=await c.clone().text();ok=t.indexOf('id="scGo"')>=0}if(ok)(await caches.open(POSC)).put(e.request,c)}}catch(x){}return r}).catch(()=>caches.open(POSC).then(c=>c.match(e.request,{ignoreSearch:true})).then(r=>r||new Response('',{status:503}))));return}
 e.respondWith(fetch(e.request).catch(()=>caches.match(e.request).then(r=>r||new Response('',{status:503}))))});
