'use client';

interface RoutineSectionProps {
  darkMode: boolean;
  mode: 'guest' | 'account';
  userId?: string;
}

export function RoutineSection({
  darkMode,
  mode,
  userId,
}: RoutineSectionProps) {
  return (
    <div className={`space-y-5 rounded-xl border p-6 ${
      darkMode ? 'bg-slate-900/55 border-slate-700/60' : 'bg-white/72 border-slate-200/80'
    }`}>
      <div>
        <h2 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
          Weekly Routine
        </h2>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Create and manage your recurring habits
        </p>
      </div>

      <div className={`text-center py-10 rounded-lg border ${
        darkMode ? 'bg-slate-900/35 border-slate-700/60' : 'bg-slate-50/70 border-slate-200/80'
      }`}>
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
          Routine management interface loading...
        </p>
      </div>
    </div>
  );
}
