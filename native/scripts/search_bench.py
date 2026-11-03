#!/usr/bin/env python3
"""Focused serial search benchmark; output hashes gate equivalent fixtures."""
import datetime
import hashlib
import json
import pathlib
import platform
import re
import statistics
import subprocess
import tempfile
import time
from bench import ROOT, NATIVE, output_hash, version


def main():
    builds = [['cargo', 'build', '--release', '--locked', '--manifest-path', 'native/Cargo.toml'], ['npm', 'run', 'build', '--prefix', 'src/packages/cli']]
    for cmd in builds:
        subprocess.run(cmd, cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    report = {'started_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'checkout_commit': version(['git', 'rev-parse', 'HEAD']), 'dirty_state': version(['git', 'status', '--porcelain']),
              'build_commands': builds, 'platform': platform.platform(),
              'versions': {n: version(c) for n,c in {'node':['node','--version'], 'rustc':['rustc','--version'], 'fastgron':['fastgron','--version']}.items()},
              'method': '3 serial samples, rotated order, warm file cache, stdout /dev/null. Includes startup/time wrapper. Shared machine: integrated full benchmark reported active; contention not isolated. ASCII record fixture only. fastgron-F uses -i only for insensitive mode. Counts/caps compare Node only; fastgron offers no equivalent flags.',
              'sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [pathlib.Path(NATIVE), *sorted((ROOT/'native/src').glob('*.rs')), *sorted((ROOT/'src/packages/cli/dist').rglob('*.js'))]}, 'results': []}
    record = b'{"id":123,"service":"gateway","ok":true,"tags":["alpha","beta"],"detail":{"latency":12,"message":"request completed"}}'
    with tempfile.TemporaryDirectory(prefix='gronify-search-bench-') as tmp:
        tmp = pathlib.Path(tmp)
        for label, size in [('small', 1024), ('records-32MiB', 32*1024*1024)]:
            path = tmp/'records.json'
            path.write_bytes(b'[' + b','.join([record] * max(1, (size-2)//(len(record)+1))) + b']')
            for mode, opts, term in [('sensitive', ['-c'], 'gateway'), ('insensitive', [], 'GATEWAY'), ('count', ['-c','--count'], 'gateway'), ('cap10', ['-c','--max-count','10'], 'gateway')]:
                commands = {'native': [NATIVE,'search',*opts,str(path),term], 'node':['node', str(ROOT/'src/packages/cli/dist/index.js'),'--no-color','search',*opts,str(path),term]}
                if mode in ['sensitive', 'insensitive']:
                    commands['fastgron-F'] = ['fastgron','--no-color',*(['-i'] if mode == 'insensitive' else []),'-F',term,str(path)]
                hashes = {name: output_hash(cmd) for name,cmd in commands.items()}
                assert len(set(hashes.values())) == 1, (label, mode, hashes)
                samples = {name: [] for name in commands}
                names = list(commands)
                for i in range(3):
                    for name in names[i%len(names):]+names[:i%len(names)]:
                        with path.open('rb') as src:
                            while src.read(1024*1024): pass
                        metrics = tmp/'time.txt'
                        cmd = ['/usr/bin/time', '-l' if platform.system() == 'Darwin' else '-v', '-o', str(metrics), *commands[name]]
                        start = time.perf_counter()
                        p = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
                        elapsed = time.perf_counter()-start
                        assert p.returncode == 0, p.stderr
                        text = metrics.read_text()
                        rss = int(re.search(r'(\d+)\s+maximum resident set size', text)[1]) if platform.system() == 'Darwin' else int(re.search(r'Maximum resident set size \(kbytes\):\s*(\d+)',text)[1])*1024
                        samples[name].append({'seconds': elapsed, 'rss_bytes': rss})
                for name, cmd in commands.items():
                    report['results'].append({'workload':label,'mode':mode,'tool':name,'input_bytes':path.stat().st_size,'command':[s.replace(str(ROOT),'<repo>').replace(str(path),'<fixture>') for s in cmd], 'output_sha256':hashes[name], 'samples': samples[name], 'median_seconds': statistics.median(s['seconds'] for s in samples[name]), 'median_rss_bytes':statistics.median(s['rss_bytes'] for s in samples[name])})
                print(label, mode, flush=True)
    (ROOT/'native/search-measurements.json').write_text(json.dumps(report,indent=2)+'\n')


if __name__ == '__main__':
    main()
