export type Task = {
  id: number;
  title: string;
  description: string | null;
  dueDate: string;
  dueTime: string;
  completed: boolean;
  priority: TaskPriority;
  routineId?: number | null; // Link to routine if generated from one
};

export type Routine = {
  id: number;
  title: string;
  description: string | null;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat, 7=Daily
  time: string;
  priority: TaskPriority;
  isActive: boolean;
};

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type TaskFilter = "all" | "today" | "upcoming" | "completed" | "overdue";

export type WorkspaceMode = "account" | "guest";
export type WorkspaceSection = "today" | "all-tasks" | "analytics" | "routine" | "help" | "account";
export type AnalyticsView = "weekly" | "monthly" | "both";

export type AuthTab = "login" | "register";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type PendingAccountOperation =
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

export type PendingRoutineOperation =
  | {
      type: "create";
      routine: Routine;
      tempId: number;
    }
  | {
      type: "update";
      id: number;
      changes: Partial<Pick<Routine, "title" | "description" | "dayOfWeek" | "time" | "priority" | "isActive">>;
    }
  | {
      type: "delete";
      id: number;
    };
