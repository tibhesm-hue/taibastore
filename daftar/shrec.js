/* owner 26 Nov («ابنه»): the POS handover closing. The cashier hands the shift over in the POS with one tap; on his phone the ledger shows «موازنة ورديتك»: one number (the drawer cash), a photo of the mada slip, his drawer invoices to confirm, save, the result (reason if there is a difference), send to the group. The POS figures come live from the server, nothing is pulled from Smart Life. The old closing form is gone from the menu. */
(function(){try{
var st=document.createElement('style');st.textContent='[data-cwgo="close"]{display:none!important}#shRec .srSq{background:#efede6;color:#222;border-radius:14px;padding:12px;text-align:center;font-size:15px;cursor:pointer;border:0;font-family:inherit;width:100%}#shRec .srPur{background:#3C3489;color:#fff;border-radius:14px;padding:14px;text-align:center;font-weight:600;font-size:17px;border:0;width:100%;font-family:inherit;cursor:pointer}#shRec .srPur[disabled]{opacity:.5}#shRec .srR{display:flex;justify-content:space-between;gap:8px;padding:5px 0}#shRec .srR span:first-child{color:var(--muted)}#shRec .srIn{font-size:26px;font-weight:700;text-align:center;width:100%;padding:12px;border:2px solid #D3D1C7;border-radius:12px;background:#fff;font-family:inherit}#shRec .srG{display:grid;grid-template-columns:1fr 1fr;gap:8px}';document.head.appendChild(st);
var SR={list:null,at:0,busy:false,open:null,photo:null,ack:false,res:null,err:'',rej:[],rerr:''};
function nm(u){return String(u||'').replace(/\s+(مبيعات|توصيل)$/,'').trim()}
function shL(br){return br==='del'?'توصيل':'مبيعات'}
function hm(t){try{var d=new Date(t+3*3600e3);return (d.getUTCDate())+'/'+(d.getUTCMonth()+1)+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')}catch(e){return ''}}
function mine(){if(!SR.list)return [];if(S.owner)return SR.list;var me=curCashier();return SR.list.filter(function(x){return nm(x.u)===me})}
async function load(f){if(!S.db||SR.busy)return;if(!f&&Date.now()-SR.at<20000)return;SR.busy=true;try{var r=await fetch('/api/shift/pending',{credentials:'same-origin',cache:'no-store'}),j=await r.json();if(j&&j.ok){SR.list=j.list||[];SR.at=Date.now()}}catch(e){}try{var r2_=await fetch('/api/shift/rejects',{credentials:'same-origin',cache:'no-store'}),j2=await r2_.json();if(j2&&j2.ok)SR.rej=j2.list||[]}catch(e){}SR.busy=false;draw()}
function myRej(){return (SR.rej||[]).filter(function(x){return S.owner||nm(x.pred.u)===curCashier()})}
function host(){var c=$('tab-close');if(c&&!c.hidden)return c;var h=$('tab-home');if(S.owner&&h&&!h.hidden)return h;return null}
function vals(x){/* the drawer entries of this cashier for this shift type, as the old closing counted them */
  var who=nm(x.u),sh=shL(x.br),cs=$('cShift'),old=cs?cs.value:'',date=bizDayISO();if(cs)cs.value=sh;var ps=[],rs=[],dp=[],dr=[],cdc=[];
  try{ps=openPayouts(who,date);rs=openReceipts(who,date);dp=delPayouts(who,date);dr=delReceipts(who,date);cdc=(typeof cdcOpenCash==='function'?cdcOpenCash(who,date):[])}catch(e){}if(cs)cs.value=old;
  var cashPs=ps.filter(isCash),inv=r2(cashPs.reduce(function(a,y){return a+(+y.amount||0)},0)),added=r2(rs.reduce(function(a,y){return a+(+y.amount||0)},0)+cdc.reduce(function(a,y){return a+(+y.amount||0)},0));
  var e=x.exp||{},fl=x.pred&&x.pred.cash!=null?+x.pred.cash:null;
  return {who:who,sh:sh,date:date,ps:ps,cashPs:cashPs,rs:rs,dp:dp,dr:dr,cdc:cdc,inv:inv,other:r2(ps.filter(function(y){return !isCash(y)}).reduce(function(a,y){return a+(+y.amount||0)},0)),added:added,float:fl,cash:+e.cash||0,card:+e.card||0,tr:+e.tr||0,aj:+e.aj||0,n:e.n||0,rn:e.rn||0}}
function draw(){var h=host(),el=$('shRec');var L=mine();
  var RJ=myRej();
  if(!h||(!L.length&&!SR.res&&!RJ.length)){if(el)el.remove();return}
  if(!el){el=document.createElement('div');el.id='shRec';el.className='card';}
  var anc=h.id==='tab-home'?$('sxV'):null;if(el.parentNode!==h||(anc&&el.previousSibling!==anc)){if(anc&&anc.nextSibling)h.insertBefore(el,anc.nextSibling);else h.insertBefore(el,h.firstChild)}
  var H;
  if(RJ.length&&!SR.open&&!SR.res){H=RJ.map(function(x){return '<div style="margin-bottom:10px"><h2 style="margin:0;color:#991b1b!important">'+esc(nm(x.u))+' رفض العهدة ('+esc(x.why||'')+')</h2><div class="small muted">أنت كتبت '+fmt(x.pred.cash)+'. عدّوها مع بعض الحين، واكتب الرقم الصحيح.</div><input class="srIn" data-rjin="'+esc(x.pred.id)+'" inputmode="decimal" autocomplete="off" placeholder="0.00" style="margin-top:8px"><button class="srPur" type="button" data-rjsave="'+esc(x.pred.id)+'" style="margin-top:8px">حفظ الرقم الصحيح</button></div>'}).join('')+(SR.rerr?'<div class="err">'+esc(SR.rerr)+'</div>':'')}
  else if(SR.res){H=resHTML()}
  else if(!SR.open){H=L.map(function(x){return '<div style="margin-bottom:10px"><h2 style="margin:0">موازنة ورديتك جاهزة</h2><div class="small muted">'+esc(nm(x.u))+' · '+(x.br==='del'?'التوصيل':'المبيعات')+' · من '+hm(x.openAt)+' إلى '+hm(x.closeAt)+(x.dev?' · '+esc(x.dev):'')+'</div><button class="srPur" type="button" data-srgo="'+esc(x.id)+'" style="margin-top:8px">ابدأ الموازنة</button></div>'}).join('')}
  else{var x=L.find(function(y){return y.id===SR.open});if(!x){SR.open=null;return draw()}var v=vals(x);
    H='<h2 style="margin:0">موازنة ورديتك</h2><div class="small muted">'+esc(v.who)+' · '+(x.br==='del'?'التوصيل':'المبيعات')+' · سلّمت الوردية '+hm(x.closeAt)+'</div>'
     +(v.float==null?'<div class="srSq" style="background:#fff3e0;color:#b45309;cursor:default">العهدة بانتظار عدّ '+esc(nm(x.pred&&x.pred.u))+' — ما تقدر تحفظ لين يحفظ موازنته.</div>':'')
     +'<div style="font-size:16px;margin-top:6px">كم النقد اللي في الدرج الحين؟</div><input class="srIn" id="srCash" inputmode="decimal" autocomplete="off" placeholder="0.00"><div class="small muted">عدّ الفلوس اللي في الدرج كلها (مع العهدة) واكتب المجموع.</div>'
     +'<div style="font-size:16px;margin-top:10px">صوّر إيصال موازنة المدى</div><label class="srSq" style="display:block;font-weight:600">'+(SR.photo?'✓ انصوّر الإيصال — اضغط لتغييره':'📷 صوّر الإيصال')+'<input type="file" accept="image/*" capture="environment" id="srPh" style="display:none"></label>'
     +'<div style="font-size:16px;margin-top:10px">الفواتير اللي دفعتها من الدرج</div>'
     +(v.cashPs.length?'<div style="background:#efede6;border-radius:14px;padding:4px 12px">'+v.cashPs.map(function(p,i){return '<div class="srR"'+(i?' style="border-top:1px solid #e2dfd6"':'')+'><span style="color:#222">'+esc(p.title||'')+' · '+tm(p.at).replace('🕒 ','')+'</span><b>'+fmt(p.amount)+'</b></div>'}).join('')+'</div>':'<div class="small muted">ما دفعت فواتير من الدرج.</div>')
     +'<div class="srG"><button class="srSq" type="button" data-srpay="1">+ فاتورة نسيتها</button><button class="srSq" type="button" data-srack="1" style="'+(SR.ack?'background:#E1F5EE;color:#085041;font-weight:600':'')+'">'+(SR.ack?'☑':'☐')+' هذي كل فواتيري</button></div>'
     +(SR.err?'<div class="err" style="margin-top:6px">'+esc(SR.err)+'</div>':'')
     +'<button class="srPur" type="button" data-srsave="1" style="margin-top:10px"'+(v.float==null?' disabled':'')+'>حفظ الموازنة</button><div class="small muted">بعد الحفظ ما تقدر تغيّر الرقم.</div>'
     +'<button class="btn sm ghost" type="button" data-srback="1" style="margin-top:6px">رجوع</button>'}
  if(el.__h!==H){var keep=$('srCash')?$('srCash').value:null;el.innerHTML=H;el.__h=H;if(keep!=null&&$('srCash'))$('srCash').value=keep}}
function resHTML(){var c=SR.res.c,k=closingCalc(c),d=r2(k.diff),big=Math.abs(d)>=1;
  var R=function(a,b){return '<div class="srR"><span>'+a+'</span><span>'+b+'</span></div>'};
  var pill=Math.abs(d)<0.01?'<span class="pill zero">مطابق ✓</span>':d<0?'<span class="pill bad">عجز '+fmt(-d)+'</span>':'<span class="pill good">فايض '+fmt(d)+'</span>';
  var h='<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">النتيجة</h2>'+pill+'</div>'
   +R('العهدة'+(SR.res.from?' (من '+esc(SR.res.from)+')':''),fmt(c.float))+R('+ مبيعات نقدي',fmt(r2(c.cashSales-c.float)))+(c.invoices?R('− فواتير من الدرج',fmt(c.invoices)):'')+(c.added?R('+ نقد دخل الدرج',fmt(c.added)):'')
   +'<div class="srR" style="border-top:1px solid #e2dfd6"><span>المفروض</span><span>'+fmt(k.expected)+'</span></div>'+R('الموجود',fmt(c.counted))
   +'<div class="srSq" style="text-align:right;font-size:14px;cursor:default">شبكة '+fmt(c.card)+(c.transfer?' · تحويل '+fmt(c.transfer):'')+(SR.res.aj?' · آجل '+fmt(SR.res.aj):'')+' — من نقاط البيع</div>';
  if(big&&!SR.res.note){var O=(NR_OPT[d<0?'s':'o']||[]);h+='<b style="display:block;margin-top:6px">وش سبب '+(d<0?'العجز':'الفايض')+'؟</b><div class="srG">'+O.map(function(o,i){return '<button class="srSq" type="button" data-srwhy="'+i+'">'+esc(o[0])+'</button>'}).join('')+'</div>';return h}
  if(SR.res.note)h+=R('السبب',esc(SR.res.note));
  h+=R('عهدة الكاشير اللي بعدك',fmt(c.counted));
  h+=SR.res.sent?'<div class="srSq" style="background:#E1F5EE;color:#085041;cursor:default">✓ انرسلت. خلصت 👍</div><button class="btn sm ghost" type="button" data-srdone="1" style="margin-top:6px">تم</button>':'<a class="srPur" style="display:block;text-decoration:none;background:#1f9d55;margin-top:8px" target="_blank" rel="noopener" data-srsend="1" href="https://wa.me/?text='+encodeURIComponent(closeText(c))+'">أرسل للقروب «موازنة»</a>';
  return h}
async function save(){var L=mine(),x=L.find(function(y){return y.id===SR.open});if(!x)return;var v=vals(x);SR.err='';
  var cash=toNum(($('srCash')||{}).value);if(!(cash>=0)||String(($('srCash')||{}).value).trim()===''){SR.err='اكتب النقد اللي في الدرج.';el0();return}
  if(!SR.photo){SR.err='صوّر إيصال موازنة المدى.';el0();return}
  if(!SR.ack){SR.err='اضغط «هذي كل فواتيري» بعد ما تتأكد منها.';el0();return}
  if(v.float==null){SR.err='العهدة بانتظار عدّ الكاشير اللي قبلك.';el0();return}
  var b=document.querySelector('[data-srsave]');if(b)b.disabled=true;
  try{
    photos.t=[SR.photo];var ph=await uploadPhoto('t');photos.t=[];if(!ph){SR.err='ما انرفعت صورة الإيصال — تأكد من الإنترنت وجرّب مرة ثانية.';if(b)b.disabled=false;el0();return}
    var cashSales=r2(v.float+v.cash),expd=r2(v.added+cashSales-v.inv),cd=r2(cash-expd);
    var rec={incl:true,pos:{shift:x.id,openAt:x.openAt,closeAt:x.closeAt,dev:x.dev||null,exp:x.exp||null,pred:x.pred||null},date:v.date,cashier:v.who,shift:v.sh,float:v.float,leave:cash,floatFrom:null,added:v.added,card:v.card,cashSales:cashSales,refunds:0,invoices:v.inv,invoiceCount:v.cashPs.length,transfer:v.tr,otherPaid:v.other,addedCount:v.rs.length+v.cdc.length,delAdded:r2(v.dr.reduce(function(a,y){return a+(+y.amount||0)},0)),delAddedCount:v.dr.length,delInv:r2(v.dp.reduce(function(a,y){return a+(+y.amount||0)},0)),delInvCount:v.dp.length,sales:r2(v.card+v.cash),counted:cash,cardTerm:v.card,cashDiff:cd,cardDiff:0,diff:cd,note:'',madaPhoto:ph,madaSlip:{manual:true},invAck:{at:Date.now(),n:v.cashPs.length},needSend:true};
    var ref=await addTo('months/'+v.date.slice(0,7)+'/closings',rec);
    var Lk=[];v.dp.forEach(function(y){Lk.push(['months/'+y.date.slice(0,7)+'/dels/'+y.id,{closingId:ref.id}])});v.dr.forEach(function(y){Lk.push(['months/'+y.date.slice(0,7)+'/receipts/'+y.id,{closingId:ref.id}])});v.rs.forEach(function(y){Lk.push(['months/'+(y.date||v.date).slice(0,7)+'/receipts/'+y.id,{closingId:ref.id}])});v.cdc.forEach(function(y){Lk.push(['sdisc/'+y.id,{closingId:ref.id}])});
    v.ps.forEach(function(y){if(y.kind==='exp')Lk.push(['months/'+(y.date||v.date).slice(0,7)+'/expenses/'+y.id,{closingId:ref.id}]);else (y.pair?S.ledger.filter(function(l){return l.pair===y.pair}):S.ledger.filter(function(l){return l.id===y.id})).forEach(function(l){Lk.push(['ledger/'+l.id,{closingId:ref.id}])})});
    var fail=[];for(var t=0;t<4;t++){fail=[];for(var i=0;i<Lk.length;i++){try{await S.db.doc(Lk[i][0]).update(Lk[i][1])}catch(e){fail.push(Lk[i])}}if(!fail.length)break;Lk=fail;await new Promise(function(r){setTimeout(r,1500*(t+1))})}
    if(fail.length){try{await S.db.doc('months/'+v.date.slice(0,7)+'/closings/'+ref.id).update({linkFail:fail.map(function(f){return f[0]})})}catch(e){}}
    var ok=false;for(var t2=0;t2<4&&!ok;t2++){try{var rr=await fetch('/api/shift/rec',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:x.id,cash:cash,closingId:ref.id})});var jj=await rr.json();ok=!!(jj&&(jj.ok||jj.err==='done'))}catch(e){}if(!ok)await new Promise(function(r){setTimeout(r,1500)})}
    rec.id=ref.id;SR.res={c:rec,id:ref.id,month:v.date.slice(0,7),from:nm(x.pred&&x.pred.u),aj:v.aj,note:'',sent:false};SR.open=null;SR.photo=null;SR.ack=false;
    if(Math.abs(cd)>=1){try{await S.db.doc('months/'+SR.res.month+'/closings/'+ref.id).update({needReason:{at:Date.now(),diff:cd}})}catch(e){}}
    SR.list=(SR.list||[]).filter(function(y){return y.id!==x.id});
  }catch(e){SR.err='ما انحفظت: '+(e&&e.message||e);if(b)b.disabled=false}
  el0()}
function el0(){var el=$('shRec');if(el)el.__h=null;draw()}
document.addEventListener('click',async function(e){var t=e.target;if(!t.closest||!t.closest('#shRec'))return;
  var g=t.closest('[data-srgo]');if(g){SR.open=g.dataset.srgo;SR.err='';SR.ack=false;SR.photo=null;el0();return}
  if(t.closest('[data-srback]')){SR.open=null;el0();return}
  if(t.closest('[data-srack]')){SR.ack=!SR.ack;el0();return}
  if(t.closest('[data-srpay]')){var p=document.querySelector('[data-cwgo="pay"]');if(p)p.click();else toast('سجّل الفاتورة من «فاتورة دفعتها من الدرج»');return}
  if(t.closest('[data-srsave]')){save();return}
  var w=t.closest('[data-srwhy]');if(w&&SR.res){var d=SR.res.c.diff,o=(NR_OPT[d<0?'s':'o']||[])[+w.dataset.srwhy];if(!o)return;try{await S.db.doc('months/'+SR.res.month+'/closings/'+SR.res.id).update({note:o[0],reasonAt:Date.now(),reasonKind:o[1]||null,needReason:null});SR.res.note=o[0];SR.res.c.note=o[0]}catch(x){toast('ما انحفظ السبب، جرّب مرة ثانية')}el0();return}
  if(t.closest('[data-srsend]')){setTimeout(async function(){try{await S.db.doc('months/'+SR.res.month+'/closings/'+SR.res.id).update({sent:true,sentAt:Date.now()})}catch(x){}SR.res.sent=true;el0()},800);return}
  if(t.closest('[data-srdone]')){SR.res=null;el0();return}
  var rs=t.closest('[data-rjsave]');if(rs){var pid=rs.dataset.rjsave,x=(SR.rej||[]).find(function(y){return y.pred.id===pid}),inp=document.querySelector('[data-rjin="'+pid+'"]'),nv=toNum(inp&&inp.value);SR.rerr='';
    if(!x||!(nv>=0)||String(inp.value).trim()===''){SR.rerr='اكتب الرقم الصحيح.';el0();return}rs.disabled=true;
    try{var rr=await fetch('/api/shift/recfix',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:pid,cash:nv})});var jj=await rr.json();if(!jj||!jj.ok){SR.rerr='ما انحفظ: '+((jj&&jj.err)||'');rs.disabled=false;el0();return}
      var cid=x.pred.closingId,c=cid&&[].concat(S.closings||[],PM('closings')||[]).find(function(y){return y&&y.id===cid});
      if(c&&c.date){var dlt=r2(nv-(+c.counted||0)),cd=r2((+c.cashDiff||0)+dlt);var up={counted:nv,leave:nv,cashDiff:cd,diff:r2((+c.diff||0)+dlt),floatFix:{prev:+c.counted||0,now:nv,at:Date.now(),by:nm(x.u),why:x.why||''}};if(Math.abs(up.diff)>=1&&!(c.note||'').trim())up.needReason={at:Date.now(),diff:up.diff};try{await S.db.doc('months/'+c.date.slice(0,7)+'/closings/'+cid).update(up)}catch(e){}}
      SR.rej=(SR.rej||[]).filter(function(y){return y.pred.id!==pid});toast('✓ انحفظ — تطلع العهدة الجديدة عند '+nm(x.u));SR.at=0;load(true)}catch(e){SR.rerr='ما انحفظ، جرّب مرة ثانية';rs.disabled=false}el0();return}});
document.addEventListener('change',async function(e){if(e.target&&e.target.id==='srPh'){var f=e.target.files&&e.target.files[0];if(!f)return;try{SR.photo=typeof shrink==='function'?await shrink(f,true):f}catch(x){SR.photo=f}SR.err='';el0()}});
setInterval(function(){try{if(typeof S==='undefined'||!S.db)return;load(false);draw()}catch(e){}},1500);
}catch(e){}})();
