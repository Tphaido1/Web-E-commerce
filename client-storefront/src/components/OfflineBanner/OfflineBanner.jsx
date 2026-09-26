import React, { useState, useEffect } from 'react';
import { getOfflineOrdersQueue, removeOfflineOrderFromQueue } from '../../services/offlineDb';
import './OfflineBanner.css';

export const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [syncStatus, setSyncStatus] = useState(null); // 'syncing', 'success', 'idle'

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      setSyncStatus('syncing');

      // Tự động kích hoạt đồng bộ hàng đợi đơn hàng ngoại tuyến lên máy chủ
      try {
        const pendingOrders = await getOfflineOrdersQueue();
        if (pendingOrders.length > 0) {
          const token = localStorage.getItem('token');
          const response = await fetch('/api/v1/sync/offline-orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token && { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({ orders: pendingOrders }),
          });

          if (response.ok) {
            const data = await response.json();
            // Dọn dẹp các đơn đã sync thành công khỏi IndexedDB
            for (const synced of data.data.syncedOrders || []) {
              await removeOfflineOrderFromQueue(synced.clientOrderId);
            }
          }
        }
        setSyncStatus('success');
        setTimeout(() => setSyncStatus(null), 4000);
      } catch (err) {
        console.warn('Lỗi khi tự động đồng bộ ngoại tuyến:', err);
        setSyncStatus(null);
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      setSyncStatus(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOffline) {
    return (
      <div className="offline-banner offline-active" role="alert">
        <span className="offline-icon">📡</span>
        <span className="offline-text">
          <strong>Bạn đang ngoại tuyến.</strong> Một số tính năng có thể bị giới hạn. Sản phẩm bạn xem và giỏ hàng vẫn được lưu lại an toàn trên máy.
        </span>
      </div>
    );
  }

  if (syncStatus === 'syncing') {
    return (
      <div className="offline-banner syncing-active">
        <span className="sync-spinner">🔄</span>
        <span>Đã có mạng trở lại! Đang tự động đồng bộ dữ liệu lên máy chủ...</span>
      </div>
    );
  }

  if (syncStatus === 'success') {
    return (
      <div className="offline-banner sync-success">
        <span>✅ Đã kết nối lại Internet. Dữ liệu mua sắm đã được đồng bộ thành công!</span>
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
