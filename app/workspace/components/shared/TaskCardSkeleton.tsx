'use client';

interface TaskCardSkeletonProps {
  darkMode: boolean;
}

export function TaskCardSkeleton({ darkMode }: TaskCardSkeletonProps) {
  return (
    <div
      className={`rounded-2xl border backdrop-blur-sm px-5 py-4 animate-pulse ${
        darkMode
          ? 'border-slate-700/50 bg-slate-800/60 shadow-xl shadow-slate-950/30'
          : 'border-slate-200 bg-white/80 shadow-lg'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox skeleton */}
        <div className={`h-6 w-6 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
        
        <div className="flex-1 space-y-3">
          {/* Title skeleton */}
          <div className={`h-6 rounded-lg w-2/3 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
          
          {/* Tags skeleton */}
          <div className="flex gap-3">
            <div className={`h-8 rounded-full w-20 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <div className={`h-8 rounded-full w-24 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
            <div className={`h-8 rounded-full w-16 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
          </div>
        </div>
        
        {/* Delete button skeleton */}
        <div className={`h-10 w-10 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
      </div>
    </div>
  );
}
