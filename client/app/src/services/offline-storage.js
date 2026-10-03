const STORAGE_PREFIX = 'orbit-offline:';

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

export function readOffline(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const value = localStorage.getItem(storageKey(key));
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    console.warn(`Failed to read offline data: ${key}`, error);
    return fallback;
  }
}

export function writeOffline(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to write offline data: ${key}`, error);
  }
}
