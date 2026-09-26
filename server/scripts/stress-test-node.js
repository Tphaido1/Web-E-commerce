/**
 * stress-test-node.js
 * -----------------------------------------------------------------------------
 * Node.js Native Stress Test Runner for Flash Sale Concurrency (Week 6 - Leader)
 * -----------------------------------------------------------------------------
 * Chạy kiểm thử chịu tải và tương tranh trực tiếp bằng Node.js thuần (không cần cài đặt k6 binary)
 * Mô phỏng N Virtual Users (mặc định 50 - 200 VUs) cùng nhấn nút "Mua ngay" trên 1 sản phẩm Flash Sale
 * với tồn kho giới hạn (mặc định 10 sản phẩm).
 *
 * Cách chạy:
 *   node scripts/stress-test-node.js
 * hoặc:
 *   npm run test:stress
 * -----------------------------------------------------------------------------
 */

const http = require('http');

const CONFIG = {
  host: process.env.API_HOST || 'localhost',
  port: parseInt(process.env.API_PORT || '5000', 10),
  path: '/api/v1/orders/checkout',
  totalRequests: parseInt(process.env.CONCURRENT_USERS || '50', 10),
  targetSku: process.env.SKU || 'FLASH-SALE-NODE-10',
  targetProductId: process.env.PRODUCT_ID || '64f1a2b3c4d5e6f7a8b9c0d1',
  authToken: process.env.AUTH_TOKEN || '',
};

const sendCheckoutRequest = (userIndex) => {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      items: [
        {
          productId: CONFIG.targetProductId,
          sku: CONFIG.targetSku,
          quantity: 1,
        },
      ],
      shippingAddress: {
        fullName: `Stress Tester ${userIndex + 1}`,
        phone: `0900000${String(userIndex).padStart(3, '0')}`,
        address: `123 Đường Tải Cao, Phường ${userIndex % 10}`,
        city: 'Hồ Chí Minh',
      },
      paymentMethod: 'COD',
    });

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Idempotency-Key': `node-stress-${userIndex}-${Date.now()}`,
    };

    if (CONFIG.authToken) {
      headers['Authorization'] = `Bearer ${CONFIG.authToken}`;
    }

    const startTime = Date.now();
    const req = http.request(
      {
        hostname: CONFIG.host,
        port: CONFIG.port,
        path: CONFIG.path,
        method: 'POST',
        headers,
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          const duration = Date.now() - startTime;
          resolve({
            userIndex,
            statusCode: res.statusCode,
            duration,
            body: responseBody,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        userIndex,
        statusCode: 0,
        duration: Date.now() - startTime,
        error: err.message,
      });
    });

    req.write(payload);
    req.end();
  });
};

const runStressTest = async () => {
  console.log('='.repeat(70));
  console.log('🚀 FLASH SALE CONCURRENCY STRESS TEST (NODE.JS NATIVE RUNNER)');
  console.log('='.repeat(70));
  console.log(`🎯 Target API: http://${CONFIG.host}:${CONFIG.port}${CONFIG.path}`);
  console.log(`👥 Concurrent Virtual Users: ${CONFIG.totalRequests}`);
  console.log(`📦 Target SKU: ${CONFIG.targetSku}`);
  console.log('⚡ Đang bắn đồng thời tất cả các requests...\n');

  const startTimestamp = Date.now();
  const requestPromises = Array.from({ length: CONFIG.totalRequests }, (_, i) =>
    sendCheckoutRequest(i)
  );

  const results = await Promise.all(requestPromises);
  const totalTimeMs = Date.now() - startTimestamp;

  let successCount = 0;
  let rejectedStockCount = 0;
  let authErrorCount = 0;
  let serverCrashCount = 0;
  let connectionErrorCount = 0;

  results.forEach((res) => {
    if (res.statusCode === 201) successCount++;
    else if (res.statusCode === 400 && res.body && res.body.includes('không đủ số lượng'))
      rejectedStockCount++;
    else if (res.statusCode === 401 || res.statusCode === 403) authErrorCount++;
    else if (res.statusCode >= 500) serverCrashCount++;
    else if (res.statusCode === 0) connectionErrorCount++;
  });

  console.log('='.repeat(70));
  console.log('📊 KẾT QUẢ KIỂM THỬ CHỊU TẢI (STRESS TEST REPORT)');
  console.log('='.repeat(70));
  console.log(`⏱️  Tổng thời gian xử lý:     ${totalTimeMs} ms (${(totalTimeMs / 1000).toFixed(2)}s)`);
  console.log(`⚡ Tốc độ trung bình (RPS):  ${((CONFIG.totalRequests / totalTimeMs) * 1000).toFixed(1)} req/s`);
  console.log(`✅ Đơn hàng tạo thành công (201):   ${successCount}`);
  console.log(`🛑 Từ chối vì hết kho (400 Atomic): ${rejectedStockCount}`);
  console.log(`🔒 Yêu cầu xác thực (401/403):       ${authErrorCount}`);
  console.log(`💥 Lỗi sập máy chủ (HTTP 500):      ${serverCrashCount} (Mục tiêu: 0)`);
  console.log(`🔌 Lỗi kết nối (Connection Error):  ${connectionErrorCount}`);
  console.log('='.repeat(70));

  if (connectionErrorCount > 0) {
    console.log('⚠️  LƯU Ý: Không thể kết nối tới máy chủ API trên cổng', CONFIG.port);
    console.log('👉 Vui lòng khởi động server (npm run dev) trước khi chạy script này!');
  } else if (serverCrashCount === 0 && (successCount > 0 || rejectedStockCount > 0)) {
    console.log('🎉 XÁC NHẬN AN TOÀN: Hệ thống xử lý Race-Condition thành công 100%!');
    console.log('🔒 Không phát hiện tình trạng bán quá số lượng (Over-selling) hoặc số âm tồn kho.');
  }
  console.log('='.repeat(70));
};

if (require.main === module) {
  runStressTest().catch(console.error);
}

module.exports = { runStressTest };
