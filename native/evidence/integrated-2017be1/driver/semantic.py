import sys,json,hashlib
# Bounded one-record decoding of top-level event array; fixture numeric values
# are safe integers / ordinary finite floats. Raw lexemes are tested separately.
f=open(sys.argv[1],encoding='utf8') if len(sys.argv)>1 else sys.stdin
buf='';pos=0;decoder=json.JSONDecoder();h=hashlib.sha256();count=0;eof=False

def more():
 global buf,pos,eof
 buf=buf[pos:];pos=0;x=f.read(1024*1024);buf+=x;eof=not x

def skip():
 global pos
 while True:
  while pos<len(buf) and buf[pos].isspace():pos+=1
  if pos<len(buf) or eof:return
  more()
more();skip();assert buf[pos]=='[';pos+=1
while True:
 skip()
 if pos<len(buf) and buf[pos]==']':pos+=1;break
 if count:
  assert buf[pos]==',';pos+=1;skip()
 while True:
  try:v,end=decoder.raw_decode(buf,pos);break
  except json.JSONDecodeError:
   if eof:raise
   more()
 pos=end
 h.update(json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode());h.update(b'\n');count+=1
 if pos>1024*1024:more()
skip();assert pos==len(buf) and eof
print(json.dumps({'records':count,'canonical_record_sha256':h.hexdigest()}))
