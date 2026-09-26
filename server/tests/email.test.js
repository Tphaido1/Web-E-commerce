const EmailService = require('../src/services/email.service');
const mongoose = require('mongoose');

describe('Email & QR Service Unit Tests (Level 4 Verification Ladder)', () => {
  const orderId = new mongoose.Types.ObjectId().toString();
  const createdAt = new Date('2026-09-26T12:00:00.000Z');

  test('HMAC-SHA256: Sinh mã xác thực nhất quán và chống giả mạo', () => {
    const token1 = EmailService.generateTrackingToken(orderId, createdAt);
    const token2 = EmailService.generateTrackingToken(orderId, createdAt);

    expect(token1).toBeDefined();
    expect(typeof token1).toBe('string');
    expect(token1.length).toBe(64); // SHA-256 hex length
    expect(token1).toBe(token2); // Deterministic
  });

  test('HMAC-SHA256: Xác thực token hợp lệ và từ chối token giả mạo', () => {
    const validToken = EmailService.generateTrackingToken(orderId, createdAt);
    expect(EmailService.verifyTrackingToken(orderId, createdAt, validToken)).toBe(true);

    // Giả mạo token
    const forgedToken = validToken.substring(0, 60) + 'abcd';
    expect(EmailService.verifyTrackingToken(orderId, createdAt, forgedToken)).toBe(false);

    // Sai orderId hoặc createdAt
    const differentOrderId = new mongoose.Types.ObjectId().toString();
    expect(EmailService.verifyTrackingToken(differentOrderId, createdAt, validToken)).toBe(false);

    const differentDate = new Date('2026-09-27T12:00:00.000Z');
    expect(EmailService.verifyTrackingToken(orderId, differentDate, validToken)).toBe(false);
  });

  test('QR Code Generator: Sinh Data URL PNG Base64 hợp lệ', async () => {
    const token = EmailService.generateTrackingToken(orderId, createdAt);
    const qrDataUrl = await EmailService.generateQRCodeDataUrl('ORD-20260926-TEST1', token);

    expect(qrDataUrl).toBeDefined();
    expect(qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('Invoice HTML: Chứa đầy đủ thông tin đơn hàng và mã QR', async () => {
    const mockOrder = {
      _id: orderId,
      orderCode: 'ORD-20260926-XYZ12',
      createdAt,
      totalAmount: 500000,
      discountAmount: 50000,
      shippingFee: 20000,
      finalAmount: 470000,
      paymentMethod: 'COD',
      coupon: { code: 'SALE10' },
      shippingAddress: {
        fullName: 'Nguyễn Văn A',
        phone: '0901234567',
        address: '123 Đường Lê Lợi',
        district: 'Quận 1',
        city: 'TP.HCM',
      },
      items: [
        {
          name: 'Áo Thun Cao Cấp',
          sku: 'AT-BLACK-L',
          quantity: 2,
          price: 250000,
          subtotal: 500000,
        },
      ],
    };

    const token = EmailService.generateTrackingToken(orderId, createdAt);
    const qrDataUrl = await EmailService.generateQRCodeDataUrl(mockOrder.orderCode, token);
    const html = EmailService.generateInvoiceHtml(mockOrder, qrDataUrl);

    expect(html).toContain('ORD-20260926-XYZ12');
    expect(html).toContain('Nguyễn Văn A');
    expect(html).toContain('Áo Thun Cao Cấp');
    expect(html).toContain('AT-BLACK-L');
    expect(html).toContain('470.000');
    expect(html).toContain(qrDataUrl);
  });

  test('sendOrderConfirmationEmail: Thực thi an toàn, không làm crash luồng chính', async () => {
    const mockOrder = {
      _id: orderId,
      orderCode: 'ORD-20260926-XYZ12',
      createdAt,
      totalAmount: 100000,
      discountAmount: 0,
      shippingFee: 0,
      finalAmount: 100000,
      paymentMethod: 'COD',
      shippingAddress: {
        fullName: 'Trần Thị B',
        phone: '0912345678',
        address: '456 Nguyễn Huệ',
      },
      items: [
        {
          name: 'Mũ Lưỡi Trai',
          sku: 'HAT-BLUE',
          quantity: 1,
          price: 100000,
          subtotal: 100000,
        },
      ],
    };

    const result = await EmailService.sendOrderConfirmationEmail(mockOrder, 'customer@example.com');
    expect(result.success).toBe(true);
    expect(result.trackingToken).toBeDefined();
    expect(result.qrCodeDataUrl).toBeDefined();
  });
});
