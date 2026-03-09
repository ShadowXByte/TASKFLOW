"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import ClientWrapper from "./ClientWrapper";
import { ConfirmDialog } from "./components/shared/ConfirmDialog";
import { PriorityBadge } from "./components/shared/PriorityBadge";
import { AlertMessage } from "./components/shared/AlertMessage";

// Types
import type {
  Task,
  TaskPriority,
  TaskFilter,
  WorkspaceMode,
  WorkspaceSection,
  AnalyticsView,
  AuthTab,
  BeforeInstallPromptEvent,
  PendingAccountOperation,
} from "./types";

// Utils
import {
  toDateInputValue,
  formatDisplayDate,
  parseDisplayDate,
  isValidTime,
} from "./utils/dateHelpers";
import {
  safeStorageGetItem,
  safeStorageSetItem,
  safeStorageRemoveItem,
  readJsonFromStorage,
} from "./utils/storage";
import {
  readGuestTasks,
  writeGuestTasks,
  readGuestRoutines,
  writeGuestRoutines,
  generateRoutineTasksForDate,
  readNotifiedKeys,
  urlBase64ToUint8Array,
} from "./utils/taskHelpers";
import { LAST_TASKS_CACHE_KEY_STORAGE } from "./utils/offlineAccountCache";
import { useCacheManagement } from "./hooks/useCacheManagement";
import { useOfflineSession } from "./hooks/useOfflineSession";
import { useAnalytics } from "./hooks/useAnalytics";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useProfileManagement } from "./hooks/useProfileManagement";
import { useTaskFiltering } from "./hooks/useTaskFiltering";
import { useInfiniteScroll } from "./hooks/useInfiniteScroll";
import {
  WEEKDAYS,
  GUEST_TASKS_KEY,
  GUEST_ROUTINES_KEY,
  THEME_KEY,
  NOTIFICATION_ASKED_KEY,
  NOTIFIED_TASKS_KEY,
  ACCOUNT_MIGRATION_DECISION_PREFIX,
  PRIORITIES,
  SW_PATH,
} from "./utils/constants";

// Dynamic imports for code splitting (lazy load section components)
const TodaySection = dynamic(() => import("./components/sections/TodaySection").then(mod => ({ default: mod.TodaySection })), {
  loading: () => <SectionLoadingFallback />,
  ssr: true,
});

const AllTasksSection = dynamic(() => import("./components/sections/AllTasksSection").then(mod => ({ default: mod.AllTasksSection })), {
  loading: () => <SectionLoadingFallback />,
  ssr: true,
});

const RoutineSection = dynamic(() => import("./components/sections/RoutineSection").then(mod => ({ default: mod.RoutineSection })), {
  loading: () => <SectionLoadingFallback />,
  ssr: true,
});

const AnalyticsSection = dynamic(() => import("./components/sections/AnalyticsSection").then(mod => ({ default: mod.AnalyticsSection })), {
  loading: () => <SectionLoadingFallback />,
  ssr: true,
});

const AccountSection = dynamic(() => import("./components/sections/AccountSection").then(mod => ({ default: mod.AccountSection })), {
  loading: () => <SectionLoadingFallback />,
  ssr: true,
});

