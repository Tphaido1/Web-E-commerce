import api from './api.js';
import { getAuthSession } from './authSession.js';

function sessionConfig(sessionId = getAuthSession()?.sessionId || null) {
  return { authSessionId: sessionId };
}
import { PRODUCT_PLACEHOLDER_IMAGE } from '../utils/currency.js';

function readCartResponse(response) {
  const cart = response.data?.data;
  if (!cart || !Array.isArray(cart.items)) {
    throw new Error('Phản hồi giỏ hàng từ máy chủ không hợp lệ.');
  }
  return cart;
}

function getProductId(product) {
  if (typeof product === 'string') return product;
  return product?._id || product?.id || '';
}

export function normalizeCart(cart) {
  return (cart?.items || []).map((item) => {
    const productId = getProductId(item.product) || item.productId || '';
    const sku = typeof item.sku === 'string' ? item.sku.trim().toUpperCase() : '';
    const variantId = item.variantId || null;
    const identity = sku || variantId || productId || item._id;
    return {
      id: String(item._id || `${productId}:${identity}`),
      productId: String(productId),
      variantId,
      sku,
      color: item.color || '',
      size: item.size || '',
      name: item.name || (typeof item.product === 'object' ? item.product.name : '') || 'Sản phẩm',
      price: Number(item.price) || 0,
      stock: Number.isFinite(Number(item.stock)) ? Number(item.stock) : undefined,
      image: item.image || item.images?.[0] || PRODUCT_PLACEHOLDER_IMAGE,
      category: item.category?.name || item.category || '',
      quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
    };
  });
}

export async function getCart({ signal, sessionId } = {}) {
  const response = await api.get('/cart', { ...sessionConfig(sessionId), signal });
  return readCartResponse(response);
}

export async function addCartItem({ productId, sku, quantity }, { sessionId } = {}) {
  const response = await api.post('/cart/items', { productId, sku, quantity }, sessionConfig(sessionId));
  return readCartResponse(response);
}

export async function updateCartItem(itemId, quantity, { sessionId } = {}) {
  const response = await api.put(`/cart/items/${encodeURIComponent(itemId)}`, { quantity }, sessionConfig(sessionId));
  return readCartResponse(response);
}

export async function removeCartItem(itemId, { sessionId } = {}) {
  const response = await api.delete(`/cart/items/${encodeURIComponent(itemId)}`, sessionConfig(sessionId));
  return readCartResponse(response);
}

export async function clearCart({ sessionId } = {}) {
  const response = await api.delete('/cart', sessionConfig(sessionId));
  return readCartResponse(response);
}

export async function mergeGuestCart(items, { sessionId } = {}) {
  const response = await api.post('/sync/offline-cart', {
    items: items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      variantId: item.variantId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      image: item.image,
    })),
  }, sessionConfig(sessionId));
  return readCartResponse(response);
}
