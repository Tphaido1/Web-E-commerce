import {
  HeartFilled,
  HeartOutlined,
  ReloadOutlined,
  StarFilled,
  TagsOutlined,
  TeamOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Modal,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { userService } from '../services/userService.js';

const { Title, Text, Paragraph } = Typography;

const formatMoney = (val) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(val || 0);

const CHART_COLORS = ['#b84b39', '#e07a5f', '#3d5a80', '#2a9d8f', '#e9c46a', '#f4a261', '#8338ec', '#3a86ff'];

function WishlistAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await userService.getWishlistAnalytics();
      setData(result);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể tải thống kê yêu thích.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const metrics = data?.metrics || {
    totalUsersWithWishlist: 0,
    totalWishlistItems: 0,
    topItemCount: 0,
  };

  const topProducts = data?.topProducts || [];
  const categoryBreakdown = data?.categoryBreakdown || [];

  const topLovedProduct = topProducts[0];
  const topCategory = categoryBreakdown[0];

  const columns = [
    {
      title: 'Hạng',
      key: 'rank',
      width: 65,
      align: 'center',
      render: (_, __, index) => {
        const rank = index + 1;
        let color = 'default';
        if (rank === 1) color = 'gold';
        else if (rank === 2) color = 'cyan';
        else if (rank === 3) color = 'orange';
        return <Badge count={rank} style={{ backgroundColor: color === 'gold' ? '#faad14' : color === 'cyan' ? '#13c2c2' : color === 'orange' ? '#fa8c16' : '#bfbfbf' }} />;
      },
    },
    {
      title: 'Sản phẩm',
      key: 'product',
      render: (_, record) => (
        <Space size="middle">
          <Avatar
            shape="square"
            size={52}
            src={record.image}
            icon={<ShoppingOutlined />}
            style={{ borderRadius: 6, objectFit: 'cover' }}
          />
          <div>
            <div>
              <Link to={`/products/${record.productId}`} style={{ fontWeight: 600, color: '#18181b' }}>
                {record.name}
              </Link>
            </div>
            <Space size="small" style={{ marginTop: 4 }}>
              <Tag color="geekblue">{record.category}</Tag>
              <Text strong style={{ color: '#b84b39' }}>{formatMoney(record.price)}</Text>
            </Space>
          </div>
        </Space>
      ),
    },
    {
      title: 'Lượt yêu thích',
      dataIndex: 'likesCount',
      key: 'likesCount',
      sorter: (a, b) => a.likesCount - b.likesCount,
      defaultSortOrder: 'descend',
      width: 150,
      render: (count) => (
        <Space>
          <HeartFilled style={{ color: '#b84b39', fontSize: 16 }} />
          <Text strong style={{ fontSize: 15 }}>{count}</Text>
          <Text type="secondary">lượt thích</Text>
        </Space>
      ),
    },
    {
      title: 'Đánh giá',
      key: 'rating',
      width: 140,
      render: (_, record) => (
        <Space size={4}>
          <StarFilled style={{ color: '#faad14' }} />
          <Text strong>{record.ratingAverage || 5.0}</Text>
          <Text type="secondary">({record.reviewCount || 0})</Text>
        </Space>
      ),
    },
    {
      title: 'Gợi ý sản phẩm tương đương',
      key: 'equivalent',
      render: (_, record) => {
        const equivalents = record.equivalentProducts || [];
        if (equivalents.length === 0) {
          return <Text type="secondary" italic>Chưa có sản phẩm tương đương cùng loại</Text>;
        }
        return (
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap size="small">
              {equivalents.map((eq) => (
                <Tag
                  key={eq._id}
                  color="volcano"
                  style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 4 }}
                  onClick={() => setSelectedProduct(record)}
                >
                  {eq.name} ({formatMoney(eq.price)})
                </Tag>
              ))}
            </Space>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, color: '#3d5a80' }}
              onClick={() => setSelectedProduct(record)}
            >
              Xem chi tiết gợi ý tương đương &rarr;
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Thống kê Sản phẩm Yêu thích & Gợi ý Tương đương
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            Phân tích mức độ quan tâm của khách hàng qua lượt lưu yêu thích và cơ chế gợi ý sản phẩm tự động.
          </Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchAnalytics} loading={loading}>
          Làm mới dữ liệu
        </Button>
      </div>

      {error && (
        <Alert
          message="Lỗi tải dữ liệu"
          description={error}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 20 }}
        />
      )}

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#8c8c8c' }}>Đang phân tích dữ liệu yêu thích...</div>
        </div>
      ) : (
        <>
          {/* Key KPI Metrics */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false} className="metric-card" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <Statistic
                  title="Khách hàng lưu yêu thích"
                  value={metrics.totalUsersWithWishlist}
                  prefix={<TeamOutlined style={{ color: '#3d5a80', marginRight: 8 }} />}
                  suffix="người"
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false} className="metric-card" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <Statistic
                  title="Tổng lượt lưu sản phẩm"
                  value={metrics.totalWishlistItems}
                  prefix={<HeartFilled style={{ color: '#b84b39', marginRight: 8 }} />}
                  suffix="lượt"
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false} className="metric-card" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>Sản phẩm yêu thích nhất</div>
                <div style={{ fontWeight: 600, fontSize: 16, color: '#18181b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {topLovedProduct ? topLovedProduct.name : 'Chưa có dữ liệu'}
                </div>
                <div style={{ marginTop: 4, color: '#b84b39', fontWeight: 600, fontSize: 13 }}>
                  {topLovedProduct ? `${topLovedProduct.likesCount} lượt yêu thích` : '-'}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card bordered={false} className="metric-card" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>Danh mục dẫn đầu xu hướng</div>
                <div style={{ fontWeight: 600, fontSize: 16, color: '#2a9d8f' }}>
                  <TagsOutlined style={{ marginRight: 6 }} />
                  {topCategory ? topCategory.category : 'Chưa có dữ liệu'}
                </div>
                <div style={{ marginTop: 4, color: '#8c8c8c', fontSize: 13 }}>
                  {topCategory ? `${topCategory.totalLikes || topCategory.count || 0} lượt yêu thích` : '-'}
                </div>
              </Card>
            </Col>
          </Row>

          {/* Charts Row */}
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} lg={14}>
              <Card
                title="Top Sản phẩm được Khách hàng Lưu Yêu thích Nhiều Nhất"
                bordered={false}
                style={{ height: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              >
                {topProducts.length > 0 ? (
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topProducts.slice(0, 7).map((p) => ({
                          name: p.name.length > 18 ? `${p.name.slice(0, 18)}...` : p.name,
                          likes: p.likesCount,
                        }))}
                        margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="name" angle={-15} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="likes" name="Lượt thích" fill="#b84b39" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty description="Chưa có dữ liệu lượt thích sản phẩm" />
                )}
              </Card>
            </Col>

            <Col xs={24} lg={10}>
              <Card
                title="Phân bố Sở thích theo Danh mục"
                bordered={false}
                style={{ height: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              >
                {categoryBreakdown.length > 0 ? (
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryBreakdown}
                          dataKey="totalLikes"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          innerRadius={45}
                          paddingAngle={3}
                          label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {categoryBreakdown.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`${value} lượt thích`, name]} />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty description="Chưa có dữ liệu phân bố danh mục" />
                )}
              </Card>
            </Col>
          </Row>

          {/* Top products table with Equivalent product recommendations */}
          <Card
            title={
              <Space>
                <HeartOutlined style={{ color: '#b84b39' }} />
                <span>Bảng Thống kê & Cơ chế Gợi ý Sản phẩm Tương đương cho Khách hàng</span>
              </Space>
            }
            bordered={false}
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
          >
            <Table
              dataSource={topProducts}
              columns={columns}
              rowKey="productId"
              pagination={{ pageSize: 8, showTotal: (total) => `Tổng cộng ${total} sản phẩm` }}
              locale={{ emptyText: 'Chưa có sản phẩm nào được đưa vào danh sách yêu thích' }}
            />
          </Card>
        </>
      )}

      {/* Modal hiển thị chi tiết sản phẩm tương đương */}
      <Modal
        title={`Gợi ý sản phẩm tương đương cho "${selectedProduct?.name}"`}
        open={Boolean(selectedProduct)}
        onCancel={() => setSelectedProduct(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedProduct(null)}>
            Đóng
          </Button>,
        ]}
        width={680}
      >
        {selectedProduct && (
          <div>
            <Paragraph type="secondary">
              Khi khách hàng bày tỏ sự yêu thích với <strong>{selectedProduct.name}</strong> (danh mục: <Tag color="blue">{selectedProduct.category}</Tag>), hệ thống sẽ tự động đề xuất các sản phẩm tương đương sau trên trang Chi tiết sản phẩm, Giỏ hàng và trang Yêu thích của khách hàng:
            </Paragraph>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              {(selectedProduct.equivalentProducts || []).map((item) => (
                <Col xs={24} sm={8} key={item._id}>
                  <Card
                    hoverable
                    cover={
                      <div style={{ height: 160, overflow: 'hidden', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.image ? (
                          <img
                            alt={item.name}
                            src={item.image}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <ShoppingOutlined style={{ fontSize: 36, color: '#bfbfbf' }} />
                        )}
                      </div>
                    }
                    size="small"
                  >
                    <Card.Meta
                      title={<span style={{ fontSize: 13 }}>{item.name}</span>}
                      description={
                        <div style={{ marginTop: 6 }}>
                          <div style={{ color: '#b84b39', fontWeight: 600 }}>{formatMoney(item.price)}</div>
                          <Tag color="geekblue" style={{ marginTop: 4 }}>{item.category}</Tag>
                        </div>
                      }
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default WishlistAnalytics;
