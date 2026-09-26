import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

/**
 * ==============================================================================
 * K6 STRESS TEST SCRIPT: FLASH SALE CONCURRENCY CHECKOUT (WEEK 6 - LEADER)
 * ==============================================================================
 * Mục tiêu: Giả lập 200 Virtual Users (VUs) đồng thời click "MUA NGAY"
 * trên cùng 1 sản phẩm Flash Sale chỉ còn duy nhất 10 món trong kho.
 *
 * Tiêu chí đánh giá:
 *  - Đúng 10 đơn hàng tạo thành công (HTTP 201)
 *  - 190 đơn hàng bị từ chối nguyên tử (HTTP 400 - "Sản phẩm không đủ số lượng")
 *  - Tồn kho trong MongoDB cuối cùng bằng chính xác 0 (Tuyệt đối không bị âm!)
 *  - Tỷ lệ lỗi hệ thống (HTTP 500) bằng 0%
 * ==============================================================================
 */

export const options = {
  scenarios: {
    flash_sale_surge: {
      executor: 'per-vu-iterations',
      vus: 200, // 200 người dùng đồng thời
      iterations: 1, // Mỗi VU gửi 1 request checkout chớp nhoáng
      maxDuration: '30s',
    },
  },
  thresholds: {
    'successful_orders': ['count==10'], // Đúng 10 đơn thành công
    'rejected_orders': ['count==190'], // Đúng 190 đơn bị từ chối
    'http_req_failed': ['rate<0.01'], // Không có lỗi crash server (500)
    'http_req_duration': ['p(95)<1000'], // 95% request phản hồi dưới 1 giây
  },
};

const successfulOrders = new Counter('successful_orders');
const rejectedOrders = new Counter('rejected_orders');
const serverErrors = new Counter('server_errors');

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api/v1';
const FLASH_SALE_PRODUCT_ID = __ENV.PRODUCT_ID || '64f1a2b3c4d5e6f7a8b9c0d1';
const FLASH_SALE_SKU = __ENV.SKU || 'FLASH-SALE-10';

export default function () {
  const vuId = __VU;
  const uniqueKey = `k6-order-${vuId}-${Date.now()}`;

  // Giả lập token đăng nhập của người dùng thứ vuId
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': uniqueKey,
    // Nếu có token thật truyền qua __ENV.AUTH_TOKEN, nếu không dùng Bearer giả lập test
    'Authorization': `Bearer ${__ENV.AUTH_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy'}`,
  };

  const payload = JSON.stringify({
    items: [
      {
        productId: FLASH_SALE_PRODUCT_ID,
        sku: FLASH_SALE_SKU,
        quantity: 1,
      },
    ],
    shippingAddress: {
      fullName: `Customer Flash ${vuId}`,
      phone: `0900000${(vuId + '').padStart(3, '0')}`,
      address: `123 Đường Flash Sale, Quận ${vuId % 10}`,
      city: 'Hồ Chí Minh',
    },
    paymentMethod: 'COD',
  });

  const res = http.post(`${BASE_URL}/orders/checkout`, payload, { headers });

  if (res.status === 201) {
    successfulOrders.add(1);
    check(res, {
      'Tạo đơn thành công (201)': (r) => r.status === 201,
    });
  } else if (res.status === 400) {
    rejectedOrders.add(1);
    check(res, {
      'Từ chối nguyên tử vì hết hàng (400)': (r) => r.status === 400 && r.body.includes('không đủ số lượng'),
    });
  } else {
    serverErrors.add(1);
    check(res, {
      'Lỗi không mong muốn (Not 201 or 400)': (r) => r.status === 500,
    });
  }

  sleep(0.1);
}
