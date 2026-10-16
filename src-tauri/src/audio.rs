//! Capturing the audio input (the aux cable from the turntable). cpal streams must stay on the thread that made them, so the stream
//! lives in its own thread and is stopped by dropping the handle.
use std::{
    sync::mpsc::{self, Sender},
    thread,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat,
};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct InputInfo {
    pub name: String,
    pub is_default: bool,
}

pub fn list_inputs() -> Vec<InputInfo> {
    let host = cpal::default_host();
    let default = host.default_input_device().and_then(|d| d.name().ok());
    host.input_devices()
        .map(|it| it.filter_map(|d| d.name().ok()).map(|name| InputInfo { is_default: Some(&name) == default.as_ref(), name }).collect())
        .unwrap_or_default()
}

pub struct CaptureHandle {
    stop: Sender<()>,
    pub device: String,
    pub rate: u32,
}

impl Drop for CaptureHandle {
    fn drop(&mut self) {
        let _ = self.stop.send(());
    }
}

/// Any number of channels to stereo interleaved 16-bit: mono is doubled, more than two keeps the first two.
pub fn to_stereo<T: Copy>(data: &[T], channels: usize, conv: impl Fn(T) -> i16, out: &mut Vec<i16>) {
    out.clear();
    let ch = channels.max(1);
    out.reserve(data.len() / ch * 2);
    for frame in data.chunks_exact(ch) {
        let l = conv(frame[0]);
        let r = if ch > 1 { conv(frame[1]) } else { l };
        out.push(l);
        out.push(r);
    }
}

fn f32_to_i16(x: f32) -> i16 {
    (x.clamp(-1.0, 1.0) * 32767.0) as i16
}

/// Starts capturing `device` (None = the default input). `sink` gets stereo interleaved 16-bit chunks at the device's own rate.
/// Returns when the stream is running (or why it could not).
pub fn start_capture(device: Option<String>, sink: impl FnMut(&[i16]) + Send + 'static) -> Result<CaptureHandle, String> {
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(String, u32), String>>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    thread::spawn(move || {
        let host = cpal::default_host();
        let dev = match &device {
            Some(n) => host.input_devices().ok().and_then(|mut it| it.find(|d| d.name().ok().as_deref() == Some(n.as_str()))),
            None => host.default_input_device(),
        };
        let Some(dev) = dev else {
            let _ = ready_tx.send(Err("Geen geluidsingang gevonden. Is de aux-kabel of USB-adapter aangesloten?".into()));
            return;
        };
        let name = dev.name().unwrap_or_else(|_| "Geluidsingang".into());
        let cfg = match dev.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("De ingang '{name}' is niet te gebruiken: {e}")));
                return;
            }
        };
        let rate = cfg.sample_rate().0;
        let channels = cfg.channels() as usize;
        let fmt = cfg.sample_format();
        let conf: cpal::StreamConfig = cfg.into();
        let err_fn = |e| eprintln!("audio input error: {e}");
        let mut sink = sink;
        let mut buf: Vec<i16> = Vec::new();
        let built = match fmt {
            SampleFormat::F32 => dev.build_input_stream(&conf, move |d: &[f32], _| { to_stereo(d, channels, f32_to_i16, &mut buf); sink(&buf) }, err_fn, None),
            SampleFormat::I16 => dev.build_input_stream(&conf, move |d: &[i16], _| { to_stereo(d, channels, |x| x, &mut buf); sink(&buf) }, err_fn, None),
            SampleFormat::U16 => dev.build_input_stream(&conf, move |d: &[u16], _| { to_stereo(d, channels, |x| (x as i32 - 32768) as i16, &mut buf); sink(&buf) }, err_fn, None),
            other => {
                let _ = ready_tx.send(Err(format!("Dit geluidsformaat ({other:?}) wordt nog niet ondersteund.")));
                return;
            }
        };
        let stream = match built {
            Ok(s) => s,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("Opnemen van '{name}' lukte niet: {e}. Heeft Dashy toestemming voor de microfoon (Systeeminstellingen, Privacy)?")));
                return;
            }
        };
        if let Err(e) = stream.play() {
            let _ = ready_tx.send(Err(format!("Opnemen starten lukte niet: {e}")));
            return;
        }
        let _ = ready_tx.send(Ok((name, rate)));
        let _ = stop_rx.recv(); // lives until the handle is dropped
        drop(stream);
    });
    match ready_rx.recv() {
        Ok(Ok((device, rate))) => Ok(CaptureHandle { stop: stop_tx, device, rate }),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Opnemen is onverwacht gestopt.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stereo_passes_through_mono_doubles_surround_keeps_two() {
        let mut out = vec![];
        to_stereo(&[0.5f32, -0.5, 1.0, 0.0], 2, f32_to_i16, &mut out);
        assert_eq!(out, vec![16383, -16383, 32767, 0]);
        to_stereo(&[100i16, 200], 1, |x| x, &mut out);
        assert_eq!(out, vec![100, 100, 200, 200]);
        to_stereo(&[1i16, 2, 3, 4, 5, 6, 7, 8], 4, |x| x, &mut out);
        assert_eq!(out, vec![1, 2, 5, 6]);
        to_stereo(&[1i16, 2, 3], 2, |x| x, &mut out); // a half frame at the end is dropped, never read out of bounds
        assert_eq!(out, vec![1, 2]);
    }

    #[test]
    fn samples_convert_and_clamp() {
        assert_eq!(f32_to_i16(2.0), 32767);
        assert_eq!(f32_to_i16(-2.0), -32767);
        assert_eq!(f32_to_i16(0.0), 0);
    }
}
