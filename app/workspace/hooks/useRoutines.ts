'use client';

import { useCallback, useState, useEffect } from 'react';
import type { Routine } from '../types';
import {
  readGuestRoutines,
  writeGuestRoutines,
} from '../utils/taskHelpers';

export function useRoutines(mode: 'guest' | 'account', userId?: string) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);

  // Load routines
  useEffect(() => {
    const loadRoutines = async () => {
      setLoading(true);
      try {
        if (mode === 'guest') {
          const guestRoutines = readGuestRoutines();
          setRoutines(guestRoutines);
        } else if (userId) {
          const response = await fetch('/api/routines');
          if (response.ok) {
            const accountRoutines = await response.json();
            setRoutines(accountRoutines);
          }
        }
      } catch (error) {
        console.error('Failed to load routines:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRoutines();
  }, [mode, userId]);

  const addRoutine = useCallback(
    async (routine: Omit<Routine, 'id'>) => {
      try {
        if (mode === 'guest') {
          const guestRoutines = readGuestRoutines();
          const newRoutine: Routine = {
            ...routine,
            id: Math.max(...guestRoutines.map((r) => r.id), 0) + 1,
          };
          writeGuestRoutines([...guestRoutines, newRoutine]);
          setRoutines([...guestRoutines, newRoutine]);
        } else {
          const response = await fetch('/api/routines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routine),
          });
          if (response.ok) {
            const newRoutine = await response.json();
            setRoutines([...routines, newRoutine]);
          }
        }
      } catch (error) {
        console.error('Failed to add routine:', error);
        throw error;
      }
    },
    [mode, routines]
  );

  const deleteRoutine = useCallback(
    async (routineId: number) => {
      try {
        if (mode === 'guest') {
          const guestRoutines = readGuestRoutines();
          const updated = guestRoutines.filter((r) => r.id !== routineId);
          writeGuestRoutines(updated);
          setRoutines(updated);
        } else {
          const response = await fetch(`/api/routines/${routineId}`, {
            method: 'DELETE',
          });
          if (response.ok) {
            setRoutines(routines.filter((r) => r.id !== routineId));
          }
        }
      } catch (error) {
        console.error('Failed to delete routine:', error);
        throw error;
      }
    },
    [mode, routines]
  );

  const toggleRoutine = useCallback(
    async (routineId: number, isActive: boolean) => {
      try {
        if (mode === 'guest') {
          const guestRoutines = readGuestRoutines();
          const updated = guestRoutines.map((r) =>
            r.id === routineId ? { ...r, isActive } : r
          );
          writeGuestRoutines(updated);
          setRoutines(updated);
        } else {
          const response = await fetch(`/api/routines/${routineId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive }),
          });
          if (response.ok) {
            const updated = await response.json();
            setRoutines(routines.map((r) => (r.id === routineId ? updated : r)));
          }
        }
      } catch (error) {
        console.error('Failed to toggle routine:', error);
        throw error;
      }
    },
    [mode, routines]
  );

  return {
    routines,
    loading,
    addRoutine,
    deleteRoutine,
    toggleRoutine,
  };
}
