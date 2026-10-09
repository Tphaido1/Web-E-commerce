import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import { createVNPayPaymentUrl, getOrderById, processVNPayReturn } from '../../services/orderService.js';
import { formatCurrency } from '../../utils/currency.js';
import { getAuthSession } from '../../services/authSession.js';
import '../OrderViews.css';
import './PaymentResult.css';

const PAYMENT_LABELS = {
  unpaid: 'Chưa thanh toán',
  paid: 'Đã thanh toán',
  failed: 'Thanh toán thất bại',
  refunded: 'Đã hoàn tiền',
};

function getErrorMessage(error) {
  return error.response?.data?.message || error.message || 'Không thể xác minh kết quả thanh toán.';
}

function PaymentResult() {
  const location = useLocation();
  const [verifiedOrder, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetryingPayment, setIsRetryingPayment] = useState(false);
  const sessionIdRef = useRef(getAuthSession()?.sessionId);
  const activeRef = useRef(true);
  const currentQueryRef = useRef(location.search);
  const verifiedQueryRef = useRef(null);
  const retryLockRef = useRef(false);
  currentQueryRef.current = location.search;
  const order = verifiedQueryRef.current === location.search ? verifiedOrder : null;
  const isCurrentRequest = (query) => activeRef.current && currentQueryRef.current === query && getAuthSession()?.sessionId === sessionIdRef.current;

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const query = location.search;
    const params = Object.fromEntries(new URLSearchParams(location.search));
    verifiedQueryRef.current = null;
    setOrder(null);
    setError('');
    setIsRefreshing(false);
    setIsRetryingPayment(false);
    if (!params.vnp_TxnRef || !params.vnp_SecureHash) {
      setError('Thiếu dữ liệu phản hồi VNPay. Không thể xác minh kết quả giao dịch.');
      setIsLoading(false);
      return () => controller.abort();
    }

    setIsLoading(true);
    setError('');
    processVNPayReturn(params, { signal: controller.signal })
      .then((result) => isCurrentRequest(query) && !controller.signal.aborted ? getOrderById(result.orderId, { signal: controller.signal }) : null)
      .then((currentOrder) => {
        if (currentOrder && isCurrentRequest(query) && !controller.signal.aborted) {
          verifiedQueryRef.current = query;
          setOrder(currentOrder);
        }
      })
      .catch((requestError) => {
        if (requestError.name !== 'CanceledError' && isCurrentRequest(query) && !controller.signal.aborted) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted && isCurrentRequest(query)) setIsLoading(false);
      });
    return () => controller.abort();
  }, [location.search]);

  const refreshStatus = async () => {
    const query = location.search;
    if (!order?._id || !isCurrentRequest(query)) return;
    setIsRefreshing(true);
    setError('');
    try {
      const currentOrder = await getOrderById(order._id);
      if (isCurrentRequest(query)) setOrder(currentOrder);
    } catch (requestError) {
      if (isCurrentRequest(query)) setError(getErrorMessage(requestError));
    } finally {
      if (isCurrentRequest(query)) setIsRefreshing(false);
    }
  };

  const retryPayment = async () => {
    const query = location.search;
    if (!order?._id || retryLockRef.current || isRetryingPayment || !isCurrentRequest(query)) return;
    retryLockRef.current = true;
    setIsRetryingPayment(true);
    setError('');
    try {
      const payment = await createVNPayPaymentUrl(order._id);
      if (isCurrentRequest(query)) window.location.assign(payment.paymentUrl);
    } catch (requestError) {
      if (isCurrentRequest(query)) {
        setError(getErrorMessage(requestError));
        setIsRetryingPayment(false);
      }
    } finally {
      retryLockRef.current = false;
    }
  };

  const paymentState = order?.paymentStatus === 'paid'
    ? 'success'
    : order?.paymentStatus === 'failed'
      ? 'failed'
      : order?.paymentStatus === 'refunded'
        ? 'refunded'
        : order?.status === 'cancelled'
          ? 'cancelled'
      : order
        ? 'pending'
        : 'unverified';

  return (
    <div className="storefront-page">
      <Header />
      <main className="payment-result-page">
        <p className="section-kicker">VNPay</p>
        <h1>Kết quả thanh toán</h1>
        {isLoading ? (
          <section className="payment-result-card" role="status"><h2>Đang xác minh với hệ thống đơn hàng...</h2></section>
        ) : error && !order ? (
          <section className="payment-result-card payment-result-error" role="alert">
            <h2>Chưa thể xác minh thanh toán</h2><p>{error}</p>
            <p>Không dựa vào thông tin trong URL để xác nhận giao dịch. Hãy mở đơn hàng để kiểm tra trạng thái từ máy chủ.</p>
            <Link to="/my-orders">Đến đơn hàng của tôi</Link>
          </section>
        ) : order ? (
          <section className={`payment-result-card payment-result-${paymentState}`} role={paymentState === 'pending' ? 'status' : 'region'}>
            <p className="section-kicker">
              {paymentState === 'success' ? 'Thanh toán thành công' : paymentState === 'failed' ? 'Thanh toán thất bại' : paymentState === 'refunded' ? 'Đã hoàn tiền' : paymentState === 'cancelled' ? 'Đơn hàng đã hủy' : 'Chờ xác nhận'}
            </p>
            <h2>
              {paymentState === 'success'
                ? 'VNPay đã xác nhận thanh toán.'
                : paymentState === 'failed'
                  ? 'Giao dịch chưa thành công.'
                  : paymentState === 'refunded'
                    ? 'Khoản thanh toán đã được hoàn lại.'
                    : paymentState === 'cancelled'
                      ? 'Đơn hàng đã bị hủy và không thể thanh toán tiếp.'
                  : 'Giao dịch chưa được xác nhận hoàn tất.'}
            </h2>
            <p>Mã đơn hàng: <strong>{order.orderCode}</strong></p>
            <p>Trạng thái thanh toán từ hệ thống: <strong>{PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus}</strong></p>
            <p>Tổng thanh toán: <strong>{formatCurrency(order.finalAmount)}</strong></p>
            {paymentState === 'pending' && <p>VNPay hoặc ngân hàng có thể đang xử lý thông báo. Trạng thái này chưa phải là xác nhận thành công.</p>}
            {error && <p className="payment-result-inline-error" role="alert">{error}</p>}
            <div className="payment-result-actions">
              <Link className="checkout-primary-link" to={`/orders/${order._id}`}>Xem chi tiết đơn hàng</Link>
              <button type="button" onClick={refreshStatus} disabled={isRefreshing}>{isRefreshing ? 'Đang kiểm tra...' : 'Kiểm tra lại trạng thái'}</button>
              {paymentState === 'failed' && order.status !== 'cancelled' && (
                <button type="button" onClick={retryPayment} disabled={isRetryingPayment}>
                  {isRetryingPayment ? 'Đang kết nối VNPay...' : 'Thử thanh toán lại'}
                </button>
              )}
              <Link to="/my-orders">Đơn hàng của tôi</Link>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

export default PaymentResult;
