import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Tag, Table, Typography } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { productService } from '../services/productService.js';

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const product = productService.get(id);
  if (!product) return <div className="empty-state"><Typography.Title level={3}>Product not found</Typography.Title><Link to="/products">Back to products</Link></div>;
  return <div className="page-stack"><Button type="link" icon={<ArrowLeftOutlined />} className="back-link" onClick={() => navigate('/products')}>Back to products</Button><section className="page-intro"><div><Typography.Text className="eyebrow">PRODUCT DETAIL</Typography.Text><Typography.Title level={1}>{product.name}</Typography.Title><Typography.Paragraph>{product.description}</Typography.Paragraph></div><Tag color={product.status === 'Active' ? 'green' : 'red'}>{product.status}</Tag></section><div className="detail-grid"><Card className="product-preview" variant="borderless"><div className="large-product-avatar">{product.image}</div><Typography.Title level={3}>{product.name}</Typography.Title><Typography.Text>{product.category}</Typography.Text></Card><Card className="table-card" variant="borderless"><Descriptions column={1} bordered><Descriptions.Item label="SKU">{product.sku}</Descriptions.Item><Descriptions.Item label="Category">{product.category}</Descriptions.Item><Descriptions.Item label="Price">${product.price.toFixed(2)}</Descriptions.Item><Descriptions.Item label="Stock">{product.stock}</Descriptions.Item></Descriptions></Card></div><Card className="table-card detail-variants" variant="borderless"><Typography.Title level={4}>Variants</Typography.Title><Table pagination={false} rowKey="sku" dataSource={product.variants} columns={[{ title: 'Color', dataIndex: 'color' }, { title: 'Size', dataIndex: 'size' }, { title: 'Price', dataIndex: 'price', render: (value) => `$${value.toFixed(2)}` }, { title: 'SKU', dataIndex: 'sku' }, { title: 'Stock', dataIndex: 'stock' }]} /></Card></div>;
}

export default ProductDetail;
