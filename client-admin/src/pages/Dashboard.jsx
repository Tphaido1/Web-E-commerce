import { ArrowUpOutlined, InboxOutlined, ShoppingCartOutlined, TagsOutlined } from '@ant-design/icons';
import { Card, Col, Row, Statistic, Tag, Typography } from 'antd';

const stats = [
  { title: 'Total Products', value: 248, icon: <TagsOutlined />, tone: 'blue', note: '+12% this month' },
  { title: 'Total Orders', value: 1284, icon: <ShoppingCartOutlined />, tone: 'mint', note: '+8.4% this month' },
  { title: 'Revenue', value: 48250, prefix: '$', icon: <ArrowUpOutlined />, tone: 'gold', note: '+14.6% this month' },
  { title: 'Pending Orders', value: 36, icon: <InboxOutlined />, tone: 'coral', note: 'Needs attention' },
];

function Dashboard() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <Typography.Text className="eyebrow">OVERVIEW</Typography.Text>
          <Typography.Title level={1}>Dashboard</Typography.Title>
          <Typography.Paragraph>Keep a clear view of your store workspace.</Typography.Paragraph>
        </div>
        <Tag className="mock-tag">MOCK DATA</Tag>
      </section>
      <Row gutter={[16, 16]}>
        {stats.map((stat) => (
          <Col xs={24} sm={12} xl={6} key={stat.title}>
            <Card className={`stat-card stat-${stat.tone}`} variant="borderless">
              <div className="stat-heading"><span>{stat.title}</span><span className="stat-icon">{stat.icon}</span></div>
              <Statistic value={stat.value} prefix={stat.prefix} groupSeparator="," />
              <span className="stat-note">{stat.note}</span>
            </Card>
          </Col>
        ))}
      </Row>
      <Card className="welcome-panel" variant="borderless">
        <div>
          <Typography.Text className="eyebrow">SPRINT 01</Typography.Text>
          <Typography.Title level={3}>Your admin workspace is ready.</Typography.Title>
          <Typography.Paragraph>Use the navigation to browse the product and order skeletons prepared for the next sprint.</Typography.Paragraph>
        </div>
        <div className="panel-grid-mark"><span /><span /><span /><span /></div>
      </Card>
    </div>
  );
}

export default Dashboard;