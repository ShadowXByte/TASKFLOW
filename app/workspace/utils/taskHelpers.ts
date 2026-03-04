import type { Task, TaskPriority, Routine } from "../types";
import { safeStorageGetItem, safeStorageSetItem } from "./storage";
import { GUEST_TASKS_KEY, GUEST_ROUTINES_KEY, NOTIFIED_TASKS_KEY } from "./constants";
import { isValidTime } from "./dateHelpers";

// Read guest tasks from localStorage with validation
export const readGuestTasks = (): Task[] => {
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
    
    // Validate each task has required fields
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

export const writeGuestTasks = (tasks: Task[]) => {
  if (typeof window === "undefined") {
    return;
  }
  safeStorageSetItem(GUEST_TASKS_KEY, JSON.stringify(tasks));
};

// Read guest routines from localStorage
export const readGuestRoutines = (): Routine[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = safeStorageGetItem(GUEST_ROUTINES_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<unknown>;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((routine): routine is Routine => {
        return (
          typeof routine === "object" &&
          routine !== null &&
          typeof (routine as Routine).id === "number" &&
          typeof (routine as Routine).title === "string" &&
          typeof (routine as Routine).dayOfWeek === "number" &&
          typeof (routine as Routine).time === "string" &&
          typeof (routine as Routine).isActive === "boolean"
        );
      });
  } catch {
    return [];
  }
};

// Write guest routines to localStorage
export const writeGuestRoutines = (routines: Routine[]) => {
  if (typeof window === "undefined") {
    return;
  }
  safeStorageSetItem(GUEST_ROUTINES_KEY, JSON.stringify(routines));
};

// Generate tasks from routines for a given date
export const generateRoutineTasksForDate = (dateString: string, routines: Routine[]): Task[] => {
  const date = new Date(dateString + "T00:00:00");
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc
  
  // Filter routines that match this day or are daily (dayOfWeek === 7)
  const matchingRoutines = routines.filter(r => r.isActive && (r.dayOfWeek === dayOfWeek || r.dayOfWeek === 7));
  
  // Generate unique IDs for routine-generated tasks by hashing dateString + routineId
  return matchingRoutines.map((routine) => {
    // Create a unique hash from dateString + routineId
    const hashStr = dateString + "-" + routine.id;
    let hash = 0;
    for (let i = 0; i < hashStr.length; i++) {
      const char = hashStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Keep within 32-bit integer
    }
    const uniqueNegativeId = -(Math.abs(hash) % 1000000 + 1000000); // Ensure it's unique and negative

    return {
      id: uniqueNegativeId,
      title: routine.title,
      description: routine.description || null,
      dueDate: dateString,
      dueTime: routine.time,
      completed: false,
      priority: routine.priority,
      routineId: routine.id,
    };
  });
};

// Track which tasks we've already notified about (to avoid spam)
export const readNotifiedKeys = () => {
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

// Web push subscription helper
// FIXME: This conversion is a bit janky but it works
export const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (item) => item.charCodeAt(0));
};
