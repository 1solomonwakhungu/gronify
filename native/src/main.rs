//! Experimental, document-order flattener. No tree and no recursive parsing.
mod unflatten;
use std::io::{self, BufWriter, Read, Write};

mod cli;
mod search;

const TOKEN_MAX: usize = 64 * 1024 * 1024;
const PATH_MAX: usize = 16 * 1024 * 1024;
const DEPTH_MAX: usize = 100_000;
type Result<T> = std::result::Result<T, cli::Error>;

struct Input<R> {
    source: R,
    buf: Vec<u8>,
    pos: usize,
    end: usize,
    offset: usize,
}
impl<R: Read> Input<R> {
    fn new(source: R, chunk: usize) -> Self {
        Self {
            source,
            buf: vec![0; chunk],
            pos: 0,
            end: 0,
            offset: 0,
        }
    }
    #[inline]
    fn peek(&mut self) -> Result<Option<u8>> {
        if self.pos == self.end {
            self.refill()?;
            if self.end == 0 {
                return Ok(None);
            }
        }
        Ok(Some(self.buf[self.pos]))
    }
    // Keep read/refill handling out of the per-byte buffered lookup.
    #[inline(never)]
    fn refill(&mut self) -> Result<()> {
        self.end = loop {
            match self.source.read(&mut self.buf) {
                Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                result => break result.map_err(|e| e.to_string())?,
            }
        };
        self.pos = 0;
        Ok(())
    }
    #[inline]
    fn take(&mut self) -> Result<u8> {
        let b = self.peek()?.ok_or("unexpected end of input")?;
        self.pos += 1;
        self.offset += 1;
        Ok(b)
    }
    #[inline]
    fn whitespace(&mut self) -> Result<()> {
        while matches!(self.peek()?, Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.take()?;
        }
        Ok(())
    }
    // Borrow only when a delimiter is already buffered; validate the exact bytes.
    fn bare_token<'a>(&'a mut self, token: &'a mut Vec<u8>) -> Result<&'a [u8]> {
        let buffered = &self.buf[self.pos..self.end];
        // A complete grammar prefix is usable only with a buffered delimiter.
        // Otherwise the original scanner must reject suffixes or refill.
        let length = match buffered.first() {
            Some(b't') if buffered.starts_with(b"true") => Some(4),
            Some(b'f') if buffered.starts_with(b"false") => Some(5),
            Some(b'n') if buffered.starts_with(b"null") => Some(4),
            Some(b'-' | b'0'..=b'9') => number_prefix(buffered),
            _ => None,
        };
        if let Some(len) = length
            && buffered
                .get(len)
                .is_some_and(|c| !(c.is_ascii_alphanumeric() || matches!(c, b'+' | b'-' | b'.')))
        {
            if len > TOKEN_MAX {
                return Err("token exceeds 64 MiB resource limit".into());
            }
            let start = self.pos;
            self.pos += len;
            self.offset += len;
            return Ok(&self.buf[start..self.pos]);
        }
        let start = self.pos;
        let mut end = start;
        while end < self.end {
            let c = self.buf[end];
            if !(c.is_ascii_alphanumeric() || matches!(c, b'+' | b'-' | b'.')) {
                let value = &self.buf[start..end];
                if value.len() > TOKEN_MAX {
                    return Err("token exceeds 64 MiB resource limit".into());
                }
                self.pos = end;
                self.offset += end - start;
                if !matches!(value, b"true" | b"false" | b"null") && !number(value) {
                    return Err("invalid number or literal".into());
                }
                return Ok(&self.buf[start..end]);
            }
            end += 1;
        }
        // A boundary is not a delimiter: keep reading so a split invalid
        // literal cannot be accepted, even when the callback would cap.
        token.clear();
        while let Some(c) = self.peek()? {
            if !(c.is_ascii_alphanumeric() || matches!(c, b'+' | b'-' | b'.')) {
                break;
            }
            if token.len() >= TOKEN_MAX {
                return Err("token exceeds 64 MiB resource limit".into());
            }
            token.push(self.take()?);
        }
        if !matches!(token.as_slice(), b"true" | b"false" | b"null") && !number(token) {
            return Err("invalid number or literal".into());
        }
        Ok(token)
    }
    // Borrow a complete plain ASCII string from the current input buffer.
    // Fragmented, escaped and non-ASCII strings use the normalizing scanner.
    fn string_token<'a>(&'a mut self, token: &'a mut Vec<u8>) -> Result<&'a [u8]> {
        let start = self.pos;
        debug_assert_eq!(self.buf.get(start), Some(&b'"'));
        let mut at = start + 1;
        while self.end.saturating_sub(at) >= 8 {
            let word = u64::from_le_bytes(self.buf[at..at + 8].try_into().unwrap());
            let quote = word ^ 0x2222_2222_2222_2222;
            let slash = word ^ 0x5c5c_5c5c_5c5c_5c5c;
            let marked = (word
                | word.wrapping_sub(0x2020_2020_2020_2020)
                | (quote.wrapping_sub(0x0101_0101_0101_0101) & !quote)
                | (slash.wrapping_sub(0x0101_0101_0101_0101) & !slash))
                & 0x8080_8080_8080_8080;
            if marked != 0 {
                at += (marked.trailing_zeros() / 8) as usize;
                break;
            }
            at += 8;
        }
        while at < self.end {
            let b = self.buf[at];
            if b == b'"' {
                let end = at + 1;
                if end - start > TOKEN_MAX {
                    return Err("token exceeds 64 MiB resource limit".into());
                }
                self.offset += end - start;
                self.pos = end;
                return Ok(&self.buf[start..end]);
            }
            if !(0x20..0x80).contains(&b) || b == b'\\' {
                break;
            }
            at += 1;
        }
        self.string(token)?;
        Ok(token)
    }
    // Keep the normalizing fallback separate from the borrowed fast path.
    #[inline(never)]
    fn string(&mut self, token: &mut Vec<u8>) -> Result<()> {
        token.clear();
        token.push(self.take()?);
        let mut escape = false;
        let mut byte_flags = 0u8;
        let mut has_escape = false;
        loop {
            self.peek()?.ok_or("unexpected end of input")?;
            let start = self.pos;
            let mut closed = false;
            // Skip ordinary ASCII in safe, unaligned eight-byte copies.
            // A possible quote, backslash, control or non-ASCII byte falls
            // back to the unchanged scalar validator for this chunk.
            while !escape && self.end - self.pos >= 8 {
                let word = u64::from_le_bytes(self.buf[self.pos..self.pos + 8].try_into().unwrap());
                let quote = word ^ 0x2222_2222_2222_2222;
                let slash = word ^ 0x5c5c_5c5c_5c5c_5c5c;
                let special = word
                    | word.wrapping_sub(0x2020_2020_2020_2020)
                    | (quote.wrapping_sub(0x0101_0101_0101_0101) & !quote)
                    | (slash.wrapping_sub(0x0101_0101_0101_0101) & !slash);
                // Subtraction may mark later lanes through borrow, but the
                // first marked little-endian lane is always a real stop.
                let marked = special & 0x8080_8080_8080_8080;
                if marked != 0 {
                    self.pos += (marked.trailing_zeros() / 8) as usize;
                    break;
                }
                self.pos += 8;
            }
            while self.pos < self.end {
                let b = self.buf[self.pos];
                self.pos += 1;
                if b < 0x20 {
                    return Err("unescaped control in string".into());
                }
                byte_flags |= b;
                if escape {
                    escape = false;
                } else if b == b'\\' {
                    escape = true;
                    has_escape = true;
                } else if b == b'"' {
                    closed = true;
                    break;
                }
            }
            let length = self.pos - start;
            self.offset += length;
            if token.len() + length > TOKEN_MAX {
                return Err("token exceeds 64 MiB resource limit".into());
            }
            token.extend_from_slice(&self.buf[start..self.pos]);
            if closed {
                break;
            }
        }
        // Skipped words contain only plain ASCII. Scalar bytes contribute
        // their high bit, and every escape forces full normalization.
        if byte_flags < 0x80 && !has_escape {
            Ok(())
        } else {
            normalize(token)
        }
    }
}

