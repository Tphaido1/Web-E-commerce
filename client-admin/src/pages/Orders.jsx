import { Card, Table, Tag, Typography } from 'antd';

const orders = [
  { key: '1', id: '#ORD-1048', customer: 'Maya Nguyen', total: '$249.00', status: 'Processing', createdAt: 'Sep 18, 2026' },
  { key: '2', id: '#ORD-1047', customer: 'Ethan Tran', total: '$129.00', status: 'Delivered', createdAt: 'Sep 17, 2026' },
  { key: '3', id: '#ORD-1046', customer: 'Linh Pham', total: '$98.00', status: 'Pending', createdAt: 'Sep 16, 2026' },
  { key: '4', id: '#ORD-1045', customer: 'Noah Le', total: '$273.00', status: 'Delivered', createdAt: 'Sep 15, 2026' },
];

const statusColors = { Processing: 'blue', Delivered: 'green', Pending: 'gold' };
const columns = [
  { title: 'Order ID', dataIndex: 'id', key: 'id', render: (value) => <strong className="table-primary">{value}</strong> },
  { title: 'Customer', dataIndex: 'customer', key: 'customer' },
  { title: 'Total', dataIndex: 'total', key: 'total' },
  { title: 'Status', dataIndex: 'status', key: 'status', render: (value) => <Tag color={statusColors[value]}>{value}</Tag> },
  { title: 'Created At', dataIndex: 'createdAt', key: 'createdAt' },
];

function Orders() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><Typography.Text className="eyebrow">OPERATIONS</Typography.Text><Typography.Title level={1}>Orders</Typography.Title><Typography.Paragraph>Review recent order activity at a glance.</Typography.Paragraph></div>
        <Tag className="mock-tag">MOCK DATA</Tag>
      </section>
      <Card className="table-card" variant="borderless">
        <Table columns={columns} dataSource={orders} pagination={false} scroll={{ x: 700 }} />
      </Card>
    </div>
  );
}

export default Orders;