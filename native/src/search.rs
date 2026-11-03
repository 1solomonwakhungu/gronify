//! Literal search over complete emitted assignments, excluding the terminating LF.
use crate::{Input, Result, flatten_lines};
use std::io::{self, BufWriter, Read, Write};

struct Matcher {
    needle: Vec<u8>,
    shift: [usize; 256],
    insensitive: bool,
}
impl Matcher {
    fn new(term: &str, sensitive: bool) -> Result<Self> {
        if !sensitive && !term.is_ascii() {
            return Err("non-ASCII case-insensitive search is unsupported; use --case-sensitive (JavaScript legacy Unicode case mapping is not implemented)".into());
        }
        let needle = if sensitive {
            term.as_bytes().to_vec()
        } else {
            term.to_ascii_lowercase().into_bytes()
        };
        let mut shift = [needle.len().max(1); 256];
        for (i, &b) in needle
            .iter()
            .take(needle.len().saturating_sub(1))
            .enumerate()
        {
            shift[b as usize] = needle.len() - 1 - i;
        }
        Ok(Self {
            needle,
            shift,
            insensitive: !sensitive,
        })
    }
    fn accepts(&self, line: &[u8]) -> bool {
        let n = self.needle.len();
        if n == 0 {
            return true;
        }
        let fold = |b: u8| {
            if self.insensitive {
                b.to_ascii_lowercase()
            } else {
                b
            }
        };
        let mut end = n - 1;
        while end < line.len() {
            let last = fold(line[end]);
            if last == self.needle[n - 1]
                && (0..n - 1)
                    .rev()
                    .all(|i| fold(line[end + 1 - n + i]) == self.needle[i])
            {
                return true;
            }
            end = match end.checked_add(self.shift[last as usize]) {
                Some(next) => next,
                None => return false,
            };
        }
        false
    }
}

struct Sink<W> {
    out: W,
    matcher: Matcher,
    line: Vec<u8>,
    matched: u64,
    cap: u64,
    count: bool,
}
impl<W: Write> Sink<W> {
    fn emit(&mut self, path: &[u8], token: &[u8]) -> Result<bool> {
        self.line.clear();
        self.line.extend_from_slice(path);
        self.line.extend_from_slice(b" = ");
        self.line.extend_from_slice(token);
        if !self.matcher.accepts(&self.line) {
            return Ok(false);
        }
        self.matched += 1;
        if !self.count {
            self.out
                .write_all(&self.line)
                .and_then(|_| self.out.write_all(b"\n"))
                .map_err(crate::cli::Error::Output)?;
        }
        Ok(self.matched == self.cap)
    }
}

