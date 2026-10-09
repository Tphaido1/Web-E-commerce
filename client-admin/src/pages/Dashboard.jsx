import { CheckCircleOutlined, DollarOutlined, InboxOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Input, Row, Spin, Statistic, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsService } from '../services/analyticsService.js';
import { orderService } from '../services/orderService.js';
import { subscribeToNewOrders } from '../services/orderEvents.js';

const formatMoney = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);
const formatStatus = (status = '') => status.charAt(0).toUpperCase() + status.slice(1);
const statusColors = { pending: '#d9a441', processing: '#548bc4', shipping: '#4db3be', delivered: '#4eaa8b', cancelled: '#ca705b' };
const statusTagColors = { pending: 'gold', processing: 'blue', shipping: 'cyan', delivered: 'green', cancelled: 'red' };
const statsConfig = [
  { title: 'Revenue', key: 'revenue', icon: <DollarOutlined />, tone: 'mint', money: true },
  { title: 'Total Orders', key: 'totalOrders', icon: <ShoppingCartOutlined />, tone: 'blue' },
  { title: 'Pending Orders', key: 'pendingOrders', icon: <InboxOutlined />, tone: 'coral' },
  { title: 'Delivered Orders', key: 'deliveredOrders', icon: <CheckCircleOutlined />, tone: 'gold' },
];
const errorMessage = (error) => error.response?.data?.message || error.message || 'Unable to load dashboard.';

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
    if (Boolean(from) !== Boolean(to)) { setRangeError('Choose both dates, or leave both empty for the last 30 days.'); return; }
    if (from && (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 365)) { setRangeError('Choose a date range of up to 366 days with the start before the end.'); return; }
    setRange(from ? { from, to } : {});
  };
  const columns = [
    { title: 'Order ID', dataIndex: 'orderCode', key: 'orderCode', render: (value) => <strong className="table-primary">{value}</strong> },
    { title: 'Customer', dataIndex: ['shippingAddress', 'fullName'], key: 'customer' },
    { title: 'Total', dataIndex: 'finalAmount', key: 'finalAmount', render: formatMoney },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (status) => <Tag color={statusTagColors[status]}>{formatStatus(status)}</Tag> },
    { title: 'Created At', dataIndex: 'createdAt', key: 'createdAt', render: (value) => value ? new Date(value).toLocaleString() : '—' },
  ];
  const statusData = analytics?.orderStatuses?.filter((item) => item.count > 0).map((item) => ({ ...item, name: formatStatus(item.status) })) || [];

  return (
    <div className="page-stack">
      <section className="page-intro"><div><Typography.Text className="eyebrow">OVERVIEW</Typography.Text><Typography.Title level={1}>Dashboard</Typography.Title><Typography.Paragraph>Track revenue and order activity for your workspace.</Typography.Paragraph></div><Button onClick={() => setReload((current) => current + 1)} loading={loading}>Refresh</Button></section>
      <Card className="dashboard-filter-card" variant="borderless">
        <form className="dashboard-date-filter" onSubmit={applyRange}>
          <label>From<Input type="date" aria-label="Analytics start date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>To<Input type="date" aria-label="Analytics end date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <Button htmlType="submit" type="primary" loading={loading}>Apply dates</Button>
          <Button onClick={() => { setFrom(''); setTo(''); setRange({}); setRangeError(''); }}>Last 30 days</Button>
        </form>
        {rangeError && <Alert type="warning" showIcon message={rangeError} style={{ marginTop: 12 }} />}
        {analytics?.range && <Typography.Text className="stat-note">{analytics.range.from} to {analytics.range.to} · Vietnam time (UTC+07:00)</Typography.Text>}
      </Card>
      {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Retry</Button>} style={{ marginBottom: 16 }} />}
      <Row gutter={[16, 16]}>
        {statsConfig.map((stat) => <Col xs={24} sm={12} xl={6} key={stat.key}><Card className={`stat-card stat-${stat.tone}`} variant="borderless"><div className="stat-heading"><span>{stat.title}</span><span className="stat-icon">{stat.icon}</span></div>{loading ? <Spin /> : analytics ? <Statistic value={analytics.metrics[stat.key]} groupSeparator="," formatter={stat.money ? formatMoney : undefined} /> : <Typography.Text type="secondary">—</Typography.Text>}</Card></Col>)}
      </Row>
      {analytics?.revenuePolicy && <Typography.Paragraph type="secondary" className="analytics-policy">{analytics.revenuePolicy}</Typography.Paragraph>}
      <Row gutter={[16, 16]} className="analytics-charts">
        <Col xs={24} xl={14}><Card title="Daily revenue" className="table-card" variant="borderless"><div className="analytics-chart" role="region" aria-label="Daily revenue chart">{loading ? <div className="chart-state"><Spin /></div> : !analytics || !analytics.revenueByDay?.some((day) => day.revenue > 0) ? <div className="chart-state"><Empty description={error ? 'Revenue could not be loaded.' : 'No revenue in this period.'} /></div> : <ResponsiveContainer width="100%" height={300} minWidth={0}><BarChart data={analytics.revenueByDay} accessibilityLayer margin={{ top: 12, right: 12, left: 12, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tickFormatter={(date) => date.slice(5)} minTickGap={30} /><YAxis width={72} tickFormatter={(value) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value)} /><Tooltip formatter={(value) => [formatMoney(value), 'Revenue']} /><Bar dataKey="revenue" name="Revenue" fill="#4eaa8b" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}</div></Card></Col>
        <Col xs={24} xl={10}><Card title="Order statuses" className="table-card" variant="borderless"><div className="analytics-chart" role="region" aria-label="Order status chart">{loading ? <div className="chart-state"><Spin /></div> : !statusData.length ? <div className="chart-state"><Empty description={error ? 'Order statuses could not be loaded.' : 'No orders in this period.'} /></div> : <ResponsiveContainer width="100%" height={300} minWidth={0}><PieChart accessibilityLayer><Pie data={statusData} dataKey="count" nameKey="name" cx="50%" cy="43%" innerRadius={55} outerRadius={90}>{statusData.map((item) => <Cell key={item.status} fill={statusColors[item.status] || '#7d8991'} />)}</Pie><Tooltip formatter={(value) => [`${value} orders`]} /><Legend verticalAlign="bottom" /></PieChart></ResponsiveContainer>}</div></Card></Col>
      </Row>
      {recentError && <Alert type="error" showIcon message={`Recent orders: ${recentError}`} style={{ marginBottom: 16 }} />}
      <Card className="table-card" variant="borderless" title={<Typography.Title level={4} style={{ margin: 0 }}>Recent Orders</Typography.Title>} extra={<Link to="/orders">View all orders</Link>}><Table rowKey="_id" columns={columns} dataSource={recentOrders} loading={loading} pagination={false} scroll={{ x: 700 }} locale={{ emptyText: <Empty description={recentError ? 'Orders could not be loaded.' : 'No orders yet.'} /> }} /></Card>
    </div>
  );
}

export default Dashboard;
