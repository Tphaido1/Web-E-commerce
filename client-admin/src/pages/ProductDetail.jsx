import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Empty, Spin, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authService } from '../services/authService.js';
import { productService } from '../services/productService.js';

const formatPrice = (value) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value || 0);

const getErrorMessage = (error) => (
  error.response?.data?.message || error.message || 'Unable to load this product.'
);

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const canManageProducts = ['admin', 'vendor'].includes(authService.getSession()?.user?.role);

  const loadProduct = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const data = await productService.get(id, { signal });
      if (!signal.aborted) setProduct(data);
    } catch (requestError) {
      if (!signal.aborted) setError(getErrorMessage(requestError));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    loadProduct(controller.signal);
    return () => controller.abort();
  }, [loadProduct, reload]);

  if (loading) return <div className="empty-state"><Spin size="large" /></div>;

  if (error) {
    return (
      <div className="page-stack">
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Retry</Button>}
        />
        <Link to="/products">Back to products</Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="empty-state">
        <Empty description="Product not found." />
        <Link to="/products">Back to products</Link>
      </div>
    );
  }

  const variantColumns = [
    { title: 'Color', dataIndex: 'color', key: 'color' },
    { title: 'Size', dataIndex: 'size', key: 'size' },
    { title: 'Price', dataIndex: 'price', key: 'price', render: formatPrice },
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    { title: 'Stock', dataIndex: 'stock', key: 'stock' },
  ];

  return (
    <div className="page-stack">
      <Button type="link" icon={<ArrowLeftOutlined />} className="back-link" onClick={() => navigate('/products')}>
        Back to products
      </Button>
      <section className="page-intro">
        <div>
          <Typography.Text className="eyebrow">PRODUCT DETAIL</Typography.Text>
          <Typography.Title level={1}>{product.name}</Typography.Title>
          <Typography.Paragraph>{product.description}</Typography.Paragraph>
        </div>
        <div>
          <Tag color={product.isActive ? 'green' : 'default'}>{product.isActive ? 'Active' : 'Inactive'}</Tag>
          {canManageProducts && (
            <Button icon={<EditOutlined />} onClick={() => navigate(`/products/${product._id}/edit`)}>
              Edit Product
            </Button>
          )}
        </div>
      </section>
      <div className="detail-grid">
        <Card className="product-preview" variant="borderless">
          {product.image && (
            <img src={product.image} alt={product.name} style={{ maxWidth: '100%', maxHeight: 180 }} />
          )}
          <Typography.Title level={3}>{product.name}</Typography.Title>
          <Typography.Text>{product.category}</Typography.Text>
        </Card>
        <Card className="table-card" variant="borderless">
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Category">{product.category}</Descriptions.Item>
            <Descriptions.Item label="Base Price">{formatPrice(product.price)}</Descriptions.Item>
            <Descriptions.Item label="Sale Price">{product.salePrice ? formatPrice(product.salePrice) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Stock">{product.stock}</Descriptions.Item>
          </Descriptions>
        </Card>
      </div>
      <Card className="table-card detail-variants" variant="borderless">
        <Typography.Title level={4}>Variants</Typography.Title>
        <Table
          rowKey={(variant) => variant._id || variant.sku}
          dataSource={product.variants || []}
          columns={variantColumns}
          pagination={false}
          locale={{ emptyText: <Empty description="No variants." /> }}
          scroll={{ x: 600 }}
        />
      </Card>
    </div>
  );
}

export default ProductDetail;
