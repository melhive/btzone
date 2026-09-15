// BT Zone — app controller: routing, event delegation, notifications
(function () {
  const S = window.BTZoneState;
  const R = window.BTZoneRender;
  const BT = window.BTZoneBluetooth;
  const QR = window.BTZoneQR;

  const els = {
    app: document.getElementById('app'),
    topbar: document.getElementById('topbar'),
    screen: document.getElementById('screen'),
    nav: document.getElementById('bottomnav'),
    overlayHost: document.getElementById('overlay-host')
  };

  let radarState = { scanning: false, found: [] };

  // ---------------- Audio / haptics ----------------
  let audioCtx = null;
  function beep(freqs, durationMs) {
    if (!S.state.settings.soundEnabled) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = f;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.0001, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.15, now + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + (durationMs / 1000));
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + (durationMs / 1000) + 0.05);
      });
    } catch (e) { /* audio not available */ }
  }
  function vibrate(pattern) {
    if (!S.state.settings.vibrationEnabled) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  }
  function notifyMessage() { beep([660], 140); vibrate([80]); }
  function notifyRequest() { beep([520, 760], 160); vibrate([60, 60, 60]); }
  function notifySOS() { beep([880, 600, 880, 600], 180); vibrate([200, 100, 200, 100, 200]); }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    els.app.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  // ---------------- Sheets / overlays ----------------
  function openSheet(innerHtml, opts) {
    opts = opts || {};
    els.overlayHost.innerHTML = `
      <div class="overlay" data-action="close-overlay">
        <div class="sheet" data-stop>
          <div class="sheet__handle"></div>
          <div class="sheet__header"><h3>${R.esc(opts.title || '')}</h3><button class="icon-btn" data-action="close-overlay">${R.icon('close')}</button></div>
          <div class="sheet__body">${innerHtml}</div>
        </div>
      </div>`;
  }
  function closeSheet() {
    QR.stopScan();
    els.overlayHost.innerHTML = '';
  }

  // ---------------- Router ----------------
  function route() { return location.hash || '#/chats'; }

  function requestCount() { return S.state.contacts.filter((c) => c.status === 'pending').length; }
  function sosCount() { return S.activeSOS().length; }

  const NAV_ITEMS = [
    { key: 'chats', hash: '#/chats', label: 'Chats', icon: 'chats' },
    { key: 'requests', hash: '#/requests', label: 'Requests', icon: 'requests' },
    { key: 'radar', hash: '#/radar', label: 'Add', icon: 'radar' },
    { key: 'emergency', hash: '#/emergency', label: 'SOS', icon: 'emergency', emergency: true },
    { key: 'settings', hash: '#/settings', label: 'Settings', icon: 'settings' }
  ];

  function renderNav(activeKey) {
    els.nav.innerHTML = NAV_ITEMS.map((item) => {
      let badge = '';
      if (item.key === 'requests' && requestCount() > 0) badge = `<span class="badge">${requestCount()}</span>`;
      if (item.key === 'emergency' && sosCount() > 0) badge = `<span class="badge flare">${sosCount()}</span>`;
      return `<button class="navitem ${item.key === activeKey ? 'active' : ''} ${item.emergency ? 'emergency' : ''}" data-nav="${item.hash}">
        <span class="navitem__icon">${R.icon(item.icon)}</span>
        <span>${item.label}</span>
        ${badge}
      </button>`;
    }).join('');
  }

  function renderTopbar(title, opts) {
    opts = opts || {};
    const back = opts.back ? `<button class="icon-btn" data-nav="${opts.back}">${R.icon('back')}</button>` : '<div style="width:36px"></div>';
    const right = opts.right || '<div style="width:36px"></div>';
    els.topbar.innerHTML = `
      <div class="topbar__title">${back}<h2 style="font-size:16px">${R.esc(title)}</h2></div>
      ${opts.status || right}
    `;
  }

  function connectionStatusHtml() {
    const inRange = S.state.contacts.filter((c) => c.status === 'accepted' && (Date.now() - (c.lastSeen || 0)) < 5 * 60000).length;
    const dotClass = radarState.scanning ? 'scanning' : (inRange > 0 ? 'connected' : '');
    const label = radarState.scanning ? 'Scanning…' : (inRange > 0 ? `${inRange} in range` : 'No devices in range');
    return `<div class="topbar__status"><span class="status-dot ${dotClass}"></span>${label}</div>`;
  }

  function render() {
    const r = route();
    let match;

    if (r === '#/chats') {
      renderTopbar('BT Zone', { status: connectionStatusHtml() });
      els.screen.innerHTML = R.chatsScreen();
      renderNav('chats');
    } else if (r === '#/requests') {
      renderTopbar('Message Requests');
      els.screen.innerHTML = R.requestsScreen();
      renderNav('requests');
    } else if ((match = r.match(/^#\/thread\/(.+)$/))) {
      const contact = S.contactById(match[1]);
      renderTopbar(contact ? contact.name : 'Chat', { back: contact && contact.status === 'pending' ? '#/requests' : '#/chats', right: R.threadHeaderActions(match[1]) });
      els.screen.innerHTML = R.threadScreen(match[1]);
      renderNav('chats');
      scrollThreadToBottom();
    } else if (r === '#/radar') {
      renderTopbar('Add a Contact', { status: connectionStatusHtml() });
      els.screen.innerHTML = R.radarScreen(radarState.scanning, radarState.found);
      renderNav('radar');
    } else if (r === '#/emergency') {
      renderTopbar('Emergency');
      els.screen.innerHTML = R.emergencyScreen();
      renderNav('emergency');
    } else if (r === '#/settings') {
      renderTopbar('Settings');
      els.screen.innerHTML = R.settingsScreen();
      renderNav('settings');
    } else if (r === '#/blocklist') {
      renderTopbar('Blocklist', { back: '#/settings' });
      els.screen.innerHTML = R.blocklistScreen();
      renderNav('settings');
    } else {
      location.hash = '#/chats';
      return;
    }
  }

  function scrollThreadToBottom() {
    requestAnimationFrame(() => { els.screen.scrollTop = els.screen.scrollHeight; });
  }

  window.addEventListener('hashchange', render);
  S.subscribe(render);

  // ---------------- Event delegation ----------------
  document.addEventListener('click', async (e) => {
    const navEl = e.target.closest('[data-nav]');
    if (navEl) { location.hash = navEl.getAttribute('data-nav'); return; }

    const overlayClose = e.target.closest('[data-action="close-overlay"]');
    if (overlayClose && !e.target.closest('[data-stop]')) { closeSheet(); return; }
    if (e.target.closest('[data-action="close-overlay"]')) { closeSheet(); return; }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');

    switch (action) {
      case 'accept-request': {
        await S.acceptRequest(actionEl.dataset.id);
        toast('Request accepted');
        break;
      }
      case 'open-thread-menu': openThreadMenu(actionEl.dataset.id); break;
      case 'send': sendFromComposer(); break;
      case 'react': {
        const bubble = e.target.closest('.bubble-row')?.previousElementSibling;
        // find nearest message id via last rendered bubble - simplest: react to last message in thread
        const contactId = route().match(/^#\/thread\/(.+)$/)?.[1];
        const thread = S.threadByContact(contactId);
        const msgs = thread ? S.messagesForThread(thread.id) : [];
        if (msgs.length) await S.addReaction(msgs[msgs.length - 1].id, actionEl.dataset.emoji);
        break;
      }
      case 'start-scan': startScan(); break;
      case 'show-qr': showMyQR(); break;
      case 'scan-qr': showScanQR(); break;
      case 'add-manual': showAddManual(); break;
      case 'add-found': {
        await S.addManualOrQRContact({ name: actionEl.dataset.name, deviceId: actionEl.dataset.device });
        toast(`${actionEl.dataset.name} added`);
        radarState.found = radarState.found.filter((f) => f.deviceId !== actionEl.dataset.device);
        render();
        break;
      }
      case 'ack-sos': {
        await S.ackSOS(actionEl.dataset.id, S.state.profile.name);
        toast('Acknowledged');
        break;
      }
      case 'dismiss-sos': await S.dismissSOS(actionEl.dataset.id); break;
      case 'open-sos-compose': showSOSCompose(); break;
      case 'edit-profile': showEditProfile(); break;
      case 'set-theme': await S.saveSettings({ theme: actionEl.dataset.theme }); break;
      case 'toggle-sound': await S.saveSettings({ soundEnabled: !S.state.settings.soundEnabled }); break;
      case 'toggle-vibration': await S.saveSettings({ vibrationEnabled: !S.state.settings.vibrationEnabled }); break;
      case 'toggle-demo': await S.saveSettings({ demoMode: !S.state.settings.demoMode }); break;
      case 'save-ttl': {
        const val = parseFloat(document.getElementById('ttl-input').value) || 0;
        await S.saveSettings({ ttlDefaultHours: val });
        toast('Saved');
        break;
      }
      case 'export-backup': await S.exportBackup(); break;
      case 'import-backup': document.getElementById('import-file').click(); break;
      case 'unblock': await S.unblock(actionEl.dataset.device); break;
      case 'decline-delete': {
        await S.declineAndDelete(actionEl.dataset.id);
        closeSheet();
        location.hash = '#/requests';
        break;
      }
      case 'block-contact': {
        await S.blockContact(actionEl.dataset.id);
        closeSheet();
        toast('Blocked');
        location.hash = '#/chats';
        break;
      }
      case 'toggle-mute': {
        await S.toggleMute(actionEl.dataset.id);
        closeSheet();
        break;
      }
      case 'send-sos': {
        const text = document.getElementById('sos-text').value.trim();
        await S.createSOS(text);
        notifySOS();
        closeSheet();
        location.hash = '#/emergency';
        simulateIncomingAckIfDemo();
        break;
      }
      case 'sim-request': simulateIncomingRequest(); break;
      case 'sim-sos': simulateIncomingSOS(); break;
      default: break;
    }
  });

  document.getElementById('import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) { await S.importBackupFile(file); toast('Backup imported'); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'composer-input') sendFromComposer();
  });

  async function sendFromComposer() {
    const input = document.getElementById('composer-input');
    if (!input || !input.value.trim()) return;
    const contactId = route().match(/^#\/thread\/(.+)$/)?.[1];
    const contact = S.contactById(contactId);
    if (!contact || contact.status === 'pending') return;
    const thread = await S.ensureThread(contactId);
    await S.addMessage(thread.id, { from: 'me', text: input.value.trim() });
    input.value = '';
    simulateReplyIfDemo(contact, thread);
  }

  // ---------------- Sheets: menus / forms ----------------
  function openThreadMenu(contactId) {
    const c = S.contactById(contactId);
    if (!c) return;
    const rows = [];
    if (c.status === 'pending') {
      rows.push(`<button class="btn primary block" data-action="accept-request" data-id="${c.id}">Accept request</button>`);
      rows.push(`<button class="btn block" data-action="decline-delete" data-id="${c.id}">Decline & delete</button>`);
    } else {
      rows.push(`<button class="btn block" data-action="toggle-mute" data-id="${c.id}">${c.muted ? 'Unmute' : 'Mute notifications'}</button>`);
    }
    rows.push(`<button class="btn danger block" data-action="block-contact" data-id="${c.id}">Block</button>`);
    openSheet(`<div class="btn-row" style="flex-direction:column">${rows.join('')}</div>`, { title: c.name });
  }

  function showMyQR() {
    openSheet(`<div id="qr-target" class="qr-box"></div><p style="text-align:center;color:var(--text-secondary);font-size:13px">Have someone scan this to add you instantly.</p>`, { title: 'My QR code' });
    setTimeout(() => QR.renderInto(document.getElementById('qr-target'), S.state.profile), 0);
  }

  function showScanQR() {
    openSheet(`
      <video id="qr-video" style="width:100%;border-radius:10px;background:#000" muted playsinline></video>
      <canvas id="qr-canvas" style="display:none"></canvas>
      <p id="qr-status" style="text-align:center;color:var(--text-secondary);font-size:13px;margin-top:10px">Point the camera at a BT Zone QR code.</p>
    `, { title: 'Scan QR code' });
    setTimeout(() => {
      QR.startScan(document.getElementById('qr-video'), document.getElementById('qr-canvas'), async (data) => {
        await S.addManualOrQRContact({ name: data.name, avatar: data.avatar, deviceId: data.id });
        closeSheet();
        toast(`${data.name} added`);
      }, (err) => {
        const st = document.getElementById('qr-status');
        if (st) st.textContent = 'Camera unavailable: ' + err.message;
      });
    }, 0);
  }

  function showAddManual() {
    openSheet(`
      <div class="form-group"><label>Name</label><input type="text" id="manual-name" placeholder="e.g. Sam"></div>
      <div class="btn-row"><button class="btn primary block" data-action="submit-manual">Add contact</button></div>
    `, { title: 'Add manually' });
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="submit-manual"]')) {
      const name = document.getElementById('manual-name').value.trim();
      if (!name) return;
      await S.addManualOrQRContact({ name });
      closeSheet();
      toast(`${name} added`);
    }
  });

  function showEditProfile() {
    const p = S.state.profile;
    openSheet(`
      <div class="form-group"><label>Display name</label><input type="text" id="profile-name" value="${R.esc(p.name)}"></div>
      <div class="form-group"><label>Photo</label><input type="file" id="profile-avatar" accept="image/*"></div>
      <div class="btn-row"><button class="btn primary block" data-action="submit-profile">Save</button></div>
    `, { title: 'Edit profile' });
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="submit-profile"]')) {
      const name = document.getElementById('profile-name').value.trim();
      const fileInput = document.getElementById('profile-avatar');
      const file = fileInput.files[0];
      let avatar = S.state.profile.avatar;
      if (file) avatar = await fileToDataUrl(file);
      await S.saveProfile({ name: name || S.state.profile.name, avatar });
      closeSheet();
      toast('Profile updated');
    }
  });

  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function showSOSCompose() {
    openSheet(`
      <p style="color:var(--text-secondary);font-size:13.5px;margin-bottom:10px">Broadcasts to every BT Zone device in Bluetooth range, not just your contacts. Use for real emergencies only.</p>
      <div class="form-group" style="padding:0;border:none"><label>What's happening? (optional)</label><textarea id="sos-text" placeholder="e.g. Trapped near the east stairwell, need medical help"></textarea></div>
      <div class="btn-row"><button class="btn danger block" data-action="send-sos">Send SOS broadcast</button></div>
    `, { title: 'Send Emergency Broadcast' });
  }

  // ---------------- Radar / scan ----------------
  async function startScan() {
    radarState.scanning = true;
    render();
    try {
      const peer = await BT.requestPairing(S.state.settings.demoMode);
      radarState.found = [{ name: peer.name || 'BT Zone Device', deviceId: peer.deviceId }];
    } catch (e) {
      toast(e.message && e.message.includes('cancel') ? 'Scan cancelled' : 'No devices found');
    }
    radarState.scanning = false;
    render();
  }

  // ---------------- Demo-mode simulation helpers ----------------
  // These stand in for a second physical device so the full request /
  // message / SOS-ack flow can be exercised without hardware.
  function simulateReplyIfDemo(contact, thread) {
    if (!S.state.settings.demoMode) return;
    setTimeout(async () => {
      await S.addMessage(thread.id, { from: 'them', text: pickReply() });
      await S.upsertContact({ id: contact.id, lastSeen: Date.now() });
      notifyMessage();
      render();
    }, 900 + Math.random() * 1200);
  }
  function pickReply() {
    const replies = ['Copy that.', 'Still here, go ahead.', 'Got it, thanks.', 'Understood, holding position.', 'Ok, keep me posted.'];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  async function simulateIncomingRequest() {
    await S.addIncomingRequest({ deviceId: S.uid('device'), name: 'Nearby Stranger', previewText: 'Hey, saw your device nearby — mind connecting?' });
    notifyRequest();
    render();
    toast('Simulated request received');
  }
  async function simulateIncomingSOS() {
    await S.receiveSOS({ id: S.uid('sos'), name: 'Nearby Device', message: 'Need help, lost group near the ridge trail.' });
    notifySOS();
    render();
    toast('Simulated SOS received');
  }
  function simulateIncomingAckIfDemo() {
    if (!S.state.settings.demoMode) return;
    setTimeout(async () => {
      const active = S.activeSOS().filter((s) => s.from === 'me');
      if (active.length) { await S.ackSOS(active[active.length - 1].id, 'Demo Peer'); render(); }
    }, 1800);
  }

  // Wire real Bluetooth packet events (used when a genuine peripheral peer exists)
  BT.on((event) => {
    if (event.type === 'packet') {
      const p = event.packet;
      if (p.kind === 'message') S.addIncomingRequest({ deviceId: event.deviceId, name: p.fromName || 'Unknown device', previewText: p.text });
      if (p.kind === 'sos') S.receiveSOS({ id: p.id, name: p.fromName || 'Unknown device', message: p.text });
      if (p.kind === 'sos-ack') S.ackSOS(p.sosId, p.fromName || 'Unknown device');
    }
  });

  // ---------------- What's New / update handling ----------------
  async function checkWhatsNew() {
    const latest = window.BTZONE_CHANGELOG[0].version;
    const seen = await window.BTZoneDB.get('meta', 'lastSeenVersion');
    if (!seen || seen.value !== latest) {
      openSheet(R.whatsNewSheet(), { title: "What's New" });
      await window.BTZoneDB.put('meta', { key: 'lastSeenVersion', value: latest });
    }
  }

  // ---------------- Init ----------------
  async function init() {
    await S.loadAll();
    render();
    await checkWhatsNew();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'BTZONE_UPDATED') {
          toast('Updated — reload to see what changed');
        }
      });
    }

    // Attempt a silent reconnect to any previously-paired real devices.
    BT.reconnectKnown(S.state.settings.demoMode).catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);

  // Expose demo trigger buttons for the empty states (see index.html hooks)
  window.BTZoneDemo = { simulateIncomingRequest, simulateIncomingSOS };
})();
