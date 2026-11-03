//! Experimental CLI surface and output-only cancellation policy.
use std::fmt;
use std::io::{self, Write};

#[derive(Debug)]
pub(crate) enum Error {
    Message(String),
    Output(io::Error),
}
impl From<String> for Error {
    fn from(message: String) -> Self {
        Self::Message(message)
    }
}
impl From<&str> for Error {
    fn from(message: &str) -> Self {
        Self::Message(message.into())
    }
}
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Message(s) => s.fmt(f),
            Self::Output(e) => e.fmt(f),
        }
    }
}
impl Error {
    pub(crate) fn context(self, context: impl FnOnce(String) -> String) -> Self {
        match self {
            Self::Message(s) => Self::Message(context(s)),
            other => other,
        }
    }
    fn cancelled(&self) -> bool {
        matches!(self, Self::Output(e) if matches!(e.kind(), io::ErrorKind::BrokenPipe | io::ErrorKind::NotConnected))
    }
}

const VERSION: &str = concat!(
    "gronify-native ",
    env!("CARGO_PKG_VERSION"),
    " (experimental)\n"
);
const HELP: &str = "gronify-native (experimental)\n\nUsage: gronify-native <command> [options]\n\nCommands: flatten, search, unflatten\n  -h, --help       Show help (also available after each command)\n  --version        Show the experimental native version\n\nInput defaults to stdin; '-' explicitly selects stdin. Output is stdout.\nThis is a limited experimental subset, separate from the npm CLI.\nNo URL input, sorting, colors, pretty output, or --output files.\nUse <command> --help for supported flags and limits.\n";
const FLATTEN: &str = "Usage: gronify-native flatten [options] [file|-]\n\n  --limit N       Stop after N assignments (positive u64); do not validate tail\n  --chunk-size N  Input buffer bytes, 1..1048576 (default 65536; test control)\n  -h, --help      Show this help\n  --version       Show the experimental native version\n\nExperimental document-order flatten; preserves numeric spelling.\nLimits: 64 MiB token, 16 MiB path, 100000 containers.\nNo sorting, colors, URL input, or --output.\n";
const SEARCH: &str = "Usage: gronify-native search [options] [file|-] term\n\n  -c, --case-sensitive  Match exact UTF-8 bytes (default: ASCII case folding)\n  --count               Print matching assignment count\n  -m, --max-count N      Stop after N matches; positive decimal safe integer\n  --exit-status         0 match, 1 no match, 2 error (otherwise errors exit 1)\n  --chunk-size N        Input buffer bytes, 1..1048576 (default 65536)\n  --                    End options; permits terms beginning with '-'\n  -h, --help            Show this help\n  --version             Show the experimental native version\n\nExperimental literal search over whole normalized assignments, excluding LF.\nOne positional argument reads stdin; two mean file and term.\nNon-ASCII insensitive terms, regex, inversion, sorting and --output unsupported.\nA match cap stops reads without validating the tail. Uses flatten resource limits.\n";
const UNFLATTEN: &str = "Usage: gronify-native unflatten [options] [file|-]\n\n  --chunk-size N  Input buffer bytes, 1..1048576 (default 65536; test control)\n  -h, --help      Show this help\n  --version       Show the experimental native version\n\nExperimental ordered subset: parents precede children; subtrees stay together.\nArray indexes increase; sparse gaps are at most 1000000 slots.\nValues must be scalars or empty container declarations; no tree fallback.\nLimits: 64 MiB line including LF, 16 MiB path, 100000 path segments/containers.\nCompact JSON only; no pretty output, URL input, sorting, or --output.\n";

pub(crate) fn info(command: &str, version: bool) -> crate::Result<()> {
    let text = if version {
        VERSION
    } else {
        match command {
            "flatten" => FLATTEN,
            "search" => SEARCH,
            "unflatten" => UNFLATTEN,
            _ => HELP,
        }
    };
    let mut out = io::stdout().lock();
    out.write_all(text.as_bytes())
        .and_then(|_| out.flush())
        .map_err(Error::Output)
}

fn finish(result: crate::Result<i32>, errors: i32) -> i32 {
    match result {
        Ok(code) => code,
        Err(e) if e.cancelled() => 0,
        Err(e) => {
            eprintln!("gronify-native: {e}");
            errors
        }
    }
}

