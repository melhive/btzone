// BT Zone — Bluetooth layer
//
// HONEST LIMITS (read before relying on this in production):
// Web Bluetooth is a GATT *client* API only. A browser tab cannot:
//   - advertise itself as a discoverable peripheral
//   - passively scan for other BT Zone users in the background
//   - relay/mesh a message through a third device
// So real "radar" discovery of *strangers* isn't possible purely in-browser.
// What IS real and implemented below:
//   - navigator.bluetooth.requestDevice() to pair with a device the OS
//     already sees (native chooser), wrapped behind our own radar UI
//   - GATT connect + a custom service/characteristic to exchange
//     BT Zone protocol packets (messages, requests, SOS, acks) with a
//     device running a compatible peripheral/GATT server
//   - navigator.bluetooth.getDevices() to silently reconnect to a
//     previously authorized device without the native picker
//
// Because most people won't have two GATT-server-capable peers handy,
// DEMO MODE simulates the wire protocol locally so the full UI/UX can
// be built and tested end-to-end. Swap DemoTransport for BleTransport
// once you have a real peripheral (a small ESP32/RN app, etc).

(function () {
  const SERVICE_UUID = '7a1e6f00-8b1a-4b7e-9c2e-1e6f7a1e6f00'; // BT Zone custom service
  const CHAR_TX_UUID = '7a1e6f01-8b1a-4b7e-9c2e-1e6f7a1e6f00'; // write
  const CHAR_RX_UUID = '7a1e6f02-8b1a-4b7e-9c2e-1e6f7a1e6f00'; // notify

  const listeners = new Set();
  function emit(event) { listeners.forEach((fn) => fn(event)); }

  // ---- Real Web Bluetooth transport ----------------------------------
  const BleTransport = {
    supported() {
      return typeof navigator !== 'undefined' && !!navigator.bluetooth;
    },

    async requestPairing() {
      if (!this.supported()) throw new Error('Web Bluetooth not supported in this browser.');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID]
      });
      return this._connect(device);
    },

    async reconnectKnown() {
      if (!this.supported() || !navigator.bluetooth.getDevices) return [];
      const devices = await navigator.bluetooth.getDevices();
      const results = [];
      for (const device of devices) {
        try { results.push(await this._connect(device)); } catch (e) { /* out of range, skip */ }
      }
      return results;
    },

    async _connect(device) {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const txChar = await service.getCharacteristic(CHAR_TX_UUID);
      const rxChar = await service.getCharacteristic(CHAR_RX_UUID);
      await rxChar.startNotifications();
      rxChar.addEventListener('characteristicvaluechanged', (e) => {
        const text = new TextDecoder().decode(e.target.value);
        try { emit({ type: 'packet', deviceId: device.id, packet: JSON.parse(text) }); } catch (err) { /* ignore malformed */ }
      });
      device.addEventListener('gattserverdisconnected', () => emit({ type: 'disconnected', deviceId: device.id }));
      return { deviceId: device.id, name: device.name, send: async (packet) => {
        const bytes = new TextEncoder().encode(JSON.stringify(packet));
        await txChar.writeValue(bytes);
      } };
    },

    async reconnectById(deviceId) {
      if (!this.supported() || !navigator.bluetooth.getDevices) throw new Error('Cannot reconnect automatically in this browser.');
      const devices = await navigator.bluetooth.getDevices();
      const device = devices.find((d) => d.id === deviceId);
      if (!device) throw new Error('Device not found — may be out of range.');
      return this._connect(device);
    }
  };

  // ---- Demo transport (simulated peer, no hardware needed) -----------
  const DemoTransport = {
    supported() { return true; },
    async requestPairing() {
      await wait(900);
      const id = 'demo-' + Math.random().toString(36).slice(2, 8);
      return { deviceId: id, name: 'Demo Device', send: async (packet) => {
        // Echo a scripted reply so the UI has something to react to.
        await wait(500 + Math.random() * 700);
        emit({ type: 'packet', deviceId: id, packet: simulateReply(packet) });
      } };
    },
    async reconnectKnown() { return []; },
    async reconnectById(deviceId) {
      await wait(400);
      return { deviceId, name: 'Demo Device', send: async (packet) => {
        await wait(400 + Math.random() * 500);
        emit({ type: 'packet', deviceId, packet: simulateReply(packet) });
      } };
    }
  };

  function simulateReply(packet) {
    if (packet.kind === 'sos') {
      return { kind: 'sos-ack', sosId: packet.id, from: 'demo-peer' };
    }
    return { kind: 'ack', messageId: packet.id };
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  let transport = null;
  function getTransport(demoMode) {
    if (demoMode) return DemoTransport;
    if (!transport) transport = BleTransport.supported() ? BleTransport : DemoTransport;
    return transport;
  }

  window.BTZoneBluetooth = {
    SERVICE_UUID,
    isSupported: () => BleTransport.supported(),
    requestPairing: (demoMode) => getTransport(demoMode).requestPairing(),
    reconnectKnown: (demoMode) => getTransport(demoMode).reconnectKnown(),
    reconnectById: (deviceId, demoMode) => getTransport(demoMode).reconnectById(deviceId),
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
