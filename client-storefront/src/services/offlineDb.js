/**
 * offlineDb.js
 * ------------------------------------------------------------------
 * Module quản lý IndexedDB cục bộ cho Storefront PWA (Dexie / Native IndexedDB)
 * Chịu trách nhiệm lưu trữ:
 *  1. cachedProducts: Lưu sản phẩm đã xem để hiển thị khi offline
 *  2. offlineCart: Lưu giỏ hàng tạm thời khi mất kết nối mạng
 *  3. offlineOrdersQueue: Hàng đợi lưu các đơn hàng chờ đồng bộ lên server
 * ------------------------------------------------------------------
 */

const DB_NAME = 'ecommerce_pwa_db';
const DB_VERSION = 1;

const openDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB không được hỗ trợ trên môi trường này'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('cachedProducts')) {
        db.createObjectStore('cachedProducts', { keyPath: '_id' });
      }

      if (!db.objectStoreNames.contains('offlineCart')) {
        db.createObjectStore('offlineCart', { keyPath: 'sku' });
      }

      if (!db.objectStoreNames.contains('offlineOrdersQueue')) {
        db.createObjectStore('offlineOrdersQueue', { keyPath: 'clientOrderId' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

// ==================== 1. QUẢN LÝ CACHE SẢN PHẨM ====================
export const cacheProducts = async (products) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cachedProducts', 'readwrite');
    const store = tx.objectStore('cachedProducts');
    products.forEach((p) => store.put(p));
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
};

export const getCachedProducts = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cachedProducts', 'readonly');
    const store = tx.objectStore('cachedProducts');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
};

// ==================== 2. QUẢN LÝ GIỎ HÀNG OFFLINE ====================
export const saveOfflineCartItem = async (item) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineCart', 'readwrite');
    const store = tx.objectStore('offlineCart');
    store.put(item);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
};

export const getOfflineCart = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineCart', 'readonly');
    const store = tx.objectStore('offlineCart');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const clearOfflineCart = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineCart', 'readwrite');
    const store = tx.objectStore('offlineCart');
    store.clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
};

// ==================== 3. QUẢN LÝ HÀNG ĐỢI ĐƠN HÀNG OFFLINE ====================
export const enqueueOfflineOrder = async (orderData) => {
  const db = await openDB();
  const clientOrderId = orderData.clientOrderId || `offline-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const orderRecord = {
    ...orderData,
    clientOrderId,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineOrdersQueue', 'readwrite');
    const store = tx.objectStore('offlineOrdersQueue');
    store.put(orderRecord);
    tx.oncomplete = () => resolve(orderRecord);
    tx.onerror = (e) => reject(e.target.error);
  });
};

export const getOfflineOrdersQueue = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineOrdersQueue', 'readonly');
    const store = tx.objectStore('offlineOrdersQueue');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const removeOfflineOrderFromQueue = async (clientOrderId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineOrdersQueue', 'readwrite');
    const store = tx.objectStore('offlineOrdersQueue');
    store.delete(clientOrderId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
};
