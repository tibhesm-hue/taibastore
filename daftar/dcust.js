/* delivery customer book — one screen used by «استقبال طيبة» and by the ledger (owner 27 Nov: same procedure in both) */
window.DCUST={mount(host){if(host.__dc)return;host.__dc=1;const sh=host.attachShadow({mode:"open"});sh.innerHTML="<style>\n.w{font-family:system-ui,Tahoma;background:#f4f6f5;margin:0;padding:0;color:#1c2b33}\n.c{background:#fff;border-radius:16px;padding:16px;max-width:440px;margin:0 auto 12px;box-shadow:0 2px 14px #0001}\nh1{font-size:20px;margin:0 0 6px;color:#0e5a3c}h2{font-size:16px;margin:0 0 8px}\np,.s{margin:4px 0;line-height:1.7;font-size:14px;color:#51606a}\ninput,button,select{font-family:inherit;font-size:16px;border-radius:10px;border:1px solid #cfd8d5;padding:11px;width:100%;box-sizing:border-box;margin-top:6px}\nbutton{background:#0e5a3c;color:#fff;border:0;font-weight:700}\n.r{border:1px solid #e1e8e5;border-radius:10px;padding:9px 10px;margin-top:6px;font-size:14px}\n.r b{display:block;font-size:15px;color:#1c2b33}.r span{color:#51606a;font-size:13px}\n.r.on{border-color:#0e5a3c;background:#eef6f2}\n.g{color:#0e5a3c}.e{color:#b3261e}\n</style><div class=\"w\"><div class=\"c\"><h2>عميل التوصيل</h2>\n<div id=\"cur\" class=\"r on\" style=\"display:none\"></div>\n<p>اكتب الاسم (كما في الواتساب) أو الرقم، فتظهر قائمة المحفوظين.</p>\n<input id=\"n\" placeholder=\"الاسم\">\n<input id=\"p\" inputmode=\"tel\" placeholder=\"رقم الجوال\">\n<div style=\"display:flex;gap:8px\"><button id=\"pst\" type=\"button\" style=\"background:#fff;color:#0e5a3c;border:1px solid #0e5a3c\">الصق الرقم المنسوخ</button><button id=\"ctc\" type=\"button\" style=\"display:none;background:#fff;color:#0e5a3c;border:1px solid #0e5a3c\">من جهات الاتصال</button></div>\n<div id=\"lst\"></div>\n<div id=\"lw\" style=\"display:none\"><p style=\"margin-top:10px\">موقع وصل قبل قليل ولم يُربط (اختياري):</p><div id=\"locs\"></div></div>\n<button id=\"sv\">حفظ</button>\n<p id=\"msg\"></p></div>\n\n<div class=\"c\"><p>لو نسيت تشارك الموقع: احفظ الاسم والرقم هنا أولاً، ثم شارك الموقع خلال 30 دقيقة فيُربط تلقائياً.</p></div></div>";

const $=i=>sh.getElementById(i),L=["","قريب","متوسط","بعيد"];
let DC=[],LOCS=[],LSEL="",auth=true,CUR=null;
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const norm=s=>String(s||"").replace(/[٠-٩]/g,c=>"٠١٢٣٤٥٦٧٨٩".indexOf(c)).toLowerCase();
const ph=s=>{let d=norm(s).replace(/\D/g,"");if(d.startsWith("00"))d=d.slice(2);if(d.startsWith("966"))d=d.slice(3);if(d.startsWith("0"))d=d.slice(1);return d};
async function load(){
 try{const r=await fetch("/api/pos/dcust",{credentials:"same-origin",cache:"no-store"});if(r.status===401){auth=false;$("msg").innerHTML='<span class="e">سجّل دخولك أولاً من نقاط البيع في هذا الجوال ثم ارجع.</span>';return}
  const j=await r.json();if(j.ok){DC=j.list||[];CUR=j.cur||null}}catch(e){$("msg").innerHTML='<span class="e">تعذّر التحميل — تأكد من النت</span>'}
 try{const r=await fetch("/api/pos/xfer",{credentials:"same-origin",cache:"no-store"});const j=await r.json();LOCS=(j.locs||[]).filter(x=>x.free)}catch(e){}
 draw();clip(false)}
function draw(){
 const cb=$("cur");if(CUR){cb.style.display="block";cb.innerHTML="<b>العميل الحالي: "+esc(CUR.name)+"</b><span>الموقع والإيصال اللي يوصلون الآن يُربطون به.</span><button id=\"cx\" style=\"background:#fff;color:#b3261e;border:1px solid #e1c4c1;margin-top:8px\">بدون عميل / عميل آخر</button>"}else cb.style.display="none";
 const q=norm($("n").value).trim(),qp=ph($("p").value);
 let r=DC.filter(x=>(q&&norm(x.name).includes(q))||(qp.length>=3&&x.phone.includes(qp))||(!q&&qp.length<3&&false)).slice(0,6);
 $("lst").innerHTML=r.length?'<p style="margin-top:10px">محفوظ من قبل — اضغط عليه ليصير هو العميل الحالي (الموقع والإيصال يُربطان به):</p>'+r.map(x=>'<div class="r" data-i="'+x.id+'"><b>'+esc(x.name)+'</b><span>'+esc(x.phone)+" · "+(x.hasLoc?L[x.lv]+" · "+x.d.toFixed(1)+" كم":"بلا موقع")+"</span></div>").join(""):((q||qp.length>=3)?'<p style="margin-top:10px" class="g">ما فيه عميل بهالاسم أو الرقم — جديد.</p>':"");
 $("lw").style.display=LOCS.length?"block":"none";
 $("locs").innerHTML=LOCS.map(x=>'<div class="r'+(x.id===LSEL?" on":"")+'" data-l="'+x.id+'"><b>'+L[x.lv]+" · "+x.d.toFixed(1)+" كم</b><span>الساعة "+esc((x.t||"").slice(0,5))+"</span></div>").join("")}
let LASTCLIP="";
function takeNum(t,force){const d=ph(t);if(!/^[\d\s+\-()٠-٩]{7,22}$/.test(String(t).trim())||d.length<7||d.length>12)return false;if(!force&&(d===LASTCLIP||$("p").value.trim()))return false;LASTCLIP=d;$("p").value=d.length===9&&d[0]==="5"?"0"+d:d;const ex=DC.find(x=>x.phone===d);if(ex)$("n").value=ex.name;draw();$("msg").innerHTML='<span class="g">'+(ex?"الرقم المنسوخ محفوظ باسم «"+esc(ex.name)+"» — اضغط عليه تحت.":"أخذت الرقم المنسوخ — اكتب الاسم واحفظ.")+"</span>";return true}
async function clip(force){try{if(!navigator.clipboard||!navigator.clipboard.readText)return false;const t=await navigator.clipboard.readText();return takeNum(t,force)}catch(e){return false}}
$("pst").onclick=async()=>{const ok=await clip(true);if(!ok)$("msg").innerHTML='<span class="e">ما لقيت رقم منسوخ — انسخ الرقم من الواتساب أولاً.</span>'};
if("contacts" in navigator&&navigator.contacts.select){$("ctc").style.display="";$("ctc").onclick=async()=>{try{const r=await navigator.contacts.select(["name","tel"],{multiple:false});if(!r||!r.length)return;const c=r[0],t=(c.tel||[])[0]||"",nm=(c.name||[])[0]||"";if(!t){$("msg").innerHTML='<span class="e">هذي الجهة ما فيها رقم.</span>';return}const d=ph(t);$("p").value=d.length===9&&d[0]==="5"?"0"+d:d;const ex=DC.find(x=>x.phone===d);$("n").value=ex?ex.name:nm;draw();$("msg").innerHTML='<span class="g">'+(ex?"محفوظ من قبل — اضغط عليه تحت.":"راجع الاسم واضغط حفظ.")+"</span>"}catch(e){}}}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)setTimeout(()=>clip(false),300)});window.addEventListener("focus",()=>setTimeout(()=>clip(false),300));
sh.addEventListener("input",e=>{if(e.target.id==="n"||e.target.id==="p")draw()});
sh.addEventListener("click",e=>{const a=e.target.closest("[data-i]");if(a){const x=DC.find(y=>y.id===a.dataset.i);if(x){$("n").value=x.name;$("p").value=x.phone;fetch("/api/pos/dcust",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:x.name,phone:x.phone})}).then(()=>load());draw()}return}
 if(e.target.id==="cx"){fetch("/api/pos/dcust",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({clear:1})}).then(()=>load());return}
 const l=e.target.closest("[data-l]");if(l){LSEL=LSEL===l.dataset.l?"":l.dataset.l;draw()}});
