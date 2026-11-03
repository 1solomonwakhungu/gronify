from pathlib import Path
src=(Path(__file__).parent/'run.py').read_text().split("(D/'host-start.txt')")[0]
src=src.replace("D/'evidence.json'","D/'semantic-validation.json'").replace("ident=f'","ident=f'semantic-")
exec(compile(src,'run.py-functions','exec'))
import shlex
for size in [1,10,100,1000]:
 f=D/f'events-{size}.json';g=D/'semantic.gron';sink=[sys.executable,str(D/'semantic.py')]
 expected=run(f'{size}-source',sink+[str(f)],f);prep=run(f'{size}-prepare',[N,'flatten',str(f)],f,saveout=g)
 args=['/bin/bash','-o','pipefail','-c',shlex.join([F,'-u','--no-indent','--no-newline',str(g)])+' | '+shlex.join(sink)]
 actual=run(f'{size}-fastgron',args,g)
 report['results'].append({'size_mib':size,'operation':'event-semantic-validation','expected':expected,'actual':actual,'prepare':prep,'matches':expected['status']==actual['status']=='ok' and expected['output_sha256']==actual['output_sha256']});save();g.unlink()
