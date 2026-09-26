const Order = require('../models/Order.model');
const Product = require('../models/Product.model');
const Inventory = require('../models/Inventory.model');
const Cart = require('../models/Cart.model');
const Coupon = require('../models/Coupon.model');
const EmailService = require('../services/email.service');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

/**
 * Sinh mã đơn hàng duy nhất và dễ đọc: ORD-YYYYMMDD-XXXX
 */
const generateOrderCode = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let isUnique = false;
  let code = '';

  while (!isUnique) {
    const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    code = `ORD-${dateStr}-${randomSuffix}`;
    const existing = await Order.findOne({ orderCode: code });
    if (!existing) {
      isUnique = true;
    }
  }

  return code;
};

/**
 * CHECKOUT TRANSACTION VỚI CƠ CHẾ BỒI HOÀN FAIL-SAFE (SAGA / COMPENSATION PATTERN)
 * POST /api/v1/orders/checkout
 */
const checkout = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const {
    items: reqItems,
    shippingAddress,
    couponCode,
    paymentMethod = 'COD',
    shippingFee = 0,
    idempotencyKey: bodyIdempotencyKey,
  } = req.body;

  const idempotencyKey = req.headers['idempotency-key'] || bodyIdempotencyKey;

  // 1. Kiểm tra tính Idempotent (chống double-click / gửi trùng request)
  if (idempotencyKey) {
    const existingOrder = await Order.findOne({ idempotencyKey });
    if (existingOrder) {
      return ApiResponse.success(res, 200, 'Đơn hàng đã được tạo trước đó', existingOrder);
    }
  }

  // 2. Validate thông tin người nhận
  if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.address) {
    const error = new Error('Vui lòng cung cấp đầy đủ họ tên, số điện thoại và địa chỉ giao hàng');
    error.statusCode = 400;
    throw error;
  }

  // 3. Xác định danh sách món hàng (từ req.body hoặc lấy từ Cart của User)
  let orderItemsToProcess = [];

  if (Array.isArray(reqItems) && reqItems.length > 0) {
    orderItemsToProcess = reqItems;
  } else {
    const userCart = await Cart.findOne({ user: userId });
    if (!userCart || !userCart.items || userCart.items.length === 0) {
      const error = new Error('Giỏ hàng của bạn đang trống, không thể tiến hành đặt hàng');
      error.statusCode = 400;
      throw error;
    }
    orderItemsToProcess = userCart.items.map((item) => ({
      productId: item.product,
      sku: item.sku,
      quantity: item.quantity,
      variantId: item.variantId,
    }));
  }

  // 4. Kiểm tra sản phẩm và lấy giá chính xác từ Database (Chống client sửa giá)
  const resolvedItems = [];
  let totalAmount = 0;

  for (const item of orderItemsToProcess) {
    const quantity = Number(item.quantity);
    if (!quantity || quantity < 1) {
      const error = new Error(`Số lượng sản phẩm ${item.sku || ''} không hợp lệ`);
      error.statusCode = 400;
      throw error;
    }

    const product = await Product.findById(item.productId || item.product);
    if (!product || !product.isActive) {
      const error = new Error(`Sản phẩm [${item.sku || 'N/A'}] không tồn tại hoặc đã ngừng kinh doanh`);
      error.statusCode = 400;
      throw error;
    }

    let finalPrice = product.price;
    let finalSku = item.sku;
    let itemName = product.name;
    let itemImage = (product.images && product.images[0]) || null;

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

    // Nếu có salePrice hợp lệ
    if (product.salePrice && product.salePrice > 0 && product.salePrice < finalPrice) {
      finalPrice = product.salePrice;
    }

    const subtotal = finalPrice * quantity;
    totalAmount += subtotal;

    resolvedItems.push({
      product: product._id,
      sku: finalSku.toUpperCase().trim(),
      variantId: item.variantId || null,
      name: itemName,
      price: finalPrice,
      quantity,
      subtotal,
      image: itemImage,
    });
  }

  // 5. Kiểm tra mã giảm giá (Coupon Engine)
  let couponDoc = null;
  let discountAmount = 0;

  if (couponCode && couponCode.trim()) {
    const cleanCouponCode = couponCode.toUpperCase().trim();
    couponDoc = await Coupon.findOne({ code: cleanCouponCode });

    if (!couponDoc) {
      const error = new Error(`Mã giảm giá "${cleanCouponCode}" không tồn tại trong hệ thống`);
      error.statusCode = 400;
      throw error;
    }

    const validation = couponDoc.validateForOrder(userId, totalAmount);
    if (!validation.isValid) {
      const error = new Error(validation.message || 'Mã giảm giá không hợp lệ cho đơn hàng này');
      error.statusCode = 400;
      throw error;
    }

    discountAmount = couponDoc.calculateDiscount(totalAmount);
  }

  const finalAmount = Math.max(0, totalAmount - discountAmount + Number(shippingFee));

  // 6. THỰC HIỆN TRỪ TỒN KHO NGUYÊN TỬ KÈM CƠ CHẾ BỒI HOÀN FAIL-SAFE
  const successfullyDeducted = [];

  try {
    for (const item of resolvedItems) {
      // Tìm và trừ kho nguyên tử trong bảng Inventory
      let inventoryDoc = await Inventory.deductStock(item.sku, item.quantity);

      // Nếu trong bảng Inventory chưa khởi tạo bản ghi cho SKU này, kiểm tra và trừ trực tiếp từ Product
      if (!inventoryDoc) {
        // Kiểm tra xem SKU có tồn tại trong Inventory hay do hết hàng
        const existingInventory = await Inventory.findOne({ sku: item.sku });

        if (existingInventory) {
          // Có tồn tại bản ghi Inventory nhưng không đủ tồn kho ($gte condition fail)
          const error = new Error(
            `Sản phẩm "${item.name}" (SKU: ${item.sku}) không đủ số lượng (chỉ còn ${existingInventory.stock} sản phẩm khả dụng)`
          );
          error.statusCode = 400;
          throw error;
        } else {
          // Fallback: SKU chưa được gán vào Inventory riêng, trừ vào Product.variants hoặc Product.stock
          const productDeduct = await Product.findOneAndUpdate(
            {
              _id: item.product,
              $or: [
                { 'variants.sku': item.sku, 'variants.stock': { $gte: item.quantity } },
                { stock: { $gte: item.quantity } },
              ],
            },
            {
              $inc: {
                'variants.$[elem].stock': -item.quantity,
                stock: -item.quantity,
              },
            },
            {
              arrayFilters: [{ 'elem.sku': item.sku, 'elem.stock': { $gte: item.quantity } }],
              new: true,
            }
          );

          if (!productDeduct) {
            const error = new Error(`Sản phẩm "${item.name}" (SKU: ${item.sku}) đã hết hàng hoặc không đủ số lượng tồn kho`);
            error.statusCode = 400;
            throw error;
          }
        }
      }

      // Lưu lại danh sách đã trừ thành công để sẵn sàng bồi hoàn nếu xảy ra lỗi các bước sau
      successfullyDeducted.push({
        sku: item.sku,
        quantity: item.quantity,
        productId: item.product,
      });
    }
  } catch (stockError) {
    // === CƠ CHẾ BỒI HOÀN TỰ ĐỘNG (COMPENSATION / ROLLBACK) ===
    // eslint-disable-next-line no-console
    console.warn(`[Checkout Compensation] Trừ kho thất bại: ${stockError.message}. Bắt đầu bồi hoàn...`);

    for (const deducted of successfullyDeducted) {
      try {
        await Inventory.compensateStock(deducted.sku, deducted.quantity);
        await Product.updateOne(
          { _id: deducted.productId },
          {
            $inc: {
              'variants.$[elem].stock': deducted.quantity,
              stock: deducted.quantity,
            },
          },
          {
            arrayFilters: [{ 'elem.sku': deducted.sku }],
          }
        );
      } catch (compensationError) {
        // eslint-disable-next-line no-console
        console.error(`[Fatal Compensation Failure] Lỗi khi hoàn trả SKU ${deducted.sku}:`, compensationError.message);
      }
    }

    throw stockError;
  }

  // 7. Cập nhật lượt dùng Coupon (Atomic update)
  let orderSaved = null;
  const orderCode = await generateOrderCode();

  try {
    if (couponDoc) {
      const updatedCoupon = await Coupon.findOneAndUpdate(
        {
          _id: couponDoc._id,
          isActive: true,
          ...(couponDoc.usageLimit !== null && { usageCount: { $lt: couponDoc.usageLimit } }),
        },
        {
          $inc: { usageCount: 1 },
          $push: {
            usedBy: {
              user: userId,
              usedAt: new Date(),
            },
          },
        },
        { new: true }
      );

      if (!updatedCoupon) {
        const error = new Error('Mã giảm giá vừa hết lượt sử dụng trong tích tắc');
        error.statusCode = 400;
        throw error;
      }
    }

    // 8. Tạo Order Record
    const orderData = {
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
      coupon: couponDoc
        ? {
            couponId: couponDoc._id,
            code: couponDoc.code,
            discountAmount,
          }
        : null,
      trackingHistory: [
        {
          status: 'pending',
          note: 'Đơn hàng được khởi tạo thành công (Chờ người bán xác nhận)',
          updatedAt: new Date(),
          updatedBy: userId,
        },
      ],
      ...(idempotencyKey && { idempotencyKey }),
    };

    orderSaved = await Order.create(orderData);

    // Cập nhật lại orderId vào lịch sử Coupon nếu có
    if (couponDoc && orderSaved) {
      await Coupon.updateOne(
        { _id: couponDoc._id, 'usedBy.user': userId, 'usedBy.orderId': null },
        { $set: { 'usedBy.$.orderId': orderSaved._id } }
      );
    }
  } catch (orderCreationError) {
    // Bồi hoàn kho nếu tạo đơn thất bại
    // eslint-disable-next-line no-console
    console.warn(`[Checkout Compensation] Tạo đơn thất bại: ${orderCreationError.message}. Bắt đầu bồi hoàn kho...`);
    for (const deducted of successfullyDeducted) {
      await Inventory.compensateStock(deducted.sku, deducted.quantity);
    }

    // Bồi hoàn coupon nếu đã lỡ cộng
    if (couponDoc) {
      await Coupon.updateOne(
        { _id: couponDoc._id },
        {
          $inc: { usageCount: -1 },
          $pull: { usedBy: { user: userId } },
        }
      );
    }

    throw orderCreationError;
  }

  // 9. Xóa sạch các mục đã mua khỏi Cart của User
  try {
    const purchasedSkus = resolvedItems.map((i) => i.sku);
    await Cart.findOneAndUpdate(
      { user: userId },
      {
        $pull: {
          items: { sku: { $in: purchasedSkus } },
        },
      }
    );
  } catch (cartError) {
    // Lỗi dọn giỏ hàng không làm hỏng đơn hàng chính
    // eslint-disable-next-line no-console
    console.warn('[Cart Cleanup Warning] Không thể xóa giỏ hàng:', cartError.message);
  }

  // 10. Tạo mã QR bảo mật và gửi email hóa đơn bất đồng bộ
  try {
    const emailResult = await EmailService.sendOrderConfirmationEmail(orderSaved, req.user.email);
    if (emailResult.success) {
      orderSaved.qrTrackingToken = emailResult.trackingToken;
      orderSaved.qrCodeDataUrl = emailResult.qrCodeDataUrl;
      await orderSaved.save();
    }
  } catch (emailError) {
    // eslint-disable-next-line no-console
    console.warn('[Email Warning] Không thể hoàn thành gửi email hóa đơn:', emailError.message);
  }

  // 11. Bắn sự kiện Real-time Socket.io cho Admin nếu có
  const io = req.app.get('io');
  if (io) {
    io.to('role_admin').emit('new_order', {
      orderId: orderSaved._id,
      orderCode: orderSaved.orderCode,
      finalAmount: orderSaved.finalAmount,
      customerName: orderSaved.shippingAddress.fullName,
      createdAt: orderSaved.createdAt,
    });
  }

  return ApiResponse.success(res, 201, 'Đặt hàng thành công', orderSaved);
});

