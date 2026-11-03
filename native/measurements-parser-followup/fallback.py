import subprocess,time,statistics,json,hashlib
from pathlib import Path
base=Path('/tmp/gronify-parser-followup-combined-final')
out=Path('/tmp/gronify-parser-followup-validation')
bins={'before':base/'before/target/release/gronify-native','after':Path.cwd()/'native/target/release/gronify-native'}
report={'method':'Serial alternating order; 17 repetitions each; final source binary. Warm fixtures; stdout discarded; shared host. Hash-gated outputs.','artifacts':{k:hashlib.sha256(v.read_bytes()).hexdigest() for k,v in bins.items()},'results':[]}
for shape,unit in [('escaped',br'hello\nworld\u0061'),('unicode','漢😀é'.encode()),('ascii',b'abcdefgh')]:
 data=b'["'+unit*((16*1024*1024)//len(unit))+b'"]'
 fixture=out/(shape+'-16m.json');fixture.write_bytes(data)
 for mode,opts in [('flatten',['flatten']),('insensitive',['search'])]:
  args=[*opts,str(fixture),*(['gateway'] if mode=='insensitive' else [])]
  hashes={k:hashlib.sha256(subprocess.check_output([str(v),*args])).hexdigest() for k,v in bins.items()}
  assert len(set(hashes.values()))==1
  samples={k:[] for k in bins}
  for i in range(17):
   for key in list(bins)[::1 if i%2==0 else -1]:
    start=time.perf_counter()
    subprocess.run([str(bins[key]),*args],stdout=subprocess.DEVNULL,check=True)
    samples[key].append((time.perf_counter()-start)*1000)
  row={'shape':shape,'mode':mode,'input_sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'output_sha256':hashes,'samples_ms':samples,'medians_ms':{k:statistics.median(v) for k,v in samples.items()}}
  report['results'].append(row);print(shape,mode,row['medians_ms'],flush=True)
(out/'fallback.json').write_text(json.dumps(report,indent=2)+'\n')
