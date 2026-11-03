#!/usr/bin/env python3
"""Native CLI control flags and real POSIX pipe cancellation (Linux/macOS)."""
from contextlib import contextmanager
import os
import signal
from pathlib import Path
import subprocess
import tempfile

BIN = str(Path(__file__).resolve().parents[1] / "target/release/gronify-native")


@contextmanager
def process(*args, **kwargs):
    p = subprocess.Popen(*args, **kwargs)
    try:
        yield p
    finally:
        if p.poll() is None:
            p.kill()
        p.wait()
        for stream in [p.stdin, p.stdout, p.stderr]:
            if stream and not stream.closed:
                try:
                    stream.close()
                except BrokenPipeError:
                    pass


def deadline(signum, frame):
    raise TimeoutError("CLI pipe checks exceeded 60 seconds")


signal.signal(signal.SIGALRM, deadline)
signal.alarm(60)


def run(args, data=b"", code=0):
    p = subprocess.run([BIN, *args], input=data, capture_output=True, timeout=10)
    assert p.returncode == code, (args, p.returncode, p.stderr)
    return p


for command in [[], ["flatten"], ["search"], ["unflatten"]]:
    for flag in ["--help", "-h", "--version"]:
        # No EOF on stdin: information flags must never read input.
        with process([BIN, *command, flag], stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE) as p:
            assert p.wait(timeout=5) == 0
            assert b"experimental" in p.stdout.read().lower()
            assert p.stderr.read() == b""
assert b"Usage:" in run(["--help"]).stdout
assert run(["--version"]).stdout == b"gronify-native 0.0.1 (experimental)\n"
run([], code=1)
run(["unknown"], code=1)
run(["search", "--exit-status", "missing"], b"0", code=1)
run(["search", "missing"], b"0")
run(["search", "--exit-status", "--count", "missing"], b"0", code=1)
run(["search", "--exit-status", "x"], b"invalid", code=2)
run(["search", "--exit-status", "--output", "x"], code=2)
assert run(["search", "--", "--help"], b'"--help"').stdout == b'json = "--help"\n'
for command in ["flatten", "search", "unflatten"]:
    args = [command] + (["--exit-status"] if command == "search" else [])
    tail = [""] if command == "search" else []
    run([*args, "/nonexistent/gronify-input", *tail], code=2 if tail else 1)
    run([*args, "--output", "unused", *tail], code=2 if tail else 1)
    payload = (b'json = "' if command == "unflatten" else b'"') + b'x' * 262144 + b'"\n'
    with tempfile.TemporaryFile() as source:
        source.write(payload)
        source.seek(0)
        # Real head consumer exits after one byte, during a long write.
        with process([BIN, *args, *tail], stdin=source, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE) as producer:
            consumer = subprocess.Popen(["head", "-c", "1"], stdin=producer.stdout,
                                        stdout=subprocess.PIPE)
            producer.stdout.close()
            assert consumer.communicate(timeout=5)[0]
            assert consumer.returncode == 0
            assert producer.wait(timeout=5) == 0
            assert producer.stderr.read() == b""
    # Close output before starting. Long writes must cancel while stdin remains open.
    read_fd, write_fd = os.pipe()
    os.close(read_fd)
    try:
        with process([BIN, *args, *tail], stdin=subprocess.PIPE,
                              stdout=write_fd, stderr=subprocess.PIPE) as p:
            p.stdin.write(payload)
            p.stdin.flush()
            assert p.wait(timeout=5) == 0
            assert p.stderr.read() == b""
        # Tiny result reaches the same policy at final buffered flush.
        small = b"json = 0\n" if command == "unflatten" else b"0"
        p = subprocess.run([BIN, *args, *tail], input=small, stdout=write_fd,
                           stderr=subprocess.PIPE, timeout=5)
        assert p.returncode == 0 and p.stderr == b"", (command, p.stderr)
        if command == "search":
            # A failed count output cancels successfully even for zero matches.
            p = subprocess.run([BIN, "search", "--exit-status", "--count", "missing"],
                               input=b"0", stdout=write_fd, stderr=subprocess.PIPE, timeout=5)
            assert p.returncode == 0 and p.stderr == b""
        # A real input error must not be hidden by a disconnected destination.
        p = subprocess.run([BIN, *args, *tail], input=b"invalid", stdout=write_fd,
                           stderr=subprocess.PIPE, timeout=5)
        assert p.returncode == (2 if tail else 1) and p.stderr
    finally:
        os.close(write_fd)
    if Path("/dev/full").exists():
        with open("/dev/full", "wb") as full:
            p = subprocess.run([BIN, *args, *tail], input=small, stdout=full,
                               stderr=subprocess.PIPE, timeout=5)
            assert p.returncode == (2 if tail else 1) and p.stderr
print("Native help/version, status, head-close, open-stdin and final-flush checks passed")
