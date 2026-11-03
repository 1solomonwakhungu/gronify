#!/usr/bin/env python3
"""Differential literal-search CLI checks; no large benchmark sweep."""
import json
import pathlib
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
NATIVE = [str(ROOT / 'native/target/release/gronify-native'), 'search']
NODE = ['node', str(ROOT / 'src/packages/cli/dist/index.js'), '--no-color', 'search']


def run(cmd, data, options, term):
    return subprocess.run([*cmd, *options, '--', term], input=data, capture_output=True, timeout=30)


def main():
    data = ('{"Needle.path":"a.*[x]$^+?()|\\\\","é":"ÉéßẞſSKKİiıΣσς😀𐐀𐐨",'
            '"num":[-0,1.10,1e999,123456789012345678901234567890],'
            '"escaped":"\\u0061\\n\\ud800","duplicate":"needle","duplicate":"NEEDLE"}').encode()
    terms = ['needle', 'Needle.path', 'a.*[x]$^+?()|', '\\', '[x]', 'path"] = "a',
             ' = ', '{}', '1.10', '1e999', '-0', '123456789012345678901234567890',
             '\\ud800', '\\n', '\n', '', 'missing', 'K', 'S', 'i']
    comparisons = 0
    for sensitive, needles in [(False, terms), (True, terms + ['é', 'É', 'ß', 'ẞ', 'ſ', 'K', 'İ', 'ı', 'Σ', 'σ', 'ς', '😀', '𐐀', '𐐨'])]:
        for term in needles:
            for extra in [[], ['--count'], ['--max-count', '1'], ['--count', '-m', '2']]:
                options = [*(['-c'] if sensitive else []), '--exit-status', *extra]
                expected = run(NODE, data, options, term)
                for chunk in [1, 65536]:
                    actual = run(NATIVE, data, [*options, '--chunk-size', str(chunk)], term)
                    assert (actual.returncode, actual.stdout) == (expected.returncode, expected.stdout), (term, options, chunk, actual, expected)
                    comparisons += 1
    for term in ['é', 'Σ', 'K', '𐐀']:
        result = run(NATIVE, data, ['--exit-status'], term)
        assert result.returncode == 2 and b'non-ASCII case-insensitive' in result.stderr
    for options in [['--regex'], ['--sort'], ['--invert-match'], ['--output', 'x'], ['--max-count', '0'], ['-m', '01'], ['-m', '+1'], ['-m', '1.1'], ['-m', '9007199254740992']]:
        for command in [NATIVE]:
            result = run(command, data, [*options, '--exit-status'], 'a')
            assert result.returncode == 2, (options, result)
    for bad in [b'', b'[1,]', b'{"a":1,}', b'"\\x"', b'"\xc0\xaf"', b'01', b'["hit",INVALID']:
        for status in [[], ['--exit-status']]:
            expected = run(NODE, bad, status, 'hit')
            actual = run(NATIVE, bad, status, 'hit')
            assert actual.returncode == expected.returncode != 0
    for count in [[], ['--count']]:
        a = run(NATIVE, b'["hit",INVALID', ['-m', '1', *count], 'hit')
        b = run(NODE, b'["hit",INVALID', ['-m', '1', *count], 'hit')
        assert (a.returncode, a.stdout) == (b.returncode, b.stdout)
    # Long lines and terms cross matcher, input and output block boundaries.
    long = json.dumps({'path': 'A' * 70000 + 'needle' + 'z' * 70000}).encode()
    for term in ['A' * 300, 'A' * 200 + 'needle', 'missing', 'needle']:
        a, b = (run(c, long, ['--count'], term) for c in [NATIVE, NODE])
        assert (a.returncode, a.stdout) == (b.returncode, b.stdout)
    with tempfile.TemporaryDirectory(prefix='gronify-search-compat-') as tmp:
        path = pathlib.Path(tmp) / 'input.json'
        path.write_bytes(data)
        for command in [NATIVE, NODE]:
            result = subprocess.run([*command, str(path), 'needle'], capture_output=True, timeout=30)
            assert result.stdout == run(command, data, [], 'needle').stdout
        # Pause a pipe consumer: bounded stdout buffering must block the producer.
        path.write_bytes(b'[' + b','.join([b'"hit"'] * 100000) + b']')
        child = subprocess.Popen([*NATIVE, str(path), 'hit'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            time.sleep(0.1)
            assert child.poll() is None, 'producer did not honor pipe backpressure'
            output, error = child.communicate(timeout=30)
            assert child.returncode == 0 and output.count(b'\n') == 100000, error
        finally:
            if child.poll() is None:
                child.kill()
            child.wait()
    print(json.dumps({'search_byte_and_status_comparisons': comparisons, 'unicode_rejection': True, 'errors_caps_long_lines_files_backpressure': 'passed'}))


if __name__ == '__main__':
    main()
