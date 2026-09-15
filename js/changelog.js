// Add a new entry here every time you bump APP_VERSION in sw.js.
// Newest first.
window.BTZONE_CHANGELOG = [
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
