// Add a new entry here every time you bump APP_VERSION in sw.js.
// Newest first.
window.BTZONE_CHANGELOG = [
  {
    version: '1.2.0',
    date: '2026-09-16',
    changes: [
      'Group chats: create a group from your contacts, sends fan out individually to each member',
      'Safety number verification — compare a fingerprint in person to confirm no one is intercepting an encrypted connection',
      'Message search across all chats',
      'First-run onboarding explaining range limits, requests, and SOS',
      'Long chat histories now load 50 messages at a time with a "Load earlier" button',
      'A banner now explains when the current browser can\u2019t do real Bluetooth messaging',
      'Added an MIT LICENSE file'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-09-16',
    changes: [
      'End-to-end encryption: messages are now encrypted device-to-device using keys exchanged via QR code or on connect',
      'Real messages now actually transmit over the Bluetooth connection instead of only simulating locally',
      'Optional PIN app lock',
      'Encrypted, passphrase-protected backup export/import',
      'Automatic reconnect with backoff when a Bluetooth link drops',
      'Accessibility labels on icon-only buttons, fixed icon sizing, loading state, and a privacy note in Settings'
    ]
  },
  {
    version: '1.0.1',
    date: '2026-09-15',
    changes: [
      'QR code and camera-scanning libraries now bundled locally instead of loaded from a CDN',
      'Removed the Google Fonts dependency in favor of system fonts',
      'The app now has zero external dependencies and works fully offline from the very first visit'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-09-15',
    changes: [
      'First release of BT Zone',
      'Direct chats and message requests, with accept / decline / block',
      'QR and manual contact adding, radar-style scan screen',
      'SOS Broadcast with acknowledgements, separate from normal chat',
      'Dark and light mode, exportable backups, message auto-delete (TTL)'
    ]
  }
];
