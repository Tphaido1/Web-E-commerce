import { CheckCircleOutlined, DollarOutlined, FileExcelOutlined, InboxOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Input, Row, Space, Spin, Statistic, Table, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsService } from '../services/analyticsService.js';
import { orderService } from '../services/orderService.js';
import { reportService } from '../services/reportService.js';
import { subscribeToNewOrders } from '../services/orderEvents.js';

const formatMoney = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);
const statusTranslations = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  shipping: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
};
const formatStatus = (status = '') => statusTranslations[status] || (status.charAt(0).toUpperCase() + status.slice(1));
const statusColors = { pending: '#d9a441', processing: '#548bc4', shipping: '#4db3be', delivered: '#4eaa8b', cancelled: '#ca705b' };
const statusTagColors = { pending: 'gold', processing: 'blue', shipping: 'cyan', delivered: 'green', cancelled: 'red' };
const statsConfig = [
  { title: 'Doanh thu', key: 'revenue', icon: <DollarOutlined />, tone: 'mint', money: true },
  { title: 'Tổng đơn hàng', key: 'totalOrders', icon: <ShoppingCartOutlined />, tone: 'blue' },
  { title: 'Đơn chờ xử lý', key: 'pendingOrders', icon: <InboxOutlined />, tone: 'coral' },
  { title: 'Đơn đã giao', key: 'deliveredOrders', icon: <CheckCircleOutlined />, tone: 'gold' },
];
const errorMessage = (error) => error.response?.data?.message || error.message || 'Không thể tải dữ liệu bảng điều khiển.';

