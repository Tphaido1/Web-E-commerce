import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';

const AdminLayout = lazy(() => import('./components/AdminLayout.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Orders = lazy(() => import('./pages/Orders.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const ProductDetail = lazy(() => import('./pages/ProductDetail.jsx'));
const ProductEditor = lazy(() => import('./pages/ProductEditor.jsx'));
const Reviews = lazy(() => import('./pages/Reviews.jsx'));
const Inventory = lazy(() => import('./pages/Inventory.jsx'));
const Users = lazy(() => import('./pages/Users.jsx'));

function App() {
  return (
    <Suspense fallback={<div className="empty-state"><Spin size="large" /></div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/new" element={<ProductEditor />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/products/:id/edit" element={<ProductEditor />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/users" element={<Users />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
