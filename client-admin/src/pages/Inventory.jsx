import { InboxOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { authService } from '../services/authService.js';
import { inventoryService } from '../services/inventoryService.js';

const errorMessage = (error) => error.response?.data?.message || error.message || 'Không thể cập nhật kho hàng.';
const statusLabels = { in_stock: 'Còn hàng', low: 'Sắp hết hàng', out: 'Hết hàng' };

function Inventory() {
  const isVendor = authService.getSession()?.user?.role === 'vendor';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stockStatus, setStockStatus] = useState('all');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [saveError, setSaveError] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPagination((current) => ({ ...current, current: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    inventoryService.list({ search, stockStatus, page: pagination.current, limit: pagination.pageSize }, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRows(data.inventory);
        setPagination((current) => ({ ...current, total: data.pagination.total }));
      })
      .catch((error) => { if (!controller.signal.aborted) setLoadError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, stockStatus, pagination.current, pagination.pageSize, reload]);

  const openEditor = (row, type) => {
    setSaveError('');
    setEditing({ row, type });
    form.setFieldsValue({ value: type === 'restock' ? 1 : row.lowStockThreshold });
  };
  const save = async ({ value }) => {
    if (saveInFlight.current || !editing) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaveError('');
    try {
      if (editing.type === 'restock') await inventoryService.restock(editing.row._id, value);
      else await inventoryService.updateThreshold(editing.row._id, value);
      message.success(editing.type === 'restock' ? 'Đã nhập thêm hàng vào kho.' : 'Đã cập nhật ngưỡng cảnh báo sắp hết.');
      setEditing(null);
      setReload((current) => current + 1);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };
  const columns = [
    { title: 'Sản phẩm / Biến thể', key: 'product', render: (_, row) => <><strong>{row.product?.name || 'Sản phẩm không khả dụng'}</strong><span className="table-secondary">{row.variant ? `${row.variant.color} / ${row.variant.size}` : 'Sản phẩm gốc'}</span></> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    { title: 'Tồn kho khả dụng', dataIndex: 'stock', key: 'stock' },
    { title: 'Đang đặt giữ', dataIndex: 'reservedStock', key: 'reservedStock' },
    { title: 'Ngưỡng sắp hết', dataIndex: 'lowStockThreshold', key: 'lowStockThreshold' },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (status) => <Tag color={status === 'out' ? 'red' : status === 'low' ? 'gold' : 'green'}>{statusLabels[status] || status}</Tag> },
    { title: 'Thao tác', key: 'actions', render: (_, row) => <Space wrap><Button size="small" onClick={() => openEditor(row, 'restock')}>Nhập hàng</Button><Button size="small" onClick={() => openEditor(row, 'threshold')}>Đặt ngưỡng</Button></Space> },
  ];

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><Typography.Text className="eyebrow">QUẢN LÝ KHO</Typography.Text><Typography.Title level={1}><InboxOutlined /> Kho hàng</Typography.Title><Typography.Paragraph>{isVendor ? 'Quản lý kho hàng cho các sản phẩm của bạn.' : 'Quản lý tồn kho sản phẩm và biến thể trong danh mục.'}</Typography.Paragraph></div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => setReload((current) => current + 1)}>Làm mới</Button>
      </section>
      {loadError && <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Thử lại</Button>} style={{ marginBottom: 16 }} />}
      <Card className="table-card" variant="borderless">
        <div className="table-toolbar management-toolbar">
          <Input aria-label="Tìm kiếm kho hàng" allowClear prefix={<SearchOutlined />} placeholder="Tìm theo tên sản phẩm hoặc SKU" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          <Select aria-label="Trạng thái tồn kho" value={stockStatus} options={[{ value: 'all', label: 'Tất cả trạng thái' }, { value: 'low', label: 'Sắp hết hàng' }, { value: 'out', label: 'Hết hàng' }]} onChange={(value) => { setStockStatus(value); setPagination((current) => ({ ...current, current: 1 })); }} />
        </div>
        <Table rowKey="_id" columns={columns} dataSource={loadError ? [] : rows} loading={loading} scroll={{ x: 1000 }} locale={{ emptyText: <Empty description={loadError ? 'Không thể tải dữ liệu kho hàng.' : 'Không tìm thấy dữ liệu kho phù hợp.'} /> }} pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], onChange: (current, pageSize) => setPagination((value) => ({ ...value, current, pageSize })) }} />
      </Card>
      <Modal title={`${editing?.type === 'restock' ? 'Nhập thêm hàng cho' : 'Cài đặt ngưỡng tồn kho cho'} ${editing?.row.sku || ''}`} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} okText="Lưu" cancelText="Hủy" confirmLoading={saving} cancelButtonProps={{ disabled: saving }} closable={!saving} maskClosable={!saving} destroyOnClose>
        <Typography.Paragraph>{editing?.type === 'restock' ? 'Nhập số lượng sản phẩm nhập thêm vào kho.' : 'Hiển thị cảnh báo khi số lượng tồn kho khả dụng giảm xuống bằng hoặc thấp hơn mức này.'}</Typography.Paragraph>
        {saveError && <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="value" label={editing?.type === 'restock' ? 'Số lượng nhập thêm' : 'Ngưỡng cảnh báo sắp hết'} rules={[{ required: true, type: 'integer', min: editing?.type === 'restock' ? 1 : 0, max: 1000000, message: 'Vui lòng nhập số nguyên hợp lệ.' }]}><InputNumber min={editing?.type === 'restock' ? 1 : 0} max={1000000} precision={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Inventory;
