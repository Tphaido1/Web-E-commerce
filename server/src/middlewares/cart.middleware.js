const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const User = require('../models/User.model');
const catchAsync = require('../utils/catchAsync');

const GUEST_COOKIE = 'guestId';
const GUEST_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const parseCookies = (header = '') =>
  header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator === -1) return cookies;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});

const isGuestId = (guestId) =>
  typeof guestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(guestId);

const getGuestId = (req) => {
  const guestId = parseCookies(req.headers.cookie)[GUEST_COOKIE];
  return isGuestId(guestId) ? guestId : null;
};

const setGuestCookie = (res, guestId) => {
  res.cookie(GUEST_COOKIE, guestId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: GUEST_COOKIE_MAX_AGE,
    secure: env.NODE_ENV === 'production',
  });
};

const clearGuestCookie = (res) => {
  res.clearCookie(GUEST_COOKIE, { httpOnly: true, sameSite: 'lax' });
};

const resolveCartOwner = catchAsync(async (req, res, next) => {
  const authorization = req.headers.authorization;
  let user = null;

  if (authorization && authorization.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authorization.slice(7), env.JWT_SECRET);
      if (payload.type === 'access') user = await User.findById(payload.sub);
    } catch (error) {
      // Token hết hạn hoặc sai định dạng được xử lý như một phiên guest.
    }
  }

  if (user) {
    req.user = user;
    req.cartOwner = { userId: user._id };
    return next();
  }

  let guestId = getGuestId(req);
  if (!guestId) {
    guestId = crypto.randomUUID();
    setGuestCookie(res, guestId);
  }

  req.guestId = guestId;
  req.cartOwner = { guestId };
  return next();
});

module.exports = {
  GUEST_COOKIE,
  getGuestId,
  setGuestCookie,
  clearGuestCookie,
  resolveCartOwner,
};