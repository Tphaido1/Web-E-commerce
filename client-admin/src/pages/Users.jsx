import { EyeOutlined, ReloadOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Empty, Form, Input, Modal, Select, Space, Spin, Switch, Table, Tag, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/authService.js';
import { userService } from '../services/userService.js';

const errorMessage = (error) => error.response?.data?.message || error.message || 'Không thể quản lý tài khoản người dùng.';
const roleOptions = [
  { value: 'customer', label: 'Khách hàng' },
  { value: 'admin', label: 'Quản trị viên (Admin)' },
];

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
      message.success('Đã cập nhật quyền người dùng.');
      setSelectedId(null);
      setReload((current) => current + 1);
    } catch (error) {
      setDetailError(errorMessage(error));
    } finally { saveInFlight.current = false; setSaving(false); }
  };
  const columns = [
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Vai trò', dataIndex: 'role', key: 'role', render: (value) => <Tag color={value === 'admin' ? 'purple' : value === 'vendor' ? 'blue' : 'default'}>{value === 'admin' ? 'Admin' : value === 'vendor' ? 'Người bán' : 'Khách hàng'}</Tag> },
    { title: 'Trạng thái', dataIndex: 'isActive', key: 'isActive', render: (value) => <Tag color={value ? 'green' : 'red'}>{value ? 'Hoạt động' : 'Bị khóa'}</Tag> },
    { title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt', render: (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '—' },
    { title: 'Thao tác', key: 'actions', render: (_, user) => <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedId(user._id)}>Xem / Sửa</Button> },
  ];
  const filterChange = (setter) => (value) => { setter(value); setPagination((current) => ({ ...current, current: 1 })); };
  const isOwnAccount = selectedUser?._id === ownId;

  return (
    <div className="page-stack">
      <section className="page-intro"><div><Typography.Text className="eyebrow">QUẢN LÝ TRUY CẬP</Typography.Text><Typography.Title level={1}><TeamOutlined /> Người dùng</Typography.Title><Typography.Paragraph>Xem danh sách tài khoản và quản trị vai trò, trạng thái truy cập.</Typography.Paragraph></div><Button icon={<ReloadOutlined />} loading={loading} onClick={() => setReload((current) => current + 1)}>Làm mới</Button></section>
      {loadError && <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Thử lại</Button>} style={{ marginBottom: 16 }} />}
      <Card className="table-card" variant="borderless">
        <div className="table-toolbar management-toolbar"><Input aria-label="Tìm kiếm người dùng" allowClear prefix={<SearchOutlined />} placeholder="Tìm theo email" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /><Select aria-label="Vai trò" allowClear placeholder="Tất cả vai trò" value={role} options={roleOptions} onChange={filterChange(setRole)} /><Select aria-label="Trạng thái tài khoản" allowClear placeholder="Tất cả trạng thái" value={active} options={[{ value: true, label: 'Hoạt động' }, { value: false, label: 'Bị khóa' }]} onChange={filterChange(setActive)} /></div>
        <Table rowKey="_id" columns={columns} dataSource={loadError ? [] : users} loading={loading} scroll={{ x: 650 }} locale={{ emptyText: <Empty description={loadError ? 'Không thể tải danh sách người dùng.' : 'Không tìm thấy người dùng phù hợp.'} /> }} pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], onChange: (current, pageSize) => setPagination((value) => ({ ...value, current, pageSize })) }} />
      </Card>
      <Modal title="Chi tiết và phân quyền người dùng" open={Boolean(selectedId)} onCancel={() => setSelectedId(null)} onOk={() => form.submit()} okText="Lưu thay đổi" cancelText="Hủy" confirmLoading={saving} okButtonProps={{ disabled: detailLoading || !selectedUser || isOwnAccount }} cancelButtonProps={{ disabled: saving }} closable={!saving} maskClosable={!saving} destroyOnClose>
        {detailError && <Alert type="error" showIcon message={detailError} style={{ marginBottom: 16 }} />}
        {detailLoading ? <Space><Spin /> Đang tải thông tin người dùng…</Space> : selectedUser && <><Descriptions column={1} size="small" items={[{ key: 'email', label: 'Email', children: selectedUser.email }, { key: 'id', label: 'ID người dùng', children: selectedUser._id }, { key: 'created', label: 'Ngày tạo', children: new Date(selectedUser.createdAt).toLocaleString('vi-VN') }]} />{isOwnAccount && <Alert type="info" showIcon message="Bạn không thể tự thay đổi vai trò quản trị viên và trạng thái của chính tài khoản mình tại đây." style={{ marginBlock: 16 }} />}<Form form={form} layout="vertical" onFinish={save} disabled={isOwnAccount || saving}><Form.Item name="role" label="Vai trò" rules={[{ required: true }]}><Select options={roleOptions} /></Form.Item><Form.Item name="isActive" label="Kích hoạt tài khoản" valuePropName="checked"><Switch /></Form.Item></Form></>}
      </Modal>
    </div>
  );
}

export default Users;
