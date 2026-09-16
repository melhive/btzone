// BT Zone — view rendering (plain template strings, no framework)
(function () {
  const S = window.BTZoneState;

  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function icon(name) {
    const icons = {
      chats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4V5z"/></svg>',
      requests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.2"/><path d="M4.5 20c1-3.5 4-5.5 7.5-5.5S18.5 16.5 19.5 20"/></svg>',
      radar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 12 L18 7"/></svg>',
      emergency: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l9 16H3L12 3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/></svg>',
      settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.7 7.7 0 000-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-1.7-1L15 3h-4l-.3 2.6a7.6 7.6 0 00-1.7 1l-2.4-1-2 3.4L6.6 11a7.7 7.7 0 000 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 001.7 1L11 21h4l.3-2.6a7.6 7.6 0 001.7-1l2.4 1 2-3.4-2-1.6z"/></svg>',
      back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
      close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
      send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>',
      qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM19 14h2v2M14 19h2v2M19 19h2v2"/></svg>',
      lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
      unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/></svg>',
      search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
      group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17" cy="8" r="2.6"/><path d="M16 13.3c2 .5 3.4 2 4 4.7"/></svg>',
      shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
      plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>'
    };
    return icons[name] || '';
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }

  function avatar(contact, opts) {
    opts = opts || {};
    const presence = opts.presence ? `<span class="presence-dot ${opts.presence}"></span>` : '';
    if (opts.isGroup) {
      return `<div class="avatar group-avatar">${icon('group')}${presence}</div>`;
    }
    if (contact && contact.avatar) {
      return `<div class="avatar">${presence}<img src="${esc(contact.avatar)}" alt=""></div>`;
    }
    return `<div class="avatar">${initials(contact ? contact.name : '?')}${presence}</div>`;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const min = Math.round(diff / 60000);
    if (min < 1) return 'now';
    if (min < 60) return `${min}m`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.round(hr / 24)}d`;
  }

  function timeShort(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // -------------------- Chats --------------------
  function chatsScreen() {
    const s = S.state;
    const accepted = s.contacts.filter((c) => c.status === 'accepted');
    const directRows = accepted.map((c) => ({ kind: 'direct', c, thread: s.threads.find((t) => t.contactId === c.id) }));
    const groupRows = s.groups.map((g) => ({ kind: 'group', g, thread: s.threads.find((t) => t.groupId === g.id) }));
    const rows = directRows.concat(groupRows);

    if (!rows.length) {
      return emptyState('chats', 'No chats yet', 'Add a contact by QR code, manually, or from the radar scan to start messaging.');
    }

    const sorted = rows.sort((a, b) => (b.thread ? b.thread.updatedAt : 0) - (a.thread ? a.thread.updatedAt : 0));

    return `<div class="list">${sorted.map((row) => {
      const thread = row.thread;
      const last = thread ? s.messages.filter((m) => m.threadId === thread.id).sort((a, b) => b.ts - a.ts)[0] : null;
      if (row.kind === 'direct') {
        const c = row.c;
        const presence = (Date.now() - (c.lastSeen || 0)) < 5 * 60000 ? 'connected' : '';
        return `<div class="list-row" data-nav="#/thread/${c.id}">
          ${avatar(c, { presence })}
          <div class="list-row__body">
            <div class="list-row__top">
              <span class="list-row__name">${esc(c.name)}${c.verified ? ` ${icon('shield')}` : ''}</span>
              <span class="list-row__time">${last ? timeAgo(last.ts) : ''}</span>
            </div>
            <div class="list-row__sub">${esc(last ? (last.from === 'me' ? 'You: ' : '') + last.text : 'No messages yet')}</div>
            <div class="list-row__meta">${presence === 'connected' ? 'In range' : 'Last seen ' + timeAgo(c.lastSeen) + ' ago'}${c.muted ? ' · muted' : ''}</div>
          </div>
        </div>`;
      }
      const g = row.g;
      return `<div class="list-row" data-nav="#/group/${g.id}">
        ${avatar(null, { isGroup: true })}
        <div class="list-row__body">
          <div class="list-row__top">
            <span class="list-row__name">${esc(g.name)}</span>
            <span class="list-row__time">${last ? timeAgo(last.ts) : ''}</span>
          </div>
          <div class="list-row__sub">${esc(last ? (last.senderName ? last.senderName + ': ' : (last.from === 'me' ? 'You: ' : '')) + last.text : 'No messages yet')}</div>
          <div class="list-row__meta">${(g.memberContactIds || []).length} members</div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  // -------------------- Requests --------------------
  function requestsScreen() {
    const s = S.state;
    const pending = s.contacts.filter((c) => c.status === 'pending');
    if (!pending.length) {
      return emptyState('requests', 'No message requests', 'Messages from people who aren\u2019t your contacts yet will show up here first.');
    }
    return `<div class="list">${pending.map((c) => {
      const thread = s.threads.find((t) => t.contactId === c.id);
      const msgs = thread ? s.messages.filter((m) => m.threadId === thread.id) : [];
      const preview = msgs[msgs.length - 1];
      return `<div class="list-row" data-nav="#/thread/${c.id}">
        ${avatar(c)}
        <div class="list-row__body">
          <div class="list-row__top">
            <span class="list-row__name">${esc(c.name)}</span>
            <span class="pill pending">request</span>
          </div>
          <div class="list-row__sub">${esc(preview ? preview.text : '')}</div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  // -------------------- Thread --------------------
  function threadScreen(contactId, connInfo) {
    connInfo = connInfo || {};
    const s = S.state;
    const contact = S.contactById(contactId);
    if (!contact) return emptyState('chats', 'Contact not found', '');
    const thread = S.threadByContact(contactId) || { id: null };
    const allMsgs = thread.id ? S.messagesForThread(thread.id) : [];
    const showCount = connInfo.showCount || 50;
    const msgs = allMsgs.slice(-showCount);
    const hasMore = allMsgs.length > msgs.length;
    const isPending = contact.status === 'pending';
    const isEncrypted = !!contact.peerPublicKeyJwk;

    const loadMore = hasMore ? `<div class="btn-row"><button class="btn block sm" data-action="load-more-messages">Load earlier messages</button></div>` : '';

    const bubbles = msgs.map((m) => `
      <div class="bubble-row ${m.from === 'me' ? 'out' : 'in'}">
        <div>
          <div class="bubble" data-msg="${m.id}">${esc(m.text)}
            ${m.reactions && m.reactions.length ? `<div class="bubble__reactions">${m.reactions.map((r) => `<span class="reaction-chip">${r}</span>`).join('')}</div>` : ''}
          </div>
          <div class="bubble__meta" style="${m.from === 'me' ? 'justify-content:flex-end' : ''}">
            <span>${timeShort(m.ts)}</span>
            ${m.from === 'me' ? `<span>· ${m.status}</span>` : ''}
            ${m.ttlExpiresAt ? '<span>· disappearing</span>' : ''}
            ${m.encrypted ? '<span>· 🔒</span>' : ''}
          </div>
        </div>
      </div>`).join('');

    const replyLock = isPending ? `
      <div class="reply-lock">
        <span>Accept this request to reply</span>
        <button class="btn primary sm" data-action="accept-request" data-id="${contact.id}">Accept</button>
      </div>` : '';

    const connectBanner = (!isPending && !connInfo.connected) ? `
      <div class="reply-lock">
        <span>${connInfo.connecting ? 'Connecting…' : 'Not connected — messages will be queued'}</span>
        ${!connInfo.connecting ? `<button class="btn sm" data-action="connect-contact" data-id="${contact.id}">Connect</button>` : ''}
      </div>` : '';

    const encryptionNote = !isPending ? `
      <div class="section-header" style="padding-top:0;display:flex;align-items:center;gap:5px">
        ${icon(isEncrypted ? 'lock' : 'unlock')} ${isEncrypted ? 'End-to-end encrypted' : 'Not yet encrypted — reconnect via QR or in-range pairing to enable'}
        ${isEncrypted ? `<button class="btn ghost sm" style="margin-left:auto" data-action="show-safety-number" data-id="${contact.id}">${contact.verified ? 'Verified ' + icon('shield') : 'Verify'}</button>` : ''}
      </div>` : '';

    const emojiStrip = !isPending ? `
      <div class="emoji-strip">
        ${['👍','❤️','😂','😮','🙏','🔥'].map((e) => `<button data-action="react" data-emoji="${e}" aria-label="React ${e}">${e}</button>`).join('')}
      </div>` : '';

    return `
      ${encryptionNote}
      <div class="thread">${loadMore}${bubbles || '<div class="empty-state"><p>No messages yet.</p></div>'}</div>
      ${replyLock}
      ${connectBanner}
      ${emojiStrip}
      <div class="composer">
        <input type="text" id="composer-input" placeholder="Message ${esc(contact.name)}" ${isPending ? 'disabled' : ''} aria-label="Message text">
        <button class="icon-btn" data-action="send" ${isPending ? 'disabled' : ''} aria-label="Send message">${icon('send')}</button>
      </div>
    `;
  }

  function threadHeaderActions(contactId) {
    const contact = S.contactById(contactId);
    if (!contact) return '';
    return `<button class="icon-btn" data-action="open-thread-menu" data-id="${contact.id}" aria-label="Contact options">${icon('more')}</button>`;
  }

  // -------------------- Group thread --------------------
  function groupThreadScreen(groupId, showCount) {
    const g = S.groupById(groupId);
    if (!g) return emptyState('chats', 'Group not found', '');
    const thread = S.threadByGroup(groupId) || { id: null };
    const allMsgs = thread.id ? S.messagesForThread(thread.id) : [];
    const count = showCount || 50;
    const msgs = allMsgs.slice(-count);
    const hasMore = allMsgs.length > msgs.length;
    const loadMore = hasMore ? `<div class="btn-row"><button class="btn block sm" data-action="load-more-messages">Load earlier messages</button></div>` : '';

    const bubbles = msgs.map((m) => `
      <div class="bubble-row ${m.from === 'me' ? 'out' : 'in'}">
        <div>
          ${m.from !== 'me' && m.senderName ? `<div class="bubble__meta" style="margin-bottom:2px">${esc(m.senderName)}</div>` : ''}
          <div class="bubble" data-msg="${m.id}">${esc(m.text)}
            ${m.reactions && m.reactions.length ? `<div class="bubble__reactions">${m.reactions.map((r) => `<span class="reaction-chip">${r}</span>`).join('')}</div>` : ''}
          </div>
          <div class="bubble__meta" style="${m.from === 'me' ? 'justify-content:flex-end' : ''}">
            <span>${timeShort(m.ts)}</span>
            ${m.from === 'me' ? `<span>· ${m.status}</span>` : ''}
          </div>
        </div>
      </div>`).join('');

    return `
      <div class="section-header">${(g.memberContactIds || []).length} members · messages sent individually to each</div>
      <div class="thread">${loadMore}${bubbles || '<div class="empty-state"><p>No messages yet.</p></div>'}</div>
      <div class="composer">
        <input type="text" id="composer-input" placeholder="Message ${esc(g.name)}" aria-label="Message text">
        <button class="icon-btn" data-action="send-group" data-id="${g.id}" aria-label="Send message">${icon('send')}</button>
      </div>
    `;
  }

  function groupThreadHeaderActions(groupId) {
    return `<button class="icon-btn" data-action="open-group-menu" data-id="${groupId}" aria-label="Group options">${icon('more')}</button>`;
  }

  // -------------------- Radar --------------------
  function radarScreen(scanning, found) {
    const blips = (found || []).map((f, i) => {
      const angle = (i / Math.max(found.length, 1)) * 2 * Math.PI;
      const r = 38;
      const x = 50 + r * Math.cos(angle);
      const y = 50 + r * Math.sin(angle);
      return `<div class="radar__blip" style="left:${x}%;top:${y}%"></div>`;
    }).join('');

    return `
      <div class="radar-wrap">
        <div class="radar ${scanning ? 'scanning' : ''}">
          <div class="radar__ring r1"></div>
          <div class="radar__ring r2"></div>
          <div class="radar__ring r3"></div>
          <div class="radar__sweep"></div>
          ${blips}
          <div class="radar__center"></div>
        </div>
        <div class="scan-status">${scanning ? 'Scanning for BT Zone devices…' : (found && found.length ? found.length + ' device(s) found' : 'Tap scan to look for nearby devices')}</div>
        <div class="btn-row" style="padding:0 0 8px">
          <button class="btn primary block" data-action="start-scan">${scanning ? 'Scanning…' : 'Scan for devices'}</button>
        </div>
        <div class="btn-row" style="padding:0">
          <button class="btn block" data-action="show-qr">${icon('qr')} My QR code</button>
          <button class="btn block" data-action="scan-qr">Scan a QR code</button>
        </div>
        <div class="btn-row" style="padding:0">
          <button class="btn ghost block" data-action="add-manual">Add manually</button>
        </div>
        <div class="btn-row" style="padding:0">
          <button class="btn ghost block" data-action="create-group">${icon('group')} Create group</button>
        </div>
      </div>
      <div class="found-list">${(found || []).map((f) => `
        <div class="list-row">
          ${avatar({ name: f.name })}
          <div class="list-row__body">
            <div class="list-row__name">${esc(f.name)}</div>
            <div class="list-row__meta">Nearby · tap to add</div>
          </div>
          <button class="btn sm" data-action="add-found" data-name="${esc(f.name)}" data-device="${esc(f.deviceId)}">Add</button>
        </div>`).join('')}</div>
    `;
  }

  // -------------------- Emergency / SOS --------------------
  function emergencyScreen() {
    const active = S.activeSOS();
    const mine = active.filter((s) => s.from === 'me');
    const theirs = active.filter((s) => s.from === 'them');

    const bannerHtml = theirs.length ? `
      <div class="sos-banner">
        <span class="sos-banner__dot"></span>
        <span>${theirs.length} emergency broadcast${theirs.length > 1 ? 's' : ''} nearby</span>
      </div>` : '';

    function card(s) {
      const acked = s.acks.find((a) => a.name === (S.state.profile ? S.state.profile.name : 'You'));
      return `<div class="sos-card">
        <div class="sos-card__head">
          ${avatar({ name: s.name })}
          <div>
            <div class="list-row__name">${esc(s.name)}${s.from === 'me' ? ' (you)' : ''}</div>
            <div class="list-row__meta">SOS · ${timeAgo(s.createdAt)} ago</div>
          </div>
        </div>
        ${s.message ? `<div class="sos-card__body">${esc(s.message)}</div>` : ''}
        <div class="sos-card__meta">Auto-expires in ${Math.max(0, Math.round((s.expiresAt - Date.now()) / 60000))} min</div>
        <div class="sos-card__acks">${s.acks.length ? s.acks.length + ' acknowledged: ' + s.acks.map((a) => esc(a.name)).join(', ') : 'No acknowledgements yet'}</div>
        <div class="sos-card__actions">
          ${s.from === 'them' && !acked ? `<button class="btn primary sm" data-action="ack-sos" data-id="${s.id}">Acknowledge</button>` : ''}
          <button class="btn danger sm" data-action="dismiss-sos" data-id="${s.id}">Dismiss</button>
        </div>
      </div>`;
    }

    const list = active.length
      ? active.map(card).join('')
      : emptyState('emergency', 'No active emergencies', 'SOS broadcasts from anyone in Bluetooth range will appear here, separate from your normal chats.');

    return `${bannerHtml}${list}
      <button class="sos-fab" data-action="open-sos-compose" aria-label="Send SOS">${icon('emergency').replace('currentColor', '#fff')}</button>`;
  }

  // -------------------- Settings --------------------
  function settingsScreen() {
    const p = S.state.profile || {};
    const s = S.state.settings;
    return `
      <div class="profile-card">
        ${avatar(p)}
        <div>
          <div class="list-row__name">${esc(p.name || 'You')}</div>
          <div class="list-row__meta">Your BT Zone identity — shown to others, separate from your device's Bluetooth name</div>
        </div>
      </div>
      <div class="btn-row"><button class="btn block" data-action="edit-profile">Edit name & photo</button></div>

      <div class="section-header">Appearance</div>
      <div class="chip-group">
        <button class="chip ${s.theme === 'dark' ? 'active' : ''}" data-action="set-theme" data-theme="dark">Dark</button>
        <button class="chip ${s.theme === 'light' ? 'active' : ''}" data-action="set-theme" data-theme="light">Light</button>
      </div>

      <div class="section-header">Notifications</div>
      <div class="settings-row">
        <div><div class="settings-row__label">Sound</div><div class="settings-row__desc">Distinct tone per event: message, request, SOS</div></div>
        <button class="switch ${s.soundEnabled ? 'on' : ''}" data-action="toggle-sound"></button>
      </div>
      <div class="settings-row">
        <div><div class="settings-row__label">Vibration</div><div class="settings-row__desc">Distinct pattern per event</div></div>
        <button class="switch ${s.vibrationEnabled ? 'on' : ''}" data-action="toggle-vibration"></button>
      </div>

      <div class="section-header">Messages</div>
      <div class="form-group">
        <label>Auto-delete messages after (hours, 0 = never)</label>
        <input type="text" inputmode="numeric" id="ttl-input" value="${s.ttlDefaultHours}">
      </div>
      <div class="btn-row"><button class="btn block" data-action="save-ttl">Save</button></div>

      <div class="section-header">Privacy</div>
      <div class="list-row" data-nav="#/blocklist">
        <div class="list-row__body"><div class="list-row__name">Blocklist</div><div class="list-row__meta">${S.state.blocklist.length} blocked</div></div>
      </div>
      <div class="settings-row">
        <div><div class="settings-row__label">App lock</div><div class="settings-row__desc">Require a PIN to open BT Zone</div></div>
        <button class="switch ${s.appLockEnabled ? 'on' : ''}" data-action="toggle-app-lock"></button>
      </div>

      <div class="section-header">Data</div>
      <div class="btn-row"><button class="btn block" data-action="export-backup">Export / backup data</button></div>
      <div class="btn-row">
        <button class="btn block" data-action="import-backup">Import backup</button>
        <input type="file" id="import-file" accept="application/json" style="display:none">
      </div>

      <div class="section-header">About</div>
      <div class="list-row" data-nav="#/whatsnew">
        <div class="list-row__body"><div class="list-row__name">What's new</div><div class="list-row__meta">Version ${window.BTZONE_CHANGELOG[0].version}</div></div>
      </div>
      <div class="settings-row">
        <div><div class="settings-row__label">Demo mode</div><div class="settings-row__desc">Simulate a peer device — no hardware needed to try the app</div></div>
        <button class="switch ${s.demoMode ? 'on' : ''}" data-action="toggle-demo"></button>
      </div>
      ${s.demoMode ? `
      <div class="section-header">Demo tools</div>
      <div class="btn-row">
        <button class="btn block" data-action="sim-request">Simulate incoming request</button>
      </div>
      <div class="btn-row">
        <button class="btn block" data-action="sim-sos">Simulate incoming SOS</button>
      </div>` : ''}
      <p style="text-align:center;color:var(--text-tertiary);font-size:12px;padding:24px 20px 8px">
        Your messages and contacts are stored only on this device and never sent anywhere but directly, over Bluetooth, to the person you're messaging.
      </p>
    `;
  }

  function blocklistScreen() {
    const list = S.state.blocklist;
    if (!list.length) return emptyState('settings', 'Blocklist is empty', 'People you block will appear here so you can unblock them later.');
    return `<div class="list">${list.map((b) => `
      <div class="list-row">
        ${avatar({ name: b.name })}
        <div class="list-row__body">
          <div class="list-row__name">${esc(b.name)}</div>
          <div class="list-row__meta">Blocked ${timeAgo(b.blockedAt)} ago</div>
        </div>
        <button class="btn sm" data-action="unblock" data-device="${esc(b.deviceId)}">Unblock</button>
      </div>`).join('')}</div>`;
  }

  function whatsNewSheet() {
    return window.BTZONE_CHANGELOG.map((entry) => `
      <div class="changelog-entry">
        <div class="changelog-entry__version">v${entry.version} · ${entry.date}</div>
        <ul>${entry.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>`).join('');
  }

  function emptyState(kind, title, body) {
    const glyphs = { chats: '💬', requests: '👋', emergency: '🚨', settings: '⚙️' };
    return `<div class="empty-state">
      <div class="empty-icon">${glyphs[kind] || '•'}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(body)}</p>
    </div>`;
  }

  function lockScreen(errorMsg) {
    return `
      <div class="empty-state" style="padding-top:80px">
        <div class="empty-icon">${icon('lock')}</div>
        <h3>BT Zone is locked</h3>
        <p>Enter your PIN to continue.</p>
      </div>
      <div class="form-group" style="border:none">
        <input type="password" inputmode="numeric" id="unlock-pin" placeholder="PIN" style="text-align:center;font-size:20px;letter-spacing:6px">
      </div>
      ${errorMsg ? `<p style="text-align:center;color:var(--flare);font-size:13px">${esc(errorMsg)}</p>` : ''}
      <div class="btn-row"><button class="btn primary block" data-action="submit-unlock">Unlock</button></div>
    `;
  }

  function loadingScreen() {
    return `<div class="empty-state"><div class="empty-icon">📡</div><p>Loading BT Zone…</p></div>`;
  }

  // -------------------- Search --------------------
  function searchSheet(query, results) {
    return `
      <div class="form-group" style="border:none;padding:0 0 10px">
        <input type="text" id="search-input" placeholder="Search messages" value="${esc(query || '')}" autofocus>
      </div>
      <div id="search-results">${searchResultsHtml(results)}</div>
    `;
  }
  function searchResultsHtml(results) {
    if (!results) return '';
    if (!results.length) return `<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:20px 0">No messages found.</p>`;
    return results.map((r) => `
      <div class="list-row" data-action="goto-search-result" data-contact="${r.navContactId || ''}" data-group="${r.groupId || ''}">
        <div class="list-row__body">
          <div class="list-row__top"><span class="list-row__name">${esc(r.title)}</span><span class="list-row__time">${timeAgo(r.message.ts)}</span></div>
          <div class="list-row__sub">${esc(r.message.text)}</div>
        </div>
      </div>`).join('');
  }

  // -------------------- Safety number --------------------
  function safetyNumberSheet(digits, verified, contactId) {
    return `
      <p style="color:var(--text-secondary);font-size:13.5px;margin-bottom:14px">Compare these numbers with the other person in person or over a channel you both trust. If they match, you can be confident no one is intercepting your connection.</p>
      <div style="text-align:center;font-family:var(--font-mono);font-size:20px;letter-spacing:2px;background:var(--surface-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:16px">${esc(digits)}</div>
      <div class="btn-row">
        <button class="btn ${verified ? 'danger' : 'primary'} block" data-action="toggle-verified" data-id="${contactId}">${verified ? 'Remove verification' : 'Mark as verified'}</button>
      </div>
    `;
  }

  // -------------------- Onboarding --------------------
  const ONBOARDING_STEPS = [
    { title: 'Welcome to BT Zone', body: 'Message people directly over Bluetooth — no signal, Wi-Fi, or cell service needed. Built for dead zones and emergencies.', glyph: '📡' },
    { title: 'Bluetooth range only', body: 'This only works with devices physically nearby. There\u2019s no internet relay and no mesh — just a direct link between two phones.', glyph: '📶' },
    { title: 'Requests keep you in control', body: 'Messages from people who aren\u2019t your contacts yet land in a separate Requests tab. You can read them, but can\u2019t reply until you accept, decline, or block.', glyph: '👋' },
    { title: 'SOS is different on purpose', body: 'Emergency broadcasts reach everyone in range and stay visible until acknowledged or dismissed — separate from your normal chats.', glyph: '🚨' }
  ];
  function onboardingSheet(step) {
    const s = ONBOARDING_STEPS[step];
    const isLast = step === ONBOARDING_STEPS.length - 1;
    return `
      <div class="empty-state" style="padding:20px 10px 10px">
        <div class="empty-icon">${s.glyph}</div>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.body)}</p>
      </div>
      <div class="chip-group" style="padding:0 16px 16px;justify-content:center">
        ${ONBOARDING_STEPS.map((_, i) => `<span style="width:6px;height:6px;border-radius:50%;background:${i === step ? 'var(--beacon)' : 'var(--border)'}"></span>`).join('')}
      </div>
      <div class="btn-row">
        ${step > 0 ? `<button class="btn block" data-action="onboarding-back">Back</button>` : ''}
        <button class="btn primary block" data-action="${isLast ? 'onboarding-done' : 'onboarding-next'}">${isLast ? 'Get started' : 'Next'}</button>
      </div>
    `;
  }

  // -------------------- Unsupported browser banner --------------------
  function unsupportedBannerHtml() {
    return `
      <div class="sos-banner" style="margin:12px 16px 0;background:color-mix(in srgb, var(--info) 15%, var(--surface));border-color:color-mix(in srgb, var(--info) 45%, var(--border))">
        <span>ℹ️</span>
        <span style="flex:1">Real Bluetooth messaging needs Chrome or Edge on Android or desktop. You can still explore everything here in Demo Mode.</span>
        <button class="icon-btn" data-action="dismiss-unsupported" aria-label="Dismiss" style="flex:0 0 auto">${icon('close')}</button>
      </div>`;
  }

  // -------------------- Group creation / menu --------------------
  function createGroupSheet(contacts, selected) {
    selected = selected || [];
    return `
      <div class="form-group" style="border:none"><label>Group name</label><input type="text" id="group-name" placeholder="e.g. Search Team"></div>
      <div class="section-header">Add members</div>
      <div class="list">${contacts.map((c) => `
        <label class="list-row" style="cursor:pointer">
          <input type="checkbox" class="group-member-check" value="${c.id}" ${selected.includes(c.id) ? 'checked' : ''} style="width:18px;height:18px">
          ${avatar(c)}
          <div class="list-row__body"><div class="list-row__name">${esc(c.name)}</div></div>
        </label>`).join('') || '<div class="empty-state"><p>Add some direct contacts first.</p></div>'}</div>
      <div class="btn-row"><button class="btn primary block" data-action="submit-create-group">Create group</button></div>
    `;
  }

  function groupMenuSheet(group) {
    const members = S.memberContacts(group);
    return `
      <div class="section-header">Members</div>
      <div class="list">${members.map((c) => `<div class="list-row">${avatar(c)}<div class="list-row__body"><div class="list-row__name">${esc(c.name)}</div></div></div>`).join('')}</div>
      <div class="btn-row"><button class="btn danger block" data-action="leave-group" data-id="${group.id}">Delete group</button></div>
    `;
  }

  window.BTZoneRender = {
    esc, icon, avatar, initials, timeAgo, timeShort,
    chatsScreen, requestsScreen, threadScreen, threadHeaderActions,
    groupThreadScreen, groupThreadHeaderActions,
    radarScreen, emergencyScreen, settingsScreen, blocklistScreen, whatsNewSheet, emptyState,
    lockScreen, loadingScreen, searchSheet, searchResultsHtml, safetyNumberSheet,
    onboardingSheet, ONBOARDING_STEPS, unsupportedBannerHtml, createGroupSheet, groupMenuSheet
  };
})();
