#!/usr/bin/env python3
"""Serial, warmed before/after record measurements with retained fixed artifacts.

Builds immutable base and a snapshot of the working native source. No Node build
or timing. Full output hashes gate each case; fastgron only joins ASCII records.
"""
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
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
RECORD = b'{"id":123,"service":"gateway","ok":true,"tags":["alpha","beta"],"detail":{"latency":12,"message":"request completed"}}'
NUMERIC = b'{"a":123456,"b":-12.345e+67,"c":false,"d":null,"nested":{"v":123,"service":"gateway"}}'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def command(args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def output_hash(args):
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    digest = hashlib.sha256()
    count = 0
    while data := process.stdout.read(1024 * 1024):
        digest.update(data)
        count += len(data)
    assert process.wait() == 0, args
    return {'sha256': digest.hexdigest(), 'bytes': count}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='56054a91c83e306b7d9384a95a12bdb1642bb5f0')
    parser.add_argument('--runs', type=int, default=7)
    parser.add_argument('--output-dir', required=True, type=pathlib.Path)
    args = parser.parse_args()
    assert 3 <= args.runs <= 30
    dest = args.output_dir.resolve()
    dest.mkdir(parents=True, exist_ok=False)
    report = {'base': command(['git', 'rev-parse', args.base]),
              'checkout': command(['git', 'rev-parse', 'HEAD']),
              'dirty': command(['git', 'status', '--porcelain']),
              'started_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'platform': platform.platform(), 'rustc': command(['rustc', '-Vv']),
              'load_start': os.getloadavg(), 'harness_sha256': sha(pathlib.Path(__file__)),
              'method': 'Serial rotating order, warm file cache, stdout discarded; process startup and time wrapper included. Shared host, other benchmark reported active; no isolated-host confidence claim. Hashes gate equality. RSS is per-process peak, not allocations.',
              'artifacts': {}, 'results': []}
    binaries = {}
    for label in ['before', 'after']:
        stage = dest / label
        stage.mkdir()
        if label == 'before':
            names = command(['git', 'ls-tree', '-r', '--name-only', args.base, 'native']).splitlines()
            for name in names:
                relative = pathlib.Path(name).relative_to('native')
                if name.endswith('.rs') and relative.parts[0] == 'src' or relative.name in ['Cargo.toml', 'Cargo.lock']:
                    target = stage / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(subprocess.check_output(['git', 'show', f'{args.base}:{name}'], cwd=ROOT))
        else:
            shutil.copytree(ROOT / 'native/src', stage / 'src')
            for name in ['Cargo.toml', 'Cargo.lock']:
                shutil.copy2(ROOT / 'native' / name, stage / name)
        build = ['cargo', 'build', '--release', '--locked', '--manifest-path', str(stage / 'Cargo.toml')]
        subprocess.run(build, check=True)
        binary = stage / 'target/release/gronify-native'
        binaries[label] = str(binary)
        report['artifacts'][label] = {'binary_sha256': sha(binary), 'binary_bytes': binary.stat().st_size,
                                     'source_sha256': {str(p.relative_to(stage)): sha(p) for p in sorted((stage/'src').glob('*.rs'))},
                                     'build': build}
    fastgron = shutil.which('fastgron')
    if fastgron:
        report['artifacts']['fastgron'] = {'binary_sha256': sha(pathlib.Path(fastgron)), 'version': command([fastgron, '--version'])}
    fixtures = {}
    for label, record in [('records', RECORD), ('numeric', NUMERIC)]:
        fixtures[label] = b'[' + b','.join([record] * ((32 * 1024 * 1024 - 2) // (len(record) + 1))) + b']'
    fixtures.update({'long-ascii': b'["' + b'a' * (8 * 1024 * 1024) + b'"]',
                     'unicode': b'["' + ('漢😀é' * 100000).encode() + b'"]',
                     'escaped': b'["' + br'hello\nworld\u0061' * 60000 + b'"]',
                     'tiny': b'[' + RECORD + b']'})
    for shape, data in fixtures.items():
        fixture = dest / (shape + '.json')
        fixture.write_bytes(data)
        modes = ['flatten', 'sensitive', 'insensitive']
        if shape == 'records':
            modes += ['count', 'cap-flatten', 'cap-search']
        for mode in modes:
            if mode in ['flatten', 'cap-flatten']:
                opts = ['flatten', *(['--limit', '10'] if mode == 'cap-flatten' else []), str(fixture)]
            else:
                opts = ['search', *([] if mode == 'insensitive' else ['-c']),
                        *(['--count'] if mode == 'count' else []),
                        *(['--max-count', '10'] if mode == 'cap-search' else []), str(fixture), 'gateway']
            commands = {k: [v, *opts] for k, v in binaries.items()}
            if fastgron and shape in ['records', 'numeric'] and mode in ['flatten', 'sensitive', 'insensitive']:
                commands['fastgron'] = [fastgron, '--no-color', *([] if mode == 'flatten' else [*(['-i'] if mode == 'insensitive' else []), '-F', 'gateway']), str(fixture)]
            hashes = {k: output_hash(v) for k, v in commands.items()}
            assert len({v['sha256'] for v in hashes.values()}) == 1, (shape, mode, hashes)
            samples = {k: [] for k in commands}
            names = list(commands)
            for run in range(args.runs):
                rotate = run % len(names)
                for name in names[rotate:] + names[:rotate]:
                    with fixture.open('rb') as source:
                        while source.read(1024 * 1024):
                            pass
                    metrics = dest / 'time.txt'
                    start = time.perf_counter()
                    subprocess.run(['/usr/bin/time', '-l' if platform.system() == 'Darwin' else '-v', '-o', str(metrics), *commands[name]], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, timeout=60)
                    elapsed = time.perf_counter() - start
                    text = metrics.read_text()
                    rss = int(re.search(r'(\d+)\s+maximum resident set size', text)[1]) if platform.system() == 'Darwin' else int(re.search(r'Maximum resident set size \(kbytes\):\s*(\d+)', text)[1]) * 1024
                    samples[name].append({'ms': elapsed * 1000, 'rss_bytes': rss})
            medians = {k: statistics.median(x['ms'] for x in v) for k, v in samples.items()}
            report['results'].append({'shape': shape, 'mode': mode, 'input_bytes': len(data), 'input_sha256': sha(fixture), 'commands': commands, 'outputs': hashes, 'samples': samples, 'medians_ms': medians})
            print(shape, mode, medians, flush=True)
    report['load_end'] = os.getloadavg()
    report['finished_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (dest / 'receipt.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
