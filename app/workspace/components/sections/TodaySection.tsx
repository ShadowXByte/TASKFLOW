'use client';

import { useState } from 'react';
import { TaskForm } from '../shared/TaskForm';
import { TaskCard } from '../shared/TaskCard';
import { useTasks } from '../../hooks';
import type { Task } from '../../types';

interface TodaySectionProps {
  darkMode: boolean;
  today: string;
  mode: 'guest' | 'account';
  userId?: string;
  routineTasks?: Task[];
  completedRoutineKeys: Set<string>;
}

export function TodaySection({
  darkMode,
  today,
  mode,
  userId,
  routineTasks = [],
  completedRoutineKeys,
}: TodaySectionProps) {
  const { tasks, addTask, deleteTask, toggleTask, expandedTaskIds, toggleTaskExpanded } =
    useTasks(mode, userId);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter tasks for today
  const todayTasks = tasks.filter((t) => t.dueDate === today);
  const allTasksForToday = [...todayTasks, ...routineTasks];

  const handleAddTask = async (data: any) => {
    try {
      setIsSubmitting(true);
      await addTask(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      await deleteTask(taskId);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to delete task');
    }
  };

  const handleToggleTask = async (taskId: number, completed: boolean) => {
    try {
      await toggleTask(taskId, completed);
    } catch (error) {
      console.error('Failed to toggle task:', error);
      alert('Failed to update task');
    }
  };

  return (
    <div className={`space-y-6 rounded-3xl p-8 ${
      darkMode ? 'bg-gradient-to-br from-slate-900 to-slate-800' : 'bg-gradient-to-br from-slate-50 to-white'
    }`}>
      <div>
        <h2 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
          Today's Tasks
        </h2>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          {new Date(today).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      <TaskForm darkMode={darkMode} minDate={today} onSubmit={handleAddTask} />

      <div>
        <h3 className={`font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
          Scheduled Tasks
        </h3>
        {allTasksForToday.length === 0 ? (
          <p className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            ✨ All clear! Enjoy your free time
          </p>
        ) : (
          <div className="space-y-3">
            {allTasksForToday.map((task) => (
              <div key={`${task.id}-${task.routineId || ''}`}>
                <TaskCard
                  task={task}
                  darkMode={darkMode}
                  isExpanded={expandedTaskIds.has(task.id)}
                  onToggleExpand={() => toggleTaskExpanded(task.id)}
                  onToggleComplete={(completed) => handleToggleTask(task.id, completed)}
                  onDelete={() => setShowDeleteConfirm(task.id)}
                />
                {showDeleteConfirm === task.id && (
                  <div className={`mt-2 rounded-lg p-4 ${
                    darkMode ? 'bg-red-900/30 border border-red-700' : 'bg-red-100 border border-red-300'
                  }`}>
                    <p className={`font-medium mb-3 ${
                      darkMode ? 'text-red-300' : 'text-red-800'
                    }`}>
                      Are you sure? This action cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(null)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium ${
                          darkMode
                            ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                            : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
