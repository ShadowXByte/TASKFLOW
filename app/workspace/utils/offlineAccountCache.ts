import type { Task } from "../types";
import { readJsonFromStorage, safeStorageGetItem, safeStorageSetItem } from "./storage";

export const LAST_TASKS_CACHE_KEY_STORAGE = "taskflow_last_tasks_cache_key";

export const readCachedTasksByKey = (cacheKey: string) => readJsonFromStorage<Task[]>(cacheKey, []);

export const resolveBestAccountTasksCacheKey = (options: {
  primaryCacheKey: string;
  tasksCachePrefix: string;
  persistedAccountKey?: string;
}) => {
  const { primaryCacheKey, tasksCachePrefix, persistedAccountKey } = options;

  const previouslyResolvedKey = safeStorageGetItem(LAST_TASKS_CACHE_KEY_STORAGE)?.trim();
  if (previouslyResolvedKey && readCachedTasksByKey(previouslyResolvedKey).length > 0) {
    return previouslyResolvedKey;
  }

  if (readCachedTasksByKey(primaryCacheKey).length > 0) {
    safeStorageSetItem(LAST_TASKS_CACHE_KEY_STORAGE, primaryCacheKey);
    return primaryCacheKey;
  }

  if (persistedAccountKey) {
    const persistedKey = `${tasksCachePrefix}:${persistedAccountKey}`;
    if (readCachedTasksByKey(persistedKey).length > 0) {
      safeStorageSetItem(LAST_TASKS_CACHE_KEY_STORAGE, persistedKey);
      return persistedKey;
    }
  }

  if (typeof window === "undefined") {
    return primaryCacheKey;
  }

  const prefix = `${tasksCachePrefix}:`;
  let bestKey = primaryCacheKey;
  let bestSize = 0;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(prefix)) {
      continue;
    }

    const candidateSize = readCachedTasksByKey(key).length;
    if (candidateSize > bestSize) {
      bestSize = candidateSize;
      bestKey = key;
    }
  }

  safeStorageSetItem(LAST_TASKS_CACHE_KEY_STORAGE, bestKey);
  return bestKey;
};
