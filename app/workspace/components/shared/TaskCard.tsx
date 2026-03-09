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

const priorityConfig = {
  HIGH: {
    icon: '🔴',
    label: 'High',
    bgDark: 'bg-red-500/20',
    bgLight: 'bg-red-50',
    textDark: 'text-red-400',
    textLight: 'text-red-700',
    borderDark: 'border-red-500/30',
    borderLight: 'border-red-200',
  },
  MEDIUM: {
    icon: '🟡',
    label: 'Medium',
    bgDark: 'bg-amber-500/20',
    bgLight: 'bg-amber-50',
    textDark: 'text-amber-400',
    textLight: 'text-amber-700',
    borderDark: 'border-amber-500/30',
    borderLight: 'border-amber-200',
  },
  LOW: {
    icon: '🟢',
    label: 'Low',
    bgDark: 'bg-green-500/20',
    bgLight: 'bg-green-50',
    textDark: 'text-green-400',
    textLight: 'text-green-700',
    borderDark: 'border-green-500/30',
    borderLight: 'border-green-200',
  },
};

export function TaskCard({
  task,
  darkMode,
  isExpanded,
  onToggleExpand,
  onToggleComplete,
  onDelete,
}: TaskCardProps) {
  const priority = priorityConfig[task.priority];
  const dueTimestamp = new Date(`${task.dueDate}T${task.dueTime || '23:59'}`).getTime();
  const isOverdue = !task.completed && !Number.isNaN(dueTimestamp) && dueTimestamp < Date.now();

  return (
    <div
      onClick={onToggleExpand}
      className={`group relative cursor-pointer rounded-xl border backdrop-blur-sm px-4 py-3 transition-all duration-300 hover:scale-[1.02] ${
        darkMode
          ? `border-slate-700/50 bg-slate-800/60 hover:bg-slate-800/80 hover:border-slate-600 shadow-lg shadow-slate-950/20`
          : `border-slate-200 bg-white/80 shadow-md hover:shadow-lg hover:border-slate-300`
      }`}
    >
      {/* Subtle glow effect on hover */}
      <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
        darkMode ? 'bg-gradient-to-br from-blue-500/5 to-purple-500/5' : 'bg-gradient-to-br from-blue-500/5 to-purple-500/5'
      }`} />
      
      <div className="relative flex items-start gap-3">
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={(e) => {
              e.stopPropagation();
              onToggleComplete(e.target.checked);
            }}
            className={`h-5 w-5 rounded-lg cursor-pointer accent-blue-500 transition-all duration-200 hover:scale-110 ${
              task.completed ? 'opacity-60' : 'opacity-100'
            }`}
          />
        </div>
        
        <div className="flex-1 min-w-0">
          <p
            className={`text-base font-semibold transition-all duration-200 ${
              task.completed
                ? darkMode
                  ? 'line-through text-slate-500'
                  : 'line-through text-slate-400'
                : darkMode
                  ? 'text-slate-50'
                  : 'text-slate-900'
            }`}
          >
            {task.title}
          </p>
          
          {isExpanded && task.description && (
            <p className={`mt-2 text-xs leading-relaxed animate-in fade-in slide-in-from-top-2 duration-300 whitespace-pre-line break-words ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {task.description}
            </p>
          )}
          
          <div className="mt-2 flex items-center gap-1.5 text-xs flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${
              darkMode 
                ? `${priority.bgDark} ${priority.textDark} ${priority.borderDark}` 
                : `${priority.bgLight} ${priority.textLight} ${priority.borderLight}`
            }`}>
              <span className="text-sm">{priority.icon}</span>
              {priority.label}
            </span>

            {isOverdue && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${
                darkMode
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : 'bg-red-100 text-red-700 border-red-200'
              }`}>
                <span>⚠️</span>
                Overdue
              </span>
            )}
            
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
              darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-700'
            }`}>
              <span>📅</span>
              {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            
            {task.dueTime && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-700'
              }`}>
                <span>⏰</span>
                {task.dueTime}
              </span>
            )}
          </div>
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={`rounded-lg p-2 opacity-0 transition-all duration-300 group-hover:opacity-100 hover:scale-110 active:scale-95 ${
            darkMode
              ? 'hover:bg-red-500/20 text-red-400 border border-red-500/30'
              : 'hover:bg-red-50 text-red-600 border border-red-200'
          }`}
          title="Delete task"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
