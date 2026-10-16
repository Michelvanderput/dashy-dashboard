//! Sonos over the home network: finding speakers (SSDP), and telling them what to play (UPnP over HTTP). No cloud, no account.
//! A speaker listens on port 1400. We find it, join the chosen rooms into one group, and point the group at Dashy's stream.
use std::{
    net::UdpSocket,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};

const AV_TRANSPORT: (&str, &str) = ("/MediaRenderer/AVTransport/Control", "urn:schemas-upnp-org:service:AVTransport:1");
const RENDERING: (&str, &str) = ("/MediaRenderer/RenderingControl/Control", "urn:schemas-upnp-org:service:RenderingControl:1");

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Room {
    pub name: String,
    /// host:port, normally ip:1400
    pub addr: String,
    /// RINCON_...: how other speakers refer to this one when joining its group
    pub uuid: String,
    pub model: String,
}

pub fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

/// The text of the first `<tag ...>text</tag>`. Enough for the small answers we read; not a general XML parser.
pub fn tag(xml: &str, name: &str) -> Option<String> {
    let open = xml.find(&format!("<{name}"))?;
    let start = xml[open..].find('>')? + open + 1;
    let end = xml[start..].find(&format!("</{name}>"))? + start;
    Some(xml[start..end].trim().to_string())
}

/// host:port from an SSDP answer's LOCATION header.
pub fn parse_location(response: &str) -> Option<String> {
    let line = response.lines().find(|l| l.to_ascii_lowercase().starts_with("location:"))?;
    let url = line.splitn(2, ':').nth(1)?.trim();
    let rest = url.strip_prefix("http://")?;
    let host = rest.split('/').next()?;
    (!host.is_empty()).then(|| host.to_string())
}

/// Description of one speaker from its address (also used for an address typed by hand).
pub fn describe(addr: &str) -> Result<Room, String> {
    let body = ureq::get(&format!("http://{addr}/xml/device_description.xml"))
        .timeout(Duration::from_secs(4))
        .call()
        .map_err(|e| format!("Geen Sonos gevonden op {addr}: {e}"))?
        .into_string()
        .map_err(|e| e.to_string())?;
    let name = tag(&body, "roomName").ok_or_else(|| format!("{addr} is geen Sonos-speaker"))?;
    let uuid = tag(&body, "UDN").map(|u| u.trim_start_matches("uuid:").to_string()).ok_or("Geen id gevonden bij de speaker")?;
    let host = addr.split(':').next().unwrap_or(addr);
    let addr = if addr.contains(':') { addr.to_string() } else { format!("{host}:1400") };
    Ok(Room { name, addr, uuid, model: tag(&body, "modelName").unwrap_or_default() })
}

/// Looks for speakers for `listen` long. Rooms are listed once each (a stereo pair or a speaker with a sub answers more than once).
pub fn discover(listen: Duration) -> Result<Vec<Room>, String> {
    let sock = UdpSocket::bind("0.0.0.0:0").map_err(|e| format!("Zoeken naar speakers lukt niet: {e}"))?;
    sock.set_read_timeout(Some(Duration::from_millis(250))).ok();
    let msearch = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 1\r\nST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n\r\n";
    for _ in 0..2 {
        let _ = sock.send_to(msearch.as_bytes(), "239.255.255.250:1900");
    }
    let end = Instant::now() + listen;
    let mut addrs: Vec<String> = vec![];
    let mut buf = [0u8; 2048];
    while Instant::now() < end {
        if let Ok((n, _)) = sock.recv_from(&mut buf) {
            if let Some(a) = parse_location(&String::from_utf8_lossy(&buf[..n])) {
                if !addrs.contains(&a) {
                    addrs.push(a);
                }
            }
        }
    }
    let mut rooms: Vec<Room> = vec![];
    for a in addrs {
        if let Ok(r) = describe(&a) {
            if !rooms.iter().any(|x| x.name == r.name) {
                rooms.push(r);
            }
        }
    }
    rooms.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(rooms)
}

