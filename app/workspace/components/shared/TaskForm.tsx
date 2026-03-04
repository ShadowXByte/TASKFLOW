'use client';

import { useRef, useState } from 'react';
import type { TaskPriority } from '../../types';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface TaskFormProps {
  darkMode: boolean;
  minDate: string;
  onSubmit: (data: {
    title: string;
    description: string;
    dueDate: string;
    dueTime: string;
    priority: TaskPriority;
  }) => Promise<void>;
}

function formatDisplayDate(dateStr: string): string {
  const regex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateStr.match(regex);
  if (match) {
    const [, yyyy, mm, dd] = match;
    return `${dd}-${mm}-${yyyy}`;
  }
  return dateStr;
}

function parseDisplayDate(dateStr: string): string {
  const regex = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match = dateStr.match(regex);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
  }
  return dateStr;
}

export function TaskForm({ darkMode, minDate, onSubmit }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(formatDisplayDate(minDate));
  const [dueTime, setDueTime] = useState('09:00');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const datePickerRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Please enter a task title');
      return;
    }

    if (!dueDate.trim()) {
      alert('Please select a due date');
      return;
    }

    if (!TIME_REGEX.test(dueTime)) {
      alert('Please enter a valid time (HH:MM)');
      return;
    }

    try {
      setIsSubmitting(true);
      const parsedDate = parseDisplayDate(dueDate);
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        dueDate: parsedDate,
        dueTime,
        priority,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setDueDate(formatDisplayDate(minDate));
      setDueTime('09:00');
      setPriority('MEDIUM');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white/5 p-6">
      <div>
        <label className={`block text-sm font-medium mb-2 ${
          darkMode ? 'text-slate-300' : 'text-slate-700'
        }`}>
          Task Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter task title..."
          disabled={isSubmitting}
          className={`w-full rounded-xl border-2 px-4 py-2 text-sm outline-none transition ${
            darkMode
              ? 'border-slate-700 bg-slate-900/50 text-slate-100 placeholder-slate-500'
              : 'border-slate-200 bg-white/70 text-slate-900 placeholder-slate-400'
          } disabled:opacity-50`}
        />
      </div>

      <div>
        <label className={`block text-sm font-medium mb-2 ${
          darkMode ? 'text-slate-300' : 'text-slate-700'
        }`}>
          Description (Optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter task description..."
          disabled={isSubmitting}
          rows={3}
          className={`w-full rounded-xl border-2 px-4 py-2 text-sm outline-none transition ${
            darkMode
              ? 'border-slate-700 bg-slate-900/50 text-slate-100 placeholder-slate-500'
              : 'border-slate-200 bg-white/70 text-slate-900 placeholder-slate-400'
          } disabled:opacity-50`}
        />
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <div>
          <label className={`block text-sm font-medium mb-2 ${
            darkMode ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Due Date
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="DD-MM-YYYY"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            onClick={() => datePickerRef.current?.click()}
            disabled={isSubmitting}
            className={`w-full rounded-xl border-2 px-4 py-2 text-sm outline-none transition ${
              darkMode
                ? 'border-slate-700 bg-slate-900/50 text-slate-100'
                : 'border-slate-200 bg-white/70 text-slate-900'
            } disabled:opacity-50`}
          />
          <input
            ref={datePickerRef}
            type="date"
            defaultValue={minDate}
            onChange={(e) => setDueDate(formatDisplayDate(e.target.value))}
            disabled={isSubmitting}
            className="hidden"
          />
        </div>

        <div>
          <label className={`block text-sm font-medium mb-2 ${
            darkMode ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Time
          </label>
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            disabled={isSubmitting}
            className={`w-full rounded-xl border-2 px-4 py-2 text-sm outline-none transition ${
              darkMode
                ? 'border-slate-700 bg-slate-900/50 text-slate-100'
                : 'border-slate-200 bg-white/70 text-slate-900'
            } disabled:opacity-50`}
          />
        </div>

        <div>
          <label className={`block text-sm font-medium mb-2 ${
            darkMode ? 'text-slate-300' : 'text-slate-700'
          }`}>
            Priority
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            disabled={isSubmitting}
            className={`w-full rounded-xl border-2 px-4 py-2 text-sm outline-none transition ${
              darkMode
                ? 'border-slate-700 bg-slate-900/50 text-slate-100'
                : 'border-slate-200 bg-white/70 text-slate-900'
            } disabled:opacity-50`}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full rounded-xl px-4 py-2 font-medium transition-all duration-200 ${
          darkMode
            ? 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-700'
            : 'bg-blue-500 hover:bg-blue-600 text-white disabled:bg-slate-300'
        } disabled:cursor-not-allowed`}
      >
        {isSubmitting ? 'Adding...' : 'Add Task'}
      </button>
    </form>
  );
}
