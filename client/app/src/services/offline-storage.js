const DATABASE_NAME = 'orbit-offline';
const DATABASE_VERSION = 1;
const STORE_NAME = 'settings';
export const USER_SETTINGS_KEY = 'orbit-user-settings';

/** @returns {Promise<IDBDatabase|null>} */
function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

/** @param {string} key @param {any} fallback @returns {Promise<any>} */
export async function readOffline(key, fallback) {
  try {
    const database = await openDatabase();
    if (!database) return fallback;
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        database.close();
        resolve(request.result ?? fallback);
      };
      request.onerror = () => {
        database.close();
        reject(request.error ?? new Error('Failed to read IndexedDB data.'));
      };
    });
  } catch (error) {
    console.warn(`Failed to read offline data: ${key}`, error);
    return fallback;
  }
}

/** @param {string} key @param {any} value @returns {Promise<void>} */
export async function writeOffline(key, value) {
  try {
    const database = await openDatabase();
    if (!database) return;
    const storableValue = JSON.parse(JSON.stringify(value));
    await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(storableValue, key);
      request.onsuccess = () => {
        database.close();
        resolve(undefined);
      };
      request.onerror = () => {
        database.close();
        reject(request.error ?? new Error('Failed to write IndexedDB data.'));
      };
    });
  } catch (error) {
    console.warn(`Failed to write offline data: ${key}`, error);
  }
}

/** @param {string} key @returns {Promise<void>} */
export async function deleteOffline(key) {
  const database = await openDatabase();
  if (!database) return;

  await new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key);
    request.onsuccess = () => {
      database.close();
      resolve(undefined);
    };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('Failed to delete IndexedDB data.'));
    };
  });
}

/** @param {string[]} [preservedKeys=[]] @returns {Promise<void>} */
export async function clearOfflineCache(preservedKeys = []) {
  const database = await openDatabase();
  if (database) {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (!preservedKeys.includes(cursor.key)) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => {
        database.close();
        resolve(undefined);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('Failed to clear IndexedDB cache.'));
      };
    });
  }

  if (typeof caches !== 'undefined') {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter((name) => name.startsWith('orbit-shell-')).map((name) => caches.delete(name)));
  }
}
