// App-wide, non-blocking notifications (toasts). Async Git actions report
// failures here instead of swallowing them, so a rejected token, a network
// blip, or a metadata sync hiccup becomes a visible, dismissible message rather
// than a silent no-op. Kept deliberately tiny and dependency-free.

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AppNotification } from '@site/src/types';

interface NotificationsApi {
  notify: (message: string, kind?: AppNotification['kind']) => void;
  dismiss: (id: number) => void;
}

const NotificationsContext = createContext<NotificationsApi | null>(null);

const AUTO_DISMISS_MS: Record<AppNotification['kind'], number> = {
  success: 3000,
  info: 4000,
  error: 7000,
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback<NotificationsApi['notify']>(
    (message, kind = 'info') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS[kind]);
    },
    [dismiss],
  );

  // Stable API object so consumers don't re-render when the toast list changes.
  const api = useMemo<NotificationsApi>(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationsContext.Provider value={api}>
      {children}
      <div style={styles.stack} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} style={{ ...styles.toast, ...styles[t.kind] }}>
            <span style={styles.icon}>{ICONS[t.kind]}</span>
            <span style={styles.message}>{t.message}</span>
            <button style={styles.close} onClick={() => dismiss(t.id)} title="Dismiss">
              ✕
            </button>
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}

/**
 * Access the notification API. Falls back to a no-op outside a provider so a
 * component can be rendered (or unit-tested) in isolation without crashing.
 */
export function useNotifications(): NotificationsApi {
  return useContext(NotificationsContext) ?? NOOP;
}

const NOOP: NotificationsApi = { notify: () => {}, dismiss: () => {} };

const ICONS: Record<AppNotification['kind'], string> = {
  success: '✓',
  info: 'ℹ',
  error: '⚠️',
};

const styles: Record<string, React.CSSProperties> = {
  stack: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: 380,
    pointerEvents: 'none',
  },
  toast: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
    boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
    border: '1px solid var(--ifm-color-emphasis-300)',
    background: 'var(--ifm-background-surface-color)',
    color: 'var(--ifm-font-color-base)',
  },
  success: { borderColor: '#38a169' },
  info: { borderColor: 'var(--ifm-color-primary)' },
  error: { borderColor: '#e53e3e' },
  icon: { flexShrink: 0, lineHeight: 1.5 },
  message: { flex: 1, wordBreak: 'break-word' },
  close: {
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--ifm-color-emphasis-500)',
    fontSize: 12,
    lineHeight: 1.5,
    padding: 0,
  },
};
