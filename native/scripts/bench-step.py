#!/usr/bin/env python3
"""Focused serial comparison against an immutable parent, with build provenance."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import platform
import re
import shutil
import statistics
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
RECORD = b'{"id":123,"service":"gateway","ok":true,"tags":["alpha","beta"],"detail":{"latency":12,"message":"request completed"}}'


def command(args):
    return subprocess.check_output(args, cwd=ROOT, text=True, stderr=subprocess.STDOUT).strip()


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while data := f.read(1024 * 1024):
            h.update(data)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='8cc14eca3216a2283f45c2e0623e4faf80339591')
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    assert 1 <= args.runs <= 10
    report = {
        'base_commit': command(['git', 'rev-parse', args.base]),
        'checkout_commit': command(['git', 'rev-parse', 'HEAD']),
        'dirty_state': command(['git', 'status', '--porcelain']),
        'started_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'platform': platform.platform(), 'machine': platform.machine(),
        'rustc': command(['rustc', '-Vv']), 'load_average_start': os.getloadavg(),
        'method': 'Shared host; concurrent integrated benchmark reported by parent. Serial rotated tool order; warm file cache; stdout /dev/null; wall includes process startup and time wrapper. Five samples by default. No isolated-host claim. Full output SHA256 checked before timing each fixture. In-process diagnostics are variants, not additive phase timings.',
        'harness_sha256': {p.name: digest(p) for p in [pathlib.Path(__file__), pathlib.Path(__file__).with_name('profile.py'), pathlib.Path(__file__).with_name('profile.rs')]},
        'artifacts': {}, 'build_commands': [], 'diagnostics': {}, 'results': [],
    }
    with tempfile.TemporaryDirectory(prefix='native-step-') as tmp:
        tmp = pathlib.Path(tmp)
        baseline = tmp / 'baseline'
        (baseline / 'src').mkdir(parents=True)
        for name in ['Cargo.toml', 'Cargo.lock', 'src/main.rs']:
            data = subprocess.check_output(['git', 'show', f'{args.base}:native/{name}'], cwd=ROOT)
            (baseline / name).write_bytes(data)
        tools = {}
        sources = {'before': baseline / 'src/main.rs', 'after': ROOT / 'native/src/main.rs'}
        for name, source in sources.items():
            manifest = source.parents[1] / 'Cargo.toml'
            target = tmp / f'target-{name}'
            build = ['cargo', 'build', '--release', '--locked', '--manifest-path', str(manifest), '--target-dir', str(target)]
            subprocess.run(build, check=True, cwd=ROOT)
            report['build_commands'].append(build)
            binary = target / 'release/gronify-native'
            report['artifacts'][name] = {'sha256': digest(binary), 'bytes': binary.stat().st_size, 'source_sha256': digest(source)}
            tools[name] = [str(binary), 'flatten']
        fastgron = shutil.which('fastgron')
        if fastgron:
            tools['fastgron'] = [fastgron, '--no-color']
            report['artifacts']['fastgron'] = {'sha256': digest(pathlib.Path(fastgron)), 'version': command([fastgron, '--version'])}
        fixtures = {}
        for mib in [4, 32]:
            path = tmp / f'records-{mib}MiB.json'
            count = (mib * 1024 * 1024 - 2) // (len(RECORD) + 1)
            path.write_bytes(b'[' + b','.join([RECORD] * count) + b']')
            fixtures[path.stem] = path
        for label, data in [('long-string-8MiB', b'{"s":"' + b'a' * (8 * 1024 * 1024) + b'"}'), ('tiny', b'[' + RECORD + b']')]:
            path = tmp / f'{label}.json'
            path.write_bytes(data)
            fixtures[label] = path
        diagnostic_fixtures = {label: fixtures[label] for label in ['records-4MiB', 'long-string-8MiB']}
        for label, data in [('unicode', b'["' + ('漢😀é' * 100000).encode() + b'"]'),
                            ('escaped', b'["' + br'hello\nworld\u0061' * 60000 + b'"]')]:
            path = tmp / f'{label}.json'
            path.write_bytes(data)
            diagnostic_fixtures[label] = path
        # Diagnostic work is serial and finishes before CLI timing.
        for label, fixture in diagnostic_fixtures.items():
            report['diagnostics'][label] = {}
            for name, source in sources.items():
                output = command(['python3', str(ROOT / 'native/scripts/profile.py'), str(source), str(fixture), '--rounds', '15'])
                lines = output.splitlines()
                report['diagnostics'][label][name] = {'provenance': json.loads(lines[0]), 'timings': lines[1:]}
        for label, path in fixtures.items():
            row = {'workload': label, 'input_bytes': path.stat().st_size, 'input_sha256': digest(path), 'output_sha256': {}, 'commands': {}, 'tools': {}}
            for name, tool in tools.items():
                row['commands'][name] = [*tool, str(path)]
                out = tmp / 'output'
                with out.open('wb') as f:
                    subprocess.run([*tool, str(path)], stdout=f, check=True, timeout=60)
                row['output_sha256'][name] = digest(out)
                out.unlink()
            assert len(set(row['output_sha256'].values())) == 1, row['output_sha256']
            samples = {name: [] for name in tools}
            names = list(tools)
            for run in range(args.runs):
                for name in names[run % len(names):] + names[:run % len(names)]:
                    with path.open('rb') as f:
                        while f.read(1024 * 1024):
                            pass
                    metrics = tmp / 'time.txt'
                    timing = ['/usr/bin/time', '-l' if platform.system() == 'Darwin' else '-v', '-o', str(metrics)]
                    start = time.perf_counter()
                    subprocess.run([*timing, *tools[name], str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, timeout=60)
                    seconds = time.perf_counter() - start
                    text = metrics.read_text()
                    if platform.system() == 'Darwin':
                        rss = int(re.search(r'(\d+)\s+maximum resident set size', text)[1])
                    else:
                        rss = int(re.search(r'Maximum resident set size \(kbytes\):\s*(\d+)', text)[1]) * 1024
                    samples[name].append({'seconds': seconds, 'rss_bytes': rss})
            row['tools'] = {name: {'median_seconds': statistics.median(s['seconds'] for s in values), 'median_rss_bytes': statistics.median(s['rss_bytes'] for s in values), 'samples': values} for name, values in samples.items()}
            report['results'].append(row)
            print(label, {name: round(value['median_seconds'] * 1000, 3) for name, value in row['tools'].items()}, flush=True)
    report['load_average_end'] = os.getloadavg()
    report['finished_at_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    args.output.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
