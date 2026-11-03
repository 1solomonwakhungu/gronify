#[cfg(test)]
mod independent {
    use crate::*;
    fn check(data: &[u8]) -> Result<bool> {
        flatten(&mut Input::new(data, 65536), &mut io::sink(), u64::MAX)
    }
    #[test]
    fn token_boundaries() {
        for delta in [-1isize, 0, 1] {
            let n = (TOKEN_MAX as isize + delta) as usize;
            let mut s = vec![b'a'; n];
            s[0] = b'"';
            s[n - 1] = b'"';
            assert_eq!(check(&s).is_ok(), delta <= 0, "string {n}");
            s.fill(b'1');
            assert_eq!(check(&s).is_ok(), delta <= 0, "number {n}");
        }
    }
    #[test]
    fn depth_boundaries() {
        for n in [99999, 100000, 100001] {
            let s = format!("{}0{}", "[".repeat(n), "]".repeat(n));
            assert_eq!(check(s.as_bytes()).is_ok(), n <= DEPTH_MAX, "depth {n}");
        }
    }
    #[test]
    fn path_boundaries() {
        // Nonidentifier key gives exactly the checked bracket path length.
        for delta in [-1isize, 0, 1] {
            let len = (PATH_MAX as isize - 8 + delta) as usize;
            let s = format!("{{\"{}\":0}}", " ".repeat(len));
            assert_eq!(check(s.as_bytes()).is_ok(), delta <= 0, "path {}", len + 8);
        }
        // Dot syntax accepts the exact path limit and rejects one byte beyond.
        for delta in [-1isize, 0, 1] {
            let n = (PATH_MAX as isize - 5 + delta) as usize;
            let s = format!("{{\"{}\":0}}", "a".repeat(n));
            assert_eq!(check(s.as_bytes()).is_ok(), delta <= 0);
        }
    }
    #[test]
    fn cancellation_and_reused_input() {
        struct Guard {
            data: &'static [u8],
            done: bool,
        }
        impl Read for Guard {
            fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
                assert!(!self.done, "read after cap");
                self.done = true;
                b[..self.data.len()].copy_from_slice(self.data);
                Ok(self.data.len())
            }
        }
        for data in [
            &b"["[..],
            &b"\"x\""[..],
            &b"1 "[..],
            &b"true "[..],
            &b"{\"x\":\"y\""[..],
        ] {
            let limit = if data.starts_with(b"{") { 2 } else { 1 };
            assert!(
                flatten(
                    &mut Input::new(Guard { data, done: false }, 64),
                    &mut io::sink(),
                    limit
                )
                .unwrap()
            );
        }
        let s = br#"{"long_key":["abcdefghij",{"x":"\ud800"},"short"],"z":1.200E-300}"#;
        let mut expected = Vec::new();
        flatten(&mut Input::new(&s[..], 65536), &mut expected, u64::MAX).unwrap();
        for n in 1..64 {
            let mut out = Vec::new();
            flatten(&mut Input::new(&s[..], n), &mut out, u64::MAX).unwrap();
            assert_eq!(out, expected);
        }
    }
    #[test]
    fn write_failures_and_interrupted_read() {
        struct Broken(usize);
        impl Write for Broken {
            fn write(&mut self, b: &[u8]) -> io::Result<usize> {
                if self.0 == 0 {
                    return Err(io::Error::new(io::ErrorKind::BrokenPipe, "injected"));
                }
                let n = b.len().min(self.0).min(2);
                self.0 -= n;
                Ok(n)
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }
        for n in 0..20 {
            assert!(
                flatten(
                    &mut Input::new(&b"[1,2,3]"[..], 1),
                    &mut Broken(n),
                    u64::MAX
                )
                .unwrap_err()
                .contains("injected")
            );
        }
        struct Interrupt(bool);
        impl Read for Interrupt {
            fn read(&mut self, b: &mut [u8]) -> io::Result<usize> {
                if !self.0 {
                    self.0 = true;
                    return Err(io::ErrorKind::Interrupted.into());
                }
                b[0] = b'[';
                Ok(1)
            }
        }
        assert!(flatten(&mut Input::new(Interrupt(false), 1), &mut io::sink(), 1).unwrap());
    }
}
#[cfg(test)]
mod extra_independent {
    use crate::*;
    #[test]
    fn array_path_reservation() {
        for delta in [0usize, 1] {
            let s = format!("{{\"{}\":[0]}}", " ".repeat(PATH_MAX - 8 - 22 + delta));
            let r = flatten(
                &mut Input::new(s.as_bytes(), 65536),
                &mut io::sink(),
                u64::MAX,
            );
            assert_eq!(r.is_ok(), delta == 0);
        }
    }
    #[test]
    fn io_failures() {
        struct BadRead;
        impl Read for BadRead {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Err(io::Error::other("read injected"))
            }
        }
        assert!(
            flatten(&mut Input::new(BadRead, 1), &mut io::sink(), 1)
                .unwrap_err()
                .contains("read injected")
        );
        struct ZeroWrite;
        impl Write for ZeroWrite {
            fn write(&mut self, _: &[u8]) -> io::Result<usize> {
                Ok(0)
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }
        assert!(flatten(&mut Input::new(&b"0"[..], 1), &mut ZeroWrite, u64::MAX).is_err());
    }
}
