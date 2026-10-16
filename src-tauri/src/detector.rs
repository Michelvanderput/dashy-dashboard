//! "Is the record player playing?" from the loudness of the input. Pure: time is passed in, so it is testable.
//!
//! A turntable with the needle up still hums a little, and a record has quiet passages and a few seconds of gap between tracks.
//! So it needs a clearly louder signal for a moment to say "playing" (`on_secs`), and a long quiet stretch to say "stopped" (`off_secs`).
//! Between the two levels nothing changes (hysteresis), so a soft passage does not make the state flicker.

#[derive(Clone, Copy, Debug)]
pub struct DetectorConfig {
    /// RMS (0..1) at or above which it may be playing.
    pub on_level: f32,
    /// RMS at or below which it may have stopped.
    pub off_level: f32,
    pub on_secs: f64,
    pub off_secs: f64,
}

impl Default for DetectorConfig {
    fn default() -> Self {
        // about -42 dBFS to start, -50 dBFS to stop; 1.2 s of music to start, 6 s of quiet to stop (longer than a gap between tracks)
        Self { on_level: 0.008, off_level: 0.003, on_secs: 1.2, off_secs: 6.0 }
    }
}

pub struct Detector {
    cfg: DetectorConfig,
    playing: bool,
    since: Option<f64>,
}

impl Detector {
    pub fn new(cfg: DetectorConfig) -> Self {
        Self { cfg, playing: false, since: None }
    }

    #[cfg(test)]
    pub fn playing(&self) -> bool {
        self.playing
    }

    /// Feed one loudness reading taken at `now` (seconds, any steady clock). Returns the new state when it changed.
    pub fn update(&mut self, level: f32, now: f64) -> Option<bool> {
        let (crossing, needed) = if self.playing { (level <= self.cfg.off_level, self.cfg.off_secs) } else { (level >= self.cfg.on_level, self.cfg.on_secs) };
        if !crossing {
            self.since = None;
            return None;
        }
        let start = *self.since.get_or_insert(now);
        if now - start >= needed {
            self.playing = !self.playing;
            self.since = None;
            return Some(self.playing);
        }
        None
    }
}

/// Root-mean-square loudness of interleaved 16-bit samples, 0..1. Accumulates between `take`s.
#[derive(Default)]
pub struct Meter {
    sum_sq: f64,
    n: u64,
}

impl Meter {
    pub fn add(&mut self, samples: &[i16]) {
        for &s in samples {
            let x = s as f64 / 32768.0;
            self.sum_sq += x * x;
        }
        self.n += samples.len() as u64;
    }

    /// The RMS since the last call (0 when nothing came in), and starts over.
    pub fn take(&mut self) -> f32 {
        let rms = if self.n == 0 { 0.0 } else { (self.sum_sq / self.n as f64).sqrt() as f32 };
        self.sum_sq = 0.0;
        self.n = 0;
        rms
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(d: &mut Detector, level: f32, from: f64, to: f64) -> Vec<(f64, bool)> {
        let mut out = vec![];
        let mut t = from;
        while t < to {
            if let Some(p) = d.update(level, t) {
                out.push((t, p));
            }
            t += 0.05;
        }
        out
    }

    #[test]
    fn needs_music_for_a_moment_to_start() {
        let mut d = Detector::new(DetectorConfig::default());
        assert!(run(&mut d, 0.002, 0.0, 30.0).is_empty(), "needle-up hum is not playing");
        let ev = run(&mut d, 0.05, 30.0, 40.0);
        assert_eq!(ev.len(), 1);
        assert!(ev[0].1 && (ev[0].0 - 31.2).abs() < 0.1, "starts after about 1.2 s, got {ev:?}");
    }

    #[test]
    fn a_short_blip_does_not_start_it() {
        let mut d = Detector::new(DetectorConfig::default());
        assert!(run(&mut d, 0.2, 0.0, 0.8).is_empty()); // a knock on the table
        assert!(run(&mut d, 0.0, 0.8, 5.0).is_empty());
        assert!(!d.playing());
    }

    #[test]
    fn a_gap_between_tracks_does_not_stop_it_but_a_long_silence_does() {
        let mut d = Detector::new(DetectorConfig::default());
        run(&mut d, 0.05, 0.0, 5.0);
        assert!(d.playing());
        assert!(run(&mut d, 0.001, 5.0, 9.0).is_empty(), "4 s of gap between tracks keeps it playing");
        assert!(run(&mut d, 0.05, 9.0, 12.0).is_empty());
        let ev = run(&mut d, 0.001, 12.0, 25.0);
        assert_eq!(ev.len(), 1);
        assert!(!ev[0].1 && (ev[0].0 - 18.0).abs() < 0.1, "stops after about 6 s of quiet, got {ev:?}");
    }

    #[test]
    fn a_quiet_passage_between_the_two_levels_changes_nothing() {
        let mut d = Detector::new(DetectorConfig::default());
        run(&mut d, 0.05, 0.0, 5.0);
        assert!(run(&mut d, 0.005, 5.0, 60.0).is_empty(), "between off and on level: still playing");
        let mut e = Detector::new(DetectorConfig::default());
        assert!(run(&mut e, 0.005, 0.0, 60.0).is_empty(), "and not started either");
    }

    #[test]
    fn meter_is_rms_and_resets() {
        let mut m = Meter::default();
        assert_eq!(m.take(), 0.0);
        m.add(&[16384, -16384, 16384, -16384]);
        assert!((m.take() - 0.5).abs() < 1e-6);
        assert_eq!(m.take(), 0.0);
        m.add(&[0, 0, 0]);
        assert_eq!(m.take(), 0.0);
    }
}
