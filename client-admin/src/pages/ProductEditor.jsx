import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Spin, Typography, message } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ProductForm from '../components/ProductForm.jsx';
import { categoryService } from '../services/categoryService.js';
import { productService } from '../services/productService.js';
import { authService } from '../services/authService.js';
import { userService } from '../services/userService.js';

const getErrorMessage = (error) => (
  error.response?.data?.message || error.message || 'Unable to complete the product request.'
);

function ProductEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canAssignVendor = authService.getSession()?.user?.role === 'admin';
  const [loading, setLoading] = useState(false);
  const saveInFlight = useRef(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState('');

  const loadData = useCallback(async (signal) => {
    setLoadingData(true);
    setLoadError('');
    try {
      const [categoryData, productData] = await Promise.all([
        categoryService.listActive({ signal }),
        id ? productService.get(id, { signal }) : Promise.resolve(null),
      ]);
      if (signal.aborted) return;
      setCategories(categoryData);
      setProduct(productData);
    } catch (error) {
      if (!signal.aborted) setLoadError(getErrorMessage(error));
    } finally {
      if (!signal.aborted) setLoadingData(false);
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData, reload]);

  useEffect(() => {
    if (!canAssignVendor) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setVendorLoading(true);
      setVendorError('');
      userService.list({ role: 'vendor', active: true, search: vendorSearch, limit: 100 }, { signal: controller.signal })
        .then((data) => { if (!controller.signal.aborted) setVendors(data.users); })
        .catch((error) => { if (!controller.signal.aborted) setVendorError(getErrorMessage(error)); })
        .finally(() => { if (!controller.signal.aborted) setVendorLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [canAssignVendor, vendorSearch]);

  const handleSubmit = async (values) => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setLoading(true);
    setSaveError('');
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() || '',
      category: values.category,
      price: values.price,
      salePrice: values.salePrice ?? null,
      stock: values.stock,
      ...(canAssignVendor ? { vendor: values.vendor || null } : {}),
      variants: values.variants.map((variant) => ({
        ...(variant._id ? { _id: variant._id } : {}),
        color: variant.color.trim(),
        size: variant.size.trim(),
        sku: variant.sku.trim().toUpperCase(),
        price: variant.price,
        stock: variant.stock,
      })),
    };

    try {
      if (id) {
        await productService.update(id, payload);
      } else {
        await productService.create({
          ...payload,
          sku: values.sku.trim().toUpperCase(),
        });
      }
      message.success(id ? 'Product updated.' : 'Product created.');
      navigate('/products');
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      saveInFlight.current = false;
      setLoading(false);
    }
  };

  if (loadingData) {
    return <div className="empty-state"><Spin size="large" /></div>;
  }

  return (
    <div className="page-stack">
      <Button type="link" icon={<ArrowLeftOutlined />} className="back-link" onClick={() => navigate('/products')}>
        Back to products
      </Button>
      <section className="page-intro">
        <div>
          <Typography.Text className="eyebrow">CATALOG EDITOR</Typography.Text>
          <Typography.Title level={1}>{id ? 'Edit Product' : 'Add Product'}</Typography.Title>
          <Typography.Paragraph>
            {id ? 'Update product information and variants.' : 'Create a product for the catalog.'}
          </Typography.Paragraph>
        </div>
      </section>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message={loadError}
          action={<Button size="small" onClick={() => setReload((current) => current + 1)}>Retry</Button>}
        />
      ) : (
        <ProductForm
          key={id || 'new'}
          initialValues={product ? { ...product, vendor: product.vendor?._id || product.vendor || '' } : undefined}
          categories={categories}
          canAssignVendor={canAssignVendor}
          vendors={vendors}
          vendorLoading={vendorLoading}
          vendorError={vendorError}
          onVendorSearch={setVendorSearch}
          loading={loading}
          saveError={saveError}
          onSubmit={handleSubmit}
          isEditing={Boolean(id)}
        />
      )}
    </div>
  );
}

export default ProductEditor;
