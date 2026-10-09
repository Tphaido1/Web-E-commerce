import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import { trackOrder } from '../../services/orderService.js';
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

function TrackOrder() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryCode = searchParams.get('code') || '';
  const token = searchParams.get('token') || '';
  const [codeInput, setCodeInput] = useState(queryCode);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(queryCode));
  const [retry, setRetry] = useState(0);

  useEffect(() => setCodeInput(queryCode), [queryCode]);

  useEffect(() => {
    if (!queryCode) {
      setOrder(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setOrder(null);
    setError(null);
    trackOrder(queryCode, token, { signal: controller.signal })
      .then(setOrder)
      .catch((requestError) => {
        if (requestError.name !== 'CanceledError') {
          setError({
            status: requestError.response?.status,
            message: requestError.response?.data?.message || requestError.message || 'Không thể tra cứu đơn hàng.',
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [queryCode, token, retry]);

  const submitSearch = (event) => {
    event.preventDefault();
    const code = codeInput.trim();
    if (!code) return;
    navigate(`/track-order?code=${encodeURIComponent(code)}`);
  };

  return (
    <div className="storefront-page">
      <Header />
      <main className="track-order-page">
        <div className="track-order-heading"><p className="section-kicker">Tra cứu công khai</p><h1>Theo dõi đơn hàng</h1><p>Nhập mã đơn hàng hoặc mở đường dẫn từ mã QR trong email xác nhận.</p></div>
        <form className="track-order-form" onSubmit={submitSearch}>
          <label htmlFor="tracking-code">Mã đơn hàng</label>
          <div><input id="tracking-code" value={codeInput} onChange={(event) => setCodeInput(event.target.value)} placeholder="Ví dụ: ORD-..." required /><button type="submit">Tra cứu</button></div>
        </form>

        {loading ? (
          <section className="order-view-state" role="status"><h2>Đang tra cứu đơn hàng...</h2></section>
        ) : error ? (
          <section className="order-view-state" role="alert">
            <h2>{error.status === 404 ? 'Không tìm thấy đơn hàng.' : error.status === 403 ? 'Không được phép tra cứu đơn hàng này.' : 'Không thể tra cứu đơn hàng.'}</h2>
            <p>{error.message}</p>
            {error.status !== 404 && error.status !== 403 && <button type="button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button>}
          </section>
        ) : order ? (
          <section className="track-order-card">
            <div className="order-detail-topline">
              <div><span>Mã đơn hàng</span><h2>{order.orderCode}</h2></div>
              <span className={`order-status order-status-${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>
            </div>
            <div className="track-order-summary">
              <div><span>Đặt lúc</span><strong>{formatDate(order.createdAt)}</strong></div>
              <div><span>Người nhận</span><strong>{order.recipientName || 'Khách hàng'}</strong></div>
              {order.city && <div><span>Khu vực</span><strong>{order.city}</strong></div>}
              {order.isVerifiedByHMAC && order.paymentStatus && <div><span>Thanh toán</span><strong>{PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus} · {order.paymentMethod}</strong></div>}
              {order.isVerifiedByHMAC && Number.isFinite(order.finalAmount) && <div><span>Tổng thanh toán</span><strong>{formatCurrency(order.finalAmount)}</strong></div>}
            </div>
            {order.isVerifiedByHMAC ? (
              <>
                <h3>Sản phẩm trong đơn hàng</h3>
                <div className="order-detail-items">
                  {(order.items || []).map((item) => (
                    <article className="order-detail-item" key={item._id || `${item.sku}-${item.variantId}`}>
                      {item.image && <img src={item.image} alt="" />}
                      <div className="order-detail-item-name"><strong>{item.name}</strong><span>SKU: {item.sku}</span>{item.variantId && <span>Phân loại: {item.variantId}</span>}<span>Số lượng: {item.quantity}</span></div>
                      <strong>{formatCurrency(item.subtotal ?? item.price * item.quantity)}</strong>
                    </article>
                  ))}
                </div>
                {order.shippingAddress && <p className="track-order-address">Giao đến: {order.shippingAddress.fullName}, {order.shippingAddress.address}, {[order.shippingAddress.ward, order.shippingAddress.district, order.shippingAddress.city].filter(Boolean).join(', ')}</p>}
              </>
            ) : (
              <p className="track-order-private-note">{token ? 'Mã QR không hợp lệ; thông tin thanh toán, sản phẩm và địa chỉ được ẩn.' : 'Thông tin thanh toán, sản phẩm và địa chỉ chỉ hiển thị khi tra cứu bằng liên kết QR bảo mật.'}</p>
            )}
            <h3>Tiến trình đơn hàng</h3>
            <div className="order-tracking-history">
              {(order.trackingHistory || []).map((entry, index) => (
                <article className="order-history-entry" key={`${entry.updatedAt}-${index}`}>
                  <span className="order-history-dot" />
                  <div><strong>{STATUS_LABELS[entry.status] || entry.status}</strong><p>{entry.note}</p><time>{formatDate(entry.updatedAt)}</time></div>
                </article>
              ))}
            </div>
            {order.isVerifiedByHMAC && Number.isFinite(order.itemCount) && <p className="track-order-count">{order.itemCount} sản phẩm trong đơn hàng</p>}
          </section>
        ) : null}
        <p className="track-order-account-link"><Link to="/my-orders">Đăng nhập để xem toàn bộ đơn hàng của bạn</Link></p>
      </main>
      <Footer />
    </div>
  );
}

export default TrackOrder;