pub(super) fn run(args: Vec<String>) -> Result<i32> {
    let mut sensitive = false;
    let mut count = false;
    let mut exit_status = false;
    let mut cap = u64::MAX;
    let mut chunk = 65536;
    let mut positional = Vec::new();
    let mut options = true;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        if !options {
            positional.push(arg);
            continue;
        }
        match arg.as_str() {
            "-h" | "--help" => return crate::cli::info("search", false).map(|()| 0),
            "--version" => return crate::cli::info("search", true).map(|()| 0),
            "--" => options = false,
            "-c" | "--case-sensitive" => sensitive = true,
            "--count" => count = true,
            "--exit-status" => exit_status = true,
            "-m" | "--max-count" => {
                let value = args.next().ok_or("missing max-count")?;
                cap = value
                    .parse()
                    .map_err(|_| "max-count must be a positive safe integer")?;
                if value.starts_with('0')
                    || !value.bytes().all(|b| b.is_ascii_digit())
                    || cap == 0
                    || cap > 9_007_199_254_740_991
                {
                    return Err("max-count must be a positive safe integer".into());
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
            s if s.starts_with('-') && s != "-" => {
                return Err(format!("unsupported search option: {s}").into());
            }
            _ => positional.push(arg),
        }
    }
    let (file, term) = match positional.as_slice() {
        [term] => (None, term),
        [file, term] => (Some(file.as_str()), term),
        _ => return Err("usage: gronify-native search [--case-sensitive] [--count] [--max-count N] [--exit-status] [file] term".into()),
    };
    let matcher = Matcher::new(term, sensitive)?;
    let source: Box<dyn Read> = match file {
        None | Some("-") => Box::new(io::stdin().lock()),
        Some(path) => Box::new(std::fs::File::open(path).map_err(|e| e.to_string())?),
    };
    let mut input = Input::new(source, chunk);
    let mut sink = Sink {
        out: BufWriter::with_capacity(65536, io::stdout().lock()),
        matcher,
        line: Vec::new(),
        matched: 0,
        cap,
        count,
    };
    let stopped = flatten_lines(&mut input, |path, token| sink.emit(path, token))
        .map_err(|e| e.context(|e| format!("{e} at byte offset {}", input.offset)))?;
    if count {
        writeln!(sink.out, "{}", sink.matched).map_err(crate::cli::Error::Output)?;
    }
    sink.out.flush().map_err(crate::cli::Error::Output)?;
    if stopped {
        eprintln!(
            "Stopped at {} matches (--max-count); there may be more",
            sink.matched
        );
    }
    Ok(i32::from(exit_status && sink.matched == 0))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn emitted_boundary_and_newline() {
        let mut sink = Sink {
            out: Vec::new(),
            matcher: Matcher::new("x = \"a", true).unwrap(),
            line: Vec::new(),
            matched: 0,
            cap: 1,
            count: false,
        };
        assert!(sink.emit(b"json.x", b"\"abc\"").unwrap());
        assert_eq!(sink.out, b"json.x = \"abc\"\n");
        assert!(!Matcher::new("\n", true).unwrap().accepts(b"json.x = 1"));
    }
    #[test]
    fn sink_failure_stops_parser() {
        struct Fail;
        impl Write for Fail {
            fn write(&mut self, _: &[u8]) -> io::Result<usize> {
                Err(io::Error::other("destination failed"))
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }
        let mut sink = Sink {
            out: Fail,
            matcher: Matcher::new("", true).unwrap(),
            line: Vec::new(),
            matched: 0,
            cap: 1,
            count: false,
        };
        let mut input = Input::new(&b"[invalid tail"[..], 1);
        assert!(
            flatten_lines(&mut input, |p, t| sink.emit(p, t))
                .unwrap_err()
                .to_string()
                .contains("destination failed")
        );
        assert_eq!(input.offset, 1);
    }
    #[test]
    fn cap_stops_before_invalid_tail() {
        let mut sink = Sink {
            out: Vec::new(),
            matcher: Matcher::new("target", false).unwrap(),
            line: Vec::new(),
            matched: 0,
            cap: 1,
            count: true,
        };
        let mut input = Input::new(&b"[0,\"TARGET\",invalid"[..], 1);
        assert!(flatten_lines(&mut input, |p, t| sink.emit(p, t)).unwrap());
        assert_eq!(sink.matched, 1);
        assert!(sink.out.is_empty());
    }
}

#[cfg(test)]
mod output_boundary_tests {
    use super::*;
    #[test]
    fn sink_preserves_output_error_kind() {
        for kind in [
            io::ErrorKind::BrokenPipe,
            io::ErrorKind::NotConnected,
            io::ErrorKind::Other,
        ] {
            struct Fail(io::ErrorKind);
            impl Write for Fail {
                fn write(&mut self, _: &[u8]) -> io::Result<usize> {
                    Err(self.0.into())
                }
                fn flush(&mut self) -> io::Result<()> {
                    Ok(())
                }
            }
            let mut sink = Sink {
                out: Fail(kind),
                matcher: Matcher::new("", true).unwrap(),
                line: Vec::new(),
                matched: 0,
                cap: u64::MAX,
                count: false,
            };
            let mut input = Input::new(&b"[invalid tail"[..], 1);
            let err = flatten_lines(&mut input, |p, t| sink.emit(p, t)).unwrap_err();
            assert!(matches!(err, crate::cli::Error::Output(e) if e.kind() == kind));
            assert_eq!(input.offset, 1);
        }
    }
}
