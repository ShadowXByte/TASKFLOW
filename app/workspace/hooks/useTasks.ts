'use client';

import { useCallback, useState, useEffect } from 'react';
import type { Task, TaskFilter } from '../types';
import {
  readGuestTasks,
  writeGuestTasks,
  readNotifiedKeys,
} from '../utils/taskHelpers';

export function useTasks(mode: 'guest' | 'account', userId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [loading, setLoading] = useState(true);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());

  // Load tasks based on mode
  useEffect(() => {
    const loadTasks = async () => {
      setLoading(true);
      try {
        if (mode === 'guest') {
          const guestTasks = readGuestTasks();
          setTasks(guestTasks);
        } else if (userId) {
          const response = await fetch('/api/tasks');
          if (response.ok) {
            const accountTasks = await response.json();
            setTasks(accountTasks);
          }
        }
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, [mode, userId]);

  const addTask = useCallback(
    async (task: Omit<Task, 'id' | 'completed'>) => {
      try {
        if (mode === 'guest') {
          const guestTasks = readGuestTasks();
          const newTask: Task = {
            ...task,
            id: Math.max(...guestTasks.map((t) => t.id), 0) + 1,
            completed: false,
          };
          writeGuestTasks([...guestTasks, newTask]);
          setTasks([...guestTasks, newTask]);
        } else {
          const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task),
          });
          if (response.ok) {
            const newTask = await response.json();
            setTasks([...tasks, newTask]);
          }
        }
      } catch (error) {
        console.error('Failed to add task:', error);
        throw error;
      }
    },
    [mode, tasks]
  );

  const deleteTask = useCallback(
    async (taskId: number) => {
      try {
        if (mode === 'guest') {
          const guestTasks = readGuestTasks();
          const updated = guestTasks.filter((t) => t.id !== taskId);
          writeGuestTasks(updated);
          setTasks(updated);
        } else {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE',
          });
          if (response.ok) {
            setTasks(tasks.filter((t) => t.id !== taskId));
          }
        }
      } catch (error) {
        console.error('Failed to delete task:', error);
        throw error;
      }
    },
    [mode, tasks]
  );

  const toggleTask = useCallback(
    async (taskId: number, completed: boolean) => {
      try {
        if (mode === 'guest') {
          const guestTasks = readGuestTasks();
          const updated = guestTasks.map((t) =>
            t.id === taskId ? { ...t, completed } : t
          );
          writeGuestTasks(updated);
          setTasks(updated);
        } else {
          const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed }),
          });
          if (response.ok) {
            const updated = await response.json();
            setTasks(tasks.map((t) => (t.id === taskId ? updated : t)));
          }
        }
      } catch (error) {
        console.error('Failed to toggle task:', error);
        throw error;
      }
    },
    [mode, tasks]
  );

  const toggleTaskExpanded = useCallback((taskId: number) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const getFilteredTasks = useCallback(
    (dateFilter?: string) => {
      let filtered = tasks;

      if (dateFilter) {
        filtered = filtered.filter((t) => t.dueDate === dateFilter);
      }

      if (filter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        filtered = filtered.filter((t) => t.dueDate === today);
      } else if (filter === 'upcoming') {
        const today = new Date().toISOString().split('T')[0];
        filtered = filtered.filter((t) => t.dueDate >= today && !t.completed);
      } else if (filter === 'overdue') {
        const today = new Date().toISOString().split('T')[0];
        filtered = filtered.filter((t) => t.dueDate < today && !t.completed);
      } else if (filter === 'all') {
        // No additional filtering
      }

      return filtered.sort((a, b) => {
        const aPriority = { HIGH: 3, MEDIUM: 2, LOW: 1 }[a.priority] || 0;
        const bPriority = { HIGH: 3, MEDIUM: 2, LOW: 1 }[b.priority] || 0;
        return bPriority - aPriority;
      });
    },
    [tasks, filter]
  );

  return {
    tasks,
    filter,
    setFilter,
    loading,
    addTask,
    deleteTask,
    toggleTask,
    expandedTaskIds,
    toggleTaskExpanded,
    getFilteredTasks,
  };
}