/// One UPnP call. A speaker's error code comes back in the message so it can be shown.
fn soap(addr: &str, (path, service): (&str, &str), action: &str, args: &[(&str, String)]) -> Result<String, String> {
    let inner: String = args.iter().map(|(k, v)| format!("<{k}>{}</{k}>", xml_escape(v))).collect();
    let body = format!(
        "<?xml version=\"1.0\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:{action} xmlns:u=\"{service}\">{inner}</u:{action}></s:Body></s:Envelope>"
    );
    match ureq::post(&format!("http://{addr}{path}"))
        .set("Content-Type", "text/xml; charset=\"utf-8\"")
        .set("SOAPACTION", &format!("\"{service}#{action}\""))
        .timeout(Duration::from_secs(6))
        .send_string(&body)
    {
        Ok(r) => r.into_string().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, r)) => {
            let text = r.into_string().unwrap_or_default();
            Err(format!("Sonos ({addr}) zei nee bij {action}: fout {}", tag(&text, "errorCode").unwrap_or_else(|| code.to_string())))
        }
        Err(e) => Err(format!("Sonos ({addr}) is niet bereikbaar: {e}")),
    }
}

fn didl(title: &str) -> String {
    format!(
        "<DIDL-Lite xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\" xmlns:r=\"urn:schemas-rinconnetworks-com:metadata-1-0/\" xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\"><item id=\"R:0/0/0\" parentID=\"R:0/0\" restricted=\"true\"><dc:title>{}</dc:title><upnp:class>object.item.audioItem.audioBroadcast</upnp:class><desc id=\"cdudn\" nameSpace=\"urn:schemas-rinconnetworks-com:metadata-1-0/\">SA_RINCON65031_</desc></item></DIDL-Lite>",
        xml_escape(title)
    )
}

fn id0() -> (&'static str, String) {
    ("InstanceID", "0".to_string())
}

/// The speaker leaves whatever group it is in and plays alone. Needed first: a speaker that is a member of a group refuses to play something itself.
pub fn leave_group(room: &Room) -> Result<(), String> {
    soap(&room.addr, AV_TRANSPORT, "BecomeCoordinatorOfStandaloneGroup", &[id0()]).map(|_| ())
}

pub fn set_volume(addr: &str, volume: u8) -> Result<(), String> {
    soap(addr, RENDERING, "SetVolume", &[id0(), ("Channel", "Master".into()), ("DesiredVolume", volume.min(100).to_string())]).map(|_| ())
}

/// What a speaker is doing right now: `Some("Spotify")` / `Some("iets anders")` while it plays something, None when it is quiet.
pub fn playing_source(room: &Room) -> Option<String> {
    let state = soap(&room.addr, AV_TRANSPORT, "GetTransportInfo", &[id0()]).ok()?;
    if tag(&state, "CurrentTransportState").as_deref() != Some("PLAYING") {
        return None;
    }
    let uri = soap(&room.addr, AV_TRANSPORT, "GetPositionInfo", &[id0()]).ok().and_then(|p| tag(&p, "TrackURI")).unwrap_or_default().to_lowercase();
    // our own stream does not count as "something else"
    if uri.contains("dashy.mp3") {
        return None;
    }
    Some(if uri.contains("spotify") { "Spotify".to_string() } else { "iets anders".to_string() })
}

pub fn pause(room: &Room) -> Result<(), String> {
    soap(&room.addr, AV_TRANSPORT, "Pause", &[id0()]).map(|_| ())
}

