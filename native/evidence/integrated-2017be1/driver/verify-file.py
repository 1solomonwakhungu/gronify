from pathlib import Path
src=(Path(__file__).parent/'run.py').read_text().split("(D/'host-start.txt')")[0]
src=src.replace("D/'evidence.json'","D/'file-validation.json'").replace("ident=f'","ident=f'filecheck-")
exec(compile(src,'run.py-functions','exec'))
import shlex
base=json.loads((D/'evidence.json').read_text());f=D/'events-1000.json';g=D/'verify-1000.gron'
prep=run('1000-prepare',[N,'flatten',str(f)],f,saveout=g);report['fixtures'].append({'gron_receipt':prep});save()
expected=next(x for x in base['results'] if x['size_mib']==1000 and x['operation']=='flatten')['samples']['native'][0]['output_sha256']
args=['/bin/bash','-o','pipefail','-c',shlex.join([F,'-u','--no-indent','--no-newline',str(g)])+' | '+shlex.join([N,'flatten'])]
row=group(1000,'file-unflatten-reflatten-validation',{'fastgron':args},g,{'flatten_sha256':expected})
for s in row['samples']['fastgron']:s['matches_expected']=s.get('status')=='ok' and s.get('output_sha256')==expected
save();g.unlink(missing_ok=True)
