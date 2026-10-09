import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import { getOrderById } from '../../services/orderService.js';
import { formatCurrency } from '../../utils/currency.js';
import '../OrderViews.css';

const STATUS_LABELS = {
  pending: 'Chờ xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã hủy',
};

const PAYMENT_LABELS = { unpaid: 'Chưa thanh toán', paid: 'Đã thanh toán', failed: 'Thanh toán thất bại', refunded: 'Đã hoàn tiền' };

function formatDate(value) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getOrderById(id, { signal: controller.signal })
      .then(setOrder)
      .catch((requestError) => {
        if (requestError.name !== 'CanceledError') {
          const status = requestError.response?.status;
          setError({
            status,
            message: requestError.response?.data?.message || requestError.message || 'Không thể tải chi tiết đơn hàng.',
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retry]);

  const trackUrl = order?.qrTrackingToken
    ? `/track-order?code=${encodeURIComponent(order.orderCode)}&token=${encodeURIComponent(order.qrTrackingToken)}`
    : `/track-order?code=${encodeURIComponent(order?.orderCode || '')}`;

  return (
    <div className="storefront-page">
      <Header />
      <main className="order-detail-page">
        <div className="order-detail-heading">
          <p className="section-kicker">Tài khoản</p>
          <h1>Chi tiết đơn hàng</h1>
        </div>
        {loading ? (
          <section className="order-view-state" role="status"><h2>Đang tải đơn hàng...</h2></section>
        ) : error ? (
          <section className="order-view-state" role="alert">
            <h2>{error.status === 403 ? 'Bạn không có quyền xem đơn hàng này.' : error.status === 404 ? 'Không tìm thấy đơn hàng.' : 'Không thể tải chi tiết đơn hàng.'}</h2>
            {error.status !== 403 && error.status !== 404 && <p>{error.message}</p>}
            {error.status !== 403 && error.status !== 404 && <button type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button>}
            <Link to="/my-orders">Quay lại đơn hàng của tôi</Link>
          </section>
        ) : order && (
          <>
            <section className="order-detail-card">
              <div className="order-detail-topline">
                <div><span>Mã đơn hàng</span><h2>{order.orderCode}</h2></div>
                <span className={`order-status order-status-${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>
              </div>
              <p className="order-created-date">Đặt lúc {formatDate(order.createdAt)}</p>
              <div className="order-tracking-history" aria-label="Tiến trình đơn hàng">
                {(order.trackingHistory || []).map((entry, index) => (
                  <article className="order-history-entry" key={`${entry.updatedAt}-${index}`}>
                    <span className="order-history-dot" />
                    <div><strong>{STATUS_LABELS[entry.status] || entry.status}</strong><p>{entry.note}</p><time>{formatDate(entry.updatedAt)}</time></div>
                  </article>
                ))}
              </div>
            </section>

            <div className="order-detail-grid">
              <section className="order-detail-card">
                <h2>Sản phẩm</h2>
                <div className="order-detail-items">
                  {(order.items || []).map((item) => (
                    <article className="order-detail-item" key={item._id || `${item.sku}-${item.variantId}`}>
                      {item.image && <img src={item.image} alt="" />}
                      <div className="order-detail-item-name"><strong>{item.name}</strong><span>SKU: {item.sku}</span>{item.variantId && <span>Phân loại: {item.variantId}</span>}<span>Số lượng: {item.quantity}</span></div>
                      <strong>{formatCurrency(item.subtotal ?? item.price * item.quantity)}</strong>
                    </article>
                  ))}
                </div>
              </section>
              <section className="order-detail-card order-payment-card">
                <h2>Thanh toán</h2>
                <div><span>Phương thức</span><strong>{order.paymentMethod}</strong></div>
                <div><span>Trạng thái</span><strong>{PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus}</strong></div>
                <div><span>Tạm tính</span><strong>{formatCurrency(order.totalAmount)}</strong></div>
                <div><span>Giảm giá</span><strong>-{formatCurrency(order.discountAmount || 0)}</strong></div>
                <div><span>Phí giao hàng</span><strong>{formatCurrency(order.shippingFee || 0)}</strong></div>
                <div className="order-final-total"><span>Tổng thanh toán</span><strong>{formatCurrency(order.finalAmount)}</strong></div>
                <h2>Địa chỉ giao hàng</h2>
                <address>
                  {order.shippingAddress?.fullName}<br />
                  {order.shippingAddress?.phone}<br />
                  {order.shippingAddress?.address}<br />
                  {[order.shippingAddress?.ward, order.shippingAddress?.district, order.shippingAddress?.city].filter(Boolean).join(', ')}
                </address>
                {order.shippingAddress?.notes && <p>Ghi chú: {order.shippingAddress.notes}</p>}
              </section>
            </div>
            <div className="order-detail-actions">
              <Link to={trackUrl}>Tra cứu công khai</Link>
              <Link to="/my-orders">Quay lại đơn hàng của tôi</Link>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default OrderDetail;
