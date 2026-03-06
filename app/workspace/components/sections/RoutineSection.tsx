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
    <div className={`space-y-6 rounded-3xl p-8 ${
      darkMode ? 'bg-gradient-to-br from-slate-900 to-slate-800' : 'bg-gradient-to-br from-slate-50 to-white'
    }`}>
      <div>
        <h2 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
          Weekly Routine
        </h2>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Create and manage your recurring habits
        </p>
      </div>

      <div className={`text-center py-12 rounded-xl ${
        darkMode ? 'bg-slate-800/50' : 'bg-slate-100/50'
      }`}>
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
          Routine management interface loading...
        </p>
      </div>
    </div>
  );
}
