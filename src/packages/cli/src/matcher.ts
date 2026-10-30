/** Tests one gron line, given as UTF-8 bytes at `buf[start, end)`. */
export interface LineMatcher {
  test(buf: Buffer, start: number, end: number): boolean;
}

export interface MatcherOptions {
  regex?: boolean;
  caseSensitive?: boolean;
}

const IDENTITY = new Uint8Array(256);
const ASCII_LOWER = new Uint8Array(256);
for (let byte = 0; byte < 256; byte += 1) {
  IDENTITY[byte] = byte;
  ASCII_LOWER[byte] = byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Literal substring search over bytes using Boyer-Moore-Horspool. With `foldCase`, ASCII letters compare
 * case-insensitively. That is exactly what a non-unicode `/i` RegExp does for an ASCII needle (non-ASCII characters
 * never fold to ASCII there), and UTF-8 multi-byte sequences contain no ASCII bytes, so no decoding is needed.
 */
class SubstringMatcher implements LineMatcher {
  private readonly needle: Uint8Array;
  private readonly fold: Uint8Array;
  private readonly shift = new Uint32Array(256);

  constructor(term: string, foldCase: boolean) {
    this.fold = foldCase ? ASCII_LOWER : IDENTITY;
    const bytes = Buffer.from(term, "utf8");
    this.needle = bytes.map((byte) => this.fold[byte]!);
    const last = this.needle.length - 1;
    this.shift.fill(this.needle.length);
    for (let i = 0; i < last; i += 1) this.shift[this.needle[i]!] = last - i;
  }

  test(buf: Buffer, start: number, end: number): boolean {
    const { needle, fold, shift } = this;
    const last = needle.length - 1;
    if (last < 0) return true;
    const lastByte = needle[last]!;
    let i = start + last;
    while (i < end) {
      const c = fold[buf[i]!]!;
      if (c === lastByte) {
        let k = last - 1;
        let j = i - 1;
        while (k >= 0 && fold[buf[j]!] === needle[k]) {
          k -= 1;
          j -= 1;
        }
        if (k < 0) return true;
      }
      i += shift[c]!;
    }
    return false;
  }
}

class RegexMatcher implements LineMatcher {
  constructor(private readonly pattern: RegExp) {}

  test(buf: Buffer, start: number, end: number): boolean {
    return this.pattern.test(buf.toString("utf8", start, end));
  }
}

/** Throws a SyntaxError when `options.regex` is set and the pattern is invalid. */
export function createLineMatcher(term: string, options: MatcherOptions = {}): LineMatcher {
  const flags = options.caseSensitive ? "" : "i";
  if (options.regex) return new RegexMatcher(new RegExp(term, flags));
  // Case-insensitive matching of non-ASCII text follows JS case mapping rules, so leave it to the RegExp engine.
  if (options.caseSensitive || /^[\x00-\x7f]*$/.test(term)) {
    return new SubstringMatcher(term, !options.caseSensitive);
  }
  return new RegexMatcher(new RegExp(escapeRegex(term), flags));
}
