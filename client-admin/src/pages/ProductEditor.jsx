import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Typography, message } from 'antd';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProductForm from '../components/ProductForm.jsx';
import { categoryService } from '../services/categoryService.js';
import { productService } from '../services/productService.js';

function ProductEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const product = id ? productService.get(id) : null;
  const categories = categoryService.list();

  if (id && !product) return <div className="empty-state"><Typography.Title level={3}>Product not found</Typography.Title><Link to="/products">Back to products</Link></div>;

  const handleSubmit = async (values) => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const normalized = { ...values, image: product?.image || values.name.slice(0, 2).toUpperCase(), stock: values.variants.reduce((total, variant) => total + variant.stock, 0) };
    if (id) productService.update(id, normalized); else productService.create(normalized);
    message.success(id ? 'Product updated.' : 'Product created.');
    navigate('/products');
  };

  return <div className="page-stack"><Button type="link" icon={<ArrowLeftOutlined />} className="back-link" onClick={() => navigate('/products')}>Back to products</Button><section className="page-intro"><div><Typography.Text className="eyebrow">CATALOG EDITOR</Typography.Text><Typography.Title level={1}>{id ? 'Edit Product' : 'Add Product'}</Typography.Title><Typography.Paragraph>{id ? 'Update product information and variants.' : 'Create a product draft for the catalog.'}</Typography.Paragraph></div></section><ProductForm initialValues={product || undefined} categories={categories} loading={loading} onSubmit={handleSubmit} isSkuTaken={(sku) => productService.isSkuTaken(sku, id)} /></div>;
}

export default ProductEditor;