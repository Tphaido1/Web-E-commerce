const mongoose = require('mongoose');
const Order = require('../models/Order.model');
const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const Cart = require('../models/Cart.model');
const Coupon = require('../models/Coupon.model');
const EmailService = require('../services/email.service');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { resolveCartItem, resolveItemPrice, badRequest, parseQuantity } = require('../utils/cartItem.util');
const { claimCoupon, rollbackCouponClaim } = require('../utils/couponClaim.util');
const { notifyOrderVendors } = require('../utils/vendorScope.util');

/**
 * ĐỒNG BỘ ĐƠN HÀNG NGOẠI TUYẾN TỪ THIẾT BỊ CLIENT (INDEXEDDB / DEXIE.JS)
 * POST /api/v1/sync/offline-orders
 */
const syncOfflineOrders = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { orders } = req.body;

  if (!Array.isArray(orders) || orders.length === 0) {
    const error = new Error('Danh sách đơn hàng ngoại tuyến trống');
    error.statusCode = 400;
    throw error;
  }

  const syncedOrders = [];
  const failedOrders = [];

  for (const rawOrder of orders) {
    const {
      clientOrderId,
      items: rawItems,
      shippingAddress,
      couponCode,
      paymentMethod = 'COD',
      shippingFee = 0,
    } = rawOrder;

    if (!clientOrderId) {
      failedOrders.push({
        clientOrderId: null,
        reason: 'Thiếu clientOrderId (Idempotency Key)',
      });
      continue;
    }

    // 1. Kiểm tra Idempotent (Chống đồng bộ trùng lặp)
    const existingOrder = await Order.findOne({ idempotencyKey: clientOrderId });
    if (existingOrder) {
      if (String(existingOrder.user) !== String(userId)) {
        failedOrders.push({ clientOrderId, reason: 'Idempotency key đã được sử dụng' });
        continue;
      }
      syncedOrders.push({
        clientOrderId,
        orderCode: existingOrder.orderCode,
        status: existingOrder.status,
        finalAmount: existingOrder.finalAmount,
        isDuplicate: true,
      });
      continue;
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.address) {
      failedOrders.push({
        clientOrderId,
        reason: 'Thiếu thông tin người nhận hàng',
      });
      continue;
    }

    // 2. Validate Items & Real Prices
    const resolvedItems = [];
    let totalAmount = 0;
    let hasItemError = false;
    let itemErrorMessage = '';

    for (const item of rawItems || []) {
      const product = await Product.findById(item.productId || item.product);
      if (!product || !product.isActive) {
        hasItemError = true;
        itemErrorMessage = `Sản phẩm [${item.sku || 'N/A'}] không còn tồn tại hoặc đã ngừng kinh doanh`;
        break;
      }

      let qty;
      let finalSku;
      let variant;
      try {
        qty = parseQuantity(item.quantity);
        if (typeof item.sku !== 'string' || !item.sku.trim()) throw badRequest('SKU sản phẩm không hợp lệ');
        finalSku = item.sku.toUpperCase().trim();
        variant = product.variants?.find((entry) => entry.sku.toUpperCase().trim() === finalSku);
        if (item.variantId && String(item.variantId) !== String(variant?._id)) throw badRequest('Biến thể không khớp SKU của sản phẩm');
        const inventory = await Inventory.findOne({ sku: finalSku });
        if (!inventory || String(inventory.product) !== String(product._id)) throw badRequest('SKU không thuộc sản phẩm hoặc không có trong tồn kho');
      } catch (error) {
        hasItemError = true;
        itemErrorMessage = error.message;
        break;
      }
      const finalPrice = resolveItemPrice(product, variant);
      const itemName = product.name;
      const subtotal = finalPrice * qty;
      totalAmount += subtotal;

      resolvedItems.push({
        product: product._id,
        vendor: product.vendor || null,
        stockSource: 'inventory',
        sku: finalSku.toUpperCase().trim(),
        name: itemName,
        price: finalPrice,
        quantity: qty,
        subtotal,
      });
    }

    if (!resolvedItems.length && !hasItemError) { hasItemError = true; itemErrorMessage = 'Đơn hàng phải chứa ít nhất một sản phẩm'; }
    if (hasItemError) {
      failedOrders.push({ clientOrderId, reason: itemErrorMessage });
      continue;
    }

    // 3. Xử lý Coupon
    let couponDoc = null;
    let discountAmount = 0;
    if (couponCode) {
      couponDoc = await Coupon.findOne({ code: couponCode.toUpperCase().trim() });
      const validation = couponDoc?.validateForOrder(userId, totalAmount);
      if (!validation?.isValid) {
        failedOrders.push({ clientOrderId, reason: validation?.message || 'Mã giảm giá không hợp lệ' });
        continue;
      }
      discountAmount = couponDoc.calculateDiscount(totalAmount);
    }

    const finalAmount = Math.max(0, totalAmount - discountAmount + Number(shippingFee));

    // 4. Trừ kho nguyên tử với cơ chế bồi hoàn
    const successfullyDeducted = [];
    let stockFailed = false;
    let stockErrorMessage = '';

    for (const item of resolvedItems) {
      const inventoryDoc = await Inventory.deductStock(item.sku, item.quantity);
      if (!inventoryDoc) {
        stockFailed = true;
        stockErrorMessage = `Sản phẩm "${item.name}" (SKU: ${item.sku}) không đủ số lượng trong kho`;
        break;
      }
      successfullyDeducted.push({ sku: item.sku, quantity: item.quantity });
    }

    if (stockFailed) {
      // Bồi hoàn các món đã trừ
      for (const deducted of successfullyDeducted) {
        await Inventory.compensateStock(deducted.sku, deducted.quantity);
      }
      failedOrders.push({ clientOrderId, reason: stockErrorMessage });
      continue;
    }

    // 5. Tạo đơn hàng chính thức
    const couponUsageId = new mongoose.Types.ObjectId();
    const reservedOrderId = new mongoose.Types.ObjectId();
    let couponClaimed = false;
    try {
      if (couponDoc) {
        const claimed = await claimCoupon(couponDoc, userId, couponUsageId, reservedOrderId);
        if (!claimed) throw badRequest('Mã giảm giá đã hết lượt sử dụng cho tài khoản này');
        couponClaimed = true;
      }
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
      const orderCode = `ORD-${dateStr}-${randomSuffix}`;

      const newOrder = await Order.create({
        _id: reservedOrderId,
        orderCode,
        user: userId,
        items: resolvedItems,
        shippingAddress,
        paymentMethod,
        paymentStatus: 'unpaid',
        status: 'pending',
        totalAmount,
        discountAmount,
        coupon: couponDoc ? { couponId: couponDoc._id, code: couponDoc.code, discountAmount } : null,
        shippingFee: Number(shippingFee),
        finalAmount,
        idempotencyKey: clientOrderId,
        trackingHistory: [
          {
            status: 'pending',
            note: 'Đơn hàng đồng bộ thành công từ hàng đợi ngoại tuyến (Offline Sync)',
            updatedAt: new Date(),
            updatedBy: userId,
          },
        ],
      });

      // Kích hoạt email & QR bất đồng bộ
      EmailService.sendOrderConfirmationEmail(newOrder, req.user.email).catch(() => {});

      syncedOrders.push({
        clientOrderId,
        orderCode: newOrder.orderCode,
        orderId: newOrder._id,
        finalAmount: newOrder.finalAmount,
        status: newOrder.status,
      });
      // Notification delivery is best-effort after the committed order. Its
      // failure must never enter the stock/coupon compensation branch.
      try {
        const io = req.app.get('io');
        if (io) {
          io.to('role_admin').emit('new_order', { orderId: newOrder._id, orderCode: newOrder.orderCode,
            finalAmount: newOrder.finalAmount, customerName: shippingAddress.fullName, createdAt: newOrder.createdAt });
          notifyOrderVendors(io, newOrder, 'new_order');
        }
      } catch (notificationError) {
        console.warn('[Offline Notification Warning]', notificationError.message);
      }
    } catch (createErr) {
      for (const deducted of successfullyDeducted) {
        await Inventory.compensateStock(deducted.sku, deducted.quantity);
      }
      if (couponClaimed) await rollbackCouponClaim(couponDoc._id, couponUsageId);
      failedOrders.push({ clientOrderId, reason: createErr.message });
    }
  }

  return ApiResponse.success(res, 200, 'Đồng bộ đơn hàng ngoại tuyến hoàn tất', {
    totalRequested: orders.length,
    syncedCount: syncedOrders.length,
    failedCount: failedOrders.length,
    syncedOrders,
    failedOrders,
  });
});

/**
 * ĐỒNG BỘ GIỎ HÀNG NGOẠI TUYẾN LÊN SERVER
 * POST /api/v1/sync/offline-cart
 */
const syncOfflineCart = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return ApiResponse.success(res, 200, 'Không có món hàng cần đồng bộ', { items: [] });
  }

  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = new Cart({ user: userId, items: [] });
  }

  // Validate every input before persisting any cart changes.
  for (const offlineItem of items) {
    const { item, inventory } = await resolveCartItem(offlineItem);
    const existing = cart.items.find((entry) => entry.sku.toUpperCase().trim() === item.sku);
    const totalQuantity = (existing?.quantity || 0) + item.quantity;
    if (totalQuantity > inventory.stock) throw badRequest('Tổng số lượng trong giỏ vượt quá tồn kho khả dụng');
    if (existing) {
      Object.assign(existing, item, { quantity: totalQuantity });
    } else {
      cart.items.push(item);
    }
  }

  await cart.save();

  return ApiResponse.success(res, 200, 'Đồng bộ giỏ hàng ngoại tuyến thành công', cart);
});

module.exports = {
  syncOfflineOrders,
  syncOfflineCart,
};