// JSON.stringify-compatible normalization. Escaped lone UTF-16 surrogates are legal JSON.
fn normalize(token: &mut Vec<u8>) -> Result<()> {
    let text = std::str::from_utf8(token).map_err(|_| "invalid UTF-8 in string")?;
    if !token.contains(&b'\\') {
        return Ok(());
    }
    let mut units = Vec::<u16>::new();
    let mut chars = text[1..text.len() - 1].chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            units.extend_from_slice(c.encode_utf16(&mut [0; 2]));
            continue;
        }
        let c = chars.next().ok_or("incomplete escape")?;
        units.push(match c {
            '"' => 34,
            '\\' => 92,
            '/' => 47,
            'b' => 8,
            'f' => 12,
            'n' => 10,
            'r' => 13,
            't' => 9,
            'u' => {
                let mut n = 0u16;
                for _ in 0..4 {
                    let h = chars
                        .next()
                        .and_then(|c| c.to_digit(16))
                        .ok_or("invalid Unicode escape")?;
                    n = n * 16 + h as u16;
                }
                n
            }
            _ => return Err("invalid string escape".into()),
        });
    }
    token.clear();
    token.push(b'"');
    for value in char::decode_utf16(units) {
        match value {
            Err(e) => unicode_escape(token, e.unpaired_surrogate()),
            Ok(c) => match c {
                '"' => token.extend_from_slice(b"\\\""),
                '\\' => token.extend_from_slice(b"\\\\"),
                '\u{8}' => token.extend_from_slice(b"\\b"),
                '\u{c}' => token.extend_from_slice(b"\\f"),
                '\n' => token.extend_from_slice(b"\\n"),
                '\r' => token.extend_from_slice(b"\\r"),
                '\t' => token.extend_from_slice(b"\\t"),
                c if c < '\u{20}' => unicode_escape(token, c as u16),
                c => token.extend_from_slice(c.encode_utf8(&mut [0; 4]).as_bytes()),
            },
        }
    }
    token.push(b'"');
    Ok(())
}
fn unicode_escape(out: &mut Vec<u8>, n: u16) {
    out.extend_from_slice(b"\\u");
    for shift in [12, 8, 4, 0] {
        out.push(b"0123456789abcdef"[((n >> shift) & 15) as usize]);
    }
}
fn number(s: &[u8]) -> bool {
    number_prefix(s) == Some(s.len())
}
#[inline]
fn number_prefix(s: &[u8]) -> Option<usize> {
    let mut i = usize::from(s.first() == Some(&b'-'));
    if s.get(i) == Some(&b'0') {
        i += 1;
    } else {
        let start = i;
        while s.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        if i == start {
            return None;
        }
    }
    if s.get(i) == Some(&b'.') {
        i += 1;
        let start = i;
        while s.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        if i == start {
            return None;
        }
    }
    if matches!(s.get(i), Some(b'e' | b'E')) {
        i += 1;
        if matches!(s.get(i), Some(b'+' | b'-')) {
            i += 1;
        }
        let start = i;
        while s.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        if i == start {
            return None;
        }
    }
    Some(i)
}
fn identifier(s: &[u8]) -> bool {
    let start = |b: u8| b.is_ascii_alphabetic() || b == b'_' || b == b'$';
    !s.is_empty() && start(s[0]) && s.iter().all(|&b| start(b) || b.is_ascii_digit())
}
#[derive(Clone, Copy)]
enum State {
    ArrayFirst,
    ArrayValue,
    ArrayNext,
    ObjectFirst,
    ObjectKey,
    ObjectNext,
}
struct Frame {
    state: State,
    base: usize,
    index: u64,
}

