const Coupon = require('../models/Coupon.model');

// Global and per-user limits must be checked in the same atomic write.
const claimCoupon = (coupon, userId, usageId, orderId) => Coupon.findOneAndUpdate(
  { _id: coupon._id, isActive: true,
    ...(coupon.usageLimit !== null && { usageCount: { $lt: coupon.usageLimit } }),
    $expr: { $lt: [
      { $size: { $filter: { input: '$usedBy', as: 'usage', cond: { $eq: ['$$usage.user', userId] } } } },
      coupon.userLimit,
    ] },
  },
  { $inc: { usageCount: 1 }, $push: { usedBy: { _id: usageId, user: userId, orderId, usedAt: new Date() } } },
  { new: true }
);
const rollbackCouponClaim = (couponId, usageId) => Coupon.updateOne(
  { _id: couponId, 'usedBy._id': usageId },
  { $inc: { usageCount: -1 }, $pull: { usedBy: { _id: usageId } } }
);

module.exports = { claimCoupon, rollbackCouponClaim };
