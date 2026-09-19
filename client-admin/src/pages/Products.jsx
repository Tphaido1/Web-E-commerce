import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Input, Modal, Select, Table, Tag, Typography, message } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { categoryService } from '../services/categoryService.js';
import { productService } from '../services/productService.js';

function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState(() => productService.list());
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState();
  const [status, setStatus] = useState();
  const categories = categoryService.list();
  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesQuery = `${product.name} ${product.sku}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!category || product.category === category) && (!status || product.status === status);
  }), [products, query, category, status]);
  const removeProduct = (product) => Modal.confirm({ title: `Delete ${product.name}?`, content: 'This mock product will be removed from the table.', okText: 'Delete', okButtonProps: { danger: true }, onOk: () => { productService.remove(product.id); setProducts(productService.list()); message.success('Product deleted.'); } });
  const columns = [
    { title: 'Image', dataIndex: 'image', key: 'image', render: (value) => <div className="table-product-avatar">{value}</div> },
    { title: 'Product Name', dataIndex: 'name', key: 'name', render: (value, product) => <div><strong className="table-primary">{value}</strong><span className="table-secondary">{product.sku}</span></div> },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Price', dataIndex: 'price', key: 'price', render: (value) => `$${value.toFixed(2)}` },
    { title: 'Stock', dataIndex: 'stock', key: 'stock' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (value) => <Tag color={value === 'Active' ? 'green' : value === 'Draft' ? 'gold' : 'red'}>{value}</Tag> },
    { title: 'Actions', key: 'actions', render: (_, product) => <div className="table-actions"><Button type="text" icon={<EyeOutlined />} aria-label={`View ${product.name}`} onClick={() => navigate(`/products/${product.id}`)} /><Button type="text" icon={<EditOutlined />} aria-label={`Edit ${product.name}`} onClick={() => navigate(`/products/${product.id}/edit`)} /><Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${product.name}`} onClick={() => removeProduct(product)} /></div> },
  ];
  return <div className="page-stack"><section className="page-intro"><div><Typography.Text className="eyebrow">CATALOG</Typography.Text><Typography.Title level={1}>Products</Typography.Title><Typography.Paragraph>Manage the products and variants in your catalog.</Typography.Paragraph></div><Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/products/new')}>Add Product</Button></section><Card className="table-card" variant="borderless"><div className="table-toolbar product-toolbar"><Input allowClear prefix={<SearchOutlined />} placeholder="Search product or SKU" value={query} onChange={(event) => setQuery(event.target.value)} /><Select allowClear placeholder="Category" options={categories.map((item) => ({ value: item.name, label: item.name }))} value={category} onChange={setCategory} /><Select allowClear placeholder="Status" options={['Active', 'Draft', 'Out of stock'].map((item) => ({ value: item, label: item }))} value={status} onChange={setStatus} /><Tag className="mock-tag">MOCK DATA</Tag></div><Table columns={columns} dataSource={filteredProducts} pagination={false} scroll={{ x: 980 }} /></Card></div>;
}

export default Products;
