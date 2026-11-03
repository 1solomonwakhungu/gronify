#!/usr/bin/env python3
"""Serial ablation benchmark; supply frozen baseline/scanner/candidate executables."""
import argparse
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

ROOT = pathlib.Path(__file__).resolve().parents[2]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['baseline', 'scanner', 'candidate']:
        parser.add_argument('--' + name, type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    report = {'utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'platform': platform.platform(), 'machine': platform.machine(),
              'base_commit': '844f0c29191d1d1861cce7c9f83a23052cdef5a4',
              'source_sha256': {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in sorted((ROOT / 'native/src').glob('*.rs'))},
              'scanner_patch_sha256': sha((ROOT / 'native/scripts/unflatten-scanner-ablation.patch').read_bytes()),
              'method': 'Seven serial runs per fixture, alternating forward/reverse tool order, warm cache, time wrapper and startup included. Executables and built Node dist copied before measurement; hashes verified after all runs. Scanner ablation replaces only per-string Input with slice scanning plus existing normalize, retaining owned paths/values. Candidate adds borrowed keys and values. No PR117 integration.',
              'versions': {}, 'artifacts': {}, 'commands': {}, 'fixtures': [], 'samples': [], 'summary': []}
    with tempfile.TemporaryDirectory(prefix='ordered-unflatten-') as directory:
        tmp = pathlib.Path(directory)
        commands = {}
        for name in ['baseline', 'scanner', 'candidate']:
            target = tmp / name
            shutil.copy2(getattr(args, name), target)
            commands[name] = [str(target), 'unflatten']
        fast = shutil.which('fastgron')
        assert fast
        shutil.copy2(fast, tmp / 'fastgron')
        shutil.copytree(ROOT / 'src/packages/cli/dist', tmp / 'dist')
        (tmp / 'node_modules').symlink_to(ROOT / 'src/packages/cli/node_modules')
        # Preserve ESM interpretation of built JavaScript.
        (tmp / 'package.json').write_text('{"type":"module"}')
        commands['node'] = [shutil.which('node'), str(tmp / 'dist/index.js'), '--no-color', 'unflatten']
        commands['fastgron'] = [str(tmp / 'fastgron'), '-u', '--no-color', '--no-indent', '--no-newline']
        artifacts = [tmp / n for n in ['baseline', 'scanner', 'candidate', 'fastgron']] + sorted((tmp / 'dist').rglob('*.js'))
        before = {str(p.relative_to(tmp)): sha(p.read_bytes()) for p in artifacts}
        report['artifacts'] = before
        report['commands'] = {n: [v.replace(str(tmp), '<frozen>') for v in c] for n, c in commands.items()}
        for name, command in [('rustc', ['rustc', '--version']), ('node', ['node', '--version']), ('fastgron', [fast, '--version'])]:
            report['versions'][name] = subprocess.check_output(command, text=True).strip()
        record = b'{"id":123,"service":"gateway","ok":true,"tags":["alpha","beta"],"detail":{"latency":12,"message":"request completed"}}'
        report['record_utf8'] = record.decode()
        report['record_count_formula'] = '(MiB*1024*1024-2)//(len(record)+1)'
        fixtures = [('startup', b'{}')]
        for mib in [1, 10]:
            count = (mib * 1024 * 1024 - 2) // (len(record) + 1)
            fixtures.append((f'records-{mib}MiB', b'[' + b','.join([record] * count) + b']'))
        escaped = json.dumps({'a.b': {'é': 'line\nquote"slash\\😀', 'lone': '\ud800'}}, ensure_ascii=True, separators=(',', ':')).encode()
        fixtures.append(('escaped-1MiB', b'[' + b','.join([escaped] * ((1024*1024-2)//(len(escaped)+1))) + b']'))
        for label, source in fixtures:
            gron = subprocess.check_output([str(tmp / 'baseline'), 'flatten'], input=source)
            expected = subprocess.check_output(commands['baseline'], input=gron)
            if label != 'escaped-1MiB':
                assert expected == source + b'\n'
            path = tmp / 'input.gron'
            path.write_bytes(gron)
            fixture = {'name': label, 'source_bytes': len(source), 'gron_bytes': len(gron), 'source_sha256': sha(source), 'gron_sha256': sha(gron), 'outputs': {}}
            names = list(commands)
            if label.startswith('escaped'):
                names.remove('fastgron')  # No surrogate normalization contract claimed for fastgron.
            for name in names:
                output = subprocess.check_output([*commands[name], str(path)])
                if name != 'fastgron':
                    assert output == expected, (label, name)
                assert json.loads(output) == json.loads(source), (label, name)
                fixture['outputs'][name] = {'raw_sha256': sha(output), 'canonical_sha256': sha(json.dumps(json.loads(output), sort_keys=True, separators=(',', ':')).encode())}
            report['fixtures'].append(fixture)
            for run in range(7):
                for name in names if run % 2 == 0 else names[::-1]:
                    path.read_bytes()
                    metrics = tmp / 'metrics'
                    start = time.perf_counter()
                    subprocess.run(['/usr/bin/time', '-l' if platform.system() == 'Darwin' else '-v', '-o', str(metrics), *commands[name], str(path)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
                    elapsed = time.perf_counter() - start
                    text = metrics.read_text()
                    rss = int(re.search(r'(\d+)\s+maximum resident set size', text)[1]) if platform.system() == 'Darwin' else int(re.search(r'Maximum resident set size \(kbytes\):\s*(\d+)', text)[1]) * 1024
                    report['samples'].append({'fixture': label, 'tool': name, 'run': run, 'seconds': elapsed, 'rss_bytes': rss})
            for name in names:
                rows = [s for s in report['samples'] if s['fixture'] == label and s['tool'] == name]
                report['summary'].append({'fixture': label, 'tool': name, 'median_ms': statistics.median(s['seconds'] for s in rows)*1000, 'median_peak_rss_bytes': statistics.median(s['rss_bytes'] for s in rows)})
            print(label, 'validated and measured', flush=True)
        assert before == {str(p.relative_to(tmp)): sha(p.read_bytes()) for p in artifacts}
        report['artifact_hashes_unchanged'] = True
    args.output.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
