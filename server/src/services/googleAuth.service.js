/**
 * googleAuth.service.js
 * ------------------------------------------------------------
 * Dịch vụ xác thực Google ID Token sử dụng google-auth-library chính thức.
 * Xác thực chữ ký cryptographic, kiểm tra audience và thời hạn của token.
 * ------------------------------------------------------------
 */

const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');

let oauthClient = null;
let currentClientId = null;

const getClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  if (!oauthClient || currentClientId !== clientId) {
    oauthClient = new OAuth2Client(clientId);
    currentClientId = clientId;
  }
  return oauthClient;
};

/**
 * Xác thực Google ID Token và trích xuất thông tin người dùng
 * @param {string} idToken
 * @returns {Promise<{ googleId: string, email: string, name: string, avatar: string, emailVerified: boolean }>}
 */
async function verifyGoogleIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string' || !idToken.trim()) {
    const error = new Error('Google ID token là bắt buộc');
    error.statusCode = 400;
    throw error;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
  if (!clientId || !clientId.trim()) {
    const error = new Error('Máy chủ chưa được cấu hình GOOGLE_CLIENT_ID');
    error.statusCode = 500;
    throw error;
  }

  try {
    const client = getClient();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      const error = new Error('Google ID token không hợp lệ hoặc thiếu thông tin');
      error.statusCode = 401;
      throw error;
    }

    if (!payload.email_verified) {
      const error = new Error('Email tài khoản Google chưa được xác thực');
      error.statusCode = 401;
      throw error;
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase().trim(),
      name: payload.name || '',
      avatar: payload.picture || '',
      emailVerified: Boolean(payload.email_verified),
    };
  } catch (err) {
    if (err.statusCode) throw err;
    const error = new Error(err.message || 'Xác thực Google token thất bại');
    error.statusCode = 401;
    throw error;
  }
}

module.exports = {
  verifyGoogleIdToken,
};
