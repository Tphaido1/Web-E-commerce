import { SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '../services/authService.js';
import { orderService } from '../services/orderService.js';
import { subscribeToNewOrders } from '../services/orderEvents.js';

const orderStatuses = ['pending', 'processing', 'shipping', 'delivered', 'cancelled'];
const paymentStatuses = ['unpaid', 'paid', 'failed', 'refunded'];
const statusColors = {
  pending: 'gold',
  processing: 'blue',
  shipping: 'cyan',
  delivered: 'green',
  cancelled: 'red',
};

const formatStatus = (status = '') => (
  status.charAt(0).toUpperCase() + status.slice(1)
);

const formatMoney = (value) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value || 0);

const formatDate = (value) => (
  value ? new Date(value).toLocaleString() : '—'
);

const getErrorMessage = (error) => (
  error.response?.data?.message || error.message || 'Unable to complete the order request.'
);

function Orders() {
  const user = authService.getSession()?.user;
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState();
  const [paymentStatus, setPaymentStatus] = useState();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [reload, setReload] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [cancelledReason, setCancelledReason] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [updating, setUpdating] = useState(false);
  const updateInFlight = useRef(false);
  const canManageOrders = ['admin', 'vendor'].includes(user?.role);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPagination((current) => ({ ...current, current: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadOrders = useCallback(async (signal) => {
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
    };
    if (search) params.search = search;
    if (status) params.status = status;
    if (paymentStatus) params.paymentStatus = paymentStatus;

    setLoading(true);
    setLoadError('');
    try {
      const data = await orderService.list(params, { signal });
      setOrders(data.orders);
      setPagination((current) => ({
        ...current,
        current: data.pagination.page,
        pageSize: data.pagination.limit,
        total: data.pagination.total,
      }));
    } catch (error) {
      if (!signal.aborted) setLoadError(getErrorMessage(error));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, search, status, paymentStatus]);

  useEffect(() => {
    const controller = new AbortController();
    loadOrders(controller.signal);
    return () => controller.abort();
  }, [loadOrders, reload]);

  useEffect(
    () => subscribeToNewOrders(() => setReload((current) => current + 1)),
    [],
  );

  const startStatusUpdate = (order, nextStatus) => {
    setPendingUpdate({ order, status: nextStatus });
    setCancelledReason('');
    setUpdateError('');
  };

  const confirmStatusUpdate = async () => {
    if (!pendingUpdate || updateInFlight.current) return;
    updateInFlight.current = true;
    setUpdating(true);
    setUpdateError('');
    try {
      const payload = { status: pendingUpdate.status };
      if (pendingUpdate.status === 'cancelled') {
        payload.cancelledReason = cancelledReason.trim()
          || `Cancelled by ${user.role}`;
      }
      await orderService.updateStatus(pendingUpdate.order._id, payload);
      setPendingUpdate(null);
      message.success(`Order ${pendingUpdate.order.orderCode} updated to ${pendingUpdate.status}.`);
      setReload((current) => current + 1);
    } catch (error) {
      setUpdateError(getErrorMessage(error));
    } finally {
      updateInFlight.current = false;
      setUpdating(false);
    }
  };

  const columns = useMemo(() => [
    {
      title: 'Order ID',
      dataIndex: 'orderCode',
      key: 'orderCode',
      render: (value, order) => (
        <Button type="link" onClick={() => setSelectedOrder(order)}>{value}</Button>
      ),
    },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, order) => (
        <div>
          <strong className="table-primary">{order.shippingAddress?.fullName || '—'}</strong>
          <span className="table-secondary">{order.user?.email || order.shippingAddress?.phone || ''}</span>
        </div>
      ),
    },
    {
      title: 'Items',
      key: 'items',
      render: (_, order) => order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
    },
    {
      title: 'Total',
      dataIndex: 'finalAmount',
      key: 'finalAmount',
      render: formatMoney,
    },
    {
      title: 'Payment',
      key: 'payment',
      render: (_, order) => (
        <div>
          <span>{order.paymentMethod || '—'}</span>
          <span className="table-secondary">{formatStatus(order.paymentStatus)}</span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value) => <Tag color={statusColors[value]}>{formatStatus(value)}</Tag>,
    },
    { title: 'Created At', dataIndex: 'createdAt', key: 'createdAt', render: formatDate },
    ...(canManageOrders
      ? [{
        title: 'Update Status',
        key: 'updateStatus',
        render: (_, order) => {
          const availableStatuses = order.status === 'cancelled'
            ? []
            : order.status === 'delivered'
              ? []
              : orderStatuses.filter((nextStatus) => nextStatus !== order.status);
          return (
            <Select
              aria-label={`Update status for ${order.orderCode}`}
              placeholder={order.canUpdateStatus === false ? 'Admin manages this order' : 'Choose status'}
              value={undefined}
              disabled={order.canUpdateStatus === false || !availableStatuses.length || updating}
              options={availableStatuses.map((value) => ({ value, label: formatStatus(value) }))}
              onChange={(nextStatus) => startStatusUpdate(order, nextStatus)}
              style={{ minWidth: 145 }}
            />
          );
        },
      }]
      : []),
  ], [canManageOrders, updating]);

  const detailItems = selectedOrder?.items || [];
  const address = selectedOrder?.shippingAddress || {};

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <Typography.Text className="eyebrow">OPERATIONS</Typography.Text>
          <Typography.Title level={1}>Orders</Typography.Title>
          <Typography.Paragraph>Review and manage customer orders.</Typography.Paragraph>
        </div>
      </section>
      {loadError && (
        <Alert
          type="error"
          showIcon
          message={loadError}
          action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Retry</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="table-card" variant="borderless">
        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search order code, customer, or phone"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            allowClear
            placeholder="Order status"
            value={status}
            options={orderStatuses.map((value) => ({ value, label: formatStatus(value) }))}
            onChange={(value) => {
              setStatus(value);
              setPagination((current) => ({ ...current, current: 1 }));
            }}
            style={{ minWidth: 150 }}
          />
          <Select
            allowClear
            placeholder="Payment status"
            value={paymentStatus}
            options={paymentStatuses.map((value) => ({ value, label: formatStatus(value) }))}
            onChange={(value) => {
              setPaymentStatus(value);
              setPagination((current) => ({ ...current, current: 1 }));
            }}
            style={{ minWidth: 150 }}
          />
        </div>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={orders}
          loading={loading}
          scroll={{ x: 1100 }}
          locale={{
            emptyText: loadError
              ? <Empty description="Orders could not be loaded." />
              : <Empty description="No orders found." />,
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            onChange: (current, pageSize) => setPagination((value) => ({ ...value, current, pageSize })),
          }}
        />
      </Card>

      <Modal
        title={`Order ${selectedOrder?.orderCode || ''}`}
        open={Boolean(selectedOrder)}
        onCancel={() => setSelectedOrder(null)}
        footer={<Button onClick={() => setSelectedOrder(null)}>Close</Button>}
        width={800}
      >
        {selectedOrder && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {user?.role === 'vendor' && <Alert type="info" showIcon message={selectedOrder.canUpdateStatus === false ? 'Only your items and amounts are shown. An Admin manages fulfillment for this order because it includes other sellers.' : 'Only your items and amounts are shown.'} />}
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Customer">{address.fullName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Account email">{selectedOrder.user?.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{address.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Address">
                {[address.address, address.ward, address.district, address.city].filter(Boolean).join(', ') || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Payment method">{selectedOrder.paymentMethod || '—'}</Descriptions.Item>
              <Descriptions.Item label="Payment status">
                <Tag>{formatStatus(selectedOrder.paymentStatus)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Order status">
                <Tag color={statusColors[selectedOrder.status]}>{formatStatus(selectedOrder.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Created at">{formatDate(selectedOrder.createdAt)}</Descriptions.Item>
              {address.notes && <Descriptions.Item label="Delivery notes" span={2}>{address.notes}</Descriptions.Item>}
            </Descriptions>
            <div>
              <Typography.Title level={5}>Items</Typography.Title>
              <Table
                rowKey="_id"
                dataSource={detailItems}
                pagination={false}
                scroll={{ x: 500 }}
                columns={[
                  { title: 'Item', dataIndex: 'name', key: 'name' },
                  { title: 'SKU', dataIndex: 'sku', key: 'sku' },
                  { title: 'Variant', key: 'variant', render: (_, item) => item.variantId || '—' },
                  { title: 'Unit price', dataIndex: 'price', key: 'price', render: formatMoney },
                  { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
                  { title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', render: formatMoney },
                ]}
              />
            </div>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="Items total">{formatMoney(selectedOrder.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Discount">{formatMoney(selectedOrder.discountAmount)}</Descriptions.Item>
              <Descriptions.Item label="Shipping">{formatMoney(selectedOrder.shippingFee)}</Descriptions.Item>
              <Descriptions.Item label="Final total"><strong>{formatMoney(selectedOrder.finalAmount)}</strong></Descriptions.Item>
              {selectedOrder.cancelledReason && (
                <Descriptions.Item label="Cancellation reason">{selectedOrder.cancelledReason}</Descriptions.Item>
              )}
            </Descriptions>
          </Space>
        )}
      </Modal>

      <Modal
        title={`Change order ${pendingUpdate?.order.orderCode || ''} status?`}
        open={Boolean(pendingUpdate)}
        onCancel={() => {
          if (!updating) setPendingUpdate(null);
        }}
        onOk={confirmStatusUpdate}
        okText="Confirm"
        confirmLoading={updating}
        cancelButtonProps={{ disabled: updating }}
        closable={!updating}
        maskClosable={!updating}
      >
        {pendingUpdate && (
          <>
            <Typography.Paragraph>
              Change status from <strong>{formatStatus(pendingUpdate.order.status)}</strong> to{' '}
              <strong>{formatStatus(pendingUpdate.status)}</strong>?
            </Typography.Paragraph>
            {pendingUpdate.status === 'cancelled' && (
              <>
                <Alert
                  type="warning"
                  showIcon
                  message="Cancelling this order restores its item stock and coupon usage."
                  style={{ marginBottom: 16 }}
                />
                <Input.TextArea
                  rows={3}
                  value={cancelledReason}
                  onChange={(event) => setCancelledReason(event.target.value)}
                  placeholder={`Reason for cancellation (optional; defaults to "Cancelled by ${user.role}")`}
                />
              </>
            )}
            {updateError && (
              <Alert message={updateError} type="error" showIcon style={{ marginTop: 16 }} />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

export default Orders;
