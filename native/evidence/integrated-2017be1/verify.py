"""Audit archived receipts without executing benchmark commands."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import statistics
import subprocess

HERE = Path(__file__).resolve().parent
PIN = '2017be1b4c4f20e070473c1be22b0f27c983f2a8'
LIMIT = 8 * 1024**3


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def load(name):
    return json.loads((HERE / name).read_text())


def walk(value):
    if isinstance(value, dict):
        if 'metrics' in value:
            yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def check(condition, message):
    if not condition:
        raise ValueError(message)


def audit(source=None):
    manifest = load('manifest.json')
    by_name = {Path(p).name: v for p, v in manifest['files'].items()}
    raw = load('raw-receipts.json')
    for name, value in raw.items():
        data = value.encode()
        check(len(data) == by_name[name]['bytes'], name + ' bytes')
        check(hashlib.sha256(data).hexdigest() == by_name[name]['sha256'], name + ' hash')
    for path in list(HERE.glob('*.json')) + list((HERE / 'driver').iterdir()):
        if path.name in by_name:
            check(digest(path) == by_name[path.name]['sha256'], path.name + ' original hash')
    for name, excerpt in load('host-excerpts.json').items():
        check(excerpt['original_sha256'] == by_name[name]['sha256'], 'host snapshot hash')
    docs = [load(n) for n in ['evidence.json', 'supplement.json', 'file-validation.json', 'semantic-validation.json']]
    a, b, c, semantic = docs
    check(all(d['commit'] == PIN for d in docs), 'pinned commits')
    receipts = [s for d in docs for s in walk(d)]
    check(len(receipts) == 257, 'receipt count')
    check(len({s['metrics'] for s in receipts}) == 257, 'unique receipts')
    for s in receipts:
        metric = raw[Path(s['metrics']).name]
        match = re.search(r'(\d+)\s+maximum resident set size', metric)
        check(s['rss_bytes'] == (int(match[1]) if match else None), s['metrics'])
        check(Path(s['stderr']).name in raw, 'stderr present')
        check((s['status'] == 'ok') == (s['exit_code'] == 0), 'exit status')
        if s['output_bytes'] <= 500:
            check(len(s['prefix'].encode()) == s['output_bytes'] and hashlib.sha256(s['prefix'].encode()).hexdigest() == s['output_sha256'], 'complete short output hash')
    failures = [s for s in receipts if s['status'] != 'ok']
    missed = [s for s in receipts if s['status'] == 'ok' and s['rss_bytes'] > LIMIT]
    recorded_failures = [{k: v for k, v in f.items() if k not in ['size', 'operation', 'tool']} for f in load('validation.json')['failures']]
    check(recorded_failures == failures, 'original failure accounting')
    check(len(failures) == 2 and all(s['status'] == 'rss-guard' for s in failures), 'guard kills')
    check(len(missed) == 1 and missed[0]['rss_bytes'] == 8926461952, 'missed peak')
    check(missed[0]['peak_tree_rss_bytes'] < LIMIT, 'sampled guard missed peak')
    rows = a['results'] + b['results'] + c['results']
    markdown = (HERE.parent.parent / 'performance-integrated.md').read_text()
    summaries = []
    equality = []
    for row in rows:
        cells = []
        counts = {}
        for tool in ['native', 'node', 'fastgron', 'jq-events' if 'jq-events' in row['samples'] else 'jq']:
            if tool not in row['samples']:
                cells.append('—')
                continue
            samples = row['samples'][tool]
            check(len(samples) == 3 and [s['sample'] for s in samples] == [0, 1, 2], 'three samples')
            good = [s for s in samples if s['status'] == 'ok']
            wall = statistics.median(s['wall_s'] for s in good)
            rss = statistics.median(s['rss_bytes'] for s in good)
            cells.append(f'{wall:.4f} s / {rss/1048576:.2f} MiB ({len(good)}/3)')
            counts[tool] = {'completed': len(good), 'under_budget_completed': sum(max(s['rss_bytes'], s['peak_tree_rss_bytes']) <= LIMIT for s in good)}
        line = '| ' + str(row['size_mib']) + ' | ' + row['operation'] + ' | ' + ' | '.join(cells) + ' |'
        check(line in markdown, 'table summary: ' + line)
        summaries.append({'size': row['size_mib'], 'operation': row['operation'], 'samples': counts})
    for row in a['results']:
        tools = [k for k in row['samples'] if k in ['native', 'node', 'fastgron']]
        samples = [s for k in tools for s in row['samples'][k]]
        check(all(s['status'] == 'ok' for s in samples), 'complete primary equality set')
        if row['operation'] != 'unflatten':
            check(len({(s['output_sha256'], s['output_bytes'], s['output_lines']) for s in samples}) == 1, 'primary equality')
            equality.append({'size': row['size_mib'], 'operation': row['operation'], 'tools': tools, 'samples_per_tool': 3, 'equal': True})
        if row['operation'] == 'search':
            check(all(s['output_lines'] == row['expected']['matches'] for s in samples), 'search matches')
        if row['operation'] == 'unflatten':
            fixture = next(f for f in a['fixtures'] if f['mib'] == row['size_mib'])
            for k in ['native', 'node']:
                check(all(s['output_sha256'] == fixture['roundtrip_lf_sha256'] and s['output_bytes'] == fixture['bytes'] + 1 for s in row['samples'][k]), 'roundtrip LF')
    mismatch = 0
    for row in b['results'] + c['results']:
        if 'reflatten' not in row['operation']:
            continue
        for tool, samples in row['samples'].items():
            for s in samples:
                expected = s['status'] == 'ok' and s['output_sha256'] == row['expected']['flatten_sha256']
                check(s['matches_expected'] == expected, 'reflatten flag')
                if s['status'] != 'ok':
                    continue
                if tool == 'fastgron' and row['size_mib'] != 'raw':
                    check(not expected, 'expected order mismatch')
                    mismatch += 1
                else:
                    check(expected, 'exact reflatten equality')
    check(mismatch == 13, 'completed fastgron order mismatches')
    for row in semantic['results']:
        x, y = row['expected'], row['actual']
        check(x['status'] == y['status'] == 'ok', 'semantic statuses')
        check(row['matches'] and x['output_sha256'] == y['output_sha256'], 'semantic equality')
        for s in [x, y]:
            check(len(s['prefix'].encode()) == s['output_bytes'] and hashlib.sha256(s['prefix'].encode()).hexdigest() == s['output_sha256'], 'complete semantic output hash')
        fixture = next(f for f in a['fixtures'] if f['mib'] == row['size_mib'])
        check(row['prepare']['output_sha256'] == fixture['gron']['receipt']['output_sha256'], 'semantic preparation')
    check('26 passed; 0 failed' in raw['integration-build.log'], 'release test receipt')
    check(json.loads(raw['compat.log'])['byte_comparisons'] == 192, 'flatten receipt')
    check(json.loads(raw['search-compat.log'])['search_byte_and_status_comparisons'] == 432, 'search receipt')
    check('159 exact-output' in raw['unflatten-compat.log'], 'ordered receipt')
    result = {'pin': PIN, 'raw_receipt_pairs': len(receipts), 'summary_rows': len(rows), 'process_failures': len(failures), 'missed_guard_peaks': len(missed), 'budget_violations': len(failures) + len(missed), 'completed_fastgron_order_mismatches': mismatch, 'semantic_comparisons': len(semantic['results']), 'primary_equality': equality, 'summaries': summaries}
    if source:
        # Absolute original paths are intentional: these checks concern original artifacts.
        for name, item in manifest['files'].items():
            p = Path(name)
            if p.parent.name == source.name:
                p = source / p.name
            check(p.stat().st_size == item['bytes'] and digest(p) == item['sha256'], 'source manifest: ' + name)
        for name, item in a['artifacts'].items():
            check(digest(Path(name)) == item['sha256'] and Path(name).stat().st_size == item['bytes'], 'artifact: ' + name)
        for f in a['fixtures']:
            h = hashlib.sha256()
            with (source / Path(f['path']).name).open('rb') as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    h.update(block)
            check(h.hexdigest() == f['sha256'], 'fixture hash')
            h.update(b'\n')
            check(h.hexdigest() == f['roundtrip_lf_sha256'], 'fixture LF hash')
        for name, excerpt in load('host-excerpts.json').items():
            lines = (source / name).read_text().splitlines()
            check(all(lines[i - 1] == text for i, text in excerpt['lines']), 'host excerpt lines')
            check(not any('fastgron' in line for line in lines), 'unsupported separate fastgron claim')
        integrated = json.loads((source / 'integrated.json').read_text())
        for key, doc in zip(['primary', 'stream_roundtrips_and_caps', 'file_reflatten_validation', 'semantic_validation'], docs):
            check(integrated[key] == doc, 'integrated section ' + key)
        validation = load('validation.json')
        check(integrated['checks'] == validation['checks'] and integrated['failures'] == validation['failures'], 'integrated validation')
        for name, log in integrated['integration_logs'].items():
            check(log == raw[name], 'integrated log')
        repository = HERE.parents[2]
        git_count = 0
        for name, item in {**manifest['files'], **a['artifacts']}.items():
            if '/t3-1fbc07a6/' not in name:
                continue
            relative = name.split('/t3-1fbc07a6/')[1]
            if '/dist/' in relative or '/target/' in relative:
                continue
            contents = subprocess.check_output(['git', 'show', PIN + ':' + relative], cwd=repository)
            check(hashlib.sha256(contents).hexdigest() == item['sha256'], 'pinned source ' + relative)
            git_count += 1
        original = subprocess.check_output(['git', 'show', PIN + ':src/packages/cli/scripts/bench-compare.mjs'], cwd=repository).decode()
        generator = (HERE / 'driver/generate.mjs').read_text()
        shared = generator[generator.index('function mulberry32'):generator.index('\n\n\nfor (const n')]
        check(shared in original, 'verbatim generator functions')
        result['source_audit'] = {'manifest_entries': len(manifest['files']), 'artifacts': len(a['artifacts']), 'pinned_source_files': git_count, 'fixture_hashes_and_LF': 4, 'integrated_sections_match': True, 'generator_functions_verbatim': True}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = audit(args.source)
    if args.output:
        args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in ['primary_equality', 'summaries']}, indent=2))
