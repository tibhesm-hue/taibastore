import json,sys,hashlib,datetime
# usage: mksync.py students.json logs.json cfg.json out.json
S=json.load(open(sys.argv[1]));L=json.load(open(sys.argv[2]));C=json.load(open(sys.argv[3]))
def h(n):return hashlib.sha256(("taj|"+n.strip()).encode()).hexdigest()[:12]
st={};last=""
for s in S:
    if s.get("wd"):continue
    lf=s.get("lvFrom") or ""
    dn=[]
    st[h(s["name"])]={"ss":s.get("ss"),"sa":s.get("sa"),"lv":s.get("lv",""),"lvFrom":lf,"mode":s.get("mode","rec"),"sec":s.get("section","m"),"n":0}
for l in L:
    if l["date"]>last:last=l["date"]
def cnt(lf):
    if not lf or not last:return 0
    d=datetime.date.fromisoformat(lf);e=datetime.date.fromisoformat(last);n=0
    while d<=e:
        if d.weekday() not in (3,4):n+=1
        d+=datetime.timedelta(days=1)
    return n
for k,v in st.items():v["n"]=cnt(v["lvFrom"])
st0=datetime.date.fromisoformat(C["start"]);cl=7*int(C.get("weeks",5));today=datetime.date.today()
k=0
while st0+datetime.timedelta(days=cl*k)<=today:k+=1
nxt=(st0+datetime.timedelta(days=cl*k)).isoformat()
out={"at":hashlib.sha256(json.dumps(st,sort_keys=True).encode()).hexdigest()[:10],"d":last,"next":nxt,"st":st}
json.dump(out,open(sys.argv[4],"w"),ensure_ascii=False)
print(len(st),last,nxt)
