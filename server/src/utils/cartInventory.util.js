/**
 * cartInventory.util.js
 * --------------------------------------------------------------------------
 * Tiện ích xử lý nghiệp vụ Giỏ hàng & Tồn kho (Cart & Inventory Logic):
 * 1. Hàm gộp giỏ hàng (Merge Cart): Hợp nhất giỏ hàng vãng lai (Guest/Local)
 *    vào giỏ hàng tài khoản (User Server Cart) khi người dùng đăng nhập.
 * 2. Hàm kiểm tra tồn kho (Inventory Check): Đối soát số lượng trong giỏ hàng
 *    với tồn kho thực tế, phát hiện sản phẩm hết hàng hoặc vượt quá số lượng khả dụng.
 * --------------------------------------------------------------------------
 */

/**
 * Gộp giỏ hàng cục bộ (Local/Offline) vào giỏ hàng máy chủ (Server Cart)
 * @param {Array} serverItems - Danh sách sản phẩm hiện có trong giỏ hàng server
 * @param {Array} localItems - Danh sách sản phẩm từ client/local storage cần gộp
 * @returns {Array} Danh sách sản phẩm sau khi đã gộp và chuẩn hóa
 */
function mergeCartItems(serverItems = [], localItems = []) {
  const mergedMap = new Map();

  // 1. Đưa các món hàng từ server vào Map
  if (Array.isArray(serverItems)) {
    for (const item of serverItems) {
      if (!item || !item.sku) continue;
      const key = item.sku.toUpperCase().trim();
      mergedMap.set(key, {
        product: item.product || item.productId,
        sku: key,
        variantId: item.variantId || null,
        name: item.name || 'Sản phẩm',
        price: Number(item.price) || 0,
        quantity: Math.max(1, Number(item.quantity) || 1),
        image: item.image || null,
      });
    }
  }

  // 2. Gộp các món hàng từ local vào
  if (Array.isArray(localItems)) {
    for (const item of localItems) {
      if (!item || !item.sku) continue;
      const key = item.sku.toUpperCase().trim();
      const addQty = Math.max(1, Number(item.quantity) || 1);

      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        existing.quantity += addQty;
        // Cập nhật giá mới nhất nếu local có giá hợp lệ
        if (Number(item.price) > 0) {
          existing.price = Number(item.price);
        }
      } else {
        mergedMap.set(key, {
          product: item.product || item.productId,
          sku: key,
          variantId: item.variantId || null,
          name: item.name || 'Sản phẩm',
          price: Number(item.price) || 0,
          quantity: addQty,
          image: item.image || null,
        });
      }
    }
  }

  return Array.from(mergedMap.values());
}

/**
 * Tính tổng tiền giỏ hàng
 * @param {Array} items
 * @returns {number}
 */
function calculateCartTotal(items = []) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    return total + price * qty;
  }, 0);
}

/**
 * Kiểm tra tính khả dụng của tồn kho cho danh sách sản phẩm trong giỏ hàng
 * @param {Array} cartItems - Các món hàng trong giỏ
 * @param {Array|Map|Function} inventorySource - Dữ liệu tồn kho (mảng, Map hoặc hàm lấy tồn kho)
 * @returns {Promise<{ isAvailable: boolean, validatedItems: Array, errors: Array }>}
 */
async function checkInventoryAvailability(cartItems = [], inventorySource = []) {
  const errors = [];
  const validatedItems = [];
  let isAvailable = true;

  for (const item of cartItems) {
    const sku = item.sku ? item.sku.toUpperCase().trim() : '';
    const reqQty = Number(item.quantity) || 1;

    let availableStock = 0;
    let found = false;

    // Lấy thông tin tồn kho tùy thuộc vào kiểu của inventorySource
    if (typeof inventorySource === 'function') {
      const inv = await inventorySource(sku);
      if (inv) {
        availableStock = typeof inv === 'number' ? inv : (inv.stock ?? 0);
        found = true;
      }
    } else if (inventorySource instanceof Map) {
      if (inventorySource.has(sku)) {
        const inv = inventorySource.get(sku);
        availableStock = typeof inv === 'number' ? inv : (inv.stock ?? 0);
        found = true;
      }
    } else if (Array.isArray(inventorySource)) {
      const inv = inventorySource.find((i) => i && i.sku && i.sku.toUpperCase().trim() === sku);
      if (inv) {
        availableStock = inv.stock ?? 0;
        found = true;
      }
    }

    if (!found) {
      isAvailable = false;
      errors.push({
        sku,
        name: item.name,
        code: 'NOT_FOUND',
        message: `Sản phẩm [${item.name || sku}] không tìm thấy trong hệ thống tồn kho`,
      });
      validatedItems.push({
        ...item,
        availableStock: 0,
        isSufficient: false,
      });
    } else if (availableStock <= 0) {
      isAvailable = false;
      errors.push({
        sku,
        name: item.name,
        code: 'OUT_OF_STOCK',
        message: `Sản phẩm [${item.name || sku}] đã hết hàng`,
      });
      validatedItems.push({
        ...item,
        availableStock: 0,
        isSufficient: false,
      });
    } else if (availableStock < reqQty) {
      isAvailable = false;
      errors.push({
        sku,
        name: item.name,
        code: 'INSUFFICIENT_STOCK',
        requestedQuantity: reqQty,
        availableStock,
        message: `Sản phẩm [${item.name || sku}] chỉ còn ${availableStock} sản phẩm khả dụng (bạn yêu cầu ${reqQty})`,
      });
      validatedItems.push({
        ...item,
        availableStock,
        isSufficient: false,
        suggestedQuantity: availableStock,
      });
    } else {
      validatedItems.push({
        ...item,
        availableStock,
        isSufficient: true,
      });
    }
  }

  return {
    isAvailable,
    validatedItems,
    errors,
  };
}

module.exports = {
  mergeCartItems,
  calculateCartTotal,
  checkInventoryAvailability,
};
