'use client';

import { useState } from 'react';
import { TaskForm } from '../shared/TaskForm';
import { TaskCard } from '../shared/TaskCard';
import { useTasks } from '../../hooks';

interface AllTasksSectionProps {
  darkMode: boolean;
  today: string;
  mode: 'guest' | 'account';
  userId?: string;
}

type TaskFilter = 'all' | 'upcoming' | 'overdue';

export function AllTasksSection({
  darkMode,
  today,
  mode,
  userId,
}: AllTasksSectionProps) {
  const { tasks, addTask, deleteTask, toggleTask, expandedTaskIds, toggleTaskExpanded } =
    useTasks(mode, userId);

  const [filter, setFilter] = useState<TaskFilter>('upcoming');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);

  const filteredTasks = tasks.filter((t) => {
    const today = new Date().toISOString().split('T')[0];
    if (filter === 'upcoming') return t.dueDate >= today && !t.completed;
    if (filter === 'overdue') return t.dueDate < today && !t.completed;
    return true; // 'all'
  });

  const handleDeleteTask = async (taskId: number) => {
    try {
      await deleteTask(taskId);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleToggleTask = async (taskId: number, completed: boolean) => {
    try {
      await toggleTask(taskId, completed);
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  return (
    <div className={`space-y-6 rounded-3xl p-8 ${
      darkMode ? 'bg-gradient-to-br from-slate-900 to-slate-800' : 'bg-gradient-to-br from-slate-50 to-white'
    }`}>
      <div>
        <h2 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
          All Tasks
        </h2>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Manage all your tasks in one place
        </p>
      </div>

      <TaskForm darkMode={darkMode} minDate={today} onSubmit={addTask} />

      <div className="flex gap-2">
        {(['upcoming', 'overdue', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              filter === f
                ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div>
        {filteredTasks.length === 0 ? (
          <p className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            🎯 No tasks here yet. Add one above!
          </p>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <div key={task.id}>
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
