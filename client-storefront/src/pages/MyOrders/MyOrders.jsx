import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import { getMyOrders } from '../../services/orderService.js';
import { formatCurrency } from '../../utils/currency.js';
import './MyOrders.css';

const STATUS_LABELS = {
  pending: 'Chờ xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã hủy',
};

function getErrorMessage(error) {
  return error.response?.data?.message || error.message || 'Không thể tải đơn hàng. Vui lòng thử lại.';
}

function formatDate(value) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function MyOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const status = searchParams.get('status') || '';
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError('');
    getMyOrders({ page, limit: 10, status, signal: controller.signal })
      .then(setResult)
      .catch((requestError) => {
        if (requestError.name !== 'CanceledError') setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [page, status, retry]);

  const setFilter = (nextStatus) => {
    const params = new URLSearchParams();
    if (nextStatus) params.set('status', nextStatus);
    setSearchParams(params, { replace: true });
  };

  const setPage = (nextPage) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (nextPage > 1) params.set('page', String(nextPage));
    setSearchParams(params);
  };

  const orders = result?.orders || [];
  const pagination = result?.pagination;

  return (
    <div className="storefront-page">
      <Header />
      <main className="orders-page">
        <div className="orders-heading">
          <div><p className="section-kicker">Tài khoản</p><h1>Đơn hàng của tôi</h1></div>
          <label className="orders-filter">
            Trạng thái
            <select value={status} onChange={(event) => setFilter(event.target.value)}>
              <option value="">Tất cả đơn hàng</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        {isLoading ? (
          <section className="orders-state" role="status"><h2>Đang tải đơn hàng...</h2></section>
        ) : error ? (
          <section className="orders-state orders-error" role="alert">
            <h2>Không thể tải đơn hàng.</h2><p>{error}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button>
          </section>
        ) : orders.length === 0 ? (
          <section className="orders-state">
            <h2>{status ? 'Không có đơn hàng ở trạng thái này.' : 'Bạn chưa có đơn hàng nào.'}</h2>
            <Link to="/products">Khám phá sản phẩm</Link>
          </section>
        ) : (
          <>
            <div className="orders-list">
              {orders.map((order) => (
                <article className="order-card" key={order._id}>
                  <div className="order-card-heading">
                    <div><span>Mã đơn hàng</span><strong>{order.orderCode}</strong></div>
                    <span className={`order-status order-status-${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>
                  </div>
                  <div className="order-card-info">
                    <span>{formatDate(order.createdAt)}</span>
                    <span>{order.items?.length || 0} sản phẩm</span>
                    <span>{order.paymentMethod} · {order.paymentStatus === 'paid' ? 'Đã thanh toán' : order.paymentStatus === 'unpaid' ? 'Chưa thanh toán' : order.paymentStatus}</span>
                    <strong>{formatCurrency(order.finalAmount)}</strong>
                  </div>
                  <Link className="order-detail-link" to={`/orders/${order._id}`}>Xem chi tiết</Link>
                </article>
              ))}
            </div>
            {pagination?.totalPages > 1 && (
              <nav className="orders-pagination" aria-label="Phân trang đơn hàng">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</button>
                <span>Trang {pagination.page} / {pagination.totalPages}</span>
                <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Trang sau</button>
              </nav>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default MyOrders;
