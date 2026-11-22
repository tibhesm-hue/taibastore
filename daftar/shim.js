/* Daftar bridge: gives the ledger page the same `claude.use(...)` it has on Claude, backed by the shop's own server.
   db (get/set/update/delete/add/where/orderBy/limit/onSnapshot), assets, user, downloads. Live updates by polling /api/changes. */
(function(){
'use strict';
var ME=null,MEP=null;
function api(path,body,method){return fetch(path,{method:method||(body?'POST':'GET'),credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}).then(function(r){if(r.status===401){location.replace('/');throw {code:'revoked',message:'login'}}return r.json().then(function(j){if(!j.ok)throw {code:j.code||'unavailable',message:j.err||'error'};return j})})}
function me(){if(!MEP)MEP=api('/api/me').then(function(j){ME=j;return j});return MEP}
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);for(var k in o)deepFreeze(o[k])}return o}
var META={fromCache:false,hasPendingWrites:false};
function docSnap(id,exists,data){var d=exists?deepFreeze(data):undefined;return {id:id,exists:!!exists,data:function(){return d},metadata:META}}
function segs(p){var s=String(p||'').split('/');if(s.some(function(x){return !x}))throw new TypeError('bad path: '+p);return s}
var SUBS=[];/* active listeners */
function notifyLocal(col,id){SUBS.forEach(function(s){if(s.col===col&&(s.kind==='q'||s.id===id))s.dirty=true});kick()}
function DocRef(path){var s=segs(path);if(s.length%2)throw new TypeError('document path needs an even number of segments: '+path);var col=s.slice(0,-1).join('/'),id=s[s.length-1];
 var ref={id:id,path:path,
  get:function(){return api('/api/db',{op:'get',path:path}).then(function(j){return docSnap(id,j.r.exists,j.r.data)})},
  set:function(data){return api('/api/db',{op:'set',path:path,data:data}).then(function(){notifyLocal(col,id)})},
  update:function(data){return api('/api/db',{op:'update',path:path,data:data}).then(function(){notifyLocal(col,id)})},
  delete:function(){return api('/api/db',{op:'delete',path:path}).then(function(){notifyLocal(col,id)})},
  acquire:function(o){return Promise.resolve({acquired:true,version:1,expiresAt:new Date(Date.now()+((o&&o.ttlMs)||30000)).toISOString(),holder:o&&o.holder})},
  collection:function(p){return Coll(path+'/'+p)},
  onSnapshot:function(next,err){return sub({kind:'d',col:col,id:id,path:path,next:next,err:err})}};
 return ref}
function rid(){var a='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',s='';var r=crypto.getRandomValues(new Uint8Array(20));for(var i=0;i<20;i++)s+=a[r[i]%62];return s}
function Query(col,spec){var q={
  where:function(f,op,v){return Query(col,{w:spec.w.concat([[f,op,v]]),o:spec.o,l:spec.l})},
  orderBy:function(f,dir){return Query(col,{w:spec.w,o:[f,dir||'asc'],l:spec.l})},
  limit:function(n){return Query(col,{w:spec.w,o:spec.o,l:n})},
  get:function(){return run(col,spec).then(function(L){return qSnap(L,null)})},
  onSnapshot:function(next,err){return sub({kind:'q',col:col,spec:spec,next:next,err:err})}};return q}
function run(col,spec){return api('/api/db',{op:'query',col:col,where:spec.w,orderBy:spec.o,limit:spec.l}).then(function(j){return j.r.docs})}
function qSnap(L,prev){var docs=L.map(function(x){var keep=prev&&prev.map[x.id];if(keep&&keep.raw===JSON.stringify(x.data))return keep.snap;return docSnap(x.id,true,x.data)});
 var ch=[],pm=prev?prev.order:[];docs.forEach(function(d,i){var oi=pm.indexOf(d.id);if(oi<0)ch.push({type:'added',doc:d,oldIndex:-1,newIndex:i});else if(prev.map[d.id].snap!==d||oi!==i)ch.push({type:'modified',doc:d,oldIndex:oi,newIndex:i})});
 pm.forEach(function(id,oi){if(!docs.some(function(d){return d.id===id}))ch.push({type:'removed',doc:prev.map[id].snap,oldIndex:oi,newIndex:-1})});
 var snap={docs:docs,size:docs.length,empty:!docs.length,docChanges:function(){return ch},metadata:META};
 var map={};L.forEach(function(x,i){map[x.id]={raw:JSON.stringify(x.data),snap:docs[i]}});snap.__st={map:map,order:L.map(function(x){return x.id})};return snap}
