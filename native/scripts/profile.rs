// Appended to main.rs by profile.py; uses the same private parser and emitter.
struct CountWriter(usize);
impl Write for CountWriter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0 += std::hint::black_box(bytes).len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
fn profile_main() {
    let args: Vec<String> = std::env::args().collect();
    let source = std::fs::read(&args[1]).unwrap();
    let rounds: usize = args[2].parse().unwrap();
    for mode in ["parse", "buffered-emission", "strings", "normalize"] {
        let start = std::time::Instant::now();
        let mut count = 0usize;
        for _ in 0..rounds {
            let mut input = Input::new(std::hint::black_box(source.as_slice()), 65536);
            match mode {
                "parse" => {
                    flatten(&mut input, &mut io::sink(), u64::MAX).unwrap();
                }
                "buffered-emission" => {
                    let mut out = BufWriter::with_capacity(65536, CountWriter(0));
                    flatten(&mut input, &mut out, u64::MAX).unwrap();
                    out.flush().unwrap();
                    count += out.get_ref().0;
                }
                _ => {
                    let mut token = Vec::new();
                    while let Some(b) = input.peek().unwrap() {
                        if b == b'"' {
                            input.string(&mut token).unwrap();
                            if mode == "normalize" {
                                normalize(std::hint::black_box(&mut token)).unwrap();
                            }
                            count += std::hint::black_box(&token).len();
                        } else {
                            input.take().unwrap();
                        }
                    }
                }
            }
        }
        println!(
            "{mode} {} {}",
            start.elapsed().as_secs_f64(),
            std::hint::black_box(count)
        );
    }
}
