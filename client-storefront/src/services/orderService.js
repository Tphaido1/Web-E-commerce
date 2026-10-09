import api from './api.js';

function requireData(data, message) {
  if (!data || typeof data !== 'object') throw new Error(message);
  return data;
}

export async function getMyOrders({ page = 1, limit = 10, status, signal } = {}) {
  const response = await api.get('/orders/my-orders', {
    params: { page, limit, ...(status ? { status } : {}) },
    signal,
  });
  const result = requireData(response.data?.data, 'Phản hồi danh sách đơn hàng không hợp lệ.');
  if (!Array.isArray(result.orders) || !result.pagination) {
    throw new Error('Phản hồi danh sách đơn hàng không hợp lệ.');
  }
  return result;
}

export async function getOrderById(id, { signal } = {}) {
  const response = await api.get(`/orders/${encodeURIComponent(id)}`, { signal });
  return requireData(response.data?.data, 'Phản hồi chi tiết đơn hàng không hợp lệ.');
}

export async function trackOrder(orderCode, token, { signal } = {}) {
  const response = await api.get(`/orders/track/${encodeURIComponent(orderCode)}`, {
    params: token ? { token } : undefined,
    signal,
  });
  return requireData(response.data?.data, 'Phản hồi tra cứu đơn hàng không hợp lệ.');
}

export async function applyCoupon(code, orderTotal) {
  const response = await api.post('/coupons/apply', { code, orderTotal });
  const result = response.data?.data;
  if (!result || typeof result.discountAmount !== 'number' || typeof result.newTotal !== 'number') {
    throw new Error('Phản hồi xác thực mã giảm giá không hợp lệ.');
  }
  return result;
}

export async function createOrder(payload, idempotencyKey) {
  const response = await api.post('/orders/checkout', payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  const order = response.data?.data;
  if (!order?._id || !order.orderCode || typeof order.finalAmount !== 'number') {
    throw new Error('Phản hồi tạo đơn hàng không hợp lệ.');
  }
  return order;
}

export async function createVNPayPaymentUrl(orderId) {
  const response = await api.post('/payments/create-vnpay-url', { orderId });
  const result = response.data?.data;
  if (!result?.paymentUrl || typeof result.paymentUrl !== 'string') {
    throw new Error('Phản hồi tạo liên kết thanh toán VNPay không hợp lệ.');
  }
  const paymentUrl = new URL(result.paymentUrl);
  if (paymentUrl.protocol !== 'https:') {
    throw new Error('Liên kết thanh toán VNPay không hợp lệ.');
  }
  return result;
}

export async function processVNPayReturn(params, { signal } = {}) {
  const response = await api.get('/payments/vnpay-return', { params, signal });
  const result = response.data?.data;
  if (!result?.orderId || !result.orderCode || typeof result.isSuccess !== 'boolean') {
    throw new Error('Phản hồi xác thực thanh toán VNPay không hợp lệ.');
  }
  return result;
}