/// Plays `url` (an MP3 stream) in all `rooms` together. The first room leads the group; the others join it.
/// `url` is the plain http address of the stream; this turns it into Sonos' radio form.
/// Whatever the rooms were playing (Spotify, say) is paused first, and reported back as "Spotify in Woonkamer", so the record player has priority
/// and the screen can say what it took over.
pub fn start_stream(rooms: &[Room], url: &str, title: &str, volume: Option<u8>) -> Result<Vec<String>, String> {
    let lead = rooms.first().ok_or("Kies minstens één speaker")?;
    let radio = format!("x-rincon-mp3radio://{}", url.trim_start_matches("http://"));
    let mut took_over = vec![];
    for room in rooms {
        if let Some(what) = playing_source(room) {
            let _ = pause(room); // best effort: starting our stream replaces it anyway
            took_over.push(format!("{what} in {}", room.name));
        }
    }
    leave_group(lead)?;
    soap(&lead.addr, AV_TRANSPORT, "SetAVTransportURI", &[id0(), ("CurrentURI", radio), ("CurrentURIMetaData", didl(title))])?;
    soap(&lead.addr, AV_TRANSPORT, "Play", &[id0(), ("Speed", "1".into())])?;
    for room in &rooms[1..] {
        leave_group(room)?;
        soap(&room.addr, AV_TRANSPORT, "SetAVTransportURI", &[id0(), ("CurrentURI", format!("x-rincon:{}", lead.uuid)), ("CurrentURIMetaData", String::new())])?;
    }
    if let Some(v) = volume {
        for room in rooms {
            set_volume(&room.addr, v)?;
        }
    }
    Ok(took_over)
}

