import { useEffect, useRef, useState } from 'react';
import { getOrderById, simulateSandboxSuccess } from '../../services/orderService.js';
import { formatCurrency } from '../../utils/currency.js';
import './VNPayQrModal.css';

export default function VNPayQrModal({
  isOpen,
  order,
  vnpayData,
  onSuccess,
  onCancel,
}) {
  const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 phút
  const [isPaid, setIsPaid] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  // Khởi tạo đếm ngược
  useEffect(() => {
    isMountedRef.current = true;
    if (!isOpen) return undefined;

    setTimeLeft(15 * 60);
    setIsPaid(false);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, [isOpen]);

  // Polling kiểm tra trạng thái đơn hàng mỗi 2.5 giây
  useEffect(() => {
    if (!isOpen || !order?._id || isPaid) return undefined;

    const checkStatus = async () => {
      try {
        const latestOrder = await getOrderById(order._id);
        if (!isMountedRef.current) return;

        if (latestOrder?.paymentStatus === 'paid') {
          setIsPaid(true);
          clearInterval(pollTimerRef.current);
          setTimeout(() => {
            if (isMountedRef.current) onSuccess(latestOrder);
          }, 1500);
        }
      } catch {
        // Tự thử lại ở chu kỳ tiếp theo
      }
    };

    pollTimerRef.current = setInterval(checkStatus, 2500);
    // Kiểm tra ngay khi focus lại cửa sổ trình duyệt (khi khách thanh toán ở tab VNPay quay lại)
    const handleFocus = () => { checkStatus(); };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(pollTimerRef.current);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isOpen, order?._id, isPaid, onSuccess]);

  // Xử lý phím Escape để đóng modal
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isPaid) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPaid, onCancel]);

  if (!isOpen || !order) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const copyCardNumber = () => {
    navigator.clipboard?.writeText('9704198526191432198');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimulatePayment = async () => {
    setIsSimulating(true);
    try {
      const updated = await simulateSandboxSuccess(order._id);
      setIsPaid(true);
      setTimeout(() => {
        if (isMountedRef.current) onSuccess(updated);
      }, 1200);
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Không thể mô phỏng thanh toán.');
    } finally {
      if (isMountedRef.current) setIsSimulating(false);
    }
  };

  return (
    <div className="vnpay-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="vnpay-qr-title">
      <div className="vnpay-modal-container">
        {/* Header */}
        <div className="vnpay-modal-header">
          <div className="vnpay-logo-badge">
            <span className="vnpay-brand-text">VNPAY-QR</span>
            <span className="vnpay-sandbox-pill">Sandbox</span>
          </div>
          {!isPaid && (
            <button
              type="button"
              className="vnpay-close-btn"
              onClick={onCancel}
              aria-label="Đóng giao diện thanh toán"
            >
              &times;
            </button>
          )}
        </div>

        {/* Body */}
        {isPaid ? (
          <div className="vnpay-success-view">
            <div className="vnpay-success-icon">&#10004;</div>
            <h2 className="vnpay-success-title">Thanh toán thành công!</h2>
            <p style={{ color: '#475569', margin: 0 }}>
              Đơn hàng <strong>#{order.orderCode}</strong> đã được ghi nhận. Hệ thống đang chuyển hướng...
            </p>
          </div>
        ) : (
          <div className="vnpay-modal-body">
            {/* Tóm tắt đơn hàng */}
            <div className="vnpay-order-summary">
              <div className="vnpay-order-code">
                Mã đơn hàng:<br />
                <strong>#{order.orderCode}</strong>
              </div>
              <div className="vnpay-order-amount">
                {formatCurrency(order.finalAmount)}
              </div>
            </div>

            {/* Mã QR */}
            <div className="vnpay-qr-card">
              {vnpayData?.qrCodeDataUrl ? (
                <img
                  src={vnpayData.qrCodeDataUrl}
                  alt={`Mã QR thanh toán đơn hàng ${order.orderCode}`}
                  className="vnpay-qr-image"
                />
              ) : (
                <div className="vnpay-qr-loading">
                  <span>Đang khởi tạo mã QR...</span>
                </div>
              )}

              <div className="vnpay-timer-badge">
                Hết hạn sau: <strong>{formattedTime}</strong>
              </div>
            </div>

            {/* Trạng thái real-time */}
            <div className="vnpay-status-live">
              <span className="vnpay-pulse-dot" />
              <span>Đang chờ bạn quét mã thanh toán...</span>
            </div>

            {/* Hướng dẫn */}
            <div className="vnpay-guide-steps">
              <strong>Hướng dẫn quét mã:</strong>
              <ol style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
                <li>Mở app Mobile Banking (VCB, MB, Techcombank...) hoặc Ví VNPAY.</li>
                <li>Chọn biểu tượng <strong>Quét QR</strong> và hướng camera vào mã phía trên.</li>
              </ol>
            </div>

            {/* Hộp thông tin thẻ test Sandbox */}
            <div className="vnpay-sandbox-box">
              <div className="vnpay-sandbox-title">
                <span>💳 THẺ TEST VNPAY SANDBOX (NCB)</span>
                {copied && <span style={{ color: '#16a34a' }}>✓ Đã sao chép!</span>}
              </div>
              <div className="vnpay-sandbox-row">
                <span>Số thẻ:</span>
                <span
                  className="vnpay-copy-tag"
                  onClick={copyCardNumber}
                  title="Nhấn để sao chép số thẻ test"
                >
                  9704198526191432198 📋
                </span>
              </div>
              <div className="vnpay-sandbox-row">
                <span>Chủ thẻ / Ngày phát hành:</span>
                <strong>NGUYEN VAN A &bull; 07/15</strong>
              </div>
              <div className="vnpay-sandbox-row">
                <span>Mã OTP:</span>
                <strong>123456</strong>
              </div>
            </div>

            {/* Nút thao tác */}
            <div className="vnpay-modal-actions">
              {vnpayData?.paymentUrl && (
                <button
                  type="button"
                  className="vnpay-btn-primary"
                  onClick={() => window.open(vnpayData.paymentUrl, '_blank')}
                >
                  🌐 Mở Cổng VNPay Sandbox (Trang Thanh Toán Web)
                </button>
              )}

              <button
                type="button"
                className="vnpay-btn-simulate"
                onClick={handleSimulatePayment}
                disabled={isSimulating}
              >
                {isSimulating ? 'Đang xử lý...' : '⚡ Mô Phỏng Thanh Toán Thành Công (Test Nhanh)'}
              </button>

              <button
                type="button"
                className="vnpay-btn-cancel"
                onClick={onCancel}
              >
                Hủy / Đổi phương thức thanh toán
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
