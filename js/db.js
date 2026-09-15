// BT Zone — IndexedDB data layer
// Stores: profile, contacts, threads, messages, blocklist, sos, meta
(function () {
  const DB_NAME = 'btzone-db';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('threads')) {
          const t = db.createObjectStore('threads', { keyPath: 'id' });
          t.createIndex('byUpdated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('messages')) {
          const m = db.createObjectStore('messages', { keyPath: 'id' });
          m.createIndex('byThread', 'threadId');
        }
        if (!db.objectStoreNames.contains('blocklist')) {
          db.createObjectStore('blocklist', { keyPath: 'deviceId' });
        }
        if (!db.objectStoreNames.contains('sos')) {
          const s = db.createObjectStore('sos', { keyPath: 'id' });
          s.createIndex('byCreated', 'createdAt');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(storeName, mode = 'readonly') {
    return open().then((db) => db.transaction(storeName, mode).objectStore(storeName));
  }

  function all(storeName) {
    return tx(storeName).then((store) => new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function get(storeName, key) {
    return tx(storeName).then((store) => new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }));
  }

  function put(storeName, value) {
    return tx(storeName, 'readwrite').then((store) => new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    }));
  }

  function del(storeName, key) {
    return tx(storeName, 'readwrite').then((store) => new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    }));
  }

  function byIndex(storeName, indexName, value) {
    return tx(storeName).then((store) => new Promise((resolve, reject) => {
      const idx = store.index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  async function exportAll() {
    const [profile, contacts, threads, messages, blocklist, sos, meta] = await Promise.all([
      all('profile'), all('contacts'), all('threads'), all('messages'), all('blocklist'), all('sos'), all('meta')
    ]);
    return {
      exportedAt: new Date().toISOString(),
      appVersion: (window.BTZONE_CHANGELOG && window.BTZONE_CHANGELOG[0]) ? window.BTZONE_CHANGELOG[0].version : 'unknown',
      profile, contacts, threads, messages, blocklist, sos, meta
    };
  }

  async function importAll(data) {
    const stores = ['profile', 'contacts', 'threads', 'messages', 'blocklist', 'sos', 'meta'];
    for (const s of stores) {
      if (!Array.isArray(data[s])) continue;
      const store = await tx(s, 'readwrite');
      for (const item of data[s]) {
        store.put(item);
      }
    }
    return true;
  }

  window.BTZoneDB = { get, put, del, all, byIndex, exportAll, importAll };
})();
