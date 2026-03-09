'use client';

import { useMemo } from 'react';
import type { Task, Routine } from '../types';
import { toDateInputValue } from '../utils/dateHelpers';

interface UseAnalyticsProps {
  tasks: Task[];
  routines: Routine[];
  completedRoutineKeys: string[];
  today: string;
}

export function useAnalytics({ tasks, routines, completedRoutineKeys, today }: UseAnalyticsProps) {
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

    const getRoutineStartDate = (routine: Routine) => {
      if (typeof routine.createdAt !== "string" || routine.createdAt.length < 10) {
        return null;
      }

      return routine.createdAt.slice(0, 10);
    };

    const countExpectedOccurrences = (startIso: string, endIso: string) => {
      let expected = 0;
      const cursor = new Date(`${startIso}T00:00:00`);
      const end = new Date(`${endIso}T00:00:00`);

      while (cursor <= end) {
        const cursorIso = toDateInputValue(cursor);
        const weekday = cursor.getDay();
        for (const routine of activeRoutines) {
          const routineStart = getRoutineStartDate(routine);
          if (routineStart && cursorIso < routineStart) {
            continue;
          }

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

  return {
    analytics,
    todayTasks,
    monthlyAnalytics,
    routineAnalytics,
    weeklyTrend,
    chartDistribution,
  };
}
