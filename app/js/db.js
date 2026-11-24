// Stockage local (IndexedDB) — les données restent sur la tablette.
const DB = (() => {
  const NAME = 'suivi-chantier';
  const VERSION = 2;
  const STORES = ['affaires', 'visites', 'observations', 'photos', 'plans', 'meta'];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('affaires')) db.createObjectStore('affaires', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('visites')) {
          db.createObjectStore('visites', { keyPath: 'id' }).createIndex('affaireId', 'affaireId');
        }
        if (!db.objectStoreNames.contains('observations')) {
          db.createObjectStore('observations', { keyPath: 'id' }).createIndex('affaireId', 'affaireId');
        }
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        // Version 2 : fonds de plans
        if (!db.objectStoreNames.contains('plans')) {
          db.createObjectStore('plans', { keyPath: 'id' }).createIndex('affaireId', 'affaireId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function store(name, mode = 'readonly') {
    const db = await open();
    return db.transaction(name, mode).objectStore(name);
  }

  return {
    STORES,
    async get(name, id) { return id ? wrap((await store(name)).get(id)) : undefined; },
    async put(name, obj) {
      obj.updatedAt = new Date().toISOString();
      await wrap((await store(name, 'readwrite')).put(obj));
      return obj;
    },
    async putRaw(name, obj) { return wrap((await store(name, 'readwrite')).put(obj)); },
    async del(name, id) { return wrap((await store(name, 'readwrite')).delete(id)); },
    async all(name) { return wrap((await store(name)).getAll()); },
    async byAffaire(name, affaireId) {
      return wrap((await store(name)).index('affaireId').getAll(affaireId));
    },
    async getMeta(id, def) {
      const r = await wrap((await store('meta')).get(id));
      return r ? r.value : def;
    },
    async setMeta(id, value) { return wrap((await store('meta', 'readwrite')).put({ id, value })); },
  };
})();

// Demande au navigateur de ne pas effacer les données en cas de manque de place.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