fn flatten<R: Read, W: Write>(input: &mut Input<R>, out: &mut W, limit: u64) -> Result<bool> {
    let mut lines = 0;
    flatten_lines(input, |path, token| {
        out.write_all(path)
            .and_then(|_| out.write_all(b" = "))
            .and_then(|_| out.write_all(token))
            .and_then(|_| out.write_all(b"\n"))
            .map_err(cli::Error::Output)?;
        lines += 1;
        Ok(lines == limit)
    })
}

// The sink sees validated, normalized assignment parts and can stop before the next read.
fn flatten_lines<R: Read>(
    input: &mut Input<R>,
    mut emit: impl FnMut(&[u8], &[u8]) -> Result<bool>,
) -> Result<bool> {
    let mut stack = Vec::<Frame>::new();
    let mut path = b"json".to_vec();
    let mut token = Vec::new();
    let mut root_started = false;
    loop {
        input.whitespace()?;
        if let Some(frame) = stack.last_mut() {
            path.truncate(frame.base);
            match frame.state {
                State::ArrayNext | State::ObjectNext => {
                    let close = if matches!(frame.state, State::ArrayNext) {
                        b']'
                    } else {
                        b'}'
                    };
                    let b = input.take()?;
                    if b == close {
                        stack.pop();
                        continue;
                    }
                    if b != b',' {
                        return Err("expected comma or closing bracket".into());
                    }
                    frame.state = if close == b']' {
                        State::ArrayValue
                    } else {
                        State::ObjectKey
                    };
                    continue;
                }
                State::ArrayFirst | State::ObjectFirst => {
                    let close = if matches!(frame.state, State::ArrayFirst) {
                        b']'
                    } else {
                        b'}'
                    };
                    if input.peek()? == Some(close) {
                        input.take()?;
                        stack.pop();
                        continue;
                    }
                }
                _ => {}
            }
            match frame.state {
                State::ObjectFirst | State::ObjectKey => {
                    if input.peek()? != Some(b'"') {
                        return Err("expected object key".into());
                    }
                    let key_token = input.string_token(&mut token)?;
                    let key = &key_token[1..key_token.len() - 1];
                    let dotted = identifier(key);
                    let added = if dotted {
                        key.len() + 1
                    } else {
                        key_token.len() + 2
                    };
                    if path.len() + added > PATH_MAX {
                        return Err("path exceeds 16 MiB resource limit".into());
                    }
                    if dotted {
                        path.push(b'.');
                        path.extend_from_slice(key);
                    } else {
                        path.push(b'[');
                        path.extend_from_slice(key_token);
                        path.push(b']');
                    }
                    input.whitespace()?;
                    if input.take()? != b':' {
                        return Err("expected colon".into());
                    }
                    input.whitespace()?;
                    frame.state = State::ObjectNext;
                }
                State::ArrayFirst | State::ArrayValue => {
                    if path.len() + 22 > PATH_MAX {
                        return Err("path exceeds 16 MiB resource limit".into());
                    }
                    path.push(b'[');
                    let mut digits = [0u8; 20];
                    let mut at = digits.len();
                    let mut index = frame.index;
                    loop {
                        at -= 1;
                        digits[at] = b'0' + (index % 10) as u8;
                        index /= 10;
                        if index == 0 {
                            break;
                        }
                    }
                    path.extend_from_slice(&digits[at..]);
                    path.push(b']');
                    frame.index = frame.index.checked_add(1).ok_or("array index overflow")?;
                    frame.state = State::ArrayNext;
                }
                _ => unreachable!(),
            }
        } else if root_started {
            if input.peek()?.is_some() {
                return Err("trailing input after root value".into());
            }
            return Ok(false);
        }
        let b = input.peek()?.ok_or("expected a value")?;
        token.clear();
        let container = match b {
            b'{' | b'[' => {
                if stack.len() >= DEPTH_MAX {
                    return Err("depth exceeds 100000 resource limit".into());
                }
                input.take()?;
                token.extend_from_slice(if b == b'{' { b"{}" } else { b"[]" });
                Some(if b == b'{' {
                    State::ObjectFirst
                } else {
                    State::ArrayFirst
                })
            }
            b'"' => {
                let value = input.string_token(&mut token)?;
                root_started = true;
                if emit(&path, value)? {
                    return Ok(true);
                }
                continue;
            }
            b'-' | b'0'..=b'9' | b't' | b'f' | b'n' => {
                let value = input.bare_token(&mut token)?;
                root_started = true;
                if emit(&path, value)? {
                    return Ok(true);
                }
                continue;
            }
            _ => return Err("expected a value".into()),
        };
        root_started = true;
        if emit(&path, &token)? {
            return Ok(true);
        }
        if let Some(state) = container {
            stack.push(Frame {
                state,
                base: path.len(),
                index: 0,
            });
        }
    }
}

