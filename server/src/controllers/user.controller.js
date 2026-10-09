const mongoose = require('mongoose');
const User = require('../models/User.model');
const ApiResponse = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');
const { getIo } = require('../config/socket');
const { pagination, escapeRegex, httpError } = require('../utils/management.util');
const roles = ['admin', 'vendor', 'customer'];
const safeFields = '_id email role isActive createdAt updatedAt';
const safeUser = (user) => ({ _id: user._id, email: user.email, role: user.role,
  isActive: user.isActive !== false, createdAt: user.createdAt, updatedAt: user.updatedAt });
const getUsers = catchAsync(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  if (req.query.search?.trim()) filter.email = new RegExp(escapeRegex(req.query.search), 'i');
  if (req.query.role) {
    if (!roles.includes(req.query.role)) throw httpError('Invalid user role', 400);
    filter.role = req.query.role;
  }
  if (req.query.active !== undefined) {
    if (!['true', 'false'].includes(req.query.active)) throw httpError('Invalid active filter', 400);
    filter.isActive = req.query.active === 'true' ? { $ne: false } : false;
  }
  const [users, total] = await Promise.all([
    User.find(filter).select(safeFields).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), User.countDocuments(filter),
  ]);
  return ApiResponse.success(res, 200, 'Users loaded', { users: users.map(safeUser), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});
const getUserById = catchAsync(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError('Invalid user ID', 400);
  const user = await User.findById(req.params.id).select(safeFields).lean();
  if (!user) throw httpError('User not found', 404);
  return ApiResponse.success(res, 200, 'User loaded', safeUser(user));
});
const updateUser = catchAsync(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError('Invalid user ID', 400);
  const { role, isActive } = req.body;
  if (Object.keys(req.body).some((key) => !['role', 'isActive'].includes(key))) throw httpError('Only role and isActive can be updated', 400);
  if (role === undefined && isActive === undefined) throw httpError('No user changes provided', 400);
  if (role !== undefined && !roles.includes(role)) throw httpError('Invalid user role', 400);
  if (isActive !== undefined && typeof isActive !== 'boolean') throw httpError('isActive must be boolean', 400);
  if (String(req.user._id) === req.params.id.toLowerCase() && ((role !== undefined && role !== 'admin') || isActive === false)) {
    throw httpError('You cannot deactivate or demote your own Admin account', 409);
  }
  const changes = { ...(role !== undefined && { role }), ...(isActive !== undefined && { isActive }), refreshToken: null };
  const user = await User.findByIdAndUpdate(req.params.id, { $set: changes }, { new: true, runValidators: true }).select(safeFields).lean();
  if (!user) throw httpError('User not found', 404);
  // Existing JWTs use the current DB role in protect; force socket clients to
  // reauthenticate instead of leaving stale Admin/Vendor room memberships alive.
  const io = req.app.get('io') || getIo();
  if (io) io.in('user_' + user._id).disconnectSockets(true);
  return ApiResponse.success(res, 200, 'User updated', safeUser(user));
});
module.exports = { getUsers, getUserById, updateUser };