function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recentError, setRecentError] = useState('');
  const [reload, setReload] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [range, setRange] = useState({});
  const [rangeError, setRangeError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setRecentError('');
    setAnalytics(null);
    setRecentOrders([]);
    Promise.allSettled([
      analyticsService.get(range, { signal: controller.signal }),
      orderService.list({ page: 1, limit: 5 }, { signal: controller.signal }),
    ]).then(([summary, orders]) => {
      if (controller.signal.aborted) return;
      if (summary.status === 'fulfilled') setAnalytics(summary.value);
      else setError(errorMessage(summary.reason));
      if (orders.status === 'fulfilled') setRecentOrders(orders.value.orders);
      else setRecentError(errorMessage(orders.reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range, reload]);
  useEffect(() => subscribeToNewOrders(() => setReload((current) => current + 1)), []);

  const applyRange = (event) => {
    event.preventDefault();
    setRangeError('');
    if (Boolean(from) !== Boolean(to)) { setRangeError('Vui lòng chọn cả hai ngày, hoặc để trống để xem 30 ngày gần nhất.'); return; }
    if (from && (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 365)) { setRangeError('Khoảng thời gian không quá 366 ngày và ngày bắt đầu phải trước ngày kết thúc.'); return; }
    setRange(from ? { from, to } : {});
  };
  const columns = [
    { title: 'Mã đơn hàng', dataIndex: 'orderCode', key: 'orderCode', render: (value) => <strong className="table-primary">{value}</strong> },
    { title: 'Khách hàng', dataIndex: ['shippingAddress', 'fullName'], key: 'customer' },
    { title: 'Tổng tiền', dataIndex: 'finalAmount', key: 'finalAmount', render: formatMoney },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (status) => <Tag color={statusTagColors[status]}>{formatStatus(status)}</Tag> },
    { title: 'Thời gian tạo', dataIndex: 'createdAt', key: 'createdAt', render: (value) => value ? new Date(value).toLocaleString('vi-VN') : '—' },
  ];
  const statusData = analytics?.orderStatuses?.filter((item) => item.count > 0).map((item) => ({ ...item, name: formatStatus(item.status) })) || [];

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      await reportService.downloadOrdersExcel({ startDate: range.from, endDate: range.to });
      message.success('Xuất file báo cáo Excel thành công!');
    } catch (err) {
      message.error(err.response?.data?.message || err.message || 'Không thể xuất file báo cáo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <Typography.Text className="eyebrow">TỔNG QUAN</Typography.Text>
          <Typography.Title level={1}>Bảng điều khiển</Typography.Title>
          <Typography.Paragraph>Theo dõi doanh thu và hoạt động đơn hàng của cửa hàng.</Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<FileExcelOutlined />} type="primary" loading={exporting} onClick={handleExport}>
            Xuất Báo Cáo Excel
          </Button>
          <Button onClick={() => setReload((current) => current + 1)} loading={loading}>
            Làm mới
          </Button>
        </Space>
      </section>
      <Card className="dashboard-filter-card" variant="borderless">
        <form className="dashboard-date-filter" onSubmit={applyRange}>
          <label>Từ ngày<Input type="date" aria-label="Ngày bắt đầu" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Đến ngày<Input type="date" aria-label="Ngày kết thúc" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <Button htmlType="submit" type="primary" loading={loading}>Áp dụng</Button>
          <Button onClick={() => { setFrom(''); setTo(''); setRange({}); setRangeError(''); }}>30 ngày qua</Button>
        </form>
        {rangeError && <Alert type="warning" showIcon message={rangeError} style={{ marginTop: 12 }} />}
        {analytics?.range && <Typography.Text className="stat-note">{analytics.range.from} đến {analytics.range.to} · Giờ Việt Nam (UTC+07:00)</Typography.Text>}
      </Card>
      {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Thử lại</Button>} style={{ marginBottom: 16 }} />}
      <Row gutter={[16, 16]}>
        {statsConfig.map((stat) => <Col xs={24} sm={12} xl={6} key={stat.key}><Card className={`stat-card stat-${stat.tone}`} variant="borderless"><div className="stat-heading"><span>{stat.title}</span><span className="stat-icon">{stat.icon}</span></div>{loading ? <Spin /> : analytics ? <Statistic value={analytics.metrics[stat.key]} groupSeparator="," formatter={stat.money ? formatMoney : undefined} /> : <Typography.Text type="secondary">—</Typography.Text>}</Card></Col>)}
      </Row>
      {analytics?.revenuePolicy && <Typography.Paragraph type="secondary" className="analytics-policy">{analytics.revenuePolicy}</Typography.Paragraph>}
      <Row gutter={[16, 16]} className="analytics-charts">
        <Col xs={24} xl={14}><Card title="Doanh thu theo ngày" className="table-card" variant="borderless"><div className="analytics-chart" role="region" aria-label="Biểu đồ doanh thu theo ngày">{loading ? <div className="chart-state"><Spin /></div> : !analytics || !analytics.revenueByDay?.some((day) => day.revenue > 0) ? <div className="chart-state"><Empty description={error ? 'Không thể tải doanh thu.' : 'Không có doanh thu trong khoảng thời gian này.'} /></div> : <ResponsiveContainer width="100%" height={300} minWidth={0}><BarChart data={analytics.revenueByDay} accessibilityLayer margin={{ top: 12, right: 12, left: 12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(date) => date.slice(5)} minTickGap={30} /><YAxis width={72} tickFormatter={(value) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value)} /><Tooltip formatter={(value) => [formatMoney(value), 'Doanh thu']} /><Bar dataKey="revenue" name="Doanh thu" fill="#4eaa8b" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}</div></Card></Col>
        <Col xs={24} xl={10}><Card title="Trạng thái đơn hàng" className="table-card" variant="borderless"><div className="analytics-chart" role="region" aria-label="Biểu đồ trạng thái đơn hàng">{loading ? <div className="chart-state"><Spin /></div> : !statusData.length ? <div className="chart-state"><Empty description={error ? 'Không thể tải trạng thái đơn hàng.' : 'Không có đơn hàng trong khoảng thời gian này.'} /></div> : <ResponsiveContainer width="100%" height={300} minWidth={0}><PieChart accessibilityLayer><Pie data={statusData} dataKey="count" nameKey="name" cx="50%" cy="43%" innerRadius={55} outerRadius={90}>{statusData.map((item) => <Cell key={item.status} fill={statusColors[item.status] || '#7d8991'} />)}</Pie><Tooltip formatter={(value) => [`${value} đơn hàng`]} /><Legend verticalAlign="bottom" /></PieChart></ResponsiveContainer>}</div></Card></Col>
      </Row>
      {recentError && <Alert type="error" showIcon message={`Đơn hàng mới nhất: ${recentError}`} style={{ marginBottom: 16 }} />}
      <Card className="table-card" variant="borderless" title={<Typography.Title level={4} style={{ margin: 0 }}>Đơn hàng mới nhất</Typography.Title>} extra={<Link to="/orders">Xem tất cả đơn hàng</Link>}><Table rowKey="_id" columns={columns} dataSource={recentOrders} loading={loading} pagination={false} scroll={{ x: 700 }} locale={{ emptyText: <Empty description={recentError ? 'Không thể tải đơn hàng.' : 'Chưa có đơn hàng nào.'} /> }} /></Card>
    </div>
  );
}

export default Dashboard;
