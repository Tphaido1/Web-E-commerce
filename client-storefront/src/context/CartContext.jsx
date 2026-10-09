import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAuthSession, subscribeAuthSession } from '../services/authSession.js';
import {
  addCartItem,
  clearCart as clearRemoteCart,
  getCart,
  mergeGuestCart,
  normalizeCart,
  removeCartItem as removeRemoteCartItem,
  updateCartItem as updateRemoteCartItem,
} from '../services/cartService.js';
import {
  clearOfflineCart,
  getOfflineCart,
  getOfflineCartSyncState,
  saveOfflineCartSnapshot,
} from '../services/offlineDb.js';
import { PRODUCT_PLACEHOLDER_IMAGE, resolveProductPrice } from '../utils/currency.js';
import { useToast } from './ToastContext.jsx';

const CartContext = createContext(null);
const CART_STORAGE_KEY = 'storefront_cart';
const CART_MERGE_ATTEMPT_KEY = 'storefront_cart_merge_attempt';
const mergeRequests = new Map();

function readGuestCart() {
  try {
    const storedItems = localStorage.getItem(CART_STORAGE_KEY);
    const items = storedItems ? JSON.parse(storedItems) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function getProductId(product) {
  return String(product.id || product._id || '');
}

function getItemId(product, variant) {
  const productId = getProductId(product) || String(product.name || 'product');
  if (!variant) return productId;
  const variantId = variant._id || variant.sku || `${variant.color || ''}:${variant.size || ''}`;
  return `${productId}:${variantId}`;
}

function sameCartItem(item, candidate) {
  if (item.sku && candidate.sku) return item.sku.toUpperCase() === candidate.sku.toUpperCase();
  return item.productId === candidate.productId && item.id === candidate.id;
}

function mergeCartMetadata(serverItems, previousItems) {
  return serverItems.map((item) => {
    const previous = previousItems.find((candidate) => sameCartItem(candidate, item));
    if (!previous) return item;
    return {
      ...previous,
      ...item,
      color: item.color || previous.color || '',
      size: item.size || previous.size || '',
      stock: item.stock ?? previous.stock,
      category: item.category || previous.category || '',
      image: item.image || previous.image || PRODUCT_PLACEHOLDER_IMAGE,
    };
  });
}

function getApiErrorMessage(error, fallback) {
  return error.response?.data?.message || error.message || fallback;
}

function readUserId() {
  const id = getAuthSession()?.user?.id || getAuthSession()?.user?._id;
  return id ? String(id) : '';
}

function getCartScope(userId) {
  return userId ? `account:${userId}` : 'guest';
}

function getQuantityMap(cartItems) {
  const quantities = new Map();
  for (const item of cartItems) {
    const sku = String(item.sku || '').trim().toUpperCase();
    if (!sku) throw new Error('Một món hàng ngoại tuyến thiếu SKU và chưa thể đồng bộ.');
    quantities.set(sku, item.quantity);
  }
  return quantities;
}

function hasDesiredQuantities(actualItems, desiredItems, baselineItems) {
  const actual = getQuantityMap(actualItems);
  const desired = getQuantityMap(desiredItems);
  const baseline = getQuantityMap(baselineItems);
  const skus = new Set([...desired.keys(), ...baseline.keys()]);
  return [...skus].every((sku) => (actual.get(sku) || 0) === (desired.get(sku) || 0));
}

export function CartProvider({ children }) {
  const toast = useToast();
  const initialUserId = readUserId();
  const [accountId, setAccountId] = useState(initialUserId);
  const [accountSessionId, setAccountSessionId] = useState(() => getAuthSession()?.sessionId || '');
  const sessionIdRef = useRef(accountSessionId);
  const accountEpochRef = useRef(0);
  const [pendingMutations, setPendingMutations] = useState(0);
  const accountIdRef = useRef(initialUserId);
  const [items, setItems] = useState(() => initialUserId ? [] : readGuestCart());
  const itemsRef = useRef(items);
  const serverItemsRef = useRef([]);
  const mutationQueueRef = useRef(Promise.resolve());
  const [error, setErrorState] = useState('');
  const [errorAnnounced, setErrorAnnounced] = useState(false);
  const setError = useCallback((message, { announced = false } = {}) => {
    setErrorState(message);
    setErrorAnnounced(announced && Boolean(message));
  }, []);
  const [status, setStatus] = useState(initialUserId ? 'loading' : 'ready');
  const [syncState, setSyncState] = useState('idle');
  const [reloadCount, setReloadCount] = useState(0);
  const syncInFlightRef = useRef(null);
  const syncFeedbackTimerRef = useRef(null);
  const guestCartReadyRef = useRef(Boolean(initialUserId));
  const guestCartVersionRef = useRef(0);

  const replaceItems = useCallback((nextItems) => {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  const syncOfflineChanges = useCallback(async () => {
    const userId = accountIdRef.current;
    if (!userId || !navigator.onLine) return false;
    const sessionId = sessionIdRef.current;
    const isCurrentSession = () => accountIdRef.current === userId && sessionIdRef.current === sessionId;
    if (syncInFlightRef.current) return syncInFlightRef.current;

    const task = (async () => {
      await mutationQueueRef.current;
      if (!isCurrentSession()) return false;
      const scope = getCartScope(userId);
      const syncRecord = await getOfflineCartSyncState(scope);
      if (!isCurrentSession()) return false;
      setSyncState('syncing');
      if (!syncRecord?.pending) {
        setSyncState('idle');
        return false;
      }
      setError('');
      const desiredItems = await getOfflineCart(scope);
      const baselineItems = syncRecord.baseItems || [];
      if (!isCurrentSession()) return false;
      let currentItems = normalizeCart(await getCart({ sessionId }));
      if (!isCurrentSession()) return false;
      const baseline = getQuantityMap(baselineItems);
      const desired = getQuantityMap(desiredItems);
      const current = getQuantityMap(currentItems);
      const skus = new Set([...baseline.keys(), ...desired.keys()]);
      const changedSkus = [...skus].filter((sku) => (baseline.get(sku) || 0) !== (desired.get(sku) || 0));

      for (const sku of changedSkus) {
        const actualQuantity = current.get(sku) || 0;
        const baseQuantity = baseline.get(sku) || 0;
        const desiredQuantity = desired.get(sku) || 0;
        if (actualQuantity !== baseQuantity && actualQuantity !== desiredQuantity) {
          throw new Error(`Giỏ hàng trên máy chủ đã thay đổi cho SKU ${sku}. Giữ nguyên các thay đổi ngoại tuyến để tránh ghi đè.`);
        }
      }

      const additions = changedSkus
        .filter((sku) => (desired.get(sku) || 0) > (baseline.get(sku) || 0)
          && (current.get(sku) || 0) === (baseline.get(sku) || 0))
        .map((sku) => {
          const item = desiredItems.find((candidate) => candidate.sku?.toUpperCase() === sku);
          return { ...item, quantity: (desired.get(sku) || 0) - (baseline.get(sku) || 0) };
        });

      if (additions.length) {
        try {
          if (!isCurrentSession()) return false;
          currentItems = normalizeCart(await mergeGuestCart(additions, { sessionId }));
          if (!isCurrentSession()) return false;
        } catch (mergeError) {
          if (!isCurrentSession()) return false;
          const latestItems = normalizeCart(await getCart({ sessionId }));
          if (!isCurrentSession()) return false;
          const attemptedSkus = additions.map((item) => item.sku.toUpperCase());
          const applied = attemptedSkus.every((sku) => {
            const latest = latestItems.find((item) => item.sku.toUpperCase() === sku);
            return (latest?.quantity || 0) === (desired.get(sku) || 0);
          });
          const unchanged = attemptedSkus.every((sku) => {
            const latest = latestItems.find((item) => item.sku.toUpperCase() === sku);
            return (latest?.quantity || 0) === (baseline.get(sku) || 0);
          });
          if (applied) currentItems = latestItems;
          else if (unchanged) throw mergeError;
          else throw new Error('Đồng bộ giỏ hàng có thể đã hoàn tất một phần. Giữ nguyên dữ liệu và kiểm tra lại giỏ hàng trên máy chủ trước khi thử tiếp.');
        }
      }

      for (const sku of changedSkus) {
        if (!isCurrentSession()) return false;
        const desiredQuantity = desired.get(sku) || 0;
        const currentItem = currentItems.find((item) => item.sku.toUpperCase() === sku);
        if ((currentItem?.quantity || 0) === desiredQuantity) continue;
        if (desiredQuantity === 0) {
          if (currentItem) currentItems = normalizeCart(await removeRemoteCartItem(currentItem.id, { sessionId }));
        } else if (currentItem) {
          currentItems = normalizeCart(await updateRemoteCartItem(currentItem.id, desiredQuantity, { sessionId }));
        } else {
          throw new Error(`Không thể khôi phục SKU ${sku} vào giỏ hàng máy chủ.`);
        }
      }

      if (!isCurrentSession()) return false;
      const confirmedItems = normalizeCart(await getCart({ sessionId }));
      if (!hasDesiredQuantities(confirmedItems, desiredItems, baselineItems)) {
        throw new Error('Giỏ hàng trên máy chủ chưa khớp với các thay đổi ngoại tuyến. Các thay đổi vẫn được giữ trên thiết bị.');
      }
      if (!isCurrentSession()) return false;
      await saveOfflineCartSnapshot(scope, confirmedItems, {
        baseItems: confirmedItems,
        pending: false,
        updatedAt: new Date().toISOString(),
      });
      if (!isCurrentSession()) return false;
      serverItemsRef.current = mergeCartMetadata(confirmedItems, desiredItems);
      replaceItems(serverItemsRef.current);
      setStatus('ready');
      setSyncState('success');
      toast.success('Các thay đổi giỏ hàng đã được máy chủ xác nhận đồng bộ.', { dedupeKey: `cart-sync:${sessionId}` });
      clearTimeout(syncFeedbackTimerRef.current);
      syncFeedbackTimerRef.current = setTimeout(() => {
        if (isCurrentSession()) setSyncState((currentState) => currentState === 'success' ? 'idle' : currentState);
      }, 4000);
      return true;
    })();

    syncInFlightRef.current = task;
    try {
      return await task;
    } catch (syncError) {
      if (!isCurrentSession()) return false;
      setSyncState('error');
      const message = syncError.response?.status === 401 || syncError.response?.status === 403
        ? 'Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại vào đúng tài khoản để khôi phục và đồng bộ giỏ hàng đã lưu.'
        : getApiErrorMessage(syncError, 'Không thể đồng bộ giỏ hàng ngoại tuyến. Các thay đổi vẫn được giữ trên thiết bị.');
      setError(message, { announced: true });
      toast.error(message, { dedupeKey: `cart-sync-error:${sessionId}:${message}` });
      return false;
    } finally {
      if (syncInFlightRef.current === task) syncInFlightRef.current = null;
    }
  }, [replaceItems, toast]);

  useEffect(() => () => clearTimeout(syncFeedbackTimerRef.current), []);

  useEffect(() => {
    const unsubscribe = subscribeAuthSession((session) => {
      const nextAccountId = String(session?.user?.id || session?.user?._id || '');
      const nextSessionId = session?.sessionId || '';
      if (accountIdRef.current === nextAccountId && sessionIdRef.current === nextSessionId) return;
      accountEpochRef.current += 1;
      clearTimeout(syncFeedbackTimerRef.current);
      sessionIdRef.current = nextSessionId;
      syncInFlightRef.current = null;
      setAccountSessionId(nextSessionId);
      accountIdRef.current = nextAccountId;
      guestCartReadyRef.current = Boolean(nextAccountId);
      serverItemsRef.current = [];
      setAccountId(nextAccountId);
      setError('');
      setSyncState('idle');
      setStatus(nextAccountId ? 'loading' : 'ready');
      replaceItems(nextAccountId ? [] : readGuestCart());
    });
    return unsubscribe;
  }, [replaceItems]);

  useEffect(() => {
    if (accountId) return;
    if (!guestCartReadyRef.current) return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    saveOfflineCartSnapshot('guest', items, {
      baseItems: [],
      pending: false,
      updatedAt: new Date().toISOString(),
    }).catch((storageError) => {
      setError(getApiErrorMessage(storageError, 'Không thể lưu giỏ hàng trên thiết bị này.'));
    });
  }, [accountId, items]);

  useEffect(() => {
    if (accountId) return undefined;
    let isCurrent = true;
    const initialVersion = guestCartVersionRef.current;
    getOfflineCart('guest').then((savedItems) => {
      if (!isCurrent) return;
      const current = readGuestCart();
      if (guestCartVersionRef.current === initialVersion && savedItems.length) {
        const savedFingerprint = JSON.stringify(savedItems.map((item) => [item.sku, item.quantity]));
        const currentFingerprint = JSON.stringify(current.map((item) => [item.sku, item.quantity]));
        if (savedFingerprint !== currentFingerprint) {
          replaceItems(savedItems);
          localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(savedItems));
        }
      }
      guestCartReadyRef.current = true;
      if (guestCartVersionRef.current === initialVersion && !savedItems.length) {
        saveOfflineCartSnapshot('guest', current, {
          baseItems: [],
          pending: false,
          updatedAt: new Date().toISOString(),
        }).catch((storageError) => {
          setError(getApiErrorMessage(storageError, 'Không thể lưu giỏ hàng trên thiết bị này.'));
        });
      }
    }).catch((storageError) => {
      if (isCurrent) setError(getApiErrorMessage(storageError, 'Không thể khôi phục giỏ hàng đã lưu trên thiết bị.'));
    });
    return () => { isCurrent = false; };
  }, [accountId, replaceItems]);

  useEffect(() => {
    if (!accountId) return undefined;
    const controller = new AbortController();
    const sessionId = accountSessionId;
    let isCurrent = true;
    const isCurrentAccount = () => isCurrent && accountIdRef.current === accountId && sessionIdRef.current === sessionId;

    async function loadAccountCart() {
      setStatus('loading');
      setError('');
      const scope = getCartScope(accountId);
      let savedItems = [];
      let savedSyncState = null;
      try {
        await mutationQueueRef.current;
        if (!isCurrentAccount()) return;
        [savedItems, savedSyncState] = await Promise.all([
          getOfflineCart(scope),
          getOfflineCartSyncState(scope),
        ]);
        if (!isCurrentAccount()) return;
        const cart = await getCart({ signal: controller.signal, sessionId });
        if (!isCurrentAccount()) return;
        let accountItems = normalizeCart(cart);
        serverItemsRef.current = accountItems;

        // Reconcile account changes first; guest quantities must not alter that baseline.
        if (savedSyncState?.pending) {
          replaceItems(savedItems);
          setStatus('offline');
          setSyncState('offline');
          const synced = await syncOfflineChanges();
          if (synced && isCurrentAccount()) setReloadCount((count) => count + 1);
          return;
        }

        const storedGuestItems = await getOfflineCart('guest');
        if (!isCurrentAccount()) return;
        const guestItems = storedGuestItems.length ? storedGuestItems : readGuestCart();
        if (guestItems.length) {
          if (guestItems.some((item) => !item.productId || !item.sku)) {
            setError('Một số món trong giỏ khách chưa có mã SKU và chưa thể đồng bộ. Giỏ khách được giữ nguyên.');
          } else {
            const fingerprint = JSON.stringify(guestItems.map((item) => [item.productId, item.sku, item.quantity]));
            let previousAttempt = null;
            try {
              previousAttempt = JSON.parse(localStorage.getItem(CART_MERGE_ATTEMPT_KEY) || 'null');
            } catch {
              localStorage.removeItem(CART_MERGE_ATTEMPT_KEY);
            }
            const requestKey = `${sessionId}:${fingerprint}`;
            let mergeRequest = mergeRequests.get(requestKey);
            if (previousAttempt && !mergeRequest) {
              setError('Không thể xác nhận lần đồng bộ giỏ khách trước đó. Giỏ khách được giữ nguyên để tránh thêm trùng; vui lòng kiểm tra giỏ tài khoản.');
              replaceItems(accountItems);
              setStatus('ready');
              return;
            }
            if (!mergeRequest) {
              localStorage.setItem(CART_MERGE_ATTEMPT_KEY, JSON.stringify({ accountId, sessionId, fingerprint }));
              // Confirmation belongs to the request, so an effect reload can join it.
              mergeRequest = (async () => {
                const mergedCart = await mergeGuestCart(guestItems, { sessionId });
                if (sessionIdRef.current !== sessionId) return mergedCart;
                const persistedGuestItems = await getOfflineCart('guest');
                if (sessionIdRef.current !== sessionId) return mergedCart;
                const currentGuestItems = persistedGuestItems.length ? persistedGuestItems : readGuestCart();
                const currentFingerprint = JSON.stringify(currentGuestItems.map((item) => [item.productId, item.sku, item.quantity]));
                if (currentFingerprint === fingerprint) {
                  await clearOfflineCart('guest');
                  if (sessionIdRef.current === sessionId) {
                    localStorage.removeItem(CART_STORAGE_KEY);
                    localStorage.removeItem(CART_MERGE_ATTEMPT_KEY);
                  }
                }
                return mergedCart;
              })().catch((mergeError) => {
                if (sessionIdRef.current === sessionId && mergeError.response && mergeError.response.status < 500) {
                  localStorage.removeItem(CART_MERGE_ATTEMPT_KEY);
                }
                throw mergeError;
              }).finally(() => {
                if (mergeRequests.get(requestKey) === mergeRequest) mergeRequests.delete(requestKey);
              });
              mergeRequests.set(requestKey, mergeRequest);
            }
            try {
              const mergedCart = await mergeRequest;
              if (!isCurrentAccount()) return;
              accountItems = normalizeCart(mergedCart);
              serverItemsRef.current = accountItems;
            } catch (mergeError) {
              if (!isCurrentAccount()) return;
              setError(getApiErrorMessage(mergeError, 'Không thể đồng bộ giỏ khách. Giỏ khách được giữ nguyên.'));
            }

          }
        }

        if (!isCurrentAccount()) return;
        replaceItems(mergeCartMetadata(accountItems, guestItems));
        await saveOfflineCartSnapshot(scope, serverItemsRef.current, {
          baseItems: serverItemsRef.current,
          pending: false,
          updatedAt: new Date().toISOString(),
        });
        if (isCurrentAccount()) setStatus('ready');
      } catch (loadError) {
        if (!isCurrentAccount() || loadError.name === 'CanceledError') return;
        try {
          savedItems = savedItems.length ? savedItems : await getOfflineCart(scope);
          savedSyncState = savedSyncState || await getOfflineCartSyncState(scope);
        } catch (storageError) {
          setError(`${getApiErrorMessage(loadError, 'Không thể tải giỏ hàng.')}. ${getApiErrorMessage(storageError, 'Không thể đọc bản sao ngoại tuyến.')}`);
          setStatus('error');
          return;
        }
        if (!isCurrentAccount()) return;
        if (savedItems.length || savedSyncState?.pending) {
          replaceItems(savedItems);
          serverItemsRef.current = savedSyncState?.baseItems || savedItems;
          setError('');
          setStatus('offline');
          setSyncState(savedSyncState?.pending ? 'offline' : 'idle');
        } else {
          setError(getApiErrorMessage(loadError, 'Không thể tải giỏ hàng.'));
          setStatus('error');
        }
      }
    }

    loadAccountCart();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [accountId, accountSessionId, reloadCount, replaceItems, syncOfflineChanges]);

  useEffect(() => {
    if (!accountId) return undefined;
    const handleOnline = () => {
      setReloadCount((current) => current + 1);
    };
    const handleOffline = () => {
      setSyncState((currentState) => currentState === 'idle' ? 'offline' : currentState);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [accountId, syncOfflineChanges]);

  const runAccountMutation = useCallback((transform, request, onError = () => {}) => {
    const reportError = (message) => { setError(message, { announced: true }); onError(message); };
    const mutationAccountId = accountIdRef.current;
    const mutationSessionId = sessionIdRef.current;
    const isCurrentMutation = () => accountIdRef.current === mutationAccountId && sessionIdRef.current === mutationSessionId;
    if (
      !mutationAccountId
      || !['ready', 'offline'].includes(status)
      || syncState === 'syncing'
      || syncInFlightRef.current
      || (syncState === 'error' && navigator.onLine)
    ) {
      reportError('Giỏ hàng đang tải hoặc chưa sẵn sàng. Vui lòng thử lại.');
      return Promise.resolve(false);
    }

    setPendingMutations((count) => count + 1);
    const task = mutationQueueRef.current.then(async () => {
      if (!isCurrentMutation()) return false;
      const before = itemsRef.current;
      const baselineItems = serverItemsRef.current;
      let optimistic;
      try {
        optimistic = transform(before);
      } catch (validationError) {
        reportError(validationError.message);
        return false;
      }
      setError('');
      const scope = getCartScope(mutationAccountId);
      const persistPending = async () => {
        const previousSyncState = await getOfflineCartSyncState(scope);
        if (!isCurrentMutation()) return false;
        await saveOfflineCartSnapshot(scope, optimistic, {
          baseItems: previousSyncState?.pending ? previousSyncState.baseItems : baselineItems,
          pending: true,
          updatedAt: new Date().toISOString(),
        });
        if (!isCurrentMutation()) return false;
        replaceItems(optimistic);
        setStatus('offline');
        setSyncState('offline');
        return true;
      };

      let existingSyncState;
      try {
        existingSyncState = await getOfflineCartSyncState(scope);
      } catch (storageError) {
        if (isCurrentMutation()) reportError(getApiErrorMessage(storageError, 'Không thể đọc giỏ hàng ngoại tuyến.'));
        return false;
      }
      if (!isCurrentMutation()) return false;
      if (!navigator.onLine || existingSyncState?.pending) {
        try {
          return await persistPending();
        } catch (storageError) {
          if (isCurrentMutation()) reportError(getApiErrorMessage(storageError, 'Không thể lưu thay đổi giỏ hàng ngoại tuyến.'));
          return false;
        }
      }

      replaceItems(optimistic);
      let cart;
      try {
        cart = await request(mutationSessionId, before);
      } catch (mutationError) {
        if (mutationError.isAxiosError && !mutationError.response && mutationError.code !== 'ERR_CANCELED' && isCurrentMutation()) {
          try {
            return await persistPending();
          } catch (storageError) {
            if (isCurrentMutation()) reportError(getApiErrorMessage(storageError, 'Không thể lưu thay đổi giỏ hàng ngoại tuyến.'));
          }
        }
        if (isCurrentMutation()) {
          replaceItems(before);
          reportError(getApiErrorMessage(mutationError, 'Không thể cập nhật giỏ hàng.'));
        }
        return false;
      }
      if (!isCurrentMutation()) return false;
      const confirmed = mergeCartMetadata(normalizeCart(cart), optimistic);
      serverItemsRef.current = confirmed;
      replaceItems(confirmed);
      try {
        await saveOfflineCartSnapshot(scope, confirmed, {
          baseItems: confirmed,
          pending: false,
          updatedAt: new Date().toISOString(),
        });
      } catch (storageError) {
        setError(getApiErrorMessage(storageError, 'Thay đổi đã được máy chủ xác nhận nhưng không thể lưu bản sao ngoại tuyến.'));
      }
      if (!isCurrentMutation()) return false;
      setStatus('ready');
      setSyncState('idle');
      return true;
    });
    const trackedTask = task.finally(() => setPendingMutations((count) => Math.max(0, count - 1)));
    mutationQueueRef.current = trackedTask.then(() => undefined, () => undefined);
    return trackedTask;
  }, [replaceItems, status, syncState]);

  const updateGuestCart = useCallback((transform, onError = () => {}) => {
    guestCartVersionRef.current += 1;
    const epoch = accountEpochRef.current;
    setPendingMutations((count) => count + 1);
    const task = mutationQueueRef.current.then(async () => {
      if (accountIdRef.current || accountEpochRef.current !== epoch) return false;
      try {
        const nextItems = transform(itemsRef.current);
        await saveOfflineCartSnapshot('guest', nextItems, {
          baseItems: [],
          pending: false,
          updatedAt: new Date().toISOString(),
        });
        if (accountIdRef.current || accountEpochRef.current !== epoch) return false;
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextItems));
        replaceItems(nextItems);
        setError('');
        return true;
      } catch (storageError) {
        if (accountEpochRef.current === epoch) {
          const message = getApiErrorMessage(storageError, 'Không thể lưu giỏ hàng trên thiết bị này.');
          setError(message, { announced: true });
          onError(message);
        }
        return false;
      }
    });
    const trackedTask = task.finally(() => setPendingMutations((count) => Math.max(0, count - 1)));
    mutationQueueRef.current = trackedTask.then(() => undefined, () => undefined);
    return trackedTask;
  }, [replaceItems]);

  const addItem = useCallback((product, { variant = null, quantity = 1, onError = () => {} } = {}) => {
    const reportError = (message) => { setError(message, { announced: true }); onError(message); };
    const price = resolveProductPrice(product, variant);
    const stock = Number(variant?.stock ?? product.stock);
    const productId = getProductId(product);
    const sku = String(variant?.sku || product.sku || '').trim().toUpperCase();
    if (!Number.isInteger(quantity) || quantity < 1) {
      reportError('Vui lòng chọn số lượng sản phẩm hợp lệ.');
      return Promise.resolve(false);
    }
    if (!Number.isFinite(price) || !Number.isFinite(stock) || stock < 1) {
      reportError('Sản phẩm hoặc biến thể này hiện không có sẵn.');
      return Promise.resolve(false);
    }
    if (accountIdRef.current && (!productId || !sku)) {
      reportError('Sản phẩm này chưa có mã SKU được hỗ trợ để thêm vào giỏ hàng tài khoản.');
      return Promise.resolve(false);
    }

    const candidate = {
      id: getItemId(product, variant),
      productId,
      variantId: variant?._id || null,
      sku,
      color: variant?.color || '',
      size: variant?.size || '',
      name: product.name || product.title || 'Sản phẩm',
      price,
      stock,
      image: product.image || product.images?.[0] || PRODUCT_PLACEHOLDER_IMAGE,
      category: product.category?.name || product.category || '',
      quantity,
    };

    const optimistic = (current) => {
      const existing = current.find((item) => sameCartItem(item, candidate));
      if (quantity + (existing?.quantity || 0) > stock) {
        throw new Error('Chỉ còn ' + stock + ' sản phẩm có sẵn.');
      }
      return existing
        ? current.map((item) => sameCartItem(item, candidate) ? { ...item, quantity: item.quantity + quantity } : item)
        : [...current, candidate];
    };
    if (!accountIdRef.current) return updateGuestCart(optimistic, onError);

    return runAccountMutation(
      optimistic,
      (sessionId) => addCartItem({ productId, sku, quantity }, { sessionId }),
      onError,
    );
  }, [runAccountMutation, updateGuestCart]);

  const updateQuantity = useCallback((id, nextQuantity, { onError = () => {} } = {}) => {
    const reportError = (message) => { setError(message, { announced: true }); onError(message); };
    if (!Number.isInteger(nextQuantity) || nextQuantity < 1) {
      reportError('Vui lòng chọn số lượng sản phẩm hợp lệ.');
      return Promise.resolve(false);
    }
    const target = itemsRef.current.find((item) => item.id === id);
    if (!target) {
      reportError('Món hàng này không còn trong giỏ.');
      return Promise.resolve(false);
    }
    if (target.stock !== undefined && nextQuantity > target.stock) {
      reportError(`Chỉ còn ${target.stock} sản phẩm có sẵn.`);
      return Promise.resolve(false);
    }
    const transform = (current) => current.map((item) => sameCartItem(item, target) ? { ...item, quantity: nextQuantity } : item);
    if (!accountIdRef.current) {
      return updateGuestCart(transform, onError);
    }
    return runAccountMutation(transform, (sessionId, before) => {
      const currentTarget = before.find((item) => sameCartItem(item, target));
      if (!currentTarget) throw new Error('Món hàng này không còn trong giỏ.');
      return updateRemoteCartItem(currentTarget.id, nextQuantity, { sessionId });
    }, onError);
  }, [runAccountMutation, updateGuestCart]);

  const removeItem = useCallback((id, { onError = () => {} } = {}) => {
    const target = itemsRef.current.find((item) => item.id === id);
    if (!target) {
      const message = 'Món hàng này không còn trong giỏ.';
      setError(message, { announced: true });
      onError(message);
      return Promise.resolve(false);
    }
    const transform = (current) => current.filter((item) => !sameCartItem(item, target));
    if (!accountIdRef.current) {
      return updateGuestCart(transform, onError);
    }
    return runAccountMutation(transform, (sessionId, before) => {
      const currentTarget = before.find((item) => sameCartItem(item, target));
      if (!currentTarget) throw new Error('Món hàng này không còn trong giỏ.');
      return removeRemoteCartItem(currentTarget.id, { sessionId });
    }, onError);
  }, [runAccountMutation, updateGuestCart]);

  const clearCart = useCallback(({ onError = () => {} } = {}) => {
    if (!accountIdRef.current) {
      return updateGuestCart(() => [], onError);
    }
    return runAccountMutation(() => [], (sessionId) => clearRemoteCart({ sessionId }), onError);
  }, [runAccountMutation, updateGuestCart]);

  const clearCartAfterOrder = useCallback(() => {
    const currentScope = getCartScope(accountIdRef.current);
    serverItemsRef.current = [];
    replaceItems([]);
    if (currentScope === 'guest') {
      localStorage.removeItem(CART_STORAGE_KEY);
      localStorage.removeItem(CART_MERGE_ATTEMPT_KEY);
    }
    setError('');
    setStatus('ready');
    setSyncState('idle');
    saveOfflineCartSnapshot(currentScope, [], {
      baseItems: [],
      pending: false,
      updatedAt: new Date().toISOString(),
    }).catch((storageError) => {
      setError(getApiErrorMessage(storageError, 'Đơn hàng đã được xác nhận nhưng không thể xóa bản sao giỏ hàng trên thiết bị.'));
    });
  }, [replaceItems]);

  const notifyCartChange = useCallback(async (operation, message) => {
    const epoch = accountEpochRef.current;
    const sessionId = getAuthSession()?.sessionId;
    let operationError = '';
    const result = await operation((errorMessage) => { operationError = errorMessage; });
    if (epoch === accountEpochRef.current && sessionId === getAuthSession()?.sessionId) {
      if (!result) toast.error(operationError || 'Không thể cập nhật giỏ hàng. Vui lòng thử lại.');
      else if (!navigator.onLine) toast.info('Đã lưu thay đổi giỏ hàng trên thiết bị. Sẽ đồng bộ khi có mạng.', { dedupeKey: 'cart-offline-change' });
      else toast.success(message);
    }
    return result;
  }, [toast]);

  const value = useMemo(() => ({
    items,
    error,
    errorAnnounced,
    status,
    syncState,
    isAuthenticated: Boolean(accountId),
    isMutating: pendingMutations > 0,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.price * item.quantity, 0),
    addItem: (product, options) => notifyCartChange((onError) => addItem(product, { ...options, onError }), 'Đã thêm sản phẩm vào giỏ hàng.'),
    updateQuantity: (id, quantity) => notifyCartChange((onError) => updateQuantity(id, quantity, { onError }), 'Đã cập nhật số lượng trong giỏ hàng.'),
    removeItem: (id) => notifyCartChange((onError) => removeItem(id, { onError }), 'Đã xóa sản phẩm khỏi giỏ hàng.'),
    clearCart: () => notifyCartChange((onError) => clearCart({ onError }), 'Đã xóa các sản phẩm trong giỏ hàng.'),
    clearCartAfterOrder,
    syncOfflineChanges,
    reloadCart: () => setReloadCount((current) => current + 1),
    setError,
  }), [items, error, errorAnnounced, status, syncState, accountId, pendingMutations, addItem, updateQuantity, removeItem, clearCart, clearCartAfterOrder, syncOfflineChanges, notifyCartChange]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
