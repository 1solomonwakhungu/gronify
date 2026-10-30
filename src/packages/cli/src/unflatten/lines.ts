import { lineError } from "./parse.js";

/** Longest single gron line the splitter will assemble across chunks. */
export const MAX_LINE_BYTES = 256 * 1024 * 1024;

export interface LineSink {
  /**
   * Handles one line (`buf[start..end)`, without its `\n`; a trailing `\r` is left for the sink to trim).
   * Returns false to pause: the splitter stops after this line and the caller resumes later.
   */
  line(buf: Buffer, start: number, end: number, lineNumber: number): boolean;
}

/**
 * Splits a byte stream into lines across chunk boundaries. Lines that sit
 * inside one chunk are passed as views of it, so only lines that straddle a
 * boundary are copied.
 */
export class LineSplitter {
  private chunk: Buffer = Buffer.alloc(0);
  private position = 0;
  private carry: Buffer[] = [];
  private carryLength = 0;
  private lines = 0;

  get lineCount(): number {
    return this.lines;
  }

  feed(chunk: Buffer): void {
    this.chunk = chunk;
    this.position = 0;
  }

  /** Delivers complete lines from the current chunk. Returns false if the sink paused; call `run` again after resuming it. */
  run(sink: LineSink): boolean {
    const chunk = this.chunk;
    const length = chunk.length;
    let position = this.position;
    while (position < length) {
      const newline = chunk.indexOf(0x0a, position);
      if (newline === -1) {
        this.stash(chunk.subarray(position));
        position = length;
        break;
      }
      this.lines += 1;
      this.position = newline + 1;
      let proceed: boolean;
      if (this.carryLength === 0) {
        proceed = sink.line(chunk, position, newline, this.lines);
      } else {
        this.stash(chunk.subarray(position, newline));
        const line = Buffer.concat(this.carry, this.carryLength);
        this.carry = [];
        this.carryLength = 0;
        proceed = sink.line(line, 0, line.length, this.lines);
      }
      position = newline + 1;
      if (!proceed) return false;
    }
    this.position = position;
    return true;
  }

  private stash(piece: Buffer): void {
    if (this.carryLength + piece.length > MAX_LINE_BYTES) {
      throw lineError(this.lines + 1, `line is longer than ${MAX_LINE_BYTES / (1024 * 1024)} MiB`);
    }
    this.carry.push(piece);
    this.carryLength += piece.length;
  }
}
