import { EyeOutlined, ReloadOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Empty, Form, Input, Modal, Select, Space, Spin, Switch, Table, Tag, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/authService.js';
import { userService } from '../services/userService.js';

const errorMessage = (error) => error.response?.data?.message || error.message || 'Unable to manage users.';
const roleOptions = ['customer', 'vendor', 'admin'].map((role) => ({ value: role, label: role.charAt(0).toUpperCase() + role.slice(1) }));

function Users() {
  const session = authService.getSession();
  const isAdmin = session?.user?.role === 'admin';
  const ownId = session?.user?.id || session?.user?._id;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState();
  const [active, setActive] = useState();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPagination((current) => ({ ...current, current: 1 })); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    userService.list({ search, role, active, page: pagination.current, limit: pagination.pageSize }, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setUsers(data.users); setPagination((current) => ({ ...current, total: data.pagination.total })); } })
      .catch((error) => { if (!controller.signal.aborted) setLoadError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isAdmin, search, role, active, pagination.current, pagination.pageSize, reload]);
  useEffect(() => {
    if (!selectedId || !isAdmin) return;
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError('');
    setSelectedUser(null);
    userService.get(selectedId, { signal: controller.signal })
      .then((user) => { if (!controller.signal.aborted) { setSelectedUser(user); form.setFieldsValue({ role: user.role, isActive: user.isActive }); } })
      .catch((error) => { if (!controller.signal.aborted) setDetailError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selectedId, isAdmin, form]);
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const save = async (values) => {
    if (saveInFlight.current || !selectedUser) return;
    saveInFlight.current = true;
    setSaving(true);
    setDetailError('');
    try {
      await userService.update(selectedUser._id, values);
      message.success('User permissions updated.');
      setSelectedId(null);
      setReload((current) => current + 1);
    } catch (error) {
      setDetailError(errorMessage(error));
    } finally { saveInFlight.current = false; setSaving(false); }
  };
  const columns = [
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Role', dataIndex: 'role', key: 'role', render: (value) => <Tag color={value === 'admin' ? 'purple' : value === 'vendor' ? 'blue' : 'default'}>{value}</Tag> },
    { title: 'Status', dataIndex: 'isActive', key: 'isActive', render: (value) => <Tag color={value ? 'green' : 'red'}>{value ? 'Active' : 'Inactive'}</Tag> },
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', render: (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '—' },
    { title: 'Actions', key: 'actions', render: (_, user) => <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedId(user._id)}>View / Edit</Button> },
  ];
  const filterChange = (setter) => (value) => { setter(value); setPagination((current) => ({ ...current, current: 1 })); };
  const isOwnAccount = selectedUser?._id === ownId;

  return (
    <div className="page-stack">
      <section className="page-intro"><div><Typography.Text className="eyebrow">ACCESS MANAGEMENT</Typography.Text><Typography.Title level={1}><TeamOutlined /> Users</Typography.Title><Typography.Paragraph>Review accounts and manage roles or account access.</Typography.Paragraph></div><Button icon={<ReloadOutlined />} loading={loading} onClick={() => setReload((current) => current + 1)}>Refresh</Button></section>
      {loadError && <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Retry</Button>} style={{ marginBottom: 16 }} />}
      <Card className="table-card" variant="borderless">
        <div className="table-toolbar management-toolbar"><Input aria-label="Search users" allowClear prefix={<SearchOutlined />} placeholder="Search email" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /><Select aria-label="User role" allowClear placeholder="All roles" value={role} options={roleOptions} onChange={filterChange(setRole)} /><Select aria-label="Account status" allowClear placeholder="All accounts" value={active} options={[{ value: true, label: 'Active' }, { value: false, label: 'Inactive' }]} onChange={filterChange(setActive)} /></div>
        <Table rowKey="_id" columns={columns} dataSource={loadError ? [] : users} loading={loading} scroll={{ x: 650 }} locale={{ emptyText: <Empty description={loadError ? 'Users could not be loaded.' : 'No matching users.'} /> }} pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], onChange: (current, pageSize) => setPagination((value) => ({ ...value, current, pageSize })) }} />
      </Card>
      <Modal title="User details and access" open={Boolean(selectedId)} onCancel={() => setSelectedId(null)} onOk={() => form.submit()} okText="Save changes" confirmLoading={saving} okButtonProps={{ disabled: detailLoading || !selectedUser || isOwnAccount }} cancelButtonProps={{ disabled: saving }} closable={!saving} maskClosable={!saving} destroyOnClose>
        {detailError && <Alert type="error" showIcon message={detailError} style={{ marginBottom: 16 }} />}
        {detailLoading ? <Space><Spin /> Loading user…</Space> : selectedUser && <><Descriptions column={1} size="small" items={[{ key: 'email', label: 'Email', children: selectedUser.email }, { key: 'id', label: 'User ID', children: selectedUser._id }, { key: 'created', label: 'Created', children: new Date(selectedUser.createdAt).toLocaleString() }]} />{isOwnAccount && <Alert type="info" showIcon message="Your own administrator role and active status cannot be changed here." style={{ marginBlock: 16 }} />}<Form form={form} layout="vertical" onFinish={save} disabled={isOwnAccount || saving}><Form.Item name="role" label="Role" rules={[{ required: true }]}><Select options={roleOptions} /></Form.Item><Form.Item name="isActive" label="Account active" valuePropName="checked"><Switch /></Form.Item></Form></>}
      </Modal>
    </div>
  );
}

export default Users;
