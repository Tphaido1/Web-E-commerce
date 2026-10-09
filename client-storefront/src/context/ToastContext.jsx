import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createToastStore } from '../services/toastStore.js';
import { getAuthSession, subscribeAuthSession } from '../services/authSession.js';
import '../components/Toast/Toast.css';

const ToastContext = createContext(null);
const labels = { success: 'Thành công', error: 'Có lỗi', info: 'Thông tin' };

export function ToastProvider({ children }) {
  const storeRef = useRef(null);
  if (!storeRef.current) storeRef.current = createToastStore();
  const store = storeRef.current;
  const [toasts, setToasts] = useState([]);
  useEffect(() => store.subscribe(setToasts), [store]);
  useEffect(() => () => store.clear(), [store]);
  useEffect(() => {
    let sessionId = getAuthSession()?.sessionId;
    return subscribeAuthSession((session) => {
      if (sessionId !== session?.sessionId) store.clear();
      sessionId = session?.sessionId;
    });
  }, [store]);

  return (
    <ToastContext.Provider value={store}>
      {children}
      <div className="toast-viewport" aria-label="Thông báo">
        {toasts.map((toast) => (
          <div key={toast.id} className={`storefront-toast storefront-toast-${toast.type}`}
            onMouseEnter={() => store.pause(toast.id, 'hover')}
            onMouseLeave={() => store.resume(toast.id, 'hover')}
            onFocusCapture={() => store.pause(toast.id, 'focus')}
            onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) store.resume(toast.id, 'focus'); }}>
            <div role={toast.type === 'error' ? 'alert' : 'status'} aria-atomic="true">
              <strong>{labels[toast.type]}</strong><p>{toast.message}</p>
            </div>
            <button type="button" onClick={() => store.dismiss(toast.id)} aria-label={`Đóng thông báo: ${toast.message}`}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside ToastProvider.');
  return toast;
}
