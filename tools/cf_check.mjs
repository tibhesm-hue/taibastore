const API="https://api.cloudflare.com/client/v4",H={Authorization:"Bearer "+process.env.CF_TOKEN};
const g=async p=>{const r=await fetch(API+p,{headers:H});let j={};try{j=await r.json()}catch(e){}return {s:r.status,ok:j.success,e:(j.errors||[]).map(x=>x.code+":"+x.message).join(" | "),r:j.result}};
const accs=(await g("/accounts")).r||[];
for(const a of accs){console.log("account",a.name);
 const r2=await g("/accounts/"+a.id+"/r2/buckets");console.log("R2:",r2.s,r2.ok,r2.e,JSON.stringify(r2.r).slice(0,300));
 const d1=await g("/accounts/"+a.id+"/d1/database");console.log("D1:",d1.s,d1.ok,d1.e,JSON.stringify((d1.r||[]).map(x=>({n:x.name,size:x.file_size,ver:x.version}))));
 const sub=await g("/accounts/"+a.id+"/subscriptions");console.log("subs:",sub.s,sub.e,JSON.stringify((sub.r||[]).map(x=>x.rate_plan&&x.rate_plan.id)));
 const tv=await g("/user/tokens/verify");console.log("token:",tv.s,JSON.stringify(tv.r));}
