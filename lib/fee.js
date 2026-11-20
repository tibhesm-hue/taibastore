/* رسوم التوصيل — المصدر الوحيد للحساب في كل الصفحات (صفحة الزبون loc.html، صفحة «موقعي» m.html، تطبيق «رسوم التوصيل» rs/).
   أي تعديل في المسافات أو الرسوم أو المستويات يكون هنا فقط (ومعه dec4 في مهام السحب الست). */
(function(){
const SHOP_LAT=26.3092878,SHOP_LNG=44.8183906;
// قرار صاحب المحل 20 نوفمبر — المسافة خط مستقيم من المحل:
// [حتى كم (شامل)، الرسوم إذا الطلب أقل من 20، الرسوم إذا 20 فأكثر]
const TIERS=[[0.75,2,0],[1.5,3,1],[2.25,4,2]];
function rk(la,ln){const R=6371,r=x=>x*Math.PI/180,dl=r(la-SHOP_LAT),dn=r(ln-SHOP_LNG),a=Math.sin(dl/2)**2+Math.cos(r(SHOP_LAT))*Math.cos(r(la))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(a))}
// أكثر من 2.25 كم: ريالان لكل كيلو (كيلو رايح وكيلو جاي)، لأقرب ريال، للطلبين، بحد أعلى 15
function fee(d,sv){for(const t of TIERS)if(d<=t[0])return sv>=20?t[2]:t[1];return Math.min(15,Math.round(d*2))}
const road=d=>d/0.75;                         // تقدير مسافة الطريق (للعرض فقط)
function lvl(d){return d<=0.75?1:d<=2.25?2:3} // 1 قريب، 2 متوسط، 3 بعيد — نفس حدود الرسوم
const LVN=['','قريب','متوسط','بعيد'];
// رمز التوصيل ذو الأربعة أرقام (قرار 20 نوفمبر): يحمل المستوى ومبلغ الرسوم بالضبط، ولا يتكرر في اليوم.
// خانة الرسوم T: 0..2 = صفوف TIERS، و3..13 = ما فوق 2.25 كم (5..15 ريال). المستوى يُعرف من T.
// المهام المجدولة تفكه بالدالة dec4 في نصها — أي تعديل هنا يلزمه تعديل dec4 في مهام السحب الست.
function tOf(d){for(let i=0;i<TIERS.length;i++)if(d<=TIERS[i][0])return i;return 3+fee(d,0)-5}
function code4(d){
 const T=tOf(d);if(T<0||T>13)return null;
 const now=Date.now()+3*3600e3,E=Math.floor(now/864e5),D=E%3,mn=Math.floor((now%864e5)/6e4);
 let S=Math.floor(mn*80/1440);
 try{const key='tbc-'+E+'-'+T,u=JSON.parse(localStorage.getItem(key)||'[]');for(let i=0;i<80&&u.includes(S);i++)S=(S+1)%80;u.push(S);localStorage.setItem(key,JSON.stringify(u.slice(-80)))}catch(e){}
 const P=(S*3+D)*14+T;return String((P*7919+1234)%9973).padStart(4,'0')}
function near(d){return TIERS.some(t=>Math.abs(d-t[0])<0.07)}
function parse(s){s=String(s||'');try{s=decodeURIComponent(s)}catch(e){}
 const pats=[/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,/[?&](?:q|query|ll|daddr|destination)=(?:loc:)?(-?\d+\.\d+),\s*(-?\d+\.\d+)/,/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/];
 for(const p of pats){const m=s.match(p);if(m){const la=+m[1],ln=+m[2];if(la>15&&la<33&&ln>34&&ln<56)return[la,ln]}}return null}
const DRV=[['1','عبدالملك'],['2','محمد'],['3','مالك']];
const CSS='.tbf{font-family:inherit;width:100%;max-width:420px;margin:0 auto;text-align:right;direction:rtl}.tbf .c{background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 1px 3px #0001;border:1px solid #e5e7eb}.tbf .lv{font-size:30px;font-weight:800;text-align:center;color:#0a3d2d}.tbf .mu{color:#666;font-size:13px;text-align:center}.tbf .fee{display:flex;gap:8px;margin-top:10px}.tbf .fee div{flex:1;background:#f3f4f6;border-radius:10px;padding:8px;text-align:center;font-size:13px}.tbf .fee b{display:block;font-size:22px}.tbf .lab{font-size:14px;font-weight:700;margin-bottom:8px}.tbf .drv{display:flex;gap:6px}.tbf .drv button{flex:1;border:2px solid #d1d5db;background:#fff;border-radius:10px;padding:10px 2px;font-size:15px;font-weight:700;font-family:inherit;color:#111}.tbf .drv button.on{border-color:#0f766e;background:#ccfbf1}.tbf .note{font-size:42px;font-weight:800;letter-spacing:6px;text-align:center;direction:ltr;margin:4px 0;color:#111}.tbf .note.e{font-size:15px;letter-spacing:0;color:#888;font-weight:400}.tbf .cp{display:block;width:100%;border:0;background:#0f766e;color:#fff;border-radius:10px;padding:12px;font-size:18px;font-weight:700;font-family:inherit}.tbf .cp:disabled{background:#9ca3af}.tbf .warn{color:#b45309;font-size:13px;text-align:center;margin-top:6px}';
function render(el,la,ln){
 if(!document.getElementById('tbfcss')){const st=document.createElement('style');st.id='tbfcss';st.textContent=CSS;document.head.appendChild(st)}
 const d=rk(la,ln),lv=lvl(d),lo=fee(d,0),hi=fee(d,25),F=x=>x?x+' ريال':'مجاني',code=code4(d);
 el.innerHTML='<div class="tbf"><div class="c"><div class="lv">'+LVN[lv]+'</div><div class="mu">المسافة تقريباً '+road(d).toFixed(1)+' كم</div>'
  +(lo!==hi?'<div class="fee"><div>الطلب أقل من 20<b>'+F(lo)+'</b></div><div>الطلب 20 فأكثر<b>'+F(hi)+'</b></div></div>':'<div class="fee"><div>أي طلب<b>'+F(lo)+'</b></div></div>')
  +(near(d)?'<div class="warn">قريب من حد المستوى — تأكد أن الموقع على البيت</div>':'')+'</div>'
  +'<div class="c"><div class="lab">المندوب</div><div class="drv">'+DRV.map(x=>'<button type="button" data-d="'+x[0]+'">'+x[0]+' '+x[1]+'</button>').join('')+'</div></div>'
  +'<div class="c"><div class="lab">اكتبه في ملاحظة الفاتورة:</div><div class="note e">اختر المندوب أولاً</div><button class="cp" type="button" disabled>نسخ</button></div></div>';
 const nt=el.querySelector('.note'),cp=el.querySelector('.cp');let val='';
 el.querySelectorAll('.drv button').forEach(b=>b.onclick=()=>{el.querySelectorAll('.drv button').forEach(x=>x.classList.toggle('on',x===b));val=b.dataset.d+code;nt.textContent=val;nt.classList.remove('e');cp.disabled=false;cp.textContent='نسخ'});
 cp.onclick=async()=>{if(!val)return;let ok=false;try{await navigator.clipboard.writeText(val);ok=true}catch(e){try{const t=document.createElement('textarea');t.value=val;document.body.appendChild(t);t.select();ok=document.execCommand('copy');t.remove()}catch(_){}}cp.textContent=ok?'تم النسخ ✓':'انسخه يدوياً: '+val};
 return {d,lv,lo,hi,code};
}
window.TBFEE={SHOP_LAT,SHOP_LNG,TIERS,rk,fee,lvl,road,tOf,code4,near,parse,render,LVN};
})();
