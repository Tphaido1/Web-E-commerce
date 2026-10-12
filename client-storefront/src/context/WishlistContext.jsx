import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getAuthSession, subscribeAuthSession } from '../services/authSession.js';
import { getWishlist, toggleWishlist as apiToggleWishlist } from '../services/userService.js';

const WishlistContext = createContext(null);
const GUEST_STORAGE_KEY = 'novafashion_guest_wishlist';

function loadGuestWishlist() {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGuestWishlist(items) {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Unable to save guest wishlist:', err);
  }
}

export function WishlistProvider({ children }) {
  const [session, setSession] = useState(getAuthSession);
  const [wishlistIds, setWishlistIds] = useState(() => {
    const currentSession = getAuthSession();
    if (currentSession?.user?.wishlist && Array.isArray(currentSession.user.wishlist)) {
      return currentSession.user.wishlist.map(String);
    }
    return loadGuestWishlist().map((item) => String(item._id || item.id || item));
  });
  const [wishlistProducts, setWishlistProducts] = useState(() => {
    return loadGuestWishlist().filter((item) => typeof item === 'object' && item !== null);
  });
  const [loading, setLoading] = useState(false);

  // Lắng nghe thay đổi trạng thái đăng nhập
  useEffect(() => {
    const unsubscribe = subscribeAuthSession((nextSession) => {
      setSession(nextSession);
    });
    return unsubscribe;
  }, []);

  // Nạp danh sách yêu thích khi đăng nhập hoặc khởi tạo
  const refreshWishlist = useCallback(async () => {
    if (session) {
      setLoading(true);
      try {
        const data = await getWishlist();
        const prods = data?.products || [];
        setWishlistProducts(prods);
        setWishlistIds(prods.map((p) => String(p._id || p.id)));
      } catch (err) {
        console.warn('Failed to load server wishlist:', err);
      } finally {
        setLoading(false);
      }
    } else {
      const guestItems = loadGuestWishlist();
      setWishlistProducts(guestItems.filter((i) => typeof i === 'object' && i !== null));
      setWishlistIds(guestItems.map((i) => String(i._id || i.id || i)));
    }
  }, [session]);

  useEffect(() => {
    refreshWishlist();
  }, [refreshWishlist]);

  const isWishlisted = useCallback((productId) => {
    if (!productId) return false;
    const targetId = String(productId);
    return wishlistIds.includes(targetId);
  }, [wishlistIds]);

  const toggleWishlistItem = useCallback(async (product) => {
    if (!product) return false;
    const productId = String(product._id || product.id || product);
    const currentlyLiked = wishlistIds.includes(productId);

    // Optimistic UI update
    if (currentlyLiked) {
      setWishlistIds((prev) => prev.filter((id) => id !== productId));
      setWishlistProducts((prev) => prev.filter((p) => String(p._id || p.id) !== productId));
    } else {
      setWishlistIds((prev) => [...prev, productId]);
      if (typeof product === 'object') {
        setWishlistProducts((prev) => [product, ...prev]);
      }
    }

    if (session) {
      try {
        const res = await apiToggleWishlist(productId);
        if (res?.wishlist) {
          setWishlistIds(res.wishlist.map(String));
        }
        return !currentlyLiked;
      } catch (err) {
        console.warn('Error syncing wishlist with backend:', err);
        // Revert optimistic update on failure
        refreshWishlist();
        return currentlyLiked;
      }
    } else {
      // Guest mode trong localStorage
      const guestItems = loadGuestWishlist();
      let updatedGuestItems;
      if (currentlyLiked) {
        updatedGuestItems = guestItems.filter((item) => String(item._id || item.id || item) !== productId);
      } else {
        updatedGuestItems = [product, ...guestItems];
      }
      saveGuestWishlist(updatedGuestItems);
      return !currentlyLiked;
    }
  }, [session, wishlistIds, refreshWishlist]);

  const value = {
    wishlistIds,
    wishlistProducts,
    wishlistCount: wishlistIds.length,
    loading,
    isWishlisted,
    toggleWishlist: toggleWishlistItem,
    refreshWishlist,
  };

  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
}
