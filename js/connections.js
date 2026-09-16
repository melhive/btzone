// BT Zone — live connection registry
// Tracks which contacts currently have an active, sendable Bluetooth
// link (real or demo), and retries dropped connections with backoff
// instead of silently leaving a contact unreachable.
(function () {
  const peers = new Map();     // deviceId -> { send, name }
  const backoff = new Map();   // deviceId -> attempt count
  const listeners = new Set();

  function emit() { listeners.forEach((fn) => fn()); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function set(deviceId, peer) {
    peers.set(deviceId, peer);
    backoff.delete(deviceId);
    emit();
  }

  function get(deviceId) { return peers.get(deviceId) || null; }
  function isConnected(deviceId) { return peers.has(deviceId); }

  function remove(deviceId) {
    peers.delete(deviceId);
    emit();
  }

  // Called when a GATT link drops. Retries with increasing delay
  // (2s, 4s, 8s… capped at 30s) up to a reasonable number of attempts,
  // rather than requiring the person to manually re-pair every time.
  function scheduleReconnect(deviceId, reconnectFn) {
    const attempt = (backoff.get(deviceId) || 0) + 1;
    backoff.set(deviceId, attempt);
    if (attempt > 6) return; // give up quietly; contact just shows "out of range"
    const delay = Math.min(30000, 2000 * Math.pow(2, attempt - 1));
    setTimeout(async () => {
      try {
        const peer = await reconnectFn();
        if (peer) set(deviceId, peer);
      } catch (e) {
        scheduleReconnect(deviceId, reconnectFn);
      }
    }, delay);
  }

  window.BTZoneConnections = { set, get, remove, isConnected, scheduleReconnect, onChange };
})();
