export const CHUNK_SIZE = 1 << 20;
const STREAMING_HIGH_WATER = 4 * CHUNK_SIZE;

/**
 * Buffered writer in front of a `NodeJS.WritableStream`.
 *
 * Output is produced synchronously into `buf` and handed to the stream in
 * whole chunks. Until `commit()` is called nothing reaches the stream, so a
 * caller can still `discard()` everything and start over; after that, `flush()`
 * respects backpressure by waiting for `'drain'` whenever `write()` returns false.
 */
export class OutputBuffer {
  buf: Buffer = Buffer.allocUnsafe(CHUNK_SIZE);
  pos = 0;
  held = true;
  /** Bytes in full chunks that have not been handed to the stream yet. */
  queued = 0;

  private queue: Buffer[] = [];
  private failure: Error | undefined;
  private readonly onError = (error: Error): void => {
    this.failure ??= error;
  };

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly holdLimit: number
  ) {
    stream.on("error", this.onError);
  }

  /** Makes room for `bytes` more bytes in `buf`. */
  reserve(bytes: number): void {
    if (this.buf.length - this.pos < bytes) this.rotate(bytes);
  }

  /** True when the producer should pause and let the driver flush or commit. */
  get saturated(): boolean {
    return this.queued >= (this.held ? this.holdLimit : STREAMING_HIGH_WATER);
  }

  /** True while held output has reached the point where it must be released. */
  get overBudget(): boolean {
    return this.held && this.queued + this.pos >= this.holdLimit;
  }

  commit(): void {
    this.held = false;
  }

  discard(): void {
    this.queue = [];
    this.queued = 0;
    this.pos = 0;
    if (this.buf.length > CHUNK_SIZE) this.buf = Buffer.allocUnsafe(CHUNK_SIZE);
  }

  /** Hands queued chunks to the stream, waiting for `'drain'` as needed. */
  async flush(): Promise<void> {
    if (this.held) return;
    const queue = this.queue;
    this.queue = [];
    this.queued = 0;
    for (const chunk of queue) {
      this.throwIfFailed();
      if (!this.stream.write(chunk)) await this.waitForDrain();
    }
    this.throwIfFailed();
  }

  /** Releases everything, including the partial chunk, and waits for the last write to complete. */
  async finish(): Promise<void> {
    this.rotate(0);
    this.held = false;
    const queue = this.queue;
    this.queue = [];
    this.queued = 0;
    try {
      for (let index = 0; index < queue.length; index += 1) {
        this.throwIfFailed();
        const chunk = queue[index] as Buffer;
        if (index < queue.length - 1) {
          if (!this.stream.write(chunk)) await this.waitForDrain();
        } else {
          await new Promise<void>((resolve, reject) => {
            this.stream.write(chunk, (error?: Error | null) => (error ? reject(error) : resolve()));
          });
        }
      }
      this.throwIfFailed();
    } finally {
      this.stream.off("error", this.onError);
    }
  }

  dispose(): void {
    this.stream.off("error", this.onError);
  }

  private rotate(minimum: number): void {
    if (this.pos > 0) {
      this.queue.push(this.buf.subarray(0, this.pos));
      this.queued += this.pos;
    } else if (this.buf.length >= minimum) {
      return;
    }
    this.buf = Buffer.allocUnsafe(minimum > CHUNK_SIZE ? minimum : CHUNK_SIZE);
    this.pos = 0;
  }

  private throwIfFailed(): void {
    if (this.failure) throw this.failure;
  }

  private waitForDrain(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const stream = this.stream;
      const cleanup = (): void => {
        stream.off("drain", onDrain);
        stream.off("error", onError);
        stream.off("close", onClose);
      };
      const onDrain = (): void => {
        cleanup();
        resolve();
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const onClose = (): void => {
        cleanup();
        reject(new Error("output stream closed before all data was written"));
      };
      stream.on("drain", onDrain);
      stream.on("error", onError);
      stream.on("close", onClose);
    });
  }
}
