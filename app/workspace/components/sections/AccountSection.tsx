'use client';

interface AccountSectionProps {
  darkMode: boolean;
  mode: 'guest' | 'account';
  userId?: string;
}

export function AccountSection({
  darkMode,
  mode,
  userId,
}: AccountSectionProps) {
  return (
    <div className={`space-y-6 rounded-3xl p-8 ${
      darkMode ? 'bg-gradient-to-br from-slate-900 to-slate-800' : 'bg-gradient-to-br from-slate-50 to-white'
    }`}>
      <div>
        <h2 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
          Account Settings
        </h2>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Manage your account and preferences
        </p>
      </div>

      <div className={`text-center py-12 rounded-xl ${
        darkMode ? 'bg-slate-800/50' : 'bg-slate-100/50'
      }`}>
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
          Account settings interface loading...
        </p>
      </div>
    </div>
  );
}
