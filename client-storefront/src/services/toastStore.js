// Notification lifecycle is kept outside React so timers and deduplication can be tested.
export function createToastStore({ now = Date.now, schedule = setTimeout, cancel = clearTimeout, maxVisible = 4, duplicateWindow = 2000 } = {}) {
  let sequence = 0;
  let entries = [];
  const listeners = new Set();
  const recent = new Map();
  const timers = new Map();
  const snapshot = () => entries.map(({ id, type, message }) => ({ id, type, message }));
  const emit = () => { for (const listener of listeners) listener(snapshot()); };
  const dismiss = (id) => {
    const timer = timers.get(id);
    if (timer) cancel(timer.handle);
    timers.delete(id);
    entries = entries.filter((entry) => entry.id !== id);
    emit();
  };
  const startTimer = (entry) => {
    if (!entry.remaining || entry.pauses.size) return;
    const handle = schedule(() => dismiss(entry.id), entry.remaining);
    timers.set(entry.id, { handle, startedAt: now() });
  };
  const push = (message, { type = 'info', duration = type === 'error' ? 8000 : 6000, dedupeKey } = {}) => {
    if (typeof message !== 'string' || !message.trim()) return null;
    const safeType = ['success', 'error', 'info'].includes(type) ? type : 'info';
    const key = dedupeKey || `${safeType}:${message.trim()}`;
    const active = entries.find((entry) => entry.key === key);
    if (active) return active.id;
    if (recent.has(key) && now() - recent.get(key) < duplicateWindow) return null;
    for (const [previousKey, timestamp] of recent) {
      if (now() - timestamp >= duplicateWindow) recent.delete(previousKey);
    }
    recent.set(key, now());
    const entry = {
      id: `toast-${++sequence}`, type: safeType, message: message.trim(), key,
      remaining: duration === 0 ? 0 : Math.max(5000, Math.min(Number(duration) || 6000, 60000)),
      pauses: new Set(),
    };
    while (entries.length >= maxVisible) dismiss(entries[0].id);
    entries = [...entries, entry];
    startTimer(entry);
    emit();
    return entry.id;
  };
  const pause = (id, reason) => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    const timer = timers.get(id);
    if (timer) {
      cancel(timer.handle);
      entry.remaining = Math.max(1, entry.remaining - (now() - timer.startedAt));
      timers.delete(id);
    }
    entry.pauses.add(reason);
  };
  const resume = (id, reason) => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    entry.pauses.delete(reason);
    if (!timers.has(id)) startTimer(entry);
  };
  return {
    push, dismiss, pause, resume, getSnapshot: snapshot,
    success: (message, options) => push(message, { ...options, type: 'success' }),
    error: (message, options) => push(message, { ...options, type: 'error' }),
    info: (message, options) => push(message, { ...options, type: 'info' }),
    subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    clear() {
      for (const timer of timers.values()) cancel(timer.handle);
      timers.clear(); recent.clear(); entries = []; emit();
    },
  };
}
