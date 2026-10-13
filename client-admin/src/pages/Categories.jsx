import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Table, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '../services/authService.js';
import { categoryService } from '../services/categoryService.js';

const getErrorMessage = (error) => (
  error.response?.data?.message || error.message || 'Không thể thực hiện yêu cầu danh mục.'
);

function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletingRequest, setDeletingRequest] = useState(false);
  const [form] = Form.useForm();
  const categoryRequest = useRef(null);
  const canManageCategories = authService.getSession()?.user?.role === 'admin';

  const loadCategories = useCallback(async () => {
    categoryRequest.current?.abort();
    const controller = new AbortController();
    categoryRequest.current = controller;
    const { signal } = controller;
    setLoading(true);
    setLoadError('');
    try {
      const data = await categoryService.list({ signal });
      if (signal.aborted) return false;
      setCategories(data);
      return true;
    } catch (error) {
      if (!signal.aborted) setLoadError(getErrorMessage(error));
      return false;
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
    return () => categoryRequest.current?.abort();
  }, [loadCategories]);

  const filteredCategories = useMemo(
    () => categories.filter((category) => (
      `${category.name} ${category.description || ''}`.toLowerCase().includes(query.toLowerCase())
    )),
    [categories, query],
  );

  const openForm = (category) => {
    form.resetFields();
    setFormError('');
    setEditing(category || null);
    form.setFieldsValue(category
      ? {
        name: category.name,
        description: category.description || '',
        status: category.isActive ? 'Active' : 'Inactive',
      }
      : { name: '', description: '', status: 'Active' });
    setModalOpen(true);
  };

  const saveCategory = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await categoryService.update(editing._id, values);
      } else {
        await categoryService.create(values);
      }
      setModalOpen(false);
      message.success(editing ? 'Đã cập nhật danh mục.' : 'Đã tạo danh mục mới.');
      await loadCategories();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeletingRequest(true);
    setDeleteError('');
    try {
      await categoryService.remove(deleting._id);
      setDeleting(null);
      message.success('Đã tạm ẩn danh mục khỏi cửa hàng.');
      await loadCategories();
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setDeletingRequest(false);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', render: (value) => value || '—' },
    { title: 'Tên danh mục', dataIndex: 'name', key: 'name', render: (value) => <strong className="table-primary">{value}</strong> },
    { title: 'Mô tả', dataIndex: 'description', key: 'description', render: (value) => value || '—' },
    { title: 'Số sản phẩm', dataIndex: 'productCount', key: 'productCount', render: (value) => value ?? '—' },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      key: 'status',
      render: (isActive) => {
        const statusLabel = isActive ? 'Đang hoạt động' : 'Tạm ẩn';
        return <Tag color={isActive ? 'green' : 'default'}>{statusLabel}</Tag>;
      },
    },
    ...(canManageCategories
      ? [{
        title: 'Thao tác',
        key: 'actions',
        render: (_, category) => (
          <div className="table-actions">
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={`Chỉnh sửa ${category.name}`}
              onClick={() => openForm(category)}
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={`Xóa ${category.name}`}
              onClick={() => {
                setDeleteError('');
                setDeleting(category);
              }}
            />
          </div>
        ),
      }]
      : []),
  ];

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <Typography.Text className="eyebrow">CẤU TRÚC DANH MỤC</Typography.Text>
          <Typography.Title level={1}>Danh mục</Typography.Title>
          <Typography.Paragraph>Tổ chức và quản lý các danh mục hàng hóa trên cửa hàng.</Typography.Paragraph>
        </div>
        {canManageCategories && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
            Thêm danh mục
          </Button>
        )}
      </section>
      {loadError && (
        <Alert
          type="error"
          showIcon
          message={loadError}
          action={<Button size="small" onClick={loadCategories}>Thử lại</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="table-card" variant="borderless">
        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm kiếm danh mục..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={filteredCategories}
          loading={loading}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{
            emptyText: loadError
              ? <Empty description="Không thể tải danh sách danh mục." />
              : <Empty description={query ? 'Không tìm thấy danh mục phù hợp.' : 'Chưa có danh mục nào.'} />,
          }}
        />
      </Card>
      {canManageCategories && (
        <>
          <Modal
            title={editing ? 'Chỉnh sửa danh mục' : 'Thêm danh mục'}
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={saveCategory}
            okText="Lưu"
            cancelText="Hủy"
            confirmLoading={saving}
            cancelButtonProps={{ disabled: saving }}
            closable={!saving}
            maskClosable={!saving}
          >
            {formError && (
              <Alert message={formError} type="error" showIcon style={{ marginBottom: 16 }} />
            )}
            <Form form={form} layout="vertical" requiredMark={false}>
              <Form.Item
                label="Tên danh mục"
                name="name"
                rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên danh mục.' }]}
              >
                <Input placeholder="VD: Áo Sơ Mi, Quần Jeans, Phụ Kiện..." />
              </Form.Item>
              <Form.Item label="Mô tả" name="description">
                <Input.TextArea rows={3} placeholder="Mô tả ngắn gọn về danh mục này" />
              </Form.Item>
              <Form.Item
                label="Trạng thái"
                name="status"
                rules={[{ required: true }]}
                extra={!editing && 'Danh mục mới tạo mặc định sẽ ở trạng thái đang hoạt động.'}
              >
                <Select
                  disabled={!editing}
                  options={[
                    { value: 'Active', label: 'Đang hoạt động' },
                    { value: 'Inactive', label: 'Tạm ẩn' },
                  ]}
                />
              </Form.Item>
            </Form>
          </Modal>
          <Modal
            title={`Ẩn / Xóa ${deleting?.name}?`}
            open={Boolean(deleting)}
            onCancel={() => setDeleting(null)}
            onOk={confirmDelete}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            confirmLoading={deletingRequest}
            cancelButtonProps={{ disabled: deletingRequest }}
            closable={!deletingRequest}
            maskClosable={!deletingRequest}
          >
            <Typography.Paragraph>
              Danh mục này sẽ được chuyển sang trạng thái tạm ẩn và không hiển thị trên cửa hàng.
            </Typography.Paragraph>
            {deleteError && <Alert message={deleteError} type="error" showIcon />}
          </Modal>
        </>
      )}
    </div>
  );
}

export default Categories;
