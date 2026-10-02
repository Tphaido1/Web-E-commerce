const crypto = require('crypto');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const env = require('../config/env');

class EmailService {
  /**
   * Khởi tạo Transporter cho Nodemailer với cơ chế Fallback an toàn (Safe Fallback / Testing Mode)
   * @returns {import('nodemailer').Transporter}
   */
  static getTransporter() {
    // Nếu có thông số SMTP trong môi trường thật
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }

    // Nếu môi trường test hoặc local dev chưa có tài khoản SMTP thật
    // Dùng JSONTransport / Mock Transport để không chặn luồng chạy và không crash app
    return nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  /**
   * Sinh mã bí mật HMAC SHA-256 chống giả mạo cho tra cứu đơn hàng
   * Token = HMAC_SHA256(orderId + ':' + createdAt, SECRET_KEY)
   * @param {string} orderId
   * @param {Date|string} createdAt
   * @returns {string}
   */
  static generateTrackingToken(orderId, createdAt) {
    const timestamp = new Date(createdAt).getTime();
    const data = `${orderId}:${timestamp}`;
    const secret = env.HMAC_SECRET || 'order_hmac_secret_key_default';
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Xác thực mã HMAC token của đơn hàng
   * @param {string} orderId
   * @param {Date|string} createdAt
   * @param {string} token
   * @returns {boolean}
   */
  static verifyTrackingToken(orderId, createdAt, token) {
    if (!token) return false;
    const expected = this.generateTrackingToken(orderId, createdAt);
    try {
      return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Sinh hình ảnh QR Code (Data URL Base64) chứa link tra cứu đơn hàng
   * @param {string} orderCode
   * @param {string} trackingToken
   * @returns {Promise<string>} Data URL base64 của QR
   */
  static async generateQRCodeDataUrl(orderCode, trackingToken) {
    const trackingUrl = `${env.CLIENT_URL}/track-order?code=${encodeURIComponent(orderCode)}&token=${encodeURIComponent(trackingToken)}`;
    return QRCode.toDataURL(trackingUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 1,
      width: 250,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
    });
  }

  /**
   * Sinh template hóa đơn HTML đẹp chuẩn e-commerce
   * @param {object} order
   * @param {string} qrCodeDataUrl
   * @returns {string} HTML string
   */
  static generateInvoiceHtml(order, qrCodeDataUrl) {
    const items = order.items || [];
    const itemsRows = items
      .map(
        (item) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 8px; font-size: 14px; color: #334155;">
            <strong>${item.name}</strong><br>
            <span style="font-size: 12px; color: #64748b;">SKU: ${item.sku}</span>
          </td>
          <td style="padding: 10px 8px; font-size: 14px; text-align: center; color: #334155;">${item.quantity}</td>
          <td style="padding: 10px 8px; font-size: 14px; text-align: right; color: #334155;">${(item.price || 0).toLocaleString('vi-VN')}₫</td>
          <td style="padding: 10px 8px; font-size: 14px; text-align: right; font-weight: 600; color: #0f172a;">${((item.subtotal || item.price * item.quantity) || 0).toLocaleString('vi-VN')}₫</td>
        </tr>
      `
      )
      .join('');

    const shipping = order.shippingAddress || {};

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8fafc; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 28px; text-align: center; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
          .content { padding: 24px; }
          .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 9999px; font-weight: 600; font-size: 12px; }
          .summary-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          .qr-section { text-align: center; margin-top: 24px; padding: 20px; background: #f1f5f9; border-radius: 8px; }
          .footer { text-align: center; padding: 16px; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>HÓA ĐƠN XÁC NHẬN ĐƠN HÀNG</h1>
            <p style="margin: 8px 0 0; opacity: 0.9;">Cảm ơn quý khách đã mua sắm tại cửa hàng chúng tôi!</p>
          </div>
          <div class="content">
            <p>Xin chào <strong>${shipping.fullName || 'Quý khách'}</strong>,</p>
            <p>Đơn hàng <strong>#${order.orderCode}</strong> của bạn đã được ghi nhận vào hệ thống.</p>
            
            <table class="summary-table">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1; text-align: left;">
                  <th style="padding: 8px;">Sản phẩm</th>
                  <th style="padding: 8px; text-align: center;">SL</th>
                  <th style="padding: 8px; text-align: right;">Đơn giá</th>
                  <th style="padding: 8px; text-align: right;">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows}
              </tbody>
            </table>

            <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span>Tạm tính:</span>
                <strong>${(order.totalAmount || 0).toLocaleString('vi-VN')}₫</strong>
              </div>
              ${
                order.discountAmount > 0
                  ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; color: #16a34a;">
                  <span>Giảm giá (Mã ${order.coupon?.code || ''}):</span>
                  <strong>-${(order.discountAmount || 0).toLocaleString('vi-VN')}₫</strong>
                </div>
              `
                  : ''
              }
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span>Phí vận chuyển:</span>
                <strong>${(order.shippingFee || 0).toLocaleString('vi-VN')}₫</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 18px; font-weight: 700; color: #2563eb;">
                <span>Tổng thanh toán:</span>
                <span>${(order.finalAmount || 0).toLocaleString('vi-VN')}₫</span>
              </div>
            </div>

            <div style="margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 8px;">
              <h4 style="margin: 0 0 8px; color: #1e293b;">Thông tin nhận hàng:</h4>
              <p style="margin: 4px 0; color: #475569;"><strong>Người nhận:</strong> ${shipping.fullName || 'N/A'} (${shipping.phone || 'N/A'})</p>
              <p style="margin: 4px 0; color: #475569;"><strong>Địa chỉ:</strong> ${shipping.address || ''}, ${shipping.ward || ''}, ${shipping.district || ''}, ${shipping.city || ''}</p>
              <p style="margin: 4px 0; color: #475569;"><strong>Phương thức:</strong> ${order.paymentMethod || 'COD'} (Thanh toán khi nhận hàng)</p>
            </div>

            <div class="qr-section">
              <h4 style="margin: 0 0 10px; color: #0f172a;">MÃ QR TRA CỨU ĐƠN HÀNG BẢO MẬT</h4>
              <p style="font-size: 13px; color: #64748b; margin: 0 0 12px;">Quét mã QR bằng điện thoại để xem trực tiếp tiến độ giao hàng mà không cần đăng nhập</p>
              <img src="${qrCodeDataUrl}" alt="Mã QR tra cứu đơn hàng #${order.orderCode}" style="border-radius: 8px; border: 1px solid #e2e8f0; width: 160px; height: 160px;" />
              <p style="font-size: 11px; color: #94a3b8; margin: 8px 0 0;">Mã định danh bảo mật bằng chữ ký số HMAC-SHA256</p>
            </div>
          </div>
          <div class="footer">
            <p>Hệ thống E-Commerce MVC. Email này được tạo tự động, vui lòng không phản hồi trực tiếp.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Gửi email xác nhận đơn hàng kèm QR code hóa đơn thông qua Nodemailer
   * @param {object} order - Mongoose Order document
   * @param {string} recipientEmail - Email người nhận
   * @returns {Promise<{ success: boolean, qrCodeDataUrl: string, trackingToken: string, messageId?: string, htmlContent: string }>}
   */
  static async sendOrderConfirmationEmail(order, recipientEmail) {
    try {
      const trackingToken = this.generateTrackingToken(order._id, order.createdAt);
      const qrCodeDataUrl = await this.generateQRCodeDataUrl(order.orderCode, trackingToken);
      const htmlContent = this.generateInvoiceHtml(order, qrCodeDataUrl);

      const transporter = this.getTransporter();

      const mailOptions = {
        from: process.env.EMAIL_FROM || '"E-Commerce Store" <no-reply@ecommerce.com>',
        to: recipientEmail,
        subject: `[Xác nhận đơn hàng #${order.orderCode}] Hóa đơn điện tử kèm mã QR tra cứu`,
        html: htmlContent,
      };

      const mailResult = await transporter.sendMail(mailOptions);

      // eslint-disable-next-line no-console
      console.log(
        `✉️ [EmailService] Đã gửi email hóa đơn kèm mã QR cho đơn hàng #${order.orderCode} -> gửi tới: ${recipientEmail}`
      );

      return {
        success: true,
        recipientEmail,
        trackingToken,
        qrCodeDataUrl,
        htmlContent,
        messageId: mailResult?.messageId || 'mock-message-id',
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`⚠️ [EmailService] Lỗi khi tạo email/QR cho đơn hàng #${order.orderCode}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = EmailService;
