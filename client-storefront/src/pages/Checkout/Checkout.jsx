import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import CartItem from '../../components/CartItem/CartItem.jsx';
import VNPayQrModal from '../../components/VNPayQrModal/VNPayQrModal.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getAuthSession } from '../../services/authSession.js';
import { applyCoupon, createOrder, createVNPayPaymentUrl, getOrderById } from '../../services/orderService.js';
import { formatCurrency } from '../../utils/currency.js';
import './Checkout.css';

const EMPTY_ADDRESS = {
  fullName: '',
  phone: '',
  address: '',
  city: '',
  district: '',
  ward: '',
  notes: '',
};
const SHIPPING_FEE = 0;

function getDraftKey() {
  const session = getAuthSession();
  const userId = session?.user?.id || session?.user?._id || session?.user?.email || 'account';
  return `storefront_checkout_draft:${userId}`;
}

function readDraft() {
  try {
    const session = getAuthSession();
    const draft = JSON.parse(sessionStorage.getItem(getDraftKey()) || 'null');
    return {
      address: {
        fullName: draft?.address?.fullName || session?.user?.name || '',
        phone: draft?.address?.phone || session?.user?.phone || '',
        address: draft?.address?.address || session?.user?.address || '',
        city: draft?.address?.city || '',
        district: draft?.address?.district || '',
        ward: draft?.address?.ward || '',
        notes: draft?.address?.notes || '',
      },
      couponCode: draft?.couponCode || '',
      paymentMethod: draft?.paymentMethod === 'VNPAY' ? 'VNPAY' : 'COD',
      idempotency: draft?.idempotency || null,
      pendingVnpayOrderId: draft?.pendingVnpayOrderId || '',
      pendingVnpayAttemptStarted: Boolean(draft?.pendingVnpayAttemptStarted),
    };
  } catch {
    return {
      address: EMPTY_ADDRESS,
      couponCode: '',
      paymentMethod: 'COD',
      idempotency: null,
      pendingVnpayOrderId: '',
      pendingVnpayAttemptStarted: false,
    };
  }
}

