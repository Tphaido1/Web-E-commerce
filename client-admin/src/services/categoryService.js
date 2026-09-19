import { categorySeed } from './mockData.js';

let categories = [...categorySeed];

const nextCategoryId = () => {
  const usedIds = categories.map((category) => Number(category.id.replace('CAT-', ''))).filter(Number.isFinite);
  return `CAT-${String(Math.max(0, ...usedIds) + 1).padStart(3, '0')}`;
};

export const categoryService = {
  list: () => [...categories],
  create: (values) => {
    const category = { ...values, key: `cat-${Date.now()}`, id: nextCategoryId(), productCount: 0 };
    categories = [category, ...categories];
    return category;
  },
  update: (key, values) => {
    categories = categories.map((category) => (category.key === key ? { ...category, ...values } : category));
  },
  remove: (key) => {
    categories = categories.filter((category) => category.key !== key);
  },
};
