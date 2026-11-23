const API="https://api.cloudflare.com/client/v4",H={Authorization:"Bearer "+process.env.CF_TOKEN,"Content-Type":"application/json"};
const g=async(p,m,b)=>{const r=await fetch(API+p,{method:m||"GET",headers:H,body:b?JSON.stringify(b):undefined});let j={};try{j=await r.json()}catch(e){}return {s:r.status,ok:j.success,e:(j.errors||[]).map(x=>x.code+":"+x.message).join("|"),r:j.result}};
const mode=process.env.MODE||"read",want=process.env.NEWSUB||"";
const accs=(await g("/accounts")).r||[];
for(const a of accs){console.log("account",a.name,a.id);
 const s=await g("/accounts/"+a.id+"/workers/subdomain");console.log("subdomain:",s.s,s.ok,s.e,JSON.stringify(s.r));
 const w=await g("/accounts/"+a.id+"/workers/scripts");console.log("scripts:",w.s,w.ok,JSON.stringify((w.r||[]).map(x=>x.id)));
 if(mode==="set"&&want&&s.ok&&s.r&&s.r.subdomain!==want){const c=await g("/accounts/"+a.id+"/workers/subdomain","PUT",{subdomain:want});console.log("SET:",c.s,c.ok,c.e,JSON.stringify(c.r));const s2=await g("/accounts/"+a.id+"/workers/subdomain");console.log("after:",JSON.stringify(s2.r))}}