function saveDraft(draft, key) {
  sessionStorage.setItem(key, JSON.stringify(draft));
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getErrorMessage(error) {
  return error.response?.data?.message || error.message || 'Không thể hoàn tất đơn hàng. Vui lòng thử lại.';
}

function Checkout() {
  const toast = useToast();
  const { items, subtotal, totalQuantity, status: cartStatus, isMutating, syncState, clearCartAfterOrder } = useCart();
  const [draft, setDraft] = useState(readDraft);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const draftKeyRef = useRef(getDraftKey());
  const sessionIdRef = useRef(getAuthSession()?.sessionId);
  const activeRef = useRef(true);
  const submitLockRef = useRef(false);
  const couponRequestRef = useRef(0);
  const subtotalRef = useRef(subtotal);
  subtotalRef.current = subtotal;
  const isCurrentSession = () => activeRef.current && getAuthSession()?.sessionId === sessionIdRef.current;
  const persistDraft = (next) => {
    saveDraft(next, draftKeyRef.current);
    draftRef.current = next;
  };

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);
  const [couponPreview, setCouponPreview] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResumingPayment, setIsResumingPayment] = useState(Boolean(draft.pendingVnpayOrderId));
  const [paymentRecoveryOrder, setPaymentRecoveryOrder] = useState(null);
  const [paymentRecoveryError, setPaymentRecoveryError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutErrorFromRequest, setCheckoutErrorFromRequest] = useState(false);
  const [order, setOrder] = useState(null);
  const [vnpayModalData, setVnpayModalData] = useState(null);
  const reportCheckoutError = (error) => {
    const message = getErrorMessage(error);
    setCheckoutErrorFromRequest(true);
    setCheckoutError(message);
    toast.error(message, { dedupeKey: `checkout-request-error:${message}` });
  };

  const itemSignature = useMemo(
    () => JSON.stringify(items.map(({ id, productId, sku, variantId, quantity, price }) => ({ id, productId, sku, variantId, quantity, price }))),
    [items],
  );
  const itemsWithoutSku = items.filter((item) => !item.sku);
  const cartReady = cartStatus === 'ready' && navigator.onLine && !isMutating && syncState !== 'syncing';
  const confirmedSubtotal = couponPreview?.originalTotal ?? subtotal;
  const confirmedDiscount = couponPreview?.discountAmount ?? 0;
  const confirmedTotal = couponPreview?.newTotal !== undefined
    ? couponPreview.newTotal + SHIPPING_FEE
    : subtotal + SHIPPING_FEE;

  useEffect(() => {
    if (couponPreview && couponPreview.originalTotal !== subtotal) {
      setCouponPreview(null);
      setCouponError('Giỏ hàng đã thay đổi. Vui lòng áp dụng lại mã giảm giá để xác nhận mức giảm mới.');
    }
  }, [couponPreview, subtotal]);

  useEffect(() => {
    if (!draft.pendingVnpayOrderId) return undefined;
    const controller = new AbortController();
    setIsResumingPayment(true);
    setPaymentRecoveryError('');
    getOrderById(draft.pendingVnpayOrderId, { signal: controller.signal })
      .then(setPaymentRecoveryOrder)
      .catch((error) => {
        if (error.name !== 'CanceledError') {
          setPaymentRecoveryError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsResumingPayment(false);
      });
    return () => controller.abort();
  }, [draft.pendingVnpayOrderId]);

  const redirectToVNPay = async (orderId) => {
    if (submitLockRef.current || !isCurrentSession()) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    setCheckoutError('');
    setCheckoutErrorFromRequest(false);
    try {
      const payment = await createVNPayPaymentUrl(orderId, { bankCode: 'VNPAYQR' });
      if (!isCurrentSession()) return;
      const paymentDraft = { ...draft, pendingVnpayAttemptStarted: true };
      persistDraft(paymentDraft);
      setDraft(paymentDraft);
      const targetOrder = paymentRecoveryOrder || await getOrderById(orderId);
      setVnpayModalData({
        order: targetOrder,
        vnpayData: payment,
      });
    } catch (error) {
      if (isCurrentSession()) reportCheckoutError(error);
    } finally {
      submitLockRef.current = false;
      if (isCurrentSession()) setIsSubmitting(false);
    }
  };

  const refreshPendingPayment = async () => {
    if (!draft.pendingVnpayOrderId) return;
    setIsResumingPayment(true);
    setPaymentRecoveryError('');
    try {
      const currentOrder = await getOrderById(draft.pendingVnpayOrderId);
      setPaymentRecoveryOrder(currentOrder);
    } catch (error) {
      setPaymentRecoveryError(getErrorMessage(error));
    } finally {
      setIsResumingPayment(false);
    }
  };

  const clearPendingPayment = () => {
    const nextDraft = {
      ...draft,
      pendingVnpayOrderId: '',
      pendingVnpayAttemptStarted: false,
      idempotency: null,
    };
    persistDraft(nextDraft);
    setDraft(nextDraft);
    setPaymentRecoveryOrder(null);
    setPaymentRecoveryError('');
    setCheckoutError('');
    setCheckoutErrorFromRequest(false);
  };

  const updateDraft = (updates) => {
    setDraft((current) => {
      const next = { ...current, ...updates };
      persistDraft(next);
      return next;
    });
    setCheckoutError('');
    setCheckoutErrorFromRequest(false);
  };

  const updateAddress = (event) => {
    const { name, value } = event.target;
    updateDraft({ address: { ...draft.address, [name]: value }, idempotency: null });
  };

  const applyCouponCode = async (event) => {
    event.preventDefault();
    setCouponError('');
    setCouponPreview(null);
    if (!draft.couponCode.trim()) {
      setCouponError('Vui lòng nhập mã giảm giá.');
      return;
    }
    if (subtotal <= 0) {
      setCouponError('Giỏ hàng chưa có giá trị để áp dụng mã giảm giá.');
      return;
    }
    const requestId = ++couponRequestRef.current;
    const requestedCode = draft.couponCode.trim();
    const requestedSubtotal = subtotal;
    setIsApplyingCoupon(true);
    try {
      const preview = await applyCoupon(requestedCode, requestedSubtotal);
      if (!isCurrentSession() || requestId !== couponRequestRef.current || draftRef.current.couponCode.trim() !== requestedCode || subtotalRef.current !== requestedSubtotal) return;
      setCouponPreview(preview);
      updateDraft({ couponCode: preview.code || requestedCode.toUpperCase() });
      toast.success(`Đã áp dụng ${preview.code || requestedCode.toUpperCase()}: giảm ${formatCurrency(preview.discountAmount)}.`, { dedupeKey: `coupon:${requestedCode}:${requestedSubtotal}` });
    } catch (error) {
      if (isCurrentSession() && requestId === couponRequestRef.current) setCouponError(getErrorMessage(error));
    } finally {
      if (isCurrentSession() && requestId === couponRequestRef.current) setIsApplyingCoupon(false);
    }
  };

  const handleVNPaySuccess = (confirmedOrder) => {
    setVnpayModalData(null);
    clearCartAfterOrder();
    sessionStorage.removeItem(draftKeyRef.current);
    setDraft({ address: EMPTY_ADDRESS, couponCode: '', paymentMethod: 'COD', idempotency: null, pendingVnpayOrderId: '' });
    toast.success(`Thanh toán thành công đơn hàng #${confirmedOrder.orderCode}!`, { dedupeKey: `vnpay-success:${confirmedOrder._id}` });
    window.location.assign(`/checkout/payment-result?vnp_TxnRef=${confirmedOrder.orderCode}&vnp_ResponseCode=00&vnp_TransactionStatus=00`);
  };

  const handleVNPayCancel = () => {
    setVnpayModalData(null);
  };

  const submitCheckout = async (event) => {
    event.preventDefault();
    setCheckoutError('');
    setCheckoutErrorFromRequest(false);
    if (submitLockRef.current || !isCurrentSession()) return;
    if (!cartReady) {
      setCheckoutError('Thanh toán cần kết nối máy chủ. Giỏ hàng của bạn vẫn được giữ trên thiết bị.');
      return;
    }
    if (items.length === 0) {
      setCheckoutError('Giỏ hàng của bạn đang trống.');
      return;
    }
    if (itemsWithoutSku.length > 0) {
      setCheckoutError('Một hoặc nhiều sản phẩm chưa có SKU hợp lệ. Vui lòng xóa các sản phẩm đó khỏi giỏ hàng hoặc liên hệ hỗ trợ; không thể gửi đơn hàng thiếu SKU.');
      return;
    }
    if (draft.couponCode.trim() && !couponPreview) {
      setCouponError('Hãy xác thực mã giảm giá trước khi đặt hàng.');
      return;
    }

    const shippingAddress = Object.fromEntries(
      Object.entries(draft.address).map(([key, value]) => [key, value.trim()]),
    );
    const paymentMethod = draft.paymentMethod || 'COD';
    const payload = {
      items: items.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        variantId: item.variantId || null,
        quantity: item.quantity,
      })),
      shippingAddress,
      paymentMethod,
      shippingFee: SHIPPING_FEE,
      ...(couponPreview?.code && { couponCode: couponPreview.code }),
    };
    const fingerprint = JSON.stringify({ payload, itemSignature });
    const idempotencyKey = draftRef.current.idempotency?.fingerprint === fingerprint
      ? draftRef.current.idempotency.key
      : createIdempotencyKey();
    const pendingDraft = {
      ...draft,
      idempotency: { fingerprint, key: idempotencyKey },
    };
    try {
      persistDraft(pendingDraft);
      setDraft(pendingDraft);
    } catch (error) {
      reportCheckoutError(error);
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      const createdOrder = await createOrder(payload, idempotencyKey);
      if (!isCurrentSession()) return;
      if (paymentMethod === 'VNPAY') {
        const paymentDraft = { ...pendingDraft, pendingVnpayOrderId: createdOrder._id };
        persistDraft(paymentDraft);
        setDraft(paymentDraft);
        setPaymentRecoveryOrder(createdOrder);
        clearCartAfterOrder();
        const payment = await createVNPayPaymentUrl(createdOrder._id, { bankCode: 'VNPAYQR' });
        if (!isCurrentSession()) return;
        const paymentAttemptDraft = { ...paymentDraft, pendingVnpayAttemptStarted: true };
        persistDraft(paymentAttemptDraft);
        setDraft(paymentAttemptDraft);

        // Hiển thị giao diện Modal VNPay QR thay vì điều hướng ngay lập tức
        setVnpayModalData({
          order: createdOrder,
          vnpayData: payment,
        });
      } else {
        setOrder(createdOrder);
        toast.success(`Đặt hàng thành công. Mã đơn hàng: ${createdOrder.orderCode}.`, { dedupeKey: `order:${createdOrder._id}` });
        clearCartAfterOrder();
        sessionStorage.removeItem(draftKeyRef.current);
        setDraft({ address: EMPTY_ADDRESS, couponCode: '', paymentMethod: 'COD', idempotency: null, pendingVnpayOrderId: '' });
      }
    } catch (error) {
      if (isCurrentSession()) reportCheckoutError(error);
    } finally {
      submitLockRef.current = false;
      if (isCurrentSession()) setIsSubmitting(false);
    }
  };

  return (
    <div className="storefront-page">
      <Header />
      <main className="checkout-page">
        <div className="checkout-heading">
          <p className="section-kicker">Nova Fashion</p>
          <h1>Thanh toán đơn hàng</h1>
        </div>
        {order ? (
          <section className="checkout-confirmation" aria-label="Xác nhận đơn hàng">
            <p className="section-kicker">Đặt hàng thành công</p>
            <h2>Cảm ơn bạn đã mua sắm tại Nova Fashion.</h2>
            <p>Mã đơn hàng: <strong>{order.orderCode}</strong></p>
            <p>Phương thức: <strong>Thanh toán khi nhận hàng (COD)</strong></p>
            <p>Tổng thanh toán: <strong>{formatCurrency(order.finalAmount)}</strong></p>
            <Link className="checkout-primary-link" to={`/orders/${order._id}`}>Xem chi tiết đơn hàng</Link>
            <Link to={`/track-order?code=${encodeURIComponent(order.orderCode)}${order.qrTrackingToken ? `&token=${encodeURIComponent(order.qrTrackingToken)}` : ''}`}>Theo dõi tiến trình giao hàng</Link>
            <Link to="/products">Tiếp tục mua sắm</Link>
          </section>
        ) : draft.pendingVnpayOrderId ? (
          <section className="checkout-state checkout-payment-recovery" role={paymentRecoveryOrder ? 'status' : 'alert'}>
            {isResumingPayment ? (
              <><h2>Đang kiểm tra trạng thái thanh toán...</h2><p>Đơn hàng đã được tạo. Vui lòng chờ xác nhận trước khi thanh toán lại.</p></>
            ) : paymentRecoveryOrder?.status === 'cancelled' ? (
              <>
                <p className="section-kicker">Đơn hàng đã hủy</p>
                <h2>Không thể tiếp tục thanh toán cho đơn hàng này.</h2>
                <p>Mã đơn hàng: <strong>{paymentRecoveryOrder.orderCode}</strong></p>
                <div className="checkout-payment-recovery-actions">
                  <button className="checkout-submit" type="button" onClick={clearPendingPayment}>Tạo đơn hàng mới</button>
                  <Link to={`/orders/${paymentRecoveryOrder._id}`}>Xem chi tiết đơn hàng</Link>
                </div>
              </>
            ) : paymentRecoveryOrder?.paymentStatus === 'paid' ? (
              <>
                <p className="section-kicker">Thanh toán thành công</p>
                <h2>Đơn hàng đã được thanh toán.</h2>
                <p>Mã đơn hàng: <strong>{paymentRecoveryOrder.orderCode}</strong></p>
                <p>Tổng thanh toán: <strong>{formatCurrency(paymentRecoveryOrder.finalAmount)}</strong></p>
                <div className="checkout-payment-recovery-actions">
                  <Link className="checkout-primary-link" to={`/orders/${paymentRecoveryOrder._id}`}>Xem chi tiết đơn hàng</Link>
                  <button className="checkout-secondary-button" type="button" onClick={clearPendingPayment}>Tiếp tục mua sắm / Tạo đơn mới</button>
                </div>
              </>
            ) : paymentRecoveryOrder?.paymentStatus === 'refunded' ? (
              <>
                <p className="section-kicker">Đã hoàn tiền</p>
                <h2>Khoản thanh toán cho đơn hàng đã được hoàn lại.</h2>
                <p>Mã đơn hàng: <strong>{paymentRecoveryOrder.orderCode}</strong></p>
                <div className="checkout-payment-recovery-actions">
                  <button className="checkout-submit" type="button" onClick={clearPendingPayment}>Tạo đơn hàng mới</button>
                  <Link to={`/orders/${paymentRecoveryOrder._id}`}>Xem chi tiết đơn hàng</Link>
                </div>
              </>
            ) : paymentRecoveryOrder ? (
              <>
                <p className="section-kicker">{paymentRecoveryOrder.paymentStatus === 'failed' ? 'Thanh toán thất bại' : 'Chờ xác nhận thanh toán'}</p>
                <h2>{paymentRecoveryOrder.paymentStatus === 'failed' ? 'Giao dịch chưa thành công.' : 'Đơn hàng đang chờ thanh toán hoặc xác nhận từ VNPay.'}</h2>
                <p>Mã đơn hàng: <strong>{paymentRecoveryOrder.orderCode}</strong></p>
                <p>Trạng thái thanh toán: <strong>{paymentRecoveryOrder.paymentStatus}</strong></p>
                {paymentRecoveryError && <p className="checkout-error" role="alert">{paymentRecoveryError}</p>}
                {checkoutError && <p className="checkout-error" role={checkoutErrorFromRequest ? undefined : 'alert'}>{checkoutError}</p>}
                <div className="checkout-payment-recovery-actions">
                  {paymentRecoveryOrder.status !== 'cancelled' && paymentRecoveryOrder.paymentStatus === 'failed' && (
                    <button className="checkout-submit" type="button" onClick={() => redirectToVNPay(paymentRecoveryOrder._id)} disabled={isSubmitting}>
                      {isSubmitting ? 'Đang kết nối VNPay...' : 'Thử thanh toán lại'}
                    </button>
                  )}
                  {paymentRecoveryOrder.status !== 'cancelled' && paymentRecoveryOrder.paymentStatus === 'unpaid' && !draft.pendingVnpayAttemptStarted && (
                    <button className="checkout-submit" type="button" onClick={() => redirectToVNPay(paymentRecoveryOrder._id)} disabled={isSubmitting}>
                      {isSubmitting ? 'Đang kết nối VNPay...' : 'Tiếp tục thanh toán VNPay'}
                    </button>
                  )}
                  <button className="checkout-secondary-button" type="button" onClick={clearPendingPayment}>
                    Bỏ qua & Đặt đơn hàng mới
                  </button>
                  <button className="checkout-secondary-button" type="button" onClick={refreshPendingPayment} disabled={isResumingPayment}>
                    {isResumingPayment ? 'Đang kiểm tra...' : 'Kiểm tra lại trạng thái'}
                  </button>
                  <Link to={`/orders/${paymentRecoveryOrder._id}`}>Xem chi tiết đơn hàng</Link>
                </div>
              </>
            ) : (
              <>
                <h2>Đang khôi phục đơn hàng VNPay trước đó...</h2>
                <p>Đơn hàng đã được ghi nhận. Vui lòng chờ kiểm tra trạng thái trước khi thanh toán lại.</p>
                {paymentRecoveryError && <p className="checkout-error" role="alert">{paymentRecoveryError}</p>}
                {checkoutError && <p className="checkout-error" role={checkoutErrorFromRequest ? undefined : 'alert'}>{checkoutError}</p>}
                <div className="checkout-payment-recovery-actions">
                  <button className="checkout-secondary-button" type="button" onClick={refreshPendingPayment} disabled={isResumingPayment}>
                    {isResumingPayment ? 'Đang thử lại...' : 'Thử kiểm tra lại'}
                  </button>
                  <button className="checkout-secondary-button" type="button" onClick={clearPendingPayment}>
                    Bỏ qua & Đặt đơn hàng mới
                  </button>
                </div>
              </>
            )}
          </section>
        ) : (
          <form className="checkout-layout" onSubmit={submitCheckout}>
            <div className="checkout-main-content">
              {/* 1. THÔNG TIN NHẬN HÀNG */}
              <section className="checkout-card">
                <div className="checkout-card-header">
                  <div className="checkout-card-header-icon">📍</div>
                  <div>
                    <h2>Thông tin nhận hàng</h2>
                  </div>
                </div>
                <div className="checkout-form-grid">
                  <label className="checkout-field-col-3">
                    <span>Họ và tên <strong className="checkout-required-star">*</strong></span>
                    <input
                      required
                      name="fullName"
                      placeholder="Ví dụ: Nguyễn Văn A"
                      value={draft.address.fullName}
                      onChange={updateAddress}
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="checkout-field-col-3">
                    <span>Số điện thoại <strong className="checkout-required-star">*</strong></span>
                    <input
                      required
                      name="phone"
                      placeholder="Ví dụ: 0912 345 678"
                      value={draft.address.phone}
                      onChange={updateAddress}
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="checkout-full-width">
                    <span>Địa chỉ chi tiết <strong className="checkout-required-star">*</strong></span>
                    <input
                      required
                      name="address"
                      placeholder="Số nhà, tên đường, tòa nhà/căn hộ..."
                      value={draft.address.address}
                      onChange={updateAddress}
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="checkout-field-col-2">
                    <span>Tỉnh / Thành phố</span>
                    <input
                      name="city"
                      placeholder="Hà Nội, TP.HCM..."
                      value={draft.address.city}
                      onChange={updateAddress}
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="checkout-field-col-2">
                    <span>Quận / Huyện</span>
                    <input
                      name="district"
                      placeholder="Quận 1, Hoàn Kiếm..."
                      value={draft.address.district}
                      onChange={updateAddress}
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="checkout-field-col-2">
                    <span>Phường / Xã</span>
                    <input
                      name="ward"
                      placeholder="Phường Bến Nghé..."
                      value={draft.address.ward}
                      onChange={updateAddress}
                      disabled={isSubmitting}
                    />
                  </label>
                  <label className="checkout-full-width">
                    <span>Ghi chú giao hàng</span>
                    <textarea
                      name="notes"
                      rows={2}
                      placeholder="Ghi chú thêm cho shipper (Ví dụ: Giao giờ hành chính, gọi trước khi đến...)"
                      value={draft.address.notes}
                      onChange={updateAddress}
                      disabled={isSubmitting}
                    />
                  </label>
                </div>
              </section>

              {/* 2. MÃ GIẢM GIÁ */}
              <section className="checkout-card">
                <div className="checkout-card-header">
                  <div className="checkout-card-header-icon">🏷️</div>
                  <div>
                    <h2>Mã giảm giá & Khuyến mãi</h2>
                  </div>
                </div>
                <div className="checkout-coupon-input-group">
                  <input
                    placeholder="NHẬP MÃ ƯU ĐÃI (FASHION50, OUTFIT10...)"
                    value={draft.couponCode}
                    onChange={(e) => updateDraft({ couponCode: e.target.value.toUpperCase() })}
                    disabled={isSubmitting || isApplyingCoupon}
                  />
                  <button type="button" onClick={applyCouponCode} disabled={isSubmitting || isApplyingCoupon}>
                    {isApplyingCoupon ? 'Đang kiểm tra...' : 'Áp dụng'}
                  </button>
                </div>
                <div className="checkout-coupon-hints">
                  <span>Mã gợi ý cho bạn:</span>
                  <span className="checkout-coupon-tag" onClick={() => updateDraft({ couponCode: 'FASHION50' })}>FASHION50</span>
                  <span className="checkout-coupon-tag" onClick={() => updateDraft({ couponCode: 'OUTFIT10' })}>OUTFIT10</span>
                  <span className="checkout-coupon-tag" onClick={() => updateDraft({ couponCode: 'VIPSTYLE20' })}>VIPSTYLE20</span>
                </div>
                {couponError && <p className="checkout-error" role="alert">{couponError}</p>}
                {couponPreview && (
                  <p className="checkout-coupon-success">
                    ✓ Mã <strong>{couponPreview.code}</strong> hợp lệ! Giảm ngay <strong>{formatCurrency(couponPreview.discountAmount)}</strong>
                  </p>
                )}
              </section>

              {/* 3. PHƯƠNG THỨC THANH TOÁN */}
              <section className="checkout-card">
                <div className="checkout-card-header">
                  <div className="checkout-card-header-icon">💳</div>
                  <div>
                    <h2>Phương thức thanh toán</h2>
                  </div>
                </div>
                <fieldset className="checkout-payment-options">
                  <legend className="visually-hidden">Chọn phương thức thanh toán</legend>
                  
                  <label className={`checkout-payment-card ${draft.paymentMethod === 'COD' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COD"
                      checked={draft.paymentMethod === 'COD'}
                      onChange={() => updateDraft({ paymentMethod: 'COD', idempotency: null })}
                    />
                    <div className="checkout-payment-card-body">
                      <div className="checkout-payment-card-title">
                        <span>📦</span> Thanh toán khi nhận hàng (COD)
                      </div>
                      <div className="checkout-payment-card-desc">
                        Nhận hàng, kiểm tra sản phẩm trước khi thanh toán tiền mặt cho nhân viên giao hàng.
                      </div>
                    </div>
                  </label>

                  <label className={`checkout-payment-card ${draft.paymentMethod === 'VNPAY' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="VNPAY"
                      checked={draft.paymentMethod === 'VNPAY'}
                      onChange={() => updateDraft({ paymentMethod: 'VNPAY', idempotency: null })}
                    />
                    <div className="checkout-payment-card-body">
                      <div className="checkout-payment-card-title">
                        <span>⚡</span> Thanh toán trực tuyến qua VNPAY-QR
                      </div>
                      <div className="checkout-payment-card-desc">
                        Quét mã VNPAY-QR qua ứng dụng Ngân hàng / Ví VNPAY hoặc thanh toán bằng Thẻ ATM nội địa.
                      </div>
                    </div>
                  </label>
                </fieldset>

                {itemsWithoutSku.length > 0 && <p className="checkout-error" role="alert">Có {itemsWithoutSku.length} sản phẩm thiếu SKU; backend yêu cầu SKU khi tạo đơn hàng.</p>}
                {!cartReady && <p className="checkout-error" role="status">Thanh toán cần kết nối máy chủ. Giỏ hàng ngoại tuyến chưa được gửi.</p>}
                {checkoutError && <p className="checkout-error" role={checkoutErrorFromRequest ? undefined : 'alert'}>{checkoutError}</p>}
                
                <button
                  className="checkout-submit"
                  type="submit"
                  disabled={isSubmitting || !cartReady || itemsWithoutSku.length > 0}
                >
                  {isSubmitting ? (
                    draft.paymentMethod === 'VNPAY' ? 'Đang tạo đơn và kết nối VNPay...' : 'Đang tạo đơn hàng...'
                  ) : (
                    draft.paymentMethod === 'VNPAY'
                      ? `Tiếp tục thanh toán VNPAY · ${formatCurrency(confirmedTotal)}`
                      : `Đặt hàng ngay · ${formatCurrency(confirmedTotal)}`
                  )}
                </button>
              </section>
            </div>

            <aside className="checkout-order-summary">
              <h2>Đơn hàng của bạn</h2>
              <div className="checkout-items">{items.map((item) => <CartItem item={item} key={item.id} disabled={isSubmitting} />)}</div>
              <div className="checkout-totals">
                <div><span>Sản phẩm</span><strong>{totalQuantity}</strong></div>
                <div><span>Tạm tính</span><strong>{formatCurrency(confirmedSubtotal)}</strong></div>
                <div><span>Giảm giá</span><strong>-{formatCurrency(confirmedDiscount)}</strong></div>
                <div><span>Phí giao hàng</span><strong>{SHIPPING_FEE === 0 ? 'Miễn phí' : formatCurrency(SHIPPING_FEE)}</strong></div>
                <div className="checkout-grand-total"><span>Tổng cộng</span><strong>{formatCurrency(confirmedTotal)}</strong></div>
              </div>
              <Link to="/cart">Chỉnh sửa giỏ hàng</Link>
            </aside>
          </form>
        )}

        <VNPayQrModal
          isOpen={Boolean(vnpayModalData)}
          order={vnpayModalData?.order}
          vnpayData={vnpayModalData?.vnpayData}
          onSuccess={handleVNPaySuccess}
          onCancel={handleVNPayCancel}
        />
      </main>
      <Footer />
    </div>
  );
}

export default Checkout;
