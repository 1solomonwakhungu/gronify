import { randomBytes } from "node:crypto";
import { createWriteStream, realpathSync, statSync, unlinkSync, type Stats } from "node:fs";
import { chmod, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { Writable } from "node:stream";
import type { LineMatcher } from "./matcher.js";

/**
 * Where a command's output goes: stdout or a file. Any command that produces output (flatten, search, unflatten) can
 * take one from `createOutputSink`, write to `open()`, then `commit()` on success or `abort()` on any failure.
 */
export interface OutputSink {
  /** The destination stream. Created on the first call, so a sink nobody writes to touches nothing on disk. */
  open(): Writable;
  /** Every byte has been written: close the destination, wait for it to flush and publish it. Aborts, then rejects, on failure. */
  commit(): Promise<void>;
  /** Throws the output away. Never rejects, and does nothing after a successful `commit`. */
  abort(): Promise<void>;
}

/** stdout cannot be closed, and what was already written to it cannot be taken back. */
class StdoutSink implements OutputSink {
  open(): Writable {
    return process.stdout;
  }

  async commit(): Promise<void> {}

  async abort(): Promise<void> {}
}

/**
 * Writes to a temp file next to the target and renames it over the target on `commit`, so the target is replaced
 * all at once or not at all. That keeps an input that is also the output file readable while it streams, and keeps
 * a previous good file when the run fails half way. Existing devices and pipes (`-o /dev/null`) are written in place.
 */
class FileSink implements OutputSink {
  private stream: Writable | null = null;
  private closed: Promise<void> = Promise.resolve();
  private error: Error | null = null;
  private temp: string | null = null;
  private target: string;
  private mode: number | null = null;
  private settled = false;

  private readonly onSignal = (signal: NodeJS.Signals): void => {
    this.removeTemp();
    this.uninstallCleanup();
    process.kill(process.pid, signal);
  };
  private readonly onExit = (): void => this.removeTemp();

  constructor(private readonly file: string) {
    this.target = file;
  }

  open(): Writable {
    if (this.stream !== null) return this.stream;
    let existing: Stats | null = null;
    try {
      // Replace the file a symlink points at, not the link itself.
      this.target = realpathSync(this.file);
      existing = statSync(this.target);
    } catch {
      // Missing or unreachable: creating the temp file reports the real problem.
    }
    if (existing?.isDirectory()) {
      throw Object.assign(new Error(`EISDIR: illegal operation on a directory, open '${this.file}'`), { code: "EISDIR" });
    }
    let stream: Writable;
    // Paths like /dev/stdout and /dev/fd/N resolve to whatever the descriptor points at (often a regular file), so
    // decide from the path the user gave: renaming over a /dev or /proc entry would replace the link itself.
    if (/^\/(dev|proc)\//.test(resolve(this.file)) || (existing !== null && !existing.isFile())) {
      stream = createWriteStream(this.file);
    } else {
      this.mode = existing === null ? null : existing.mode & 0o7777;
      this.temp = join(dirname(this.target), `.${basename(this.target)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
      stream = createWriteStream(this.temp, { flags: "wx" });
      this.installCleanup();
    }
    stream.on("error", (error: Error) => {
      this.error = this.retarget(error);
    });
    this.closed = new Promise<void>((resolve) => stream.once("close", () => resolve()));
    this.stream = stream;
    return stream;
  }

  async commit(): Promise<void> {
    const stream = this.stream;
    if (stream === null || this.settled) return;
    try {
      if (this.error === null) stream.end();
      await this.closed;
      if (this.error !== null) throw this.error;
      if (this.temp !== null) {
        if (this.mode !== null) await chmod(this.temp, this.mode);
        await rename(this.temp, this.target);
      }
    } catch (error) {
      await this.abort();
      throw error instanceof Error ? this.retarget(error) : error;
    }
    this.settled = true;
    this.uninstallCleanup();
  }

  async abort(): Promise<void> {
    const stream = this.stream;
    if (stream === null || this.settled) return;
    this.settled = true;
    stream.destroy();
    await this.closed;
    if (this.temp !== null) await unlink(this.temp).catch(() => undefined);
    this.uninstallCleanup();
  }

  /** Shows the user's path instead of the temp file's in error messages. */
  private retarget(error: Error): Error {
    const temp = this.temp;
    if (temp === null) return error;
    const failure = error as NodeJS.ErrnoException;
    error.message = error.message.split(temp).join(this.file);
    if (failure.path === temp) failure.path = this.file;
    return error;
  }

  private removeTemp(): void {
    if (this.temp === null) return;
    try {
      unlinkSync(this.temp);
    } catch {
      // Already renamed or removed.
    }
  }

  /** A killed run leaves no temp file behind: remove it, then die from the same signal. */
  private installCleanup(): void {
    process.on("SIGINT", this.onSignal);
    process.on("SIGTERM", this.onSignal);
    process.on("SIGHUP", this.onSignal);
    process.on("exit", this.onExit);
  }

  private uninstallCleanup(): void {
    process.removeListener("SIGINT", this.onSignal);
    process.removeListener("SIGTERM", this.onSignal);
    process.removeListener("SIGHUP", this.onSignal);
    process.removeListener("exit", this.onExit);
  }
}

/** stdout when `file` is undefined, otherwise an atomically replaced file. */
export function createOutputSink(file?: string): OutputSink {
  return file ? new FileSink(file) : new StdoutSink();
}

export interface OutputOptions {
  /** Where the output goes. Nothing is created (or truncated) until the first flush. */
  sink: OutputSink;
  blockSize?: number;
  /** Keep only lines the matcher accepts (or rejects, with `invert`). */
  matcher?: LineMatcher | null;
  invert?: boolean;
  /** Count matching lines without writing them. */
  countOnly?: boolean;
  /** Rewrites each kept line, for color and pretty output. */
  format?: ((line: string) => string) | null;
  /** Stop after this many kept lines (written, or counted with `countOnly`). */
  limit?: number | undefined;
}

const NEWLINE = 0x0a;
const DEFAULT_BLOCK_SIZE = 1 << 20;
const MAX_SPARE_BLOCKS = 4;

function countNewlines(buf: Buffer, start: number, end: number): number {
  let count = 0;
  for (let at = buf.indexOf(NEWLINE, start); at >= 0 && at < end; at = buf.indexOf(NEWLINE, at + 1)) count += 1;
  return count;
}

/**
 * Collects gron lines into large byte blocks and hands them to a stream. Producers call `reserve`, write bytes at
 * `pos`, then call `lineDone`; lines that a matcher rejects are rewound without ever being copied. When the stream
 * pushes back, `blocked` turns true and the producer should stop and `await drain()`.
 */
export class GronOutput {
  buf: Buffer;
  pos = 0;
  blocked = false;
  /** Number of lines kept so far (by the matcher if there is one), counted or written. */
  matched = 0;
  /** The `limit` was reached. `blocked` stays true so the producer stops, and `drain` no longer waits. */
  stopped = false;
  /** Set by the producer when the limit was reached and it knows the input had nothing more to print. */
  exhausted = false;

  private stream: Writable | null = null;
  private spare: Buffer[] = [];
  private failure: Error | null = null;
  private waiters: Array<() => void> = [];
  private finished = false;

  private readonly sink: OutputSink;
  private readonly blockSize: number;
  private readonly matcher: LineMatcher | null;
  private readonly invert: boolean;
  private readonly countOnly: boolean;
  private readonly format: ((line: string) => string) | null;
  private readonly limit: number;

  constructor(options: OutputOptions) {
    this.sink = options.sink;
    this.blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE;
    this.matcher = options.matcher ?? null;
    this.invert = options.invert ?? false;
    this.countOnly = options.countOnly ?? false;
    this.format = options.format ?? null;
    this.limit = options.limit ?? Infinity;
    this.buf = Buffer.allocUnsafe(this.blockSize);
  }

  /** Ensures `n` more bytes fit at `pos`. May flush earlier, completed lines, so call it before starting a line. */
  reserve(n: number): void {
    if (this.pos + n > this.buf.length) this.makeRoom(n);
  }

  /** Finishes the line that started at `start`: filters, formats and terminates it. Needs one reserved byte. */
  lineDone(start: number): void {
    const matcher = this.matcher;
    if (matcher !== null && matcher.test(this.buf, start, this.pos) === this.invert) {
      this.pos = start;
      return;
    }
    this.matched += 1;
    if (this.countOnly) {
      this.pos = start;
    } else {
      if (this.format !== null) {
        const formatted = this.format(this.buf.toString("utf8", start, this.pos));
        this.pos = start;
        this.reserve(Buffer.byteLength(formatted) + 1);
        this.pos += this.buf.write(formatted, this.pos, "utf8");
      }
      this.buf[this.pos++] = NEWLINE;
    }
    if (this.matched >= this.limit) this.stop();
  }

  /** Whether the line at `buf[start, end)` passes the matcher. Used by producers that filter before they buffer. */
  accepts(buf: Buffer, start: number, end: number): boolean {
    return this.matcher === null || this.matcher.test(buf, start, end) !== this.invert;
  }

  /**
   * Writes lines that were already filtered. `src[start, end)` holds whole, newline-terminated lines; `lines` is how
   * many (or -1 to count them). Respects the limit and the formatter, so the producer only has to check `stopped`.
   */
  appendLines(src: Buffer, start: number, end: number, lines: number): void {
    if (this.stopped || end <= start) return;
    const count = lines >= 0 ? lines : countNewlines(src, start, end);
    if (this.format === null && this.matched + count <= this.limit) {
      this.matched += count;
      this.reserve(end - start);
      src.copy(this.buf, this.pos, start, end);
      this.pos += end - start;
      if (this.matched >= this.limit) this.stop();
      return;
    }
    // Formatting is per line, and so is stopping in the middle of a chunk.
    for (let at = start; at < end; ) {
      const newline = src.indexOf(NEWLINE, at);
      const stop = newline < 0 || newline >= end ? end : newline;
      if (this.format === null) {
        this.reserve(stop - at + 1);
        src.copy(this.buf, this.pos, at, stop);
        this.pos += stop - at;
      } else {
        const formatted = this.format(src.toString("utf8", at, stop));
        this.reserve(Buffer.byteLength(formatted) + 1);
        this.pos += this.buf.write(formatted, this.pos, "utf8");
      }
      this.buf[this.pos++] = NEWLINE;
      this.matched += 1;
      if (this.matched >= this.limit) {
        this.stop();
        return;
      }
      at = stop + 1;
    }
  }

  private stop(): void {
    this.stopped = true;
    this.blocked = true;
  }

  /** Hands everything written so far to the stream. */
  flush(): void {
    if (this.pos === 0) return;
    if (this.pos * 2 > this.buf.length) {
      // The stream takes the block as is, with no copy.
      const block = this.buf;
      const chunk = block.subarray(0, this.pos);
      this.buf = this.spare.pop() ?? Buffer.allocUnsafe(this.blockSize);
      this.pos = 0;
      this.send(chunk, block);
    } else {
      // A mostly empty block is copied out so the large buffer can keep filling.
      const chunk = Buffer.from(this.buf.subarray(0, this.pos));
      this.pos = 0;
      this.send(chunk, null);
    }
  }

  /** Resolves once the stream has caught up; rejects if it failed. */
  async drain(): Promise<void> {
    if (this.failure) throw this.failure;
    if (!this.blocked || this.stopped) return;
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    if (this.failure) throw this.failure;
  }

  /**
   * With `flushPending` true, flushes and commits the sink; any failure aborts it before rejecting. With false (the
   * input failed) the unwritten tail is dropped and the sink is aborted, so a file is never replaced by partial
   * output. Whatever stdout already received stays written.
   */
  async finish(flushPending: boolean): Promise<void> {
    if (!flushPending) {
      this.pos = 0;
      this.finished = true;
      await this.sink.abort();
      return;
    }
    try {
      this.flush();
      this.finished = true;
      if (this.stream === null) return;
      await this.drain();
      await this.sink.commit();
      if (this.failure) throw this.failure;
    } catch (error) {
      this.finished = true;
      await this.sink.abort();
      throw error;
    }
  }

  private makeRoom(n: number): void {
    this.flush();
    if (n > this.buf.length) this.buf = Buffer.allocUnsafe(Math.max(n, this.buf.length * 2));
  }

  private send(chunk: Buffer, block: Buffer | null): void {
    if (this.failure) return;
    const stream = this.stream ?? this.attach();
    if (!stream.write(chunk)) this.blocked = true;
    // A synchronous destination (a file or /dev/null as stdout) has consumed the chunk by now. Reusing the block
    // avoids allocating, and page-faulting, a fresh one per flush. Asynchronous streams keep theirs.
    //
    // `writableLength === 0` means the stream no longer holds the chunk, which is true for every stream the CLI
    // writes to. stdout as a file (SyncWriteStream) writes inside `_write` and calls back at once. stdout as a pipe
    // or TTY (net.Socket / tty.WriteStream) tries the write directly and only reports zero when the kernel took
    // every byte; otherwise libuv keeps the buffer and the length stays above zero until it is done. An fs.WriteStream
    // (`-o`) always writes asynchronously, so its blocks are never reused. It would be unsafe for a Writable whose
    // `_write` keeps a reference to the chunk (collects it, or hands it to something later) yet calls back
    // synchronously: the length reads zero, the block is refilled, and the saved chunk changes under its owner.
    if (block !== null && block.length === this.blockSize && stream.writableLength === 0 && this.spare.length < MAX_SPARE_BLOCKS) {
      this.spare.push(block);
    }
  }

  private attach(): Writable {
    const stream = this.sink.open();
    stream.on("drain", () => {
      if (!this.failure && !this.stopped) this.blocked = false;
      this.release();
    });
    stream.on("error", (error: Error) => {
      this.failure = error;
      this.blocked = true;
      this.release();
    });
    stream.on("close", () => {
      if (!this.finished && !this.failure) {
        this.failure = new Error("output stream closed unexpectedly");
        this.blocked = true;
      }
      this.release();
    });
    this.stream = stream;
    return stream;
  }

  private release(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }
}