$("sv").onclick=async()=>{
 const n=$("n").value.trim(),p=$("p").value;if(n.length<2||ph(p).length<7){$("msg").innerHTML='<span class="e">اكتب الاسم والرقم</span>';return}
 const ex=DC.find(x=>x.phone===ph(p));
 if(ex&&ex.hasLoc&&LSEL&&!confirm("«"+ex.name+"» عنده موقع محفوظ. تحديثه بالموقع الجديد؟"))return;
 try{const r=await fetch("/api/pos/dcust",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,phone:p,loc:LSEL})});
  if(r.status===401){$("msg").innerHTML='<span class="e">سجّل دخولك من نقاط البيع أولاً</span>';return}
  const j=await r.json();
  if(j.ok){$("msg").innerHTML='<span class="g">تم الحفظ'+(LSEL?" مع الموقع":(ex&&ex.hasLoc?" (موقعه القديم باقٍ)":" — شارك موقعه خلال 30 دقيقة"))+"</span>";$("n").value="";$("p").value="";LSEL="";load()}
  else $("msg").innerHTML='<span class="e">لم يُحفظ: '+esc(j.err||"")+"</span>"}catch(e){$("msg").innerHTML='<span class="e">تعذّر الحفظ — تأكد من النت</span>'}};
load();setInterval(load,20000);}};
