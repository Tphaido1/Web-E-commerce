const Order = require('../models/Order.model');
const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const Cart = require('../models/Cart.model');
const Coupon = require('../models/Coupon.model');
const EmailService = require('../services/email.service');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

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

      let finalPrice = product.price;
      let finalSku = item.sku;
      let itemName = product.name;

      if (item.variantId || item.sku) {
        const variant = product.variants?.find(
          (v) => (item.variantId && v._id.toString() === item.variantId.toString()) || (item.sku && v.sku === item.sku)
        );
        if (variant) {
          finalPrice = variant.price;
          finalSku = variant.sku;
          itemName = `${product.name} (${variant.color || ''} ${variant.size || ''})`.trim();
        }
      }

      const qty = Number(item.quantity) || 1;
      const subtotal = finalPrice * qty;
      totalAmount += subtotal;

      resolvedItems.push({
        product: product._id,
        sku: finalSku.toUpperCase().trim(),
        name: itemName,
        price: finalPrice,
        quantity: qty,
        subtotal,
      });
    }

    if (hasItemError) {
      failedOrders.push({ clientOrderId, reason: itemErrorMessage });
      continue;
    }

    // 3. Xử lý Coupon
    let couponDoc = null;
    let discountAmount = 0;
    if (couponCode) {
      couponDoc = await Coupon.findOne({ code: couponCode.toUpperCase().trim() });
      if (couponDoc && couponDoc.validateForOrder(userId, totalAmount).isValid) {
        discountAmount = couponDoc.calculateDiscount(totalAmount);
      }
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
    try {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
      const orderCode = `ORD-${dateStr}-${randomSuffix}`;

      const newOrder = await Order.create({
        orderCode,
        user: userId,
        items: resolvedItems,
        shippingAddress,
        paymentMethod,
        paymentStatus: 'unpaid',
        status: 'pending',
        totalAmount,
        discountAmount,
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

      // Tăng lượt dùng coupon
      if (couponDoc) {
        await Coupon.updateOne(
          { _id: couponDoc._id },
          {
            $inc: { usageCount: 1 },
            $push: { usedBy: { user: userId, orderId: newOrder._id } },
          }
        );
      }

      // Kích hoạt email & QR bất đồng bộ
      EmailService.sendOrderConfirmationEmail(newOrder, req.user.email).catch(() => {});

      syncedOrders.push({
        clientOrderId,
        orderCode: newOrder.orderCode,
        orderId: newOrder._id,
        finalAmount: newOrder.finalAmount,
        status: newOrder.status,
      });
    } catch (createErr) {
      for (const deducted of successfullyDeducted) {
        await Inventory.compensateStock(deducted.sku, deducted.quantity);
      }
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

  // Hợp nhất (Merge) giỏ hàng: nếu sản phẩm đã có trong giỏ thì tăng số lượng, nếu chưa thì thêm mới
  for (const offlineItem of items) {
    const existingIndex = cart.items.findIndex(
      (ci) => ci.sku.toUpperCase() === offlineItem.sku.toUpperCase()
    );

    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += Number(offlineItem.quantity) || 1;
    } else {
      cart.items.push({
        product: offlineItem.productId || offlineItem.product,
        sku: offlineItem.sku.toUpperCase().trim(),
        variantId: offlineItem.variantId || null,
        name: offlineItem.name,
        price: Number(offlineItem.price) || 0,
        quantity: Number(offlineItem.quantity) || 1,
        image: offlineItem.image || null,
      });
    }
  }

  await cart.save();

  return ApiResponse.success(res, 200, 'Đồng bộ giỏ hàng ngoại tuyến thành công', cart);
});

module.exports = {
  syncOfflineOrders,
  syncOfflineCart,
};
