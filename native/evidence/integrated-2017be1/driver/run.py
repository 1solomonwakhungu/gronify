import os,sys,time,json,hashlib,subprocess as sp,threading,signal,re,shutil,platform,statistics
from pathlib import Path
D=Path(__file__).parent; R=Path.cwd(); START=time.monotonic(); DEADLINE=START+11*60
N=str(R/'native/target/release/gronify-native'); NODE=[shutil.which('node'),str(R/'src/packages/cli/dist/index.js'),'--no-color']; F=shutil.which('fastgron'); J=shutil.which('jq')
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  while b:=f.read(1024*1024): h.update(b)
 return h.hexdigest()
def cmd(a): return sp.run(a,stdout=sp.PIPE,stderr=sp.STDOUT,text=True).stdout.strip()
report={'commit':cmd(['git','rev-parse','HEAD']),'dirty':cmd(['git','status','--porcelain']),'platform':platform.platform(),'start_utc':cmd(['date','-u']),'versions':{k:cmd(v) for k,v in {'node':[NODE[0],'--version'],'fastgron':[F,'--version'],'jq':[J,'--version'],'rust':['rustc','-Vv']}.items()},'fixtures':[],'results':[],'method':{'samples':3,'timeout_seconds':120,'guard_bytes':8*1024**3,'cache':'warm each input before each sample','order':'rotate tool order each round','sink':'streamed SHA256 in harness parent; no output retained except one common gron file per size','rss':'/usr/bin/time -l maximum child RSS; tree sum sampled separately every 0.10s','host':'shared, builders may contend; load and top process snapshots retained'}}
artifacts=[Path(N),Path(NODE[0]).resolve(),Path(F).resolve(),Path(J).resolve(),Path('/usr/bin/time')]+list((R/'native/src').glob('*.rs'))+list((R/'src/packages/cli/dist').rglob('*.js'))+[R/'src/packages/cli/scripts/bench-compare.mjs',R/'native/Cargo.lock',R/'src/packages/cli/package-lock.json',Path(__file__),D/'generate.mjs']
report['artifacts']={str(p):{'sha256':sha(p),'bytes':p.stat().st_size} for p in artifacts}
def save(): (D/'evidence.json').write_text(json.dumps(report,indent=2)+'\n')
def run(label,args,inputfile,sample=0,saveout=None):
 if time.monotonic()>DEADLINE:
  return {'status':'budget-not-run','command':args,'sample':sample}
 with open(inputfile,'rb') as f:
  while f.read(1024*1024): pass
 ident=f'{len(report["results"]):03}-{label}-{sample}'; metric=D/(ident+'.time'); err=D/(ident+'.stderr')
 state={'peak_tree_rss_bytes':0,'guard_reason':None}; done=threading.Event()
 t=time.perf_counter(); p=sp.Popen(['/usr/bin/time','-l','-o',str(metric),*args],stdout=sp.PIPE,stderr=err.open('wb'),start_new_session=True)
 def guard():
  while not done.wait(.10):
   try:
    rows=[list(map(int,l.split())) for l in sp.check_output(['ps','-axo','pid=,ppid=,rss='],text=True).splitlines() if l.strip()]; ids={p.pid}
    for _ in range(8): ids|={pid for pid,ppid,rss in rows if ppid in ids}
    rss=sum(rss*1024 for pid,ppid,rss in rows if pid in ids); state['peak_tree_rss_bytes']=max(rss,state['peak_tree_rss_bytes'])
    reason='rss-guard' if rss>8*1024**3 else 'timeout' if time.perf_counter()-t>120 else None
    if reason:
     state['guard_reason']=reason; os.killpg(p.pid,signal.SIGKILL); return
   except ProcessLookupError:return
 thread=threading.Thread(target=guard,daemon=True);thread.start(); h=hashlib.sha256(); count=0; lines=0; tail=b''; prefix=b''; out=open(saveout,'wb') if saveout else None
 while b:=p.stdout.read(1024*1024):
  h.update(b); count+=len(b);lines+=b.count(b'\n');tail=(tail+b)[-100:]
  if len(prefix)<500:prefix=(prefix+b)[:500]
  if out:out.write(b)
 if out:out.close()
 rc=p.wait(); elapsed=time.perf_counter()-t; done.set();thread.join(); text=metric.read_text() if metric.exists() else ''; m=re.search(r'(\d+)\s+maximum resident set size',text)
 result={'command':args,'sample':sample,'status':state['guard_reason'] or ('ok' if rc==0 else 'exit-error'),'exit_code':rc,'wall_s':elapsed,'rss_bytes':int(m[1]) if m else None,**state,'output_sha256':h.hexdigest(),'output_bytes':count,'output_lines':lines,'tail':tail.decode('utf8','replace'),'prefix':prefix.decode('utf8','replace'),'metrics':str(metric),'stderr':str(err),'load':os.getloadavg()}
 print(label,sample,result['status'],round(elapsed,3),result['rss_bytes'],flush=True);return result

