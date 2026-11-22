const API="https://api.cloudflare.com/client/v4",H={Authorization:"Bearer "+process.env.CF_TOKEN,"Content-Type":"application/json"};
const g=async(p,m,b)=>{const r=await fetch(API+p,{method:m||"GET",headers:H,body:b?JSON.stringify(b):undefined});let j={};try{j=await r.json()}catch(e){}return {s:r.status,ok:j.success,e:(j.errors||[]).map(x=>x.code+":"+x.message).join(" | "),r:j.result}};
const accs=(await g("/accounts")).r||[];
for(const a of accs){console.log("account",a.name);
 let r2=await g("/accounts/"+a.id+"/r2/buckets");console.log("R2 list:",r2.s,r2.ok,r2.e,JSON.stringify(r2.r).slice(0,300));
 const has=r2.r&&(r2.r.buckets||[]).some(b=>b.name==="itqan-audio");
 if(!has){const c=await g("/accounts/"+a.id+"/r2/buckets","POST",{name:"itqan-audio"});console.log("R2 create:",c.s,c.ok,c.e,JSON.stringify(c.r).slice(0,200))}
 r2=await g("/accounts/"+a.id+"/r2/buckets");console.log("R2 after:",r2.s,r2.ok,JSON.stringify(r2.r).slice(0,300));}
