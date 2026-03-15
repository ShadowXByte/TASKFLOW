import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

interface DarkModeProp {
  darkMode: boolean;
}

interface PanelProps extends DarkModeProp {
  children: ReactNode;
  className?: string;
}

export function WorkspacePanel({ darkMode, children, className = "" }: PanelProps) {
  const baseClass = darkMode
    ? "rounded-2xl border border-white/10 bg-slate-900/52 p-5"
    : "rounded-2xl border border-slate-200/80 bg-white/72 p-5";

  return <section className={`${baseClass} ${className}`.trim()}>{children}</section>;
}

interface FieldInputProps extends DarkModeProp, InputHTMLAttributes<HTMLInputElement> {}

export function FieldInput({ darkMode, className = "", ...props }: FieldInputProps) {
  const baseClass = darkMode
    ? "w-full mt-1 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-slate-100 outline-none transition focus:border-emerald-500"
    : "w-full mt-1 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-slate-900 outline-none transition focus:border-emerald-500";

  return <input className={`${baseClass} ${className}`.trim()} {...props} />;
}

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {}

export function PrimaryButton({ className = "", ...props }: PrimaryButtonProps) {
  return (
    <button
      className={`w-full rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 ${className}`.trim()}
      {...props}
    />
  );
}

interface DangerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {}

export function DangerButton({ className = "", ...props }: DangerButtonProps) {
  return (
    <button
      className={`w-full rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50 ${className}`.trim()}
      {...props}
    />
  );
}
