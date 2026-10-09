import React, { useState, useEffect, useRef } from 'react';
import { getOfflineOrdersQueue, removeOfflineOrderFromQueue } from '../../services/offlineDb';
import api from '../../services/api.js';
import { useCart } from '../../context/CartContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import './OfflineBanner.css';

export const OfflineBanner = () => {
  const toast = useToast();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [orderSyncState, setOrderSyncState] = useState('idle');
  const [orderSyncError, setOrderSyncError] = useState('');
  const orderSyncInFlight = useRef(null);
  const feedbackTimer = useRef(null);
  const { syncState: cartSyncState, syncOfflineChanges, errorAnnounced } = useCart();

  useEffect(() => {
    if (orderSyncState === 'success') toast.success('Các đơn hàng ngoại tuyến đã được máy chủ xác nhận đồng bộ.', { dedupeKey: 'offline-orders-sync' });
    if (orderSyncState === 'error' && orderSyncError) toast.error(orderSyncError, { dedupeKey: `offline-orders-sync-error:${orderSyncError}` });
  }, [orderSyncState, orderSyncError, toast]);

  useEffect(() => {
    const synchronizeOrders = async () => {
      if (orderSyncInFlight.current) return orderSyncInFlight.current;
      const syncTask = (async () => {
        const pendingOrders = await getOfflineOrdersQueue();
        if (pendingOrders.length === 0) {
          setOrderSyncState('idle');
          return;
        }
        setOrderSyncState('syncing');
        setOrderSyncError('');
        const response = await api.post('/sync/offline-orders', { orders: pendingOrders });
        const result = response.data?.data;
        const confirmedOrders = Array.isArray(result?.syncedOrders) ? result.syncedOrders : [];
        for (const synced of confirmedOrders) {
          await removeOfflineOrderFromQueue(synced.clientOrderId);
        }
        if (result?.failedCount > 0 || confirmedOrders.length < pendingOrders.length) {
          setOrderSyncState('error');
          setOrderSyncError(`Đã đồng bộ ${confirmedOrders.length}/${pendingOrders.length} đơn ngoại tuyến. Các đơn thất bại vẫn được giữ lại để xử lý.`);
          return;
        }
        setOrderSyncState('success');
        clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => setOrderSyncState((state) => state === 'success' ? 'idle' : state), 4000);
      })();
      orderSyncInFlight.current = syncTask;
      try {
        await syncTask;
      } catch (error) {
        console.warn('Lỗi khi tự động đồng bộ hàng đợi đơn hàng ngoại tuyến:', error);
        setOrderSyncError(error.response?.data?.message || error.message || 'Không thể đồng bộ hàng đợi đơn hàng ngoại tuyến.');
        setOrderSyncState('error');
      } finally {
        orderSyncInFlight.current = null;
      }
    };

    const handleOnline = () => {
      setIsOffline(false);
      syncOfflineChanges();
      synchronizeOrders();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimeout(feedbackTimer.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineChanges]);

  const retrySynchronization = () => {
    if (cartSyncState === 'error' || cartSyncState === 'offline') syncOfflineChanges();
    if (orderSyncState === 'error') {
      setOrderSyncState('syncing');
      window.dispatchEvent(new Event('online'));
    }
  };

  if (isOffline || cartSyncState === 'offline') {
    return (
      <div className="offline-banner offline-active" role="alert">
        <span className="offline-icon">📡</span>
        <span className="offline-text">
          <strong>{isOffline ? 'Bạn đang ngoại tuyến.' : 'Các thay đổi giỏ hàng đang chờ đồng bộ.'}</strong> Giỏ hàng được lưu riêng trên thiết bị này; thao tác thanh toán cần kết nối máy chủ.
        </span>
        {cartSyncState === 'offline' && !isOffline && <button type="button" onClick={retrySynchronization}>Đồng bộ lại</button>}
      </div>
    );
  }

  if (cartSyncState === 'syncing' || orderSyncState === 'syncing') {
    return (
      <div className="offline-banner syncing-active">
        <span className="sync-spinner">🔄</span>
        <span>Đã có mạng trở lại. Đang đồng bộ các thay đổi đã lưu...</span>
      </div>
    );
  }

  if (cartSyncState === 'error' || orderSyncState === 'error') {
    return (
      <div className="offline-banner sync-error" role={orderSyncState === 'error' || errorAnnounced ? undefined : 'alert'}>
        <span>{orderSyncError || 'Không thể đồng bộ giỏ hàng. Các thay đổi vẫn được giữ trên thiết bị.'}</span>
        <button type="button" onClick={retrySynchronization}>Thử đồng bộ lại</button>
      </div>
    );
  }

  if (cartSyncState === 'success' || orderSyncState === 'success') {
    return (
      <div className="offline-banner sync-success">
        <span>✅ Các thay đổi đã được máy chủ xác nhận đồng bộ.</span>
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
