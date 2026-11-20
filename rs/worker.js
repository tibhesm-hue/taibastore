// وسيط أسواق طيبة: يفك رابط خرائط قوقل المختصر ويرجع الإحداثيات فقط
const OK_HOST=/^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.)?google\.[a-z.]+)$/;
function parse(s){
  try{s=decodeURIComponent(s)}catch(e){}
  const pats=[/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,/@(-?\d+\.\d+),(-?\d+\.\d+)/,/[?&](?:q|query|ll|daddr|destination|center)=(?:loc:)?(-?\d+\.\d+),\s*(-?\d+\.\d+)/,/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/,/(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})/];
  for(const p of pats){const m=s.match(p);if(m){const la=+m[1],ln=+m[2];if(la>15&&la<33&&ln>34&&ln<56)return[la,ln]}}
  return null}
const H={'access-control-allow-origin':'*','content-type':'application/json; charset=utf-8'};
const UA={'user-agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36','accept-language':'ar,en;q=0.8','cookie':'CONSENT=YES+'};
export default{async fetch(req){
  const u=new URL(req.url).searchParams.get('u')||'';
  let url;try{url=new URL(u)}catch(e){return new Response('{"err":"bad"}',{status:400,headers:H})}
  if(!OK_HOST.test(url.hostname))return new Response('{"err":"host"}',{status:400,headers:H});
  let cur=url.href;
  for(let i=0;i<6;i++){
    const p=parse(cur);if(p)return new Response(JSON.stringify({lat:p[0],lng:p[1],via:'url'}),{headers:H});
    const r=await fetch(cur,{redirect:'manual',headers:UA});
    const loc=r.headers.get('location');
    if(loc){cur=new URL(loc,cur).href;continue}
    const t=(await r.text()).slice(0,800000);const q=parse(t);
    if(q)return new Response(JSON.stringify({lat:q[0],lng:q[1],via:'page'}),{headers:H});
    break}
  return new Response(JSON.stringify({err:'nocoords',last:cur.slice(0,200)}),{headers:H})}}
