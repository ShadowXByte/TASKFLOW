'use client';

import { useEffect, useState } from 'react';
import { Session } from 'next-auth';
import {
  safeStorageGetItem,
  safeStorageSetItem,
  safeStorageRemoveItem,
  readJsonFromStorage,
} from '../utils/storage';
import { LAST_TASKS_CACHE_KEY_STORAGE } from '../utils/offlineAccountCache';

const CACHED_SESSION_KEY = "taskflow-cached-session";
const OFFLINE_ACCOUNT_READY_KEY = "taskflow-offline-account-ready";
const LAST_ACCOUNT_KEY_STORAGE = "taskflow_last_account_key";

interface UseOfflineSessionProps {
  workspaceMode: 'guest' | 'account';
  session: Session | null;
  status: 'authenticated' | 'loading' | 'unauthenticated';
  isOffline: boolean;
  accountKey?: string;
}

export function useOfflineSession({
  workspaceMode,
  session,
  status,
  isOffline,
  accountKey,
}: UseOfflineSessionProps) {
  const [offlineAccountMode, setOfflineAccountMode] = useState(false);
  const [hasCachedAccountSession, setHasCachedAccountSession] = useState(false);
  const [canRenderWorkspace, setCanRenderWorkspace] = useState(false);
  const [cachedUserInfo, setCachedUserInfo] = useState<{ email: string; name: string } | null>(null);

  // Restore cached session when offline in account mode
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const cachedSession = readJsonFromStorage<any>(CACHED_SESSION_KEY, null);
    const offlineAccountReady = safeStorageGetItem(OFFLINE_ACCOUNT_READY_KEY) === "1";
    const hasCachedAccount = Boolean(cachedSession?.user || offlineAccountReady);
    
    setHasCachedAccountSession(hasCachedAccount);

    if (workspaceMode === "account") {
      if (hasCachedAccount || status === "authenticated") {
        setCanRenderWorkspace(true);
      } else if (status === "unauthenticated") {
        setCanRenderWorkspace(false);
      }
    } else {
      setCanRenderWorkspace(true);
    }

    // In account mode: activate offline mode when JWT validation unavailable + offline-ready flag set
    if (workspaceMode === "account" && offlineAccountReady) {
      // JWT validation failed or network down + user has logged in before = use offline cached account
      if (status !== "authenticated") {
        setOfflineAccountMode(true);
        if (cachedSession?.user) {
          const email = cachedSession.user.email || "";
          const name = cachedSession.user.name || "";
          setCachedUserInfo({ email, name });
          
          const cachedAccountKey =
            cachedSession.user.id?.toString().trim() ||
            cachedSession.user.email?.toLowerCase().trim();
          if (cachedAccountKey) {
            safeStorageSetItem(LAST_ACCOUNT_KEY_STORAGE, cachedAccountKey);
          }
        }
      } else if (status === "authenticated") {
        setOfflineAccountMode(false);
      }
    }
  }, [workspaceMode, isOffline, status]);

  // Persist session to localStorage for offline account access
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Save session when authenticated
    if (status === "authenticated" && session?.user) {
      safeStorageSetItem(CACHED_SESSION_KEY, JSON.stringify(session));
      safeStorageSetItem(OFFLINE_ACCOUNT_READY_KEY, "1");
      setHasCachedAccountSession(true);
      setCanRenderWorkspace(true); // Allow rendering workspace
      const sessionAccountKey =
        session.user.id?.toString().trim() ||
        session.user.email?.toLowerCase().trim();
      if (sessionAccountKey) {
        safeStorageSetItem(LAST_ACCOUNT_KEY_STORAGE, sessionAccountKey);
      }
      setOfflineAccountMode(false);
    }

    // Clear offline mode when back online and authenticated
    if (!isOffline && status === "authenticated") {
      setOfflineAccountMode(false);
    }
  }, [status, session, isOffline, accountKey]);

  const clearCachedAccountSession = () => {
    safeStorageRemoveItem(CACHED_SESSION_KEY);
    safeStorageRemoveItem(OFFLINE_ACCOUNT_READY_KEY);
    safeStorageRemoveItem(LAST_ACCOUNT_KEY_STORAGE);
    safeStorageRemoveItem(LAST_TASKS_CACHE_KEY_STORAGE);

    // Also clear all cached account data (tasks, routines, pending ops)
    if (accountKey) {
      safeStorageRemoveItem(`taskflow_account_tasks:${accountKey}`);
      safeStorageRemoveItem(`taskflow_account_routines:${accountKey}`);
      safeStorageRemoveItem(`taskflow_account_pending_ops:${accountKey}`);
      safeStorageRemoveItem(`taskflow_account_routine_completions:${accountKey}`);
    }

    setHasCachedAccountSession(false);
    setOfflineAccountMode(false);
    setCanRenderWorkspace(false); // Reset rendering flag on logout
  };

  return {
    offlineAccountMode,
    hasCachedAccountSession,
    canRenderWorkspace,
    cachedUserInfo,
    clearCachedAccountSession,
  };
}
