//! Experimental, document-order flattener. No tree and no recursive parsing.
mod unflatten;
use std::io::{self, BufWriter, Read, Write};

mod search;

const TOKEN_MAX: usize = 64 * 1024 * 1024;
const PATH_MAX: usize = 16 * 1024 * 1024;
const DEPTH_MAX: usize = 100_000;
type Result<T> = std::result::Result<T, String>;

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
            self.end = loop {
                match self.source.read(&mut self.buf) {
                    Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                    result => break result.map_err(|e| e.to_string())?,
                }
            };
            self.pos = 0;
            if self.end == 0 {
                return Ok(None);
            }
        }
        Ok(Some(self.buf[self.pos]))
    }
    #[inline]
    fn take(&mut self) -> Result<u8> {
        let b = self.peek()?.ok_or("unexpected end of input")?;
        self.pos += 1;
        self.offset += 1;
        Ok(b)
    }
    fn whitespace(&mut self) -> Result<()> {
        while matches!(self.peek()?, Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.take()?;
        }
        Ok(())
    }
    fn string(&mut self, token: &mut Vec<u8>) -> Result<()> {
        token.clear();
        token.push(self.take()?);
        let mut escape = false;
        loop {
            self.peek()?.ok_or("unexpected end of input")?;
            let start = self.pos;
            let mut closed = false;
            while self.pos < self.end {
                let b = self.buf[self.pos];
                self.pos += 1;
                if b < 0x20 {
                    return Err("unescaped control in string".into());
                }
                if escape {
                    escape = false;
                } else if b == b'\\' {
                    escape = true;
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
        normalize(token)
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
    let mut i = usize::from(s.first() == Some(&b'-'));
    if s.get(i) == Some(&b'0') {
        i += 1;
    } else {
        let start = i;
        while s.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        if i == start {
            return false;
        }
    }
    if s.get(i) == Some(&b'.') {
        i += 1;
        let start = i;
        while s.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        if i == start {
            return false;
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
            return false;
        }
    }
    i == s.len()
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
            .map_err(|e| e.to_string())?;
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
                    input.string(&mut token)?;
                    let key = &token[1..token.len() - 1];
                    let dotted = identifier(key);
                    let added = if dotted {
                        key.len() + 1
                    } else {
                        token.len() + 2
                    };
                    if path.len() + added > PATH_MAX {
                        return Err("path exceeds 16 MiB resource limit".into());
                    }
                    if dotted {
                        path.push(b'.');
                        path.extend_from_slice(key);
                    } else {
                        path.push(b'[');
                        path.extend_from_slice(&token);
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
                input.string(&mut token)?;
                None
            }
            b'-' | b'0'..=b'9' | b't' | b'f' | b'n' => {
                while let Some(c) = input.peek()? {
                    if !(c.is_ascii_alphanumeric() || matches!(c, b'+' | b'-' | b'.')) {
                        break;
                    }
                    if token.len() >= TOKEN_MAX {
                        return Err("token exceeds 64 MiB resource limit".into());
                    }
                    token.push(input.take()?);
                }
                if !matches!(token.as_slice(), b"true" | b"false" | b"null") && !number(&token) {
                    return Err("invalid number or literal".into());
                }
                None
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
            s if s.starts_with('-') => return Err(format!("unsupported option: {s}")),
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
        .map_err(|e| format!("{e} at byte offset {}", input.offset))?;
    out.flush().map_err(|e| e.to_string())?;
    if capped {
        eprintln!("Stopped after {limit} lines (--limit); there may be more");
    }
    Ok(())
}
fn main() {
    if std::env::args().nth(1).as_deref() == Some("unflatten") {
        if let Err(e) = unflatten::run(std::env::args().skip(2).collect()) {
            eprintln!("gronify-native: {e}");
            std::process::exit(1);
        }
        return;
    }
    if std::env::args().nth(1).as_deref() == Some("search") {
        let args: Vec<String> = std::env::args().skip(2).collect();
        let errors = if args
            .iter()
            .take_while(|s| s.as_str() != "--")
            .any(|s| s == "--exit-status")
        {
            2
        } else {
            1
        };
        match search::run(args) {
            Ok(code) => std::process::exit(code),
            Err(e) => {
                eprintln!("gronify-native: {e}");
                std::process::exit(errors);
            }
        }
    }
    if let Err(e) = run() {
        eprintln!("gronify-native: {e}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
