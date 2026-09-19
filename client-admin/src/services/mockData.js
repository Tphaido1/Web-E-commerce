export const categorySeed = [
  { key: 'cat-1', id: 'CAT-001', name: 'Bags', description: 'Everyday and travel bags', productCount: 24, status: 'Active' },
  { key: 'cat-2', id: 'CAT-002', name: 'Electronics', description: 'Devices and accessories', productCount: 18, status: 'Active' },
  { key: 'cat-3', id: 'CAT-003', name: 'Footwear', description: 'Shoes for every occasion', productCount: 12, status: 'Inactive' },
  { key: 'cat-4', id: 'CAT-004', name: 'Stationery', description: 'Thoughtful desk essentials', productCount: 31, status: 'Active' },
];

export const productSeed = [
  { key: 'prod-1', id: 'prod-1', image: 'CW', name: 'Canvas Weekender', sku: 'NOVA-CW-001', category: 'Bags', price: 129, stock: 42, status: 'Active', description: 'A durable canvas bag for daily travel.', variants: [{ color: 'Black', size: 'M', price: 129, sku: 'NOVA-CW-001-B-M', stock: 20 }] },
  { key: 'prod-2', id: 'prod-2', image: 'SH', name: 'Studio Headphones', sku: 'NOVA-SH-002', category: 'Electronics', price: 249, stock: 18, status: 'Active', description: 'Balanced sound for focused listening.', variants: [{ color: 'Black', size: 'One size', price: 249, sku: 'NOVA-SH-002-B-OS', stock: 18 }] },
  { key: 'prod-3', id: 'prod-3', image: 'ER', name: 'Everyday Runner', sku: 'NOVA-ER-003', category: 'Footwear', price: 98, stock: 0, status: 'Out of stock', description: 'Lightweight everyday running shoes.', variants: [{ color: 'White', size: 'M', price: 98, sku: 'NOVA-ER-003-W-M', stock: 0 }] },
  { key: 'prod-4', id: 'prod-4', image: 'FN', name: 'Field Notes Set', sku: 'NOVA-FN-004', category: 'Stationery', price: 24, stock: 76, status: 'Active', description: 'A compact set of textured notebooks.', variants: [{ color: 'Green', size: 'A5', price: 24, sku: 'NOVA-FN-004-G-A5', stock: 76 }] },
];
