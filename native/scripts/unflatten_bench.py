#!/usr/bin/env python3
"""Focused serial unflatten benchmark. Build both CLIs before running."""
import datetime
import hashlib
import json
import pathlib
import platform
import re
import shutil
import statistics
import subprocess
import tempfile
import time
from bench import ROOT, NATIVE, version


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    fast = shutil.which('fastgron')
    assert fast, 'fastgron required for this comparison'
    commands = {'native': [NATIVE, 'unflatten'],
                'node': ['node', str(ROOT / 'src/packages/cli/dist/index.js'), '--no-color', 'unflatten'],
                'fastgron': [fast, '-u', '--no-color', '--no-indent', '--no-newline']}
    artifacts = [pathlib.Path(NATIVE), pathlib.Path(fast), *sorted((ROOT / 'src/packages/cli/dist').rglob('*.js'))]
    report = {'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'commit': version(['git', 'rev-parse', 'HEAD']),
              'dirty': version(['git', 'status', '--porcelain']),
              'platform': platform.platform(), 'machine': platform.machine(),
              'versions': {name: version(cmd) for name, cmd in {'rustc': ['rustc', '--version'], 'node': ['node', '--version'], 'fastgron': [fast, '--version']}.items()},
              'source_sha256': {str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in sorted((ROOT / 'native/src').glob('*.rs'))},
              'artifact_sha256': {str(p).replace(str(ROOT), '<repo>'): digest(p.read_bytes()) for p in artifacts},
              'commands': {k: [s.replace(str(ROOT), '<repo>') for s in v] for k, v in commands.items()},
              'method': 'Three serial samples, rotated tool order, warm file cache, stdout /dev/null; wall includes process startup and time wrapper; macOS RSS bytes or Linux KiB converted to bytes. All tools consume the same native-flatten gron file. Native and Node outputs match source plus newline byte-for-byte; fastgron sorts keys and changes whitespace, so its parsed output is checked for equality and canonical SHA256 on this integer-only fixture. Raw output hashes are retained.',
              'fixtures': [], 'results': []}
    record = b'{"id":123,"service":"gateway","ok":true,"tags":["alpha","beta"],"detail":{"latency":12,"message":"request completed"}}'
    report['fixture_recipe'] = {'record_utf8': record.decode(), 'count': '(MiB*1024*1024-2)//(len(record)+1)', 'construction': 'b"[" + b",".join([record]*count) + b"]"', 'generator': 'native flatten from artifact recorded above', 'size_labels': 'JSON source size; gron bytes recorded separately'}
    with tempfile.TemporaryDirectory(prefix='unflatten-bench-') as tmp:
        tmp = pathlib.Path(tmp)
        for mib in [1, 10]:
            count = (mib * 1024 * 1024 - 2) // (len(record)+1)
            source = b'[' + b','.join([record]*count) + b']'
            gron = subprocess.check_output([NATIVE, 'flatten'], input=source)
            path = tmp / 'input.gron'
            path.write_bytes(gron)
            fixture = {'mib': mib, 'json_bytes': len(source), 'gron_bytes': len(gron), 'records': count,
                       'json_sha256': digest(source), 'gron_sha256': digest(gron), 'expected_output_sha256': digest(source+b'\n'), 'output_sha256': {}, 'canonical_sha256': {}}
            for name, command in commands.items():
                output = subprocess.check_output([*command, str(path)])
                fixture['output_sha256'][name] = digest(output)
                if name != 'fastgron':
                    assert output == source+b'\n', (name, output[:100], len(output))
                assert json.loads(output) == json.loads(source), name
                fixture['canonical_sha256'][name] = digest(json.dumps(json.loads(output), sort_keys=True, separators=(',', ':')).encode())
            report['fixtures'].append(fixture)
            names = list(commands)
            samples = {name: [] for name in names}
            for run in range(3):
                for name in names[run:] + names[:run]:
                    path.read_bytes()
                    metrics = tmp / 'metrics.txt'
                    start = time.perf_counter()
                    subprocess.run(['/usr/bin/time', '-l' if platform.system() == 'Darwin' else '-v', '-o', str(metrics), *commands[name], str(path)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
                    seconds = time.perf_counter()-start
                    text = metrics.read_text()
                    rss = int(re.search(r'(\d+)\s+maximum resident set size', text)[1]) if platform.system() == 'Darwin' else int(re.search(r'Maximum resident set size \(kbytes\):\s*(\d+)', text)[1])*1024
                    samples[name].append({'seconds': seconds, 'rss_bytes': rss})
            for name, values in samples.items():
                report['results'].append({'mib': mib, 'tool': name, 'median_seconds': statistics.median(v['seconds'] for v in values), 'median_rss_bytes': statistics.median(v['rss_bytes'] for v in values), 'samples': values})
            print(f'{mib} MiB validated and measured', flush=True)
    (ROOT / 'native/measurements-unflatten.json').write_text(json.dumps(report, indent=2)+'\n')

if __name__ == '__main__':
    main()
