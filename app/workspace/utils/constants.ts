export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// localStorage keys - prefixed to avoid conflicts
export const GUEST_TASKS_KEY = "taskflow_guest_tasks";
export const GUEST_ROUTINES_KEY = "taskflow_guest_routines";
export const THEME_KEY = "taskflow_theme";
export const NOTIFICATION_ASKED_KEY = "taskflow_notifications_asked";
export const NOTIFIED_TASKS_KEY = "taskflow_notified_tasks";
export const ACCOUNT_TASKS_CACHE_PREFIX = "taskflow_account_tasks";
export const ACCOUNT_ROUTINES_CACHE_PREFIX = "taskflow_account_routines";
export const ACCOUNT_PENDING_OPS_PREFIX = "taskflow_account_pending_ops";
export const ACCOUNT_MIGRATION_DECISION_PREFIX = "taskflow_account_migration_decision";

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TaskPriority = typeof PRIORITIES[number];

export const SW_PATH = "/sw.js";