/// Stops the stream and sets every room free again. Tries all rooms even when one fails; returns the first error.
pub fn stop_stream(rooms: &[Room]) -> Result<(), String> {
    let mut first = None;
    if let Some(lead) = rooms.first() {
        if let Err(e) = soap(&lead.addr, AV_TRANSPORT, "Stop", &[id0()]) {
            first = Some(e);
        }
    }
    for room in rooms {
        if let Err(e) = leave_group(room) {
            first.get_or_insert(e);
        }
    }
    first.map_or(Ok(()), Err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
    };

    /// A tiny pretend Sonos: answers the description and records every SOAP action it receives.
    struct Fake {
        addr: String,
        calls: Arc<Mutex<Vec<(String, String)>>>,
    }
    fn fake(room: &str, uuid: &str, fail_action: Option<&'static str>) -> Fake {
        fake_playing(room, uuid, fail_action, None)
    }
    /// `playing_uri`: the speaker is busy playing this (for example a Spotify track) when asked.
    fn fake_playing(room: &str, uuid: &str, fail_action: Option<&'static str>, playing_uri: Option<&'static str>) -> Fake {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap().to_string();
        let calls: Arc<Mutex<Vec<(String, String)>>> = Arc::default();
        let (c, room, uuid) = (calls.clone(), room.to_string(), uuid.to_string());
        thread::spawn(move || {
            for conn in l.incoming() {
                let Ok(mut conn) = conn else { break };
                let mut data = Vec::new();
                let mut buf = [0u8; 4096];
                // read headers, then the body by Content-Length
                loop {
                    let n = conn.read(&mut buf).unwrap_or(0);
                    if n == 0 { break }
                    data.extend_from_slice(&buf[..n]);
                    let text = String::from_utf8_lossy(&data).to_string();
                    if let Some(h) = text.find("\r\n\r\n") {
                        let len = text.to_lowercase().split("content-length:").nth(1).and_then(|r| r.split("\r\n").next()).and_then(|v| v.trim().parse::<usize>().ok()).unwrap_or(0);
                        if data.len() >= h + 4 + len { break }
                    }
                }
                let text = String::from_utf8_lossy(&data).to_string();
                let (status, body) = if text.starts_with("GET /xml/device_description.xml") {
                    ("200 OK", format!("<root><device><modelName>Sonos Five</modelName><roomName>{room}</roomName><UDN>uuid:{uuid}</UDN></device></root>"))
                } else {
                    let action = text.to_lowercase().split("soapaction:").nth(1).and_then(|r| r.split("\r\n").next()).and_then(|v| v.split('#').nth(1)).map(|v| v.trim().trim_matches('"').to_string()).unwrap_or_default();
                    let action = text.lines().find(|l| l.to_lowercase().starts_with("soapaction:")).and_then(|l| l.split('#').nth(1)).map(|v| v.trim().trim_matches('"').to_string()).unwrap_or(action);
                    c.lock().unwrap().push((action.clone(), text.split("\r\n\r\n").nth(1).unwrap_or("").to_string()));
                    if action == "GetTransportInfo" {
                        let st = if playing_uri.is_some() { "PLAYING" } else { "STOPPED" };
                        let body = format!("<u:GetTransportInfoResponse><CurrentTransportState>{st}</CurrentTransportState></u:GetTransportInfoResponse>");
                        let _ = conn.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes());
                        continue;
                    }
                    if action == "GetPositionInfo" {
                        let body = format!("<u:GetPositionInfoResponse><TrackURI>{}</TrackURI></u:GetPositionInfoResponse>", playing_uri.unwrap_or(""));
                        let _ = conn.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes());
                        continue;
                    }
                    if Some(action.as_str()) == fail_action { ("500 Internal Server Error", "<s:Envelope><s:Body><s:Fault><detail><UPnPError><errorCode>701</errorCode></UPnPError></detail></s:Fault></s:Body></s:Envelope>".to_string()) } else { ("200 OK", "<ok/>".to_string()) }
                };
                let _ = conn.write_all(format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes());
            }
        });
        Fake { addr, calls }
    }
    fn actions(f: &Fake) -> Vec<String> { f.calls.lock().unwrap().iter().map(|(a, _)| a.clone()).collect() }

    #[test]
    fn reads_a_speaker_description_and_ssdp_answers() {
        let f = fake("Woonkamer", "RINCON_AAA01400", None);
        let r = describe(&f.addr).unwrap();
        assert_eq!((r.name.as_str(), r.uuid.as_str(), r.model.as_str()), ("Woonkamer", "RINCON_AAA01400", "Sonos Five"));
        assert_eq!(r.addr, f.addr);
        assert!(describe("127.0.0.1:1").unwrap_err().contains("Geen Sonos"));
        let ssdp = "HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age = 1800\r\nLOCATION: http://192.168.1.20:1400/xml/device_description.xml\r\nST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n\r\n";
        assert_eq!(parse_location(ssdp).as_deref(), Some("192.168.1.20:1400"));
        assert_eq!(parse_location("HTTP/1.1 200 OK\r\nLocation: http://10.0.0.5:1400/x\r\n\r\n").as_deref(), Some("10.0.0.5:1400"));
        assert_eq!(parse_location("garbage"), None);
        assert_eq!(parse_location("LOCATION: ftp://x/y"), None);
    }

    #[test]
    fn xml_helpers() {
        assert_eq!(xml_escape("a&b<c>\"d'"), "a&amp;b&lt;c&gt;&quot;d&apos;");
        assert_eq!(tag("<a><b x=\"1\"> hi </b></a>", "b").as_deref(), Some("hi"));
        assert_eq!(tag("<a></a>", "b"), None);
        assert_eq!(tag("<b>unclosed", "b"), None);
    }

    #[test]
    fn plays_the_stream_in_two_rooms_as_one_group() {
        let (a, b) = (fake("Woonkamer", "RINCON_AAA01400", None), fake("Keuken", "RINCON_BBB01400", None));
        let rooms = vec![describe(&a.addr).unwrap(), describe(&b.addr).unwrap()];
        let took = start_stream(&rooms, "http://192.168.1.7:5000/dashy.mp3", "Platenspeler", Some(30)).unwrap();
        assert!(took.is_empty(), "quiet speakers: nothing to take over");
        // the leader: leave its old group, load the stream, play, volume
        assert_eq!(actions(&a), ["GetTransportInfo", "BecomeCoordinatorOfStandaloneGroup", "SetAVTransportURI", "Play", "SetVolume"]);
        let uri = a.calls.lock().unwrap()[2].1.clone();
        assert!(uri.contains("<CurrentURI>x-rincon-mp3radio://192.168.1.7:5000/dashy.mp3</CurrentURI>"), "{uri}");
        assert!(uri.contains("&lt;dc:title&gt;Platenspeler&lt;/dc:title&gt;"), "metadata is escaped inside the call: {uri}");
        assert!(a.calls.lock().unwrap()[4].1.contains("<DesiredVolume>30</DesiredVolume>"));
        // the other room joins the leader's group
        assert_eq!(actions(&b), ["GetTransportInfo", "BecomeCoordinatorOfStandaloneGroup", "SetAVTransportURI", "SetVolume"]);
        assert!(b.calls.lock().unwrap()[2].1.contains("<CurrentURI>x-rincon:RINCON_AAA01400</CurrentURI>"));
        // and stopping frees everyone
        stop_stream(&rooms).unwrap();
        assert_eq!(actions(&a)[5..], ["Stop", "BecomeCoordinatorOfStandaloneGroup"]);
        assert_eq!(actions(&b)[4..], ["BecomeCoordinatorOfStandaloneGroup"]);
    }

    #[test]
    fn a_speaker_that_refuses_gives_a_readable_error_and_stop_still_tries_every_room() {
        let (a, b) = (fake("Woonkamer", "RINCON_AAA01400", Some("Play")), fake("Keuken", "RINCON_BBB01400", Some("Stop")));
        let rooms = vec![describe(&a.addr).unwrap(), describe(&b.addr).unwrap()];
        let err = start_stream(&rooms, "http://1.2.3.4:5/dashy.mp3", "x", None).unwrap_err();
        assert!(err.contains("Play") && err.contains("701"), "{err}");
        assert_eq!(start_stream(&[], "http://1.2.3.4:5/dashy.mp3", "x", None).unwrap_err(), "Kies minstens één speaker");
        let rooms2 = vec![describe(&b.addr).unwrap(), describe(&a.addr).unwrap()]; // leader's Stop fails
        assert!(stop_stream(&rooms2).is_err());
        assert!(actions(&a).contains(&"BecomeCoordinatorOfStandaloneGroup".to_string()), "the others were still set free");
    }

    #[test]
    fn spotify_playing_on_a_speaker_is_paused_first_and_reported() {
        let a = fake_playing("Woonkamer", "RINCON_AAA01400", None, Some("x-sonos-spotify:spotify%3atrack%3a123?sid=9"));
        let b = fake("Keuken", "RINCON_BBB01400", None);
        let c = fake_playing("Slaapkamer", "RINCON_CCC01400", None, Some("x-rincon-mp3radio://radio.example/stream"));
        let rooms = vec![describe(&a.addr).unwrap(), describe(&b.addr).unwrap(), describe(&c.addr).unwrap()];
        let took = start_stream(&rooms, "http://192.168.1.7:5000/dashy.mp3", "Platenspeler", None).unwrap();
        assert_eq!(took, ["Spotify in Woonkamer", "iets anders in Slaapkamer"]);
        let acts = actions(&a);
        let pause = acts.iter().position(|x| x == "Pause").expect("paused");
        let take = acts.iter().position(|x| x == "SetAVTransportURI").unwrap();
        assert!(pause < take, "pause before taking over: {acts:?}");
        assert!(!actions(&b).contains(&"Pause".to_string()), "a quiet speaker is not paused");
    }

    #[test]
    fn our_own_stream_is_not_something_to_take_over() {
        let a = fake_playing("Woonkamer", "RINCON_AAA01400", None, Some("x-rincon-mp3radio://192.168.1.7:5000/dashy.mp3"));
        let rooms = vec![describe(&a.addr).unwrap()];
        assert!(start_stream(&rooms, "http://192.168.1.7:5001/dashy.mp3", "Platenspeler", None).unwrap().is_empty());
        assert!(!actions(&a).contains(&"Pause".to_string()));
    }

    #[test]
    fn an_unreachable_speaker_is_an_error_not_a_hang() {
        let room = Room { name: "x".into(), addr: "127.0.0.1:1".into(), uuid: "RINCON_X".into(), model: "".into() };
        let t = Instant::now();
        assert!(start_stream(&[room], "http://1.2.3.4:5/dashy.mp3", "x", None).unwrap_err().contains("niet bereikbaar"));
        assert!(t.elapsed() < Duration::from_secs(10));
    }
}
