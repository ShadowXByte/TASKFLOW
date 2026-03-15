'use client';

interface TaskCardSkeletonProps {
  darkMode: boolean;
}

export function TaskCardSkeleton({ darkMode }: TaskCardSkeletonProps) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 animate-pulse ${
        darkMode
          ? 'border-slate-700/55 bg-slate-900/45'
          : 'border-slate-200/85 bg-white/75'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox skeleton */}
        <div className={`h-5 w-5 rounded-md ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
        
        <div className="flex-1 space-y-3">
          {/* Title skeleton */}
          <div className={`h-5 rounded-md w-2/3 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
          
          {/* Tags skeleton */}
          <div className="flex gap-3">
            <div className={`h-6 rounded-md w-20 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <div className={`h-6 rounded-md w-24 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <div className={`h-6 rounded-md w-16 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
          </div>
        </div>
        
        {/* Delete button skeleton */}
        <div className={`h-8 w-8 rounded-md ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
      </div>
    </div>
  );
}