/**
 * LẤY DANH SÁCH ĐƠN HÀNG CỦA TÔI (CUSTOMER)
 * GET /api/v1/orders/my-orders
 */
const getMyOrders = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = { user: userId };
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  return ApiResponse.success(res, 200, 'Lấy danh sách đơn hàng thành công', {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * XEM CHI TIẾT ĐƠN HÀNG
 * GET /api/v1/orders/:id
 */
const getOrderById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const order = await Order.findById(id).populate('user', 'email role').lean();

  if (!order) {
    const error = new Error('Không tìm thấy đơn hàng');
    error.statusCode = 404;
    throw error;
  }

  const isOwner = order.user && order.user._id.toString() === req.user._id.toString();
  const isAdminOrVendor = ['admin', 'vendor'].includes(req.user.role);

  if (!isOwner && !isAdminOrVendor) {
    const error = new Error('Bạn không có quyền truy cập thông tin đơn hàng này');
    error.statusCode = 403;
    throw error;
  }

  return ApiResponse.success(res, 200, 'Lấy chi tiết đơn hàng thành công', order);
});

/**
 * TRA CỨU ĐƠN HÀNG CÔNG KHAI QUA MÃ ĐƠN & QR HMAC TOKEN (KHÔNG CẦN LOGIN)
 * GET /api/v1/orders/track/:orderCode
 */
