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
  error.response?.data?.message || error.message || 'Không thể tải thông tin sản phẩm.'
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
          action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Thử lại</Button>}
        />
        <Link to="/products">Quay lại danh sách sản phẩm</Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="empty-state">
        <Empty description="Không tìm thấy sản phẩm." />
        <Link to="/products">Quay lại danh sách sản phẩm</Link>
      </div>
    );
  }

  const variantColumns = [
    { title: 'Màu sắc', dataIndex: 'color', key: 'color' },
    { title: 'Kích cỡ', dataIndex: 'size', key: 'size' },
    { title: 'Giá', dataIndex: 'price', key: 'price', render: formatPrice },
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    { title: 'Tồn kho', dataIndex: 'stock', key: 'stock' },
  ];

  return (
    <div className="page-stack">
      <Button type="link" icon={<ArrowLeftOutlined />} className="back-link" onClick={() => navigate('/products')}>
        Quay lại danh sách sản phẩm
      </Button>
      <section className="page-intro">
        <div>
          <Typography.Text className="eyebrow">CHI TIẾT SẢN PHẨM</Typography.Text>
          <Typography.Title level={1}>{product.name}</Typography.Title>
          <Typography.Paragraph>{product.description}</Typography.Paragraph>
        </div>
        <div>
          <Tag color={product.isActive ? 'green' : 'default'}>{product.isActive ? 'Đang bán' : 'Tạm ẩn'}</Tag>
          {canManageProducts && (
            <Button icon={<EditOutlined />} onClick={() => navigate(`/products/${product._id}/edit`)}>
              Chỉnh sửa sản phẩm
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
            <Descriptions.Item label="Danh mục">{product.category}</Descriptions.Item>
            <Descriptions.Item label="Giá gốc">{formatPrice(product.price)}</Descriptions.Item>
            <Descriptions.Item label="Giá khuyến mãi">{product.salePrice ? formatPrice(product.salePrice) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Tồn kho">{product.stock}</Descriptions.Item>
          </Descriptions>
        </Card>
      </div>
      <Card className="table-card detail-variants" variant="borderless">
        <Typography.Title level={4}>Danh sách biến thể</Typography.Title>
        <Table
          rowKey={(variant) => variant._id || variant.sku}
          dataSource={product.variants || []}
          columns={variantColumns}
          pagination={false}
          locale={{ emptyText: <Empty description="Chưa có biến thể." /> }}
          scroll={{ x: 600 }}
        />
      </Card>
    </div>
  );
}

export default ProductDetail;
