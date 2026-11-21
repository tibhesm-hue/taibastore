const KEY="taj-48132d5dec65",ADMH="e8cdf946bf1d0637d6c0e55cf9ee4700a8f9d4b4906f9fcb42ec44f0ed4e41d0";
export default{async fetch(req,env){const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-Taj-Key"};const json=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const vals=Object.values(env||{});if(req.method==="OPTIONS")return new Response(null,{headers:cors});const DB=vals.find(v=>v&&typeof v.prepare==="function"&&typeof v.batch==="function");
const qi=new URL(req.url).searchParams,a=qi.get("it");
if(a&&req.method==="POST"){if(req.headers.get("X-Taj-Key")!==KEY&&qi.get("k")!==KEY)return json({error:"key"},403);if(!DB)return json({ok:false,err:"nodb"});
const H=async s=>{const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")};
try{await DB.batch([DB.prepare("CREATE TABLE IF NOT EXISTS itq (e TEXT PRIMARY KEY, h TEXT, d TEXT, v INTEGER, at INTEGER)"),DB.prepare("CREATE TABLE IF NOT EXISTS itg (g TEXT PRIMARY KEY, t TEXT, tn TEXT, n TEXT, p TEXT, nl TEXT, at INTEGER)"),DB.prepare("CREATE TABLE IF NOT EXISTS itm (e TEXT PRIMARY KEY, g TEXT, sid TEXT, nm TEXT, s TEXT, at INTEGER)"),DB.prepare("CREATE TABLE IF NOT EXISTS itf (g TEXT PRIMARY KEY, nm TEXT, d TEXT, at INTEGER)")]);
let o={};try{o=await req.json()}catch(x){}
const fnOf=async g=>{const f=await DB.prepare("SELECT nm,at FROM itf WHERE g=?").bind(g).first();return f?f.nm:""};
const own=(G,sid)=>{let L=[];try{L=JSON.parse(G.nl||"[]")}catch(x){}const S=L.find(x=>x.i===sid);if(S&&S.p){G.p=S.p;G.at=S.at||G.at;G.own=1}delete G.nl;delete G.sid;return G};
const grpOf=async e=>{const r=await DB.prepare("SELECT itg.g g,itg.n n,itg.p p,itg.at at,itg.tn tn,itg.nl nl,itm.sid sid FROM itm JOIN itg ON itm.g=itg.g WHERE itm.e=?").bind(e).first();if(!r)return null;own(r,r.sid);r.fn=await fnOf(r.g);return r};
const gc=String(o.g||"").trim().toUpperCase().slice(0,12);
const sid=String(o.sid||"").slice(0,20);
const taken=async g=>((await DB.prepare("SELECT sid FROM itm WHERE g=?").bind(g).all()).results||[]).map(x=>x.sid);
const slot=async(g,e)=>{const G=await DB.prepare("SELECT g,n,p,at,tn,nl FROM itg WHERE g=?").bind(g).first();if(!G)return {err:"nogrp"};let L=[];try{L=JSON.parse(G.nl||"[]")}catch(x){}const S=L.find(x=>x.i===sid);if(!S)return {err:"noname"};const u=await DB.prepare("SELECT e FROM itm WHERE g=? AND sid=?").bind(g,sid).first();if(u&&u.e!==e)return {err:"taken"};return {G,S}};
if(a==="gfile"){const f=await DB.prepare("SELECT nm,d FROM itf WHERE g=?").bind(gc).first();return json(f?{ok:true,nm:f.nm,d:f.d}:{ok:false,err:"nofile"})}
if(a==="ginfo"){const r=await DB.prepare("SELECT g,n,at,tn,nl FROM itg WHERE g=?").bind(gc).first();if(!r)return json({ok:false,err:"nogrp"});r.taken=await taken(gc);return json({ok:true,grp:r})}
const e=String(o.e||"").trim().toLowerCase().slice(0,120);if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))return json({ok:false,err:"email"});
const row=await DB.prepare("SELECT h,d,v FROM itq WHERE e=?").bind(e).first();
if(a==="reset"){if(await H("itqadm|"+String(o.ak||""))!==ADMH)return json({ok:false,err:"admin"});if(!row)return json({ok:false,err:"none"});await DB.prepare("UPDATE itq SET h='' WHERE e=?").bind(e).run();return json({ok:true})}
const hh=await H("itq|"+String(o.h||""));const d=String(o.d||"");if(d.length>1500000)return json({ok:false,err:"big"});
const nm=String(o.nm||"").slice(0,60),sm=String(o.s||"").slice(0,4000);
if(a==="reg"){if(row)return json({ok:false,err:"exists"});let J=null;if(gc){J=await slot(gc,e);if(J.err)return json({ok:false,err:J.err})}
 await DB.prepare("INSERT INTO itq (e,h,d,v,at) VALUES (?,?,?,1,?)").bind(e,hh,d,Date.now()).run();if(J){await DB.prepare("INSERT OR REPLACE INTO itm (e,g,sid,nm,s,at) VALUES (?,?,?,?,?,?)").bind(e,J.G.g,sid,J.S.n,sm,Date.now()).run();own(J.G,sid)}return json({ok:true,v:1,grp:J?J.G:null,nm:J?J.S.n:""})}
if(!row)return json({ok:false,err:"none"});let rs=0;if(row.h===""){if(a!=="login")return json({ok:false,err:"pw"});await DB.prepare("UPDATE itq SET h=? WHERE e=?").bind(hh,e).run();rs=1}else if(row.h!==hh)return json({ok:false,err:"pw"});
if(a==="login")return json({ok:true,d:row.d,v:row.v,reset:rs,grp:await grpOf(e)});
if(a==="save"){const v=(row.v||0)+1;await DB.prepare("UPDATE itq SET d=?,v=?,at=? WHERE e=?").bind(d,v,Date.now(),e).run();if(sm)await DB.prepare("UPDATE itm SET s=?,at=? WHERE e=?").bind(sm,Date.now(),e).run();return json({ok:true,v,grp:await grpOf(e)})}
if(a==="pw"){await DB.prepare("UPDATE itq SET h=? WHERE e=?").bind(await H("itq|"+String(o.nh||"")),e).run();return json({ok:true})}
if(a==="join"){const J=await slot(gc,e);if(J.err)return json({ok:false,err:J.err});await DB.prepare("INSERT OR REPLACE INTO itm (e,g,sid,nm,s,at) VALUES (?,?,?,?,?,?)").bind(e,J.G.g,sid,J.S.n,sm,Date.now()).run();own(J.G,sid);return json({ok:true,grp:J.G,nm:J.S.n})}
const pp=String(o.p||"").slice(0,20000),gn=String(o.n||"").slice(0,80),tn=String(o.tn||"").slice(0,60);
const nl=String(o.nl||"[]").slice(0,400000);
if(a==="tnew"){const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let g="";for(let t=0;t<8;t++){g="";const r=crypto.getRandomValues(new Uint8Array(6));for(const x of r)g+=A[x%A.length];if(!await DB.prepare("SELECT g FROM itg WHERE g=?").bind(g).first())break}
 await DB.prepare("INSERT INTO itg (g,t,tn,n,p,nl,at) VALUES (?,?,?,?,?,?,?)").bind(g,e,tn,gn,pp,nl,Date.now()).run();return json({ok:true,g})}
if(a==="tupd"){const r=await DB.prepare("UPDATE itg SET n=?,p=?,tn=?,at=? WHERE g=? AND t=?").bind(gn,pp,tn,Date.now(),gc,e).run();return json({ok:!!(r&&r.meta&&r.meta.changes)})}
if(a==="tnames"){const r=await DB.prepare("UPDATE itg SET nl=? WHERE g=? AND t=?").bind(nl,gc,e).run();return json({ok:!!(r&&r.meta&&r.meta.changes)})}
if(a==="tfree"){const G=await DB.prepare("SELECT g FROM itg WHERE g=? AND t=?").bind(gc,e).first();if(!G)return json({ok:false,err:"nogrp"});await DB.prepare("DELETE FROM itm WHERE g=? AND sid=?").bind(gc,sid).run();return json({ok:true})}
if(a==="tfile"){const G=await DB.prepare("SELECT g FROM itg WHERE g=? AND t=?").bind(gc,e).first();if(!G)return json({ok:false,err:"nogrp"});const fd=String(o.fd||"");if(fd.length>1990000)return json({ok:false,err:"big"});await DB.prepare("INSERT OR REPLACE INTO itf (g,nm,d,at) VALUES (?,?,?,?)").bind(gc,String(o.fnm||"منهج.pdf").slice(0,120),fd,Date.now()).run();return json({ok:true})}
if(a==="tfdel"){const G=await DB.prepare("SELECT g FROM itg WHERE g=? AND t=?").bind(gc,e).first();if(!G)return json({ok:false,err:"nogrp"});await DB.prepare("DELETE FROM itf WHERE g=?").bind(gc).run();return json({ok:true})}
if(a==="tlist"){const G=await DB.prepare("SELECT g,n,p,nl,at FROM itg WHERE t=? ORDER BY at").bind(e).all();const M=await DB.prepare("SELECT itm.e e,itm.g g,itm.sid sid,itm.nm nm,itm.s s,itm.at at FROM itm JOIN itg ON itm.g=itg.g WHERE itg.t=?").bind(e).all();const F=await DB.prepare("SELECT itf.g g,itf.nm nm FROM itf JOIN itg ON itf.g=itg.g WHERE itg.t=?").bind(e).all();return json({ok:true,groups:G.results||[],members:M.results||[],files:F.results||[]})}
return json({ok:false,err:"act"})}catch(x){return json({ok:false,err:"db",m:String(x&&x.message||x).slice(0,200)})}}
return json({ok:true,itq:!!DB,v:3})}};