const trackOrderByCode = catchAsync(async (req, res) => {
  const { orderCode } = req.params;
  const { token } = req.query;

  const order = await Order.findOne({ orderCode: orderCode.toUpperCase().trim() }).lean();

  if (!order) {
    const error = new Error('Không tìm thấy thông tin đơn hàng với mã tra cứu này');
    error.statusCode = 404;
    throw error;
  }

  // Xác thực token bảo mật nếu cung cấp
  const isVerified = token ? EmailService.verifyTrackingToken(order._id, order.createdAt, token) : false;

  // Lọc thông tin nhạy cảm trước khi trả về công khai
  const publicTrackingInfo = {
    orderCode: order.orderCode,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    finalAmount: order.finalAmount,
    createdAt: order.createdAt,
    trackingHistory: order.trackingHistory,
    itemCount: order.items.length,
    recipientName: order.shippingAddress.fullName.replace(/(?<=.).(?=.*@|.{2}$)/g, '*'),
    city: order.shippingAddress.city,
    isVerifiedByHMAC: isVerified,
    ...(isVerified && {
      items: order.items,
      shippingAddress: order.shippingAddress,
      qrCodeDataUrl: order.qrCodeDataUrl,
    }),
  };

  return ApiResponse.success(res, 200, 'Tra cứu thông tin đơn hàng thành công', publicTrackingInfo);
});

