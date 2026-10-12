import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './pages/Home/Home.jsx';
import Login from './pages/Login/Login.jsx';
import Register from './pages/Register/Register.jsx';
import Products from './pages/Products/Products.jsx';
import Categories from './pages/Categories/Categories.jsx';
import ProductDetail from './pages/ProductDetail/ProductDetail.jsx';
import Cart from './pages/Cart/Cart.jsx';
import Checkout from './pages/Checkout/Checkout.jsx';
import MyOrders from './pages/MyOrders/MyOrders.jsx';
import OrderDetail from './pages/OrderDetail/OrderDetail.jsx';
import TrackOrder from './pages/TrackOrder/TrackOrder.jsx';
import PaymentResult from './pages/PaymentResult/PaymentResult.jsx';
import Wishlist from './pages/Wishlist/Wishlist.jsx';
import Profile from './pages/Profile/Profile.jsx';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute.jsx';
import { CartProvider } from './context/CartContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { WishlistProvider } from './context/WishlistContext.jsx';
import OfflineBanner from './components/OfflineBanner/OfflineBanner.jsx';
import './styles/global.css';

function App() {
  return (
    <ToastProvider>
      <CartProvider>
        <WishlistProvider>
          <OfflineBanner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/products" element={<Products />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/products/:id" element={<ProductDetail />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
              <Route path="/checkout/payment-result" element={<ProtectedRoute><PaymentResult /></ProtectedRoute>} />
              <Route path="/my-orders" element={<ProtectedRoute><MyOrders /></ProtectedRoute>} />
              <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
              <Route path="/track-order" element={<TrackOrder />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </BrowserRouter>
        </WishlistProvider>
      </CartProvider>
    </ToastProvider>
  );
}

export default App;