pub(crate) fn main() {
    let mut args = std::env::args().skip(1);
    let command = args.next();
    let args: Vec<_> = args.collect();
    let errors = if command.as_deref() == Some("search")
        && args
            .iter()
            .take_while(|s| s.as_str() != "--")
            .any(|s| s == "--exit-status")
    {
        2
    } else {
        1
    };
    let result = match command.as_deref() {
        Some("-h" | "--help") => info("", false).map(|()| 0),
        Some("--version") => info("", true).map(|()| 0),
        Some("flatten") => crate::run().map(|()| 0),
        Some("search") => crate::search::run(args),
        Some("unflatten") => crate::unflatten::run(args).map(|()| 0),
        _ => Err("usage: gronify-native <flatten|search|unflatten> [options]; use --help".into()),
    };
    std::process::exit(finish(result, errors));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufWriter, Read};

    struct Fail(io::ErrorKind, usize);
    impl Write for Fail {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            if self.1 == 0 {
                return Err(io::Error::new(self.0, "injected Broken pipe"));
            }
            let n = bytes.len().min(self.1).min(7);
            self.1 -= n;
            Ok(n)
        }
        fn flush(&mut self) -> io::Result<()> {
            Err(self.0.into())
        }
    }

    #[test]
    fn only_structured_output_disconnects_cancel() {
        for kind in [
            io::ErrorKind::BrokenPipe,
            io::ErrorKind::NotConnected,
            io::ErrorKind::PermissionDenied,
            io::ErrorKind::Other,
            io::ErrorKind::WriteZero,
        ] {
            let cancelled = matches!(
                kind,
                io::ErrorKind::BrokenPipe | io::ErrorKind::NotConnected
            );
            for capacity in [1, 65536] {
                for allowance in [0, 3, 70000] {
                    let source = format!("\"{}\"", "x".repeat(131072));
                    let mut out = BufWriter::with_capacity(capacity, Fail(kind, allowance));
                    let result = crate::flatten(
                        &mut crate::Input::new(source.as_bytes(), 7),
                        &mut out,
                        u64::MAX,
                    );
                    let err = result.unwrap_err().context(|s| format!("context: {s}"));
                    assert_eq!(err.cancelled(), cancelled);
                    assert_eq!(finish(Err(err), 2), if cancelled { 0 } else { 2 });
                }
                // Small output fails only when explicitly flushing the final buffer.
                let mut out = BufWriter::with_capacity(65536, Fail(kind, 0));
                crate::flatten(&mut crate::Input::new(&b"0"[..], 1), &mut out, u64::MAX).unwrap();
                let err = out.flush().map_err(Error::Output).unwrap_err();
                assert_eq!(err.cancelled(), cancelled);
            }
            struct BadRead(io::ErrorKind);
            impl Read for BadRead {
                fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                    Err(self.0.into())
                }
            }
            let err = crate::flatten(
                &mut crate::Input::new(BadRead(kind), 1),
                &mut io::sink(),
                u64::MAX,
            )
            .unwrap_err();
            assert!(!err.cancelled(), "input {kind:?} must fail");
        }
        assert!(!Error::from("Broken pipe (os error 32)").cancelled());
        assert_eq!(finish(Ok(1), 2), 1);
    }

    #[test]
    fn output_failure_stops_before_another_read() {
        struct Open(bool);
        impl Read for Open {
            fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> {
                assert!(!self.0, "read after output cancellation");
                self.0 = true;
                bytes[0] = b'[';
                Ok(1)
            }
        }
        let err = crate::flatten(
            &mut crate::Input::new(Open(false), 1),
            &mut Fail(io::ErrorKind::BrokenPipe, 0),
            u64::MAX,
        )
        .unwrap_err();
        assert!(err.cancelled());
    }

    #[test]
    fn platform_enotconn_is_identified() {
        #[cfg(target_os = "linux")]
        let errno = 107;
        #[cfg(target_os = "macos")]
        let errno = 57;
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        assert!(Error::Output(io::Error::from_raw_os_error(errno)).cancelled());
    }
}
