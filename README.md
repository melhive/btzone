# BT Zone

Offline messaging over Bluetooth — a PWA built for dead zones, jammed signals, and emergencies.

## Run it

Any static file server works (Bluetooth and camera APIs require either `https://` or `localhost`):

```bash
cd btzone
python3 -m http.server 8080
# open http://localhost:8080 in Chrome
```

## Deploy to GitHub Pages

1. Push this folder's contents to a repo (root, or a `/docs` folder).
2. Repo Settings → Pages → set the source branch/folder.
3. Visit the published URL in Chrome → the browser will offer **Install app**.
4. To ship an update: bump `APP_VERSION` in `sw.js`, add an entry to `js/changelog.js`, push. The next time anyone opens the installed app, the service worker fetches the new files in the background and shows **What's New** automatically.

## Try it without hardware — Demo Mode

Real peer-to-peer messaging needs two devices that both run a matching Bluetooth GATT service, which most people won't have handy. **Settings → Demo mode** (on by default) simulates a peer device locally so you can click through every flow — pairing, chatting, message requests, block/mute, and SOS with acknowledgements — with just one browser tab. Two buttons under **Settings → Demo tools** let you fire a simulated incoming request or SOS on demand.

Turn Demo mode off once you have a real second device/peripheral to test against.

## Known technical limits (read this before demoing to anyone)

The Web Bluetooth API (what runs a PWA in Chrome) is a **GATT client only**. In practice that means:

- **No true "radar" of strangers.** A browser tab can't make a phone advertise itself as discoverable, and can't passively background-scan. The "Scan for devices" screen uses `navigator.bluetooth.requestDevice()`, which opens Chrome's native device chooser — our radar animation wraps that trigger, it doesn't replace it.
- **No mesh/relay.** Messages travel only directly between two connected devices, not hopped through a third phone to extend range.
- **iOS Safari has no Web Bluetooth support at all.** This currently only works on Android Chrome and desktop Chrome/Edge.
- **SOS broadcast is one connection at a time**, same as regular messages — "broadcast to everyone in range" means "send to every currently-connected peer," not a true radio broadcast.

None of this blocks the app from working as designed for direct pairs of devices — it just means the automatic-discovery experience is inherently a native-app feature. If you outgrow these limits, the next step is wrapping this same code in Capacitor/Cordova to get native BLE peripheral/advertising and true mesh relay.

## Project structure

```
index.html          app shell
manifest.json        PWA metadata
sw.js                 service worker (offline cache + update detection)
css/styles.css        full design system (dark/light themes)
js/changelog.js        "What's New" entries — add one per release
js/db.js               IndexedDB layer (contacts, threads, messages, blocklist, SOS, settings)
js/bluetooth.js         Web Bluetooth transport + demo-mode simulator
js/qr.js                QR code generation + camera scanning
js/state.js              app state + business logic (requests, block/mute, TTL, SOS acks)
js/render.js              HTML templates for every screen
js/app.js                 router, event handling, notifications (sound/vibration)
```

## Swapping in real hardware

`js/bluetooth.js` defines one custom GATT service (`SERVICE_UUID`) with a write characteristic and a notify characteristic. Any peripheral — an ESP32, a native Android/iOS companion app, or another BT Zone instance wrapped in Capacitor — that implements this service and speaks the same small JSON packet format (`{kind: 'message'|'sos'|'sos-ack', ...}`) will interoperate with this web client without further changes here.
