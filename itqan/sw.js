/* v3: الصفحة تُجلب من الشبكة دائماً حتى يصل كل تحديث فوراً؛ وإذا تأخر النت أكثر من 6 ثوانٍ تُفتح آخر نسخة محفوظة بدل التعليق */
const C='itq-pages';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
  if(!(r.mode==='navigate'||/\.html$/.test(u.pathname)||u.pathname.endsWith('/')))return;
  const key=u.origin+u.pathname;
  e.respondWith((async()=>{
    const net=fetch(key+u.search,{cache:'no-store',credentials:'same-origin'}).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(key,cp)).catch(()=>{})}return res});
    let old=null;try{old=await caches.match(key)}catch(x){}
    if(!old)return net.catch(()=>fetch(r));
    return Promise.race([net,new Promise(ok=>setTimeout(()=>ok(old),6000))]).catch(()=>old);
  })());
});
