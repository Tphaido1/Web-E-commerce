import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PRODUCT_PLACEHOLDER_IMAGE } from '../utils/currency.js';

const CartContext = createContext(null);
const CART_STORAGE_KEY = 'storefront_cart';

function getItemId(product) {
  return String(product.id || product._id || product.name);
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const storedItems = localStorage.getItem(CART_STORAGE_KEY);
      return storedItems ? JSON.parse(storedItems) : [];
    } catch {
      return [];
    }
  });
  const [error, setError] = useState('');

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (product) => {
    const id = getItemId(product);
    setItems((current) => {
      const existing = current.find((item) => item.id === id);
      if (existing) return current.map((item) => item.id === id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, {
        id,
        name: product.name || product.title || 'Sản phẩm',
        price: Number(product.price ?? product.salePrice ?? 0),
        image: product.image || product.images?.[0] || PRODUCT_PLACEHOLDER_IMAGE,
        category: product.category?.name || product.category || '',
        quantity: 1,
      }];
    });
    setError('');
  };

  const updateQuantity = (id, nextQuantity) => {
    if (nextQuantity < 1) return;
    setItems((current) => current.map((item) => item.id === id ? { ...item, quantity: nextQuantity } : item));
    setError('');
  };

  const removeItem = (id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setError('');
  };

  const value = useMemo(() => ({
    items,
    error,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.price * item.quantity, 0),
    addItem,
    updateQuantity,
    removeItem,
    setError,
  }), [items, error]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}