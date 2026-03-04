// Utilities for safe localStorage access
// NOTE: We're using localStorage instead of IndexedDB because it's simpler
// and sufficient for our use case (task data is relatively small)

export const safeStorageGetItem = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;  // Private browsing mode or storage quota exceeded
  }
};

export const safeStorageSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    return; // Silently fail in private browsing mode
  }
};

export const safeStorageRemoveItem = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
};

export const readJsonFromStorage = <T,>(key: string, fallback: T): T => {
  const raw = safeStorageGetItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;  // Return fallback on parse error
  }
};
