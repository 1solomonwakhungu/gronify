#!/usr/bin/env python3
"""Compile a supplied main.rs with an in-process diagnostic driver, then run it.

Parse uses io::sink (emission can be optimized away). Buffered emission copies
through the production-sized BufWriter into an opaque counting sink. Strings
scans the fixture for quoted tokens, including keys; normalize additionally
normalizes them a second time. These are diagnostic variants, not additive
phase timings or CLI rankings. Inputs are loaded once outside timed sections.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import tempfile

p = argparse.ArgumentParser()
p.add_argument('source', type=pathlib.Path)
p.add_argument('fixture', type=pathlib.Path)
p.add_argument('--rounds', type=int, default=10)
a = p.parse_args()
assert a.rounds > 0
source = a.source.read_text().replace('fn main() {', 'fn original_main() {')
driver = pathlib.Path(__file__).with_suffix('.rs').read_text()
with tempfile.TemporaryDirectory(prefix='native-profile-') as d:
    path = pathlib.Path(d) / 'profile.rs'
    binary = pathlib.Path(d) / 'profile'
    path.write_text(source + '\n' + driver + '\nfn main() { profile_main(); }\n')
    command = ['rustc', '--edition=2024', '-O', '-C', 'lto=true', '-C', 'codegen-units=1', '-C', 'panic=abort', '-A', 'dead_code', str(path), '-o', str(binary)]
    subprocess.run(command, check=True)
    print(json.dumps({'source_sha256': hashlib.sha256(a.source.read_bytes()).hexdigest(), 'driver_sha256': hashlib.sha256(driver.encode()).hexdigest(), 'artifact_sha256': hashlib.sha256(binary.read_bytes()).hexdigest(), 'fixture_sha256': hashlib.sha256(a.fixture.read_bytes()).hexdigest(), 'rounds': a.rounds, 'build': command, 'rustc': subprocess.check_output(['rustc', '-Vv'], text=True)}), flush=True)
    subprocess.run([str(binary), str(a.fixture), str(a.rounds)], check=True)
