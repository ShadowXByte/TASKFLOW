"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

type Task = {
  id: number;
  title: string;
  description: string | null;
  dueDate: string;
  dueTime: string;
  completed: boolean;
  priority: TaskPriority;
};

type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
type TaskFilter = "all" | "today" | "upcoming" | "completed" | "overdue";

type WorkspaceMode = "account" | "guest";

type AuthTab = "login" | "register";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PendingAccountOperation =
  | {
      type: "create";
      task: Task;
      tempId: number;
    }
  | {
      type: "update";
      id: number;
      changes: Partial<Pick<Task, "title" | "description" | "dueDate" | "dueTime" | "priority" | "completed">>;
    }
  | {
      type: "delete";
      id: number;
    };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GUEST_TASKS_KEY = "taskflow_guest_tasks";
const THEME_KEY = "taskflow_theme";
const NOTIFICATION_ASKED_KEY = "taskflow_notifications_asked";
const NOTIFIED_TASKS_KEY = "taskflow_notified_tasks";
const ACCOUNT_TASKS_CACHE_PREFIX = "taskflow_account_tasks";
const ACCOUNT_PENDING_OPS_PREFIX = "taskflow_account_pending_ops";
const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH"];
const SW_PATH = "/sw.js";

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (date: Date) => {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
};

