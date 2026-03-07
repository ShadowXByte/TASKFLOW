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
    <div className={`space-y-6 rounded-2xl p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 border ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 border-slate-700/30' 
        : 'bg-gradient-to-br from-white/95 via-slate-50/95 to-white/95 border-slate-200/50'
    }`}>
      <div className="space-y-2">
        <h2 className={`text-3xl font-bold tracking-tight ${darkMode ? 'text-slate-50' : 'text-slate-900'}`}>
          Today's Tasks
        </h2>
        <p className={`text-sm flex items-center gap-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          <span className="text-xl">📅</span>
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
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
            <span className="text-xl">✓</span>
            Scheduled Tasks
          </h3>
          {allTasksForToday.length > 0 && (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              darkMode ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {allTasksForToday.filter(t => !t.completed).length} pending
            </span>
          )}
        </div>
        {allTasksForToday.length === 0 ? (
          <div className={`relative overflow-hidden text-center py-12 px-6 rounded-xl border-2 border-dashed transition-all duration-300 ${
            darkMode 
              ? 'bg-gradient-to-br from-slate-800/40 to-slate-900/40 border-slate-700/50 hover:border-slate-600/70' 
              : 'bg-gradient-to-br from-slate-50 to-white border-slate-300 hover:border-slate-400'
          }`}>
            <div className="relative z-10">
              <div className="text-6xl mb-4 animate-bounce inline-block">✨</div>
              <p className={`text-xl font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                All clear!
              </p>
              <p className={`text-sm mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                No tasks scheduled for today
              </p>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Add a new task above to get started
              </p>
            </div>
            {/* Background decoration */}
            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 ${
              darkMode ? 'bg-blue-500' : 'bg-blue-400'
            }`} />
            <div className={`absolute bottom-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-20 ${
              darkMode ? 'bg-purple-500' : 'bg-purple-400'
            }`} />
          </div>
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
