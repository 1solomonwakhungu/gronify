from pathlib import Path
src=(Path(__file__).parent/'run.py').read_text().split("(D/'host-start.txt')")[0]
src=src.replace("D/'evidence.json'","D/'supplement.json'").replace("ident=f'","ident=f'supp-")
exec(compile(src,'run.py-functions','exec'))
import shlex
base=json.loads((D/'evidence.json').read_text())
# Streaming normalization re-flattens reconstructed JSON. It preserves raw numeric
# lexemes and string values but removes serializer whitespace differences.
for size in ['raw',1,10,100,1000]:
 f=D/('raw-numbers.json' if size=='raw' else f'events-{size}.json')
 flatten=[N,'flatten',str(f)]; q=shlex.join
 commands={name:['/bin/bash','-o','pipefail','-c',q(flatten)+' | '+q(unflat)+' | '+q([N,'flatten'])] for name,unflat in {'native':[N,'unflatten'],'node':NODE+['unflatten'],'fastgron':[F,'-u','--no-indent','--no-newline']}.items()}
 expected=next(x for x in base['results'] if x['size_mib']==size and x['operation']=='flatten')['samples']['native'][0]['output_sha256']
 row=group(size,'roundtrip-reflatten-validation',commands,f,{'flatten_sha256':expected})
 for name,samples in row['samples'].items():
  for sample in samples:sample['matches_expected']=sample.get('status')=='ok' and sample.get('output_sha256')==expected
 save()
report['end_utc']=cmd(['date','-u']);save()
for size in [1,1000]:
 f=D/f'events-{size}.json';q=shlex.join
 group(size,'cap-flatten-context',{'fastgron':['/bin/bash','-c',q([F,'--no-color',str(f)])+' | head -n 10'],'jq-events':['/bin/bash','-c',q([J,'--stream','-c','.',str(f)])+' | head -n 10']},f)
 group(size,'cap-search-context',{'fastgron':['/bin/bash','-c',q([F,'--no-color','-i','-F','TIMEOUT',str(f)])+' | head -n 10'],'jq-events':['/bin/bash','-c',q([J,'--stream','-c','.',str(f)])+' | grep -i -m 10 timeout']},f)
report['end_utc']=cmd(['date','-u']);save()
