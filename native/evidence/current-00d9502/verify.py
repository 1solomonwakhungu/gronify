#!/usr/bin/env python3
"""Audit retained receipts, source/build hashes and median arithmetic; no timings."""
import hashlib
import json
import pathlib
import statistics
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    receipt = json.loads((ROOT/'landing-page/src/app/benchmark-results.json').read_text())
    provenance = receipt['provenance']
    assert receipt['options']['statistic'] == 'median'
    assert provenance['runtimeSourceUnchanged'] is True
    assert provenance['harnessSha256'] in {sha(HERE/'bench-compare.executed.mjs'), sha(ROOT/'src/packages/cli/scripts/bench-compare.mjs')}
    tree = subprocess.check_output(['git','rev-parse',provenance['sourceCommit']+':src/packages/cli/src'],cwd=ROOT,text=True).strip()
    assert tree == provenance['sourceTree']
    for name, digest in provenance['sourceSha256'].items():
        assert sha(ROOT/name) == digest, ('source',name)
    for name, digest in provenance['artifactSha256'].items():
        assert sha(ROOT/name) == digest, ('build artifact',name)
    for name,digest in provenance['binarySha256'].items():
        binary = shutil.which(name) if name=='node' else receipt['binaries'][name]
        assert sha(pathlib.Path(binary)) == digest, ('external binary',name)
    limit = receipt['options']['maxRssGB']*1024**3
    counts = {}
    attempts = 0
    for workload in receipt['workloads']:
        if workload['inputBytes']:
            assert len(workload['inputSha256']) == 64
        for result in workload['results']:
            status = result['status']
            counts[status] = counts.get(status,0)+1
            trials = result.get('trials',[])
            attempts += len(trials)
            if status != 'ok':
                assert result['seconds'] is None and result['peakRssBytes'] is None
                assert result.get('reasonCode')
                assert not result.get('isFastest') and not result.get('isTie')
                continue
            successful = [t for t in trials if t['kind']=='ok']
            assert successful
            assert all(0 < t['rssBytes'] <= limit for t in successful)
            assert abs(statistics.median(t['seconds'] for t in successful)-result['seconds']) <= 0.000051
            assert statistics.median(t['rssBytes'] for t in successful) == result['peakRssBytes']
            assert len(result['samples']) == len(successful)
            if workload['operation']=='search':
                assert isinstance(result['matchCount'],int)
    assert not any(r['pass'] is False for c in receipt['correctness'] for r in c['results'] if r['tool']=='gronify')
    native_path = HERE/'native-results.json'
    native_count = 0
    if native_path.exists():
        mirror = ROOT/'landing-page/src/app/native-benchmark-results.json'
        assert mirror.read_bytes() == native_path.read_bytes(), 'Landing native receipt differs from evidence'
        native = json.loads(native_path.read_text())
        assert native['sourceCommit'] == provenance['sourceCommit']
        assert native['runtimeSourceUnchanged']
        assert native['harnessSha256'] in {sha(HERE/'bench-current.executed.py'), sha(ROOT/'native/scripts/bench-current.py')}
        for name,digest in native['sourceSha256'].items():
            assert sha(ROOT/name) == digest, ('native source',name)
        for name,digest in native['artifactSha256'].items():
            assert sha(pathlib.Path(name.replace('<repo>',str(ROOT)))) == digest, ('native artifact',name)
        supplement = native.get('versionSupplement',{}).get('fastgron')
        if supplement: assert supplement['binarySha256'] == native['artifactSha256'][supplement['command'][0]]
        for row in native['results']:
            native_count += 1
            outputs = row['outputs']
            successful = {tool['tool'] for tool in row['tools'] if tool.get('status','ok')=='ok'}
            if 'native' in successful: assert outputs['native'] == outputs['node']
            if row['mode'] != 'unflatten':
                assert len({(outputs[n]['sha256'],outputs[n]['bytes']) for n in successful}) <= 1
            for tool in row['tools']:
                samples = tool['samples']
                if tool.get('status','ok') != 'ok':
                    assert tool['seconds'] is None and tool['peakRssBytes'] is None
                    continue
                assert len(samples)==3
                assert statistics.median(s['seconds'] for s in samples) == tool['seconds']
                assert statistics.median(s['rssBytes'] for s in samples) == tool['peakRssBytes']
    print(json.dumps({'sourceCommit':provenance['sourceCommit'],'defaultWorkloads':len(receipt['workloads']),'statuses':counts,'retainedAttempts':attempts,'nativeWorkloads':native_count,'scope':'Receipt arithmetic and current source/build hashes verified. Does not rerun benchmarks or rehash discarded output streams.'},indent=2))


if __name__ == '__main__':
    main()
