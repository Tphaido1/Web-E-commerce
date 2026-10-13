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
        throw new Error('Mã SKU phải là duy nhất trong sản phẩm này.');
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
      if (duplicate) throw new Error('Sự kết hợp màu sắc và kích cỡ phải là duy nhất.');
    },
  });

  const variantColumns = (fields, remove) => [
    {
      title: 'Màu sắc',
      key: 'color',
      render: (_, field) => (
        <Form.Item
          name={[field.name, 'color']}
          rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập màu sắc.' }, uniqueCombinationRule(field)]}
        >
          <Input placeholder="Trắng, Đen, Xanh..." />
        </Form.Item>
      ),
    },
    {
      title: 'Kích cỡ',
      key: 'size',
      render: (_, field) => (
        <Form.Item
          name={[field.name, 'size']}
          rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập kích cỡ.' }, uniqueCombinationRule(field)]}
        >
          <Input placeholder="S, M, L, XL, 30, 31..." />
        </Form.Item>
      ),
    },
    {
      title: 'Giá',
      key: 'price',
      render: (_, field) => (
        <Form.Item
          name={[field.name, 'price']}
          rules={[{ required: true, type: 'number', min: 0, message: 'Vui lòng nhập mức giá hợp lệ.' }]}
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
          rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập mã SKU.' }, uniqueVariantSkuRule(field)]}
        >
          <Input placeholder="CLOTH-TS-001-W-M" />
        </Form.Item>
      ),
    },
    {
      title: 'Tồn kho',
      key: 'stock',
      render: (_, field) => (
        <Form.Item
          name={[field.name, 'stock']}
          rules={[{ required: true, type: 'number', min: 0, message: 'Vui lòng nhập số lượng tồn kho hợp lệ.' }]}
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
          aria-label={`Xóa biến thể ${field.name + 1}`}
          disabled={fields.length === 1}
          onClick={() => remove(field.name)}
        />
      ),
    },
  ];

  const baseSkuRules = [
    { required: true, whitespace: true, message: 'Vui lòng nhập mã SKU sản phẩm.' },
    {
      validator: async (_, value) => {
        const sku = String(value || '').trim().toLowerCase();
        if (!sku) return;
        const variants = form.getFieldValue('variants') || [];
        if (variants.some((variant) => String(variant?.sku || '').trim().toLowerCase() === sku)) {
          throw new Error('Mã SKU sản phẩm không được trùng với mã SKU của các biến thể.');
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
          message={<>Tồn kho của các SKU hiện có không thể chỉnh sửa trực tiếp tại đây. Vui lòng vào trang <Typography.Link onClick={() => navigate('/inventory')}>Kho hàng</Typography.Link> để nhập thêm hàng. Các biến thể mới thêm có thể nhập số lượng ban đầu.</>}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="form-section" variant="borderless">
        <Typography.Text className="form-section-title">Thông tin cơ bản</Typography.Text>
        <div className="form-grid">
          <Form.Item
            label="Tên sản phẩm"
            name="name"
            rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên sản phẩm.' }]}
          >
            <Input placeholder="Tên sản phẩm (VD: Áo Thun Cotton Compact, Sơ Mi Oxford...)" />
          </Form.Item>
          {/* =========================================================================
           * PHẦN MỞ RỘNG (TẠM ẨN): CHỌN VENDOR CHO MÔ HÌNH MULTI-VENDOR
           * Trong mô hình Single Shop: Admin là chủ shop trực tiếp quản lý toàn bộ sản phẩm.
           * ========================================================================= */}
          <Form.Item name="vendor" hidden>
            <Input />
          </Form.Item>
          {!isEditing && (
            <Form.Item label="Mã SKU sản phẩm" name="sku" rules={baseSkuRules}>
              <Input placeholder="CLOTH-TS-001" />
            </Form.Item>
          )}
          <Form.Item
            label="Danh mục"
            name="category"
            rules={[{ required: true, message: 'Vui lòng chọn danh mục.' }]}
          >
            <Select options={categories.map((category) => ({ value: category.name, label: category.name }))} placeholder="Chọn danh mục thời trang" />
          </Form.Item>
          <Form.Item
            label="Giá gốc"
            name="price"
            rules={[{ required: true, type: 'number', min: 0.01, message: 'Vui lòng nhập mức giá lớn hơn 0.' }]}
          >
            <InputNumber min={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Giá khuyến mãi" name="salePrice" rules={[{ type: 'number', min: 0, message: 'Giá khuyến mãi không được âm.' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="Tồn kho sản phẩm"
            name="stock"
            rules={[{ required: true, type: 'number', min: 0, message: 'Vui lòng nhập số lượng tồn kho hợp lệ.' }]}
          >
            <InputNumber min={0} precision={0} disabled={isEditing} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Mô tả sản phẩm" name="description" className="form-wide">
            <Input.TextArea rows={4} placeholder="Mô tả chất liệu vải, kiểu dáng form, độ co giãn, hướng dẫn chọn size và bảo quản..." />
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
                  <Typography.Text className="form-section-title">Biến thể sản phẩm</Typography.Text>
                  <Typography.Paragraph>Thiết lập màu sắc, kích cỡ, mã SKU, giá bán và số lượng tồn kho cho từng biến thể.</Typography.Paragraph>
                </div>
                <Button icon={<PlusOutlined />} onClick={() => add({ ...emptyVariant })}>Thêm biến thể</Button>
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
        <Button onClick={() => navigate('/products')}>Hủy</Button>
        <Button type="primary" htmlType="submit" loading={loading}>Lưu sản phẩm</Button>
      </div>
    </Form>
  );
}

export default ProductForm;
