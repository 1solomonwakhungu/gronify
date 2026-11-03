#!/usr/bin/env python3
"""Small, serial, warm-cache CLI measurements; no shell pipelines or full sweep."""
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
NATIVE = str(ROOT / 'native/target/release/gronify-native')
NODE = ['node', str(ROOT / 'src/packages/cli/dist/index.js'), '--no-color', 'flatten']


def command_text(command):
    return [s.replace(str(ROOT), '<repo>') for s in command]


def output_hash(command):
    with tempfile.TemporaryFile() as out:
        subprocess.run(command, stdout=out, stderr=subprocess.PIPE, check=True, timeout=60)
        out.seek(0)
        digest = hashlib.sha256()
        while data := out.read(1024 * 1024):
            digest.update(data)
        return digest.hexdigest()


def version(command):
    return subprocess.check_output(command, text=True, stderr=subprocess.STDOUT).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--output', default=str(ROOT / 'native/results-local.json'))
    args = parser.parse_args()
    assert 1 <= args.runs <= 10
    report = {'platform': platform.platform(), 'machine': platform.machine(),
              'checkout_commit': version(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']),
              'baseline_cli_tree': version(['git', '-C', str(ROOT), 'rev-parse', 'HEAD:src/packages/cli/src']),
              'started_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'native_source_sha256': hashlib.sha256((ROOT / 'native/src/main.rs').read_bytes()).hexdigest(),
              'versions': {'rustc': version(['rustc', '--version']), 'node': version(['node', '--version'])},
              'method': 'Serial, rotated order, warm file cache, stdout /dev/null. Wall includes process startup and /usr/bin/time wrapper. Median and every sample retained. RSS from time, bytes on macOS, KiB converted to bytes on Linux. No result means no measurement.', 'results': []}
    tools = {'native': [NATIVE, 'flatten'], 'node': NODE}
    if shutil.which('fastgron'):
        tools['fastgron'] = ['fastgron', '--no-color']
        report['versions']['fastgron'] = version(['fastgron', '--version'])
    if shutil.which('jq'):
        report['versions']['jq'] = version(['jq', '--version'])
    record = b'{"id":123,"service":"gateway","ok":true,"tags":["alpha","beta"],"detail":{"latency":12,"message":"request completed"}}'
    with tempfile.TemporaryDirectory(prefix='gronify-native-bench-') as tmp:
        tmp = pathlib.Path(tmp)
        workloads = []
        for mib in [1, 10, 32]:
            path = tmp / f'records-{mib}.json'
            count = (mib * 1024 * 1024 - 2) // (len(record) + 1)
            with path.open('wb') as out:
                out.write(b'[')
                for i in range(count):
                    if i: out.write(b',')
                    out.write(record)
                out.write(b']')
            workloads.append((f'records-{mib}MiB', path, False))
        tiny = tmp / 'tiny.json'
        tiny.write_bytes(b'[' + record + b']')
        workloads.append(('tiny-startup', tiny, False))
        workloads.append(('cap-10-on-32MiB', workloads[2][1], True))
        long = tmp / 'long.json'
        long.write_bytes(b'{"s":"' + b'a' * (8 * 1024 * 1024) + b'"}')
        workloads.append(('long-string-8MiB', long, False))
        # Verify comparable gron output on the record schema before timing.
        expected = output_hash([*NODE, str(tiny)])
        for name, command in tools.items():
            assert output_hash([*command, str(tiny)]) == expected, name
        report['record_schema_output_sha256'] = expected
        for label, path, cap in workloads:
            commands = {name: [*cmd, *(['--limit', '10'] if cap else []), str(path)]
                        for name, cmd in tools.items() if not cap or name in ['native', 'node']}
            # jq emits parser events, not gron assignments: parse-only context, never a flatten ranking.
            if not cap and shutil.which('jq'):
                commands['jq-parse-only'] = ['jq', '--stream', '-c', '.', str(path)]
            samples = {name: [] for name in commands}
            names = list(commands)
            for run in range(args.runs):
                for name in names[run % len(names):] + names[:run % len(names)]:
                    with path.open('rb') as src:
                        while src.read(1024 * 1024): pass
                    metrics = tmp / 'time.txt'
                    timing = ['/usr/bin/time', '-l' if platform.system() == 'Darwin' else '-v', '-o', str(metrics)]
                    start = time.perf_counter()
                    result = subprocess.run([*timing, *commands[name]], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=60)
                    seconds = time.perf_counter() - start
                    assert result.returncode == 0, (name, label, result.stderr)
                    text = metrics.read_text()
                    if platform.system() == 'Darwin':
                        rss = int(re.search(r'(\d+)\s+maximum resident set size', text)[1])
                    else:
                        rss = int(re.search(r'Maximum resident set size \(kbytes\):\s*(\d+)', text)[1]) * 1024
                    samples[name].append({'seconds': seconds, 'rss_bytes': rss})
            for name in commands:
                row = {'workload': label, 'tool': name, 'input_bytes': path.stat().st_size,
                       'command': command_text(commands[name][:-1]) + ['<fixture>'],
                       'median_seconds': statistics.median(s['seconds'] for s in samples[name]),
                       'median_rss_bytes': statistics.median(s['rss_bytes'] for s in samples[name]), 'samples': samples[name]}
                report['results'].append(row)
            print(label, flush=True)
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
