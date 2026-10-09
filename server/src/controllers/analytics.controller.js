const mongoose = require('mongoose');
const Order = require('../models/Order.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { httpError } = require('../utils/management.util');
const { isVendor } = require('../utils/vendorScope.util');
const DAY = 86400000;
const OFFSET = 7 * 3600000;
const statuses = ['pending', 'processing', 'shipping', 'delivered', 'cancelled'];
const dateKey = (time) => new Date(time + OFFSET).toISOString().slice(0, 10);
const parseDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError('Dates must use YYYY-MM-DD', 400);
  const time = Date.parse(value + 'T00:00:00+07:00');
  if (!Number.isFinite(time) || dateKey(time) !== value) throw httpError('Invalid calendar date', 400);
  return time;
};
const getAnalytics = catchAsync(async (req, res) => {
  const today = dateKey(Date.now());
  const to = req.query.to || today;
  const end = parseDate(to) + DAY;
  const from = req.query.from || dateKey(end - 30 * DAY);
  const start = parseDate(from);
  if (start >= end || end - start > 366 * DAY) throw httpError('Date range must cover 1 to 366 days', 400);
  const owned = isVendor(req.user);
  const match = { createdAt: { $gte: new Date(start), $lt: new Date(end) },
    ...(owned && { 'items.vendor': new mongoose.Types.ObjectId(String(req.user._id)) }) };
  // One order contributes once to counts, even with multiple owned items.
  // Revenue is merchandise net of proportional discounts; shipping is excluded.
  // Only paid noncancelled orders and delivered COD are recognized. Reports use
  // the order-created cohort/date, rather than an unsupported settlement date.
  const [result] = await Order.aggregate([
    { $match: match },
    { $set: { scopedItems: owned ? { $filter: { input: '$items', as: 'item', cond: { $eq: ['$$item.vendor', new mongoose.Types.ObjectId(String(req.user._id))] } } } : '$items' } },
    { $set: { scopedSubtotal: { $sum: '$scopedItems.subtotal' }, recognized: { $and: [
      { $ne: ['$status', 'cancelled'] }, { $or: [{ $eq: ['$paymentStatus', 'paid'] }, { $and: [{ $eq: ['$paymentMethod', 'COD'] }, { $eq: ['$status', 'delivered'] }, { $eq: ['$paymentStatus', 'unpaid'] }] }] },
    ] } } },
    { $set: { net: { $cond: [{ $gt: ['$totalAmount', 0] },
      { $round: [{ $multiply: ['$scopedSubtotal', { $divide: [{ $max: [0, { $subtract: ['$totalAmount', { $ifNull: ['$discountAmount', 0] }] }] }, '$totalAmount'] }] }, 0] }, 0] } } },
    { $facet: {
      metrics: [{ $group: { _id: null, totalOrders: { $sum: 1 }, revenue: { $sum: { $cond: ['$recognized', '$net', 0] } },
        paidOrders: { $sum: { $cond: ['$recognized', 1, 0] } },
        pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        deliveredOrders: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } } } }],
      revenueByDay: [{ $match: { recognized: true } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } }, revenue: { $sum: '$net' }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }],
      orderStatuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
    } },
  ]);
  const metrics = { totalOrders: 0, revenue: 0, pendingOrders: 0, deliveredOrders: 0, cancelledOrders: 0, paidOrders: 0, ...(result?.metrics[0] || {}) };
  delete metrics._id;
  const days = new Map((result?.revenueByDay || []).map((row) => [row._id, row]));
  const revenueByDay = [];
  for (let time = start; time < end; time += DAY) {
    const date = dateKey(time);
    revenueByDay.push({ date, revenue: days.get(date)?.revenue || 0, orders: days.get(date)?.orders || 0 });
  }
  const counts = new Map((result?.orderStatuses || []).map((row) => [row._id, row.count]));
  return ApiResponse.success(res, 200, 'Analytics loaded', { metrics, revenueByDay,
    orderStatuses: statuses.map((status) => ({ status, count: counts.get(status) || 0 })),
    range: { from, to, timezone: 'Asia/Ho_Chi_Minh' },
    revenuePolicy: 'Order-created date (+07:00). Paid noncancelled orders or delivered unpaid COD. Merchandise after proportional discounts; shipping excluded. Vendor totals include owned items only.' });
});
module.exports = { getAnalytics };