// Loading fallback component for sections
function SectionLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
        <p className="mt-4 text-slate-600">Loading section...</p>
      </div>
    </div>
  );
}
function PageContent() {
  const params = useSearchParams();
  const modeFromQuery = params.get("mode") === "guest" ? "guest" : "account";
  const { data: session, status, update } = useSession();

  const today = useMemo(() => toDateInputValue(new Date()), []);
  // console.log('[WORKSPACE]', { mode: workspaceMode, status, tasksCount: tasks.length }); // Debug
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(modeFromQuery);
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [deleteTaskDialogOpen, setDeleteTaskDialogOpen] = useState(false);
  const [pendingTaskDeleteId, setPendingTaskDeleteId] = useState<number | null>(null);
  const [deleteTaskBusy, setDeleteTaskBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDateInput, setDueDateInput] = useState(formatDisplayDate(today));
  const [dueTimeInput, setDueTimeInput] = useState("09:00");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [search, setSearch] = useState("");
  const [allTasksDateFilter, setAllTasksDateFilter] = useState("");
  const [allTasksDisplayCount, setAllTasksDisplayCount] = useState(20);
  const [allTasksSortNewest, setAllTasksSortNewest] = useState(true);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([]);
  const [editDueDateInput, setEditDueDateInput] = useState(formatDisplayDate(today));
  const [editDueTimeInput, setEditDueTimeInput] = useState("09:00");
  const [editPriority, setEditPriority] = useState<TaskPriority>("MEDIUM");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstallApp, setCanInstallApp] = useState(false);
  const [isInstalledApp, setIsInstalledApp] = useState(false);
  const [chartAnimated, setChartAnimated] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [offlineWarmupTotal, setOfflineWarmupTotal] = useState(0);
  const [offlineWarmupCompleted, setOfflineWarmupCompleted] = useState(0);
  const [offlineWarmupDone, setOfflineWarmupDone] = useState(false);
  const [offlineWarmupMinimumTimeElapsed, setOfflineWarmupMinimumTimeElapsed] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("today");
  const [analyticsView, setAnalyticsView] = useState<AnalyticsView>("both");
  const [selectedDate, setSelectedDate] = useState(today);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [guestUpgradeOpen, setGuestUpgradeOpen] = useState(false);
  const [guestUpgradeLoading, setGuestUpgradeLoading] = useState(false);
  const [guestUpgradeMessage, setGuestUpgradeMessage] = useState("");
  const addDatePickerRef = useRef<HTMLInputElement | null>(null);
  const editDatePickerRef = useRef<HTMLInputElement | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Routine state
  const [routines, setRoutines] = useState<import("./types").Routine[]>([]);
  const [routineTitle, setRoutineTitle] = useState("");
  const [routineDescription, setRoutineDescription] = useState("");
  const [routineDayOfWeek, setRoutineDayOfWeek] = useState<number>(7); // Default to Daily
  const [routineTime, setRoutineTime] = useState("09:00");
  const [routinePriority, setRoutinePriority] = useState<TaskPriority>("MEDIUM");
  const [editingRoutineId, setEditingRoutineId] = useState<number | null>(null);
  const [editRoutineTitle, setEditRoutineTitle] = useState("");
  const [editRoutineDescription, setEditRoutineDescription] = useState("");
  const [editRoutineDayOfWeek, setEditRoutineDayOfWeek] = useState<number>(7);
  const [editRoutineTime, setEditRoutineTime] = useState("09:00");
  const [editRoutinePriority, setEditRoutinePriority] = useState<TaskPriority>("MEDIUM");
  const [expandedRoutineIds, setExpandedRoutineIds] = useState<number[]>([]);
  const [deleteRoutineDialogOpen, setDeleteRoutineDialogOpen] = useState(false);
  const [pendingRoutineDeleteId, setPendingRoutineDeleteId] = useState<number | null>(null);
  const [deleteRoutineBusy, setDeleteRoutineBusy] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [loadingRoutines, setLoadingRoutines] = useState(false);
  const [nextGuestRoutineId, setNextGuestRoutineId] = useState(1);
  const [completedRoutineKeys, setCompletedRoutineKeys] = useState<string[]>([]);
  // Compute a stable account key that persists across session changes
  const accountKey = useMemo(() => {
    // Priority: authenticated session ID > authenticated session email > persisted key > input email > anonymous
    if (session?.user?.id) {
      const userId = session.user.id.toString();
      safeStorageSetItem("taskflow_current_account_key", userId);
      return userId;
    }

    if (session?.user?.email) {
      const email_lower = session.user.email.toLowerCase();
      safeStorageSetItem("taskflow_current_account_key", email_lower);
      return email_lower;
    }

    // Not authenticated - check if we have a persisted key from before
    const persistedKey = safeStorageGetItem("taskflow_current_account_key");
    if (persistedKey) {
      return persistedKey;
    }

    // Fallback to email input or anonymous
    const emailInputValue = email.toLowerCase().trim();
    return emailInputValue || "anonymous";
  }, [email, session?.user?.email, session?.user?.id]);

  // Local constant for direct storage checks (avoid race conditions with state)
  const OFFLINE_ACCOUNT_READY_KEY = "taskflow-offline-account-ready";
  const OFFLINE_WARMUP_DONE_KEY = "taskflow-offline-warmup-v3-done";

  const {
    offlineAccountMode,
    hasCachedAccountSession,
    canRenderWorkspace,
    cachedUserInfo,
    clearCachedAccountSession,
  } = useOfflineSession({
    workspaceMode,
    session,
    status,
    isOffline,
    accountKey,
  });

  const {
    accountTasksCacheKey,
    accountRoutinesCacheKey,
    accountPendingOpsKey,
    readAccountCachedTasks,
    readBestAvailableAccountCachedTasks,
    writeAccountCachedTasks,
    readBestAvailableAccountCachedRoutines,
    writeAccountCachedRoutines,
    pushPendingAccountOp,
    flushPendingAccountOps,
    pushPendingRoutineOp,
    flushPendingRoutineOps,
  } = useCacheManagement({
    accountKey,
    workspaceMode,
    status,
    isOffline,
  });

  const accountMigrationDecisionKey = `${ACCOUNT_MIGRATION_DECISION_PREFIX}:${accountKey}`;
  const routineCompletionsKey = workspaceMode === "guest"
    ? "taskflow_guest_routine_completions"
    : `taskflow_account_routine_completions:${accountKey}`;

  const getRoutineCompletionKey = (routineId: number, date: string) => `${routineId}:${date}`;

  const {
    pushConfigured,
    pushEnabled,
    pushStatusMessage,
    setPushEnabled,
    setPushStatusMessage,
    syncPushSubscription,
    requestNotificationPermission,
    triggerInstallPrompt,
  } = usePushNotifications({
    workspaceMode,
    status,
    notificationPermission,
    deferredInstallPrompt,
  });

  const {
    profileName,
    setProfileName,
    profileDateOfBirth,
    setProfileDateOfBirth,
    profileMessage,
    profileLoading,
    newEmailInput,
    setNewEmailInput,
    emailPassword,
    setEmailPassword,
    emailMessage,
    emailLoading,
    currentPasswordInput,
    setCurrentPasswordInput,
    newPasswordInput,
    setNewPasswordInput,
    passwordMessage,
    passwordLoading,
    deletePasswordInput,
    setDeletePasswordInput,
    deleteMessage,
    deleteLoading,
    saveProfile,
    changeEmail,
    changePassword,
    exportAccountData,
    deleteAccount,
  } = useProfileManagement();

  const { filteredTasks } = useTaskFiltering({
    tasks,
    routines,
    filter,
    search,
    today,
    allTasksDateFilter,
  });

  useEffect(() => {
    setWorkspaceMode(modeFromQuery);
  }, [modeFromQuery]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    setProfileName(session?.user?.name || "");
    setNewEmailInput(session?.user?.email || "");

    void fetch("/api/user/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { name?: string | null; dateOfBirth?: string | null };
        if (typeof payload.name === "string") {
          setProfileName(payload.name);
        } else if (payload.name === null) {
          setProfileName("");
        }
        if (typeof payload.dateOfBirth === "string") {
          setProfileDateOfBirth(payload.dateOfBirth.slice(0, 10));
        } else {
          setProfileDateOfBirth("");
        }
      })
      .catch(() => {
        return;
      });
  }, [session?.user?.email, session?.user?.name, status]);

  // Sync cached user info from offline session hook
  useEffect(() => {
    if (cachedUserInfo) {
      setEmail(cachedUserInfo.email);
      setName(cachedUserInfo.name);
    }
  }, [cachedUserInfo]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedTheme = safeStorageGetItem(THEME_KEY);
    if (savedTheme === "dark") {
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    safeStorageSetItem(THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setChartAnimated(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const detectInstalled = () => {
      const standaloneMode = window.matchMedia?.("(display-mode: standalone)")?.matches;
      const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
      const installed = Boolean(standaloneMode || iosStandalone);
      setIsInstalledApp(installed);
      if (installed) {
        setCanInstallApp(false);
        setDeferredInstallPrompt(null);
      }
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      detectInstalled();
      if (!isInstalledApp) {
        setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
        setCanInstallApp(true);
      }
    };

    const onInstalled = () => {
      setDeferredInstallPrompt(null);
      setCanInstallApp(false);
      setIsInstalledApp(true);
    };

    detectInstalled();
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [isInstalledApp]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateStatus = () => {
      setIsOffline(!navigator.onLine);
    };

    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  // Register service worker for offline support and push notifications
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const collectWarmupUrls = () => {
      const urls = new Set<string>([
        "/",
        "/workspace",
        "/workspace?mode=guest",
        "/workspace?mode=account",
        "/manifest.webmanifest",
        "/unnamed.jpg",
        "/unnamed.png",
      ]);

      const assetNodes = document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
        'script[src],link[rel="stylesheet"][href],link[rel="modulepreload"][href]',
      );

      assetNodes.forEach((node) => {
        const rawUrl = node instanceof HTMLScriptElement ? node.src : node.href;
        if (!rawUrl) {
          return;
        }

        try {
          const parsedUrl = new URL(rawUrl, window.location.origin);
          if (parsedUrl.origin === window.location.origin) {
            urls.add(`${parsedUrl.pathname}${parsedUrl.search}`);
          }
        } catch {
          return;
        }
      });

      return Array.from(urls);
    };

    const warmupDynamicSections = () => {
      window.setTimeout(() => {
        void Promise.allSettled([
          import("./components/sections/TodaySection"),
          import("./components/sections/AllTasksSection"),
          import("./components/sections/RoutineSection"),
          import("./components/sections/AnalyticsSection"),
          import("./components/sections/AccountSection"),
        ]);
      }, 800);
    };

    const postWarmupMessage = (registration: ServiceWorkerRegistration) => {
      if (safeStorageGetItem(OFFLINE_WARMUP_DONE_KEY) === "1") {
        setOfflineWarmupDone(true);
        return false;
      }

      const warmupUrls = collectWarmupUrls();
      setOfflineWarmupTotal(warmupUrls.length);
      setOfflineWarmupCompleted(0);
      setOfflineWarmupDone(false);

      const worker = registration.active || registration.waiting || registration.installing || navigator.serviceWorker.controller;
      if (!worker) {
        return false;
      }

      worker.postMessage({
        type: "WARMUP_URLS",
        urls: warmupUrls,
      });

      return true;
    };

    let cancelled = false;

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register(SW_PATH);
        if (cancelled) {
          return;
        }

        await navigator.serviceWorker.ready;
        if (cancelled) {
          return;
        }

        const shouldWarmup = postWarmupMessage(registration);
        if (shouldWarmup) {
          warmupDynamicSections();
        }
      } catch {
        return;
      }
    };

    void registerServiceWorker();

    const onControllerChange = () => {
      navigator.serviceWorker.ready
        .then((registration) => {
          const shouldWarmup = postWarmupMessage(registration);
          if (shouldWarmup) {
            warmupDynamicSections();
          }
        })
        .catch(() => {
          return;
        });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [OFFLINE_WARMUP_DONE_KEY]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (safeStorageGetItem(OFFLINE_WARMUP_DONE_KEY) === "1") {
      setOfflineWarmupDone(true);
      return;
    }

    const onServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        total?: number;
        completed?: number;
        done?: boolean;
      };

      if (!data?.type) {
        return;
      }

      if (data.type === "WARMUP_PROGRESS") {
        setOfflineWarmupTotal(Math.max(0, data.total || 0));
        setOfflineWarmupCompleted(Math.max(0, data.completed || 0));
        setOfflineWarmupDone(Boolean(data.done));
      }

      if (data.type === "WARMUP_DONE") {
        setOfflineWarmupTotal(Math.max(0, data.total || 0));
        setOfflineWarmupCompleted(Math.max(0, data.completed || data.total || 0));
        setOfflineWarmupDone(true);
        safeStorageSetItem(OFFLINE_WARMUP_DONE_KEY, "1");
      }
    };

    navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
    };
  }, [OFFLINE_WARMUP_DONE_KEY]);

  useEffect(() => {
    if (!offlineWarmupDone) {
      setOfflineWarmupMinimumTimeElapsed(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setOfflineWarmupMinimumTimeElapsed(true);
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [offlineWarmupDone]);

  const offlineWarmupPercent = useMemo(() => {
    if (offlineWarmupDone) {
      return 100;
    }

    if (!offlineWarmupTotal) {
      return 0;
    }

    const raw = Math.round((offlineWarmupCompleted / offlineWarmupTotal) * 100);
    return Math.min(100, Math.max(0, raw));
  }, [offlineWarmupCompleted, offlineWarmupDone, offlineWarmupTotal]);

  const showOfflineWarmup = (!offlineWarmupDone || !offlineWarmupMinimumTimeElapsed) && offlineWarmupTotal > 0;



  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    try {
      setNotificationPermission(Notification.permission);

      const asked = safeStorageGetItem(NOTIFICATION_ASKED_KEY);
      if (!asked && Notification.permission === "default") {
        safeStorageSetItem(NOTIFICATION_ASKED_KEY, "1");
        void Notification.requestPermission()
          .then((permission) => {
            setNotificationPermission(permission);
          })
          .catch(() => {
            setNotificationPermission("default");
          });
      }
    } catch {
      setNotificationPermission("unsupported");
    }
  }, []);

  useEffect(() => {
    const loadTasks = async () => {
      if (workspaceMode === "guest") {
        setTasks(readGuestTasks());
        // Initialize guest routine ID counter
        const guestRoutines = readGuestRoutines();
        if (guestRoutines.length > 0) {
          const maxId = Math.max(...guestRoutines.map((r) => r.id));
          setNextGuestRoutineId(maxId + 1);
        } else {
          setNextGuestRoutineId(1);
        }
        return;
      }

      // In account mode: use cache when offline OR when auth endpoint is unavailable (JWT validation failed)
      // Read cache flag directly from storage to avoid race condition with state setting
      const hasOfflineAccountReady = safeStorageGetItem(OFFLINE_ACCOUNT_READY_KEY) === "1";
      if (offlineAccountMode || (status !== "authenticated" && hasOfflineAccountReady)) {
        setTasks(readBestAvailableAccountCachedTasks());
        return;
      }

      // Online in account mode: need authentication
      // Only clear tasks if there's no cached session at all (true logout, not just loading state)
      if (status !== "authenticated") {
        if (!hasOfflineAccountReady && !hasCachedAccountSession) {
          setTasks([]);
        }
        return;
      }

      setLoadingTasks(true);
      try {
        const response = await fetch("/api/tasks", { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as Task[];
          setTasks(data);
          writeAccountCachedTasks(data);
        }
      } catch {
        setTasks(readBestAvailableAccountCachedTasks());
      } finally {
        setLoadingTasks(false);
      }
    };

    void loadTasks();
  }, [
    hasCachedAccountSession,
    isOffline,
    offlineAccountMode,
    readAccountCachedTasks,
    readBestAvailableAccountCachedTasks,
    status,
    workspaceMode,
    writeAccountCachedTasks,
  ]);

  useEffect(() => {
    if (workspaceMode !== "account") {
      return;
    }

    // Always write to cache when authenticated OR when we have offline account access
    const hasOfflineAccountReady = safeStorageGetItem(OFFLINE_ACCOUNT_READY_KEY) === "1";
    const shouldWriteCache = status === "authenticated" || offlineAccountMode || hasCachedAccountSession || hasOfflineAccountReady;

    if (shouldWriteCache) {
      writeAccountCachedTasks(tasks);
    }
  }, [workspaceMode, status, offlineAccountMode, hasCachedAccountSession, tasks, writeAccountCachedTasks]);

  useEffect(() => {
    if (workspaceMode !== "account") {
      return;
    }

    // Always write to cache when authenticated OR when we have offline account access
    const hasOfflineAccountReady = safeStorageGetItem(OFFLINE_ACCOUNT_READY_KEY) === "1";
    const shouldWriteCache = status === "authenticated" || offlineAccountMode || hasCachedAccountSession || hasOfflineAccountReady;

    if (shouldWriteCache) {
      writeAccountCachedRoutines(routines);
    }
  }, [workspaceMode, status, offlineAccountMode, hasCachedAccountSession, routines, writeAccountCachedRoutines]);

  useEffect(() => {
    const raw = safeStorageGetItem(routineCompletionsKey);
    if (!raw) {
      setCompletedRoutineKeys([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const keys = parsed.filter((item): item is string => typeof item === "string");
        setCompletedRoutineKeys(keys);
      } else {
        setCompletedRoutineKeys([]);
      }
    } catch {
      setCompletedRoutineKeys([]);
    }
  }, [routineCompletionsKey]);

  useEffect(() => {
    safeStorageSetItem(routineCompletionsKey, JSON.stringify(completedRoutineKeys));
  }, [routineCompletionsKey, completedRoutineKeys]);

  const prevStatusRef = useRef<string>("loading");

  // Wrapper functions for sync with progress tracking
  const syncTasksWithProgress = useCallback(async () => {
    setSyncInProgress(true);
    setSyncProgress(0);
    setSyncMessage("Syncing tasks...");
    try {
      await new Promise<void>((resolve) => {
        void flushPendingAccountOps((freshTasks) => {
          setTasks(freshTasks);
          setSyncProgress(50);
          resolve();
        });
      });
    } finally {
      setSyncProgress(100);
    }
  }, [flushPendingAccountOps]);

  const syncRoutinesWithProgress = useCallback(async () => {
    setSyncMessage("Syncing routines...");
    try {
      await new Promise<void>((resolve) => {
        void flushPendingRoutineOps((freshRoutines) => {
          setRoutines(freshRoutines);
          setSyncProgress(100);
          resolve();
        });
      });
    } finally {
      // Hide the progress bar after a brief delay
      setTimeout(() => {
        setSyncInProgress(false);
        setSyncProgress(0);
        setSyncMessage("");
      }, 500);
    }
  }, [flushPendingRoutineOps]);

  const performFullSync = useCallback(async () => {
    setSyncInProgress(true);
    setSyncProgress(0);
    setSyncMessage("Syncing changes...");
    try {
      await syncTasksWithProgress();
      await syncRoutinesWithProgress();
    } catch (err) {
      console.error("[SYNC] Error during sync:", err);
    }
  }, [syncTasksWithProgress, syncRoutinesWithProgress]);

  // Trigger sync when:
  // 1. Auth status changes to authenticated (initial auth or re-auth)
  // 2. Online event fires
  // 3. Page comes back to foreground while online
  useEffect(() => {
    // Only sync if we're authenticated, online, and in account mode
    if (workspaceMode !== "account" || status !== "authenticated" || isOffline) {
      return;
    }

    // Check if we transitioned to authenticated or we're in a sync-eligible state
    const shouldFlush = prevStatusRef.current !== "authenticated";
    if (shouldFlush) {
      console.log("[SYNC] Status changed to authenticated, flushing pending ops...");
      void performFullSync();
    }

    prevStatusRef.current = status;
  }, [status, isOffline, workspaceMode, performFullSync]);

  // Listen for explicit online/visibility events
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => {
      console.log("[SYNC] Network came online");
      // Brief delay to let isOffline update
      setTimeout(() => {
        if (workspaceMode === "account" && status === "authenticated") {
          console.log("[SYNC] Flushing pending ops after network restored...");
          void performFullSync();
        }
      }, 100);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !isOffline && workspaceMode === "account" && status === "authenticated") {
        console.log("[SYNC] Page became visible while online, checking pending ops...");
        void performFullSync();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isOffline, workspaceMode, status, performFullSync]);

  // Load routines after mount/state changes (avoid render-time storage reads)
  useEffect(() => {
    if (workspaceMode === "guest") {
      const guestRoutines = readGuestRoutines();
      setRoutines(guestRoutines);
      if (guestRoutines.length > 0) {
        const maxId = Math.max(...guestRoutines.map((r) => r.id));
        setNextGuestRoutineId(maxId + 1);
      } else {
        setNextGuestRoutineId(1);
      }
      return;
    }

    if (workspaceMode === "account") {
      // Read cache flag directly from storage to avoid race condition with state setting
      const hasOfflineAccountReady = safeStorageGetItem(OFFLINE_ACCOUNT_READY_KEY) === "1";
      if (status === "authenticated" || offlineAccountMode || hasOfflineAccountReady) {
        void fetchRoutines();
      }
    }
  }, [workspaceMode, status, offlineAccountMode, isOffline]);

  // Refresh routines list when opening routine section
  useEffect(() => {
    if (activeSection === "routine") {
      void fetchRoutines();
    }
  }, [activeSection]);

  useEffect(() => {
    if (workspaceMode !== "account" || status !== "authenticated") {
      setGuestUpgradeOpen(false);
      return;
    }

    const guestTasks = readGuestTasks();
    if (!guestTasks.length) {
      setGuestUpgradeOpen(false);
      return;
    }

    const decided = safeStorageGetItem(accountMigrationDecisionKey);
    setGuestUpgradeOpen(!decided);
  }, [accountMigrationDecisionKey, status, workspaceMode]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      notificationPermission !== "granted"
    ) {
      return;
    }

    const tick = () => {
      const notifiedSet = readNotifiedKeys();
      const now = Date.now();

      for (const task of tasks) {
        if (task.completed || !isValidTime(task.dueTime)) {
          continue;
        }

        const dueTimestamp = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
        if (Number.isNaN(dueTimestamp)) {
          continue;
        }

        const notifyKey = `${workspaceMode}:${task.id}:${task.dueDate}:${task.dueTime}`;
        const shouldNotify = now >= dueTimestamp && now - dueTimestamp < 6 * 60 * 60 * 1000;

        if (shouldNotify && !notifiedSet.has(notifyKey)) {
          try {
            if (typeof Notification === "undefined" || Notification.permission !== "granted") {
              continue;
            }

            const title = `Task Due: ${task.title}`;
            const body = `Due at ${task.dueTime} on ${formatDisplayDate(task.dueDate)}`;
            new Notification(title, { body });
          } catch {
            continue;
          }
          notifiedSet.add(notifyKey);
        }
      }

      try {
        localStorage.setItem(NOTIFIED_TASKS_KEY, JSON.stringify(Array.from(notifiedSet).slice(-500)));
      } catch {
        return;
      }
    };

    tick();
    const interval = window.setInterval(tick, 30000);
    return () => window.clearInterval(interval);
  }, [tasks, workspaceMode, notificationPermission]);

  useEffect(() => {
    if (notificationPermission === "unsupported") {
      setPushEnabled(false);
      return;
    }

    void syncPushSubscription(notificationPermission as NotificationPermission);
  }, [workspaceMode, status, notificationPermission, syncPushSubscription, setPushEnabled]);

  // Calendar grid: 6 weeks x 7 days = 42 cells
  const calendarCells = useMemo(() => {
    const firstDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [monthCursor]);

  // Build per-day task status for calendar markers (pending vs completed)
  const calendarDayStatus = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();

    for (const cell of calendarCells) {
      const dateStr = toDateInputValue(cell);
      const regularTasks = tasks.filter((task) => task.dueDate === dateStr);
      const regularCompleted = regularTasks.filter((task) => task.completed).length;

      const existingRoutineIds = new Set(
        regularTasks
          .filter((task) => typeof task.routineId === "number" && task.routineId !== null)
          .map((task) => task.routineId as number),
      );

      const generatedRoutineTasks = generateRoutineTasksForDate(dateStr, routines).filter(
        (task) => !(typeof task.routineId === "number" && existingRoutineIds.has(task.routineId)),
      );

      const generatedCompleted = generatedRoutineTasks.filter((task) => {
        if (typeof task.routineId !== "number") {
          return false;
        }

        const completionKey = getRoutineCompletionKey(task.routineId, dateStr);
        return completedRoutineKeys.includes(completionKey);
      }).length;

      const total = regularTasks.length + generatedRoutineTasks.length;
      const completed = regularCompleted + generatedCompleted;

      if (total > 0) {
        map.set(dateStr, { total, completed });
      }
    }

    return map;
  }, [tasks, routines, calendarCells, completedRoutineKeys]);

  const tasksForSelectedDay = useMemo(
    () => {
      const regularTasks = tasks.filter((task) => task.dueDate === selectedDate);
      
      // Add routine-generated tasks
      let routineTasks: import("./types").Task[] = [];
      if (routines.length > 0) {
        routineTasks = generateRoutineTasksForDate(selectedDate, routines);
      }

      const routineTasksWithCompletion = routineTasks.map((task) => {
        if (typeof task.routineId !== "number") {
          return task;
        }

        const completionKey = getRoutineCompletionKey(task.routineId, selectedDate);
        return {
          ...task,
          completed: completedRoutineKeys.includes(completionKey),
        };
      });

      const existingRoutineIds = new Set(
        regularTasks
          .filter((task) => typeof task.routineId === "number" && task.routineId !== null)
          .map((task) => task.routineId as number),
      );

      const visibleRoutineTasks = routineTasksWithCompletion.filter(
        (task) => !(typeof task.routineId === "number" && existingRoutineIds.has(task.routineId)),
      );
      
      return [...regularTasks, ...visibleRoutineTasks].sort((a, b) => a.dueTime.localeCompare(b.dueTime));
    },
    [tasks, selectedDate, workspaceMode, routines, completedRoutineKeys],
  );

  // Filter + search logic for All Tasks view
  // NOTE: This could probably be optimized but it works fine for <1000 tasks
  // filteredTasks is now provided by useTaskFiltering hook

  const sortedTasks = useMemo(
    () =>
      filteredTasks
        .slice()
        .sort((a, b) => (a.dueDate === b.dueDate ? a.dueTime.localeCompare(b.dueTime) : a.dueDate.localeCompare(b.dueDate))),
    [filteredTasks],
  );

  const displayedAllTasks = useMemo(() => {
    const ordered = allTasksSortNewest ? sortedTasks.slice().reverse() : sortedTasks;
    return ordered.slice(0, allTasksDisplayCount);
  }, [sortedTasks, allTasksSortNewest, allTasksDisplayCount]);

  const allTasksObserverTarget = useInfiniteScroll({
    onLoadMore: () => setAllTasksDisplayCount((prev) => prev + 20),
    enabled: allTasksDisplayCount < sortedTasks.length,
  });

  useEffect(() => {
    setAllTasksDisplayCount(20);
  }, [filter, search, allTasksDateFilter]);

  const {
    analytics,
    todayTasks,
    monthlyAnalytics,
    routineAnalytics,
    weeklyTrend,
    chartDistribution,
  } = useAnalytics({
    tasks,
    routines,
    completedRoutineKeys,
    today,
  });

  const submitAuth = async () => {
    setAuthMessage("");
    setAuthLoading(true);
    try {
      if (!email || !password) {
        setAuthMessage("Enter email and password.");
        return;
      }

      if (authTab === "register") {
        const registerResponse = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });

        if (!registerResponse.ok) {
          const error = (await registerResponse.json()) as { message?: string };
          setAuthMessage(error.message || "Unable to register.");
          return;
        }
      }

      const login = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (login?.error) {
        setAuthMessage("Invalid email or password.");
        return;
      }

      setName("");
      setEmail("");
      setPassword("");
      setAuthMessage("");
    } catch {
      setAuthMessage("Something went wrong.");
    } finally {
      setAuthLoading(false);
    }
  };

  // Mixed naming convention - some handlers use 'handle', some don't 🤷
  const addTask = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return;
    }

    const parsedDueDate = parseDisplayDate(dueDateInput);
    if (!parsedDueDate || !isValidTime(dueTimeInput)) {
      return;
    }

    if (workspaceMode === "guest") {
      const created: Task = {
        id: Date.now(), // Using timestamp as ID - good enough for guest mode
        title: cleanTitle,
        description: description.trim() || null,
        dueDate: parsedDueDate,
        dueTime: dueTimeInput,
        completed: false,
        priority,
      };
      const nextTasks = [...tasks, created];
      setTasks(nextTasks);
      writeGuestTasks(nextTasks);
      setTitle("");
      setDescription("");
      setDueTimeInput("09:00");
      setPriority("MEDIUM");
      return;
    }

    if (isOffline) {
      const offlineCreated: Task = {
        id: -Date.now(),
        title: cleanTitle,
        description: description.trim() || null,
        dueDate: parsedDueDate,
        dueTime: dueTimeInput,
        completed: false,
        priority,
      };
      setTasks((current) => [...current, offlineCreated]);
      pushPendingAccountOp({ type: "create", task: offlineCreated, tempId: offlineCreated.id });
      setTitle("");
      setDescription("");
      setDueTimeInput("09:00");
      setPriority("MEDIUM");
      return;
    }

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          description: description.trim() || "",
          dueDate: parsedDueDate,
          dueTime: dueTimeInput,
          priority,
        }),
      });

      if (!response.ok) {
        throw new Error("create failed");
      }

      const created = (await response.json()) as Task;
      setTasks((current) => [...current, created]);
    } catch {
      const offlineCreated: Task = {
        id: -Date.now(),
        title: cleanTitle,
        description: description.trim() || null,
        dueDate: parsedDueDate,
        dueTime: dueTimeInput,
        completed: false,
        priority,
      };
      setTasks((current) => [...current, offlineCreated]);
      pushPendingAccountOp({ type: "create", task: offlineCreated, tempId: offlineCreated.id });
    }

    setTitle("");
    setDescription("");
    setDueTimeInput("09:00");
    setPriority("MEDIUM");
  };

  const startEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    setEditDueDateInput(formatDisplayDate(task.dueDate));
    setEditDueTimeInput(task.dueTime);
    setEditPriority(task.priority);
  };

  const cancelEditTask = () => {
    setEditingTaskId(null);
    setEditTitle("");
    setEditDescription("");
    setEditDueDateInput(formatDisplayDate(today));
    setEditDueTimeInput("09:00");
    setEditPriority("MEDIUM");
  };

  const saveTaskEdit = async (taskId: number) => {
    const cleanTitle = editTitle.trim();
    const cleanDescription = editDescription.trim();
    const parsedEditDueDate = parseDisplayDate(editDueDateInput);
    if (!cleanTitle || !parsedEditDueDate || !isValidTime(editDueTimeInput)) {
      return;
    }

    if (workspaceMode === "guest") {
      const nextTasks = tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title: cleanTitle,
              description: cleanDescription || null,
              dueDate: parsedEditDueDate,
              dueTime: editDueTimeInput,
              priority: editPriority,
            }
          : task,
      );
      setTasks(nextTasks);
      writeGuestTasks(nextTasks);
      cancelEditTask();
      return;
    }

    if (isOffline) {
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                title: cleanTitle,
                description: cleanDescription || null,
                dueDate: parsedEditDueDate,
                dueTime: editDueTimeInput,
                priority: editPriority,
              }
            : task,
        ),
      );
      pushPendingAccountOp({
        type: "update",
        id: taskId,
        changes: {
          title: cleanTitle,
          description: cleanDescription || null,
          dueDate: parsedEditDueDate,
          dueTime: editDueTimeInput,
          priority: editPriority,
        },
      });
      cancelEditTask();
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          description: cleanDescription || "",
          dueDate: parsedEditDueDate,
          dueTime: editDueTimeInput,
          priority: editPriority,
        }),
      });

      if (!response.ok) {
        throw new Error("update failed");
      }

      const updated = (await response.json()) as Task;
      setTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
    } catch {
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                title: cleanTitle,
                description: cleanDescription || null,
                dueDate: parsedEditDueDate,
                dueTime: editDueTimeInput,
                priority: editPriority,
              }
            : task,
        ),
      );
      pushPendingAccountOp({
        type: "update",
        id: taskId,
        changes: {
          title: cleanTitle,
          description: cleanDescription || null,
          dueDate: parsedEditDueDate,
          dueTime: editDueTimeInput,
          priority: editPriority,
        },
      });
    }

    cancelEditTask();
  };

  // Note: naming is inconsistent here - toggleTask vs addTask vs removeTask
  // Should probably standardize to handleX pattern but it works
  const toggleTask = async (id: number, completed: boolean) => {
    // Handle routine-generated tasks without creating persisted duplicates
    if (id < 0) {
      // Find the routine task
      const routineTasksList = generateRoutineTasksForDate(selectedDate, routines);
      const routineTask = routineTasksList.find(t => t.id === id);
      
      if (routineTask && typeof routineTask.routineId === "number") {
        const completionKey = getRoutineCompletionKey(routineTask.routineId, selectedDate);
        setCompletedRoutineKeys((current) =>
          completed
            ? current.filter((key) => key !== completionKey)
            : current.includes(completionKey)
              ? current
              : [...current, completionKey],
        );
      }
      return;
    }

    if (workspaceMode === "guest") {
      const nextTasks = tasks.map((task) =>
        task.id === id ? { ...task, completed: !completed } : task,
      );
      setTasks(nextTasks);
      writeGuestTasks(nextTasks);
      return;
    }

    // Optimistic update - feels snappier to users
    if (isOffline) {
      setTasks((current) => current.map((task) => (task.id === id ? { ...task, completed: !completed } : task)));
      pushPendingAccountOp({ type: "update", id, changes: { completed: !completed } });
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !completed }),
      });

      if (!response.ok) {
        throw new Error("toggle failed");
      }

      const updated = (await response.json()) as Task;
      setTasks((current) => current.map((task) => (task.id === id ? updated : task)));
    } catch {
      setTasks((current) => current.map((task) => (task.id === id ? { ...task, completed: !completed } : task)));
      pushPendingAccountOp({ type: "update", id, changes: { completed: !completed } });
    }
  };

  const performTaskDelete = async (id: number) => {
    if (workspaceMode === "guest") {
      const nextTasks = tasks.filter((task) => task.id !== id);
      setTasks(nextTasks);
      writeGuestTasks(nextTasks);
      return;
    }

    if (isOffline) {
      // Optimistically remove from UI
      setTasks((current) => current.filter((task) => task.id !== id));
      pushPendingAccountOp({ type: "delete", id });
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("delete failed");
      }

      setTasks((current) => current.filter((task) => task.id !== id));
    } catch {
      setTasks((current) => current.filter((task) => task.id !== id));
      pushPendingAccountOp({ type: "delete", id });
    }
  };

  const removeTask = (id: number) => {
    setPendingTaskDeleteId(id);
    setDeleteTaskDialogOpen(true);
  };

  const closeDeleteTaskDialog = () => {
    if (deleteTaskBusy) {
      return;
    }

    setDeleteTaskDialogOpen(false);
    setPendingTaskDeleteId(null);
  };

  const confirmDeleteTask = async () => {
    if (pendingTaskDeleteId === null) {
      return;
    }

    setDeleteTaskBusy(true);
    await performTaskDelete(pendingTaskDeleteId);
    setDeleteTaskBusy(false);
    setDeleteTaskDialogOpen(false);
    setPendingTaskDeleteId(null);
  };

  const toggleTaskExpanded = (taskId: number) => {
    setExpandedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  };

  const toggleRoutineExpanded = (routineId: number) => {
    setExpandedRoutineIds((current) =>
      current.includes(routineId) ? current.filter((id) => id !== routineId) : [...current, routineId],
    );
  };

  // Routine management functions
  const fetchRoutines = async () => {
    setLoadingRoutines(true);
    try {
      if (workspaceMode === "guest") {
        const guestRoutines = readGuestRoutines();
        setRoutines(guestRoutines);
      } else {
        // In account mode: read cache flag directly from storage to avoid race condition with state
        const hasOfflineAccountReady = safeStorageGetItem(OFFLINE_ACCOUNT_READY_KEY) === "1";
        if (status === "authenticated" || offlineAccountMode || hasOfflineAccountReady) {
          // In account mode: check offline first  
          if (isOffline || (status !== "authenticated" && hasOfflineAccountReady)) {
            // Load from cache when offline
            const cachedRoutines = readBestAvailableAccountCachedRoutines();
            setRoutines(cachedRoutines);
          } else {
            // Fetch from API when online
            const response = await fetch("/api/routines");
            if (response.ok) {
              const data = await response.json();
              setRoutines(data);
              writeAccountCachedRoutines(data);
            } else {
              // Fallback to cache if API fails
              const cachedRoutines = readBestAvailableAccountCachedRoutines();
              setRoutines(cachedRoutines);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch routines:", error);
      // Load from cache on error
      if (workspaceMode === "account") {
        const cachedRoutines = readBestAvailableAccountCachedRoutines();
        setRoutines(cachedRoutines);
      }
    } finally {
      setLoadingRoutines(false);
    }
  };

  const addRoutine = async () => {
    if (!routineTitle.trim()) return;

    if (workspaceMode === "guest") {
      // Guest mode: store in localStorage
      const newRoutine: import("./types").Routine = {
        id: nextGuestRoutineId,
        title: routineTitle.trim(),
        description: routineDescription.trim() || null,
        dayOfWeek: routineDayOfWeek,
        time: routineTime,
        priority: routinePriority,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      const updated = [...routines, newRoutine];
      setRoutines(updated);
      writeGuestRoutines(updated);
      setNextGuestRoutineId((prev) => prev + 1);
      // Reset form
      setRoutineTitle("");
      setRoutineDescription("");
      setRoutineDayOfWeek(7);
      setRoutineTime("09:00");
      setRoutinePriority("MEDIUM");
    } else if (status === "authenticated" || offlineAccountMode) {
      // Account mode: use API or queue when offline
      if (isOffline || offlineAccountMode) {
        // Offline: queue operation and save to cache
        const tempId = -Date.now(); // Temporary negative ID
        const newRoutine: import("./types").Routine = {
          id: tempId,
          title: routineTitle.trim(),
          description: routineDescription.trim() || null,
          dayOfWeek: routineDayOfWeek,
          time: routineTime,
          priority: routinePriority,
          isActive: true,
          createdAt: new Date().toISOString(),
        };
        const updated = [...routines, newRoutine];
        setRoutines(updated);
        writeAccountCachedRoutines(updated);
        // Queue the operation for sync when online
        pushPendingRoutineOp({
          type: "create",
          routine: newRoutine,
          tempId,
        });
        // Reset form
        setRoutineTitle("");
        setRoutineDescription("");
        setRoutineDayOfWeek(7);
        setRoutineTime("09:00");
        setRoutinePriority("MEDIUM");
      } else {
        // Online: use API
        try {
          const response = await fetch("/api/routines", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: routineTitle.trim(),
              description: routineDescription.trim() || null,
              dayOfWeek: routineDayOfWeek,
              time: routineTime,
              priority: routinePriority,
            }),
          });

          if (response.ok) {
            const newRoutine = await response.json();
            setRoutines((prev) => [...prev, newRoutine]);
            writeAccountCachedRoutines([...routines, newRoutine]);
            // Reset form
            setRoutineTitle("");
            setRoutineDescription("");
            setRoutineDayOfWeek(7);
            setRoutineTime("09:00");
            setRoutinePriority("MEDIUM");
          }
        } catch (error) {
          console.error("Failed to add routine:", error);
        }
      }
    }
  };

  const startEditRoutine = (routine: import("./types").Routine) => {
    setEditingRoutineId(routine.id);
    setEditRoutineTitle(routine.title);
    setEditRoutineDescription(routine.description || "");
    setEditRoutineDayOfWeek(routine.dayOfWeek);
    setEditRoutineTime(routine.time);
    setEditRoutinePriority(routine.priority);
  };

  const cancelEditRoutine = () => {
    setEditingRoutineId(null);
    setEditRoutineTitle("");
    setEditRoutineDescription("");
    setEditRoutineDayOfWeek(7);
    setEditRoutineTime("09:00");
    setEditRoutinePriority("MEDIUM");
  };

  const saveRoutineEdit = async (routineId: number) => {
    const cleanTitle = editRoutineTitle.trim();
    if (!cleanTitle || !isValidTime(editRoutineTime)) {
      return;
    }

    if (workspaceMode === "guest") {
      const updated = routines.map((r) =>
        r.id === routineId
          ? {
              ...r,
              title: cleanTitle,
              description: editRoutineDescription.trim() || null,
              dayOfWeek: editRoutineDayOfWeek,
              time: editRoutineTime,
              priority: editRoutinePriority,
            }
          : r
      );
      setRoutines(updated);
      writeGuestRoutines(updated);
      cancelEditRoutine();
      return;
    }

    if (isOffline || offlineAccountMode) {
      const updated = routines.map((r) =>
        r.id === routineId
          ? {
              ...r,
              title: cleanTitle,
              description: editRoutineDescription.trim() || null,
              dayOfWeek: editRoutineDayOfWeek,
              time: editRoutineTime,
              priority: editRoutinePriority,
            }
          : r
      );
      setRoutines(updated);
      writeAccountCachedRoutines(updated);
      if (routineId > 0) {
        pushPendingRoutineOp({
          type: "update",
          id: routineId,
          changes: {
            title: cleanTitle,
            description: editRoutineDescription.trim() || null,
            dayOfWeek: editRoutineDayOfWeek,
            time: editRoutineTime,
            priority: editRoutinePriority,
          },
        });
      }
      cancelEditRoutine();
      return;
    }

    try {
      const response = await fetch(`/api/routines/${routineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          description: editRoutineDescription.trim() || null,
          dayOfWeek: editRoutineDayOfWeek,
          time: editRoutineTime,
          priority: editRoutinePriority,
        }),
      });

      if (response.ok) {
        const updatedRoutine = await response.json();
        const updated = routines.map((r) => (r.id === routineId ? updatedRoutine : r));
        setRoutines(updated);
        writeAccountCachedRoutines(updated);
        cancelEditRoutine();
      }
    } catch (error) {
      console.error("Failed to update routine:", error);
    }
  };

  const deleteRoutine = async (id: number) => {

    if (workspaceMode === "guest") {
      // Guest mode: delete from localStorage
      const updated = routines.filter((r) => r.id !== id);
      setRoutines(updated);
      writeGuestRoutines(updated);
    } else if (status === "authenticated" || offlineAccountMode) {
      // Account mode: use API or queue when offline
      if (isOffline || offlineAccountMode) {
        // Offline: update cache and queue operation
        const updated = routines.filter((r) => r.id !== id);
        setRoutines(updated);
        writeAccountCachedRoutines(updated);
        // Queue the operation for sync when online
        if (id > 0) {
          // Only queue if it's not a temp ID (temp IDs start with -)
          pushPendingRoutineOp({
            type: "delete",
            id,
          });
        }
      } else {
        // Online: use API
        try {
          const response = await fetch(`/api/routines/${id}`, {
            method: "DELETE",
          });

          if (response.ok) {
            const updated = routines.filter((r) => r.id !== id);
            setRoutines(updated);
            writeAccountCachedRoutines(updated);
          }
        } catch (error) {
          console.error("Failed to delete routine:", error);
        }
      }
    }
  };

  const requestRoutineDelete = (id: number) => {
    setPendingRoutineDeleteId(id);
    setDeleteRoutineDialogOpen(true);
  };

  const closeDeleteRoutineDialog = () => {
    if (deleteRoutineBusy) {
      return;
    }

    setDeleteRoutineDialogOpen(false);
    setPendingRoutineDeleteId(null);
  };

  const confirmDeleteRoutine = async () => {
    if (pendingRoutineDeleteId === null) {
      return;
    }

    setDeleteRoutineBusy(true);
    await deleteRoutine(pendingRoutineDeleteId);
    setDeleteRoutineBusy(false);
    setDeleteRoutineDialogOpen(false);
    setPendingRoutineDeleteId(null);
  };

  const openDeleteAccountDialog = () => {
    setDeleteAccountDialogOpen(true);
  };

  const closeDeleteAccountDialog = () => {
    if (deleteAccountBusy) {
      return;
    }

    setDeleteAccountDialogOpen(false);
  };

  const confirmDeleteAccount = async () => {
    setDeleteAccountBusy(true);
    await deleteAccount(clearCachedAccountSession, "/");
    setDeleteAccountBusy(false);
    setDeleteAccountDialogOpen(false);
  };

  const toggleRoutineActive = async (id: number, currentActive: boolean) => {
    if (workspaceMode === "guest") {
      // Guest mode: update in localStorage
      const updated = routines.map((r) =>
        r.id === id ? { ...r, isActive: !currentActive } : r
      );
      setRoutines(updated);
      writeGuestRoutines(updated);
    } else if (status === "authenticated" || offlineAccountMode) {
      // Account mode: use API or queue when offline
      if (isOffline || offlineAccountMode) {
        // Offline: update cache and queue operation
        const updated = routines.map((r) =>
          r.id === id ? { ...r, isActive: !currentActive } : r
        );
        setRoutines(updated);
        writeAccountCachedRoutines(updated);
        // Queue the operation for sync when online
        if (id > 0) {
          // Only queue if it's not a temp ID
          pushPendingRoutineOp({
            type: "update",
            id,
            changes: { isActive: !currentActive },
          });
        }
      } else {
        // Online: use API
        try {
          const response = await fetch(`/api/routines/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !currentActive }),
          });

          if (response.ok) {
            const updated = await response.json();
            const updatedList = routines.map((r) => (r.id === id ? updated : r));
            setRoutines(updatedList);
            writeAccountCachedRoutines(updatedList);
          }
        } catch (error) {
          console.error("Failed to toggle routine:", error);
        }
      }
    }
  };

  const goToPreviousMonth = () => {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  const monthTitle = monthCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const getPriorityBadgeClass = (taskPriority: TaskPriority) => {
    if (taskPriority === "HIGH") {
      return darkMode
        ? "bg-red-500/25 text-red-200 border border-red-500/40"
        : "bg-red-100/70 text-red-700 border border-red-200";
    }

    if (taskPriority === "LOW") {
      return darkMode
        ? "bg-emerald-500/25 text-emerald-200 border border-emerald-500/40"
        : "bg-emerald-100/70 text-emerald-700 border border-emerald-200";
    }

    return darkMode
      ? "bg-amber-500/25 text-amber-200 border border-amber-500/40"
      : "bg-amber-100/70 text-amber-700 border border-amber-200";
  };

  // Show workspace if we have cached account data (like guest mode)
  // Only show login panel if in account mode but NO cached account data exists
  // Use client-only state to avoid SSR mismatch (localStorage not available on server)
  const showAuthPanel = workspaceMode === "account" && !canRenderWorkspace;

  const openAddDatePicker = () => {
    const picker = addDatePickerRef.current;
    if (!picker) {
      return;
    }

    picker.value = parseDisplayDate(dueDateInput) ?? today;
    (picker as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    picker.focus();
  };

  const openEditDatePicker = () => {
    const picker = editDatePickerRef.current;
    if (!picker) {
      return;
    }

    picker.value = parseDisplayDate(editDueDateInput) ?? today;
    (picker as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    picker.focus();
  };

  // Profile management functions are now in useProfileManagement hook
  const handleUserSignOut = async (callbackUrl: string) => {
    clearCachedAccountSession();
    await signOut({ callbackUrl });
  };

  const setMigrationDecision = (decision: "imported" | "skipped" | "deleted") => {
    safeStorageSetItem(accountMigrationDecisionKey, decision);
    setGuestUpgradeOpen(false);
  };

  const importGuestTasksToAccount = async () => {
    if (workspaceMode !== "account" || status !== "authenticated" || isOffline) {
      setGuestUpgradeMessage("Connect to the internet to import guest data.");
      return;
    }

    setGuestUpgradeLoading(true);
    setGuestUpgradeMessage("");
    try {
      let totalImported = 0;
      let totalSkipped = 0;

      // Import Tasks
      setSyncMessage("Importing tasks...");
      setSyncInProgress(true);
      setSyncProgress(0);

      const guestTasks = readGuestTasks();
      if (guestTasks.length > 0) {
        const response = await fetch("/api/tasks", { cache: "no-store" });
        const existingTasks = response.ok ? ((await response.json()) as Task[]) : [];

        const existingKeys = new Set(existingTasks.map((task) => `${task.title.toLowerCase()}|${task.dueDate}|${task.dueTime}`));

        let imported = 0;
        let skipped = 0;

        for (const task of guestTasks) {
          const dedupeKey = `${task.title.toLowerCase()}|${task.dueDate}|${task.dueTime}`;
          if (existingKeys.has(dedupeKey)) {
            skipped += 1;
            continue;
          }

          const createResponse = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: task.title,
              description: task.description || "",
              dueDate: task.dueDate,
              dueTime: task.dueTime,
              priority: task.priority,
            }),
          });

          if (!createResponse.ok) {
            skipped += 1;
            continue;
          }

          const created = (await createResponse.json()) as Task;
          existingKeys.add(`${created.title.toLowerCase()}|${created.dueDate}|${created.dueTime}`);
          if (task.completed) {
            await fetch(`/api/tasks/${created.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ completed: true }),
            });
          }
          imported += 1;
        }

        safeStorageRemoveItem(GUEST_TASKS_KEY);
        totalImported += imported;
        totalSkipped += skipped;

        const refreshed = await fetch("/api/tasks", { cache: "no-store" });
        if (refreshed.ok) {
          const data = (await refreshed.json()) as Task[];
          setTasks(data);
          writeAccountCachedTasks(data);
        }
      }

      // Import Routines
      setSyncProgress(50);
      setSyncMessage("Importing routines...");

      const guestRoutines = readGuestRoutines();
      if (guestRoutines.length > 0) {
        const response = await fetch("/api/routines", { cache: "no-store" });
        const existingRoutines = response.ok ? (await response.json()) : [];

        const existingKeys = new Set(existingRoutines.map((routine: any) => `${routine.title.toLowerCase()}|${routine.dayOfWeek}|${routine.time}`));

        let imported = 0;
        let skipped = 0;

        for (const routine of guestRoutines) {
          const dedupeKey = `${routine.title.toLowerCase()}|${routine.dayOfWeek}|${routine.time}`;
          if (existingKeys.has(dedupeKey)) {
            skipped += 1;
            continue;
          }

          const createResponse = await fetch("/api/routines", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: routine.title,
              description: routine.description || null,
              dayOfWeek: routine.dayOfWeek,
              time: routine.time,
              priority: routine.priority,
              isActive: routine.isActive,
            }),
          });

          if (!createResponse.ok) {
            skipped += 1;
            continue;
          }

          imported += 1;
        }

        safeStorageRemoveItem(GUEST_ROUTINES_KEY);
        totalImported += imported;
        totalSkipped += skipped;

        const refreshed = await fetch("/api/routines", { cache: "no-store" });
        if (refreshed.ok) {
          const data = await refreshed.json();
          setRoutines(data);
          writeAccountCachedRoutines(data);
        }
      }

      setSyncProgress(100);
      setMigrationDecision("imported");
      setGuestUpgradeMessage(`${totalImported} items imported, ${totalSkipped} skipped.`);

      // Hide sync progress after a moment
      setTimeout(() => {
        setSyncInProgress(false);
        setSyncProgress(0);
        setSyncMessage("");
      }, 1000);
    } catch (err) {
      console.error("[IMPORT] Error importing guest data:", err);
      setGuestUpgradeMessage("Unable to import guest data.");
      setSyncInProgress(false);
    } finally {
      setGuestUpgradeLoading(false);
    }
  };

  const skipGuestImport = () => {
    setMigrationDecision("skipped");
  };

  const deleteGuestTasks = () => {
    safeStorageRemoveItem(GUEST_TASKS_KEY);
    setMigrationDecision("deleted");
  };

  return (
    <main
      className={`relative h-screen overflow-hidden flex flex-col ${
        darkMode
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100"
          : "bg-gradient-to-br from-slate-50 via-white to-blue-50"
      }`}
    >
      <div
        className={`pointer-events-none fixed -top-20 right-0 h-72 w-72 rounded-full blur-3xl ${
          darkMode ? "bg-blue-500/15" : "bg-blue-300/30"
        }`}
      />
      <div
        className={`pointer-events-none fixed bottom-0 left-0 h-80 w-80 rounded-full blur-3xl ${
          darkMode ? "bg-indigo-500/15" : "bg-indigo-300/25"
        }`}
      />

      {/* Flex Container for Sidebar + Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar - Desktop Fixed */}
      <aside
        className={`hidden lg:flex flex-col w-64 h-full overflow-y-auto p-6 backdrop-blur-xl border-r transition-all ${
          darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
        }`}
      >
        <div className="mb-8">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            <Image src="/unnamed.jpg" alt="Taskflow logo" width={16} height={16} className="rounded-full" />
            TASKFLOW
          </p>
          {showOfflineWarmup && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className={`text-[11px] font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                  Preparing offline access
                </p>
                <span className={`text-[11px] font-semibold ${darkMode ? "text-blue-300" : "text-blue-700"}`}>
                  {offlineWarmupPercent}%
                </span>
              </div>
              <div className={`h-1.5 w-full overflow-hidden rounded-full ${darkMode ? "bg-slate-700" : "bg-slate-200"}`}>
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${offlineWarmupPercent}%` }}
                />
              </div>
            </div>
          )}
          {syncInProgress && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className={`text-[11px] font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                  {syncMessage || "Syncing..."}
                </p>
                <span className={`text-[11px] font-semibold ${darkMode ? "text-green-300" : "text-green-700"}`}>
                  {syncProgress}%
                </span>
              </div>
              <div className={`h-1.5 w-full overflow-hidden rounded-full ${darkMode ? "bg-slate-700" : "bg-slate-200"}`}>
                <div
                  className="h-full rounded-full bg-green-600 transition-all duration-300"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-2" suppressHydrationWarning>
          {[
            { id: "today", label: "📅 Today", icon: "📅" },
            { id: "all-tasks", label: "📋 All Tasks", icon: "📋" },
            { id: "routine", label: "🔁 Routine", icon: "🔁" },
            { id: "analytics", label: "📊 Analytics", icon: "📊" },
            { id: "help", label: "❓ Help", icon: "❓" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id as WorkspaceSection)}
              suppressHydrationWarning
              className={`w-full text-left px-4 py-3 rounded-lg font-semibold transition ${
                activeSection === item.id
                  ? darkMode
                    ? "bg-white/20 text-slate-100"
                    : "bg-white/70 text-slate-900"
                  : darkMode
                    ? "text-slate-300 hover:bg-white/10"
                    : "text-slate-700 hover:bg-white/50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="space-y-3 border-t border-white/20 pt-4">
          <button
            onClick={() => setDarkMode((current) => !current)}
            className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition ${
              darkMode
                ? "text-slate-300 hover:bg-white/10"
                : "text-slate-700 hover:bg-white/50"
            }`}
          >
            {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </button>

          {canInstallApp && !isInstalledApp && (
            <button
              onClick={() => void triggerInstallPrompt()}
              className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition ${
                darkMode
                  ? "text-slate-300 hover:bg-white/10"
                  : "text-slate-700 hover:bg-white/50"
              }`}
            >
              📱 Install App
            </button>
          )}

          {workspaceMode === "account" && (
            <>
              <button
                onClick={() => setActiveSection("account")}
                className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeSection === "account"
                    ? darkMode
                      ? "bg-white/20 text-slate-100"
                      : "bg-white/70 text-slate-900"
                    : darkMode
                      ? "text-slate-300 hover:bg-white/10"
                      : "text-slate-700 hover:bg-white/50"
                }`}
              >
                👤 Account
              </button>

              {status === "authenticated" && (
                <button
                  onClick={() => {
                    void handleUserSignOut("/workspace?mode=account");
                  }}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition text-red-500 hover:bg-red-500/10`}
                >
                  🚪 Logout
                </button>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Link
              href="/workspace?mode=account"
              className={`flex-1 text-center px-3 py-2 rounded-lg text-xs font-semibold transition ${
                workspaceMode === "account"
                  ? "bg-blue-600 text-white"
                  : darkMode
                    ? "bg-white/10 text-slate-300 hover:bg-white/20"
                    : "bg-white/50 text-slate-700 hover:bg-white/70"
              }`}
            >
              Account
            </Link>
            <Link
              href="/workspace?mode=guest"
              className={`flex-1 text-center px-3 py-2 rounded-lg text-xs font-semibold transition ${
                workspaceMode === "guest"
                  ? "bg-emerald-600 text-white"
                  : darkMode
                    ? "bg-white/10 text-slate-300 hover:bg-white/20"
                    : "bg-white/50 text-slate-700 hover:bg-white/70"
              }`}
            >
              Guest
            </Link>
          </div>
          <Link
            href="/"
            className={`block text-center px-4 py-2 rounded-lg text-xs font-semibold transition ${
              darkMode
                ? "bg-white/10 text-slate-300 hover:bg-white/20"
                : "bg-white/50 text-slate-700 hover:bg-white/70"
            }`}
          >
            Home
          </Link>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      {mobileMenuOpen && (
        <aside
          className={`lg:hidden fixed left-0 top-0 h-screen w-64 p-6 z-40 backdrop-blur-xl border-r space-y-4 overflow-y-auto ${
            darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
          }`}
        >
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="ml-auto block"
          >
            ✕
          </button>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
            <Image src="/unnamed.jpg" alt="Taskflow logo" width={16} height={16} className="rounded-full" />
            TASKFLOW
          </p>

          <nav className="space-y-2">
            {[
              { id: "today", label: "📅 Today" },
              { id: "all-tasks", label: "📋 All Tasks" },
              { id: "routine", label: "🔁 Routine" },
              { id: "analytics", label: "📊 Analytics" },
              { id: "help", label: "❓ Help" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id as WorkspaceSection);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-4 py-2 rounded-lg font-medium transition ${
                  activeSection === item.id
                    ? darkMode
                      ? "bg-white/20 text-slate-100"
                      : "bg-white/70 text-slate-900"
                    : darkMode
                      ? "text-slate-300 hover:bg-white/10"
                      : "text-slate-700 hover:bg-white/50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="space-y-2 border-t border-white/20 pt-4">
            <button
              onClick={() => {
                setDarkMode((current) => !current);
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${
                darkMode ? "text-slate-300 hover:bg-white/10" : "text-slate-700 hover:bg-white/50"
              }`}
            >
              {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
            </button>

            {canInstallApp && !isInstalledApp && (
              <button
                onClick={() => {
                  void triggerInstallPrompt();
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${
                  darkMode ? "text-slate-300 hover:bg-white/10" : "text-slate-700 hover:bg-white/50"
                }`}
              >
                📱 Install App
              </button>
            )}

            {workspaceMode === "account" && (
              <>
                <button
                  onClick={() => {
                    setActiveSection("account");
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium ${
                    activeSection === "account"
                      ? darkMode
                        ? "bg-white/20 text-slate-100"
                        : "bg-white/70 text-slate-900"
                      : darkMode
                        ? "text-slate-300 hover:bg-white/10"
                        : "text-slate-700 hover:bg-white/50"
                  }`}
                >
                  👤 Account
                </button>

                {status === "authenticated" && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      void handleUserSignOut("/workspace?mode=account");
                    }}
                    className="w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10"
                  >
                    🚪 Logout
                  </button>
                )}
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Link
                href="/workspace?mode=account"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex-1 text-center px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  workspaceMode === "account"
                    ? "bg-blue-600 text-white"
                    : darkMode
                      ? "bg-white/10 text-slate-300 hover:bg-white/20"
                      : "bg-white/50 text-slate-700 hover:bg-white/70"
                }`}
              >
                Account
              </Link>
              <Link
                href="/workspace?mode=guest"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex-1 text-center px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  workspaceMode === "guest"
                    ? "bg-emerald-600 text-white"
                    : darkMode
                      ? "bg-white/10 text-slate-300 hover:bg-white/20"
                      : "bg-white/50 text-slate-700 hover:bg-white/70"
                }`}
              >
                Guest
              </Link>
            </div>

            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`block text-center px-4 py-2 rounded-lg text-xs font-semibold transition ${
                darkMode
                  ? "bg-white/10 text-slate-300 hover:bg-white/20"
                  : "bg-white/50 text-slate-700 hover:bg-white/70"
              }`}
            >
              Home
            </Link>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          <div
            className={`lg:hidden sticky top-0 z-30 flex items-center justify-between rounded-2xl px-3 py-2 border backdrop-blur-xl ${
              darkMode ? "bg-slate-900/80 border-white/20" : "bg-white/85 border-white/70"
            }`}
          >
            <button
              onClick={() => setMobileMenuOpen((current) => !current)}
              aria-label="Toggle menu"
              className={`h-9 w-9 rounded-lg text-lg font-semibold transition ${
                darkMode ? "bg-white/15 text-slate-100 hover:bg-white/25" : "bg-white/80 text-slate-900 hover:bg-white"
              }`}
            >
              ☰
            </button>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
              <Image src="/unnamed.jpg" alt="Taskflow logo" width={16} height={16} className="rounded-full" />
              TASKFLOW
            </p>
            <span className="h-9 w-9" />
          </div>

          {showOfflineWarmup && (
            <div
              className={`lg:hidden sticky top-[58px] z-20 -mt-3 rounded-xl px-3 py-2 border backdrop-blur-xl ${
                darkMode ? "bg-slate-900/80 border-white/20" : "bg-white/85 border-white/70"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className={`text-[11px] font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                  Preparing offline access
                </p>
                <span className={`text-[11px] font-semibold ${darkMode ? "text-blue-300" : "text-blue-700"}`}>
                  {offlineWarmupPercent}%
                </span>
              </div>
              <div className={`h-1.5 w-full overflow-hidden rounded-full ${darkMode ? "bg-slate-700" : "bg-slate-200"}`}>
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${offlineWarmupPercent}%` }}
                />
              </div>
            </div>
          )}

          {syncInProgress && (
            <div
              className={`lg:hidden sticky top-[58px] z-20 -mt-3 rounded-xl px-3 py-2 border backdrop-blur-xl ${
                darkMode ? "bg-slate-900/80 border-white/20" : "bg-white/85 border-white/70"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className={`text-[11px] font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                  {syncMessage || "Syncing..."}
                </p>
                <span className={`text-[11px] font-semibold ${darkMode ? "text-green-300" : "text-green-700"}`}>
                  {syncProgress}%
                </span>
              </div>
              <div className={`h-1.5 w-full overflow-hidden rounded-full ${darkMode ? "bg-slate-700" : "bg-slate-200"}`}>
                <div
                  className="h-full rounded-full bg-green-600 transition-all duration-300"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Header */}
          <header
            className={`rounded-3xl p-6 shadow-xl backdrop-blur-xl border ${
              darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
            }`}
          >
            <h1 className={`text-3xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
              {activeSection === "today" && "Today's Tasks"}
              {activeSection === "all-tasks" && "All Tasks"}
              {activeSection === "routine" && "Weekly Routine"}
              {activeSection === "analytics" && "Analytics Dashboard"}
              {activeSection === "account" && "Account Settings"}
            </h1>
            <p className={`mt-2 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
              {workspaceMode === "guest"
                ? "✨ Guest mode stores tasks in your browser only."
                : offlineAccountMode
                  ? `📴 Offline account: ${email || "Using cached data"}`
                  : status === "authenticated"
                    ? `🔐 Synced account: ${session?.user?.email}`
                    : "Sign in to sync your tasks."}
            </p>
            {isOffline && (
              <p className={`mt-1 text-xs font-medium ${darkMode ? "text-amber-300" : "text-amber-700"}`}>
                Offline mode: Changes will sync when internet returns.
              </p>
            )}
          </header>


          {/* Loading State - only show if NO cached account data */}
          {status === "loading" && workspaceMode === "account" && !canRenderWorkspace ? (
            <div className={`rounded-2xl p-6 backdrop-blur-md border shadow-lg animate-fade-in flex items-center gap-3 ${
              darkMode ? "bg-white/10 border-white/20 text-slate-300" : "bg-white/40 border-white/50 text-slate-700"
            }`}>
              <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full"></div>
              Loading account session...
            </div>
          ) : showAuthPanel ? (
            /* Auth Panel */
            <section className={`mx-auto w-full max-w-lg rounded-3xl p-8 backdrop-blur-lg border shadow-xl animate-scale-in ${
              darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
            }`}>
              <h2 className={`text-3xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Account Access</h2>
              <p className={`mt-2 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Login or register to sync your tasks securely across devices.</p>

              <div className={`mt-6 grid grid-cols-2 gap-2 rounded-xl p-1.5 ${
                darkMode ? "bg-slate-900/40" : "bg-slate-100/50"
              }`}>
                <button
                  onClick={() => setAuthTab("login")}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                    authTab === "login"
                      ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md"
                      : darkMode ? "text-slate-300 hover:bg-white/10" : "text-slate-700 hover:bg-white/50"
                  }`}
                >
                  Login
                </button>
                <button
                  onClick={() => setAuthTab("register")}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                    authTab === "register"
                      ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md"
                      : darkMode ? "text-slate-300 hover:bg-white/10" : "text-slate-700 hover:bg-white/50"
                  }`}
                >
                  Register
                </button>
              </div>

              <div className="mt-6 space-y-3.5">
                {authTab === "register" && (
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Full name"
                    className={`w-full rounded-xl border-2 px-4 py-3 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/50 text-slate-100"
                        : "border-slate-200 bg-white/70 text-slate-900"
                    }`}
                  />
                )}
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email address"
                  className={`w-full rounded-xl border-2 px-4 py-3 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                    darkMode
                      ? "border-slate-700 bg-slate-900/50 text-slate-100"
                      : "border-slate-200 bg-white/70 text-slate-900"
                  }`}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password (min 6 chars)"
                  className={`w-full rounded-xl border-2 px-4 py-3 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                    darkMode
                      ? "border-slate-700 bg-slate-900/50 text-slate-100"
                      : "border-slate-200 bg-white/70 text-slate-900"
                  }`}
                />
                <button
                  onClick={submitAuth}
                  disabled={authLoading}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {authLoading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>}
                  {authLoading ? "Please wait..." : authTab === "register" ? "Create Account" : "Sign In"}
                </button>
                {authMessage && <p className={`text-sm font-medium rounded-lg p-3 ${
                  darkMode ? "bg-red-500/20 text-red-300" : "bg-red-50/50 text-red-600"
                }`}>{authMessage}</p>}
              </div>
            </section>
          ) : activeSection === "today" ? (
            /* TODAY SECTION */
            <div className="space-y-6 animate-fade-in">
              <section className={`rounded-3xl p-6 backdrop-blur-xl border shadow-xl ${
                darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
              }`}>
                <div className="grid gap-6 md:grid-cols-[280px_1fr]">
                  {/* Mini Calendar */}
                  <div className={`rounded-2xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <button
                        onClick={goToPreviousMonth}
                        aria-label="Previous month"
                        className={`h-7 w-7 rounded-md text-sm font-bold transition ${
                          darkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-white/70 text-slate-700 hover:bg-white"
                        }`}
                      >
                        ←
                      </button>
                      <p className={`text-center font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
                        {monthTitle}
                      </p>
                      <button
                        onClick={goToNextMonth}
                        aria-label="Next month"
                        className={`h-7 w-7 rounded-md text-sm font-bold transition ${
                          darkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-white/70 text-slate-700 hover:bg-white"
                        }`}
                      >
                        →
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        const now = new Date();
                        setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                        setSelectedDate(toDateInputValue(now));
                      }}
                      className={`mb-3 w-full rounded-md px-2 py-1 text-xs font-semibold transition ${
                        darkMode ? "bg-slate-800/80 text-slate-200 hover:bg-slate-700" : "bg-white/80 text-slate-700 hover:bg-white"
                      }`}
                    >
                      Today
                    </button>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold mb-2">
                      {WEEKDAYS.map((d) => <div key={d}>{d[0]}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {calendarCells.map((day) => {
                        const dayKey = toDateInputValue(day);
                        const isCurrentMonth = day.getMonth() === monthCursor.getMonth();
                        const isSelected = selectedDate === dayKey;
                        const dayStatus = calendarDayStatus.get(dayKey);
                        const isFullyCompletedDay = dayStatus && dayStatus.total > 0 && dayStatus.completed === dayStatus.total;
                        return (
                          <button
                            key={dayKey}
                            onClick={() => setSelectedDate(dayKey)}
                            className={`rounded-lg p-1 text-xs font-semibold transition ${
                              isSelected
                                ? "bg-blue-600 text-white"
                                : darkMode ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-white/50 hover:bg-white/80"
                            } ${!isCurrentMonth ? "opacity-30" : ""}`}
                          >
                            {day.getDate()}
                            {dayStatus && dayStatus.total > 0 && (
                              <div className={`text-[10px] ${isFullyCompletedDay ? "text-emerald-500" : "text-amber-500"}`}>
                                {isFullyCompletedDay ? "✓" : "•"}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Today Tasks List */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className={`text-2xl font-bold tracking-tight ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
                        {formatDisplayDate(selectedDate)}
                      </h3>
                      {tasksForSelectedDay.length > 0 && (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          darkMode ? "bg-blue-500/20 text-blue-200 border-blue-500/30" : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {tasksForSelectedDay.length} task{tasksForSelectedDay.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                      {tasksForSelectedDay.length === 0 ? (
                        <li className={`relative overflow-hidden rounded-xl border-2 border-dashed p-6 text-center ${
                          darkMode ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-600"
                        }`}>
                          <div className="text-4xl mb-3 animate-bounce">✨</div>
                          <p className="text-base font-bold mb-1">All clear!</p>
                          <p className="text-xs opacity-75">Enjoy your free time.</p>
                          <div className={`absolute top-4 right-4 w-24 h-24 rounded-full blur-3xl opacity-20 ${
                            darkMode ? "bg-blue-500" : "bg-blue-400"
                          }`} />
                          <div className={`absolute bottom-4 left-4 w-24 h-24 rounded-full blur-3xl opacity-20 ${
                            darkMode ? "bg-purple-500" : "bg-purple-400"
                          }`} />
                        </li>
                      ) : (
                        tasksForSelectedDay.map((task) => {
                          const priorityConfig = {
                            HIGH: { icon: '🔴', color: darkMode ? 'bg-red-500/20 text-red-200 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200' },
                            MEDIUM: { icon: '🟡', color: darkMode ? 'bg-amber-500/20 text-amber-200 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200' },
                            LOW: { icon: '🟢', color: darkMode ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                          };
                          const priority = priorityConfig[task.priority];
                          const dueTimestamp = new Date(`${task.dueDate}T${task.dueTime || '23:59'}:00`).getTime();
                          const isOverdue = !task.completed && !Number.isNaN(dueTimestamp) && dueTimestamp < Date.now();
                          
                          return (
                            <li
                              key={task.id}
                              onClick={() => toggleTaskExpanded(task.id)}
                              className={`group relative rounded-xl border p-3 backdrop-blur-sm shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-xl overflow-hidden ${
                                darkMode
                                  ? "bg-slate-900/60 border-slate-700/50 hover:bg-slate-900/70"
                                  : "bg-white/60 border-slate-200/60 hover:bg-white/80"
                              } cursor-pointer`}
                            >
                              {/* Hover glow effect */}
                              <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-gradient-to-br ${
                                darkMode ? "from-blue-500/5 to-purple-500/5" : "from-blue-400/10 to-purple-400/10"
                              }`} />
                              
                              <div className="relative flex items-start justify-between gap-3 min-w-0">
                                <div className="flex-1 min-w-0 space-y-2">
                                  <p
                                    className={`w-full text-left text-base font-bold break-all transition-colors ${
                                      darkMode ? "text-slate-100" : "text-slate-900"
                                    } ${task.completed ? "line-through opacity-60" : ""}`}
                                  >
                                    {task.title}
                                  </p>
                                  
                                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${priority.color}`}>
                                      <span className="text-sm">{priority.icon}</span>
                                      {task.priority}
                                    </span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                      darkMode ? "bg-slate-800/60 text-slate-300" : "bg-slate-100/80 text-slate-700"
                                    }`}>
                                      <span>⏰</span>
                                      {task.dueTime}
                                    </span>
                                    {task.routineId && (
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${
                                        darkMode ? "bg-blue-500/20 text-blue-200 border-blue-500/30" : "bg-blue-50 text-blue-700 border-blue-200"
                                      }`}>
                                        🔁 Routine
                                      </span>
                                    )}
                                    {isOverdue && (
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${
                                        darkMode ? "bg-red-500/20 text-red-300 border-red-500/40" : "bg-red-100 text-red-700 border-red-200"
                                      }`}>
                                        ⚠️ Overdue
                                      </span>
                                    )}
                                  </div>
                                  
                                  {expandedTaskIds.includes(task.id) && task.description && (
                                    <div className={`mt-2 rounded-lg border px-3 py-2 text-xs backdrop-blur-sm ${
                                      darkMode
                                        ? "border-slate-700 bg-slate-900/70 text-slate-300"
                                        : "border-slate-200 bg-white/80 text-slate-700"
                                    } whitespace-pre-line break-words`}>
                                      {task.description}
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex gap-2 shrink-0">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTask(task.id, task.completed);
                                    }}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg ${
                                      task.completed
                                        ? "bg-gradient-to-br from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700"
                                        : "bg-gradient-to-br from-emerald-400 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-600"
                                    }`}
                                  >
                                    {task.completed ? "Undo" : "Done"}
                                  </button>
                                </div>
                              </div>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                </div>
              </section>
            </div>
          ) : activeSection === "all-tasks" ? (
            /* ALL TASKS SECTION */
            <div className="space-y-6 animate-fade-in">
              {/* Task Input */}
              <section className={`rounded-3xl p-6 backdrop-blur-md shadow-lg ${
                darkMode ? "bg-white/5" : "bg-white/40"
              }`}>
                <h3 className={`text-lg font-semibold mb-4 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Add New Task</h3>
                <div className="space-y-3">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="What needs to be done?"
                    className={`w-full rounded-xl border-2 px-4 py-3 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/50 text-slate-100"
                        : "border-slate-200 bg-white/70 text-slate-900"
                    }`}
                  />
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    placeholder="Add a note (optional)"
                    className={`w-full rounded-xl border-2 px-4 py-3 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/50 text-slate-100"
                        : "border-slate-200 bg-white/70 text-slate-900"
                    }`}
                  />
                  <div className="grid gap-2 md:grid-cols-[1fr_110px_130px_auto]">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="DD-MM-YYYY"
                      value={dueDateInput}
                      onChange={(event) => setDueDateInput(event.target.value)}
                      onClick={openAddDatePicker}
                      className={`w-full rounded-xl border-2 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                      style={{
                        colorScheme: darkMode ? 'dark' : 'light'
                      }}
                    />
                    <input
                      ref={addDatePickerRef}
                      type="date"
                      defaultValue={today}
                      onChange={(event) => setDueDateInput(formatDisplayDate(event.target.value))}
                      className="hidden"
                    />
                    <select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as TaskPriority)}
                      className={`rounded-xl border-2 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    >
                      <option>LOW</option>
                      <option>MEDIUM</option>
                      <option>HIGH</option>
                    </select>
                    <input
                      type="time"
                      value={dueTimeInput}
                      onChange={(event) => setDueTimeInput(event.target.value)}
                      className={`rounded-xl border-2 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                    <button
                      onClick={addTask}
                      className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </section>

              {/* Filters & Search */}
              <section className={`rounded-3xl p-6 backdrop-blur-xl border shadow-xl ${
                darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
              }`}>
                <div className="grid gap-3 md:grid-cols-[120px_1fr_160px_52px_auto]">
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value as TaskFilter)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium outline-none ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/50 text-slate-100"
                        : "border-slate-200 bg-white/70 text-slate-800"
                    }`}
                  >
                    <option value="all">All Tasks</option>
                    <option value="today">Today</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="overdue">Overdue</option>
                    <option value="completed">Completed</option>
                  </select>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search tasks..."
                    className={`rounded-xl border px-3 py-2 text-sm outline-none ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/50 text-slate-100 placeholder-slate-400"
                        : "border-slate-200 bg-white/70 text-slate-900 placeholder-slate-500"
                    }`}
                  />
                  <input
                    type="date"
                    value={allTasksDateFilter}
                    onChange={(event) => setAllTasksDateFilter(event.target.value)}
                    placeholder="mm/dd/yyyy"
                    className={`rounded-xl border px-3 py-2 text-sm outline-none ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/50 text-slate-100"
                        : "border-slate-200 bg-white/70 text-slate-900"
                    }`}
                    style={{
                      colorScheme: darkMode ? 'dark' : 'light'
                    }}
                  />
                  <button
                    onClick={() => setAllTasksSortNewest((prev) => !prev)}
                    title={allTasksSortNewest ? "Newest first" : "Oldest first"}
                    className={`rounded-xl border px-2 py-2 text-lg font-medium transition hover:scale-105 active:scale-95 ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                        : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                    }`}
                  >
                    {allTasksSortNewest ? "↑" : "↓"}
                  </button>
                  <button
                    onClick={() => setAllTasksDateFilter("")}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-800"
                        : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                    }`}
                  >
                    Clear
                  </button>
                </div>

                {/* Tasks List */}
                <ul className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {loadingTasks ? (
                    <li className={`rounded-lg border-2 border-dashed p-4 text-sm text-center ${
                      darkMode ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-600"
                    }`}>
                      <span className="text-xl block mb-2">⏳</span>
                      Getting your tasks ready...
                    </li>
                  ) : sortedTasks.length === 0 ? (
                    <li className={`rounded-lg border-2 border-dashed p-4 text-sm text-center ${
                      darkMode ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-600"
                    }`}>
                      <span className="text-2xl block mb-2">🎯</span>
                      No tasks here yet. Add one above!
                    </li>
                  ) : (
                    <>
                      {displayedAllTasks.map((task) => {
                      const dueTimestamp = new Date(`${task.dueDate}T${task.dueTime || '23:59'}:00`).getTime();
                      const isOverdue = !task.completed && !Number.isNaN(dueTimestamp) && dueTimestamp < Date.now();

                      return (
                      <li
                        key={task.id}
                        className={`rounded-lg border p-3 backdrop-blur-sm transition ${
                          darkMode
                            ? "bg-slate-900/40 border-slate-700 hover:bg-slate-900/60"
                            : "bg-white/50 border-slate-200/50 hover:bg-white/70"
                        }`}
                      >
                        {editingTaskId === task.id ? (
                          /* EDIT MODE */
                          <div className="space-y-3">
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              placeholder="Task title"
                              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                                darkMode
                                  ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                  : "border-slate-200 bg-white/70 text-slate-900"
                              }`}
                            />
                            <textarea
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="Description (optional)"
                              rows={2}
                              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none ${
                                darkMode
                                  ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                  : "border-slate-200 bg-white/70 text-slate-900"
                              }`}
                            />
                            <div className="grid gap-2 sm:grid-cols-[1fr_100px_120px]">
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="DD-MM-YYYY"
                                value={editDueDateInput}
                                onChange={(e) => setEditDueDateInput(e.target.value)}
                                onClick={openEditDatePicker}
                                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                                  darkMode
                                    ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                    : "border-slate-200 bg-white/70 text-slate-900"
                                }`}
                              />
                              <input
                                ref={editDatePickerRef}
                                type="date"
                                onChange={(e) => setEditDueDateInput(formatDisplayDate(e.target.value))}
                                className="hidden"
                              />
                              <input
                                type="time"
                                value={editDueTimeInput}
                                onChange={(e) => setEditDueTimeInput(e.target.value)}
                                className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                  darkMode
                                    ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                    : "border-slate-200 bg-white/70 text-slate-900"
                                }`}
                              />
                              <select
                                value={editPriority}
                                onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
                                className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                  darkMode
                                    ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                    : "border-slate-200 bg-white/70 text-slate-900"
                                }`}
                              >
                                <option>LOW</option>
                                <option>MEDIUM</option>
                                <option>HIGH</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveTaskEdit(task.id)}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditTask}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                  darkMode
                                    ? "bg-slate-700 text-slate-100 hover:bg-slate-600"
                                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                }`}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* DISPLAY MODE */
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
                            <div className="flex-1 min-w-0">
                              <button
                                onClick={() => toggleTaskExpanded(task.id)}
                                className={`w-full text-left font-semibold break-all ${darkMode ? "text-slate-100" : "text-slate-900"} ${task.completed ? "line-through opacity-60" : ""}`}
                              >
                                {task.title}
                              </button>
                              <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                {formatDisplayDate(task.dueDate)} at {task.dueTime} • <PriorityBadge priority={task.priority} darkMode={darkMode} />
                                {task.routineId && <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs font-semibold ${
                                  darkMode ? "bg-blue-500/25 text-blue-200" : "bg-blue-100 text-blue-700"
                                }`}>🔁 Routine</span>}
                                {isOverdue && <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs font-semibold ${
                                  darkMode ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-700"
                                }`}>⚠️ Overdue</span>}
                              </p>
                              {expandedTaskIds.includes(task.id) && task.description && (
                                <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                                  darkMode
                                    ? "border-slate-700 bg-slate-900/50 text-slate-300"
                                    : "border-slate-200 bg-white/70 text-slate-700"
                                } whitespace-pre-line break-words`}>
                                  {task.description}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => toggleTask(task.id, task.completed)}
                                className={`rounded px-2 py-1 text-xs font-semibold transition hover:scale-105 active:scale-95 ${
                                  task.completed
                                    ? "bg-amber-600 text-white hover:bg-amber-700"
                                    : "bg-emerald-100/60 text-emerald-700 hover:bg-emerald-200"
                                }`}
                              >
                                {task.completed ? "Undo" : "Done"}
                              </button>
                              <button
                                onClick={() => startEditTask(task)}
                                className={`rounded px-2 py-1 text-xs font-semibold transition hover:scale-105 active:scale-95 ${
                                  darkMode ? "bg-slate-700 text-slate-100 hover:bg-slate-600" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                }`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => removeTask(task.id)}
                                className="rounded bg-red-100/60 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                      );
                      })}
                      {allTasksDisplayCount < sortedTasks.length && (
                        <li ref={allTasksObserverTarget} className={`py-3 text-center text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                          Loading more tasks...
                        </li>
                      )}
                    </>
                  )}
                </ul>
              </section>
            </div>
          ) : activeSection === "analytics" ? (
            /* ANALYTICS SECTION */
            <section className={`rounded-3xl p-6 backdrop-blur-xl shadow-xl animate-fade-in ${
              darkMode ? "bg-white/5" : "bg-white/50"
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h3 className={`text-3xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Productivity Insights</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAnalyticsView("weekly")}
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      analyticsView === "weekly" || analyticsView === "both"
                        ? "bg-blue-600 text-white"
                        : darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    Weekly
                  </button>
                  <button
                    onClick={() => setAnalyticsView("monthly")}
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      analyticsView === "monthly" || analyticsView === "both"
                        ? "bg-blue-600 text-white"
                        : darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    Monthly
                  </button>
                </div>
              </div>

              {/* Hero Productivity Score Circle */}
              <div className="flex justify-center mb-8">
                <div className="relative w-48 h-48">
                  {/* Background Circle */}
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                    <circle
                      cx="100"
                      cy="100"
                      r="85"
                      stroke={darkMode ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.3)"}
                      strokeWidth="14"
                      fill="none"
                    />
                    {/* Animated Progress Circle */}
                    <circle
                      cx="100"
                      cy="100"
                      r="85"
                      stroke={
                        analytics.productivityScore >= 80
                          ? "#10b981"
                          : analytics.productivityScore >= 60
                          ? "#f59e0b"
                          : "#ef4444"
                      }
                      strokeWidth="14"
                      fill="none"
                      strokeDasharray={`${(analytics.productivityScore / 100) * 534} 534`}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out"
                      style={{
                        filter: `drop-shadow(0 0 8px ${
                          analytics.productivityScore >= 80
                            ? "#10b98160"
                            : analytics.productivityScore >= 60
                            ? "#f59e0b60"
                            : "#ef444460"
                        })`
                      }}
                    />
                  </svg>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className={`text-5xl font-bold animate-scale-in ${
                      analytics.productivityScore >= 80
                        ? "text-emerald-500"
                        : analytics.productivityScore >= 60
                        ? "text-amber-500"
                        : "text-red-500"
                    }`}>
                      {analytics.productivityScore}
                    </p>
                    <p className={`text-sm font-medium mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                      Productivity
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className={`rounded-xl shadow-md p-4 ${darkMode ? "bg-slate-900/40" : "bg-white/70"}`}>
                  <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Total Tasks</p>
                  <p className={`mt-1 text-2xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{analytics.totalTasks}</p>
                </div>
                <div className={`rounded-xl shadow-md p-4 ${darkMode ? "bg-slate-900/40" : "bg-white/70"}`}>
                  <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Completed</p>
                  <p className={`mt-1 text-2xl font-bold text-emerald-600`}>{analytics.completedTasks}</p>
                </div>
                <div className={`rounded-xl shadow-md p-4 ${darkMode ? "bg-slate-900/40" : "bg-white/70"}`}>
                  <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Completion Rate</p>
                  <p className={`mt-1 text-2xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{analytics.completionRate}%</p>
                </div>
                <div className={`rounded-xl shadow-md p-4 ${darkMode ? "bg-slate-900/40" : "bg-white/70"}`}>
                  <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Productivity Score</p>
                  <p className={`mt-1 text-2xl font-bold ${
                    analytics.productivityScore >= 75 ? "text-emerald-600" :
                    analytics.productivityScore >= 45 ? "text-amber-600" : "text-red-600"
                  }`}>{analytics.productivityScore}/100</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {(analyticsView === "weekly" || analyticsView === "both") && (
                  <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <p className={`font-bold mb-2 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Last 7 Days Completion</p>
                    <p className={`text-3xl font-bold text-blue-600`}>{analytics.last7CompletionRate}%</p>
                    <p className={`text-xs mt-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Tasks due in the last 7 days</p>
                  </div>
                )}
                {(analyticsView === "monthly" || analyticsView === "both") && (
                  <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <p className={`font-bold mb-2 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>This Month</p>
                    <p className={`text-3xl font-bold text-purple-600`}>{monthlyAnalytics.completionRate}%</p>
                    <p className={`text-xs mt-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{monthlyAnalytics.completed} of {monthlyAnalytics.total} tasks done</p>
                  </div>
                )}
                {(analyticsView === "weekly" || analyticsView === "both") && (
                  <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <p className={`font-bold mb-2 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Weekly Routine Adherence</p>
                    <p className={`text-3xl font-bold text-emerald-600`}>{routineAnalytics.weeklyRate}%</p>
                    <p className={`text-xs mt-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                      {routineAnalytics.weeklyCompleted} of {routineAnalytics.weeklyExpected} routine occurrences done
                    </p>
                  </div>
                )}
                {(analyticsView === "monthly" || analyticsView === "both") && (
                  <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <p className={`font-bold mb-2 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Monthly Routine Adherence</p>
                    <p className={`text-3xl font-bold text-emerald-600`}>{routineAnalytics.monthlyRate}%</p>
                    <p className={`text-xs mt-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                      {routineAnalytics.monthlyCompleted} of {routineAnalytics.monthlyExpected} routine occurrences done
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                  <p className={`font-bold mb-4 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Task Distribution</p>
                  <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                    <div
                      className={`relative h-36 w-36 rounded-full ${chartAnimated ? "transition-all duration-700" : ""}`}
                      style={{
                        background: `conic-gradient(
                          #10b981 0% ${chartDistribution.completedPct}%,
                          #3b82f6 ${chartDistribution.completedPct}% ${chartDistribution.completedPct + chartDistribution.upcomingPct}%,
                          #ef4444 ${chartDistribution.completedPct + chartDistribution.upcomingPct}% 100%
                        )`,
                      }}
                    >
                      <div className={`absolute inset-5 rounded-full ${darkMode ? "bg-slate-900" : "bg-white"}`} />
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className={`${darkMode ? "text-slate-300" : "text-slate-700"}`}><span className="font-semibold text-emerald-500">● Completed:</span> {chartDistribution.completedPct}%</p>
                      <p className={`${darkMode ? "text-slate-300" : "text-slate-700"}`}><span className="font-semibold text-blue-500">● Upcoming:</span> {chartDistribution.upcomingPct}%</p>
                      <p className={`${darkMode ? "text-slate-300" : "text-slate-700"}`}><span className="font-semibold text-red-500">● Overdue:</span> {chartDistribution.overduePct}%</p>
                      <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Based on {chartDistribution.total} tasks</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                  <p className={`font-bold mb-4 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>7-Day Completion Graph</p>
                  <div className="h-40 grid grid-cols-7 gap-2 items-end">
                    {weeklyTrend.days.map((day) => {
                      const totalHeight = (day.total / weeklyTrend.maxTotal) * 100;
                      const completedHeight = day.total ? (day.completed / day.total) * totalHeight : 0;
                      return (
                        <div key={day.key} className="flex flex-col items-center gap-1">
                          <div className={`relative h-28 w-5 rounded-md ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
                            <div
                              className={`absolute bottom-0 left-0 w-full rounded-md ${darkMode ? "bg-blue-500/70" : "bg-blue-400/70"} ${chartAnimated ? "transition-all duration-700" : ""}`}
                              style={{ height: `${Math.max(totalHeight, day.total > 0 ? 6 : 0)}%` }}
                            />
                            <div
                              className={`absolute bottom-0 left-0 w-full rounded-md ${chartAnimated ? "transition-all duration-700" : ""} bg-emerald-500`}
                              style={{ height: `${Math.max(completedHeight, day.completed > 0 ? 6 : 0)}%` }}
                            />
                          </div>
                          <p className={`text-[10px] ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{day.label}</p>
                        </div>
                      );
                    })}
                  </div>
                  <p className={`mt-2 text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                    Green = completed, Blue = total tasks due each day.
                  </p>
                </div>
              </div>
            </section>
          ) : activeSection === "routine" ? (
            /* ROUTINE SECTION */
            <div className="space-y-6 animate-fade-in">
                {/* Add Routine Form */}
                <section className={`rounded-3xl p-6 backdrop-blur-md shadow-lg ${
                  darkMode ? "bg-white/5" : "bg-white/40"
                }`}>
                  <h3 className={`text-lg font-semibold mb-4 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Add New Routine</h3>
                  <div className="space-y-3">
                    <input
                      value={routineTitle}
                      onChange={(e) => setRoutineTitle(e.target.value)}
                      placeholder="Routine title"
                      className={`w-full rounded-xl border-2 px-4 py-3 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                    <textarea
                      value={routineDescription}
                      onChange={(e) => setRoutineDescription(e.target.value)}
                      rows={2}
                      placeholder="Description (optional)"
                      className={`w-full rounded-xl border-2 px-4 py-3 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                    <div className="grid gap-2 md:grid-cols-[1fr_110px_130px_auto]">
                      <select
                        value={routineDayOfWeek}
                        onChange={(e) => setRoutineDayOfWeek(Number(e.target.value))}
                        className={`rounded-xl border-2 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                          darkMode
                            ? "border-slate-700 bg-slate-900/50 text-slate-100"
                            : "border-slate-200 bg-white/70 text-slate-900"
                        }`}
                      >
                        <option value={7}>Daily</option>
                        <option value={0}>Sunday</option>
                        <option value={1}>Monday</option>
                        <option value={2}>Tuesday</option>
                        <option value={3}>Wednesday</option>
                        <option value={4}>Thursday</option>
                        <option value={5}>Friday</option>
                        <option value={6}>Saturday</option>
                      </select>
                      <select
                        value={routinePriority}
                        onChange={(e) => setRoutinePriority(e.target.value as TaskPriority)}
                        className={`rounded-xl border-2 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                          darkMode
                            ? "border-slate-700 bg-slate-900/50 text-slate-100"
                            : "border-slate-200 bg-white/70 text-slate-900"
                        }`}
                      >
                        <option>LOW</option>
                        <option>MEDIUM</option>
                        <option>HIGH</option>
                      </select>
                      <input
                        type="time"
                        value={routineTime}
                        onChange={(e) => setRoutineTime(e.target.value)}
                        className={`rounded-xl border-2 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                          darkMode
                            ? "border-slate-700 bg-slate-900/50 text-slate-100"
                            : "border-slate-200 bg-white/70 text-slate-900"
                        }`}
                      />
                      <button
                        onClick={addRoutine}
                        className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </section>

                {/* Routines List */}
                <section className={`rounded-3xl p-6 backdrop-blur-xl shadow-xl ${
                  darkMode ? "bg-white/5" : "bg-white/50"
                }`}>
                  <h3 className={`text-2xl font-bold mb-4 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Your Routines</h3>
                  {loadingRoutines ? (
                    <p className={`text-sm text-center py-4 ${
                      darkMode ? "text-slate-400" : "text-slate-600"
                    }`}>
                      <span className="text-xl block mb-2">⏳</span>
                      Loading your routines...
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* Daily Routines */}
                      {routines.filter(r => r.dayOfWeek === 7).length > 0 && (
                        <div>
                          <h4 className={`font-semibold mb-2 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>🔁 Daily</h4>
                          <div className="space-y-2">
                            {routines
                              .filter(r => r.dayOfWeek === 7)
                              .sort((a, b) => a.time.localeCompare(b.time))
                              .map(routine => (
                                <div 
                                  key={routine.id}
                                  onClick={() => toggleRoutineExpanded(routine.id)}
                                  className={`rounded-lg border p-3 backdrop-blur-sm transition ${
                                    darkMode
                                      ? "bg-slate-900/40 border-slate-700"
                                      : "bg-white/50 border-slate-200/50"
                                  } ${!routine.isActive ? "opacity-50" : ""} cursor-pointer`}
                                >
                                  {editingRoutineId === routine.id ? (
                                    <div className="space-y-3">
                                      <input
                                        value={editRoutineTitle}
                                        onChange={(e) => setEditRoutineTitle(e.target.value)}
                                        placeholder="Routine title"
                                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                                          darkMode
                                            ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                            : "border-slate-200 bg-white/70 text-slate-900"
                                        }`}
                                      />
                                      <textarea
                                        value={editRoutineDescription}
                                        onChange={(e) => setEditRoutineDescription(e.target.value)}
                                        placeholder="Description (optional)"
                                        rows={2}
                                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none ${
                                          darkMode
                                            ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                            : "border-slate-200 bg-white/70 text-slate-900"
                                        }`}
                                      />
                                      <div className="grid gap-2 sm:grid-cols-[1fr_100px_120px]">
                                        <select
                                          value={editRoutineDayOfWeek}
                                          onChange={(e) => setEditRoutineDayOfWeek(Number(e.target.value))}
                                          className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                            darkMode
                                              ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                              : "border-slate-200 bg-white/70 text-slate-900"
                                          }`}
                                        >
                                          <option value={7}>Daily</option>
                                          <option value={0}>Sunday</option>
                                          <option value={1}>Monday</option>
                                          <option value={2}>Tuesday</option>
                                          <option value={3}>Wednesday</option>
                                          <option value={4}>Thursday</option>
                                          <option value={5}>Friday</option>
                                          <option value={6}>Saturday</option>
                                        </select>
                                        <input
                                          type="time"
                                          value={editRoutineTime}
                                          onChange={(e) => setEditRoutineTime(e.target.value)}
                                          className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                            darkMode
                                              ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                              : "border-slate-200 bg-white/70 text-slate-900"
                                          }`}
                                        />
                                        <select
                                          value={editRoutinePriority}
                                          onChange={(e) => setEditRoutinePriority(e.target.value as TaskPriority)}
                                          className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                            darkMode
                                              ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                              : "border-slate-200 bg-white/70 text-slate-900"
                                          }`}
                                        >
                                          <option>LOW</option>
                                          <option>MEDIUM</option>
                                          <option>HIGH</option>
                                        </select>
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => saveRoutineEdit(routine.id)}
                                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={cancelEditRoutine}
                                          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                            darkMode
                                              ? "bg-slate-700 text-slate-100 hover:bg-slate-600"
                                              : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                          }`}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <p className={`font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
                                            {routine.title}
                                          </p>
                                          <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                            {routine.time} • <PriorityBadge priority={routine.priority} darkMode={darkMode} />
                                            {!routine.isActive && <span className="ml-2 text-xs">(Inactive)</span>}
                                          </p>
                                          {expandedRoutineIds.includes(routine.id) && routine.description && (
                                            <p className={`text-xs mt-1 whitespace-pre-line break-words ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                              {routine.description}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleRoutineActive(routine.id, routine.isActive);
                                            }}
                                            className={`rounded px-2 py-1 text-xs font-semibold transition hover:scale-105 active:scale-95 ${
                                              routine.isActive
                                                ? "bg-emerald-100/60 text-emerald-700"
                                                : "bg-amber-100/60 text-amber-700"
                                            }`}
                                          >
                                            {routine.isActive ? "Active" : "Inactive"}
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              startEditRoutine(routine);
                                            }}
                                            className={`rounded px-2 py-1 text-xs font-semibold transition hover:scale-105 active:scale-95 ${
                                              darkMode ? "bg-slate-700 text-slate-100 hover:bg-slate-600" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                            }`}
                                          >
                                            Edit
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              requestRoutineDelete(routine.id);
                                            }}
                                            className="rounded bg-red-100/60 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition hover:scale-105 active:scale-95"
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Weekly Routines by Day */}
                      {[
                        { day: 0, name: "Sunday", emoji: "☀️" },
                        { day: 1, name: "Monday", emoji: "🌙" },
                        { day: 2, name: "Tuesday", emoji: "🔥" },
                        { day: 3, name: "Wednesday", emoji: "🌊" },
                        { day: 4, name: "Thursday", emoji: "⚡" },
                        { day: 5, name: "Friday", emoji: "🎉" },
                        { day: 6, name: "Saturday", emoji: "⭐" },
                      ].map(({ day, name, emoji }) => {
                        const dayRoutines = routines.filter(r => r.dayOfWeek === day);
                        if (dayRoutines.length === 0) return null;

                        return (
                          <div key={day}>
                            <h4 className={`font-semibold mb-2 ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
                              {emoji} {name}
                            </h4>
                            <div className="space-y-2">
                              {dayRoutines
                                .sort((a, b) => a.time.localeCompare(b.time))
                                .map(routine => (
                                  <div 
                                    key={routine.id}
                                    onClick={() => toggleRoutineExpanded(routine.id)}
                                    className={`rounded-lg border p-3 backdrop-blur-sm transition ${
                                      darkMode
                                        ? "bg-slate-900/40 border-slate-700"
                                        : "bg-white/50 border-slate-200/50"
                                    } ${!routine.isActive ? "opacity-50" : ""} cursor-pointer`}
                                  >
                                    {editingRoutineId === routine.id ? (
                                      <div className="space-y-3">
                                        <input
                                          value={editRoutineTitle}
                                          onChange={(e) => setEditRoutineTitle(e.target.value)}
                                          placeholder="Routine title"
                                          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                                            darkMode
                                              ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                              : "border-slate-200 bg-white/70 text-slate-900"
                                          }`}
                                        />
                                        <textarea
                                          value={editRoutineDescription}
                                          onChange={(e) => setEditRoutineDescription(e.target.value)}
                                          placeholder="Description (optional)"
                                          rows={2}
                                          className={`w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none ${
                                            darkMode
                                              ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                              : "border-slate-200 bg-white/70 text-slate-900"
                                          }`}
                                        />
                                        <div className="grid gap-2 sm:grid-cols-[1fr_100px_120px]">
                                          <select
                                            value={editRoutineDayOfWeek}
                                            onChange={(e) => setEditRoutineDayOfWeek(Number(e.target.value))}
                                            className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                              darkMode
                                                ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                                : "border-slate-200 bg-white/70 text-slate-900"
                                            }`}
                                          >
                                            <option value={7}>Daily</option>
                                            <option value={0}>Sunday</option>
                                            <option value={1}>Monday</option>
                                            <option value={2}>Tuesday</option>
                                            <option value={3}>Wednesday</option>
                                            <option value={4}>Thursday</option>
                                            <option value={5}>Friday</option>
                                            <option value={6}>Saturday</option>
                                          </select>
                                          <input
                                            type="time"
                                            value={editRoutineTime}
                                            onChange={(e) => setEditRoutineTime(e.target.value)}
                                            className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                              darkMode
                                                ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                                : "border-slate-200 bg-white/70 text-slate-900"
                                            }`}
                                          />
                                          <select
                                            value={editRoutinePriority}
                                            onChange={(e) => setEditRoutinePriority(e.target.value as TaskPriority)}
                                            className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                              darkMode
                                                ? "border-slate-700 bg-slate-900/50 text-slate-100"
                                                : "border-slate-200 bg-white/70 text-slate-900"
                                            }`}
                                          >
                                            <option>LOW</option>
                                            <option>MEDIUM</option>
                                            <option>HIGH</option>
                                          </select>
                                        </div>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => saveRoutineEdit(routine.id)}
                                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={cancelEditRoutine}
                                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                              darkMode
                                                ? "bg-slate-700 text-slate-100 hover:bg-slate-600"
                                                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                            }`}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className={`font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
                                              {routine.title}
                                            </p>
                                            <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                              {routine.time} • <PriorityBadge priority={routine.priority} darkMode={darkMode} />
                                              {!routine.isActive && <span className="ml-2 text-xs">(Inactive)</span>}
                                            </p>
                                            {expandedRoutineIds.includes(routine.id) && routine.description && (
                                              <p className={`text-xs mt-1 whitespace-pre-line break-words ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                                {routine.description}
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex gap-1 shrink-0">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleRoutineActive(routine.id, routine.isActive);
                                              }}
                                              className={`rounded px-2 py-1 text-xs font-semibold transition hover:scale-105 active:scale-95 ${
                                                routine.isActive
                                                  ? "bg-emerald-100/60 text-emerald-700"
                                                  : "bg-amber-100/60 text-amber-700"
                                              }`}
                                            >
                                              {routine.isActive ? "Active" : "Inactive"}
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                startEditRoutine(routine);
                                              }}
                                              className={`rounded px-2 py-1 text-xs font-semibold transition hover:scale-105 active:scale-95 ${
                                                darkMode ? "bg-slate-700 text-slate-100 hover:bg-slate-600" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                              }`}
                                            >
                                              Edit
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                requestRoutineDelete(routine.id);
                                              }}
                                              className="rounded bg-red-100/60 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition hover:scale-105 active:scale-95"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        );
                      })}

                      {routines.length === 0 && (
                        <p className={`text-sm text-center py-8 ${
                          darkMode ? "text-slate-400" : "text-slate-600"
                        }`}>
                          <span className="text-3xl block mb-3">🌟</span>
                          <span className="font-medium">No routines yet!</span>
                          <br />
                          <span className="text-xs">Create your first habit above to get started.</span>
                        </p>
                      )}

                    </div>
                  )}
                </section>
              </div>
          ) : activeSection === "help" ? (
            /* HELP & GUIDE SECTION */
            <div className="space-y-6 animate-fade-in">
              <section className={`rounded-3xl p-6 backdrop-blur-xl border shadow-xl ${
                darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
              }`}>
                <h2 className={`text-3xl font-bold mb-6 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Help & User Guide</h2>
                
                {/* Getting Started */}
                <div className="mb-8">
                  <h3 className={`text-xl font-bold mb-3 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>🚀 Getting Started</h3>
                  <div className={`rounded-lg border p-4 space-y-2 ${
                    darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/50"
                  }`}>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Add a task:</strong> Go to "All Tasks" and enter a task title, description (optional), due date, time, and priority.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>View your day:</strong> The "Today" section shows all tasks for the selected date. Click a task title to see its description.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Mark done:</strong> Click the "Done" button to complete a task. Click "Undo" to revert.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Delete a task:</strong> In "All Tasks", click "Delete" and confirm. (Today tasks cannot be directly deleted here to prevent accidents.)
                    </p>
                  </div>
                </div>

                {/* Routines */}
                <div className="mb-8">
                  <h3 className={`text-xl font-bold mb-3 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>🔁 Weekly Routines</h3>
                  <div className={`rounded-lg border p-4 space-y-2 ${
                    darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/50"
                  }`}>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Create routines:</strong> Go to "Routine" and add a daily habit. Choose "Daily" for every day, or a specific day (Mon–Sun).
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Routine tasks appear automatically:</strong> On matching days, your routines show in "Today's Tasks" with a 🔁 badge.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Track habit adherence:</strong> See your weekly and monthly routine completion % in "Routine Adherence" cards (separate from task completion).
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Toggle routines:</strong> Use "Active/Inactive" to pause a routine without deleting it.
                    </p>
                  </div>
                </div>

                {/* Calendar & Analytics */}
                <div className="mb-8">
                  <h3 className={`text-xl font-bold mb-3 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>📊 Calendar & Analytics</h3>
                  <div className={`rounded-lg border p-4 space-y-2 ${
                    darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/50"
                  }`}>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Mini calendar:</strong> The calendar in "Today" shows ◆ dots on dates with tasks. Click any date to view that day's tasks.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Productivity score:</strong> "Analytics" shows your overall score based on task completion, overdue items, and high-priority tasks.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Pie chart:</strong> Shows your custom task completion % (excludes routines for clarity).
                    </p>
                  </div>
                </div>

                {/* Guest vs Account */}
                <div className="mb-8">
                  <h3 className={`text-xl font-bold mb-3 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>👤 Guest vs Account Mode</h3>
                  <div className={`rounded-lg border p-4 space-y-2 ${
                    darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/50"
                  }`}>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Guest mode:</strong> Your tasks and routines are saved in your browser only. No login required; perfect for quick starts.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Account mode:</strong> Create an account to sync tasks across devices, backup data, and receive optional reminders.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Switch anytime:</strong> Use the Account / Guest buttons at the bottom of the sidebar to switch modes.
                    </p>
                  </div>
                </div>

                {/* Offline Support */}
                <div className="mb-8">
                  <h3 className={`text-xl font-bold mb-3 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>📴 Offline & App Installation</h3>
                  <div className={`rounded-lg border p-4 space-y-2 ${
                    darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/50"
                  }`}>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Works offline:</strong> Tasks sync when your internet returns. Changes made offline are queued and sent automatically.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <strong>Install as app:</strong> Click "📱 Install App" to use TASKFLOW like a native app on mobile or desktop.
                    </p>
                  </div>
                </div>

                {/* Tips */}
                <div>
                  <h3 className={`text-xl font-bold mb-3 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>💡 Quick Tips</h3>
                  <div className={`rounded-lg border p-4 space-y-2 ${
                    darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/50"
                  }`}>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      • Use task descriptions (notes) for details that don't fit in the title.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      • Set HIGH priority for urgent tasks to track them better in analytics.
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      • Create routines for anything you do regularly (exercise, meetings, reviews).
                    </p>
                    <p className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      • Dark mode is perfect for late-night planning. Toggle it anytime from the sidebar.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          ) : activeSection === "account" && workspaceMode === "account" && status === "authenticated" ? (
            /* ACCOUNT SECTION */
            <div className="space-y-6 animate-fade-in">
              {/* Guest Migration Modal */}
              {guestUpgradeOpen && (
                <div className={`fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50`}>
                  <div className={`rounded-2xl p-6 max-w-md backdrop-blur-xl border shadow-xl ${
                    darkMode ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
                  }`}>
                    <h3 className={`text-xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Import Guest Data?</h3>
                    <p className={`mt-2 text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      You have guest tasks and routines. Would you like to import them to your account?
                    </p>
                    <div className="mt-4 space-y-2">
                      <button
                        onClick={importGuestTasksToAccount}
                        disabled={guestUpgradeLoading}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                      >
                        {guestUpgradeLoading ? "Importing..." : "Import Data"}
                      </button>
                      <button
                        onClick={skipGuestImport}
                        className={`w-full px-4 py-2 rounded-lg font-semibold ${
                          darkMode
                            ? "bg-slate-700 text-slate-100 hover:bg-slate-600"
                            : "bg-slate-200 text-slate-900 hover:bg-slate-300"
                        }`}
                      >
                        Skip
                      </button>
                      <button
                        onClick={deleteGuestTasks}
                        className="w-full bg-red-600/20 text-red-600 px-4 py-2 rounded-lg font-semibold hover:bg-red-600/30"
                      >
                        Delete Guest Tasks
                      </button>
                    </div>
                    {guestUpgradeMessage && <p className="mt-3 text-sm text-center text-emerald-600 font-medium">{guestUpgradeMessage}</p>}
                  </div>
                </div>
              )}

              {/* Profile Section */}
              <section className={`rounded-3xl p-6 backdrop-blur-xl border shadow-xl ${
                darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
              }`}>
                <h3 className={`text-xl font-bold mb-4 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Profile</h3>
                <div className="space-y-3">
                  <div>
                    <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Full Name</label>
                    <input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className={`w-full mt-1 rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Date of Birth (Optional)</label>
                    <input
                      type="date"
                      value={profileDateOfBirth}
                      onChange={(e) => setProfileDateOfBirth(e.target.value)}
                      className={`w-full mt-1 rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                  </div>
                  <button
                    onClick={saveProfile}
                    disabled={profileLoading}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {profileLoading ? "Saving..." : "Save Profile"}
                  </button>
                  {profileMessage && <AlertMessage message={profileMessage} />}
                </div>
              </section>

              {/* Email Section */}
              <section className={`rounded-3xl p-6 backdrop-blur-xl border shadow-xl ${
                darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
              }`}>
                <h3 className={`text-xl font-bold mb-4 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Change Email</h3>
                <div className="space-y-3">
                  <div>
                    <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>New Email</label>
                    <input
                      type="email"
                      value={newEmailInput}
                      onChange={(e) => setNewEmailInput(e.target.value)}
                      className={`w-full mt-1 rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Current Password</label>
                    <input
                      type="password"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      className={`w-full mt-1 rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                  </div>
                  <button
                    onClick={changeEmail}
                    disabled={emailLoading}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {emailLoading ? "Updating..." : "Change Email"}
                  </button>
                  {emailMessage && <AlertMessage message={emailMessage} />}
                </div>
              </section>

              {/* Password Section */}
              <section className={`rounded-3xl p-6 backdrop-blur-xl border shadow-xl ${
                darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
              }`}>
                <h3 className={`text-xl font-bold mb-4 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Change Password</h3>
                <div className="space-y-3">
                  <div>
                    <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Current Password</label>
                    <input
                      type="password"
                      value={currentPasswordInput}
                      onChange={(e) => setCurrentPasswordInput(e.target.value)}
                      className={`w-full mt-1 rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>New Password (min 6 chars)</label>
                    <input
                      type="password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      className={`w-full mt-1 rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                  </div>
                  <button
                    onClick={changePassword}
                    disabled={passwordLoading}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {passwordLoading ? "Updating..." : "Change Password"}
                  </button>
                  {passwordMessage && <AlertMessage message={passwordMessage} />}
                </div>
              </section>

              {/* Export & Delete Section */}
              <section className={`rounded-3xl p-6 backdrop-blur-xl border shadow-xl ${
                darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
              }`}>
                <h3 className={`text-xl font-bold mb-4 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Data Management</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => void exportAccountData(today)}
                    className="w-full bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-emerald-700"
                  >
                    📥 Export All Tasks
                  </button>
                  <div>
                    <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>Delete Account - Enter Password</label>
                    <input
                      type="password"
                      value={deletePasswordInput}
                      onChange={(e) => setDeletePasswordInput(e.target.value)}
                      placeholder="Confirm password to delete account"
                      className={`w-full mt-1 rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/50 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                  </div>
                  <button
                    onClick={openDeleteAccountDialog}
                    disabled={deleteLoading || deleteAccountBusy}
                    className="w-full bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteLoading || deleteAccountBusy ? "Deleting..." : "🗑️ Delete Account Permanently"}
                  </button>
                  {deleteMessage && <AlertMessage message={deleteMessage} successKeyword="deleted" />}
                </div>
              </section>
            </div>
          ) : (
            <div className={`rounded-2xl p-6 backdrop-blur-md border shadow-lg text-center ${
              darkMode ? "bg-white/10 border-white/20 text-slate-300" : "bg-white/40 border-white/50 text-slate-700"
            }`}>
              Please sign in to access Account settings.
            </div>
          )}
        </div>
      </div>
      </div>
      <ConfirmDialog
        open={deleteTaskDialogOpen}
        title="Delete task?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        busy={deleteTaskBusy}
        darkMode={darkMode}
        onCancel={closeDeleteTaskDialog}
        onConfirm={confirmDeleteTask}
      />
      <ConfirmDialog
        open={deleteRoutineDialogOpen}
        title="Delete routine?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        busy={deleteRoutineBusy}
        darkMode={darkMode}
        onCancel={closeDeleteRoutineDialog}
        onConfirm={confirmDeleteRoutine}
      />
      <ConfirmDialog
        open={deleteAccountDialogOpen}
        title="Delete account?"
        message="This action cannot be undone and will permanently remove your account data."
        confirmLabel="Delete"
        busy={deleteAccountBusy || deleteLoading}
        darkMode={darkMode}
        onCancel={closeDeleteAccountDialog}
        onConfirm={confirmDeleteAccount}
      />
      {/* Footer */}
      <footer className={`shrink-0 border-t py-4 ${darkMode ? "border-white/10" : "border-slate-200"}`}>
        <div className={`mx-auto w-full max-w-7xl px-4 md:px-8 grid gap-2 text-sm items-center text-center sm:grid-cols-3 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
          <span className="order-2 sm:order-1 sm:text-left">© 2026 ShadowXByte</span>
          <span className="order-1 sm:order-2 text-xs sm:text-sm">Plan better. Finish on time.</span>
          <a
            href="https://github.com/ShadowXByte"
            target="_blank"
            rel="noreferrer"
            className="order-3 hover:underline sm:text-right"
          >
            GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}

export { PageContent };

export default function WorkspacePage() {
  return <ClientWrapper />;
}
