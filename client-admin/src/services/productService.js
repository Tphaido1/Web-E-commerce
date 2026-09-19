import { productSeed } from './mockData.js';

let products = [...productSeed];

export const productService = {
  list: () => [...products],
  get: (id) => products.find((product) => product.id === id),
  isSkuTaken: (sku, excludeId) => products.some((product) => product.sku.toLowerCase() === sku.trim().toLowerCase() && product.id !== excludeId),
  create: (values) => {
    const product = { ...values, id: `prod-${Date.now()}`, key: `prod-${Date.now()}` };
    products = [product, ...products];
    return product;
  },
  update: (id, values) => {
    products = products.map((product) => (product.id === id ? { ...product, ...values } : product));
  },
  remove: (id) => {
    products = products.filter((product) => product.id !== id);
  },
};
