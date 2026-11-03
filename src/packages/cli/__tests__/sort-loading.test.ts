import { spawnSync } from "node:child_process";

// Exercise the emitted ESM in a fresh process; Jest's CommonJS transform cannot
// establish whether Node eagerly loads a dependency before flattenStream runs.
const loader = `export async function resolve(specifier, context, next) {
  if (specifier === './sort.js') throw new Error('sort loading blocked');
  return next(specifier, context);
}`;

function run(sort: boolean, inputFailure = false) {
  const hook = inputFailure ? `export async function resolve(specifier, context, next) {
    if (specifier === './sort.js') await new Promise(resolve => setTimeout(resolve, 100));
    return next(specifier, context);
  }` : loader;
  return spawnSync(process.execPath, [
    "--no-warnings",
    `--experimental-loader=data:text/javascript,${encodeURIComponent(hook)}`,
    "--input-type=module",
    "-e",
    `
      import assert from 'node:assert/strict';
      import { Readable, Writable } from 'node:stream';
      import { flattenStream } from './dist/flatten-stream.js';
      import { GronOutput } from './dist/output.js';
      const input = Readable.from(['{"z":1,"a":2}']);
      if (${inputFailure}) process.nextTick(() => input.destroy(new Error('input failed')));
      let aborted = false;
      let committed = false;
      let text = '';
      const stream = new Writable({ write(chunk, encoding, done) { text += chunk; done(); } });
      const out = new GronOutput({ sink: {
        open: () => stream,
        commit: async () => { committed = true; },
        abort: async () => { aborted = true; },
      } });
      if (${sort}) {
        await assert.rejects(flattenStream(input, out, { sort: true }), /${inputFailure ? 'input failed' : 'sort loading blocked'}/);
        assert.equal(input.listenerCount('error'), 0);
        assert.equal(aborted, true);
        assert.equal(committed, false);
        assert.equal(input.destroyed, true);
        assert.equal(text, '');
      } else {
        await flattenStream(input, out);
        assert.equal(aborted, false);
        assert.equal(committed, true);
        assert.equal(text, 'json = {}\\njson.z = 1\\njson.a = 2\\n');
      }
    `,
  ], { encoding: "utf8" });
}

test("unsorted flatten does not load sorting and preserves document order", () => {
  const result = run(false);
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
});

test("a lazy sorting import failure aborts output and destroys input", () => {
  const result = run(true);
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
});

test("a readable error during sorting import rejects through normal cleanup", () => {
  const result = run(true, true);
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
});