def group(size,op,commands,inputfile,expected=None):
 row={'size_mib':size,'operation':op,'input':str(inputfile),'commands':commands,'samples':{},'expected':expected};report['results'].append(row); names=list(commands)
 for sample in range(3):
  order=names[sample%len(names):]+names[:sample%len(names)]
  for name in order:
   row['samples'].setdefault(name,[]).append(run(f'{size}-{op}-{name}',commands[name],inputfile,sample));save()
 return row
(D/'host-start.txt').write_text(cmd(['ps','-axo','pid,ppid,%cpu,rss,comm']))
# Raw numeric lexemes are separate from event records.
raw=D/'raw-numbers.json';raw.write_bytes(b'[-0,1.10,123456789012345678901234567890,1e999,-1E-999,2.00E+12]')
group('raw','flatten',{'native':[N,'flatten',str(raw)],'node':NODE+['flatten',str(raw)],'fastgron':[F,'--no-color',str(raw)],'jq':[J,'--stream','-c','.',str(raw)]},raw)
tiny=D/'tiny.json';tiny.write_bytes(b'{"message":"timeout","name":"Tom\xc3\xa1s"}')
group('tiny','startup',{'native':[N,'flatten',str(tiny)],'node':NODE+['flatten',str(tiny)],'fastgron':[F,'--no-color',str(tiny)],'jq':[J,'--stream','-c','.',str(tiny)]},tiny)
for size in [1,10,100,1000]:
 f=D/f'events-{size}.json';gen=next(x for x in map(json.loads,(D/'generation.jsonl').read_text().splitlines()) if x['mib']==size)
 # Expected compact roundtrip includes the terminal LF emitted by all tested unflatteners.
 h=hashlib.sha256()
 with f.open('rb') as inp:
  while b:=inp.read(1024*1024):h.update(b)
 original=h.hexdigest();h.update(b'\n')
 report['fixtures'].append({**gen,'bytes':f.stat().st_size,'sha256':original,'roundtrip_lf_sha256':h.hexdigest()});save()
 for op in ['flatten','search','unflatten']:
  if op=='flatten':commands={'native':[N,'flatten',str(f)],'node':NODE+['flatten',str(f)],'fastgron':[F,'--no-color',str(f)],'jq-events':[J,'--stream','-c','.',str(f)]};inputfile=f
  elif op=='search':commands={'native':[N,'search',str(f),'TIMEOUT'],'node':NODE+['search',str(f),'TIMEOUT'],'fastgron':[F,'--no-color','-i','-F','TIMEOUT',str(f)]};inputfile=f
  else:
   g=D/f'events-{size}.gron';prep=run(f'{size}-prepare-gron',[N,'flatten',str(f)],f,saveout=g);report['fixtures'][-1]['gron']={'path':str(g),'receipt':prep};save()
   commands={'native':[N,'unflatten',str(g)],'node':NODE+['unflatten',str(g)],'fastgron':[F,'-u','--no-indent','--no-newline',str(g)]};inputfile=g
  group(size,op,commands,inputfile,{'matches':gen['matches']} if op=='search' else None)
  if op=='unflatten':g.unlink(missing_ok=True)
 if size in [1,1000]:
  group(size,'cap-flatten',{'native':[N,'flatten','--limit','10',str(f)],'node':NODE+['flatten','--limit','10',str(f)]},f)
  group(size,'cap-search',{'native':[N,'search','--max-count','10',str(f),'TIMEOUT'],'node':NODE+['search','--max-count','10',str(f),'TIMEOUT']},f)
report['end_utc']=cmd(['date','-u']);report['duration_s']=time.monotonic()-START
(D/'host-end.txt').write_text(cmd(['ps','-axo','pid,ppid,%cpu,rss,comm']));save()
