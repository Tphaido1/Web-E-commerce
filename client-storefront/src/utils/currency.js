export const PRODUCT_PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=700&q=80';

export function formatCurrency(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 'Liên hệ';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(numericValue);
}

// Match the server cart/checkout rule for the selected catalog price.
export function resolveProductPrice(product, variant = null) {
  const basePrice = Number(variant ? variant.price : product?.price);
  const salePrice = Number(product?.salePrice);
  return Number.isFinite(basePrice) && Number.isFinite(salePrice)
    && salePrice > 0 && salePrice < basePrice ? salePrice : basePrice;
}
