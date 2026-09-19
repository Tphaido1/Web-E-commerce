import { DeleteOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, InputNumber, Select, Table, Typography, Upload } from 'antd';
import { useNavigate } from 'react-router-dom';

const emptyVariant = { color: '', size: '', price: undefined, sku: '', stock: 0 };

function ProductForm({ initialValues, categories, loading, onSubmit, isSkuTaken }) {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const defaultValues = initialValues || { status: 'Active', variants: [{ ...emptyVariant }] };
  const uniqueVariantRule = (field, fieldName, message) => ({ validator: async () => {
    const variants = form.getFieldValue('variants') || [];
    const current = variants[field.name] || {};
    const currentValue = String(current[fieldName] || '').trim().toLowerCase();
    if (!currentValue) return;
    const duplicate = variants.some((variant, index) => index !== field.name && String(variant[fieldName] || '').trim().toLowerCase() === currentValue);
    if (duplicate) throw new Error(message);
  } });
  const uniqueCombinationRule = (field) => ({ validator: async () => {
    const variants = form.getFieldValue('variants') || [];
    const current = variants[field.name] || {};
    if (!current.color || !current.size) return;
    const duplicate = variants.some((variant, index) => index !== field.name && String(variant.color).trim().toLowerCase() === String(current.color).trim().toLowerCase() && String(variant.size).trim().toLowerCase() === String(current.size).trim().toLowerCase());
    if (duplicate) throw new Error('Color and size combination must be unique.');
  } });
  const variantColumns = (fields, remove) => [
    { title: 'Color', key: 'color', render: (_, field) => <Form.Item name={[field.name, 'color']} rules={[{ required: true, message: 'Required' }, uniqueCombinationRule(field)]}><Input placeholder="Black" /></Form.Item> },
    { title: 'Size', key: 'size', render: (_, field) => <Form.Item name={[field.name, 'size']} rules={[{ required: true, message: 'Required' }, uniqueCombinationRule(field)]}><Input placeholder="M" /></Form.Item> },
    { title: 'Price', key: 'price', render: (_, field) => <Form.Item name={[field.name, 'price']} rules={[{ required: true, type: 'number', min: 0, message: 'Enter price' }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item> },
    { title: 'SKU', key: 'sku', render: (_, field) => <Form.Item name={[field.name, 'sku']} rules={[{ required: true, message: 'Required' }, uniqueVariantRule(field, 'sku', 'Variant SKU must be unique.')] }><Input placeholder="SKU-B-M" /></Form.Item> },
    { title: 'Stock', key: 'stock', render: (_, field) => <Form.Item name={[field.name, 'stock']} rules={[{ required: true, type: 'number', min: 0 }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item> },
    { title: '', key: 'delete', render: (_, field) => <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Remove variant ${field.name + 1}`} disabled={fields.length === 1} onClick={() => remove(field.name)} /> },
  ];

  const productSkuRules = [{ required: true, message: 'SKU is required.' }, { validator: async (_, value) => { if (value && isSkuTaken?.(value)) throw new Error('Product SKU already exists.'); } }];
  return <Form form={form} layout="vertical" requiredMark={false} initialValues={defaultValues} onFinish={onSubmit} className="product-form"><Card className="form-section" variant="borderless"><Typography.Text className="form-section-title">Basic information</Typography.Text><div className="form-grid"><Form.Item label="Product Name" name="name" rules={[{ required: true, message: 'Product name is required.' }]}><Input placeholder="Product name" /></Form.Item><Form.Item label="SKU" name="sku" rules={productSkuRules}><Input placeholder="NOVA-PROD-001" /></Form.Item><Form.Item label="Category" name="category" rules={[{ required: true, message: 'Category is required.' }]}><Select options={categories.map((category) => ({ value: category.name, label: category.name }))} placeholder="Select category" /></Form.Item><Form.Item label="Base Price" name="price" rules={[{ required: true, type: 'number', min: 0, message: 'Enter a valid price.' }]}><InputNumber min={0} style={{ width: '100%' }} prefix="$" /></Form.Item><Form.Item label="Status" name="status" rules={[{ required: true }]}><Select options={[{ value: 'Active', label: 'Active' }, { value: 'Draft', label: 'Draft' }, { value: 'Out of stock', label: 'Out of stock' }]} /></Form.Item><Form.Item label="Description" name="description" className="form-wide"><Input.TextArea rows={4} placeholder="Tell customers about this product" /></Form.Item></div></Card><Card className="form-section" variant="borderless"><Typography.Text className="form-section-title">Product image</Typography.Text><Upload.Dragger maxCount={1} beforeUpload={() => false} accept="image/*"><p className="ant-upload-drag-icon"><InboxOutlined /></p><p>Drop a product image here or click to browse</p><p className="ant-upload-hint">Frontend upload UI only. No file is sent.</p></Upload.Dragger></Card><Card className="form-section" variant="borderless"><Form.List name="variants">{(fields, { add, remove }) => <><div className="section-heading-row"><div><Typography.Text className="form-section-title">Product variants</Typography.Text><Typography.Paragraph>Define color and size combinations for this product.</Typography.Paragraph></div><Button icon={<PlusOutlined />} onClick={() => add({ ...emptyVariant })}>Add Variant</Button></div><Table className="variant-table" rowKey="key" columns={variantColumns(fields, remove)} dataSource={fields} pagination={false} scroll={{ x: 850 }} /></>}</Form.List></Card><div className="form-submit-row"><Button onClick={() => navigate('/products')}>Cancel</Button><Button type="primary" htmlType="submit" loading={loading}>Save Product</Button></div></Form>;
}

export default ProductForm;
