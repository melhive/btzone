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

## Security

- **End-to-end encryption**: each device generates an ECDH (P-256) identity key pair on first launch. Public keys are exchanged via the QR code handshake or automatically when two devices connect over Bluetooth. Message text is encrypted with AES-GCM using a key derived from that exchange before it ever leaves the device. A contact you haven't exchanged keys with yet (e.g. added manually, never connected) is clearly labeled "not yet encrypted" in the thread rather than silently sending plaintext.
- **Optional PIN app lock** — Settings → App lock. Only a salted SHA-256 hash of the PIN is stored, never the PIN itself, and there's intentionally no recovery path if it's forgotten.
- **Encrypted backups** — the export sheet lets you set a passphrase; the file is then AES-GCM encrypted with a PBKDF2-derived key. Leaving the passphrase blank exports a plain JSON file instead.
- Nothing is sent anywhere except directly, device-to-device, over Bluetooth. There is no server.

## Reliability

- Bluetooth connections that drop (`gattserverdisconnected`) trigger an automatic reconnect with exponential backoff (2s → 4s → 8s → … capped at 30s, giving up quietly after ~6 tries) rather than requiring a manual re-pair.
- Messages sent while a contact isn't currently connected are marked "queued" rather than silently lost, and now actually transmit over the real Bluetooth connection when one exists (earlier builds only simulated this locally).
- Errors (failed sends, camera permission denial, corrupt backup files, etc.) surface as a toast instead of failing silently.

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
favicon.ico            multi-size favicon
css/styles.css        full design system (dark/light themes)
js/changelog.js        "What's New" entries — add one per release
js/db.js               IndexedDB layer (contacts, threads, messages, blocklist, SOS, settings, keys)
js/crypto.js             Web Crypto: identity keys, ECDH+AES-GCM message encryption, PIN hashing, encrypted backups
js/connections.js         live connection registry + reconnect backoff
js/bluetooth.js         Web Bluetooth transport + demo-mode simulator
js/qr.js                QR code generation + camera scanning
js/state.js              app state + business logic (requests, block/mute, TTL, SOS acks, encryption, app lock)
js/render.js              HTML templates for every screen
js/app.js                 router, event handling, notifications, connection + encryption wiring
vendor/                    vendored QR/scan libraries (no CDN dependency)
LICENSE                     MIT license
```

## Deferred (not in this build)

In the interest of shipping the highest-impact fixes first, these were intentionally left out — flagging them rather than quietly skipping:
- Full iOS splash-screen image matrix (the app still installs and looks correct on iOS, just without custom launch images — a PWA asset generator can add these later in a few minutes).
- Automated tests for the state logic in `js/state.js` (accept/decline/block/TTL sweep are exactly the kind of logic that benefits most from tests before this grows further).
- A native (Capacitor) wrapper to unlock real BLE peripheral/advertising mode and remove the "radar only finds devices that broadcast our service" limitation for good.

## Group chats

Create a group from **Radar → Create group**, picking from your existing accepted contacts. There's no real Bluetooth broadcast primitive available to a web page, so under the hood a group message is sent individually to each currently-connected member (same as the original "sequential delivery" design) — the UI just presents it as one thread. Incoming group messages are matched by `groupId` in the message packet and routed into the right thread automatically.

## Safety numbers (key verification)

Open any encrypted contact's **Verify** button (next to the encryption indicator in a thread) to see a safety number — a fingerprint derived from both parties' public keys. Compare it in person or over a channel you both already trust; if it matches on both ends, you can be confident the encrypted connection wasn't intercepted or substituted. This is the same idea Signal calls "safety numbers."

## Message search

The magnifying-glass icon on the Chats screen searches message text across every thread (direct and group) and jumps straight to the match.

## Swapping in real hardware

`js/bluetooth.js` defines one custom GATT service (`SERVICE_UUID`) with a write characteristic and a notify characteristic. Any peripheral — an ESP32, a native Android/iOS companion app, or another BT Zone instance wrapped in Capacitor — that implements this service and speaks the same small JSON packet format (`{kind: 'message'|'sos'|'sos-ack', ...}`) will interoperate with this web client without further changes here.
