const AuditLog = require('../models/AuditLog.model');

class AuditLogService {
  /**
   * Ghi log khi trạng thái đơn hàng thay đổi
   * @param {object} params
   */
  static async logOrderChange({
    orderId,
    action,
    performedBy = null,
    actorRole = 'system',
    oldValue = null,
    newValue = null,
    details = {},
    req = null,
  }) {
    try {
      const ipAddress = req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || null;
      const userAgent = req?.headers['user-agent'] || null;

      return await AuditLog.create({
        entityType: 'Order',
        entityId: orderId.toString(),
        action,
        performedBy,
        actorRole,
        oldValue,
        newValue,
        ipAddress,
        userAgent,
        details,
      });
    } catch (error) {
      // Log lỗi nhưng không chặn luồng chính
      // eslint-disable-next-line no-console
      console.error('[AuditLogService] Ghi nhận log đơn hàng thất bại:', error.message);
      return null;
    }
  }

  /**
   * Ghi log kết quả giao dịch thanh toán trực tuyến
   * @param {object} params
   */
  static async logPaymentTransaction({
    orderId,
    transactionNo,
    amount,
    bankCode,
    status,
    responseCode,
    details = {},
    req = null,
  }) {
    try {
      const ipAddress = req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || null;

      return await AuditLog.create({
        entityType: 'Payment',
        entityId: orderId.toString(),
        action: status === 'success' ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
        actorRole: 'system',
        ipAddress,
        details: {
          transactionNo,
          amount,
          bankCode,
          responseCode,
          ...details,
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AuditLogService] Ghi nhận log thanh toán thất bại:', error.message);
      return null;
    }
  }

  /**
   * Lấy toàn bộ lịch sử Audit Log của một đơn hàng
   * @param {string} orderId
   */
  static async getOrderAuditLogs(orderId) {
    return AuditLog.find({
      $or: [
        { entityType: 'Order', entityId: orderId.toString() },
        { entityType: 'Payment', entityId: orderId.toString() },
      ],
    })
      .populate('performedBy', 'email role')
      .sort({ createdAt: -1 })
      .lean();
  }
}

module.exports = AuditLogService;