fn run() -> Result<()> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some("flatten") {
        return Err("usage: gronify-native flatten [--limit N] [--chunk-size N] [file|-]".into());
    }
    let mut limit = u64::MAX;
    let mut chunk = 64 * 1024;
    let mut file = None;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => return cli::info("flatten", false),
            "--version" => return cli::info("flatten", true),
            "--limit" => {
                let value = args.next().ok_or("missing limit")?;
                if !value.bytes().all(|b| b.is_ascii_digit()) {
                    return Err("limit must be a positive integer".into());
                }
                limit = value
                    .parse()
                    .map_err(|_| "limit must be a positive integer")?;
                if limit == 0 {
                    return Err("limit must be positive".into());
                }
            }
            "--chunk-size" => {
                chunk = args
                    .next()
                    .ok_or("missing chunk size")?
                    .parse()
                    .map_err(|_| "invalid chunk size")?;
                if !(1..=1024 * 1024).contains(&chunk) {
                    return Err("chunk size must be 1..1048576".into());
                }
            }
            "-" => {
                if file.replace(arg).is_some() {
                    return Err("only one input allowed".into());
                }
            }
            s if s.starts_with('-') => return Err(format!("unsupported option: {s}").into()),
            _ => {
                if file.replace(arg).is_some() {
                    return Err("only one input allowed".into());
                }
            }
        }
    }
    let source: Box<dyn Read> = match file.as_deref() {
        None | Some("-") => Box::new(io::stdin().lock()),
        Some(path) => Box::new(std::fs::File::open(path).map_err(|e| e.to_string())?),
    };
    let mut input = Input::new(source, chunk);
    let mut out = BufWriter::with_capacity(64 * 1024, io::stdout().lock());
    let capped = flatten(&mut input, &mut out, limit)
        .map_err(|e| e.context(|e| format!("{e} at byte offset {}", input.offset)))?;
    out.flush().map_err(cli::Error::Output)?;
    if capped {
        eprintln!("Stopped after {limit} lines (--limit); there may be more");
    }
    Ok(())
}
fn main() {
    cli::main();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refill_retries_interruptions_and_preserves_read_errors() {
        struct InterruptedReader<'a> {
            bytes: &'a [u8],
            interrupt: bool,
            fail_at_end: bool,
        }
        impl Read for InterruptedReader<'_> {
            fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
                self.interrupt = !self.interrupt;
                if self.interrupt {
                    return Err(io::ErrorKind::Interrupted.into());
                }
                if self.bytes.is_empty() {
                    return if self.fail_at_end {
                        Err(io::Error::other("injected read error"))
                    } else {
                        Ok(0)
                    };
                }
                out[0] = self.bytes[0];
                self.bytes = &self.bytes[1..];
                Ok(1)
            }
        }
        let source = br#" {"x":[-0,1.20e+99,true,"\u0061"]} "#;
        let mut expected = Vec::new();
        flatten(&mut Input::new(&source[..], 64), &mut expected, u64::MAX).unwrap();
        for fail_at_end in [false, true] {
            let reader = InterruptedReader {
                bytes: source,
                interrupt: false,
                fail_at_end,
            };
            let mut input = Input::new(reader, 7);
            let mut output = Vec::new();
            let result = flatten(&mut input, &mut output, u64::MAX);
            if fail_at_end {
                assert_eq!(result.unwrap_err(), "injected read error");
            } else {
                assert!(!result.unwrap());
            }
            assert_eq!(output, expected);
            assert_eq!(input.offset, source.len());
        }
    }

    #[test]
    fn borrowed_and_fragmented_scalars_preserve_bytes() {
        let source = br#"{"plain":"gateway","a b":"x","esc":"\u0061","values":[-0,1.100E+999,123456789012345678901234567890,true,false,null,"tail"]}"#;
        let expected = b"json = {}\njson.plain = \"gateway\"\njson[\"a b\"] = \"x\"\njson.esc = \"a\"\njson.values = []\njson.values[0] = -0\njson.values[1] = 1.100E+999\njson.values[2] = 123456789012345678901234567890\njson.values[3] = true\njson.values[4] = false\njson.values[5] = null\njson.values[6] = \"tail\"\n";
        for chunk in 1..=source.len() + 1 {
            let mut output = Vec::new();
            flatten(&mut Input::new(&source[..], chunk), &mut output, u64::MAX).unwrap();
            assert_eq!(output, expected, "chunk {chunk}");
        }
        // A refill is required before deciding whether a bare root is valid.
        // Neither a token prefix nor --limit may hide a malformed suffix.
        for source in ["truex ", "false0 ", "nullx ", "01 ", "1e+ ", "1.2.3 ", "- "] {
            for chunk in 1..=source.len() + 1 {
                let mut output = Vec::new();
                assert!(
                    flatten(&mut Input::new(source.as_bytes(), chunk), &mut output, 1).is_err()
                );
                assert!(output.is_empty());
            }
        }
    }

    #[test]
    fn borrowed_scalar_callbacks_stop_and_propagate_errors() {
        struct Once(&'static [u8]);
        impl Read for Once {
            fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
                assert!(!self.0.is_empty(), "read after callback stopped");
                let n = self.0.len();
                buffer[..n].copy_from_slice(self.0);
                self.0 = &[];
                Ok(n)
            }
        }
        for source in [&b"\"gateway\""[..], &b"1.100E+999 "[..], &b"true "[..]] {
            let mut input = Input::new(Once(source), 64);
            assert!(
                flatten_lines(&mut input, |path, value| {
                    assert_eq!(path, b"json");
                    assert_eq!(value, source.strip_suffix(b" ").unwrap_or(source));
                    Ok(true)
                })
                .unwrap()
            );
            let mut calls = 0;
            let error = flatten_lines(&mut Input::new(Once(source), 64), |_, _| {
                calls += 1;
                Err("callback injected".into())
            })
            .unwrap_err();
            assert_eq!(error.to_string(), "callback injected");
            assert_eq!(calls, 1);
        }
        struct BadTail(bool);
        impl Read for BadTail {
            fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
                if self.0 {
                    return Err(io::Error::other("tail read injected"));
                }
                self.0 = true;
                buffer[..4].copy_from_slice(b"true");
                Ok(4)
            }
        }
        assert_eq!(
            flatten_lines(&mut Input::new(BadTail(false), 4), |_, _| {
                panic!("must validate the boundary before emitting")
            })
            .unwrap_err()
            .to_string(),
            "tail read injected"
        );
    }

    #[test]
    fn root_completion_is_independent_of_assignment_count() {
        for document in ["0", "[]", "{}", "[0,1,2]", "{\"a\":[0,1]}"] {
            for chunk in [1, 7, 65536] {
                let mut seen = 0u64;
                assert!(
                    !flatten_lines(&mut Input::new(document.as_bytes(), chunk), |_, _| {
                        seen += 1;
                        Ok(false)
                    })
                    .unwrap()
                );
                assert!(seen > 0);
                let trailing = format!("{document} 1");
                assert!(
                    flatten_lines(&mut Input::new(trailing.as_bytes(), chunk), |_, _| Ok(
                        false
                    ))
                    .unwrap_err()
                    .to_string()
                    .contains("trailing input")
                );
            }
        }
    }

    #[test]
    fn fragmented_unicode_and_numbers() {
        let source = br#"{"\u0061":[-0,1.10,1e+999,"\ud800","\ud83d\ude00","\u0000\/"],"":true}"#;
        let expected = "json = {}\njson.a = []\njson.a[0] = -0\njson.a[1] = 1.10\njson.a[2] = 1e+999\njson.a[3] = \"\\ud800\"\njson.a[4] = \"😀\"\njson.a[5] = \"\\u0000/\"\njson[\"\"] = true\n";
        for chunk in 1..=source.len() {
            let mut out = Vec::new();
            flatten(&mut Input::new(&source[..], chunk), &mut out, u64::MAX).unwrap();
            assert_eq!(out, expected.as_bytes());
        }
    }
    #[test]
    fn malformed() {
        for source in [
            "",
            "[1,]",
            "{\"a\":1,}",
            "01",
            "1.",
            "1e",
            "--1",
            "true false",
            "[}",
            "\"\\x\"",
            "\"\\u12zz\"",
            "[\u{b}]",
            "[1",
            "{\"a\" 1}",
        ] {
            for chunk in [1, 65536] {
                assert!(
                    flatten(
                        &mut Input::new(source.as_bytes(), chunk),
                        &mut io::sink(),
                        u64::MAX
                    )
                    .is_err(),
                    "{source:?}"
                );
            }
        }
        assert!(
            flatten(
                &mut Input::new(&b"\"\xc0\xaf\""[..], 1),
                &mut io::sink(),
                u64::MAX
            )
            .is_err()
        );
    }
    #[test]
    fn word_scan_all_bytes_and_lanes() {
        // Every possible byte at and around each eight-byte lane. A quote
        // closes early (leaving invalid trailing text); a slash escapes 'a'.
        for prefix in 0..17 {
            for byte in 0..=255u8 {
                let mut source = vec![b'"'];
                source.extend(vec![b'a'; prefix]);
                source.push(byte);
                source.extend_from_slice(b"aaaaaaaaaaaaaaaa\"");
                let valid = (0x20..0x80).contains(&byte) && !matches!(byte, b'"' | b'\\');
                for chunk in [1, 7, 8, 9, 15, 16, 17, 64] {
                    let mut out = Vec::new();
                    let result = flatten(&mut Input::new(&source[..], chunk), &mut out, u64::MAX);
                    assert_eq!(
                        result.is_ok(),
                        valid,
                        "byte {byte}, prefix {prefix}, chunk {chunk}"
                    );
                    if valid {
                        let mut expected = b"json = ".to_vec();
                        expected.extend_from_slice(&source);
                        expected.push(b'\n');
                        assert_eq!(out, expected);
                    }
                }
            }
        }
    }
    #[test]
    fn word_scan_unicode_escapes_and_closing_quotes() {
        for prefix in 0..17 {
            for (raw, normalized) in [
                ("é漢😀", "é漢😀"),
                (r"\u0061", "a"),
                (r"\ud83d\ude00", "😀"),
                (r"\ud800", r"\ud800"),
                (r"\/", "/"),
                (r#"\"\\\n"#, r#"\"\\\n"#),
            ] {
                let pad = "a".repeat(prefix);
                let source = format!(r#"["{pad}{raw}aaaaaaaa","{pad}",1.10,-0,1e+999]"#);
                let expected = format!(
                    "json = []\njson[0] = \"{pad}{normalized}aaaaaaaa\"\njson[1] = \"{pad}\"\njson[2] = 1.10\njson[3] = -0\njson[4] = 1e+999\n"
                );
                for chunk in 1..=source.len() {
                    let mut out = Vec::new();
                    flatten(
                        &mut Input::new(source.as_bytes(), chunk),
                        &mut out,
                        u64::MAX,
                    )
                    .unwrap();
                    assert_eq!(out, expected.as_bytes(), "prefix {prefix}, chunk {chunk}");
                }
            }
        }
    }
    #[test]
    fn depth_50000() {
        let source = format!("{}0{}", "[".repeat(50_000), "]".repeat(50_000));
        assert!(
            !flatten(
                &mut Input::new(source.as_bytes(), 7),
                &mut io::sink(),
                u64::MAX
            )
            .unwrap()
        );
    }
    #[test]
    fn cap_does_not_read_tail() {
        struct FailAfterOpen(bool);
        impl Read for FailAfterOpen {
            fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
                if self.0 {
                    panic!("read after cap")
                }
                self.0 = true;
                b[0] = b'[';
                Ok(1)
            }
        }
        assert!(flatten(&mut Input::new(FailAfterOpen(false), 1), &mut io::sink(), 1).unwrap());
    }
}

#[cfg(test)]
#[path = "boundary_tests.rs"]
mod boundary_tests;
