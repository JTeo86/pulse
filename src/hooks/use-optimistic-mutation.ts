import { useState, useCallback, useRef, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════════
   SAVE STATUS — tracks saving / saved / error for inline UI
   ═══════════════════════════════════════════════════════════ */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useSaveStatus(resetMs = 2000) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const markSaving = useCallback(() => setStatus('saving'), []);
  const markSaved = useCallback(() => {
    setStatus('saved');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), resetMs);
  }, [resetMs]);
  const markError = useCallback(() => {
    setStatus('error');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 4000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { status, markSaving, markSaved, markError };
}

/* ═══════════════════════════════════════════════════════════
   AUTOSAVE FIELD — debounced save for text inputs
   ═══════════════════════════════════════════════════════════ */

export function useAutosaveField<T>(
  initial: T,
  saveFn: (value: T) => Promise<void>,
  debounceMs = 800,
) {
  const [value, setValue] = useState<T>(initial);
  const { status, markSaving, markSaved, markError } = useSaveStatus();
  const isEditing = useRef(false);
  const lastSaved = useRef<T>(initial);

  // Sync from server only when not editing
  useEffect(() => {
    if (!isEditing.current) {
      setValue(initial);
      lastSaved.current = initial;
    }
  }, [initial]);

  // Debounced save
  useEffect(() => {
    if (!isEditing.current) return;
    const timer = setTimeout(async () => {
      if (JSON.stringify(value) === JSON.stringify(lastSaved.current)) {
        isEditing.current = false;
        return;
      }
      markSaving();
      try {
        await saveFn(value);
        lastSaved.current = value;
        markSaved();
      } catch {
        markError();
      }
      isEditing.current = false;
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [value, debounceMs]);

  const onChange = useCallback((next: T | ((prev: T) => T)) => {
    isEditing.current = true;
    setValue(next);
  }, []);

  return { value, onChange, status };
}

/* ═══════════════════════════════════════════════════════════
   OPTIMISTIC LIST — for task-style lists with add/toggle/delete
   ═══════════════════════════════════════════════════════════ */

export function useOptimisticList<T extends { id: string }>(
  serverItems: T[],
  deps: any[] = [],
) {
  const [items, setItems] = useState<T[]>(serverItems);

  // Sync from server when deps change (initial load)
  useEffect(() => {
    setItems(serverItems);
  }, deps);

  const optimisticUpdate = useCallback(
    (id: string, patch: Partial<T>) => {
      setItems(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));
    },
    [],
  );

  const optimisticAdd = useCallback((item: T) => {
    setItems(prev => [...prev, item]);
  }, []);

  const optimisticRemove = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const rollback = useCallback((snapshot: T[]) => {
    setItems(snapshot);
  }, []);

  const snapshot = useCallback(() => [...items], [items]);

  return { items, setItems, optimisticUpdate, optimisticAdd, optimisticRemove, rollback, snapshot };
}
