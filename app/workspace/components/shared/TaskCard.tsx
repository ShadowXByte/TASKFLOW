'use client';

import type { Task } from '../../types';

interface TaskCardProps {
  task: Task;
  darkMode: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleComplete: (completed: boolean) => void;
  onDelete: () => void;
}

export function TaskCard({
  task,
  darkMode,
  isExpanded,
  onToggleExpand,
  onToggleComplete,
  onDelete,
}: TaskCardProps) {
  const priorityColors = {
    HIGH: darkMode ? 'text-red-400' : 'text-red-600',
    MEDIUM: darkMode ? 'text-amber-400' : 'text-amber-600',
    LOW: darkMode ? 'text-green-400' : 'text-green-600',
  };

  return (
    <div
      onClick={onToggleExpand}
      className={`group cursor-pointer rounded-xl border-2 px-4 py-3 transition-all duration-200 ${
        darkMode
          ? `border-slate-700 bg-slate-900/50 hover:bg-slate-800/50`
          : `border-slate-200 bg-white/70 hover:bg-white/90`
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={(e) => {
            e.stopPropagation();
            onToggleComplete(e.target.checked);
          }}
          className={`mt-1 h-5 w-5 rounded accent-blue-500 ${
            task.completed ? 'opacity-50' : 'opacity-100'
          }`}
        />
        <div className="flex-1 min-w-0">
          <p
            className={`font-medium transition-all duration-200 ${
              task.completed
                ? darkMode
                  ? 'line-through text-slate-500'
                  : 'line-through text-slate-400'
                : darkMode
                  ? 'text-slate-100'
                  : 'text-slate-900'
            }`}
          >
            {task.title}
          </p>
          {isExpanded && task.description && (
            <p className={`mt-2 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {task.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className={priorityColors[task.priority]}>{task.priority}</span>
            <span className={darkMode ? 'text-slate-500' : 'text-slate-500'}>
              {task.dueDate}
            </span>
            <span className={darkMode ? 'text-slate-500' : 'text-slate-500'}>
              {task.dueTime}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={`rounded-lg p-2 opacity-0 transition-all duration-200 group-hover:opacity-100 ${
            darkMode
              ? 'hover:bg-red-900/30 text-red-400'
              : 'hover:bg-red-100 text-red-600'
          }`}
          title="Delete task"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
