'use client';

import { useCallback, useMemo } from 'react';
import type { Task, Routine, PendingAccountOperation, PendingRoutineOperation } from '../types';
import {
  safeStorageGetItem,
  safeStorageSetItem,
  safeStorageRemoveItem,
  readJsonFromStorage,
} from '../utils/storage';
import {
  LAST_TASKS_CACHE_KEY_STORAGE,
  readCachedTasksByKey,
  resolveBestAccountTasksCacheKey,
} from '../utils/offlineAccountCache';
import {
  ACCOUNT_TASKS_CACHE_PREFIX,
  ACCOUNT_ROUTINES_CACHE_PREFIX,
  ACCOUNT_PENDING_OPS_PREFIX,
  ACCOUNT_PENDING_ROUTINE_OPS_PREFIX,
} from '../utils/constants';

const LAST_ACCOUNT_KEY_STORAGE = "taskflow_last_account_key";

interface UseCacheManagementProps {
  accountKey: string;
  workspaceMode: 'guest' | 'account';
  status: 'authenticated' | 'loading' | 'unauthenticated';
  isOffline: boolean;
}

export function useCacheManagement({
  accountKey,
  workspaceMode,
  status,
  isOffline,
}: UseCacheManagementProps) {
  const accountTasksCacheKey = `${ACCOUNT_TASKS_CACHE_PREFIX}:${accountKey}`;
  const accountRoutinesCacheKey = `${ACCOUNT_ROUTINES_CACHE_PREFIX}:${accountKey}`;
  const accountPendingOpsKey = `${ACCOUNT_PENDING_OPS_PREFIX}:${accountKey}`;
  const accountPendingRoutineOpsKey = `${ACCOUNT_PENDING_ROUTINE_OPS_PREFIX}:${accountKey}`;

  const readAccountCachedTasks = useCallback(() => {
    return readJsonFromStorage<Task[]>(accountTasksCacheKey, []);
  }, [accountTasksCacheKey]);

  const bestAccountTasksCacheKey = useMemo(() => {
    const persistedAccountKey = safeStorageGetItem(LAST_ACCOUNT_KEY_STORAGE)?.trim() || undefined;
    return resolveBestAccountTasksCacheKey({
      primaryCacheKey: accountTasksCacheKey,
      tasksCachePrefix: ACCOUNT_TASKS_CACHE_PREFIX,
      persistedAccountKey,
    });
  }, [accountTasksCacheKey]);

  const readBestAvailableAccountCachedTasks = useCallback(() => {
    return readCachedTasksByKey(bestAccountTasksCacheKey);
  }, [bestAccountTasksCacheKey]);

  const writeAccountCachedTasks = useCallback((nextTasks: Task[]) => {
    safeStorageSetItem(accountTasksCacheKey, JSON.stringify(nextTasks));
    safeStorageSetItem(LAST_TASKS_CACHE_KEY_STORAGE, accountTasksCacheKey);
  }, [accountTasksCacheKey]);

  const readAccountCachedRoutines = useCallback(() => {
    return readJsonFromStorage<any[]>(accountRoutinesCacheKey, []);
  }, [accountRoutinesCacheKey]);

  const bestAccountRoutinesCacheKey = useMemo(() => {
    if (readJsonFromStorage<any[]>(accountRoutinesCacheKey, []).length > 0) {
      return accountRoutinesCacheKey;
    }

    const persistedAccountKey = safeStorageGetItem(LAST_ACCOUNT_KEY_STORAGE)?.trim();
    if (persistedAccountKey) {
      const persistedKey = `${ACCOUNT_ROUTINES_CACHE_PREFIX}:${persistedAccountKey}`;
      if (readJsonFromStorage<any[]>(persistedKey, []).length > 0) {
        return persistedKey;
      }
    }

    return accountRoutinesCacheKey;
  }, [accountRoutinesCacheKey]);

  const readBestAvailableAccountCachedRoutines = useCallback(() => {
    return readJsonFromStorage<any[]>(bestAccountRoutinesCacheKey, []);
  }, [bestAccountRoutinesCacheKey]);

  const writeAccountCachedRoutines = useCallback((nextRoutines: any[]) => {
    safeStorageSetItem(accountRoutinesCacheKey, JSON.stringify(nextRoutines));
  }, [accountRoutinesCacheKey]);

  const readPendingAccountOps = useCallback(() => {
    return readJsonFromStorage<PendingAccountOperation[]>(accountPendingOpsKey, []);
  }, [accountPendingOpsKey]);

  const writePendingAccountOps = useCallback((ops: PendingAccountOperation[]) => {
    if (!ops.length) {
      safeStorageRemoveItem(accountPendingOpsKey);
      return;
    }

    safeStorageSetItem(accountPendingOpsKey, JSON.stringify(ops));
  }, [accountPendingOpsKey]);

  // Queue up operations when offline - they'll sync when connection returns
  const pushPendingAccountOp = useCallback((operation: PendingAccountOperation) => {
    const currentOps = readPendingAccountOps();
    currentOps.push(operation);
    writePendingAccountOps(currentOps);
  }, [readPendingAccountOps, writePendingAccountOps]);

  const readPendingRoutineOps = useCallback(() => {
    return readJsonFromStorage<PendingRoutineOperation[]>(accountPendingRoutineOpsKey, []);
  }, [accountPendingRoutineOpsKey]);

  const writePendingRoutineOps = useCallback((ops: PendingRoutineOperation[]) => {
    if (!ops.length) {
      safeStorageRemoveItem(accountPendingRoutineOpsKey);
      return;
    }

    safeStorageSetItem(accountPendingRoutineOpsKey, JSON.stringify(ops));
  }, [accountPendingRoutineOpsKey]);

  const pushPendingRoutineOp = useCallback((operation: PendingRoutineOperation) => {
    const currentOps = readPendingRoutineOps();
    currentOps.push(operation);
    writePendingRoutineOps(currentOps);
  }, [readPendingRoutineOps, writePendingRoutineOps]);

  const flushPendingAccountOps = useCallback(async (
    onTasksUpdated: (tasks: Task[]) => void
  ) => {
    if (workspaceMode !== "account" || status !== "authenticated" || isOffline) {
      console.log("[SYNC] Skipping flush - workspaceMode:", workspaceMode, "status:", status, "isOffline:", isOffline);
      return;
    }

    const ops = readPendingAccountOps();
    if (!ops.length) {
      console.log("[SYNC] No pending account ops to flush");
      return;
    }

    console.log("[SYNC] Flushing", ops.length, "pending account operations");
    const tempIdMap = new Map<number, number>();
    let successCount = 0;
    let failCount = 0;

    try {
      for (const op of ops) {
        try {
          if (op.type === "create") {
            const response = await fetch("/api/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: op.task.title,
                description: op.task.description,
                dueDate: op.task.dueDate,
                dueTime: op.task.dueTime,
                priority: op.task.priority,
              }),
            });

            if (!response.ok) {
              throw new Error("create failed");
            }

            const created = (await response.json()) as Task;
            tempIdMap.set(op.tempId, created.id);
            successCount++;
            continue;
          }

          if (op.type === "update") {
            const resolvedId = tempIdMap.get(op.id) ?? op.id;
            if (resolvedId < 0) {
              continue;
            }

            const response = await fetch(`/api/tasks/${resolvedId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(op.changes),
            });

            if (!response.ok) {
              throw new Error("update failed");
            }
            successCount++;
            continue;
          }

          const resolvedId = tempIdMap.get(op.id) ?? op.id;
          if (resolvedId < 0) {
            continue;
          }

          const response = await fetch(`/api/tasks/${resolvedId}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            throw new Error("delete failed");
          }
          successCount++;
        } catch (opError) {
          console.error("[SYNC] Operation failed:", op.type, opError);
          failCount++;
          // Continue with next operation instead of failing entire sync
        }
      }

      console.log("[SYNC] Completed:", successCount, "succeeded,", failCount, "failed");

      // Only clear pending ops if all succeeded
      if (failCount === 0) {
        writePendingAccountOps([]);
        console.log("[SYNC] Cleared pending ops queue");
      } else {
        console.warn("[SYNC] Keeping failed ops in queue for retry");
      }

      // Always fetch fresh data after sync attempt
      const refresh = await fetch("/api/tasks", { cache: "no-store" });
      if (refresh.ok) {
        const freshTasks = (await refresh.json()) as Task[];
        console.log("[SYNC] Fetched", freshTasks.length, "fresh tasks from server");
        onTasksUpdated(freshTasks);
        writeAccountCachedTasks(freshTasks);
      }
    } catch (error) {
      console.error("[SYNC] Fatal error during sync:", error);
      return;
    }
  }, [isOffline, readPendingAccountOps, status, workspaceMode, writeAccountCachedTasks, writePendingAccountOps]);

  const flushPendingRoutineOps = useCallback(async (
    onRoutinesUpdated: (routines: Routine[]) => void
  ) => {
    if (workspaceMode !== "account" || status !== "authenticated" || isOffline) {
      console.log("[SYNC ROUTINES] Skipping flush - workspaceMode:", workspaceMode, "status:", status, "isOffline:", isOffline);
      return;
    }

    const ops = readPendingRoutineOps();
    if (!ops.length) {
      console.log("[SYNC ROUTINES] No pending routine ops to flush");
      return;
    }

    console.log("[SYNC ROUTINES] Flushing", ops.length, "pending routine operations");
    const tempIdMap = new Map<number, number>();
    let successCount = 0;
    let failCount = 0;

    try {
      for (const op of ops) {
        try {
          if (op.type === "create") {
            const response = await fetch("/api/routines", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: op.routine.title,
                description: op.routine.description,
                dayOfWeek: op.routine.dayOfWeek,
                time: op.routine.time,
                priority: op.routine.priority,
                isActive: op.routine.isActive,
              }),
            });

            if (!response.ok) {
              throw new Error("create failed");
            }

            const created = (await response.json()) as Routine;
            tempIdMap.set(op.tempId, created.id);
            successCount++;
            continue;
          }

          if (op.type === "update") {
            const resolvedId = tempIdMap.get(op.id) ?? op.id;
            if (resolvedId < 0) {
              continue;
            }

            const response = await fetch(`/api/routines/${resolvedId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(op.changes),
            });

            if (!response.ok) {
              throw new Error("update failed");
            }
            successCount++;
            continue;
          }

          const resolvedId = tempIdMap.get(op.id) ?? op.id;
          if (resolvedId < 0) {
            continue;
          }

          const response = await fetch(`/api/routines/${resolvedId}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            throw new Error("delete failed");
          }
          successCount++;
        } catch (opError) {
          console.error("[SYNC ROUTINES] Operation failed:", op.type, opError);
          failCount++;
          // Continue with next operation instead of failing entire sync
        }
      }

      console.log("[SYNC ROUTINES] Completed:", successCount, "succeeded,", failCount, "failed");

      // Only clear pending ops if all succeeded
      if (failCount === 0) {
        writePendingRoutineOps([]);
        console.log("[SYNC ROUTINES] Cleared pending ops queue");
      } else {
        console.warn("[SYNC ROUTINES] Keeping failed ops in queue for retry");
      }

      // Always fetch fresh data after sync attempt
      const refresh = await fetch("/api/routines", { cache: "no-store" });
      if (refresh.ok) {
        const freshRoutines = (await refresh.json()) as Routine[];
        console.log("[SYNC ROUTINES] Fetched", freshRoutines.length, "fresh routines from server");
        onRoutinesUpdated(freshRoutines);
        writeAccountCachedRoutines(freshRoutines);
      }
    } catch (error) {
      console.error("[SYNC ROUTINES] Fatal error during sync:", error);
      return;
    }
  }, [isOffline, readPendingRoutineOps, status, workspaceMode, writeAccountCachedRoutines, writePendingRoutineOps]);

  return {
    accountTasksCacheKey,
    accountRoutinesCacheKey,
    accountPendingOpsKey,
    accountPendingRoutineOpsKey,
    readAccountCachedTasks,
    readBestAvailableAccountCachedTasks,
    writeAccountCachedTasks,
    readAccountCachedRoutines,
    readBestAvailableAccountCachedRoutines,
    writeAccountCachedRoutines,
    readPendingAccountOps,
    writePendingAccountOps,
    pushPendingAccountOp,
    flushPendingAccountOps,
    readPendingRoutineOps,
    writePendingRoutineOps,
    pushPendingRoutineOp,
    flushPendingRoutineOps,
  };
}
