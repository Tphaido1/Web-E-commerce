import { FileExcelOutlined, PrinterOutlined, SearchOutlined } from '@ant-design/icons';
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
import { reportService } from '../services/reportService.js';
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

const statusTranslations = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  shipping: 'Đang giao hàng',
  delivered: 'Đã giao hàng',
  cancelled: 'Đã hủy',
};

const paymentStatusTranslations = {
  unpaid: 'Chưa thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  refunded: 'Đã hoàn tiền',
};

const formatStatus = (status = '') => (
  statusTranslations[status] || paymentStatusTranslations[status] || (status.charAt(0).toUpperCase() + status.slice(1))
);

const formatMoney = (value) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value || 0);

const formatDate = (value) => (
  value ? new Date(value).toLocaleString('vi-VN') : '—'
);

const getErrorMessage = (error) => (
  error.response?.data?.message || error.message || 'Không thể xử lý yêu cầu đơn hàng.'
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
  const [exportingExcel, setExportingExcel] = useState(false);

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      await reportService.downloadOrdersExcel({ status, paymentStatus, search });
      message.success('Xuất file Excel thành công!');
    } catch (error) {
      message.error(getErrorMessage(error) || 'Không thể xuất file Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportInvoice = async (order) => {
    if (!order) return;
    try {
      message.loading({ content: 'Đang tạo hóa đơn PDF...', key: 'invoice' });
      await reportService.downloadOrderInvoicePdf(order._id, order.orderCode);
      message.success({ content: 'Tải hóa đơn PDF thành công!', key: 'invoice' });
    } catch (error) {
      message.error({ content: getErrorMessage(error) || 'Không thể tạo hóa đơn PDF.', key: 'invoice' });
    }
  };

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
          || `Hủy bởi ${user.role === 'admin' ? 'Quản trị viên' : 'Người bán'}`;
      }
      await orderService.updateStatus(pendingUpdate.order._id, payload);
      setPendingUpdate(null);
      message.success(`Đã cập nhật đơn hàng ${pendingUpdate.order.orderCode} sang "${formatStatus(pendingUpdate.status)}".`);
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
      title: 'Mã đơn hàng',
      dataIndex: 'orderCode',
      key: 'orderCode',
      render: (value, order) => (
        <Button type="link" onClick={() => setSelectedOrder(order)}>{value}</Button>
      ),
    },
    {
      title: 'Khách hàng',
      key: 'customer',
      render: (_, order) => (
        <div>
          <strong className="table-primary">{order.shippingAddress?.fullName || '—'}</strong>
          <span className="table-secondary">{order.user?.email || order.shippingAddress?.phone || ''}</span>
        </div>
      ),
    },
    {
      title: 'Số lượng',
      key: 'items',
      render: (_, order) => order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'finalAmount',
      key: 'finalAmount',
      render: formatMoney,
    },
    {
      title: 'Thanh toán',
      key: 'payment',
      render: (_, order) => (
        <div>
          <span>{order.paymentMethod || '—'}</span>
          <span className="table-secondary">{formatStatus(order.paymentStatus)}</span>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (value) => <Tag color={statusColors[value]}>{formatStatus(value)}</Tag>,
    },
    { title: 'Thời gian tạo', dataIndex: 'createdAt', key: 'createdAt', render: formatDate },
    {
      title: 'Hóa đơn',
      key: 'invoice',
      render: (_, order) => (
        <Button
          type="text"
          icon={<PrinterOutlined />}
          title="Tải hóa đơn PDF"
          onClick={() => handleExportInvoice(order)}
        >
          PDF
        </Button>
      ),
    },
    ...(canManageOrders
      ? [{
        title: 'Cập nhật trạng thái',
        key: 'updateStatus',
        render: (_, order) => {
          const availableStatuses = order.status === 'cancelled'
            ? []
            : order.status === 'delivered'
              ? []
              : orderStatuses.filter((nextStatus) => nextStatus !== order.status);
          return (
            <Select
              aria-label={`Cập nhật trạng thái cho ${order.orderCode}`}
              placeholder={order.canUpdateStatus === false ? 'Admin quản lý đơn này' : 'Chọn trạng thái'}
              value={undefined}
              disabled={order.canUpdateStatus === false || !availableStatuses.length || updating}
              options={availableStatuses.map((value) => ({ value, label: formatStatus(value) }))}
              onChange={(nextStatus) => startStatusUpdate(order, nextStatus)}
              style={{ minWidth: 155 }}
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
          <Typography.Text className="eyebrow">VẬN HÀNH</Typography.Text>
          <Typography.Title level={1}>Đơn hàng</Typography.Title>
          <Typography.Paragraph>Kiểm tra và quản lý các đơn đặt hàng từ khách hàng.</Typography.Paragraph>
        </div>
        <Button
          type="primary"
          icon={<FileExcelOutlined />}
          loading={exportingExcel}
          onClick={handleExportExcel}
        >
          Xuất Báo Cáo Excel
        </Button>
      </section>
      {loadError && (
        <Alert
          type="error"
          showIcon
          message={loadError}
          action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Thử lại</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="table-card" variant="borderless">
        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm theo mã đơn, khách hàng hoặc SĐT"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            allowClear
            placeholder="Trạng thái đơn hàng"
            value={status}
            options={orderStatuses.map((value) => ({ value, label: formatStatus(value) }))}
            onChange={(value) => {
              setStatus(value);
              setPagination((current) => ({ ...current, current: 1 }));
            }}
            style={{ minWidth: 160 }}
          />
          <Select
            allowClear
            placeholder="Trạng thái thanh toán"
            value={paymentStatus}
            options={paymentStatuses.map((value) => ({ value, label: formatStatus(value) }))}
            onChange={(value) => {
              setPaymentStatus(value);
              setPagination((current) => ({ ...current, current: 1 }));
            }}
            style={{ minWidth: 170 }}
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
              ? <Empty description="Không thể tải danh sách đơn hàng." />
              : <Empty description="Không tìm thấy đơn hàng nào." />,
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
        title={`Đơn hàng ${selectedOrder?.orderCode || ''}`}
        open={Boolean(selectedOrder)}
        onCancel={() => setSelectedOrder(null)}
        footer={[
          <Button key="invoice" icon={<PrinterOutlined />} onClick={() => handleExportInvoice(selectedOrder)}>
            In / Tải Hóa Đơn PDF
          </Button>,
          <Button key="close" type="primary" onClick={() => setSelectedOrder(null)}>
            Đóng
          </Button>,
        ]}
        width={800}
      >
        {selectedOrder && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {user?.role === 'vendor' && <Alert type="info" showIcon message={selectedOrder.canUpdateStatus === false ? 'Chỉ hiển thị các sản phẩm và số tiền thuộc về bạn. Admin sẽ phụ trách hoàn tất đơn này vì có sản phẩm của người bán khác.' : 'Chỉ hiển thị các sản phẩm và số tiền thuộc về bạn.'} />}
            <Descriptions bordered column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Khách hàng">{address.fullName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Email tài khoản">{selectedOrder.user?.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">{address.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ nhận hàng">
                {[address.address, address.ward, address.district, address.city].filter(Boolean).join(', ') || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Phương thức thanh toán">{selectedOrder.paymentMethod || '—'}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái thanh toán">
                <Tag>{formatStatus(selectedOrder.paymentStatus)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái đơn hàng">
                <Tag color={statusColors[selectedOrder.status]}>{formatStatus(selectedOrder.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian tạo">{formatDate(selectedOrder.createdAt)}</Descriptions.Item>
              {address.notes && <Descriptions.Item label="Ghi chú nhận hàng" span={2}>{address.notes}</Descriptions.Item>}
            </Descriptions>
            <div>
              <Typography.Title level={5}>Danh sách sản phẩm</Typography.Title>
              <Table
                rowKey="_id"
                dataSource={detailItems}
                pagination={false}
                scroll={{ x: 500 }}
                columns={[
                  { title: 'Sản phẩm', dataIndex: 'name', key: 'name' },
                  { title: 'SKU', dataIndex: 'sku', key: 'sku' },
                  { title: 'Biến thể', key: 'variant', render: (_, item) => item.variantId || '—' },
                  { title: 'Đơn giá', dataIndex: 'price', key: 'price', render: formatMoney },
                  { title: 'Số lượng', dataIndex: 'quantity', key: 'quantity' },
                  { title: 'Thành tiền', dataIndex: 'subtotal', key: 'subtotal', render: formatMoney },
                ]}
              />
            </div>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="Tiền hàng">{formatMoney(selectedOrder.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Giảm giá">{formatMoney(selectedOrder.discountAmount)}</Descriptions.Item>
              <Descriptions.Item label="Phí giao hàng">{formatMoney(selectedOrder.shippingFee)}</Descriptions.Item>
              <Descriptions.Item label="Tổng thanh toán"><strong>{formatMoney(selectedOrder.finalAmount)}</strong></Descriptions.Item>
              {selectedOrder.cancelledReason && (
                <Descriptions.Item label="Lý do hủy đơn">{selectedOrder.cancelledReason}</Descriptions.Item>
              )}
            </Descriptions>
          </Space>
        )}
      </Modal>

      <Modal
        title={`Thay đổi trạng thái đơn ${pendingUpdate?.order.orderCode || ''}?`}
        open={Boolean(pendingUpdate)}
        onCancel={() => {
          if (!updating) setPendingUpdate(null);
        }}
        onOk={confirmStatusUpdate}
        okText="Xác nhận"
        cancelText="Hủy"
        confirmLoading={updating}
        cancelButtonProps={{ disabled: updating }}
        closable={!updating}
        maskClosable={!updating}
      >
        {pendingUpdate && (
          <>
            <Typography.Paragraph>
              Chuyển trạng thái từ <strong>{formatStatus(pendingUpdate.order.status)}</strong> sang{' '}
              <strong>{formatStatus(pendingUpdate.status)}</strong>?
            </Typography.Paragraph>
            {pendingUpdate.status === 'cancelled' && (
              <>
                <Alert
                  type="warning"
                  showIcon
                  message="Hủy đơn hàng này sẽ tự động hoàn lại số lượng tồn kho sản phẩm và mã giảm giá đã dùng."
                  style={{ marginBottom: 16 }}
                />
                <Input.TextArea
                  rows={3}
                  value={cancelledReason}
                  onChange={(event) => setCancelledReason(event.target.value)}
                  placeholder={`Lý do hủy đơn (không bắt buộc; mặc định là "Hủy bởi ${user.role === 'admin' ? 'Quản trị viên' : 'Người bán'}")`}
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
