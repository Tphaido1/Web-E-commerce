import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Input, InputNumber, Modal, Select, Table, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService.js';
import { categoryService } from '../services/categoryService.js';
import { productService } from '../services/productService.js';

const formatPrice = (value) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value || 0);

const getErrorMessage = (error) => (
  error.response?.data?.message || error.message || 'Unable to complete the product request.'
);

function Products() {
  const navigate = useNavigate();
  const user = authService.getSession()?.user;
  const canManageProducts = ['admin', 'vendor'].includes(user?.role);
  const canDeleteProducts = user?.role === 'admin';
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState();
  const [minPrice, setMinPrice] = useState();
  const [maxPrice, setMaxPrice] = useState();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 12, total: 0 });
  const [reload, setReload] = useState(0);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPagination((current) => ({ ...current, current: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    categoryService.listActive()
      .then((data) => {
        if (active) setCategories(data);
      })
      .catch((error) => {
        if (active) setCategoryError(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
    };
    if (search) params.search = search;
    if (category) params.category = category;
    if (minPrice !== undefined) params.minPrice = minPrice;
    if (maxPrice !== undefined) params.maxPrice = maxPrice;

    setLoading(true);
    setLoadError('');
    productService.list(params, { signal: controller.signal })
      .then((data) => {
        setProducts(data.products);
        setPagination((current) => ({
          ...current,
          current: data.pagination.page,
          pageSize: data.pagination.limit,
          total: data.pagination.totalProducts,
        }));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(getErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [search, category, minPrice, maxPrice, pagination.current, pagination.pageSize, reload]);

  const confirmDelete = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await productService.remove(deleting._id);
      setDeleting(null);
      message.success('Product hidden from the storefront.');
      setPagination((current) => ({
        ...current,
        current: current.current > 1 && products.length === 1 ? current.current - 1 : current.current,
      }));
      setReload((current) => current + 1);
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = useMemo(() => [
    {
      title: 'Image',
      dataIndex: 'image',
      key: 'image',
      render: (value, product) => value
        ? <img src={value} alt="" className="table-product-avatar" />
        : <div className="table-product-avatar">{product.name.slice(0, 2).toUpperCase()}</div>,
    },
    {
      title: 'Product Name',
      dataIndex: 'name',
      key: 'name',
      render: (value, product) => (
        <div>
          <strong className="table-primary">{value}</strong>
          <span className="table-secondary">{product.variants?.map((variant) => variant.sku).join(', ') || 'No variant SKU'}</span>
        </div>
      ),
    },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Price', dataIndex: 'price', key: 'price', render: formatPrice },
    { title: 'Stock', dataIndex: 'stock', key: 'stock' },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'status',
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'default'}>{isActive ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, product) => (
        <div className="table-actions">
          <Button
            type="text"
            icon={<EyeOutlined />}
            aria-label={`View ${product.name}`}
            onClick={() => navigate(`/products/${product._id}`)}
          />
          {canManageProducts && (
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label={`Edit ${product.name}`}
              onClick={() => navigate(`/products/${product._id}/edit`)}
            />
          )}
          {canDeleteProducts && (
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={`Delete ${product.name}`}
              onClick={() => {
                setDeleteError('');
                setDeleting(product);
              }}
            />
          )}
        </div>
      ),
    },
  ], [canDeleteProducts, canManageProducts, navigate]);

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <Typography.Text className="eyebrow">CATALOG</Typography.Text>
          <Typography.Title level={1}>Products</Typography.Title>
          <Typography.Paragraph>Manage the products and variants in your catalog.</Typography.Paragraph>
        </div>
        {canManageProducts && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/products/new')}>
            Add Product
          </Button>
        )}
      </section>
      {loadError && (
        <Alert
          type="error"
          showIcon
          message={loadError}
          action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Retry</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      {categoryError && (
        <Alert type="error" showIcon message={`Unable to load categories: ${categoryError}`} style={{ marginBottom: 16 }} />
      )}
      <Card className="table-card" variant="borderless">
        <div className="table-toolbar product-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search product name or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            allowClear
            placeholder="Category"
            options={categories.map((item) => ({ value: item.name, label: item.name }))}
            value={category}
            onChange={(value) => {
              setCategory(value);
              setPagination((current) => ({ ...current, current: 1 }));
            }}
          />
          <InputNumber
            min={0}
            placeholder="Min price"
            value={minPrice}
            onChange={(value) => {
              setMinPrice(value ?? undefined);
              setPagination((current) => ({ ...current, current: 1 }));
            }}
          />
          <InputNumber
            min={0}
            placeholder="Max price"
            value={maxPrice}
            onChange={(value) => {
              setMaxPrice(value ?? undefined);
              setPagination((current) => ({ ...current, current: 1 }));
            }}
          />
        </div>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={products}
          loading={loading}
          scroll={{ x: 980 }}
          locale={{
            emptyText: loadError
              ? <Empty description="Products could not be loaded." />
              : <Empty description="No products found." />,
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ['12', '24', '48'],
            onChange: (current, pageSize) => setPagination((value) => ({ ...value, current, pageSize })),
          }}
        />
      </Card>
      {canDeleteProducts && (
        <Modal
          title={`Delete ${deleting?.name}?`}
          open={Boolean(deleting)}
          onCancel={() => setDeleting(null)}
          onOk={confirmDelete}
          okText="Delete"
          okButtonProps={{ danger: true }}
          confirmLoading={deleteLoading}
          cancelButtonProps={{ disabled: deleteLoading }}
          closable={!deleteLoading}
          maskClosable={!deleteLoading}
        >
          <Typography.Paragraph>
            This product will be marked inactive and hidden from the storefront.
          </Typography.Paragraph>
          {deleteError && <Alert message={deleteError} type="error" showIcon />}
        </Modal>
      )}
    </div>
  );
}

export default Products;
