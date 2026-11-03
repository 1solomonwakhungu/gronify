//! Ordered gron streaming; values never pass through floating point or a JSON tree.
use crate::{Input, Result, identifier, number};
use std::io::{self, BufRead, BufReader, BufWriter, Read, Write};

const LINE_MAX: usize = 64 * 1024 * 1024;
const PATH_MAX: usize = 16 * 1024 * 1024;
const DEPTH_MAX: usize = 100_000;
const GAP_MAX: u64 = 1_000_000;
const ORDER: &str =
    "unsupported out-of-order/replacement input; use Node gronify unflatten for tree fallback";

#[derive(Debug, PartialEq, Eq)]
enum Segment {
    Key(Vec<u8>), // canonical quoted JSON, including lone surrogate escapes
    Index(u64),
}
struct Frame {
    entry: Option<Segment>,
    array: bool,
    count: u64,
}
fn trim(s: &[u8]) -> &[u8] {
    s.trim_ascii()
}
fn string(s: &[u8]) -> Result<(Vec<u8>, usize)> {
    let mut input = Input::new(s, 4096);
    let mut token = Vec::new();
    input.string(&mut token)?;
    Ok((token, input.offset))
}
fn parse(line: &[u8]) -> Result<Option<(Vec<Segment>, Vec<u8>)>> {
    let mut s = trim(line);
    if let Some(rest) = s.strip_suffix(b";") {
        s = trim(rest);
    }
    if s.is_empty() {
        return Ok(None);
    }
    s = s.strip_prefix(b"json").ok_or("expected gron assignment")?;
    let original = s.len();
    let mut path = Vec::new();
    loop {
        match s.first() {
            Some(b'.') => {
                let end = s[1..]
                    .iter()
                    .position(|b| !b.is_ascii_alphanumeric() && !matches!(b, b'_' | b'$'))
                    .map_or(s.len(), |i| i + 1);
                let key = &s[1..end];
                if !identifier(key) {
                    return Err("invalid dotted identifier".into());
                }
                let mut quoted = vec![b'"'];
                quoted.extend_from_slice(key);
                quoted.push(b'"');
                path.push(Segment::Key(quoted));
                s = &s[end..];
            }
            Some(b'[') => {
                s = s[1..].trim_ascii_start();
                let segment = if s.first() == Some(&b'"') {
                    let (key, end) = string(s)?;
                    s = &s[end..];
                    Segment::Key(key)
                } else {
                    let end = s
                        .iter()
                        .position(|b| !b.is_ascii_digit())
                        .unwrap_or(s.len());
                    let digits = &s[..end];
                    if digits.is_empty() || (digits.len() > 1 && digits[0] == b'0') {
                        return Err("invalid numeric index".into());
                    }
                    let index: u64 = std::str::from_utf8(digits)
                        .unwrap()
                        .parse()
                        .map_err(|_| "array index too large")?;
                    if index > 4_294_967_294 {
                        return Err("array index too large".into());
                    }
                    s = &s[end..];
                    Segment::Index(index)
                };
                s = s
                    .trim_ascii_start()
                    .strip_prefix(b"]")
                    .ok_or("expected closing bracket")?;
                path.push(segment);
            }
            _ => break,
        }
        if path.len() > DEPTH_MAX || original - s.len() > PATH_MAX {
            return Err("path resource limit (16 MiB / 100000 segments)".into());
        }
    }
    s = trim(s)
        .strip_prefix(b"=")
        .ok_or("expected assignment equals")?;
    s = trim(s);
    let value = if s.first() == Some(&b'"') {
        let (value, end) = string(s)?;
        if end != s.len() {
            return Err("trailing input after string".into());
        }
        value
    } else if matches!(s.first(), Some(b'{' | b'[')) {
        let close = if s[0] == b'{' { b'}' } else { b']' };
        if s[1..].iter().any(|b| matches!(b, 0x0b | 0x0c)) || s[1..].trim_ascii() != [close] {
            return Err(
                "unsupported inline compound value; flatten containers into separate assignments"
                    .into(),
            );
        }
        vec![s[0], close]
    } else {
        if s.is_empty() || !(matches!(s, b"true" | b"false" | b"null") || number(s)) {
            return Err("invalid JSON scalar".into());
        }
        s.to_vec()
    };
    Ok(Some((path, value)))
}
fn write(out: &mut impl Write, bytes: &[u8]) -> Result<()> {
    out.write_all(bytes).map_err(|e| e.to_string())
}
fn close(stack: &mut Vec<Frame>, out: &mut impl Write) -> Result<()> {
    write(
        out,
        if stack.pop().unwrap().array {
            b"]"
        } else {
            b"}"
        },
    )
}
fn assignment(
    stack: &mut Vec<Frame>,
    seen: &mut bool,
    line: &[u8],
    out: &mut impl Write,
) -> Result<()> {
    let Some((mut path, value)) = parse(line)? else {
        return Ok(());
    };
    if path.is_empty() {
        if *seen {
            return Err(ORDER.into());
        }
        *seen = true;
    } else {
        if !*seen {
            return Err("root must be assigned before children".into());
        }
        if stack.len() < path.len() {
            return Err(ORDER.into());
        }
        for (i, segment) in path[..path.len() - 1].iter().enumerate() {
            if stack[i + 1].entry.as_ref() != Some(segment) {
                return Err(ORDER.into());
            }
        }
        while stack.len() > path.len() {
            close(stack, out)?;
        }
        let parent = stack.last_mut().unwrap();
        match (parent.array, path.last().unwrap()) {
            (true, Segment::Index(index)) => {
                if *index < parent.count {
                    return Err(ORDER.into());
                }
                if index - parent.count > GAP_MAX {
                    return Err("sparse gap exceeds 1000000 slots resource limit".into());
                }
                while parent.count < *index {
                    write(out, if parent.count == 0 { b"null" } else { b",null" })?;
                    parent.count += 1;
                }
                if parent.count > 0 {
                    write(out, b",")?;
                }
            }
            (false, Segment::Key(key)) => {
                if parent.count > 0 {
                    write(out, b",")?;
                }
                write(out, key)?;
                write(out, b":")?;
            }
            _ => return Err("numeric/string segment does not match parent container".into()),
        }
        parent.count += 1;
    }
    if matches!(value.as_slice(), b"{}" | b"[]") {
        if stack.len() >= DEPTH_MAX {
            return Err("container depth exceeds 100000 resource limit".into());
        }
        write(out, &value[..1])?;
        stack.push(Frame {
            entry: path.pop(),
            array: value[0] == b'[',
            count: 0,
        });
    } else {
        write(out, &value)?;
    }
    Ok(())
}
fn convert(mut input: impl BufRead, out: &mut impl Write) -> Result<()> {
    let mut line = Vec::new();
    let mut stack = Vec::new();
    let mut seen = false;
    let mut number = 0;
    loop {
        line.clear();
        // Take caps allocation even when no newline ever arrives.
        let read = input
            .by_ref()
            .take((LINE_MAX + 1) as u64)
            .read_until(b'\n', &mut line)
            .map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        number += 1;
        if line.len() > LINE_MAX {
            return Err(format!("line {number}: exceeds 64 MiB resource limit"));
        }
        assignment(&mut stack, &mut seen, &line, out).map_err(|e| format!("line {number}: {e}"))?;
    }
    if !seen {
        return Err("input contains no gron assignments".into());
    }
    while !stack.is_empty() {
        close(&mut stack, out)?;
    }
    write(out, b"\n")
}
pub fn run(args: Vec<String>) -> Result<()> {
    let mut file = None;
    let mut chunk = 65536;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--chunk-size" => {
                chunk = args
                    .next()
                    .ok_or("missing chunk size")?
                    .parse()
                    .map_err(|_| "invalid chunk size")?;
                if !(1..=1048576).contains(&chunk) {
                    return Err("chunk size must be 1..1048576".into());
                }
            }
            s if s.starts_with('-') && s != "-" => {
                return Err(format!("unsupported unflatten option: {s}"));
            }
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
    let mut out = BufWriter::with_capacity(65536, io::stdout().lock());
    convert(BufReader::with_capacity(chunk, source), &mut out)?;
    out.flush().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn convert_text(s: &[u8], chunk: usize) -> Result<Vec<u8>> {
        let mut out = Vec::new();
        convert(BufReader::with_capacity(chunk, s), &mut out)?;
        Ok(out)
    }
    #[test]
    fn ordered_and_normalized() {
        let s = r#"json = {};
json["\u0061"] = []
json.a[2] = {}
json.a[2]["é.]\"=x"] = 1.230e+999
json.a[3] = -0
json["0"] = "\ud800"
json.z = []
json.empty = {}
json.empty = false
"#;
        let expected = "{\"a\":[null,null,{\"é.]\\\"=x\":1.230e+999},-0],\"0\":\"\\ud800\",\"z\":[],\"empty\":{},\"empty\":false}\n";
        for chunk in [1, 2, 7, 65536] {
            assert_eq!(
                convert_text(s.as_bytes(), chunk).unwrap(),
                expected.as_bytes()
            );
        }
    }
    #[test]
    fn rejects_and_never_panics() {
        for s in [
            "",
            "json =",
            "json = 01",
            "json = +1",
            "json = 1e",
            "json = NaN",
            "json = {\u{b}}",
            "json = [\u{c}]",
            "json = [1]",
            "json = {\"a\":1}",
            "json = \"a\"x",
            "json = \"\\x\"",
            "json = \"\\u12zz\"",
            "json = \"x",
            "json = {}\njson[01] = 1",
            "json = []\njson[4294967295] = 1",
            "json = []\njson[999999999999999999999999] = 1",
            "json = {}\njson[0] = 1",
            "json = []\njson[\"0\"] = 1",
            "json = {}\njson.a.b = 1",
            "json.a = 1",
            "json = {}\njson.a = {}\njson.b = 1\njson.a.x = 2",
            "json = []\njson[1] = 1\njson[0] = 2",
            "json = []\njson[0] = 1\njson[0] = 2",
            "json = 1\njson = 2",
            "json = 1\njson.a = 2",
            "json = []\njson[1000001] = 1",
            "json = {}\njson.1 = 1",
            "json = {}\njson[\"x\" = 1",
            "json = true garbage",
        ] {
            for chunk in [1, 65536] {
                assert!(convert_text(s.as_bytes(), chunk).is_err(), "{s}");
            }
        }
        assert!(convert_text(b"json = \"\xff\"", 1).is_err());
        for byte in 0..=255 {
            let source = [b"json = \"".as_slice(), &[byte], b"\""].concat();
            let _ = convert_text(&source, 1);
        }
    }
    #[test]
    fn limits_and_io() {
        let long = vec![b'x'; LINE_MAX + 1];
        assert!(convert_text(&long, 65536).unwrap_err().contains("64 MiB"));
        let path = format!("json{} = 1", ".a".repeat(DEPTH_MAX + 1));
        assert!(
            convert_text(path.as_bytes(), 65536)
                .unwrap_err()
                .contains("path resource")
        );
        let path = format!("json.{} = 1", "a".repeat(PATH_MAX));
        assert!(
            convert_text(path.as_bytes(), 65536)
                .unwrap_err()
                .contains("path resource")
        );
        let mut sink = io::sink();
        struct Broken;
        impl Read for Broken {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("read failure"))
            }
        }
        assert!(
            convert(BufReader::new(Broken), &mut sink)
                .unwrap_err()
                .contains("read failure")
        );
        struct FailWrite;
        impl Write for FailWrite {
            fn write(&mut self, _: &[u8]) -> io::Result<usize> {
                Err(io::Error::other("write failure"))
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }
        assert!(
            convert(&b"json = 1"[..], &mut FailWrite)
                .unwrap_err()
                .contains("write failure")
        );
    }
}
