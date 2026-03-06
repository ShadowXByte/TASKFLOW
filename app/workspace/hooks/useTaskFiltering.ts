'use client';

import { useMemo } from 'react';
import type { Task, Routine } from '../types';

interface UseTaskFilteringProps {
  tasks: Task[];
  routines: Routine[];
  filter: string;
  search: string;
  today: string;
  allTasksDateFilter: string;
}

export function useTaskFiltering({
  tasks,
  routines,
  filter,
  search,
  today,
  allTasksDateFilter,
}: UseTaskFilteringProps) {
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
  }, [tasks, routines, filter, search, today, allTasksDateFilter]);

  return { filteredTasks };
}
