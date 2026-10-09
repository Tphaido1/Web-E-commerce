import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, InputNumber, Select, Table, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

const emptyVariant = { color: '', size: '', price: undefined, sku: '', stock: 0 };

function ProductForm({ initialValues, categories, loading, saveError, onSubmit, isEditing = false, canAssignVendor = false, vendors = [], vendorLoading = false, vendorError = '', onVendorSearch }) {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const defaultValues = initialValues || {
    stock: 0,
    vendor: '',
    variants: [{ ...emptyVariant }],
  };

  const hasExistingVariantStock = (field) => {
    if (!isEditing) return false;
    const current = form.getFieldValue(['variants', field.name]) || {};
    return Boolean(current._id || initialValues?.variants?.some((variant) => (
      String(variant.sku || '').trim().toLowerCase() === String(current.sku || '').trim().toLowerCase()
    )));
  };

  const uniqueVariantSkuRule = (field) => ({
    validator: async (_, value) => {
      const sku = String(value || '').trim().toLowerCase();
      if (!sku) return;
      const variants = form.getFieldValue('variants') || [];
      const duplicate = variants.some((variant, index) => (
        index !== field.name
        && String(variant?.sku || '').trim().toLowerCase() === sku
      ));
      const productSku = String(form.getFieldValue('sku') || '').trim().toLowerCase();
      if (duplicate || (!isEditing && sku === productSku)) {
        throw new Error('SKU must be unique within this product.');
      }
    },
  });

  const uniqueCombinationRule = (field) => ({
    validator: async () => {
      const variants = form.getFieldValue('variants') || [];
      const current = variants[field.name] || {};
      if (!current.color?.trim() || !current.size?.trim()) return;
      const duplicate = variants.some((variant, index) => (
        index !== field.name
        && String(variant?.color || '').trim().toLowerCase() === current.color.trim().toLowerCase()
        && String(variant?.size || '').trim().toLowerCase() === current.size.trim().toLowerCase()
      ));
      if (duplicate) throw new Error('Color and size combination must be unique.');
    },
  });

  const variantColumns = (fields, remove) => [
    {
      title: 'Color',
      key: 'color',
      render: (_, field) => (
        <Form.Item
          name={[field.name, 'color']}
          rules={[{ required: true, whitespace: true, message: 'Color is required.' }, uniqueCombinationRule(field)]}
        >
          <Input placeholder="Black" />
        </Form.Item>
      ),
    },
    {
      title: 'Size',
      key: 'size',
      render: (_, field) => (
        <Form.Item
          name={[field.name, 'size']}
          rules={[{ required: true, whitespace: true, message: 'Size is required.' }, uniqueCombinationRule(field)]}
        >
          <Input placeholder="M" />
        </Form.Item>
      ),
    },
    {
      title: 'Price',
      key: 'price',
      render: (_, field) => (
        <Form.Item
          name={[field.name, 'price']}
          rules={[{ required: true, type: 'number', min: 0, message: 'Enter a valid price.' }]}
        >
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
      ),
    },
    {
      title: 'SKU',
      key: 'sku',
      render: (_, field) => (
        <Form.Item
          name={[field.name, 'sku']}
          rules={[{ required: true, whitespace: true, message: 'SKU is required.' }, uniqueVariantSkuRule(field)]}
        >
          <Input placeholder="SKU-B-M" />
        </Form.Item>
      ),
    },
    {
      title: 'Stock',
      key: 'stock',
      render: (_, field) => (
        <Form.Item
          name={[field.name, 'stock']}
          rules={[{ required: true, type: 'number', min: 0, message: 'Enter a valid stock quantity.' }]}
        >
          <InputNumber min={0} precision={0} disabled={hasExistingVariantStock(field)} style={{ width: '100%' }} />
        </Form.Item>
      ),
    },
    {
      title: '',
      key: 'delete',
      render: (_, field) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          aria-label={`Remove variant ${field.name + 1}`}
          disabled={fields.length === 1}
          onClick={() => remove(field.name)}
        />
      ),
    },
  ];

  const baseSkuRules = [
    { required: true, whitespace: true, message: 'Inventory SKU is required.' },
    {
      validator: async (_, value) => {
        const sku = String(value || '').trim().toLowerCase();
        if (!sku) return;
        const variants = form.getFieldValue('variants') || [];
        if (variants.some((variant) => String(variant?.sku || '').trim().toLowerCase() === sku)) {
          throw new Error('Inventory SKU must be unique from variant SKUs.');
        }
      },
    },
  ];

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={defaultValues}
      onFinish={onSubmit}
      className="product-form"
    >
      {saveError && <Alert message={saveError} type="error" showIcon style={{ marginBottom: 16 }} />}
      {isEditing && (
        <Alert
          type="info"
          showIcon
          message={<>Existing SKU stock is read-only here. Use <Typography.Link onClick={() => navigate('/inventory')}>Inventory</Typography.Link> to restock products. New variants can have initial stock.</>}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="form-section" variant="borderless">
        <Typography.Text className="form-section-title">Basic information</Typography.Text>
        <div className="form-grid">
          <Form.Item
            label="Product Name"
            name="name"
            rules={[{ required: true, whitespace: true, message: 'Product name is required.' }]}
          >
            <Input placeholder="Product name" />
          </Form.Item>
          {canAssignVendor && (
            <Form.Item label="Product owner" name="vendor" help={vendorError || 'Leave Admin-managed for products without a Vendor owner.'} validateStatus={vendorError ? 'warning' : undefined}>
              <Select
                showSearch
                filterOption={false}
                onSearch={onVendorSearch}
                loading={vendorLoading}
                options={[
                  { value: '', label: 'Admin-managed' },
                  ...vendors.map((vendor) => ({ value: vendor._id, label: vendor.email })),
                  ...(initialValues?.vendor && !vendors.some((vendor) => vendor._id === initialValues.vendor)
                    ? [{ value: initialValues.vendor, label: `Assigned Vendor (${initialValues.vendor})` }] : []),
                ]}
              />
            </Form.Item>
          )}
          {!isEditing && (
            <Form.Item label="Inventory SKU" name="sku" rules={baseSkuRules}>
              <Input placeholder="NOVA-PROD-001" />
            </Form.Item>
          )}
          <Form.Item
            label="Category"
            name="category"
            rules={[{ required: true, message: 'Category is required.' }]}
          >
            <Select options={categories.map((category) => ({ value: category.name, label: category.name }))} placeholder="Select category" />
          </Form.Item>
          <Form.Item
            label="Base Price"
            name="price"
            rules={[{ required: true, type: 'number', min: 0.01, message: 'Enter a price greater than zero.' }]}
          >
            <InputNumber min={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Sale Price" name="salePrice" rules={[{ type: 'number', min: 0, message: 'Sale price cannot be negative.' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="Product Stock"
            name="stock"
            rules={[{ required: true, type: 'number', min: 0, message: 'Enter a valid stock quantity.' }]}
          >
            <InputNumber min={0} precision={0} disabled={isEditing} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Description" name="description" className="form-wide">
            <Input.TextArea rows={4} placeholder="Tell customers about this product" />
          </Form.Item>
        </div>
      </Card>
      <Card className="form-section" variant="borderless">
        <Form.List name="variants">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Form.Item key={field.key} name={[field.name, '_id']} hidden>
                  <Input />
                </Form.Item>
              ))}
              <div className="section-heading-row">
                <div>
                  <Typography.Text className="form-section-title">Product variants</Typography.Text>
                  <Typography.Paragraph>Define color, size, SKU, price, and stock for each variant.</Typography.Paragraph>
                </div>
                <Button icon={<PlusOutlined />} onClick={() => add({ ...emptyVariant })}>Add Variant</Button>
              </div>
              <Table
                className="variant-table"
                rowKey="key"
                columns={variantColumns(fields, remove)}
                dataSource={fields}
                pagination={false}
                scroll={{ x: 850 }}
              />
            </>
          )}
        </Form.List>
      </Card>
      <div className="form-submit-row">
        <Button onClick={() => navigate('/products')}>Cancel</Button>
        <Button type="primary" htmlType="submit" loading={loading}>Save Product</Button>
      </div>
    </Form>
  );
}

export default ProductForm;
