//! Dashy as a radio station: the captured audio is encoded to MP3 and served over HTTP; Sonos fetches it like any internet radio stream.
//! (Sonos buffers a lot, so expect 5 to 10 seconds between the needle and the speakers. That is how Sonos handles streams.)
use std::{
    io::{Read, Write},
    net::{Shutdown, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{sync_channel, Receiver, SyncSender, TrySendError},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use mp3lame_encoder::{Bitrate, Builder, FlushNoGap, InterleavedPcm, Quality};

pub const STREAM_PATH: &str = "/dashy.mp3";
const MAX_REQUEST: usize = 8 * 1024;

/// The sample rate the MP3 can have: LAME handles up to 48 kHz, so faster inputs are decimated by a whole factor (96 kHz becomes 48 kHz).
pub fn mp3_rate(input_rate: u32) -> (u32, usize) {
    let factor = ((input_rate as f64) / 48_000.0).ceil().max(1.0) as usize;
    (input_rate / factor as u32, factor)
}

/// Average groups of `factor` frames (cheap low-pass) from stereo interleaved samples.
pub fn decimate(stereo: &[i16], factor: usize) -> Vec<i16> {
    if factor <= 1 {
        return stereo.to_vec();
    }
    let mut out = Vec::with_capacity(stereo.len() / factor);
    for group in stereo.chunks_exact(2 * factor) {
        let (mut l, mut r) = (0i32, 0i32);
        for f in group.chunks_exact(2) {
            l += f[0] as i32;
            r += f[1] as i32;
        }
        out.push((l / factor as i32) as i16);
        out.push((r / factor as i32) as i16);
    }
    out
}

/// Fans the encoded bytes out to every connected listener. A listener that cannot keep up is dropped rather than slowing the others.
#[derive(Default)]
pub struct Broadcaster {
    clients: Mutex<Vec<SyncSender<Arc<Vec<u8>>>>>,
}

impl Broadcaster {
    pub fn add(&self) -> Receiver<Arc<Vec<u8>>> {
        let (tx, rx) = sync_channel(256);
        self.clients.lock().unwrap().push(tx);
        rx
    }
    pub fn send(&self, bytes: Vec<u8>) {
        let data = Arc::new(bytes);
        self.clients.lock().unwrap().retain(|c| match c.try_send(data.clone()) {
            Ok(()) => true,
            Err(TrySendError::Full(_)) => false,
            Err(TrySendError::Disconnected(_)) => false,
        });
    }
    pub fn listeners(&self) -> usize {
        self.clients.lock().unwrap().len()
    }
}

pub struct ServerHandle {
    pub port: u16,
    pub bus: Arc<Broadcaster>,
    stop: Arc<AtomicBool>,
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = TcpStream::connect(("127.0.0.1", self.port)); // wake the accept loop so it can end
    }
}

/// Starts the stream server on a free port. It answers `GET /dashy.mp3` with an endless MP3 stream and refuses everything else.
pub fn start_server() -> std::io::Result<ServerHandle> {
    let listener = TcpListener::bind(("0.0.0.0", 0))?;
    let port = listener.local_addr()?.port();
    let bus = Arc::new(Broadcaster::default());
    let stop = Arc::new(AtomicBool::new(false));
    let (b, s) = (bus.clone(), stop.clone());
    thread::spawn(move || {
        for conn in listener.incoming() {
            if s.load(Ordering::Relaxed) {
                break;
            }
            if let Ok(c) = conn {
                let b = b.clone();
                let s = s.clone();
                thread::spawn(move || serve_client(c, &b, &s));
            }
        }
    });
    Ok(ServerHandle { port, bus, stop })
}

fn read_request_line(conn: &mut TcpStream) -> Option<(String, String)> {
    conn.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 512];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
        let n = conn.read(&mut chunk).ok()?;
        if n == 0 || buf.len() + n > MAX_REQUEST {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let head = String::from_utf8_lossy(&buf);
    let mut parts = head.lines().next()?.split_whitespace();
    Some((parts.next()?.to_string(), parts.next()?.to_string()))
}

fn serve_client(mut conn: TcpStream, bus: &Broadcaster, stop: &AtomicBool) {
    let Some((method, path)) = read_request_line(&mut conn) else { return };
    let path = path.split('?').next().unwrap_or("");
    if path != STREAM_PATH || (method != "GET" && method != "HEAD") {
        let _ = conn.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return;
    }
    let head = "HTTP/1.1 200 OK\r\nContent-Type: audio/mpeg\r\nicy-name: Dashy platenspeler\r\nCache-Control: no-cache, no-store\r\nConnection: close\r\n\r\n";
    if conn.write_all(head.as_bytes()).is_err() || method == "HEAD" {
        return;
    }
    let rx = bus.add();
    let _ = conn.set_write_timeout(Some(Duration::from_secs(10)));
    while !stop.load(Ordering::Relaxed) {
        match rx.recv_timeout(Duration::from_millis(500)) {
            Ok(bytes) => {
                if conn.write_all(&bytes).is_err() {
                    break;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            Err(_) => break,
        }
    }
    let _ = conn.shutdown(Shutdown::Both);
}

/// Encodes stereo 16-bit chunks (at `input_rate`) to MP3 and hands the bytes to the broadcaster. Ends when the sender is dropped.
pub fn spawn_encoder(rx: Receiver<Vec<i16>>, input_rate: u32, bus: Arc<Broadcaster>) -> Result<thread::JoinHandle<()>, String> {
    let (rate, factor) = mp3_rate(input_rate);
    let mut b = Builder::new().ok_or("De MP3-encoder kon niet starten")?;
    b.set_num_channels(2).map_err(|e| format!("{e:?}"))?;
    b.set_sample_rate(rate).map_err(|e| format!("{e:?}"))?;
    b.set_brate(Bitrate::Kbps192).map_err(|e| format!("{e:?}"))?;
    b.set_quality(Quality::Good).map_err(|e| format!("{e:?}"))?;
    let mut enc = b.build().map_err(|e| format!("{e:?}"))?;
    Ok(thread::spawn(move || {
        let mut out: Vec<u8> = Vec::new();
        for chunk in rx {
            let pcm = decimate(&chunk, factor);
            if pcm.is_empty() {
                continue;
            }
            out.clear();
            out.reserve(mp3lame_encoder::max_required_buffer_size(pcm.len() / 2));
            match enc.encode(InterleavedPcm(&pcm), out.spare_capacity_mut()) {
                Ok(n) => {
                    // SAFETY: the encoder reports how many bytes it initialised in the spare capacity.
                    unsafe { out.set_len(n) };
                    if n > 0 {
                        bus.send(out.clone());
                    }
                }
                Err(e) => eprintln!("mp3 encode error: {e:?}"),
            }
        }
        out.clear();
        out.reserve(7200);
        if let Ok(n) = enc.flush::<FlushNoGap>(out.spare_capacity_mut()) {
            unsafe { out.set_len(n) };
            if n > 0 {
                bus.send(out);
            }
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(frames: usize, rate: u32, hz: f32) -> Vec<i16> {
        (0..frames).flat_map(|i| { let v = ((i as f32 / rate as f32 * hz * std::f32::consts::TAU).sin() * 12000.0) as i16; [v, v] }).collect()
    }

    #[test]
    fn rates_above_48k_are_decimated_by_a_whole_factor() {
        assert_eq!(mp3_rate(44_100), (44_100, 1));
        assert_eq!(mp3_rate(48_000), (48_000, 1));
        assert_eq!(mp3_rate(96_000), (48_000, 2));
        assert_eq!(mp3_rate(88_200), (44_100, 2));
        assert_eq!(mp3_rate(192_000), (48_000, 4));
        assert_eq!(decimate(&[10, 20, 30, 40, 50, 60, 70, 80], 2), vec![20, 30, 60, 70]);
        assert_eq!(decimate(&[1, 2, 3], 1), vec![1, 2, 3]);
        assert_eq!(decimate(&[1, 2, 3], 2), Vec::<i16>::new(), "a partial group is dropped, not read out of bounds");
    }

    fn get(port: u16, req: &str) -> TcpStream {
        let mut c = TcpStream::connect(("127.0.0.1", port)).unwrap();
        c.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        c.write_all(req.as_bytes()).unwrap();
        c
    }

    #[test]
    fn serves_a_real_mp3_stream_and_refuses_other_paths() {
        let server = start_server().unwrap();
        let (tx, rx) = sync_channel::<Vec<i16>>(64);
        let enc = spawn_encoder(rx, 44_100, server.bus.clone()).unwrap();

        // other paths and methods are refused
        let mut c = get(server.port, "GET /etc/passwd HTTP/1.1\r\nHost: x\r\n\r\n");
        let mut s = String::new();
        let _ = c.read_to_string(&mut s);
        assert!(s.starts_with("HTTP/1.1 404"), "{s}");
        let mut c = get(server.port, "POST /dashy.mp3 HTTP/1.1\r\n\r\n");
        let mut s = String::new();
        let _ = c.read_to_string(&mut s);
        assert!(s.starts_with("HTTP/1.1 404"), "{s}");

        // a listener, then audio
        let mut c = get(server.port, "GET /dashy.mp3 HTTP/1.1\r\nHost: x\r\nIcy-MetaData: 1\r\n\r\n");
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while server.bus.listeners() == 0 && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(server.bus.listeners(), 1);
        for _ in 0..40 {
            tx.send(sine(1152, 44_100, 440.0)).unwrap();
        }
        let mut got = Vec::new();
        let mut buf = [0u8; 4096];
        while got.len() < 6000 {
            let n = c.read(&mut buf).expect("stream data");
            assert!(n > 0, "stream closed early");
            got.extend_from_slice(&buf[..n]);
        }
        let split = got.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
        let head = String::from_utf8_lossy(&got[..split]).to_string();
        assert!(head.starts_with("HTTP/1.1 200 OK") && head.contains("Content-Type: audio/mpeg") && head.contains("Connection: close"), "{head}");
        let body = &got[split..];
        let sync = body.windows(2).position(|w| w[0] == 0xFF && (w[1] & 0xE0) == 0xE0).expect("an MP3 frame header (sync word)");
        assert!(sync < 2000, "frames start soon, got {sync}");
        // MPEG-1 Layer III header: version bits 11, layer bits 01
        assert_eq!((body[sync + 1] >> 3) & 0b11, 0b11, "MPEG-1");
        assert_eq!((body[sync + 1] >> 1) & 0b11, 0b01, "Layer III");
        drop(tx);
        enc.join().unwrap();
    }

    #[test]
    fn a_slow_listener_is_dropped_and_does_not_block_others() {
        let bus = Broadcaster::default();
        let _slow = bus.add(); // never reads
        let fast = bus.add();
        for i in 0..300u32 {
            bus.send(vec![i as u8]);
            while let Ok(_) = fast.try_recv() {}
        }
        assert_eq!(bus.listeners(), 1, "the one that never reads is gone");
    }

    #[test]
    fn stopping_the_server_ends_the_streams() {
        let server = start_server().unwrap();
        let port = server.port;
        let mut c = get(port, "GET /dashy.mp3 HTTP/1.1\r\n\r\n");
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while server.bus.listeners() == 0 && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        drop(server);
        let mut rest = Vec::new();
        let _ = c.read_to_end(&mut rest); // ends (EOF) instead of hanging
        assert!(String::from_utf8_lossy(&rest).starts_with("HTTP/1.1 200"));
    }
}
