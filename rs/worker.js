// وسيط أسواق طيبة: يفك رابط خرائط قوقل المختصر ويرجع الإحداثيات فقط (نسخة 2)
const OK_HOST=/^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.|consent\.)?google\.[a-z.]+)$/;
function unesc(s){return s.replace(/\\u0026/gi,'&').replace(/\\u003d/gi,'=').replace(/\\u0021/gi,'!').replace(/\\u002f/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&')}
function parse(s){
  s=unesc(s);try{s=decodeURIComponent(s)}catch(e){}
  const pats=[/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,/@(-?\d+\.\d+),(-?\d+\.\d+)/,/[?&](?:q|query|ll|daddr|destination|center)=(?:loc:)?(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i,/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/,/(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})/];
  for(const p of pats){const re=new RegExp(p.source,p.flags+'g');let m;while((m=re.exec(s))){const la=+m[1],ln=+m[2];if(la>15&&la<33&&ln>34&&ln<56)return[la,ln]}}
  return null}
function nextUrl(t,cur){t=unesc(t);
  const m=t.match(/https?:\/\/(?:www\.|maps\.)?google\.[a-z.]+\/maps[^"'\s<>\\]*/i)||t.match(/http-equiv=["']?refresh["']?[^>]*url=([^"'>]+)/i)||t.match(/(?:location\.href|location\.replace\(|window\.location)\s*=?\s*["']([^"']+)/i);
  if(!m)return null;const u=m[1]||m[0];try{return new URL(u,cur).href}catch(e){return null}}
const H={'access-control-allow-origin':'*','content-type':'application/json; charset=utf-8'};
const UA={'user-agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36','accept-language':'ar,en;q=0.8','cookie':'CONSENT=YES+cb; SOCS=CAESHAgBEhJnd3NfMjAyNDA1MDEtMF9SQzEaAmVuIAEaBgiA_LyaBg'};
const J=(o)=>new Response(JSON.stringify(o),{headers:H});
export default{async fetch(req){
  const u=new URL(req.url).searchParams.get('u')||'';
  let url;try{url=new URL(u)}catch(e){return new Response('{"err":"bad"}',{status:400,headers:H})}
  if(!OK_HOST.test(url.hostname))return new Response('{"err":"host"}',{status:400,headers:H});
  let cur=url.href,dbg=[];
  for(let i=0;i<8;i++){
    const p=parse(cur);if(p)return J({lat:p[0],lng:p[1],via:'url'});
    let r;try{r=await fetch(cur,{redirect:'manual',headers:UA})}catch(e){dbg.push('fetchErr '+e.message);break}
    const loc=r.headers.get('location');dbg.push(r.status+(loc?' -> '+loc.slice(0,150):''));
    if(loc){cur=new URL(loc,cur).href;continue}
    const t=(await r.text()).slice(0,1500000);const q=parse(t);
    if(q)return J({lat:q[0],lng:q[1],via:'page'});
    const n=nextUrl(t,cur);
    if(n&&n!==cur&&OK_HOST.test(new URL(n).hostname)){dbg.push('body -> '+n.slice(0,150));cur=n;continue}
    dbg.push('body: '+t.replace(/\s+/g,' ').slice(0,600));break}
  return J({err:'nocoords',last:cur.slice(0,300),dbg})}}
