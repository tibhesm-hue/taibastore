# يبني مقاطع الاستماع (سعد الغامدي) في itqan/audio من everyayah
import json,os,subprocess,urllib.request,time
K=json.load(open('tools/audk.json'));os.makedirs('itqan/audio',exist_ok=True);os.makedirs('/tmp/ay',exist_ok=True)
def get(f):
  p='/tmp/ay/'+f+'.mp3'
  if os.path.exists(p) and os.path.getsize(p)>0:return p
  for base in ['https://everyayah.com/data/Ghamadi_40kbps/','https://mirrors.quranicaudio.com/everyayah/Ghamadi_40kbps/']:
    for t in range(3):
      try:
        d=urllib.request.urlopen(base+f+'.mp3',timeout=30).read()
        if d:open(p,'wb').write(d);return p
      except Exception as e:time.sleep(1)
  raise SystemExit('fail '+f)
for k in K:
  o='itqan/audio/'+k+'.mp3'
  if os.path.exists(o) and os.path.getsize(o)>0:continue
  L=[]
  for seg in k.split('_'):
    s,a1,a2=[int(x) for x in seg.split('-')]
    for a in range(a1,a2+1):L.append(get('%03d%03d'%(s,a)))
  open('/tmp/l.txt','w').write(''.join("file '%s'\n"%p for p in L))
  subprocess.run(['ffmpeg','-loglevel','error','-y','-f','concat','-safe','0','-i','/tmp/l.txt','-ac','1','-ar','22050','-b:a','32k',o],check=True)
print(len(os.listdir('itqan/audio')))
