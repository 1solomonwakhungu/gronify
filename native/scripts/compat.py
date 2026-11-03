#!/usr/bin/env python3
"""Serial differential tests. Requires release native build and npm run build."""
import hashlib
import json
import pathlib
import random
import signal
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
NATIVE = [str(ROOT / 'native/target/release/gronify-native'), 'flatten']
NODE = ['node', str(ROOT / 'src/packages/cli/dist/index.js'), '--no-color', 'flatten']


def run(command, path):
    result = subprocess.run([*command, str(path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    return result.returncode, result.stdout


def main():
    fixtures = {
        'numbers': b'[-0,0,1.10,123456789012345678901234567890,1e999,-1E-999,2.00E+12]',
        'keys': br'{"a":0,"$x_1":1,"0":2,"a b":3,"":4,"\u0061":5,"a=b]":6,"__proto__":7,"a":8}',
        'unicode': ('{"é😀":"漢字\u2028\u2029",' + r'"\ud800":"\udfff","\ud83d\ude00":"\u0041\/\b\f\n\r\t\u0000\"\\"}').encode(),
        'surrogates': br'["\ud800\ud800\udfff","\udfff\ud800","\ud800x","\ud800\u0000"]',
        'containers': b'[{"a":[],"b":{}},null,true,false,[1,[2],3]]',
        'long': b'{"long":"' + b'a' * (1024 * 1024) + b'","escape":"' + br'\u0061' * 20000 + b'"}',
        'long-key-number': b'{"' + b'k' * 70000 + b'":' + b'1' * 70000 + b'}',
        'deep': b'[' * 1000 + b'0' + b']' * 1000,
    }
    # Put each byte of a UTF-8 sequence and escape across the 64 KiB input boundary.
    for pad in range(65525, 65540):
        fixtures[f'boundary-{pad}'] = b'["' + b'a' * pad + '😀'.encode() + br'\ud800\u0041",1e-12]'
    rng = random.Random(101)
    for i in range(25):
        value = {f'k{j} /é': [rng.randrange(-10**20, 10**20), rng.choice(['😀', '\n', '\ud800', 'a\\b']), None] for j in range(rng.randrange(1, 15))}
        fixtures[f'random-{i}'] = json.dumps(value, ensure_ascii=True).encode()
    bad = [b'', b' ', b'[1,]', b'{"a":1,}', b'01', b'-', b'1.', b'1e+', b'NaN', b'Infinity', b'true false', b'[}', b'{"a" 1}', b'"\\x"', b'"\\u12zz"', b'"\n"', b'"\xc0\xaf"', b'"\xed\xa0\x80"', b'"\xf4\x90\x80\x80"', b'"\xe2\x82"', b'\xef\xbb\xbf{}', b'[\x0b]', b'{', b'[1', b'"abc', b'falsex', b'1e2e3']
    comparisons = 0
    with tempfile.TemporaryDirectory(prefix='gronify-native-compat-') as tmp:
        path = pathlib.Path(tmp) / 'input.json'
        for name, data in fixtures.items():
            path.write_bytes(data)
            code, expected = run(NODE, path)
            assert code == 0, name
            for chunk in [1, 2, 7, 65536]:
                code, actual = run([*NATIVE, '--chunk-size', str(chunk)], path)
                assert code == 0 and actual == expected, (name, chunk, code)
                comparisons += 1
        for data in bad:
            path.write_bytes(data)
            assert run(NODE, path)[0] != 0, data
            for chunk in [1, 7, 65536]:
                assert run([*NATIVE, '--chunk-size', str(chunk)], path)[0] != 0, (data, chunk)
        path.write_bytes(b'[1,2,3,INVALID TAIL')
        for cap in [1, 2, 3, 4]:
            assert run([*NATIVE, '--limit', str(cap)], path) == run([*NODE, '--limit', str(cap)], path)
        for option in ['--sort', '--pretty', '--color', '--output', '--unknown']:
            assert run([*NATIVE, option], path)[0] != 0
        # Full 50000-depth output is 3.75 GB. Compare streamed bytes directly, never retain it on disk/RAM.
        path.write_bytes(b'[' * 50000 + b'0' + b']' * 50000)
        def timed_out(signum, frame):
            raise TimeoutError('deep byte comparison exceeded 60 seconds')
        signal.signal(signal.SIGALRM, timed_out)
        node = subprocess.Popen([*NODE, str(path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        native = subprocess.Popen([*NATIVE, str(path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            signal.alarm(60)
            digest = hashlib.sha256()
            size = 0
            while True:
                a, b = node.stdout.read(1024*1024), native.stdout.read(1024*1024)
                assert a == b, '50000-depth byte mismatch'
                if not a:
                    break
                digest.update(a)
                size += len(a)
            assert node.wait(timeout=30) == native.wait(timeout=30) == 0
        finally:
            signal.alarm(0)
            for child in [node, native]:
                if child.poll() is None:
                    child.kill()
                child.wait()
                child.stdout.close()
        print(json.dumps({'valid_fixtures': len(fixtures), 'byte_comparisons': comparisons, 'malformed_fixtures': len(bad), 'malformed_chunk_sizes': 3, 'cap_comparisons': 4, 'depth': 50000, 'deep_output_bytes': size, 'deep_sha256': digest.hexdigest()}, indent=2))


if __name__ == '__main__':
    main()
