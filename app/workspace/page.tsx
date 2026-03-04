"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import ClientWrapper from "./ClientWrapper";

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
  toTimeInputValue,
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
import {
  WEEKDAYS,
  GUEST_TASKS_KEY,
  GUEST_ROUTINES_KEY,
  THEME_KEY,
  NOTIFICATION_ASKED_KEY,
  NOTIFIED_TASKS_KEY,
  ACCOUNT_TASKS_CACHE_PREFIX,
  ACCOUNT_ROUTINES_CACHE_PREFIX,
  ACCOUNT_PENDING_OPS_PREFIX,
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
  const [offlineAccountMode, setOfflineAccountMode] = useState(false);

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
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([]);
  const [editDueDateInput, setEditDueDateInput] = useState(formatDisplayDate(today));
  const [editDueTimeInput, setEditDueTimeInput] = useState("09:00");
  const [editPriority, setEditPriority] = useState<TaskPriority>("MEDIUM");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState("");
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstallApp, setCanInstallApp] = useState(false);
  const [isInstalledApp, setIsInstalledApp] = useState(false);
  const [chartAnimated, setChartAnimated] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("today");
  const [analyticsView, setAnalyticsView] = useState<AnalyticsView>("both");
  const [selectedDate, setSelectedDate] = useState(today);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDateOfBirth, setProfileDateOfBirth] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deletePasswordInput, setDeletePasswordInput] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
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
  const [loadingRoutines, setLoadingRoutines] = useState(false);
  const [nextGuestRoutineId, setNextGuestRoutineId] = useState(1);
  const [completedRoutineKeys, setCompletedRoutineKeys] = useState<string[]>([]);

  const accountKey = useMemo(() => {
    const userId = session?.user?.id?.toString().trim();
    const emailValue = session?.user?.email?.toLowerCase().trim();
    return userId || emailValue || "anonymous";
  }, [session?.user?.email, session?.user?.id]);

  const accountTasksCacheKey = `${ACCOUNT_TASKS_CACHE_PREFIX}:${accountKey}`;
  const accountRoutinesCacheKey = `${ACCOUNT_ROUTINES_CACHE_PREFIX}:${accountKey}`;
  const accountPendingOpsKey = `${ACCOUNT_PENDING_OPS_PREFIX}:${accountKey}`;
  const accountMigrationDecisionKey = `${ACCOUNT_MIGRATION_DECISION_PREFIX}:${accountKey}`;
  const routineCompletionsKey = workspaceMode === "guest"
    ? "taskflow_guest_routine_completions"
    : `taskflow_account_routine_completions:${accountKey}`;

  const getRoutineCompletionKey = (routineId: number, date: string) => `${routineId}:${date}`;

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

  // Restore cached session when offline in account mode
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const CACHED_SESSION_KEY = "taskflow-cached-session";
    const cachedSession = readJsonFromStorage<any>(CACHED_SESSION_KEY, null);

    // In account mode: check if offline with cached session
    if (workspaceMode === "account" && cachedSession && cachedSession.user) {
      if (isOffline) {
        // Offline with cached session → use offline account mode
        setOfflineAccountMode(true);
        setEmail(cachedSession.user.email || "");
        setName(cachedSession.user.name || "");
      } else if (status === "authenticated") {
        // Back online and authenticated → clear offline mode
        setOfflineAccountMode(false);
      }
    }
  }, [workspaceMode, isOffline, status]);

  // Persist session to localStorage for offline account access
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const CACHED_SESSION_KEY = "taskflow-cached-session";

    // Save session when authenticated
    if (status === "authenticated" && session?.user) {
      safeStorageSetItem(CACHED_SESSION_KEY, JSON.stringify(session));
      setOfflineAccountMode(false);
    }

    // Clear offline mode when back online and authenticated
    if (!isOffline && status === "authenticated") {
      setOfflineAccountMode(false);
    }
  }, [status, session, isOffline]);

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

    // Silently register - don't block UI if registration fails
    void navigator.serviceWorker.register(SW_PATH).catch(() => {
      return;
    });
  }, []);

  const readAccountCachedTasks = useCallback(() => {
    return readJsonFromStorage<Task[]>(accountTasksCacheKey, []);
  }, [accountTasksCacheKey]);

  const writeAccountCachedTasks = useCallback((nextTasks: Task[]) => {
    safeStorageSetItem(accountTasksCacheKey, JSON.stringify(nextTasks));
  }, [accountTasksCacheKey]);

  const readAccountCachedRoutines = useCallback(() => {
    return readJsonFromStorage<any[]>(accountRoutinesCacheKey, []);
  }, [accountRoutinesCacheKey]);

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

  // TODO: Add retry logic with exponential backoff for failed syncs
  // FIXME: This doesn't handle conflicts if user edits same task on multiple devices
  const flushPendingAccountOps = useCallback(async () => {
    if (workspaceMode !== "account" || status !== "authenticated" || isOffline) {
      return;
    }

    const ops = readPendingAccountOps();
    if (!ops.length) {
      return;
    }

    const tempIdMap = new Map<number, number>();

    try {
      for (const op of ops) {
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
      }

      writePendingAccountOps([]);

      const refresh = await fetch("/api/tasks", { cache: "no-store" });
      if (refresh.ok) {
        const freshTasks = (await refresh.json()) as Task[];
        setTasks(freshTasks);
        writeAccountCachedTasks(freshTasks);
      }
    } catch {
      return;
    }
  }, [isOffline, readPendingAccountOps, status, workspaceMode, writeAccountCachedTasks, writePendingAccountOps]);

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

      // In account mode: check offline first (takes priority)
      if (isOffline) {
        setTasks(readAccountCachedTasks());
        return;
      }

      // Online in account mode: need authentication
      if (status !== "authenticated") {
        setTasks([]);
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
        setTasks(readAccountCachedTasks());
      } finally {
        setLoadingTasks(false);
      }
    };

    void loadTasks();
  }, [isOffline, readAccountCachedTasks, status, workspaceMode, writeAccountCachedTasks]);

  useEffect(() => {
    if (workspaceMode !== "account" || status !== "authenticated") {
      return;
    }

    writeAccountCachedTasks(tasks);
  }, [workspaceMode, status, tasks, writeAccountCachedTasks]);

  useEffect(() => {
    if (workspaceMode !== "account" || (!status && !offlineAccountMode)) {
      return;
    }

    writeAccountCachedRoutines(routines);
  }, [workspaceMode, status, offlineAccountMode, routines, writeAccountCachedRoutines]);

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

  useEffect(() => {
    void flushPendingAccountOps();
  }, [flushPendingAccountOps]);

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

    if (workspaceMode === "account" && (status === "authenticated" || offlineAccountMode)) {
      void fetchRoutines();
    }
  }, [workspaceMode, status, offlineAccountMode]);

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

  const syncPushSubscription = async (permission: NotificationPermission) => {
    try {
      setPushStatusMessage("");
      if (
        workspaceMode !== "account" ||
        status !== "authenticated" ||
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setPushEnabled(false);
        setPushStatusMessage("Push is available only in account mode on supported browsers.");
        return;
      }

      const configResponse = await fetch("/api/push/subscribe", { cache: "no-store" });
      if (!configResponse.ok) {
        setPushConfigured(false);
        setPushEnabled(false);
        setPushStatusMessage("Push config could not be loaded.");
        return;
      }

      const config = (await configResponse.json()) as { configured?: boolean; vapidPublicKey?: string };
      const vapidPublicKey = config.vapidPublicKey || "";
      const isConfigured = Boolean(config.configured && vapidPublicKey);
      setPushConfigured(isConfigured);

      if (!isConfigured) {
        setPushEnabled(false);
        setPushStatusMessage("Push is not configured on the server.");
        return;
      }

      const existingRegistration = await navigator.serviceWorker.getRegistration(SW_PATH);
      const registration = existingRegistration || (await navigator.serviceWorker.register(SW_PATH));
      await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();

      if (permission !== "granted") {
        if (existingSubscription) {
          const endpoint = existingSubscription.endpoint;
          await existingSubscription.unsubscribe();
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint }),
          });
        }
        setPushEnabled(false);
        setPushStatusMessage("Notification permission is not granted.");
        return;
      }

      const subscription =
        existingSubscription ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setPushEnabled(false);
        setPushStatusMessage("Push subscription data is incomplete.");
        return;
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        }),
      });

      setPushEnabled(response.ok);
      setPushStatusMessage(response.ok ? "Push notifications are active." : "Failed to save push subscription.");
    } catch (error) {
      setPushEnabled(false);
      const message = error instanceof Error ? error.message : "Push activation failed.";
      setPushStatusMessage(message);
    }
  };

  useEffect(() => {
    if (notificationPermission === "unsupported") {
      setPushEnabled(false);
      return;
    }

    void syncPushSubscription(notificationPermission as NotificationPermission);
  }, [workspaceMode, status, notificationPermission]);

  // TODO: Memoize this with useMemo - it's recalculating on every render
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

  // Count tasks per date for calendar dots
  const dueCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    // Count regular tasks
    for (const task of tasks) {
      map.set(task.dueDate, (map.get(task.dueDate) || 0) + 1);
    }
    // Count routine-generated tasks for each date in the calendar
    if (routines.length > 0) {
      for (const cell of calendarCells) {
        const dateStr = toDateInputValue(cell);
        const routineTasks = generateRoutineTasksForDate(dateStr, routines);
        if (routineTasks.length > 0) {
          map.set(dateStr, (map.get(dateStr) || 0) + routineTasks.length);
        }
      }
    }
    return map;
  }, [tasks, routines, calendarCells]);

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
  const filteredTasks = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const now = Date.now();
    const baseTasks = tasks.filter((task) => {
      if (task.routineId) {
        return false;
      }

      const taskDate = new Date(`${task.dueDate}T00:00:00`);
      const taskDay = taskDate.getDay();
      const looksLikeRoutineClone = routines.some(
        (routine) =>
          routine.isActive &&
          (routine.dayOfWeek === 7 || routine.dayOfWeek === taskDay) &&
          routine.title === task.title &&
          routine.time === task.dueTime &&
          routine.priority === task.priority,
      );

      return !looksLikeRoutineClone;
    });

    return baseTasks.filter((task) => {
      const taskTimestamp = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
      const isOverdue = !task.completed && !Number.isNaN(taskTimestamp) && taskTimestamp < now;
      const isUpcoming = !task.completed && !Number.isNaN(taskTimestamp) && taskTimestamp >= now;

      const matchesFilter =
        filter === "all" ||
        (filter === "today" && task.dueDate === today) ||
        (filter === "upcoming" && isUpcoming) ||
        (filter === "completed" && task.completed) ||
        (filter === "overdue" && isOverdue);
      const matchesDate = !allTasksDateFilter || task.dueDate === allTasksDateFilter;

      const matchesSearch = !searchTerm || task.title.toLowerCase().includes(searchTerm);
      const matchesDescription = !searchTerm || (task.description || "").toLowerCase().includes(searchTerm);

      return matchesFilter && matchesDate && (matchesSearch || matchesDescription);
    });
  }, [tasks, filter, search, today, allTasksDateFilter]);

  const sortedTasks = useMemo(
    () =>
      filteredTasks
        .slice()
        .sort((a, b) => (a.dueDate === b.dueDate ? a.dueTime.localeCompare(b.dueTime) : a.dueDate.localeCompare(b.dueDate))),
    [filteredTasks],
  );

  const analytics = useMemo(() => {
    const now = Date.now();
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task) => task.completed).length;
    const activeTasks = totalTasks - completedTasks;

    const overdueTasks = tasks.filter((task) => {
      if (task.completed) {
        return false;
      }

      const taskTimestamp = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
      return !Number.isNaN(taskTimestamp) && taskTimestamp < now;
    }).length;

    const upcomingTasks = tasks.filter((task) => {
      if (task.completed) {
        return false;
      }

      const taskTimestamp = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
      return !Number.isNaN(taskTimestamp) && taskTimestamp >= now;
    }).length;

    const highPriorityTasks = tasks.filter((task) => task.priority === "HIGH").length;
    const completedHighPriorityTasks = tasks.filter((task) => task.priority === "HIGH" && task.completed).length;

    const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const onTrackRate = activeTasks ? Math.round(((activeTasks - overdueTasks) / activeTasks) * 100) : 100;
    const highPriorityCompletionRate = highPriorityTasks
      ? Math.round((completedHighPriorityTasks / highPriorityTasks) * 100)
      : 100;

    const productivityScore = Math.max(
      0,
      Math.min(100, Math.round(completionRate * 0.5 + onTrackRate * 0.3 + highPriorityCompletionRate * 0.2)),
    );

    const last7Date = new Date();
    last7Date.setDate(last7Date.getDate() - 6);
    const last7Start = toDateInputValue(last7Date);

    const last7DueTasks = tasks.filter((task) => task.dueDate >= last7Start && task.dueDate <= today);
    const completedLast7DueTasks = last7DueTasks.filter((task) => task.completed).length;
    const last7CompletionRate = last7DueTasks.length
      ? Math.round((completedLast7DueTasks / last7DueTasks.length) * 100)
      : 0;

    return {
      totalTasks,
      completedTasks,
      productivityScore,
      completionRate,
      last7CompletionRate,
      overdueTasks,
      upcomingTasks,
      highPriorityOpen: highPriorityTasks - completedHighPriorityTasks,
    };
  }, [tasks, today]);

  const todayTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.dueDate === today)
        .slice()
        .sort((a, b) => a.dueTime.localeCompare(b.dueTime)),
    [tasks, today],
  );

  const monthlyAnalytics = useMemo(() => {
    const monthStart = new Date(today);
    monthStart.setDate(1);
    const monthStartIso = toDateInputValue(monthStart);

    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const monthEndIso = toDateInputValue(monthEnd);

    const monthTasks = tasks.filter((task) => task.dueDate >= monthStartIso && task.dueDate <= monthEndIso);
    const monthCompleted = monthTasks.filter((task) => task.completed).length;
    const monthRate = monthTasks.length ? Math.round((monthCompleted / monthTasks.length) * 100) : 0;

    return {
      total: monthTasks.length,
      completed: monthCompleted,
      completionRate: monthRate,
      open: monthTasks.length - monthCompleted,
    };
  }, [tasks, today]);

  const routineAnalytics = useMemo(() => {
    const activeRoutines = routines.filter((routine) => routine.isActive);

    const countExpectedOccurrences = (startIso: string, endIso: string) => {
      let expected = 0;
      const cursor = new Date(`${startIso}T00:00:00`);
      const end = new Date(`${endIso}T00:00:00`);

      while (cursor <= end) {
        const weekday = cursor.getDay();
        for (const routine of activeRoutines) {
          if (routine.dayOfWeek === 7 || routine.dayOfWeek === weekday) {
            expected += 1;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      return expected;
    };

    const countCompletedOccurrences = (startIso: string, endIso: string) =>
      completedRoutineKeys.filter((key) => {
        const parts = key.split(":");
        if (parts.length !== 2) {
          return false;
        }

        const datePart = parts[1];
        return datePart >= startIso && datePart <= endIso;
      }).length;

    const last7Date = new Date(today);
    last7Date.setDate(last7Date.getDate() - 6);
    const weeklyStart = toDateInputValue(last7Date);
    const weeklyEnd = today;

    const monthStartDate = new Date(today);
    monthStartDate.setDate(1);
    const monthlyStart = toDateInputValue(monthStartDate);
    const monthlyEnd = toDateInputValue(new Date(monthStartDate.getFullYear(), monthStartDate.getMonth() + 1, 0));

    const weeklyExpected = countExpectedOccurrences(weeklyStart, weeklyEnd);
    const weeklyCompleted = countCompletedOccurrences(weeklyStart, weeklyEnd);
    const monthlyExpected = countExpectedOccurrences(monthlyStart, monthlyEnd);
    const monthlyCompleted = countCompletedOccurrences(monthlyStart, monthlyEnd);

    return {
      weeklyExpected,
      weeklyCompleted,
      weeklyRate: weeklyExpected ? Math.round((weeklyCompleted / weeklyExpected) * 100) : 0,
      monthlyExpected,
      monthlyCompleted,
      monthlyRate: monthlyExpected ? Math.round((monthlyCompleted / monthlyExpected) * 100) : 0,
    };
  }, [routines, today, completedRoutineKeys]);

  const weeklyTrend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - index));
      const key = toDateInputValue(date);
      const dayTasks = tasks.filter((task) => task.dueDate === key);
      const completed = dayTasks.filter((task) => task.completed).length;
      const total = dayTasks.length;

      return {
        key,
        label: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
        total,
        completed,
        rate: total ? Math.round((completed / total) * 100) : 0,
      };
    });

    const maxTotal = Math.max(1, ...days.map((day) => day.total));

    return {
      days,
      maxTotal,
    };
  }, [tasks, today]);

  // Pie chart data - using conic-gradient because it's simpler than SVG
  const chartDistribution = useMemo(() => {
    const baseTotal = analytics.completedTasks + analytics.upcomingTasks + analytics.overdueTasks;
    const total = Math.max(baseTotal, 1); // avoid divide by zero
    const circumference = 2 * Math.PI * 42;

    const completedLength = (analytics.completedTasks / total) * circumference;
    const upcomingLength = (analytics.upcomingTasks / total) * circumference;
    const overdueLength = (analytics.overdueTasks / total) * circumference;

    return {
      total: baseTotal,
      completedPct: Math.round((analytics.completedTasks / total) * 100),
      upcomingPct: Math.round((analytics.upcomingTasks / total) * 100),
      overduePct: Math.round((analytics.overdueTasks / total) * 100),
      completedLength,
      upcomingLength,
      overdueLength,
      upcomingOffset: -completedLength,
      overdueOffset: -(completedLength + upcomingLength),
      circumference,
    };
  }, [analytics.completedTasks, analytics.overdueTasks, analytics.upcomingTasks]);

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

  // Routine management functions
  const fetchRoutines = async () => {
    setLoadingRoutines(true);
    try {
      if (workspaceMode === "guest") {
        const guestRoutines = readGuestRoutines();
        setRoutines(guestRoutines);
      } else if (status === "authenticated" || offlineAccountMode) {
        // In account mode: check offline first  
        if (isOffline) {
          // Load from cache when offline
          const cachedRoutines = readAccountCachedRoutines();
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
            const cachedRoutines = readAccountCachedRoutines();
            setRoutines(cachedRoutines);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch routines:", error);
      // Load from cache on error
      if (workspaceMode === "account") {
        const cachedRoutines = readAccountCachedRoutines();
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
    } else if (status === "authenticated") {
      // Account mode: use API
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
  };

  const deleteRoutine = async (id: number) => {
    const shouldDelete = window.confirm("Delete this routine? This action cannot be undone.");
    if (!shouldDelete) {
      return;
    }

    if (workspaceMode === "guest") {
      // Guest mode: delete from localStorage
      const updated = routines.filter((r) => r.id !== id);
      setRoutines(updated);
      writeGuestRoutines(updated);
    } else if (status === "authenticated") {
      // Account mode: use API
      try {
        const response = await fetch(`/api/routines/${id}`, {
          method: "DELETE",
        });

        if (response.ok) {
          setRoutines((prev) => prev.filter((r) => r.id !== id));
        }
      } catch (error) {
        console.error("Failed to delete routine:", error);
      }
    }
  };

  const toggleRoutineActive = async (id: number, currentActive: boolean) => {
    if (workspaceMode === "guest") {
      // Guest mode: update in localStorage
      const updated = routines.map((r) =>
        r.id === id ? { ...r, isActive: !currentActive } : r
      );
      setRoutines(updated);
      writeGuestRoutines(updated);
    } else if (status === "authenticated") {
      // Account mode: use API
      try {
        const response = await fetch(`/api/routines/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !currentActive }),
        });

        if (response.ok) {
          const updated = await response.json();
          setRoutines((prev) => prev.map((r) => (r.id === id ? updated : r)));
        }
      } catch (error) {
        console.error("Failed to toggle routine:", error);
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

  const showAuthPanel = workspaceMode === "account" && status !== "authenticated" && !offlineAccountMode;

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

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      setPushStatusMessage("This browser does not support notifications.");
      return;
    }

    safeStorageSetItem(NOTIFICATION_ASKED_KEY, "1");
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission().catch(() => "default" as NotificationPermission);
    setNotificationPermission(permission);

    if (permission === "denied") {
      setPushEnabled(false);
      setPushStatusMessage("Notifications are blocked in browser settings.");
      return;
    }

    await syncPushSubscription(permission);
  };

  const triggerInstallPrompt = async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setCanInstallApp(false);
      }
    } catch {
      return;
    } finally {
      setDeferredInstallPrompt(null);
    }
  };

  const saveProfile = async () => {
    setProfileMessage("");
    setProfileLoading(true);
    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileName,
          dateOfBirth: profileDateOfBirth || null,
        }),
      });

      const payload = (await response.json()) as { message?: string; name?: string; dateOfBirth?: string | null };
      if (!response.ok) {
        setProfileMessage(payload.message || "Unable to update profile.");
        return;
      }

      // Update local state
      if (typeof payload.name === "string") {
        setProfileName(payload.name);
      }
      if (typeof payload.dateOfBirth === "string") {
        setProfileDateOfBirth(payload.dateOfBirth.slice(0, 10));
      } else if (payload.dateOfBirth === null) {
        setProfileDateOfBirth("");
      }

      // Refresh session to update name in UI
      void update({
        user: {
          name: typeof payload.name === "string" ? payload.name : null,
        },
      });

      setProfileMessage("Profile updated.");
    } catch {
      setProfileMessage("Unable to update profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  // TODO: Add email verification step before actually changing email
  const changeEmail = async () => {
    setEmailMessage("");
    setEmailLoading(true);
    try {
      const response = await fetch("/api/user/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: newEmailInput, currentPassword: emailPassword }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setEmailMessage(payload.message || "Unable to update email.");
        return;
      }

      setEmailPassword("");
      setEmailMessage("Email updated. Please sign in again to refresh session data.");
    } catch {
      setEmailMessage("Unable to update email.");
    } finally {
      setEmailLoading(false);
    }
  };

  const changePassword = async () => {
    setPasswordMessage("");
    setPasswordLoading(true);
    try {
      const response = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
        }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setPasswordMessage(payload.message || "Unable to change password.");
        return;
      }

      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setPasswordMessage("Password updated.");
    } catch {
      setPasswordMessage("Unable to change password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  // Export user data as JSON - useful for GDPR compliance
  const exportAccountData = async () => {
    try {
      const response = await fetch("/api/user/export", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `taskflow-export-${today}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      return; // Silently fail - not critical
    }
  };

  const deleteAccount = async () => {
    if (!deletePasswordInput) {
      setDeleteMessage("Current password is required.");
      return;
    }

    const confirmed = window.confirm("Delete your account permanently? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setDeleteLoading(true);
    setDeleteMessage("");
    try {
      const response = await fetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: deletePasswordInput }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setDeleteMessage(payload.message || "Unable to delete account.");
        return;
      }

      setDeletePasswordInput("");
      setDeleteMessage("Account deleted.");
      await signOut({ callbackUrl: "/" });
    } catch {
      setDeleteMessage("Unable to delete account.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const setMigrationDecision = (decision: "imported" | "skipped" | "deleted") => {
    safeStorageSetItem(accountMigrationDecisionKey, decision);
    setGuestUpgradeOpen(false);
  };

  const importGuestTasksToAccount = async () => {
    if (workspaceMode !== "account" || status !== "authenticated" || isOffline) {
      setGuestUpgradeMessage("Connect to the internet to import guest tasks.");
      return;
    }

    setGuestUpgradeLoading(true);
    setGuestUpgradeMessage("");
    try {
      const guestTasks = readGuestTasks();
      if (!guestTasks.length) {
        setMigrationDecision("skipped");
        return;
      }

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
      setMigrationDecision("imported");
      setGuestUpgradeMessage(`${imported} imported, ${skipped} skipped.`);

      const refreshed = await fetch("/api/tasks", { cache: "no-store" });
      if (refreshed.ok) {
        const data = (await refreshed.json()) as Task[];
        setTasks(data);
        writeAccountCachedTasks(data);
      }
    } catch {
      setGuestUpgradeMessage("Unable to import guest tasks.");
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
                  onClick={() => signOut({ callbackUrl: "/workspace?mode=account" })}
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
                      void signOut({ callbackUrl: "/workspace?mode=account" });
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


          {/* Loading State */}
          {status === "loading" && workspaceMode === "account" ? (
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
                        const dueCount = dueCountByDate.get(dayKey) || 0;
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
                            {day.getDate()}{dueCount > 0 && <div className="text-[8px]">◆</div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Today Tasks List */}
                  <div className="min-w-0">
                    <h3 className={`text-2xl font-bold mb-4 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
                      {tasksForSelectedDay.length} task{tasksForSelectedDay.length !== 1 ? 's' : ''} for {formatDisplayDate(selectedDate)}
                    </h3>
                    <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                      {tasksForSelectedDay.length === 0 ? (
                        <li className={`rounded-lg border-2 border-dashed p-4 text-sm text-center ${
                          darkMode ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-600"
                        }`}>
                          <span className="text-2xl block mb-2">✨</span>
                          All clear! Enjoy your free time.
                        </li>
                      ) : (
                        tasksForSelectedDay.map((task) => (
                          <li
                            key={task.id}
                            className={`rounded-lg border p-3 backdrop-blur-sm transition overflow-hidden ${
                              darkMode
                                ? "bg-slate-900/40 border-slate-700 hover:bg-slate-900/60"
                                : "bg-white/50 border-slate-200/50 hover:bg-white/70"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div className="flex-1 min-w-0">
                                <button
                                  onClick={() => toggleTaskExpanded(task.id)}
                                  className={`w-full text-left font-semibold break-all ${
                                    darkMode ? "text-slate-100" : "text-slate-900"
                                  } ${task.completed ? "line-through opacity-60" : ""}`}
                                >
                                  {task.title}
                                </button>
                                <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                  {task.dueTime} • <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                    task.priority === "HIGH" ? (darkMode ? "bg-red-500/25 text-red-200" : "bg-red-100 text-red-700") :
                                    task.priority === "LOW" ? (darkMode ? "bg-emerald-500/25 text-emerald-200" : "bg-emerald-100 text-emerald-700") :
                                    darkMode ? "bg-amber-500/25 text-amber-200" : "bg-amber-100 text-amber-700"
                                  }`}>{task.priority}</span>
                                  {task.routineId && <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs font-semibold ${
                                    darkMode ? "bg-blue-500/25 text-blue-200" : "bg-blue-100 text-blue-700"
                                  }`}>🔁 Routine</span>}
                                </p>
                                {expandedTaskIds.includes(task.id) && task.description && (
                                  <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                                    darkMode
                                      ? "border-slate-700 bg-slate-900/50 text-slate-300"
                                      : "border-slate-200 bg-white/70 text-slate-700"
                                  }`}>
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
                              </div>
                            </div>
                          </li>
                        ))
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
                <div className="grid gap-3 md:grid-cols-[180px_1fr_170px_auto]">
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
                    sortedTasks.map((task) => (
                      <li
                        key={task.id}
                        className={`rounded-lg border p-3 backdrop-blur-sm transition ${
                          darkMode
                            ? "bg-slate-900/40 border-slate-700 hover:bg-slate-900/60"
                            : "bg-white/50 border-slate-200/50 hover:bg-white/70"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => toggleTaskExpanded(task.id)}
                              className={`w-full text-left font-semibold break-all ${darkMode ? "text-slate-100" : "text-slate-900"} ${task.completed ? "line-through opacity-60" : ""}`}
                            >
                              {task.title}
                            </button>
                            <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                              {formatDisplayDate(task.dueDate)} at {task.dueTime} • <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                task.priority === "HIGH" ? (darkMode ? "bg-red-500/25 text-red-200" : "bg-red-100 text-red-700") :
                                task.priority === "LOW" ? (darkMode ? "bg-emerald-500/25 text-emerald-200" : "bg-emerald-100 text-emerald-700") :
                                darkMode ? "bg-amber-500/25 text-amber-200" : "bg-amber-100 text-amber-700"
                              }`}>{task.priority}</span>
                              {task.routineId && <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs font-semibold ${
                                darkMode ? "bg-blue-500/25 text-blue-200" : "bg-blue-100 text-blue-700"
                              }`}>🔁 Routine</span>}
                            </p>
                            {expandedTaskIds.includes(task.id) && task.description && (
                              <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                                darkMode
                                  ? "border-slate-700 bg-slate-900/50 text-slate-300"
                                  : "border-slate-200 bg-white/70 text-slate-700"
                              }`}>
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
                      </li>
                    ))
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
                                  className={`rounded-lg border p-3 backdrop-blur-sm transition ${
                                    darkMode
                                      ? "bg-slate-900/40 border-slate-700"
                                      : "bg-white/50 border-slate-200/50"
                                  } ${!routine.isActive ? "opacity-50" : ""}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className={`font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
                                        {routine.title}
                                      </p>
                                      <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                        {routine.time} • <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                          routine.priority === "HIGH" ? (darkMode ? "bg-red-500/25 text-red-200" : "bg-red-100 text-red-700") :
                                          routine.priority === "LOW" ? (darkMode ? "bg-emerald-500/25 text-emerald-200" : "bg-emerald-100 text-emerald-700") :
                                          darkMode ? "bg-amber-500/25 text-amber-200" : "bg-amber-100 text-amber-700"
                                        }`}>{routine.priority}</span>
                                        {!routine.isActive && <span className="ml-2 text-xs">(Inactive)</span>}
                                      </p>
                                      {routine.description && (
                                        <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                          {routine.description}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                      <button
                                        onClick={() => toggleRoutineActive(routine.id, routine.isActive)}
                                        className={`rounded px-2 py-1 text-xs font-semibold ${
                                          routine.isActive
                                            ? "bg-emerald-100/60 text-emerald-700"
                                            : "bg-amber-100/60 text-amber-700"
                                        }`}
                                      >
                                        {routine.isActive ? "Active" : "Inactive"}
                                      </button>
                                      <button
                                        onClick={() => deleteRoutine(routine.id)}
                                        className="rounded bg-red-100/60 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
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
                                    className={`rounded-lg border p-3 backdrop-blur-sm transition ${
                                      darkMode
                                        ? "bg-slate-900/40 border-slate-700"
                                        : "bg-white/50 border-slate-200/50"
                                    } ${!routine.isActive ? "opacity-50" : ""}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <p className={`font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
                                          {routine.title}
                                        </p>
                                        <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                          {routine.time} • <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                            routine.priority === "HIGH" ? (darkMode ? "bg-red-500/25 text-red-200" : "bg-red-100 text-red-700") :
                                            routine.priority === "LOW" ? (darkMode ? "bg-emerald-500/25 text-emerald-200" : "bg-emerald-100 text-emerald-700") :
                                            darkMode ? "bg-amber-500/25 text-amber-200" : "bg-amber-100 text-amber-700"
                                          }`}>{routine.priority}</span>
                                          {!routine.isActive && <span className="ml-2 text-xs">(Inactive)</span>}
                                        </p>
                                        {routine.description && (
                                          <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                            {routine.description}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex gap-1 shrink-0">
                                        <button
                                          onClick={() => toggleRoutineActive(routine.id, routine.isActive)}
                                          className={`rounded px-2 py-1 text-xs font-semibold ${
                                            routine.isActive
                                              ? "bg-emerald-100/60 text-emerald-700"
                                              : "bg-amber-100/60 text-amber-700"
                                          }`}
                                        >
                                          {routine.isActive ? "Active" : "Inactive"}
                                        </button>
                                        <button
                                          onClick={() => deleteRoutine(routine.id)}
                                          className="rounded bg-red-100/60 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
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
                    <h3 className={`text-xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Import Guest Tasks?</h3>
                    <p className={`mt-2 text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      You have guest tasks. Would you like to import them to your account?
                    </p>
                    <div className="mt-4 space-y-2">
                      <button
                        onClick={importGuestTasksToAccount}
                        disabled={guestUpgradeLoading}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                      >
                        {guestUpgradeLoading ? "Importing..." : "Import Tasks"}
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
                  {profileMessage && <p className={`text-sm ${profileMessage.includes("updated") ? "text-emerald-600" : "text-red-600"}`}>{profileMessage}</p>}
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
                  {emailMessage && <p className={`text-sm ${emailMessage.includes("updated") ? "text-emerald-600" : "text-red-600"}`}>{emailMessage}</p>}
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
                  {passwordMessage && <p className={`text-sm ${passwordMessage.includes("updated") ? "text-emerald-600" : "text-red-600"}`}>{passwordMessage}</p>}
                </div>
              </section>

              {/* Export & Delete Section */}
              <section className={`rounded-3xl p-6 backdrop-blur-xl border shadow-xl ${
                darkMode ? "bg-white/10 border-white/20" : "bg-white/55 border-white/70"
              }`}>
                <h3 className={`text-xl font-bold mb-4 ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Data Management</h3>
                <div className="space-y-3">
                  <button
                    onClick={exportAccountData}
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
                    onClick={deleteAccount}
                    disabled={deleteLoading}
                    className="w-full bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteLoading ? "Deleting..." : "🗑️ Delete Account Permanently"}
                  </button>
                  {deleteMessage && <p className={`text-sm ${deleteMessage.includes("deleted") ? "text-emerald-600" : "text-red-600"}`}>{deleteMessage}</p>}
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
      {deleteTaskDialogOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 p-4" style={{ zIndex: 9999 }}>
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              darkMode ? "border-white/20 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900"
            }`}
            style={{ zIndex: 10000 }}
          >
            <h3 className="text-lg font-bold">Delete task?</h3>
            <p className={`mt-2 text-sm ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
              This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeDeleteTaskDialog}
                disabled={deleteTaskBusy}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  darkMode
                    ? "bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-50"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTask}
                disabled={deleteTaskBusy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleteTaskBusy ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
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
