#!/usr/bin/env python3
"""Current-tree, full-output-gated native/Node comparison. Build both CLIs first."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import platform
import re
import shutil
import signal
import statistics
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
RECORD = b'{"id":123,"service":"gateway","ok":true,"tags":["alpha","beta"],"detail":{"latency":12,"message":"request completed"}}'
NATIVE = ROOT / 'native/target/release/gronify-native'
NODE = ['node', str(ROOT / 'src/packages/cli/dist/index.js'), '--no-color']


def sha(path):
    h = hashlib.sha256()
    with pathlib.Path(path).open('rb') as source:
        while chunk := source.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def command(args):
    return subprocess.check_output(args, cwd=ROOT, text=True, stderr=subprocess.STDOUT).strip()


def bounded_run(args, *, timeout=None, check=False, **kwargs):
    process = subprocess.Popen(args, start_new_session=True, **kwargs)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise
    if check and process.returncode:
        raise subprocess.CalledProcessError(process.returncode, args, stdout, stderr)
    return subprocess.CompletedProcess(args, process.returncode, stdout, stderr)


def output_digest(args):
    with tempfile.TemporaryFile() as output:
        bounded_run(args, stdout=output, stderr=subprocess.PIPE, check=True, timeout=120)
        count = output.tell()
        output.seek(0)
        digest = hashlib.sha256()
        while chunk := output.read(1024 * 1024):
            digest.update(chunk)
        return {'sha256': digest.hexdigest(), 'bytes': count}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=pathlib.Path)
    args = parser.parse_args()
    fast = shutil.which('fastgron')
    assert fast, 'fastgron must be installed for this comparison'
    source = [*sorted((ROOT/'native/src').glob('*.rs')), *sorted((ROOT/'src/packages/cli/src').rglob('*.ts'))]
    hashes = {str(p.relative_to(ROOT)): sha(p) for p in source}
    report = {
        'schemaVersion': 1, 'sourceCommit': command(['git', 'rev-parse', 'HEAD']),
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'dirtyState': command(['git', 'status', '--porcelain']),
        'platform': platform.platform(), 'loadAverageStart': os.getloadavg(),
        'sourceSha256': hashes, 'harnessSha256': sha(__file__),
        'artifactSha256': {str(p).replace(str(ROOT), '<repo>'): sha(p) for p in [NATIVE, pathlib.Path(fast), pathlib.Path(shutil.which('node')), *sorted((ROOT/'src/packages/cli/dist').rglob('*.js'))]},
        'limits': {'timeoutSeconds':120,'maxCompletedRssBytes':8*1024**3,'liveMemoryWatchdog':False},
        'versions': {'node': command(['node', '--version']), 'rustc': command(['rustc', '--version']), 'fastgron': command([fast, '--version'])},
        'requiredBuildCommands': ['npm ci --no-audit --no-fund (cwd src/packages/cli)', 'npm run build (cwd src/packages/cli)', 'cargo build --release --locked --manifest-path native/Cargo.toml'],
        'method': 'Three serial rotated-order trials, warm file cache, stdout /dev/null; time includes process startup and /usr/bin/time wrapper. Medians and all trials retained. Shared host, no isolated-host confidence claim. Full output hashes gate flatten/search/caps/depth equality before timing; unflatten checks full parsed JSON equality and exact Node/native bytes. Native remains experimental and is not the npm command. These ASCII record fixtures differ from the default CLI landing-page suite; compare tools within each workload only.',
        'coverageNote': 'fastgron is not run on the 1GiB fixture to bound host memory; no native-vs-fastgron comparison at that size. All three tools are measured at 100MiB. Native subset and Node share exact output gates.',
        'fixtureRecipe': {'record': RECORD.decode(), 'construction': 'b"[" + b",".join([record]*max(1,(targetBytes-2)//(len(record)+1))) + b"]"'},
        'results': [],
    }
    with tempfile.TemporaryDirectory(prefix='gronify-current-native-') as directory:
        tmp = pathlib.Path(directory)
        fixtures = {}
        for label, size in [('tiny-startup', len(RECORD)+2), ('records-1MiB', 1024**2), ('records-32MiB', 32*1024**2), ('records-100MiB', 100*1024**2), ('records-1GiB', 1024**3)]:
            path = tmp / (label + '.json')
            count = max(1,(size-2)//(len(RECORD)+1))
            with path.open('wb') as out:
                out.write(b'[' + RECORD)
                block = (b',' + RECORD)*8192
                remaining = count-1
                while remaining >= 8192:
                    out.write(block); remaining -= 8192
                out.write((b',' + RECORD)*remaining + b']')
            fixtures[label] = path
        deep = tmp/'deep.json'
        deep.write_bytes(b'{"a":'*5000+b'1'+b'}'*5000)
        fixtures['deep-5000'] = deep
        jobs = []
        for label, path in fixtures.items():
            cmds = {'native': [str(NATIVE),'flatten',str(path)], 'node': [*NODE,'flatten',str(path)]}
            if label != 'records-1GiB': cmds['fastgron'] = [fast,'--no-color',str(path)]
            jobs.append((label,'flatten',path,cmds))
        path = fixtures['records-32MiB']
        for mode, opts, term in [('search-sensitive',['-c'],'gateway'),('search-insensitive',[],'GATEWAY'),('search-count',['-c','--count'],'gateway'),('search-cap10',['-c','--max-count','10'],'gateway')]:
            cmds = {'native': [str(NATIVE),'search',*opts,str(path),term], 'node': [*NODE,'search',*opts,str(path),term]}
            if mode in ['search-sensitive','search-insensitive']:
                cmds['fastgron'] = [fast,'--no-color',*(['-i'] if mode=='search-insensitive' else []),'-F',term,str(path)]
            jobs.append(('records-32MiB',mode,path,cmds))
        jobs.append(('records-100MiB','flatten-cap10',fixtures['records-100MiB'], {'native':[str(NATIVE),'flatten','--limit','10',str(fixtures['records-100MiB'])], 'node':[*NODE,'flatten','--limit','10',str(fixtures['records-100MiB'])]}))
        for label in ['records-1MiB','records-32MiB']:
            path = tmp/(label+'.gron')
            with path.open('wb') as out:
                bounded_run([str(NATIVE),'flatten',str(fixtures[label])],stdout=out,check=True)
            jobs.append((label,'unflatten',path,{'native':[str(NATIVE),'unflatten',str(path)],'node':[*NODE,'unflatten',str(path)],'fastgron':[fast,'-u','--no-color','--no-indent','--no-newline',str(path)]}))
        for label, mode, path, cmds in jobs:
            outputs = {}
            failed = {}
            original_commands = dict(cmds)
            trials = {name:[] for name in cmds}
            for name, cmd in cmds.items():
                started = time.perf_counter()
                try:
                    outputs[name] = output_digest(cmd)
                    trials[name].append({'phase':'output-hash','status':'ok','elapsedSeconds':time.perf_counter()-started,'exitCode':0})
                except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
                    failed[name] = 'full-output validation did not complete: ' + type(error).__name__
                    trials[name].append({'phase':'output-hash','status':'failed','elapsedSeconds':time.perf_counter()-started,'exitCode':getattr(error,'returncode',None),'reason':failed[name],'stderr':(getattr(error,'stderr',None) or b'').decode(errors='replace')[:500]})
            validation = 'full output SHA256 and length equal across measured tools before timing'
            reference = outputs.get('node')
            if reference is None:
                for name in cmds: failed[name] = 'Node reference output unavailable; comparison not timed'
            elif mode == 'unflatten':
                expected = json.loads(fixtures[label].read_bytes())
                for name, cmd in cmds.items():
                    if name in failed: continue
                    started = time.perf_counter()
                    try:
                        with tempfile.TemporaryFile() as out:
                            bounded_run(cmd,stdout=out,check=True,timeout=120)
                            out.seek(0)
                            if json.load(out) != expected: failed[name] = 'parsed output differs from source'
                        trials[name].append({'phase':'semantic-check','status':'failed' if name in failed else 'ok','elapsedSeconds':time.perf_counter()-started,'reason':failed.get(name),'exitCode':0})
                    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError) as error:
                        failed[name] = 'unflatten semantic validation failed'
                        trials[name].append({'phase':'semantic-check','status':'failed','elapsedSeconds':time.perf_counter()-started,'exitCode':getattr(error,'returncode',None),'reason':type(error).__name__})
                del expected
                if outputs.get('native') != reference: failed['native'] = 'native output differs from Node bytes'
                validation = 'full parsed JSON equals source for every measured tool; native and node also match byte-for-byte; fastgron changes key order/whitespace'
            else:
                for name, output in outputs.items():
                    if output != reference: failed[name] = 'full output differs from Node reference'
            cmds = {name:cmd for name,cmd in cmds.items() if name not in failed}
            samples = {name:[] for name in cmds}
            names = list(cmds)
            for run in range(3 if names else 0):
                for name in names[run % len(names):]+names[:run % len(names)]:
                    if name in failed: continue
                    with path.open('rb') as src:
                        while src.read(1024*1024): pass
                    metrics = tmp/'time.txt'
                    started = time.perf_counter()
                    try:
                        completed = bounded_run(['/usr/bin/time','-l' if platform.system()=='Darwin' else '-v','-o',str(metrics),*cmds[name]],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=120)
                    except subprocess.TimeoutExpired:
                        failed[name] = 'timed command exceeded 120 seconds'
                        trials[name].append({'phase':'timing','status':'timeout','elapsedSeconds':time.perf_counter()-started,'reason':failed[name]})
                        continue
                    elapsed = time.perf_counter()-started
                    if completed.returncode != 0:
                        failed[name] = 'timed command exited ' + str(completed.returncode)
                        trials[name].append({'phase':'timing','status':'failed','elapsedSeconds':elapsed,'exitCode':completed.returncode,'stderr':(completed.stderr or b'').decode(errors='replace')[:500]})
                        continue
                    timing = metrics.read_text()
                    rss = int(re.search(r'(\d+)\s+maximum resident set size',timing)[1]) if platform.system()=='Darwin' else int(re.search(r'Maximum resident set size \(kbytes\):\s*(\d+)',timing)[1])*1024
                    samples[name].append({'seconds':elapsed,'rssBytes':rss})
                    if rss > 8*1024**3: failed[name] = 'completed peak RSS exceeded 8GiB budget'
                    trials[name].append({'phase':'timing','status':'failed' if name in failed else 'ok','elapsedSeconds':elapsed,'rssBytes':rss,'exitCode':0,'reason':failed.get(name)})
            report['results'].append({'id':label+'-'+mode,'workload':label,'mode':mode,'inputBytes':path.stat().st_size,'inputSha256':sha(path),'validation':validation,'outputs':outputs,'tools':[{'tool':name,'status':'ok','command':[x.replace(str(ROOT),'<repo>').replace(str(tmp),'<fixtures>') for x in cmds[name]],'seconds':statistics.median(s['seconds'] for s in samples[name]),'peakRssBytes':statistics.median(s['rssBytes'] for s in samples[name]),'samples':samples[name],'trials':trials[name]} for name in names if name not in failed] + [{'tool':name,'status':'failed','note':note,'command':[x.replace(str(ROOT),'<repo>').replace(str(tmp),'<fixtures>') for x in original_commands[name]],'trials':trials[name],'seconds':None,'peakRssBytes':None,'samples':samples.get(name,[])} for name,note in failed.items()]})
            print(label,mode,flush=True)
    assert hashes == {str(p.relative_to(ROOT)):sha(p) for p in source}, 'Runtime source changed during timings'
    for artifact,digest in report['artifactSha256'].items():
        assert sha(pathlib.Path(artifact.replace('<repo>',str(ROOT)))) == digest, 'Executed artifact changed during timings'
    report['runtimeSourceUnchanged'] = True
    report['executedArtifactsUnchanged'] = True
    report['loadAverageEnd'] = os.getloadavg()
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2)+'\n')


if __name__ == '__main__':
    main()
