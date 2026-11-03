#!/usr/bin/env python3
"""Ordered subset differential tests against the built Node CLI."""
import json
import pathlib
import random
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
NATIVE = [str(ROOT / 'native/target/release/gronify-native'), 'unflatten']
NODE = ['node', str(ROOT / 'src/packages/cli/dist/index.js'), '--no-color', 'unflatten']

def run(command, source):
    return subprocess.run(command, input=source, capture_output=True, timeout=30)

def main():
    cases = [b'\x0bjson\x0b=\x0b1\x0b\n', b'json = {}\njson[\x0b"x"\x0b] = 1\n', b'json = []\njson[\x0b0\x0b] = 1', b'json = -0', b'json = 1.230e+999', b'json = 123456789012345678901234567890',
             b'json = {}\r\njson["a.b[0]=x"] = []\r\njson["a.b[0]=x"][3] = "\\ud800";',
             b'json = {}\njson.a = {}\njson.a.x = 1\njson.a = []\njson.a[1] = 2',
             b'json = {}\njson["\\u0061"] = {}\njson.a["\\ud83d\\ude00"] = "\\u0062"',
             b'json = {}\njson["__proto__"] = {}\njson["__proto__"].x = 1\njson.constructor = 2',
             b' \t\njson = { } ;\njson[ "0" ] = true\njson["a"] = false\njson.a = null',
             b'json = []\njson[ 2 ] = []\njson[2][0] = {}',
             b'json = {}\njson.s = "' + b'a' * 70000 + b'"']
    rng = random.Random(483211)
    keys = ['a', '0', '', 'é', '😀', 'a.b', 'x]"=z', '__proto__', '\n', '\\']
    def value(depth):
        if depth == 0: return rng.choice([None, True, False, 12, 'é😀', '\n"\\'])
        if rng.randrange(2): return [value(depth-1) for _ in range(rng.randrange(5))]
        return {k: value(depth-1) for k in rng.sample(keys, rng.randrange(6))}
    for _ in range(40):
        source = json.dumps(value(3), ensure_ascii=False).encode()
        flattened = run([str(ROOT / 'native/target/release/gronify-native'), 'flatten'], source)
        assert flattened.returncode == 0, flattened.stderr
        cases.append(flattened.stdout)
    for source in cases:
        expected = run(NODE, source)
        assert expected.returncode == 0, expected.stderr
        for chunk in [1, 7, 65536]:
            actual = run([*NATIVE, '--chunk-size', str(chunk)], source)
            assert (actual.returncode, actual.stdout) == (0, expected.stdout), (source[:500], actual, expected)
    # Node's fallback accepts these; native must explicitly reject rather than corrupt.
    for source in [b'json = 1\njson = 2', b'json = [1,2]',
                   b'json = []\njson[1] = 1\njson[0] = 2',
                   b'json = {}\njson.a = {}\njson.b = {}\njson.a.x = 1']:
        assert run(NODE, source).returncode == 0
        actual = run(NATIVE, source)
        assert actual.returncode != 0 and b'unsupported' in actual.stderr, actual
    for source in [b'json = 01', b'json = "\\x"', b'json = []\njson["0"] = 1',
                   b'json = {}\njson[0] = 1', b'json = true false', b'json = {}\njson[01] = 1']:
        assert run(NODE, source).returncode != 0
        assert run(NATIVE, source).returncode != 0
    print(f'{len(cases) * 3} exact-output ordered comparisons; fallback and malformed rejection checks passed')

if __name__ == '__main__':
    main()
