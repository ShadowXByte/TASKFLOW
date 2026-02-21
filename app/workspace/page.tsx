"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

type Task = {
  id: number;
  title: string;
  dueDate: string;
  completed: boolean;
  priority: TaskPriority;
};

type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
type TaskFilter = "all" | "today" | "upcoming" | "completed" | "overdue";

type WorkspaceMode = "account" | "guest";

type AuthTab = "login" | "register";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GUEST_TASKS_KEY = "taskflow_guest_tasks";
const THEME_KEY = "taskflow_theme";
const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH"];

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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

const readGuestTasks = (): Task[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(GUEST_TASKS_KEY);
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
        dueDate: task.dueDate,
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
  localStorage.setItem(GUEST_TASKS_KEY, JSON.stringify(tasks));
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
  const [dueDateInput, setDueDateInput] = useState(formatDisplayDate(today));
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [search, setSearch] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDateInput, setEditDueDateInput] = useState(formatDisplayDate(today));
  const [editPriority, setEditPriority] = useState<TaskPriority>("MEDIUM");
  const [darkMode, setDarkMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const addDatePickerRef = useRef<HTMLInputElement | null>(null);
  const editDatePickerRef = useRef<HTMLInputElement | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    setWorkspaceMode(modeFromQuery);
  }, [modeFromQuery]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark") {
      setDarkMode(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

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

      setLoadingTasks(true);
      try {
        const response = await fetch("/api/tasks", { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as Task[];
          setTasks(data);
        }
      } finally {
        setLoadingTasks(false);
      }
    };

    void loadTasks();
  }, [workspaceMode, status]);

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
    () => tasks.filter((task) => task.dueDate === selectedDate),
    [tasks, selectedDate],
  );

  const filteredTasks = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const isOverdue = !task.completed && task.dueDate < today;

      const matchesFilter =
        filter === "all" ||
        (filter === "today" && task.dueDate === today) ||
        (filter === "upcoming" && task.dueDate > today && !task.completed) ||
        (filter === "completed" && task.completed) ||
        (filter === "overdue" && isOverdue);

      const matchesSearch = !searchTerm || task.title.toLowerCase().includes(searchTerm);

      return matchesFilter && matchesSearch;
    });
  }, [tasks, filter, search, today]);

  const sortedTasks = useMemo(
    () => filteredTasks.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [filteredTasks],
  );

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
    if (!parsedDueDate) {
      return;
    }

    if (workspaceMode === "guest") {
      const created: Task = {
        id: Date.now(),
        title: cleanTitle,
        dueDate: parsedDueDate,
        completed: false,
        priority,
      };
      const nextTasks = [...tasks, created];
      setTasks(nextTasks);
      writeGuestTasks(nextTasks);
      setTitle("");
      setPriority("MEDIUM");
      return;
    }

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: cleanTitle, dueDate: parsedDueDate, priority }),
    });

    if (!response.ok) {
      return;
    }

    const created = (await response.json()) as Task;
    setTasks((current) => [...current, created]);
    setTitle("");
    setPriority("MEDIUM");
  };

  const startEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDueDateInput(formatDisplayDate(task.dueDate));
    setEditPriority(task.priority);
  };

  const cancelEditTask = () => {
    setEditingTaskId(null);
    setEditTitle("");
    setEditDueDateInput(formatDisplayDate(today));
    setEditPriority("MEDIUM");
  };

  const saveTaskEdit = async (taskId: number) => {
    const cleanTitle = editTitle.trim();
    const parsedEditDueDate = parseDisplayDate(editDueDateInput);
    if (!cleanTitle || !parsedEditDueDate) {
      return;
    }

    if (workspaceMode === "guest") {
      const nextTasks = tasks.map((task) =>
        task.id === taskId
          ? { ...task, title: cleanTitle, dueDate: parsedEditDueDate, priority: editPriority }
          : task,
      );
      setTasks(nextTasks);
      writeGuestTasks(nextTasks);
      cancelEditTask();
      return;
    }

    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: cleanTitle, dueDate: parsedEditDueDate, priority: editPriority }),
    });

    if (!response.ok) {
      return;
    }

    const updated = (await response.json()) as Task;
    setTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
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

    const response = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !completed }),
    });

    if (!response.ok) {
      return;
    }

    const updated = (await response.json()) as Task;
    setTasks((current) => current.map((task) => (task.id === id ? updated : task)));
  };

  const removeTask = async (id: number) => {
    if (workspaceMode === "guest") {
      const nextTasks = tasks.filter((task) => task.id !== id);
      setTasks(nextTasks);
      writeGuestTasks(nextTasks);
      return;
    }

    const response = await fetch(`/api/tasks/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== id));
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

  return (
    <main
      className={`min-h-screen px-6 py-8 md:px-10 md:py-10 ${
        darkMode
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100"
          : "bg-gradient-to-br from-slate-50 via-white to-blue-50"
      }`}
    >
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <header
          className={`rounded-3xl p-6 shadow-lg backdrop-blur-md border md:p-8 ${
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
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <section
              className={`rounded-3xl p-6 backdrop-blur-md border shadow-lg md:p-8 ${
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
                <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
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
                    const isOverdue = !task.completed && task.dueDate < today;

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
                          <div className="grid gap-2 md:grid-cols-[1fr_160px_140px_auto_auto]">
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
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p
                                  className={`font-semibold ${
                                    darkMode ? "text-slate-100" : "text-slate-900"
                                  } ${task.completed ? "line-through opacity-70" : ""}`}
                                >
                                  {task.title}
                                </p>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getPriorityBadgeClass(task.priority)}`}>
                                  {task.priority}
                                </span>
                              </div>
                              <p className={`mt-1 text-xs ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                                📅 {formatDisplayDate(task.dueDate)} {isOverdue ? "• OVERDUE" : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
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

            <section className="rounded-3xl bg-white/40 p-6 backdrop-blur-md border border-white/50 shadow-lg md:p-8">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-slate-900">Calendar</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPreviousMonth}
                    className="rounded-lg bg-white/50 border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white/70"
                  >
                    ← Prev
                  </button>
                  <p className="min-w-40 text-center text-sm font-bold text-slate-900">{monthTitle}</p>
                  <button
                    onClick={goToNextMonth}
                    className="rounded-lg bg-white/50 border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white/70"
                  >
                    Next →
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase tracking-wider text-blue-600 mb-3">
                {WEEKDAYS.map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2 mb-6">
                {calendarCells.map((day) => {
                  const dayKey = toDateInputValue(day);
                  const isCurrentMonth = day.getMonth() === monthCursor.getMonth();
                  const isSelected = selectedDate === dayKey;
                  const dueCount = dueCountByDate.get(dayKey) || 0;

                  return (
                    <button
                      key={dayKey}
                      onClick={() => setSelectedDate(dayKey)}
                      className={`rounded-lg p-2.5 text-left text-sm font-semibold transition ${
                        isSelected
                          ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg"
                          : "bg-white/50 text-slate-900 border border-slate-200/50 hover:bg-white/80"
                      } ${!isCurrentMonth ? "opacity-30" : ""}`}
                    >
                      <div>{day.getDate()}</div>
                      {dueCount > 0 && (
                        <div className="mt-1 text-[10px] font-bold opacity-80">
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
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-12 border-t border-slate-200/50 pt-6 pb-4 text-center">
        <p className="text-xs font-light text-slate-600">
          Powered by{" "}
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent font-bold italic tracking-wide">
            ShadowXByte
          </span>
        </p>
      </div>
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
