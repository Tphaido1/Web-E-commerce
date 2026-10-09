import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/Header/Header.jsx';
import Footer from '../../components/Footer/Footer.jsx';
import CartItem from '../../components/CartItem/CartItem.jsx';
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
    const draft = JSON.parse(sessionStorage.getItem(getDraftKey()) || 'null');
    return {
      address: { ...EMPTY_ADDRESS, ...draft?.address },
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
  const { items, subtotal, totalQuantity, status: cartStatus, error: cartError, errorAnnounced, isMutating, syncState, clearCartAfterOrder } = useCart();
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
      const payment = await createVNPayPaymentUrl(orderId);
      if (!isCurrentSession()) return;
      const paymentDraft = { ...draft, pendingVnpayAttemptStarted: true };
      persistDraft(paymentDraft);
      setDraft(paymentDraft);
      window.location.assign(payment.paymentUrl);
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
        const payment = await createVNPayPaymentUrl(createdOrder._id);
        if (!isCurrentSession()) return;
        const paymentAttemptDraft = { ...paymentDraft, pendingVnpayAttemptStarted: true };
        persistDraft(paymentAttemptDraft);
        setDraft(paymentAttemptDraft);
        window.location.assign(payment.paymentUrl);
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
        <div className="checkout-heading"><p className="section-kicker">NovaMart</p><h1>Thanh toán</h1></div>
        {order ? (
          <section className="checkout-confirmation" aria-label="Xác nhận đơn hàng">
            <p className="section-kicker">Đặt hàng thành công</p>
            <h2>Cảm ơn bạn đã mua sắm.</h2>
            <p>Mã đơn hàng: <strong>{order.orderCode}</strong></p>
            <p>Thanh toán khi nhận hàng (COD)</p>
            <p>Tổng thanh toán: <strong>{formatCurrency(order.finalAmount)}</strong></p>
            <Link className="checkout-primary-link" to={`/orders/${order._id}`}>Xem chi tiết đơn hàng</Link>
            <Link to={`/track-order?code=${encodeURIComponent(order.orderCode)}${order.qrTrackingToken ? `&token=${encodeURIComponent(order.qrTrackingToken)}` : ''}`}>Theo dõi đơn hàng</Link>
            <Link to="/products">Tiếp tục mua sắm</Link>
          </section>
        ) : draft.pendingVnpayOrderId ? (
          <section className="checkout-state checkout-payment-recovery" role={paymentRecoveryOrder ? 'status' : 'alert'}>
            {isResumingPayment ? (
              <><h2>Đang kiểm tra trạng thái thanh toán...</h2><p>Đơn hàng đã được tạo. Vui lòng chờ xác nhận trước khi thanh toán lại.</p></>
            ) : paymentRecoveryOrder?.status === 'cancelled' ? (
              <><p className="section-kicker">Đơn hàng đã hủy</p><h2>Không thể tiếp tục thanh toán cho đơn hàng này.</h2><p>Mã đơn hàng: <strong>{paymentRecoveryOrder.orderCode}</strong></p><Link to={`/orders/${paymentRecoveryOrder._id}`}>Xem chi tiết đơn hàng</Link></>
            ) : paymentRecoveryOrder?.paymentStatus === 'paid' ? (
              <>
                <p className="section-kicker">Thanh toán thành công</p><h2>Đơn hàng đã được thanh toán.</h2>
                <p>Mã đơn hàng: <strong>{paymentRecoveryOrder.orderCode}</strong></p>
                <p>Tổng thanh toán: <strong>{formatCurrency(paymentRecoveryOrder.finalAmount)}</strong></p>
                <Link className="checkout-primary-link" to={`/orders/${paymentRecoveryOrder._id}`}>Xem chi tiết đơn hàng</Link>
              </>
            ) : paymentRecoveryOrder?.paymentStatus === 'refunded' ? (
              <>
                <p className="section-kicker">Đã hoàn tiền</p><h2>Khoản thanh toán cho đơn hàng đã được hoàn lại.</h2>
                <p>Mã đơn hàng: <strong>{paymentRecoveryOrder.orderCode}</strong></p>
                <Link to={`/orders/${paymentRecoveryOrder._id}`}>Xem chi tiết đơn hàng</Link>
              </>
            ) : paymentRecoveryOrder ? (
              <>
                <p className="section-kicker">{paymentRecoveryOrder.paymentStatus === 'failed' ? 'Thanh toán thất bại' : 'Chờ xác nhận thanh toán'}</p>
                <h2>{paymentRecoveryOrder.paymentStatus === 'failed' ? 'Giao dịch chưa thành công.' : 'Đơn hàng đang chờ thanh toán hoặc xác nhận từ VNPay.'}</h2>
                <p>Mã đơn hàng: <strong>{paymentRecoveryOrder.orderCode}</strong></p>
                <p>Trạng thái thanh toán: <strong>{paymentRecoveryOrder.paymentStatus}</strong></p>
                {paymentRecoveryError && <p className="checkout-error" role="alert">{paymentRecoveryError}</p>}
                {checkoutError && <p className="checkout-error" role={checkoutErrorFromRequest ? undefined : 'alert'}>{checkoutError}</p>}
                {paymentRecoveryOrder.status !== 'cancelled' && paymentRecoveryOrder.paymentStatus === 'failed' && (
                  <button className="checkout-submit" type="button" onClick={() => redirectToVNPay(paymentRecoveryOrder._id)} disabled={isSubmitting}>
                    {isSubmitting ? 'Đang kết nối VNPay...' : 'Thử thanh toán lại'}
                  </button>
                )}
                {paymentRecoveryOrder.status !== 'cancelled' && paymentRecoveryOrder.paymentStatus === 'unpaid' && !draft.pendingVnpayAttemptStarted && (
                  <button className="checkout-submit" type="button" onClick={() => redirectToVNPay(paymentRecoveryOrder._id)} disabled={isSubmitting}>
                    {isSubmitting ? 'Đang kết nối VNPay...' : 'Tiếp tục đến VNPay'}
                  </button>
                )}
                {paymentRecoveryOrder.paymentStatus === 'unpaid' && draft.pendingVnpayAttemptStarted && <p>Giao dịch đã được chuyển đến VNPay; hãy đợi xác nhận hoặc kiểm tra lại trạng thái trước khi thử lại.</p>}
                <button className="checkout-secondary-button" type="button" onClick={refreshPendingPayment} disabled={isResumingPayment}>Kiểm tra lại trạng thái</button>
                <Link to={`/orders/${paymentRecoveryOrder._id}`}>Xem chi tiết đơn hàng</Link>
              </>
            ) : (
              <><h2>Không thể khôi phục đơn hàng.</h2><p>{paymentRecoveryError || 'Không tải được trạng thái đơn hàng đã tạo.'}</p><Link to="/my-orders">Mở đơn hàng của tôi</Link></>
            )}
          </section>
        ) : cartStatus === 'loading' ? (
          <section className="checkout-state" role="status"><h2>Đang tải giỏ hàng...</h2></section>
        ) : cartStatus === 'error' ? (
          <section className="checkout-state" role={errorAnnounced ? undefined : 'alert'}><h2>Không thể tải giỏ hàng.</h2><p>{cartError}</p><Link to="/cart">Quay lại giỏ hàng</Link></section>
        ) : items.length === 0 ? (
          <section className="checkout-state"><h2>Giỏ hàng của bạn đang trống.</h2><Link to="/products">Tiếp tục mua sắm</Link></section>
        ) : (
          <form className="checkout-layout" onSubmit={submitCheckout}>
            <div className="checkout-form-column">
              <section className="checkout-card">
                <h2>Thông tin giao hàng</h2>
                <div className="checkout-fields">
                  <label>Họ và tên người nhận<input name="fullName" autoComplete="name" value={draft.address.fullName} onChange={updateAddress} required /></label>
                  <label>Số điện thoại<input name="phone" type="tel" autoComplete="tel" value={draft.address.phone} onChange={updateAddress} required /></label>
                  <label className="checkout-field-wide">Địa chỉ<input name="address" autoComplete="street-address" value={draft.address.address} onChange={updateAddress} required /></label>
                  <label>Tỉnh/Thành phố<input name="city" autoComplete="address-level1" value={draft.address.city} onChange={updateAddress} /></label>
                  <label>Quận/Huyện<input name="district" autoComplete="address-level2" value={draft.address.district} onChange={updateAddress} /></label>
                  <label>Phường/Xã<input name="ward" value={draft.address.ward} onChange={updateAddress} /></label>
                  <label className="checkout-field-wide">Ghi chú<textarea name="notes" value={draft.address.notes} onChange={updateAddress} rows="3" /></label>
                </div>
              </section>

              <section className="checkout-card">
                <h2>Mã giảm giá</h2>
                <div className="checkout-coupon-row">
                  <label className="visually-hidden" htmlFor="checkout-coupon">Mã giảm giá</label>
                  <input id="checkout-coupon" value={draft.couponCode} onChange={(event) => { couponRequestRef.current += 1; setIsApplyingCoupon(false); updateDraft({ couponCode: event.target.value, idempotency: null }); setCouponPreview(null); setCouponError(''); }} placeholder="Nhập mã giảm giá" />
                  <button type="button" onClick={applyCouponCode} disabled={isApplyingCoupon}>{isApplyingCoupon ? 'Đang kiểm tra...' : 'Áp dụng'}</button>
                </div>
                {couponError && <p className="checkout-error" role="alert">{couponError}</p>}
                {couponPreview && <p className="checkout-coupon-success">Đã áp dụng {couponPreview.code}: giảm {formatCurrency(couponPreview.discountAmount)}.</p>}
              </section>

              <section className="checkout-card">
                <h2>Phương thức thanh toán</h2>
                <fieldset className="checkout-payment-options">
                  <legend className="visually-hidden">Chọn phương thức thanh toán</legend>
                  <label><input type="radio" name="paymentMethod" value="COD" checked={draft.paymentMethod === 'COD'} onChange={() => updateDraft({ paymentMethod: 'COD', idempotency: null })} /><span>Thanh toán khi nhận hàng (COD)</span></label>
                  <label><input type="radio" name="paymentMethod" value="VNPAY" checked={draft.paymentMethod === 'VNPAY'} onChange={() => updateDraft({ paymentMethod: 'VNPAY', idempotency: null })} /><span>Thanh toán trực tuyến qua VNPay</span></label>
                </fieldset>
                {itemsWithoutSku.length > 0 && <p className="checkout-error" role="alert">Có {itemsWithoutSku.length} sản phẩm thiếu SKU; backend yêu cầu SKU khi tạo đơn hàng.</p>}
                {!cartReady && <p className="checkout-error" role="status">Thanh toán cần kết nối máy chủ. Giỏ hàng ngoại tuyến chưa được gửi.</p>}
                {checkoutError && <p className="checkout-error" role={checkoutErrorFromRequest ? undefined : 'alert'}>{checkoutError}</p>}
                <button className="checkout-submit" type="submit" disabled={isSubmitting || !cartReady || itemsWithoutSku.length > 0}>{isSubmitting ? (draft.paymentMethod === 'VNPAY' ? 'Đang tạo đơn và kết nối VNPay...' : 'Đang tạo đơn hàng...') : (draft.paymentMethod === 'VNPAY' ? `Tiếp tục đến VNPay · ${formatCurrency(confirmedTotal)}` : `Đặt hàng · ${formatCurrency(confirmedTotal)}`)}</button>
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
      </main>
      <Footer />
    </div>
  );
}

export default Checkout;
