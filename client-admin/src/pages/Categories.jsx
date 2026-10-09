import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Table, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '../services/authService.js';
import { categoryService } from '../services/categoryService.js';

const getErrorMessage = (error) => (
  error.response?.data?.message || error.message || 'Unable to complete the category request.'
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
      message.success(editing ? 'Category updated.' : 'Category created.');
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
      message.success('Category hidden from the storefront.');
      await loadCategories();
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setDeletingRequest(false);
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', render: (value) => value || '—' },
    { title: 'Category Name', dataIndex: 'name', key: 'name', render: (value) => <strong className="table-primary">{value}</strong> },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (value) => value || '—' },
    { title: 'Products', dataIndex: 'productCount', key: 'productCount', render: (value) => value ?? '—' },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'status',
      render: (isActive) => {
        const status = isActive ? 'Active' : 'Inactive';
        return <Tag color={isActive ? 'green' : 'default'}>{status}</Tag>;
      },
    },
    ...(canManageCategories
      ? [{
        title: 'Actions',
        key: 'actions',
        render: (_, category) => (
          <div className="table-actions">
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={`Edit ${category.name}`}
              onClick={() => openForm(category)}
            />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={`Delete ${category.name}`}
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
          <Typography.Text className="eyebrow">CATALOG STRUCTURE</Typography.Text>
          <Typography.Title level={1}>Categories</Typography.Title>
          <Typography.Paragraph>Organize the catalog your customers browse.</Typography.Paragraph>
        </div>
        {canManageCategories && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
            Add Category
          </Button>
        )}
      </section>
      {loadError && (
        <Alert
          type="error"
          showIcon
          message={loadError}
          action={<Button size="small" onClick={loadCategories}>Retry</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="table-card" variant="borderless">
        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search categories"
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
              ? <Empty description="Categories could not be loaded." />
              : <Empty description={query ? 'No matching categories.' : 'No categories yet.'} />,
          }}
        />
      </Card>
      {canManageCategories && (
        <>
          <Modal
            title={editing ? 'Edit Category' : 'Add Category'}
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={saveCategory}
            okText="Save"
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
                label="Category Name"
                name="name"
                rules={[{ required: true, whitespace: true, message: 'Category name is required.' }]}
              >
                <Input placeholder="e.g. Accessories" />
              </Form.Item>
              <Form.Item label="Description" name="description">
                <Input.TextArea rows={3} placeholder="Describe this category" />
              </Form.Item>
              <Form.Item
                label="Status"
                name="status"
                rules={[{ required: true }]}
                extra={!editing && 'New categories are created as active by the API.'}
              >
                <Select
                  disabled={!editing}
                  options={[
                    { value: 'Active', label: 'Active' },
                    { value: 'Inactive', label: 'Inactive' },
                  ]}
                />
              </Form.Item>
            </Form>
          </Modal>
          <Modal
            title={`Delete ${deleting?.name}?`}
            open={Boolean(deleting)}
            onCancel={() => setDeleting(null)}
            onOk={confirmDelete}
            okText="Delete"
            okButtonProps={{ danger: true }}
            confirmLoading={deletingRequest}
            cancelButtonProps={{ disabled: deletingRequest }}
            closable={!deletingRequest}
            maskClosable={!deletingRequest}
          >
            <Typography.Paragraph>
              This category will be marked inactive and hidden from the storefront.
            </Typography.Paragraph>
            {deleteError && <Alert message={deleteError} type="error" showIcon />}
          </Modal>
        </>
      )}
    </div>
  );
}

export default Categories;
