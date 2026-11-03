import subprocess,random,json,hashlib
from pathlib import Path
base=Path('/tmp/gronify-parser-followup-integrated')
binaries=[str(base/x/'target/release/gronify-native') for x in ['before','after']]
rng=random.Random(2017)
cases=[b'0',b'-0',b'1.00e+999',b'123456789012345678901234567890',b'true',b'false',b'null',b'01',b'1.',b'-',b'1e+',b'1e--2',b'1x',b'1.2.3',b'true0',b'nullx',b'falsee',b'0e-00',b'\xff',b'"\xc0\xaf"',b'"\xe2\x82"']
cases += [bytes(rng.choice(b'019eE+-.xtfn') for _ in range(rng.randrange(1,16))) for _ in range(80)]
count=0
for data in cases:
 for chunk in [1,2,7,65536]:
  for cap in [[],['--limit','1']]:
   commands=[[binary,'flatten','--chunk-size',str(chunk),*cap] for binary in binaries]
   results=[subprocess.run(command,input=data+b' ',capture_output=True) for command in commands]
   assert len({(r.returncode,r.stdout,r.stderr) for r in results})==1,(data,chunk,cap,results)
   count+=1
for token in [b'-0',b'1.20E+999',b'truex',b'1e+',b'01',b'false',b'nullx']:
 for split in range(len(token)+1):
  data=b' '*(65536-split)+token+b' '
  for mode in [['flatten','--limit','1'],['search','--exit-status','--max-count','1','--',' = ']]:
   results=[subprocess.run([binary,*mode],input=data,capture_output=True) for binary in binaries]
   assert len({(r.returncode,r.stdout,r.stderr) for r in results})==1,(token,split,mode)
   count+=1
print(json.dumps({'comparisons':count,'seed':2017,'binary_sha256':[hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in binaries],'checked':'status, exact stdout, exact stderr including offsets; malformed scalars, caps, UTF8, every short chunk and each 64KiB token split'},indent=2))