/**
 * QUẢN LÝ TẤT CẢ ĐƠN HÀNG (ADMIN / VENDOR)
 * GET /api/v1/orders
 */
const getAllOrders = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.paymentStatus) {
    filter.paymentStatus = req.query.paymentStatus;
  }
  if (req.query.search) {
    filter.$or = [
      { orderCode: { $regex: req.query.search, $options: 'i' } },
      { 'shippingAddress.phone': { $regex: req.query.search, $options: 'i' } },
      { 'shippingAddress.fullName': { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).populate('user', 'email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  return ApiResponse.success(res, 200, 'Lấy danh sách đơn hàng thành công', {
    orders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG (ADMIN / VENDOR)
 * Tự động hoàn kho nếu đơn chuyển sang trạng thái "cancelled"
 * PATCH /api/v1/orders/:id/status
 */
const updateOrderStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, note, cancelledReason } = req.body;

  const allowedStatuses = ['pending', 'processing', 'shipping', 'delivered', 'cancelled'];
  if (!allowedStatuses.includes(status)) {
    const error = new Error(`Trạng thái không hợp lệ. Chỉ chấp nhận: ${allowedStatuses.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  const order = await Order.findById(id);
  if (!order) {
    const error = new Error('Không tìm thấy đơn hàng');
    error.statusCode = 404;
    throw error;
  }

  if (order.status === 'cancelled') {
    const error = new Error('Đơn hàng đã bị hủy trước đó, không thể thay đổi trạng thái');
    error.statusCode = 400;
    throw error;
  }

  if (order.status === 'delivered' && status !== 'delivered') {
    const error = new Error('Đơn hàng đã giao thành công, không thể chuyển ngược trạng thái');
    error.statusCode = 400;
    throw error;
  }

  const oldStatus = order.status;
  order.status = status;

  order.trackingHistory.push({
    status,
    note: note || `Trạng thái đơn hàng chuyển từ [${oldStatus}] sang [${status}]`,
    updatedAt: new Date(),
    updatedBy: req.user._id,
  });

  // TỰ ĐỘNG HOÀN KHO NẾU ĐƠN BỊ HỦY (RESTOCK ON CANCELLATION)
  if (status === 'cancelled') {
    order.cancelledReason = cancelledReason || 'Hủy bởi người quản trị';
    order.cancelledAt = new Date();

    for (const item of order.items) {
      await Inventory.compensateStock(item.sku, item.quantity);
      await Product.updateOne(
        { _id: item.product },
        {
          $inc: {
            'variants.$[elem].stock': item.quantity,
            stock: item.quantity,
          },
        },
        {
          arrayFilters: [{ 'elem.sku': item.sku }],
        }
      );
    }

    // Hoàn lại lượt dùng coupon nếu có
    if (order.coupon?.couponId) {
      await Coupon.updateOne(
        { _id: order.coupon.couponId },
        {
          $inc: { usageCount: -1 },
          $pull: { usedBy: { orderId: order._id } },
        }
      );
    }
  }

  await order.save();

  // Bắn sự kiện socket nếu có
  const io = req.app.get('io');
  if (io) {
    io.to(`order_${order._id}`).emit('order_status_updated', {
      orderId: order._id,
      status: order.status,
      note,
    });
  }

  return ApiResponse.success(res, 200, `Cập nhật trạng thái đơn hàng thành [${status}] thành công`, order);
});

module.exports = {
  checkout,
  getMyOrders,
  getOrderById,
  trackOrderByCode,
  getAllOrders,
  updateOrderStatus,
};
