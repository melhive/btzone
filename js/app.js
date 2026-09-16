// BT Zone — app controller: routing, event delegation, notifications,
// live Bluetooth connections, encryption wiring, app lock.
(function () {
  const S = window.BTZoneState;
  const R = window.BTZoneRender;
  const BT = window.BTZoneBluetooth;
  const QR = window.BTZoneQR;
  const Conn = window.BTZoneConnections;
  const Crypto = window.BTZoneCrypto;

  const els = {
    app: document.getElementById('app'),
    topbar: document.getElementById('topbar'),
    screen: document.getElementById('screen'),
    nav: document.getElementById('bottomnav'),
    overlayHost: document.getElementById('overlay-host')
  };

  let radarState = { scanning: false, found: [] };
  let booted = false;
  const showCounts = new Map(); // threadKey -> number of messages currently shown
  let searchQuery = '';
  let unsupportedDismissed = false;

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
    setTimeout(() => t.remove(), 2600);
  }

  // Global safety net: turn any otherwise-silent JS error into a visible
  // toast instead of a dead button. Without this, an exception thrown
  // inside an async handler (e.g. a rejected promise nobody awaited)
  // fails completely silently from the user's point of view.
  window.addEventListener('error', (event) => {
    console.error('BT Zone uncaught error:', event.error || event.message);
    toast('Error: ' + (event.error && event.error.message ? event.error.message : event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    console.error('BT Zone unhandled rejection:', reason);
    toast('Error: ' + (reason && reason.message ? reason.message : String(reason)));
  });

  function safe(fn, label) {
    return async (...args) => {
      try { return await fn(...args); }
      catch (e) {
        console.error(label || 'BT Zone error', e);
        toast((label ? label + ': ' : '') + (e && e.message ? e.message : 'Something went wrong'));
      }
    };
  }

  // ---------------- Sheets / overlays ----------------
  function openSheet(innerHtml, opts) {
    opts = opts || {};
    els.overlayHost.innerHTML = `
      <div class="overlay" data-action="close-overlay">
        <div class="sheet" data-stop role="dialog" aria-label="${R.esc(opts.title || '')}">
          <div class="sheet__handle"></div>
          <div class="sheet__header"><h3>${R.esc(opts.title || '')}</h3><button class="icon-btn" data-action="close-overlay" aria-label="Close">${R.icon('close')}</button></div>
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
      return `<button class="navitem ${item.key === activeKey ? 'active' : ''} ${item.emergency ? 'emergency' : ''}" data-nav="${item.hash}" aria-label="${item.label}">
        <span class="navitem__icon">${R.icon(item.icon)}</span>
        <span>${item.label}</span>
        ${badge}
      </button>`;
    }).join('');
  }

  function renderTopbar(title, opts) {
    opts = opts || {};
    const back = opts.back ? `<button class="icon-btn" data-nav="${opts.back}" aria-label="Back">${R.icon('back')}</button>` : '<div style="width:36px"></div>';
    const right = opts.right || '<div style="width:36px"></div>';
    els.topbar.innerHTML = `
      <div class="topbar__title">${back}<h2 style="font-size:16px">${R.esc(title)}</h2></div>
      ${opts.status || right}
    `;
  }

  function connectionStatusHtml() {
    const inRange = S.state.contacts.filter((c) => c.status === 'accepted' && Conn.isConnected(c.deviceId)).length;
    const dotClass = radarState.scanning ? 'scanning' : (inRange > 0 ? 'connected' : '');
    const label = radarState.scanning ? 'Scanning…' : (inRange > 0 ? `${inRange} connected` : 'No devices connected');
    return `<div class="topbar__status"><span class="status-dot ${dotClass}"></span>${label}</div>`;
  }

  function render() {
    if (!booted) { els.topbar.innerHTML = ''; els.nav.innerHTML = ''; els.screen.innerHTML = R.loadingScreen(); return; }

    if (S.state.locked) {
      els.topbar.innerHTML = '';
      els.nav.innerHTML = '';
      els.screen.innerHTML = R.lockScreen();
      return;
    }

    const r = route();
    let match;

    if (r === '#/chats') {
      renderTopbar('BT Zone', { status: connectionStatusHtml(), right: `<button class="icon-btn" data-action="open-search" aria-label="Search messages">${R.icon('search')}</button>` });
      const banner = (!BT.isSupported() && !unsupportedDismissed) ? R.unsupportedBannerHtml() : '';
      els.screen.innerHTML = banner + R.chatsScreen();
      renderNav('chats');
    } else if (r === '#/requests') {
      renderTopbar('Message Requests');
      els.screen.innerHTML = R.requestsScreen();
      renderNav('requests');
    } else if ((match = r.match(/^#\/thread\/(.+)$/))) {
      const contact = S.contactById(match[1]);
      renderTopbar(contact ? contact.name : 'Chat', { back: contact && contact.status === 'pending' ? '#/requests' : '#/chats', right: R.threadHeaderActions(match[1]) });
      const connInfo = contact ? { connected: Conn.isConnected(contact.deviceId), connecting: connectingIds.has(contact.id), showCount: showCounts.get('c:' + match[1]) } : {};
      els.screen.innerHTML = R.threadScreen(match[1], connInfo);
      renderNav('chats');
      scrollThreadToBottom(true);
    } else if ((match = r.match(/^#\/group\/(.+)$/))) {
      const group = S.groupById(match[1]);
      renderTopbar(group ? group.name : 'Group', { back: '#/chats', right: R.groupThreadHeaderActions(match[1]) });
      els.screen.innerHTML = R.groupThreadScreen(match[1], showCounts.get('g:' + match[1]));
      renderNav('chats');
      scrollThreadToBottom(true);
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

  function scrollThreadToBottom(smooth) {
    requestAnimationFrame(() => {
      if (smooth && els.screen.scrollTo) {
        els.screen.scrollTo({ top: els.screen.scrollHeight, behavior: 'smooth' });
      } else {
        els.screen.scrollTop = els.screen.scrollHeight;
      }
    });
  }

  window.addEventListener('hashchange', renderWithTransition);
  S.subscribe(render);
  Conn.onChange(render);

  function renderWithTransition() {
    if (document.startViewTransition) {
      document.startViewTransition(() => render());
    } else {
      render();
    }
  }

  // ---------------- Event delegation ----------------
  document.addEventListener('click', async (e) => {
    if (S.state.locked) {
      if (e.target.closest('[data-action="submit-unlock"]')) return handleUnlock();
      return; // ignore everything else while locked
    }

    const navEl = e.target.closest('[data-nav]');
    if (navEl) { location.hash = navEl.getAttribute('data-nav'); return; }

    if (e.target.closest('[data-action="close-overlay"]') && !e.target.closest('[data-stop]')) { closeSheet(); return; }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');

    switch (action) {
      case 'accept-request': await S.acceptRequest(actionEl.dataset.id); toast('Request accepted'); break;
      case 'open-thread-menu': openThreadMenu(actionEl.dataset.id); break;
      case 'send': sendFromComposer(); break;
      case 'connect-contact': connectToContact(actionEl.dataset.id); break;
      case 'react': {
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
        const contact = await S.addManualOrQRContact({ name: actionEl.dataset.name, deviceId: actionEl.dataset.device });
        const peer = Conn.get(actionEl.dataset.device);
        if (peer) await sendHandshake(contact, peer);
        toast(`${actionEl.dataset.name} added`);
        radarState.found = radarState.found.filter((f) => f.deviceId !== actionEl.dataset.device);
        render();
        break;
      }
      case 'ack-sos': await S.ackSOS(actionEl.dataset.id, S.state.profile.name); toast('Acknowledged'); break;
      case 'dismiss-sos': await S.dismissSOS(actionEl.dataset.id); break;
      case 'open-sos-compose': showSOSCompose(); break;
      case 'edit-profile': showEditProfile(); break;
      case 'set-theme': await S.saveSettings({ theme: actionEl.dataset.theme }); break;
      case 'toggle-sound': await S.saveSettings({ soundEnabled: !S.state.settings.soundEnabled }); break;
      case 'toggle-vibration': await S.saveSettings({ vibrationEnabled: !S.state.settings.vibrationEnabled }); break;
      case 'toggle-demo': await S.saveSettings({ demoMode: !S.state.settings.demoMode }); break;
      case 'toggle-app-lock': {
        if (S.state.settings.appLockEnabled) { await S.disableAppLock(); toast('App lock disabled'); }
        else showSetPin();
        break;
      }
      case 'save-ttl': {
        const val = parseFloat(document.getElementById('ttl-input').value) || 0;
        await S.saveSettings({ ttlDefaultHours: val });
        toast('Saved');
        break;
      }
      case 'export-backup': showExportBackup(); break;
      case 'import-backup': document.getElementById('import-file').click(); break;
      case 'unblock': await S.unblock(actionEl.dataset.device); break;
      case 'decline-delete': await S.declineAndDelete(actionEl.dataset.id); closeSheet(); location.hash = '#/requests'; break;
      case 'block-contact': await S.blockContact(actionEl.dataset.id); closeSheet(); toast('Blocked'); location.hash = '#/chats'; break;
      case 'toggle-mute': await S.toggleMute(actionEl.dataset.id); closeSheet(); break;
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
      case 'submit-set-pin': submitSetPin(); break;
      case 'submit-unlock': handleUnlock(); break;
      case 'submit-manual': submitManual(); break;
      case 'submit-profile': submitProfile(); break;
      case 'submit-export-passphrase': submitExportBackup(); break;
      case 'open-search': showSearch(); break;
      case 'goto-search-result': {
        closeSheet();
        if (actionEl.dataset.contact) location.hash = '#/thread/' + actionEl.dataset.contact;
        else if (actionEl.dataset.group) location.hash = '#/group/' + actionEl.dataset.group;
        break;
      }
      case 'load-more-messages': {
        const r = route();
        const cMatch = r.match(/^#\/thread\/(.+)$/);
        const gMatch = r.match(/^#\/group\/(.+)$/);
        if (cMatch) showCounts.set('c:' + cMatch[1], (showCounts.get('c:' + cMatch[1]) || 50) + 50);
        if (gMatch) showCounts.set('g:' + gMatch[1], (showCounts.get('g:' + gMatch[1]) || 50) + 50);
        render();
        break;
      }
      case 'show-safety-number': showSafetyNumber(actionEl.dataset.id); break;
      case 'toggle-verified': {
        const c = S.contactById(actionEl.dataset.id);
        await S.setVerified(actionEl.dataset.id, !c.verified);
        closeSheet();
        toast(c.verified ? 'Verification removed' : 'Marked as verified');
        break;
      }
      case 'create-group': showCreateGroup(); break;
      case 'submit-create-group': submitCreateGroup(); break;
      case 'open-group-menu': openGroupMenu(actionEl.dataset.id); break;
      case 'leave-group': await deleteGroup(actionEl.dataset.id); break;
      case 'send-group': sendGroupFromComposer(actionEl.dataset.id); break;
      case 'onboarding-next': onboardingStep++; renderOnboarding(); break;
      case 'onboarding-back': onboardingStep--; renderOnboarding(); break;
      case 'onboarding-done': await finishOnboarding(); break;
      case 'dismiss-unsupported': unsupportedDismissed = true; render(); break;
      default: break;
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-input') {
      searchQuery = e.target.value;
      const results = S.searchMessages(searchQuery);
      const box = document.getElementById('search-results');
      if (box) box.innerHTML = R.searchResultsHtml(results);
    }
  });

  document.getElementById('import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await S.importBackupFile(file);
      toast('Backup imported');
    } catch (err) {
      if (err.message === 'PASSPHRASE_REQUIRED') showImportPassphrase(file);
      else toast(err.message);
    }
    e.target.value = '';
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement) {
      if (document.activeElement.id === 'composer-input') sendFromComposer();
      if (document.activeElement.id === 'unlock-pin') handleUnlock();
    }
  });

  // ---------------- App lock ----------------
  async function handleUnlock() {
    const input = document.getElementById('unlock-pin');
    if (!input) return;
    const ok = await S.tryUnlock(input.value.trim());
    if (!ok) els.screen.innerHTML = R.lockScreen('Incorrect PIN, try again.');
  }

  function showSetPin() {
    openSheet(`
      <p style="color:var(--text-secondary);font-size:13.5px;margin-bottom:10px">Choose a PIN. There's no recovery if you forget it — it's never stored, only a one-way hash of it.</p>
      <div class="form-group" style="border:none"><input type="password" inputmode="numeric" id="new-pin" placeholder="New PIN" style="text-align:center;font-size:18px;letter-spacing:4px"></div>
      <div class="btn-row"><button class="btn primary block" data-action="submit-set-pin">Enable app lock</button></div>
    `, { title: 'Set a PIN' });
  }
  async function submitSetPin() {
    const pin = document.getElementById('new-pin').value.trim();
    if (pin.length < 4) { toast('Use at least 4 digits'); return; }
    await S.setAppLockPin(pin);
    closeSheet();
    toast('App lock enabled');
  }

  // ---------------- Composer / sending ----------------
  const connectingIds = new Set();

  async function sendFromComposer() {
    const input = document.getElementById('composer-input');
    if (!input || !input.value.trim()) return;
    const contactId = route().match(/^#\/thread\/(.+)$/)?.[1];
    const contact = S.contactById(contactId);
    if (!contact || contact.status === 'pending') return;
    const text = input.value.trim();
    input.value = '';
    const thread = await S.ensureThread(contactId);

    const sharedKey = await S.sharedKeyFor(contact).catch(() => null);
    const message = await S.addMessage(thread.id, { from: 'me', text, encrypted: !!sharedKey, status: Conn.isConnected(contact.deviceId) ? 'sent' : 'queued' });

    const peer = Conn.get(contact.deviceId);
    if (!peer) { simulateReplyIfDemo(contact, thread); return; } // demo fallback keeps the UI testable

    try {
      const payload = sharedKey ? await Crypto.encryptText(sharedKey, text) : { data: text, plain: true };
      await peer.send({ kind: 'message', id: message.id, fromName: S.state.profile.name, encrypted: !!sharedKey, text: payload });
    } catch (e) {
      await S.updateMessageStatus(message.id, 'failed');
      toast('Message failed to send — will retry when reconnected');
    }
  }

  // ---------------- Connections ----------------
  async function connectToContact(contactId) {
    const contact = S.contactById(contactId);
    if (!contact) return;
    connectingIds.add(contactId);
    render();
    try {
      const peer = await (S.state.settings.demoMode
        ? BT.reconnectById(contact.deviceId, true)
        : BT.reconnectById(contact.deviceId, false).catch(() => BT.requestPairing(false)));
      Conn.set(contact.deviceId, peer);
      await S.upsertContact({ id: contact.id, lastSeen: Date.now() });
      await sendHandshake(contact, peer);
      toast(`Connected to ${contact.name}`);
    } catch (e) {
      toast('Could not connect — make sure the device is nearby and in range');
    }
    connectingIds.delete(contactId);
    render();
  }

  async function sendHandshake(contact, peer) {
    const pk = await S.myPublicKeyJwk();
    if (!pk) return;
    try { await peer.send({ kind: 'handshake', publicKey: pk, fromName: S.state.profile.name }); }
    catch (e) { /* best effort */ }
  }

  BT.on((event) => {
    if (event.type === 'packet') handleIncomingPacket(event);
    if (event.type === 'disconnected') {
      Conn.remove(event.deviceId);
      Conn.scheduleReconnect(event.deviceId, () => BT.reconnectById(event.deviceId, S.state.settings.demoMode));
    }
  });

  async function handleIncomingPacket(event) {
    const p = event.packet;
    if (p.kind === 'handshake') {
      S.setContactPublicKey(event.deviceId, p.publicKey);
      return;
    }
    if (p.kind === 'message') {
      let text = p.text && p.text.plain ? p.text.data : '[unable to decrypt]';
      const contact = S.state.contacts.find((c) => c.deviceId === event.deviceId);
      if (p.encrypted && contact) {
        try {
          const key = await S.sharedKeyFor(contact);
          if (key) text = await Crypto.decryptText(key, p.text);
        } catch (e) { text = '[unable to decrypt]'; }
      }
      if (p.groupId && contact) {
        // Message sent as part of a group this device is a member of.
        let group = S.groupById(p.groupId);
        let thread;
        if (!group) {
          const created = await S.createGroup(p.groupName || 'Group', [contact.id]);
          group = created.group; thread = created.thread;
        } else {
          thread = S.threadByGroup(p.groupId);
        }
        await S.addMessage(thread.id, { from: 'them', text, senderName: p.fromName || contact.name, senderContactId: contact.id, encrypted: !!p.encrypted });
        notifyMessage();
        return;
      }
      await S.addIncomingRequest({ deviceId: event.deviceId, name: p.fromName || 'Unknown device', previewText: text });
      notifyMessage();
      return;
    }
    if (p.kind === 'sos') { S.receiveSOS({ id: p.id, name: p.fromName || 'Unknown device', message: p.text }); notifySOS(); return; }
    if (p.kind === 'sos-ack') { S.ackSOS(p.sosId, p.fromName || 'Unknown device'); return; }
    if (p.kind === 'ack') { S.updateMessageStatus(p.messageId, 'delivered'); return; }
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

  async function showMyQR() {
    let pk = null;
    try { pk = await S.myPublicKeyJwk(); } catch (e) { console.error('Could not load public key', e); }
    openSheet(`<div id="qr-target" class="qr-box"></div><p style="text-align:center;color:var(--text-secondary);font-size:13px">Have someone scan this to add you instantly — this also exchanges encryption keys.</p>`, { title: 'My QR code' });
    setTimeout(() => {
      try { QR.renderInto(document.getElementById('qr-target'), S.state.profile, pk); }
      catch (e) { console.error('QR render failed', e); toast('Could not generate QR code: ' + e.message); }
    }, 0);
  }

  function showScanQR() {
    openSheet(`
      <video id="qr-video" style="width:100%;border-radius:10px;background:#000" muted playsinline></video>
      <canvas id="qr-canvas" style="display:none"></canvas>
      <p id="qr-status" style="text-align:center;color:var(--text-secondary);font-size:13px;margin-top:10px">Point the camera at a BT Zone QR code.</p>
    `, { title: 'Scan QR code' });
    setTimeout(() => {
      QR.startScan(document.getElementById('qr-video'), document.getElementById('qr-canvas'), async (data) => {
        await S.addManualOrQRContact({ name: data.name, avatar: data.avatar, deviceId: data.id, peerPublicKeyJwk: data.pk });
        closeSheet();
        toast(`${data.name} added${data.pk ? ' · encrypted' : ''}`);
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
  async function submitManual() {
    const name = document.getElementById('manual-name').value.trim();
    if (!name) return;
    await S.addManualOrQRContact({ name });
    closeSheet();
    toast(`${name} added`);
  }

  function showEditProfile() {
    const p = S.state.profile;
    openSheet(`
      <div class="form-group"><label>Display name</label><input type="text" id="profile-name" value="${R.esc(p.name)}"></div>
      <div class="form-group"><label>Photo</label><input type="file" id="profile-avatar" accept="image/*"></div>
      <div class="btn-row"><button class="btn primary block" data-action="submit-profile">Save</button></div>
    `, { title: 'Edit profile' });
  }
  async function submitProfile() {
    const name = document.getElementById('profile-name').value.trim();
    const fileInput = document.getElementById('profile-avatar');
    const file = fileInput.files[0];
    let avatar = S.state.profile.avatar;
    if (file) avatar = await fileToDataUrl(file);
    await S.saveProfile({ name: name || S.state.profile.name, avatar });
    closeSheet();
    toast('Profile updated');
  }

  function fileToDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function showSOSCompose() {
    openSheet(`
      <p style="color:var(--text-secondary);font-size:13.5px;margin-bottom:10px">Sends to every connected BT Zone device, not just your contacts. Use for real emergencies only.</p>
      <div class="form-group" style="padding:0;border:none"><label>What's happening? (optional)</label><textarea id="sos-text" placeholder="e.g. Trapped near the east stairwell, need medical help"></textarea></div>
      <div class="btn-row"><button class="btn danger block" data-action="send-sos">Send SOS broadcast</button></div>
    `, { title: 'Send Emergency Broadcast' });
  }

  function showExportBackup() {
    openSheet(`
      <p style="color:var(--text-secondary);font-size:13.5px;margin-bottom:10px">Optionally protect the backup file with a passphrase. Leave blank for a plain, unencrypted file.</p>
      <div class="form-group" style="border:none"><input type="password" id="export-pass" placeholder="Passphrase (optional)"></div>
      <div class="btn-row"><button class="btn primary block" data-action="submit-export-passphrase">Export</button></div>
    `, { title: 'Export backup' });
  }
  async function submitExportBackup() {
    const pass = document.getElementById('export-pass').value.trim();
    await S.exportBackup(pass || null);
    closeSheet();
    toast('Backup downloaded');
  }

  function showImportPassphrase(file) {
    openSheet(`
      <p style="color:var(--text-secondary);font-size:13.5px;margin-bottom:10px">This backup is encrypted. Enter its passphrase to restore it.</p>
      <div class="form-group" style="border:none"><input type="password" id="import-pass" placeholder="Passphrase"></div>
      <div class="btn-row"><button class="btn primary block" id="import-pass-submit">Restore</button></div>
    `, { title: 'Import backup' });
    document.getElementById('import-pass-submit').addEventListener('click', async () => {
      try {
        await S.importBackupFile(file, document.getElementById('import-pass').value.trim());
        closeSheet();
        toast('Backup imported');
      } catch (e) { toast(e.message); }
    });
  }

  function showSearch() {
    openSheet(R.searchSheet('', []), { title: 'Search' });
    setTimeout(() => document.getElementById('search-input')?.focus(), 50);
  }

  async function showSafetyNumber(contactId) {
    const contact = S.contactById(contactId);
    const myKey = await S.myPublicKeyJwk();
    if (!contact || !contact.peerPublicKeyJwk || !myKey) { toast('Not encrypted yet'); return; }
    const digits = await Crypto.safetyNumber(myKey, contact.peerPublicKeyJwk);
    openSheet(R.safetyNumberSheet(digits, contact.verified, contact.id), { title: 'Safety Number' });
  }

  function showCreateGroup() {
    const contacts = S.state.contacts.filter((c) => c.status === 'accepted');
    openSheet(R.createGroupSheet(contacts, []), { title: 'New group' });
  }
  async function submitCreateGroup() {
    const name = document.getElementById('group-name').value.trim();
    const checked = Array.from(document.querySelectorAll('.group-member-check:checked')).map((el) => el.value);
    if (!name) { toast('Give the group a name'); return; }
    if (checked.length < 1) { toast('Add at least one member'); return; }
    const { group } = await S.createGroup(name, checked);
    closeSheet();
    location.hash = '#/group/' + group.id;
  }

  function openGroupMenu(groupId) {
    const group = S.groupById(groupId);
    if (!group) return;
    openSheet(R.groupMenuSheet(group), { title: group.name });
  }
  async function deleteGroup(groupId) {
    const group = S.groupById(groupId);
    if (!group) return;
    S.state.groups = S.state.groups.filter((g) => g.id !== groupId);
    const thread = S.threadByGroup(groupId);
    if (thread) {
      S.state.messages = S.state.messages.filter((m) => m.threadId !== thread.id);
      S.state.threads = S.state.threads.filter((t) => t.id !== thread.id);
      await window.BTZoneDB.del('threads', thread.id);
    }
    await window.BTZoneDB.del('groups', groupId);
    closeSheet();
    location.hash = '#/chats';
    S.emit();
  }

  async function sendGroupFromComposer(groupId) {
    const input = document.getElementById('composer-input');
    if (!input || !input.value.trim()) return;
    const group = S.groupById(groupId);
    if (!group) return;
    const text = input.value.trim();
    input.value = '';
    const thread = S.threadByGroup(groupId);
    const message = await S.addMessage(thread.id, { from: 'me', text, status: 'sent' });

    const members = S.memberContacts(group);
    for (const member of members) {
      const peer = Conn.get(member.deviceId);
      if (!peer) continue;
      try {
        const sharedKey = await S.sharedKeyFor(member).catch(() => null);
        const payload = sharedKey ? await Crypto.encryptText(sharedKey, text) : { data: text, plain: true };
        await peer.send({ kind: 'message', id: message.id, fromName: S.state.profile.name, encrypted: !!sharedKey, text: payload, groupId: group.id, groupName: group.name });
      } catch (e) { /* per-member send failure is non-fatal for the group */ }
    }
    if (!members.some((m) => Conn.get(m.deviceId)) && S.state.settings.demoMode) {
      setTimeout(async () => {
        const replier = members[0];
        await S.addMessage(thread.id, { from: 'them', text: pickReply(), senderName: replier ? replier.name : 'Member' });
      }, 1000 + Math.random() * 1000);
    }
  }

  // ---------------- Onboarding ----------------
  let onboardingStep = 0;
  function renderOnboarding() { openSheet(R.onboardingSheet(onboardingStep), { title: '' }); }
  async function finishOnboarding() {
    await window.BTZoneDB.put('meta', { key: 'onboardingSeen', value: true });
    closeSheet();
  }
  async function maybeShowOnboarding() {
    const seen = await window.BTZoneDB.get('meta', 'onboardingSeen');
    if (!seen) { onboardingStep = 0; renderOnboarding(); return true; }
    return false;
  }

  // ---------------- Radar / scan ----------------
  async function startScan() {
    radarState.scanning = true;
    render();
    try {
      const peer = await BT.requestPairing(S.state.settings.demoMode);
      radarState.found = [{ name: peer.name || 'BT Zone Device', deviceId: peer.deviceId }];
      Conn.set(peer.deviceId, peer);
    } catch (e) {
      toast(e.message && e.message.toLowerCase().includes('cancel') ? 'Scan cancelled' : 'No devices found');
    }
    radarState.scanning = false;
    render();
  }

  // ---------------- Demo-mode simulation helpers ----------------
  function simulateReplyIfDemo(contact, thread) {
    if (!S.state.settings.demoMode) return;
    setTimeout(async () => {
      await S.addMessage(thread.id, { from: 'them', text: pickReply() });
      await S.upsertContact({ id: contact.id, lastSeen: Date.now() });
      notifyMessage();
    }, 900 + Math.random() * 1200);
  }
  function pickReply() {
    const replies = ['Copy that.', 'Still here, go ahead.', 'Got it, thanks.', 'Understood, holding position.', 'Ok, keep me posted.'];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  async function simulateIncomingRequest() {
    await S.addIncomingRequest({ deviceId: S.uid('device'), name: 'Nearby Stranger', previewText: 'Hey, saw your device nearby — mind connecting?' });
    notifyRequest();
    toast('Simulated request received');
  }
  async function simulateIncomingSOS() {
    await S.receiveSOS({ id: S.uid('sos'), name: 'Nearby Device', message: 'Need help, lost group near the ridge trail.' });
    notifySOS();
    toast('Simulated SOS received');
  }
  function simulateIncomingAckIfDemo() {
    if (!S.state.settings.demoMode) return;
    setTimeout(async () => {
      const active = S.activeSOS().filter((s) => s.from === 'me');
      if (active.length) await S.ackSOS(active[active.length - 1].id, 'Demo Peer');
    }, 1800);
  }

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
    render(); // loading screen
    try {
      await S.loadAll();
    } catch (e) {
      console.error('Failed to load app data', e);
      toast('Something went wrong loading your data');
    }
    booted = true;
    render();
    if (!S.state.locked) {
      const showedOnboarding = await maybeShowOnboarding();
      if (!showedOnboarding) await checkWhatsNew();
      else await window.BTZoneDB.put('meta', { key: 'lastSeenVersion', value: window.BTZONE_CHANGELOG[0].version });
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'BTZONE_UPDATED') toast('Updated — reload to see what changed');
      });
    }

    try {
      const reconnected = await BT.reconnectKnown(S.state.settings.demoMode);
      reconnected.forEach((peer) => Conn.set(peer.deviceId, peer));
    } catch (e) { /* no known devices in range, that's fine */ }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.BTZoneDemo = { simulateIncomingRequest, simulateIncomingSOS };
})();