const formatDisplayDate = (value: string) => {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}-${month}-${year}`;
};

const parseDisplayDate = (value: string) => {
  const match = value.trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (toDateInputValue(parsed) !== iso) {
    return null;
  }

  return iso;
};

const isValidTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

const safeStorageGetItem = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeStorageSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
};

const safeStorageRemoveItem = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
};

const readJsonFromStorage = <T,>(key: string, fallback: T): T => {
  const raw = safeStorageGetItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const readNotifiedKeys = () => {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  const raw = safeStorageGetItem(NOTIFIED_TASKS_KEY);
  if (!raw) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    const validKeys = parsed.filter((item): item is string => typeof item === "string");
    return new Set<string>(validKeys);
  } catch {
    return new Set<string>();
  }
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (item) => item.charCodeAt(0));
};

const readGuestTasks = (): Task[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = safeStorageGetItem(GUEST_TASKS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<Partial<Task>>;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((task): task is Partial<Task> & { id: number; title: string; dueDate: string; completed: boolean } => {
        return (
          typeof task.id === "number" &&
          typeof task.title === "string" &&
          typeof task.dueDate === "string" &&
          typeof task.completed === "boolean"
        );
      })
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: typeof task.description === "string" ? task.description : null,
        dueDate: task.dueDate,
        dueTime: typeof task.dueTime === "string" && isValidTime(task.dueTime) ? task.dueTime : "09:00",
        completed: task.completed,
        priority: task.priority === "LOW" || task.priority === "MEDIUM" || task.priority === "HIGH"
          ? task.priority
          : "MEDIUM",
      }));
  } catch {
    return [];
  }
};

const writeGuestTasks = (tasks: Task[]) => {
  if (typeof window === "undefined") {
    return;
  }
  safeStorageSetItem(GUEST_TASKS_KEY, JSON.stringify(tasks));
};

function WorkspaceContent() {
  const params = useSearchParams();
  const modeFromQuery = params.get("mode") === "guest" ? "guest" : "account";
  const { data: session, status } = useSession();

  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(modeFromQuery);
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDateInput, setDueDateInput] = useState(formatDisplayDate(today));
  const [dueTimeInput, setDueTimeInput] = useState("09:00");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [search, setSearch] = useState("");
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
  const [selectedDate, setSelectedDate] = useState(today);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const addDatePickerRef = useRef<HTMLInputElement | null>(null);
  const editDatePickerRef = useRef<HTMLInputElement | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const accountKey = useMemo(() => {
    const userId = session?.user?.id?.toString().trim();
    const emailValue = session?.user?.email?.toLowerCase().trim();
    return userId || emailValue || "anonymous";
  }, [session?.user?.email, session?.user?.id]);

  const accountTasksCacheKey = `${ACCOUNT_TASKS_CACHE_PREFIX}:${accountKey}`;
  const accountPendingOpsKey = `${ACCOUNT_PENDING_OPS_PREFIX}:${accountKey}`;

  useEffect(() => {
    setWorkspaceMode(modeFromQuery);
  }, [modeFromQuery]);

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

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

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

  const pushPendingAccountOp = useCallback((operation: PendingAccountOperation) => {
    const currentOps = readPendingAccountOps();
    currentOps.push(operation);
    writePendingAccountOps(currentOps);
  }, [readPendingAccountOps, writePendingAccountOps]);

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
        return;
      }

      if (status !== "authenticated") {
        setTasks([]);
        return;
      }

      if (isOffline) {
        setTasks(readAccountCachedTasks());
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
    void flushPendingAccountOps();
  }, [flushPendingAccountOps]);

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

  const dueCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      map.set(task.dueDate, (map.get(task.dueDate) || 0) + 1);
    }
    return map;
  }, [tasks]);

  const tasksForSelectedDay = useMemo(
    () => tasks.filter((task) => task.dueDate === selectedDate).slice().sort((a, b) => a.dueTime.localeCompare(b.dueTime)),
    [tasks, selectedDate],
  );

  const filteredTasks = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const now = Date.now();

    return tasks.filter((task) => {
      const taskTimestamp = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
      const isOverdue = !task.completed && !Number.isNaN(taskTimestamp) && taskTimestamp < now;
      const isUpcoming = !task.completed && !Number.isNaN(taskTimestamp) && taskTimestamp >= now;

      const matchesFilter =
        filter === "all" ||
        (filter === "today" && task.dueDate === today) ||
        (filter === "upcoming" && isUpcoming) ||
        (filter === "completed" && task.completed) ||
        (filter === "overdue" && isOverdue);

      const matchesSearch = !searchTerm || task.title.toLowerCase().includes(searchTerm);
      const matchesDescription = !searchTerm || (task.description || "").toLowerCase().includes(searchTerm);

      return matchesFilter && (matchesSearch || matchesDescription);
    });
  }, [tasks, filter, search, today]);

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

  const chartDistribution = useMemo(() => {
    const baseTotal = analytics.completedTasks + analytics.upcomingTasks + analytics.overdueTasks;
    const total = Math.max(baseTotal, 1);
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
        id: Date.now(),
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

  const toggleTask = async (id: number, completed: boolean) => {
    if (workspaceMode === "guest") {
      const nextTasks = tasks.map((task) =>
        task.id === id ? { ...task, completed: !completed } : task,
      );
      setTasks(nextTasks);
      writeGuestTasks(nextTasks);
      return;
    }

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

  const removeTask = async (id: number) => {
    if (workspaceMode === "guest") {
      const nextTasks = tasks.filter((task) => task.id !== id);
      setTasks(nextTasks);
      writeGuestTasks(nextTasks);
      return;
    }

    if (isOffline) {
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

  const toggleTaskExpanded = (taskId: number) => {
    setExpandedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
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

  const showAuthPanel = workspaceMode === "account" && status !== "authenticated";

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

  return (
    <main
      className={`min-h-screen overflow-x-hidden px-4 py-6 md:px-10 md:py-10 ${
        darkMode
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100"
          : "bg-gradient-to-br from-slate-50 via-white to-blue-50"
      }`}
    >
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header
          className={`rounded-3xl p-4 shadow-lg backdrop-blur-md border md:p-8 ${
            darkMode ? "bg-white/10 border-white/15" : "bg-white/40 border-white/50"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
                <Image src="/unnamed.jpg" alt="Taskflow logo" width={16} height={16} className="rounded-full" />
                Taskflow
              </p>
              <h1 className={`text-3xl font-bold md:text-4xl ${darkMode ? "text-slate-100" : "text-slate-900"}`}>
                Your Workspace
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/workspace?mode=account"
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  workspaceMode === "account"
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md"
                    : "bg-white/50 text-slate-900 border border-white/50 hover:bg-white/70"
                }`}
              >
                Account
              </Link>
              <Link
                href="/workspace?mode=guest"
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  workspaceMode === "guest"
                    ? "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-md"
                    : "bg-white/50 text-slate-900 border border-white/50 hover:bg-white/70"
                }`}
              >
                Guest
              </Link>
              <Link
                href="/"
                className={`rounded-lg px-4 py-2 text-sm font-semibold border transition ${
                  darkMode
                    ? "bg-white/10 text-slate-100 border-white/20 hover:bg-white/20"
                    : "bg-white/50 text-slate-900 border-white/50 hover:bg-white/70"
                }`}
              >
                Home
              </Link>
              <button
                onClick={() => setDarkMode((current) => !current)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold border transition ${
                  darkMode
                    ? "bg-white/10 text-slate-100 border-white/20 hover:bg-white/20"
                    : "bg-white/50 text-slate-900 border-white/50 hover:bg-white/70"
                }`}
              >
                {darkMode ? "☀️ Light" : "🌙 Dark"}
              </button>
              {canInstallApp && !isInstalledApp && (
                <button
                  onClick={() => void triggerInstallPrompt()}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold border transition ${
                    darkMode
                      ? "bg-white/10 text-slate-100 border-white/20 hover:bg-white/20"
                      : "bg-white/50 text-slate-900 border-white/50 hover:bg-white/70"
                  }`}
                >
                  ⬇️ Install App
                </button>
              )}
              <button
                onClick={() => void requestNotificationPermission()}
                className={`rounded-lg px-4 py-2 text-sm font-semibold border transition ${
                  darkMode
                    ? "bg-white/10 text-slate-100 border-white/20 hover:bg-white/20"
                    : "bg-white/50 text-slate-900 border-white/50 hover:bg-white/70"
                }`}
              >
                {workspaceMode === "guest"
                  ? notificationPermission === "granted"
                    ? "🔔 Local Notifications On"
                    : notificationPermission === "denied"
                      ? "🔕 Notifications Blocked"
                      : notificationPermission === "unsupported"
                        ? "🔕 Notifications N/A"
                        : "🔔 Enable Notifications"
                  : notificationPermission !== "granted"
                    ? "🔔 Enable Push"
                    : !pushConfigured
                      ? "🔕 Push Not Configured"
                      : pushEnabled
                        ? "🔔 Push Active"
                        : "🔔 Activate Push"}
              </button>
              {workspaceMode === "account" && status === "authenticated" && (
                <button
                  onClick={() => signOut({ callbackUrl: "/workspace?mode=account" })}
                  className="rounded-lg bg-red-100/50 px-4 py-2 text-sm font-semibold text-red-700 border border-red-200/50 transition hover:bg-red-100"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
          <p className={`mt-4 text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
            {workspaceMode === "guest"
              ? "✨ Guest mode stores tasks in your browser only. No account needed."
              : status === "authenticated"
                ? `🔐 Synced account: ${session?.user?.email}`
                : "Sign in to sync your tasks across devices."}
          </p>
          <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
            Tasks are ordered by date and time. Notifications include the task name when due.
          </p>
          {isOffline && (
            <p className={`mt-1 text-xs font-medium ${darkMode ? "text-amber-300" : "text-amber-700"}`}>
              Offline mode active. You can keep using tasks, and changes will sync when internet returns.
            </p>
          )}
          {workspaceMode === "account" && (
            <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
              {pushStatusMessage || (pushEnabled ? "Push status: active" : "Push status: not active")}
            </p>
          )}
        </header>

        {status === "loading" && workspaceMode === "account" ? (
          <div className="rounded-2xl bg-white/40 p-6 text-slate-700 backdrop-blur-md border border-white/50 shadow-lg">
            Loading account session...
          </div>
        ) : showAuthPanel ? (
          <section className="mx-auto w-full max-w-lg rounded-3xl bg-white/50 p-8 backdrop-blur-lg border border-white/50 shadow-xl">
            <h2 className="text-3xl font-bold text-slate-900">Account Access</h2>
            <p className="mt-2 text-slate-700">Login or register to sync your tasks securely across devices.</p>

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100/50 p-1.5">
              <button
                onClick={() => setAuthTab("login")}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  authTab === "login"
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md"
                    : "text-slate-700 hover:bg-white/50"
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setAuthTab("register")}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                  authTab === "register"
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md"
                    : "text-slate-700 hover:bg-white/50"
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
                  className="w-full rounded-xl border-2 border-slate-200 bg-white/70 px-4 py-3 text-slate-900 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                />
              )}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email address"
                className="w-full rounded-xl border-2 border-slate-200 bg-white/70 px-4 py-3 text-slate-900 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                className="w-full rounded-xl border-2 border-slate-200 bg-white/70 px-4 py-3 text-slate-900 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <button
                onClick={submitAuth}
                disabled={authLoading}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
              >
                {authLoading ? "Please wait..." : authTab === "register" ? "Create Account" : "Sign In"}
              </button>
              {authMessage && <p className="text-sm font-medium text-red-600 bg-red-50/50 rounded-lg p-3">{authMessage}</p>}
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            <section
              className={`rounded-3xl p-4 backdrop-blur-md border shadow-lg md:p-6 ${
                darkMode ? "bg-white/10 border-white/15" : "bg-white/40 border-white/50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={`text-xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Analytics Dashboard</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    analytics.productivityScore >= 75
                      ? "bg-emerald-500/20 text-emerald-700"
                      : analytics.productivityScore >= 45
                        ? "bg-amber-500/20 text-amber-700"
                        : "bg-red-500/20 text-red-700"
                  }`}
                >
                  Productivity Score: {analytics.productivityScore}/100
                </span>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
                <div className={`rounded-2xl border px-3 py-3 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                  <div className="mx-auto w-fit">
                    <svg viewBox="0 0 100 100" className="h-32 w-32">
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        className={darkMode ? "stroke-slate-700" : "stroke-slate-200"}
                        strokeWidth="12"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        className="stroke-emerald-500"
                        strokeWidth="12"
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                        strokeDasharray={`${chartAnimated ? chartDistribution.completedLength : 0} ${chartDistribution.circumference}`}
                        strokeDashoffset="0"
                        style={{ transition: "stroke-dasharray 700ms ease" }}
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        className="stroke-amber-500"
                        strokeWidth="12"
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                        strokeDasharray={`${chartAnimated ? chartDistribution.upcomingLength : 0} ${chartDistribution.circumference}`}
                        strokeDashoffset={chartAnimated ? chartDistribution.upcomingOffset : 0}
                        style={{ transition: "stroke-dasharray 760ms ease, stroke-dashoffset 760ms ease" }}
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        className="stroke-red-500"
                        strokeWidth="12"
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                        strokeDasharray={`${chartAnimated ? chartDistribution.overdueLength : 0} ${chartDistribution.circumference}`}
                        strokeDashoffset={chartAnimated ? chartDistribution.overdueOffset : 0}
                        style={{ transition: "stroke-dasharray 820ms ease, stroke-dashoffset 820ms ease" }}
                      />
                    </svg>
                  </div>
                  <p className={`mt-2 text-center text-xs ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                    Task Distribution ({chartDistribution.total})
                  </p>
                  <div className="mt-2 space-y-1 text-xs">
                    <p className={`flex items-center justify-between ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Completed</span>
                      <span>{chartDistribution.completedPct}%</span>
                    </p>
                    <p className={`flex items-center justify-between ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Upcoming</span>
                      <span>{chartDistribution.upcomingPct}%</span>
                    </p>
                    <p className={`flex items-center justify-between ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Overdue</span>
                      <span>{chartDistribution.overduePct}%</span>
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div className={`rounded-xl border px-3 py-3 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Completion Rate</p>
                    <p className={`mt-1 text-lg font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{analytics.completionRate}%</p>
                  </div>
                  <div className={`rounded-xl border px-3 py-3 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Last 7 Days (Due) </p>
                    <p className={`mt-1 text-lg font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{analytics.last7CompletionRate}%</p>
                  </div>
                  <div className={`rounded-xl border px-3 py-3 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Upcoming Tasks</p>
                    <p className={`mt-1 text-lg font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{analytics.upcomingTasks}</p>
                  </div>
                  <div className={`rounded-xl border px-3 py-3 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Overdue Tasks</p>
                    <p className={`mt-1 text-lg font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{analytics.overdueTasks}</p>
                  </div>
                  <div className={`rounded-xl border px-3 py-3 ${darkMode ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-white/60"}`}>
                    <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>High Priority Open</p>
                    <p className={`mt-1 text-lg font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{analytics.highPriorityOpen}</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <section
              className={`rounded-3xl p-4 backdrop-blur-md border shadow-lg md:p-8 ${
                darkMode ? "bg-white/10 border-white/15" : "bg-white/40 border-white/50"
              }`}
            >
              <h2 className={`text-2xl font-bold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Tasks</h2>
              <p className={`mt-2 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                Create and track your work with due dates.
              </p>

              <div className="mt-6 space-y-3">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What needs to be done?"
                  className={`w-full rounded-xl border-2 px-4 py-3 placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                    darkMode
                      ? "border-slate-700 bg-slate-900/70 text-slate-100"
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
                        ? "border-slate-700 bg-slate-900/70 text-slate-100"
                        : "border-slate-200 bg-white/70 text-slate-900"
                    }`}
                  />
                <div className="grid gap-2 md:grid-cols-[1fr_130px_130px_auto]">
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="DD-MM-YYYY"
                      value={dueDateInput}
                      onChange={(event) => setDueDateInput(event.target.value)}
                      className={`w-full rounded-xl border-2 px-4 py-3 pr-12 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                        darkMode
                          ? "border-slate-700 bg-slate-900/70 text-slate-100"
                          : "border-slate-200 bg-white/70 text-slate-900"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={openAddDatePicker}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm ${
                        darkMode ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"
                      }`}
                      aria-label="Open date picker"
                    >
                      📅
                    </button>
                    <input
                      ref={addDatePickerRef}
                      type="date"
                      defaultValue={today}
                      onChange={(event) => setDueDateInput(formatDisplayDate(event.target.value))}
                      className="absolute h-0 w-0 opacity-0 pointer-events-none"
                      tabIndex={-1}
                      aria-hidden
                    />
                  </div>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as TaskPriority)}
                    className={`rounded-xl border-2 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/70 text-slate-100"
                        : "border-slate-200 bg-white/70 text-slate-900"
                    }`}
                  >
                    {PRIORITIES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={dueTimeInput}
                    onChange={(event) => setDueTimeInput(event.target.value)}
                    className={`rounded-xl border-2 px-3 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 ${
                      darkMode
                        ? "border-slate-700 bg-slate-900/70 text-slate-100"
                        : "border-slate-200 bg-white/70 text-slate-900"
                    }`}
                  />
                  <button
                    onClick={addTask}
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:shadow-xl"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-[200px_1fr]">
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as TaskFilter)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium outline-none ${
                    darkMode
                      ? "border-slate-700 bg-slate-900/70 text-slate-100"
                      : "border-slate-200 bg-white/70 text-slate-800"
                  }`}
                >
                  <option value="all">All</option>
                  <option value="today">Today</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="overdue">Overdue</option>
                  <option value="completed">Completed</option>
                </select>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search tasks"
                  className={`rounded-xl border px-3 py-2 text-sm outline-none ${
                    darkMode
                      ? "border-slate-700 bg-slate-900/70 text-slate-100 placeholder-slate-400"
                      : "border-slate-200 bg-white/70 text-slate-900 placeholder-slate-500"
                  }`}
                />
              </div>

              <ul className="mt-6 space-y-2.5">
                {loadingTasks ? (
                  <li
                    className={`rounded-xl border-2 border-dashed p-4 text-sm ${
                      darkMode ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"
                    }`}
                  >
                    Loading tasks...
                  </li>
                ) : sortedTasks.length === 0 ? (
                  <li
                    className={`rounded-xl border-2 border-dashed p-4 text-sm ${
                      darkMode ? "border-slate-700 text-slate-300" : "border-slate-300 text-slate-600"
                    }`}
                  >
                    No tasks match this filter.
                  </li>
                ) : (
                  sortedTasks.map((task) => {
                    const isEditing = editingTaskId === task.id;
                    const taskTimestamp = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
                    const isOverdue = !task.completed && !Number.isNaN(taskTimestamp) && taskTimestamp < Date.now();

                    return (
                      <li
                        key={task.id}
                        className={`rounded-xl border p-4 backdrop-blur-sm transition ${
                          darkMode
                            ? "bg-slate-900/40 border-slate-700 hover:bg-slate-900/60"
                            : "bg-white/50 border-slate-200/50 hover:bg-white/70"
                        } ${isOverdue ? "ring-1 ring-red-400/60" : ""}`}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="grid gap-2 md:grid-cols-[1fr_160px_110px_130px_auto_auto]">
                              <input
                                value={editTitle}
                                onChange={(event) => setEditTitle(event.target.value)}
                                className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                  darkMode
                                    ? "border-slate-700 bg-slate-900/70 text-slate-100"
                                    : "border-slate-200 bg-white text-slate-900"
                                }`}
                              />
                              <div className="relative">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="DD-MM-YYYY"
                                  value={editDueDateInput}
                                  onChange={(event) => setEditDueDateInput(event.target.value)}
                                  className={`w-full rounded-lg border px-3 py-2 pr-11 text-sm outline-none ${
                                    darkMode
                                      ? "border-slate-700 bg-slate-900/70 text-slate-100"
                                      : "border-slate-200 bg-white text-slate-900"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={openEditDatePicker}
                                  className={`absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs ${
                                    darkMode ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"
                                  }`}
                                  aria-label="Open edit date picker"
                                >
                                  📅
                                </button>
                                <input
                                  ref={editDatePickerRef}
                                  type="date"
                                  defaultValue={today}
                                  onChange={(event) => setEditDueDateInput(formatDisplayDate(event.target.value))}
                                  className="absolute h-0 w-0 opacity-0 pointer-events-none"
                                  tabIndex={-1}
                                  aria-hidden
                                />
                              </div>
                              <select
                                value={editPriority}
                                onChange={(event) => setEditPriority(event.target.value as TaskPriority)}
                                className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                  darkMode
                                    ? "border-slate-700 bg-slate-900/70 text-slate-100"
                                    : "border-slate-200 bg-white text-slate-900"
                                }`}
                              >
                                {PRIORITIES.map((item) => (
                                  <option key={item} value={item}>
                                    {item}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="time"
                                value={editDueTimeInput}
                                onChange={(event) => setEditDueTimeInput(event.target.value)}
                                className={`rounded-lg border px-3 py-2 text-sm outline-none ${
                                  darkMode
                                    ? "border-slate-700 bg-slate-900/70 text-slate-100"
                                    : "border-slate-200 bg-white text-slate-900"
                                }`}
                              />
                              <button
                                onClick={() => saveTaskEdit(task.id)}
                                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEditTask}
                                className="rounded-lg bg-slate-400 px-3 py-2 text-xs font-semibold text-white"
                              >
                                Cancel
                              </button>
                            </div>
                            <textarea
                              value={editDescription}
                              onChange={(event) => setEditDescription(event.target.value)}
                              rows={2}
                              placeholder="Task note (optional)"
                              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none ${
                                darkMode
                                  ? "border-slate-700 bg-slate-900/70 text-slate-100"
                                  : "border-slate-200 bg-white text-slate-900"
                              }`}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleTaskExpanded(task.id)}
                                  className={`font-semibold ${
                                    darkMode ? "text-slate-100" : "text-slate-900"
                                  } ${task.completed ? "line-through opacity-70" : ""} text-left hover:opacity-90`}
                                >
                                  {task.title}
                                </button>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getPriorityBadgeClass(task.priority)}`}>
                                  {task.priority}
                                </span>
                              </div>
                              <p className={`mt-1 text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                                📅 {formatDisplayDate(task.dueDate)} at {task.dueTime} {isOverdue ? "• OVERDUE" : ""}
                              </p>
                              {expandedTaskIds.includes(task.id) && (
                                <div
                                  className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                                    darkMode
                                      ? "border-slate-700 bg-slate-900/50 text-slate-300"
                                      : "border-slate-200 bg-white/70 text-slate-700"
                                  }`}
                                >
                                  {task.description?.trim() ? task.description : "No description added."}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                onClick={() => toggleTask(task.id, task.completed)}
                                className="rounded-lg bg-emerald-100/60 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                              >
                                {task.completed ? "Undo" : "Done"}
                              </button>
                              <button
                                onClick={() => startEditTask(task)}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                                  darkMode ? "bg-slate-700 text-slate-100" : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => removeTask(task.id)}
                                className="rounded-lg bg-red-100/60 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </section>

            <section className="rounded-3xl bg-white/40 p-4 backdrop-blur-md border border-white/50 shadow-lg md:p-8">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-slate-900">Calendar</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPreviousMonth}
                    className="rounded-lg bg-white/50 border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white/70"
                  >
                    ← Prev
                  </button>
                  <p className="min-w-28 text-center text-sm font-bold text-slate-900 sm:min-w-40">{monthTitle}</p>
                  <button
                    onClick={goToNextMonth}
                    className="rounded-lg bg-white/50 border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white/70"
                  >
                    Next →
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-2 sm:mb-3 sm:gap-2 sm:text-xs">
                {WEEKDAYS.map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 mb-6 sm:gap-2">
                {calendarCells.map((day) => {
                  const dayKey = toDateInputValue(day);
                  const isCurrentMonth = day.getMonth() === monthCursor.getMonth();
                  const isSelected = selectedDate === dayKey;
                  const dueCount = dueCountByDate.get(dayKey) || 0;

                  return (
                    <button
                      key={dayKey}
                      onClick={() => setSelectedDate(dayKey)}
                      className={`rounded-lg p-1.5 text-left text-xs font-semibold transition sm:p-2.5 sm:text-sm ${
                        isSelected
                          ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg"
                          : "bg-white/50 text-slate-900 border border-slate-200/50 hover:bg-white/80"
                      } ${!isCurrentMonth ? "opacity-30" : ""}`}
                    >
                      <div>{day.getDate()}</div>
                      {dueCount > 0 && (
                        <div className="mt-1 text-[9px] font-bold opacity-80 sm:text-[10px]">
                          {dueCount}·
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl bg-white/60 backdrop-blur-sm border border-slate-200 p-4">
                <p className="text-sm font-bold text-slate-900">📅 Tasks on {formatDisplayDate(selectedDate)}</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {tasksForSelectedDay.length === 0 ? (
                    <li className="text-slate-600 italic">No tasks scheduled for this date.</li>
                  ) : (
                    tasksForSelectedDay.map((task) => (
                      <li key={`selected-${task.id}`} className="text-slate-800">
                        <span className="mr-2">{task.completed ? "✅" : "○"}</span>
                        <span className={task.completed ? "line-through text-slate-500" : "font-medium"}>{task.title}</span>
                        <span className="ml-2 text-xs text-slate-500">({task.dueTime})</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </section>
            </div>
          </div>
        )}
      </div>

      <footer className={`mt-12 border-t pt-6 pb-4 text-center ${darkMode ? "border-white/15" : "border-slate-200/60"}`}>
        <p className={`text-sm font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Taskflow</p>
        <p className={`mt-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Plan better. Finish on time.</p>
        <p className={`mt-2 text-[11px] ${darkMode ? "text-slate-500" : "text-slate-500"}`}>
          Privacy · Terms · Contact
        </p>
        <p className={`mt-2 text-xs ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
          GitHub ·{" "}
          <a
            href="https://github.com/ShadowXByte"
            target="_blank"
            rel="noreferrer"
            className={`rounded-full border px-2.5 py-1 font-semibold transition ${
              darkMode
                ? "border-white/20 bg-white/10 text-slate-100 hover:bg-white/20"
                : "border-slate-300/80 bg-white/80 text-slate-700 hover:bg-slate-100"
            }`}
          >
            @ShadowXByte
          </a>
        </p>
        <p className={`mt-1 text-[11px] ${darkMode ? "text-slate-500" : "text-slate-500"}`}>
          © 2026 ShadowXByte
        </p>
      </footer>
    </main>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
          <p className="text-slate-700 font-semibold">Loading workspace...</p>
        </main>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
