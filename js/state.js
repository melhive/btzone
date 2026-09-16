// BT Zone — app state + business logic
(function () {
  const DB = window.BTZoneDB;
  const listeners = new Set();

  const state = {
    profile: null,
    contacts: [],   // includes pending "requests" (status: pending|accepted|blocked)
    threads: [],
    messages: [],
    blocklist: [],
    sos: [],
    groups: [],
    settings: {
      theme: 'dark',
      demoMode: true,
      soundEnabled: true,
      vibrationEnabled: true,
      ttlDefaultHours: 0, // 0 = off
      appLockEnabled: false,
      appLockHash: null,
      appLockSalt: null
    },
    identityKeys: null, // { privateKey, publicKey } CryptoKey pair, loaded once
    route: '#/chats',
    activeThreadId: null,
    locked: false
  };

  function emit() { listeners.forEach((fn) => fn(state)); }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function uid(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 10); }

  async function loadAll() {
    const [profile, contacts, threads, messages, blocklist, sos, settingsRow, keysRow, groups] = await Promise.all([
      DB.all('profile'), DB.all('contacts'), DB.all('threads'), DB.all('messages'), DB.all('blocklist'), DB.all('sos'), DB.get('meta', 'settings'), DB.get('keys', 'identity'), DB.all('groups')
    ]);
    state.profile = profile[0] || null;
    state.contacts = contacts;
    state.threads = threads;
    state.messages = messages;
    state.blocklist = blocklist;
    state.sos = sos;
    state.groups = groups;
    if (settingsRow) state.settings = Object.assign(state.settings, settingsRow.value);
    if (state.settings.theme) document.documentElement.setAttribute('data-theme', state.settings.theme);

    if (!state.profile) {
      await seedDemoData();
      return loadAll();
    }

    if (keysRow) {
      state.identityKeys = { privateKey: keysRow.privateKey, publicKey: keysRow.publicKey };
    } else if (window.BTZoneCrypto && window.BTZoneCrypto.supported) {
      const pair = await window.BTZoneCrypto.generateIdentityKeyPair();
      await DB.put('keys', { id: 'identity', privateKey: pair.privateKey, publicKey: pair.publicKey });
      state.identityKeys = pair;
    }

    state.locked = !!state.settings.appLockEnabled;
    sweepExpiredMessages();
    emit();
  }

  async function myPublicKeyJwk() {
    if (!state.identityKeys) return null;
    return window.BTZoneCrypto.exportPublicKeyJwk(state.identityKeys.publicKey);
  }

  function setContactPublicKey(contactOrDeviceId, jwk) {
    const contact = typeof contactOrDeviceId === 'string'
      ? state.contacts.find((c) => c.deviceId === contactOrDeviceId)
      : contactOrDeviceId;
    if (!contact) return;
    contact.peerPublicKeyJwk = jwk;
    DB.put('contacts', contact);
  }

  async function sharedKeyFor(contact) {
    if (!contact || !contact.peerPublicKeyJwk || !state.identityKeys) return null;
    return window.BTZoneCrypto.getSharedKey(contact.id, state.identityKeys.privateKey, contact.peerPublicKeyJwk);
  }

  // ---------------- App lock ----------------

  async function setAppLockPin(pin) {
    const salt = Math.random().toString(36).slice(2);
    const hash = await window.BTZoneCrypto.hashPin(pin, salt);
    await saveSettings({ appLockEnabled: true, appLockHash: hash, appLockSalt: salt });
  }

  async function disableAppLock() {
    await saveSettings({ appLockEnabled: false, appLockHash: null, appLockSalt: null });
  }

  async function tryUnlock(pin) {
    if (!state.settings.appLockHash) return true;
    const hash = await window.BTZoneCrypto.hashPin(pin, state.settings.appLockSalt);
    if (hash === state.settings.appLockHash) {
      state.locked = false;
      emit();
      return true;
    }
    return false;
  }

  async function saveSettings(partial) {
    Object.assign(state.settings, partial);
    if (partial.theme) document.documentElement.setAttribute('data-theme', partial.theme);
    await DB.put('meta', { key: 'settings', value: state.settings });
    emit();
  }

  async function saveProfile(partial) {
    state.profile = Object.assign(state.profile || { id: uid('me') }, partial);
    await DB.put('profile', state.profile);
    emit();
  }

  // ---------------- Contacts / requests ----------------

  function contactById(id) { return state.contacts.find((c) => c.id === id); }
  function threadByContact(contactId) { return state.threads.find((t) => t.contactId === contactId); }

  async function upsertContact(contact) {
    const idx = state.contacts.findIndex((c) => c.id === contact.id);
    if (idx >= 0) state.contacts[idx] = Object.assign({}, state.contacts[idx], contact);
    else state.contacts.push(contact);
    await DB.put('contacts', state.contacts.find((c) => c.id === contact.id));
    emit();
    return contact;
  }

  async function ensureThread(contactId) {
    let thread = threadByContact(contactId);
    if (!thread) {
      thread = { id: uid('thread'), contactId, updatedAt: Date.now(), lastMessage: '' };
      state.threads.push(thread);
      await DB.put('threads', thread);
    }
    return thread;
  }

  // Called when a brand-new inbound contact appears (manual add, QR scan
  // result, or an unsolicited first message) — lands as a pending request.
  async function addIncomingRequest({ deviceId, name, avatar, previewText }) {
    if (state.blocklist.find((b) => b.deviceId === deviceId)) return null; // silently dropped
    let contact = state.contacts.find((c) => c.deviceId === deviceId);
    if (!contact) {
      contact = { id: uid('contact'), deviceId, name, avatar: avatar || null, status: 'pending', lastSeen: Date.now(), createdAt: Date.now() };
      await upsertContact(contact);
    }
    const thread = await ensureThread(contact.id);
    if (previewText) await addMessage(thread.id, { from: 'them', text: previewText, status: 'delivered' });
    return contact;
  }

  async function addManualOrQRContact({ name, avatar, deviceId, peerPublicKeyJwk }) {
    const contact = { id: uid('contact'), deviceId: deviceId || uid('device'), name, avatar: avatar || null, status: 'accepted', lastSeen: Date.now(), createdAt: Date.now(), peerPublicKeyJwk: peerPublicKeyJwk || null };
    await upsertContact(contact);
    await ensureThread(contact.id);
    return contact;
  }

  async function acceptRequest(contactId) {
    await upsertContact({ id: contactId, status: 'accepted' });
  }

  async function declineAndDelete(contactId) {
    const thread = threadByContact(contactId);
    if (thread) {
      state.messages = state.messages.filter((m) => m.threadId !== thread.id);
      state.threads = state.threads.filter((t) => t.id !== thread.id);
      await DB.del('threads', thread.id);
    }
    state.contacts = state.contacts.filter((c) => c.id !== contactId);
    await DB.del('contacts', contactId);
    emit();
  }

  async function blockContact(contactId) {
    const contact = contactById(contactId);
    if (!contact) return;
    await upsertContact({ id: contactId, status: 'blocked' });
    const entry = { deviceId: contact.deviceId, name: contact.name, blockedAt: Date.now() };
    state.blocklist.push(entry);
    await DB.put('blocklist', entry);
    emit();
  }

  async function unblock(deviceId) {
    state.blocklist = state.blocklist.filter((b) => b.deviceId !== deviceId);
    await DB.del('blocklist', deviceId);
    const contact = state.contacts.find((c) => c.deviceId === deviceId);
    if (contact) await upsertContact({ id: contact.id, status: 'accepted' });
    emit();
  }

  async function toggleMute(contactId) {
    const c = contactById(contactId);
    await upsertContact({ id: contactId, muted: !c.muted });
  }

  async function setVerified(contactId, verified) {
    await upsertContact({ id: contactId, verified: !!verified });
  }

  // ---------------- Groups ----------------

  function groupById(id) { return state.groups.find((g) => g.id === id); }
  function threadByGroup(groupId) { return state.threads.find((t) => t.groupId === groupId); }

  async function createGroup(name, memberContactIds) {
    const group = { id: uid('group'), name, memberContactIds, createdAt: Date.now() };
    state.groups.push(group);
    await DB.put('groups', group);
    const thread = { id: uid('thread'), type: 'group', groupId: group.id, updatedAt: Date.now(), lastMessage: '' };
    state.threads.push(thread);
    await DB.put('threads', thread);
    emit();
    return { group, thread };
  }

  function memberContacts(group) {
    return (group.memberContactIds || []).map((id) => contactById(id)).filter(Boolean);
  }

  // ---------------- Messages ----------------

  async function addMessage(threadId, { from, text, status, ttlHours, reactions, encrypted, senderName, senderContactId }) {
    const ts = Date.now();
    const ttl = (ttlHours || state.settings.ttlDefaultHours || 0);
    const message = {
      id: uid('msg'), threadId, from, text, ts,
      status: status || (from === 'me' ? 'sent' : 'delivered'),
      encrypted: !!encrypted,
      senderName: senderName || null,
      senderContactId: senderContactId || null,
      ttlExpiresAt: ttl > 0 ? ts + ttl * 3600 * 1000 : null,
      reactions: reactions || []
    };
    state.messages.push(message);
    await DB.put('messages', message);
    const thread = state.threads.find((t) => t.id === threadId);
    if (thread) {
      thread.updatedAt = ts;
      thread.lastMessage = text;
      await DB.put('threads', thread);
    }
    emit();
    return message;
  }

  async function updateMessageStatus(messageId, status) {
    const msg = state.messages.find((m) => m.id === messageId);
    if (!msg) return;
    msg.status = status;
    await DB.put('messages', msg);
    emit();
  }

  function messagesForThread(threadId) {
    return state.messages.filter((m) => m.threadId === threadId).sort((a, b) => a.ts - b.ts);
  }

  async function addReaction(messageId, emoji) {
    const msg = state.messages.find((m) => m.id === messageId);
    if (!msg) return;
    msg.reactions = msg.reactions || [];
    msg.reactions.push(emoji);
    await DB.put('messages', msg);
    emit();
  }

  function sweepExpiredMessages() {
    const now = Date.now();
    const before = state.messages.length;
    const expired = state.messages.filter((m) => m.ttlExpiresAt && m.ttlExpiresAt <= now);
    if (!expired.length) return;
    state.messages = state.messages.filter((m) => !(m.ttlExpiresAt && m.ttlExpiresAt <= now));
    expired.forEach((m) => DB.del('messages', m.id));
    if (state.messages.length !== before) emit();
  }
  setInterval(sweepExpiredMessages, 60 * 1000);

  function searchMessages(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return state.messages
      .filter((m) => m.text && m.text.toLowerCase().includes(q))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50)
      .map((m) => {
        const thread = state.threads.find((t) => t.id === m.threadId);
        let title = 'Unknown';
        let navContactId = null;
        if (thread && thread.contactId) {
          const c = contactById(thread.contactId);
          title = c ? c.name : 'Unknown';
          navContactId = thread.contactId;
        } else if (thread && thread.groupId) {
          const g = groupById(thread.groupId);
          title = g ? g.name : 'Group';
        }
        return { message: m, title, navContactId, groupId: thread ? thread.groupId : null };
      });
  }

  // ---------------- SOS ----------------

  async function createSOS(messageText) {
    const sos = {
      id: uid('sos'),
      from: 'me',
      name: state.profile.name,
      message: messageText || '',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
      acks: []
    };
    state.sos.push(sos);
    await DB.put('sos', sos);
    emit();
    return sos;
  }

  async function receiveSOS({ id, name, message }) {
    if (state.sos.find((s) => s.id === id)) return;
    const sos = { id, from: 'them', name, message, createdAt: Date.now(), expiresAt: Date.now() + 30 * 60 * 1000, acks: [] };
    state.sos.push(sos);
    await DB.put('sos', sos);
    emit();
  }

  async function ackSOS(sosId, ackerName) {
    const sos = state.sos.find((s) => s.id === sosId);
    if (!sos) return;
    sos.acks = sos.acks || [];
    if (!sos.acks.find((a) => a.name === ackerName)) sos.acks.push({ name: ackerName, ts: Date.now() });
    await DB.put('sos', sos);
    emit();
  }

  async function dismissSOS(sosId) {
    state.sos = state.sos.filter((s) => s.id !== sosId);
    await DB.del('sos', sosId);
    emit();
  }

  function activeSOS() {
    const now = Date.now();
    return state.sos.filter((s) => s.expiresAt > now);
  }

  // ---------------- Backup ----------------

  async function exportBackup(passphrase) {
    const data = await DB.exportAll();
    let payload = JSON.stringify(data, null, 2);
    let filename = `btzone-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (passphrase) {
      payload = JSON.stringify(await window.BTZoneCrypto.encryptBackup(payload, passphrase));
      filename = filename.replace('.json', '.encrypted.json');
    }
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importBackupFile(file, passphrase) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
      if (data.v === 1 && data.salt && data.iv && data.data) {
        if (!passphrase) throw new Error('PASSPHRASE_REQUIRED');
        data = JSON.parse(await window.BTZoneCrypto.decryptBackup(data, passphrase));
      }
    } catch (e) {
      if (e.message === 'PASSPHRASE_REQUIRED') throw e;
      throw new Error('This file isn\u2019t a valid BT Zone backup, or the passphrase was wrong.');
    }
    await DB.importAll(data);
    await loadAll();
  }

  // ---------------- Demo seed data ----------------

  async function seedDemoData() {
    const me = { id: uid('me'), name: 'You', avatar: null };
    await DB.put('profile', me);

    const contacts = [
      { id: uid('contact'), deviceId: uid('device'), name: 'Mara', avatar: null, status: 'accepted', lastSeen: Date.now() - 2 * 60000, createdAt: Date.now() },
      { id: uid('contact'), deviceId: uid('device'), name: 'Diego', avatar: null, status: 'accepted', lastSeen: Date.now() - 40 * 60000, createdAt: Date.now() },
      { id: uid('contact'), deviceId: uid('device'), name: 'Unknown Beacon', avatar: null, status: 'pending', lastSeen: Date.now() - 5 * 60000, createdAt: Date.now() }
    ];
    for (const c of contacts) await DB.put('contacts', c);

    const threads = contacts.map((c) => ({ id: uid('thread'), contactId: c.id, updatedAt: Date.now(), lastMessage: '' }));
    for (const t of threads) await DB.put('threads', t);

    const seedMsgs = [
      { threadId: threads[0].id, from: 'them', text: 'Still at the north checkpoint, come this way.' },
      { threadId: threads[0].id, from: 'me', text: 'On my way, 10 minutes out.' },
      { threadId: threads[1].id, from: 'them', text: 'Radio\'s dead, this is the only line working.' },
      { threadId: threads[2].id, from: 'them', text: 'Hey — found your device on the scan, mind connecting?' }
    ];
    for (const m of seedMsgs) {
      const msg = { id: uid('msg'), threadId: m.threadId, from: m.from, text: m.text, ts: Date.now() - Math.random() * 600000, status: 'delivered', ttlExpiresAt: null, reactions: [] };
      await DB.put('messages', msg);
    }
    threads[0].lastMessage = seedMsgs[1].text;
    threads[1].lastMessage = seedMsgs[2].text;
    threads[2].lastMessage = seedMsgs[3].text;
    for (const t of threads) await DB.put('threads', t);

    await DB.put('meta', { key: 'settings', value: state.settings });
  }

  window.BTZoneState = {
    state, subscribe, emit, uid, loadAll,
    saveSettings, saveProfile,
    contactById, threadByContact, upsertContact, ensureThread,
    addIncomingRequest, addManualOrQRContact, acceptRequest, declineAndDelete,
    blockContact, unblock, toggleMute, setVerified,
    groupById, threadByGroup, createGroup, memberContacts,
    addMessage, updateMessageStatus, messagesForThread, addReaction, sweepExpiredMessages, searchMessages,
    createSOS, receiveSOS, ackSOS, dismissSOS, activeSOS,
    exportBackup, importBackupFile,
    myPublicKeyJwk, setContactPublicKey, sharedKeyFor,
    setAppLockPin, disableAppLock, tryUnlock
  };
})();
