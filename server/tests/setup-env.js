// Every suite starts with isolated test-only configuration, never a real .env service.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1/unused-jest-placeholder';
process.env.JWT_SECRET = 'isolated-jest-access-secret';
process.env.JWT_REFRESH_SECRET = 'isolated-jest-refresh-secret';
process.env.HMAC_SECRET = 'isolated-jest-qr-secret';
process.env.VNP_TMN_CODE = 'TESTONLY';
process.env.VNP_HASH_SECRET = 'isolated-jest-payment-secret';
process.env.VNP_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
process.env.VNP_RETURN_URL = 'http://localhost:5173/checkout/payment-result';
process.env.SMTP_HOST = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
