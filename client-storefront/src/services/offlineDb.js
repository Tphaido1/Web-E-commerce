/**
 * offlineDb.js
 * ------------------------------------------------------------------
 * Module quản lý IndexedDB cục bộ cho Storefront PWA (Native IndexedDB)
 * Chịu trách nhiệm lưu trữ:
 *  1. cachedProducts: Lưu sản phẩm đã xem để hiển thị khi offline
 *  2. offlineCart: Lưu giỏ hàng tạm thời khi mất kết nối mạng
 *  3. offlineOrdersQueue: Hàng đợi lưu các đơn hàng chờ đồng bộ lên server
 * ------------------------------------------------------------------
 */

const DB_NAME = 'ecommerce_pwa_db';
const DB_VERSION = 3;

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

      if (!db.objectStoreNames.contains('cachedProductQueries')) {
        db.createObjectStore('cachedProductQueries', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('offlineCart')) {
        db.createObjectStore('offlineCart', { keyPath: 'sku' });
      }

      if (!db.objectStoreNames.contains('offlineCartByScope')) {
        const cartStore = db.createObjectStore('offlineCartByScope', { keyPath: 'key' });
        cartStore.createIndex('scope', 'scope', { unique: false });
      }

      if (!db.objectStoreNames.contains('offlineCartSync')) {
        db.createObjectStore('offlineCartSync', { keyPath: 'scope' });
      }

      if (!db.objectStoreNames.contains('offlineOrdersQueue')) {
        db.createObjectStore('offlineOrdersQueue', { keyPath: 'clientOrderId' });
      }

      if (event.oldVersion < 3 && db.objectStoreNames.contains('offlineCart')) {
        const legacyRequest = event.target.transaction.objectStore('offlineCart').getAll();
        legacyRequest.onsuccess = () => {
          const cartStore = event.target.transaction.objectStore('offlineCartByScope');
          for (const item of legacyRequest.result || []) {
            const identity = String(item.sku || item.variantId || item.id || item.productId || '');
            if (!identity) continue;
            cartStore.put({
              ...item,
              scope: 'guest',
              key: `guest:${identity.toUpperCase()}`,
            });
          }
        };
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

export const cacheProductQuery = async (key, data) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cachedProductQueries', 'readwrite');
    tx.objectStore('cachedProductQueries').put({
      key,
      data,
      cachedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error || new Error('Không thể lưu dữ liệu sản phẩm ngoại tuyến.'));
  });
};

export const getCachedProductQuery = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cachedProductQueries', 'readonly');
    const request = tx.objectStore('cachedProductQueries').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (event) => reject(event.target.error);
  });
};

// ==================== 2. QUẢN LÝ GIỎ HÀNG OFFLINE ====================
export const saveOfflineCartItem = async (item, scope = 'guest') => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineCartByScope', 'readwrite');
    const identity = String(item.sku || item.variantId || item.id || item.productId || '');
    if (!identity) {
      reject(new Error('Không thể lưu món hàng ngoại tuyến khi thiếu SKU hoặc định danh biến thể.'));
      return;
    }
    tx.objectStore('offlineCartByScope').put({
      ...item,
      scope,
      key: `${scope}:${identity.toUpperCase()}`,
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = (e) => reject(e.target.error || new Error('Không thể lưu giỏ hàng ngoại tuyến.'));
  });
};

export const getOfflineCart = async (scope = 'guest') => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineCartByScope', 'readonly');
    const store = tx.objectStore('offlineCartByScope');
    const req = store.index('scope').getAll(scope);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
};

export const saveOfflineCartSnapshot = async (scope, items, syncState = null) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['offlineCartByScope', 'offlineCartSync'], 'readwrite');
    const store = tx.objectStore('offlineCartByScope');
    const allRequest = store.getAll();
    allRequest.onsuccess = () => {
      store.clear();
      for (const item of allRequest.result || []) {
        if (item.scope !== scope) store.put(item);
      }
      for (const item of items) {
        const identity = String(item.sku || item.variantId || item.id || item.productId || '');
        if (!identity) continue;
        store.put({
          ...item,
          scope,
          key: `${scope}:${identity.toUpperCase()}`,
        });
      }
      if (syncState) tx.objectStore('offlineCartSync').put({ ...syncState, scope });
    };
    allRequest.onerror = (event) => reject(event.target.error);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = (e) => reject(e.target.error || new Error('Không thể lưu giỏ hàng ngoại tuyến.'));
  });
};

export const getOfflineCartSyncState = async (scope) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineCartSync', 'readonly');
    const request = tx.objectStore('offlineCartSync').get(scope);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (event) => reject(event.target.error);
  });
};

export const saveOfflineCartSyncState = async (scope, syncState) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offlineCartSync', 'readwrite');
    tx.objectStore('offlineCartSync').put({ ...syncState, scope });
    tx.oncomplete = () => resolve(true);
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error || new Error('Không thể lưu trạng thái đồng bộ giỏ hàng.'));
  });
};

export const clearOfflineCart = async (scope = 'guest') => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['offlineCartByScope', 'offlineCartSync'], 'readwrite');
    const store = tx.objectStore('offlineCartByScope');
    const request = store.index('scope').openCursor(scope);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    tx.objectStore('offlineCartSync').delete(scope);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = (e) => reject(e.target.error || new Error('Không thể xóa giỏ hàng ngoại tuyến.'));
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
