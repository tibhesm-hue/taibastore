// Deploys itqan/worker.js + itqan/b.js to the Cloudflare Worker "itqan", keeping its existing bindings (D1).
import fs from "node:fs";
const T=process.env.CF_TOKEN,NAME="itqan",API="https://api.cloudflare.com/client/v4";
if(!T){console.error("CF_TOKEN secret is missing");process.exit(1)}
const H={Authorization:"Bearer "+T};
const j=async(u,o={})=>{const r=await fetch(API+u,{...o,headers:{...H,...(o.headers||{})}});const t=await r.text();let x;try{x=JSON.parse(t)}catch(e){x={success:false,raw:t}}if(!x.success){console.error(u,r.status,JSON.stringify(x.errors||x.raw).slice(0,800));process.exit(1)}return x.result};
const accs=await j("/accounts");let acc=null;
for(const a of accs){const r=await fetch(API+"/accounts/"+a.id+"/workers/scripts/"+NAME+"/settings",{headers:H});if(r.ok){acc=a;break}}
if(!acc){console.error("worker "+NAME+" not found in any account");process.exit(1)}
console.log("account:",acc.name);
const st=await j("/accounts/"+acc.id+"/workers/scripts/"+NAME+"/settings");
console.log("bindings:",(st.bindings||[]).map(b=>b.type+":"+b.name).join(", "));
const meta={main_module:"worker.js",compatibility_date:st.compatibility_date||"2024-09-01",compatibility_flags:st.compatibility_flags||[],keep_bindings:["d1","secret_text","secret_key","plain_text","kv_namespace","r2_bucket","durable_object_namespace","service","queue","analytics_engine","ai","vectorize","hyperdrive","browser","version_metadata","json","wasm_module","text_blob","data_blob","mtls_certificate","dispatch_namespace","workflow","assets","send_email","pipelines","secrets_store_secret"]};
if(!(st.bindings||[]).some(b=>b.type==="r2_bucket"&&b.name==="AU"))meta.bindings=[{type:"r2_bucket",name:"AU",bucket_name:"itqan-audio"}];
const fd=new FormData();
fd.append("metadata",new Blob([JSON.stringify(meta)],{type:"application/json"}));
for(const f of ["worker.js","b.js"])fd.append(f,new Blob([fs.readFileSync("itqan/"+f,"utf8")],{type:"application/javascript+module"}),f);
await j("/accounts/"+acc.id+"/workers/scripts/"+NAME,{method:"PUT",body:fd});
console.log("uploaded");
await new Promise(r=>setTimeout(r,4000));
const r=await fetch("https://itqan.w-f-almateq.workers.dev/");console.log("live:",await r.text());
