const isVendor = (user) => user?.role === 'vendor';
const sameId = (left, right) => Boolean(left && right && String(left._id || left) === String(right._id || right));
const vendorOrderFilter = (user) => isVendor(user) ? { 'items.vendor': user._id } : {};
const canViewVendorOrder = (order, user) => !isVendor(user) || (order.items || []).some((item) => sameId(item.vendor, user._id));
const canManageWholeOrder = (order, user) => !isVendor(user) || Boolean(order.items?.length && order.items.every((item) => sameId(item.vendor, user._id)));
const vendorNetAmount = (order, items) => {
  const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const ratio = order.totalAmount > 0 ? Math.max(0, order.totalAmount - (order.discountAmount || 0)) / order.totalAmount : 0;
  return Math.round(subtotal * ratio);
};
const sanitizeVendorOrder = (order, user) => {
  if (!isVendor(user)) return order;
  const doc = order.toObject ? order.toObject() : order;
  const items = (doc.items || []).filter((item) => sameId(item.vendor, user._id));
  const totalAmount = items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const finalAmount = vendorNetAmount(doc, items);
  // Explicit whitelist keeps customer auth, other Vendors' items, shared coupons,
  // QR access credentials and original order totals out of Vendor responses.
  return { _id: doc._id, orderCode: doc.orderCode, items, shippingAddress: doc.shippingAddress,
    status: doc.status, paymentMethod: doc.paymentMethod, paymentStatus: doc.paymentStatus,
    createdAt: doc.createdAt, updatedAt: doc.updatedAt, totalAmount, finalAmount,
    discountAmount: totalAmount - finalAmount, shippingFee: 0, vendorScopeOnly: true,
    canUpdateStatus: canManageWholeOrder(doc, user),
    trackingHistory: (doc.trackingHistory || []).map(({ status, updatedAt }) => ({ status, updatedAt })) };
};
const notifyOrderVendors = (io, order, event, extra = {}) => {
  if (!io || !order) return;
  const vendors = new Set((order.items || []).map((item) => item.vendor && String(item.vendor)).filter(Boolean));
  for (const vendor of vendors) {
    const items = order.items.filter((item) => sameId(item.vendor, vendor));
    io.to('vendor_' + vendor).emit(event, { ...extra, orderId: order._id, orderCode: order.orderCode,
      status: order.status, paymentStatus: order.paymentStatus, finalAmount: vendorNetAmount(order, items),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0), createdAt: order.createdAt });
  }
};
module.exports = { isVendor, sameId, vendorOrderFilter, canViewVendorOrder, canManageWholeOrder, sanitizeVendorOrder, notifyOrderVendors };
