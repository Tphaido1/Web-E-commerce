import { InboxOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { authService } from '../services/authService.js';
import { inventoryService } from '../services/inventoryService.js';

const errorMessage = (error) => error.response?.data?.message || error.message || 'Unable to update inventory.';
const statusLabels = { in_stock: 'In stock', low: 'Low stock', out: 'Out of stock' };

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
      message.success(editing.type === 'restock' ? 'Inventory restocked.' : 'Low-stock threshold updated.');
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
    { title: 'Product / Variant', key: 'product', render: (_, row) => <><strong>{row.product?.name || 'Unavailable product'}</strong><span className="table-secondary">{row.variant ? `${row.variant.color} / ${row.variant.size}` : 'Base product'}</span></> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    { title: 'Available stock', dataIndex: 'stock', key: 'stock' },
    { title: 'Reserved', dataIndex: 'reservedStock', key: 'reservedStock' },
    { title: 'Low-stock threshold', dataIndex: 'lowStockThreshold', key: 'lowStockThreshold' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (status) => <Tag color={status === 'out' ? 'red' : status === 'low' ? 'gold' : 'green'}>{statusLabels[status] || status}</Tag> },
    { title: 'Actions', key: 'actions', render: (_, row) => <Space wrap><Button size="small" onClick={() => openEditor(row, 'restock')}>Restock</Button><Button size="small" onClick={() => openEditor(row, 'threshold')}>Set threshold</Button></Space> },
  ];

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div><Typography.Text className="eyebrow">STOCK CONTROL</Typography.Text><Typography.Title level={1}><InboxOutlined /> Inventory</Typography.Title><Typography.Paragraph>{isVendor ? 'Manage inventory for your own products.' : 'Manage product and variant stock across the catalog.'}</Typography.Paragraph></div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => setReload((current) => current + 1)}>Refresh</Button>
      </section>
      {loadError && <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Retry</Button>} style={{ marginBottom: 16 }} />}
      <Card className="table-card" variant="borderless">
        <div className="table-toolbar management-toolbar">
          <Input aria-label="Search inventory" allowClear prefix={<SearchOutlined />} placeholder="Search product or SKU" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          <Select aria-label="Stock status" value={stockStatus} options={[{ value: 'all', label: 'All stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} onChange={(value) => { setStockStatus(value); setPagination((current) => ({ ...current, current: 1 })); }} />
        </div>
        <Table rowKey="_id" columns={columns} dataSource={loadError ? [] : rows} loading={loading} scroll={{ x: 1000 }} locale={{ emptyText: <Empty description={loadError ? 'Inventory could not be loaded.' : 'No matching inventory.'} /> }} pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], onChange: (current, pageSize) => setPagination((value) => ({ ...value, current, pageSize })) }} />
      </Card>
      <Modal title={`${editing?.type === 'restock' ? 'Restock' : 'Set threshold for'} ${editing?.row.sku || ''}`} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={saving} cancelButtonProps={{ disabled: saving }} closable={!saving} maskClosable={!saving} destroyOnClose>
        <Typography.Paragraph>{editing?.type === 'restock' ? 'Enter the number of additional units received.' : 'Show a low-stock warning when available stock reaches this quantity or below.'}</Typography.Paragraph>
        {saveError && <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} />}
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="value" label={editing?.type === 'restock' ? 'Units to add' : 'Low-stock threshold'} rules={[{ required: true, type: 'integer', min: editing?.type === 'restock' ? 1 : 0, max: 1000000, message: 'Enter a valid whole-number quantity.' }]}><InputNumber min={editing?.type === 'restock' ? 1 : 0} max={1000000} precision={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Inventory;
