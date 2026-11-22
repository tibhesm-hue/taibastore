const API="https://api.cloudflare.com/client/v4",H={Authorization:"Bearer "+process.env.CF_TOKEN,"Content-Type":"application/json"};
const g=async(p,m,b)=>{const r=await fetch(API+p,{method:m||"GET",headers:H,body:b?JSON.stringify(b):undefined});let j={};try{j=await r.json()}catch(e){}return j};
const a=(await g("/accounts")).result[0];const st=await g("/accounts/"+a.id+"/workers/scripts/itqan/settings");
const d1=(st.result.bindings||[]).find(b=>b.type==="d1");console.log("d1",!!d1);
const Q=JSON.parse(process.env.QS||"[]");
for(const q of Q){if(!/^\s*(SELECT|PRAGMA)/i.test(q)){console.log("skip",q);continue}const r=await g("/accounts/"+a.id+"/d1/database/"+d1.id+"/query","POST",{sql:q});console.log("Q:",q);console.log(JSON.stringify(r.result&&r.result[0]&&r.result[0].results||r.errors).slice(0,3000))}