function Coll(path){var s=segs(path);if(!(s.length%2))throw new TypeError('collection path needs an odd number of segments: '+path);var q=Query(path,{w:[],o:null,l:null});
 q.path=path;q.doc=function(id){return DocRef(path+'/'+(id||rid()))};q.add=function(data){var r=q.doc();return r.set(data).then(function(){return r})};return q}
/* ---- live updates ---- */
var SINCE=0,TIMER=null,BUSY=false;
function sub(s){s.dirty=true;s.alive=true;s.last=null;SUBS.push(s);if(SUBS.length>64){s.alive=false;setTimeout(function(){if(s.err)s.err({code:'resource_exhausted',message:'too many listeners'})},0);return function(){}}kick();return function(){s.alive=false;var i=SUBS.indexOf(s);if(i>=0)SUBS.splice(i,1)}}
function refresh(s){if(s.kind==='d')return api('/api/db',{op:'get',path:s.path}).then(function(j){if(!s.alive)return;var raw=j.r.exists?JSON.stringify(j.r.data):null;if(s.sent&&s.last===raw)return;s.last=raw;s.sent=true;try{s.next(docSnap(s.id,j.r.exists,j.r.data))}catch(e){setTimeout(function(){throw e})}});
 return run(s.col,s.spec).then(function(L){if(!s.alive)return;var raw=JSON.stringify(L);if(s.sent&&raw===s.raw)return;s.raw=raw;var snap=qSnap(L,s.st);s.st=snap.__st;s.sent=true;try{s.next(snap)}catch(e){setTimeout(function(){throw e})}})}
function tick(){if(BUSY)return;BUSY=true;var p=SINCE?api('/api/changes?since='+SINCE).then(function(j){SINCE=j.now-2000;if(j.full)SUBS.forEach(function(s){s.dirty=true});else j.ch.forEach(function(c){SUBS.forEach(function(s){if(s.col===c[0]&&(s.kind==='q'||s.id===c[1]))s.dirty=true})})}):api('/api/changes?since='+(Date.now()-1000)).then(function(j){SINCE=j.now-2000});
 p.then(function(){var L=SUBS.filter(function(s){return s.alive&&s.dirty});L.forEach(function(s){s.dirty=false});return Promise.all(L.map(function(s){return refresh(s).catch(function(){s.dirty=true})}))}).catch(function(){}).then(function(){BUSY=false})}
function kick(){setTimeout(tick,30)}
setInterval(function(){if(!document.hidden)tick()},4000);document.addEventListener('visibilitychange',function(){if(!document.hidden)tick()});
var DB={doc:DocRef,collection:Coll};
/* ---- assets ---- */
var ASSETS={upload:function(blob){return fetch('/api/asset',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':blob.type||'application/octet-stream'},body:blob}).then(function(r){return r.json()}).then(function(j){if(!j.ok)throw {code:'upload_failed',message:j.err||'upload'};return j.r})},
 list:function(){return api('/api/assets').then(function(j){return {assets:j.assets,usage:j.usage}})},
 delete:function(id){return api('/api/asset/delete',{id:id})}};
/* ---- user ---- */
var USER={isOwner:function(){return me().then(function(m){return !!m.owner})},id:function(){return me().then(function(m){return m.uid})},
 me:function(){return me().then(function(m){return {id:m.uid,name:m.name||m.email,email:m.email}})},
 profiles:function(ids){return me().then(function(m){var o={};(ids||[]).forEach(function(i){o[i]={name:i===m.uid?(m.name||m.email):'موظف'}});return o})},
 can:function(){return me().then(function(m){return true})},canEdit:function(){return me().then(function(m){return !!m.owner})}};
/* ---- downloads ---- */
var DOWN={save:function(o){try{var b=o.data instanceof Blob?o.data:new Blob([o.data]),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=o.filename||'file';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},4000);return Promise.resolve({saved:true})}catch(e){return Promise.reject({code:'failed',message:String(e)})}}};
var CAPS={db:DB,assets:ASSETS,user:USER,downloads:DOWN};
window.claude={use:function(n){if(!CAPS[n])return Promise.resolve(null);return me().then(function(){return CAPS[n]}).catch(function(){return null})}};
window.DAFTAR_SERVER=true;
})();
