import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home/Home.jsx';
import Login from './pages/Login/Login.jsx';
import Register from './pages/Register/Register.jsx';
import Products from './pages/Products/Products.jsx';
import ProductDetail from './pages/ProductDetail/ProductDetail.jsx';
import Cart from './pages/Cart/Cart.jsx';
import Checkout from './pages/Checkout/Checkout.jsx';
import MyOrders from './pages/MyOrders/MyOrders.jsx';
import OrderDetail from './pages/OrderDetail/OrderDetail.jsx';
import TrackOrder from './pages/TrackOrder/TrackOrder.jsx';
import PaymentResult from './pages/PaymentResult/PaymentResult.jsx';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import OfflineBanner from './components/OfflineBanner/OfflineBanner.jsx';
import './styles/global.css';

function App() {
  return (
    <ToastProvider><CartProvider>
      <OfflineBanner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          <Route path="/checkout/payment-result" element={<ProtectedRoute><PaymentResult /></ProtectedRoute>} />
          <Route path="/my-orders" element={<ProtectedRoute><MyOrders /></ProtectedRoute>} />
          <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
          <Route path="/track-order" element={<TrackOrder />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </CartProvider></ToastProvider>
  );
}

export default App;
