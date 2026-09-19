import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Select, Table, Tag, Typography, message } from 'antd';
import { useMemo, useState } from 'react';
import { categoryService } from '../services/categoryService.js';

function Categories() {
  const [categories, setCategories] = useState(() => categoryService.list());
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const filteredCategories = useMemo(() => categories.filter((category) => `${category.name} ${category.description}`.toLowerCase().includes(query.toLowerCase())), [categories, query]);

  const openForm = (category) => { form.resetFields(); setEditing(category); form.setFieldsValue(category || { status: 'Active' }); setModalOpen(true); };
  const saveCategory = async () => {
    const values = await form.validateFields();
    if (editing) categoryService.update(editing.key, values); else categoryService.create(values);
    setCategories(categoryService.list()); setModalOpen(false); message.success(editing ? 'Category updated.' : 'Category created.');
  };
  const removeCategory = (category) => Modal.confirm({ title: `Delete ${category.name}?`, content: 'This mock category will be removed from the table.', okText: 'Delete', okButtonProps: { danger: true }, onOk: () => { categoryService.remove(category.key); setCategories(categoryService.list()); message.success('Category deleted.'); } });
  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: 'Category Name', dataIndex: 'name', key: 'name', render: (value) => <strong className="table-primary">{value}</strong> },
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Products', dataIndex: 'productCount', key: 'productCount' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (value) => <Tag color={value === 'Active' ? 'green' : 'default'}>{value}</Tag> },
    { title: 'Actions', key: 'actions', render: (_, category) => <div className="table-actions"><Button type="text" icon={<EditOutlined />} aria-label={`Edit ${category.name}`} onClick={() => openForm(category)} /><Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${category.name}`} onClick={() => removeCategory(category)} /></div> },
  ];

  return <div className="page-stack"><section className="page-intro"><div><Typography.Text className="eyebrow">CATALOG STRUCTURE</Typography.Text><Typography.Title level={1}>Categories</Typography.Title><Typography.Paragraph>Organize the catalog your customers browse.</Typography.Paragraph></div><Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>Add Category</Button></section><Card className="table-card" variant="borderless"><div className="table-toolbar"><Input allowClear prefix={<SearchOutlined />} placeholder="Search categories" value={query} onChange={(event) => setQuery(event.target.value)} /><Tag className="mock-tag">MOCK DATA</Tag></div><Table columns={columns} dataSource={filteredCategories} pagination={false} scroll={{ x: 760 }} /></Card><Modal title={editing ? 'Edit Category' : 'Add Category'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={saveCategory} okText="Save"><Form form={form} layout="vertical" requiredMark={false}><Form.Item label="Category Name" name="name" rules={[{ required: true, message: 'Category name is required.' }]}><Input placeholder="e.g. Accessories" /></Form.Item><Form.Item label="Description" name="description"><Input.TextArea rows={3} placeholder="Describe this category" /></Form.Item><Form.Item label="Status" name="status" rules={[{ required: true }]}><Select options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]} /></Form.Item></Form></Modal></div>;
}

export default Categories;
