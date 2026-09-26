# E-Commerce System — Monorepo (Tuần 1 Boilerplate)

Dự án Web E-Commerce gồm 3 ứng dụng độc lập trong cùng 1 Monorepo:

| Thư mục | Vai trò | Công nghệ | Port mặc định |
|---|---|---|---|
| `server/` | Backend API | Node.js, Express, MongoDB (Mongoose), Socket.io | `5000` |
| `client-storefront/` | Frontend Khách hàng | React + Vite | `5173` |
| `client-admin/` | Frontend Admin/Vendor | React + Vite + Ant Design | `5174` |

## 📁 Cấu trúc thư mục

```
ecommerce-system/
├── server/
│   ├── src/
│   │   ├── config/         # Cấu hình (db.js, env.js)
│   │   ├── models/         # Mongoose Schemas
│   │   ├── controllers/    # Xử lý logic request/response
│   │   ├── routes/         # Định nghĩa API endpoints
│   │   ├── services/       # Business logic tái sử dụng
│   │   ├── middlewares/    # Middleware (error handler, auth guard...)
│   │   ├── utils/          # Helper functions (catchAsync, apiResponse)
│   │   ├── app.js          # Cấu hình Express app
│   │   └── server.js       # Entry point: boot server + DB + Socket.io
│   ├── .env.example
│   └── package.json
├── client-storefront/
│   ├── src/ (App.jsx, main.jsx)
│   └── package.json
├── client-admin/
│   ├── src/ (App.jsx, main.jsx)
│   └── package.json
├── postman_collection.json
├── .gitignore
└── README.md
```

## ⚙️ Yêu cầu môi trường

- **Node.js**: >= 18.x
- **MongoDB**: local (`mongodb://127.0.0.1:27017`) hoặc MongoDB Atlas (cloud)
- **npm**: >= 9.x

## 🚀 Hướng dẫn cài đặt & chạy dự án

Dự án hiện **chưa dùng workspaces chung** (mỗi thư mục là 1 project Node độc lập) — mỗi thư mục cần `npm install` và chạy riêng ở **3 terminal khác nhau**.

### 1️⃣ Backend — `server/`

```bash
cd server

# Cài đặt thư viện
npm install

# Tạo file .env từ file mẫu, sau đó chỉnh sửa MONGO_URI, JWT_SECRET cho phù hợp
cp .env.example .env

# Chạy ở chế độ development (tự động reload khi code thay đổi)
npm run dev

# Hoặc chạy ở chế độ production
npm start
```

Sau khi chạy thành công, API sẽ sẵn sàng tại: `http://localhost:5000/api/v1`
Kiểm tra nhanh: `GET http://localhost:5000/api/v1/healthcheck`

### 2️⃣ Frontend Storefront — `client-storefront/`

```bash
cd client-storefront

npm install
npm run dev
```

Truy cập: `http://localhost:5173`

### 3️⃣ Frontend Admin — `client-admin/`

```bash
cd client-admin

npm install
npm run dev
```

Truy cập: `http://localhost:5174`

## 🧪 Test API với Postman

Import file [`postman_collection.json`](./postman_collection.json) vào Postman (File → Import). Collection dùng biến `{{baseUrl}}` trỏ tới `http://localhost:5000/api/v1` và có các nhóm Healthcheck, Auth Core.

- `GET /healthcheck`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh-token`
- `POST /auth/logout`

## 🔐 Auth API Contract

Tất cả response thành công dùng format:

```json
{
	"status": "success",
	"message": "...",
	"data": {}
}
```

### `POST /auth/register`

Request:

```json
{
	"email": "user@example.com",
	"password": "Password123!"
}
```

Response `201`:

```json
{
	"status": "success",
	"message": "Đăng ký thành công",
	"data": {
		"user": {
			"id": "user_id",
			"email": "user@example.com",
			"role": "customer"
		},
		"token": "<access-jwt>",
		"accessToken": "<access-jwt>",
		"refreshToken": "<refresh-jwt>"
	}
}
```

### `POST /auth/login`

Request có cùng shape với `/auth/register`. Response `200` có cùng các field `data.user`, `data.token`, `data.accessToken` và `data.refreshToken`. `data.user` và `data.token` giữ tương thích với `client-storefront/src/services/authService.js`.

### `POST /auth/refresh-token`

Request:

```json
{
	"refreshToken": "<refresh-jwt>"
}
```

Response `200` trả về `data.token`, `data.accessToken` và `data.refreshToken` mới. Refresh token được xác thực bằng `JWT_REFRESH_SECRET` và hash lưu trong MongoDB.

### `POST /auth/logout`

Header:

```text
Authorization: Bearer <access-jwt>
```

Response `200`:

```json
{
	"status": "success",
	"message": "Đăng xuất thành công",
	"data": null
}
```

Logout xóa hash refresh token trong database. Access token stateless hiện tại vẫn có hiệu lực cho tới khi hết hạn.

## 🌳 Quy ước Git Branch (đề xuất cho nhóm 5 người)

- `main`: code ổn định, đã review
- `develop`: nhánh tích hợp chung
- `feature/<ten-thanh-vien>-<chuc-nang>`: mỗi thành viên làm việc trên nhánh riêng, VD: `feature/an-product-crud`

## 📌 Trạng thái Tuần 2-3 và việc tiếp theo

- Auth Core đã hoàn tất ở backend: `User.model.js`, `auth.controller.js`, `auth.middleware.js` và bốn auth endpoint dùng JWT + bcrypt thật.
- `client-storefront/src/services/authService.js` đã có thể gọi `/auth/register` và `/auth/login`; không cần sửa client ở bước Auth Core này.
- Backend hiện chưa có route thật cho `/products`, `/cart`, `/orders`, `/categories`; các request frontend tới các endpoint này vẫn có thể nhận `404`.
- `client-admin/src/services/productService.js` và `categoryService.js` hiện còn dùng mock data, cần thay bằng API thật khi backend tương ứng hoàn tất.
- `client-admin/src/services/authService.js` hiện mới dùng localStorage mock; cần chuyển sang `/auth/login` thật và kiểm tra role trước khi merge lên `main`.
- `client-storefront/src/services/cartService.js` còn placeholder, còn `CartContext.jsx` dùng localStorage; cần refactor khi Cart API backend được triển khai.
- Bổ sung unit/integration test cho auth, đặc biệt sai mật khẩu, token hết hạn, refresh token và duplicate email.

Các hạng mục backend tiếp theo:

- Thiết kế Schema Mongoose cho `models/` (Product, Order, Category...)
- Xây dựng Controller + Service cho module Product (CRUD)
- Thiết kế layout chính (Header, Footer, Sidebar) cho 2 Frontend

---

## 🚀 Nhật Ký Cập Nhật Tính Năng (Tuần 4 — Tuần 6)

### 📦 1. Tuần 4: Đặt Hàng (Checkout Saga), Giảm Giá (Coupon) & Hóa Đơn QR HMAC

- **Luồng Đặt Hàng Atomic & Bồi Hoàn (Saga Rollback)**:
  - Khởi tạo đơn hàng `POST /api/v1/orders/checkout` (hỗ trợ COD và VNPay).
  - Trừ kho nguyên tử với điều kiện `{ sku, stock: { $gte: quantity } }` và toán tử `{ $inc: { stock: -quantity } }`.
  - Cơ chế **Compensation Saga**: Tự động bồi hoàn lại tồn kho nếu các bước sau (tạo đơn, áp mã giảm giá) thất bại giữa chừng.
  - Snapshot giá, tên và hình ảnh sản phẩm tại thời điểm mua, chống gian lận giá từ client.
  - Tự động hoàn kho khi đơn hàng bị hủy (`PATCH /api/v1/orders/:id/cancel`).
  - Hỗ trợ Idempotency Key qua header `Idempotency-Key` ngăn chặn tạo đơn trùng lặp.
- **Engine Mã Giảm Giá (Coupon Engine)**:
  - Hỗ trợ 2 loại: `percentage` (giảm theo % kèm trần `maxDiscountAmount`) và `fixed` (giảm số tiền cố định).
  - Kiểm tra điều kiện đơn hàng tối thiểu (`minOrderValue`), ngày hiệu lực (`startDate` - `endDate`), giới hạn toàn hệ thống (`usageLimit`) và giới hạn trên từng user (`userLimit`).
  - `POST /api/v1/coupons/apply`: Xem trước số tiền giảm giá trước khi đặt hàng.
  - Quản trị viên (Admin): CRUD mã giảm giá (`GET`, `POST`, `PATCH`, `DELETE /api/v1/coupons`).
- **Hóa Đơn Điện Tử & Mã QR Xác Thực**:
  - Dịch vụ email hóa đơn (`email.service.js`) gửi tóm tắt đơn hàng sau khi checkout thành công.
  - Sinh mã QR chứa URL tra cứu bảo mật kèm Token ký số **HMAC-SHA256** (`HMAC_SECRET`), chống quét giả mạo thông tin đơn hàng.

---

### 💳 2. Tuần 5: Cổng Thanh Toán VNPay, Socket.io Realtime & Audit Log

- **Tích Hợp Cổng Thanh Toán Trực Tuyến VNPay (Sandbox)**:
  - `POST /api/v1/payments/create-vnpay-url`: Sinh URL chuyển hướng sang cổng VNPay với thuật toán ký số **HMAC-SHA512**.
  - `GET /api/v1/payments/vnpay-return`: Xử lý phản hồi điều hướng người dùng sau khi giao dịch.
  - `GET /api/v1/payments/vnpay-ipn`: Webhook Server-to-Server xử lý bất đồng bộ, đối soát mã phản hồi `vnp_ResponseCode === '00'`, cập nhật trạng thái đơn thành `paid` có cơ chế kiểm tra chống xử lý trùng lặp giao dịch (Idempotency).
- **Socket.io Realtime Gateway**:
  - Khởi tạo WebSocket Server tích hợp trực tiếp vào Express HTTP Server (`server/src/config/socket.js`).
  - Middleware xác thực Handshake bằng JWT token.
  - Phân vùng phòng kết nối (Room Partitioning):
    - `role_admin`: Nhận thông báo đơn hàng mới, cảnh báo tồn kho thấp.
    - `vendor_{id}`: Nhận đơn hàng mới của gian hàng.
    - `user_{id}`: Nhận thông báo biến động đơn hàng cá nhân.
    - `order_{id}`: Theo dõi tiến trình đơn hàng theo thời gian thực.
- **Dịch Vụ Nhật Ký Kiểm Toán (Audit Log Service)**:
  - Schema `AuditLog.model.js` lưu trữ: `action`, `resource`, `resourceId`, `performedBy`, `details`, `ipAddress`, `userAgent`.
  - Ghi vết mọi sự kiện trọng yếu: Tạo đơn, hủy đơn, chuyển trạng thái đơn, thanh toán VNPay thành công/thất bại, IPN callback.

---

### ⚡ 3. Tuần 6: High-Concurrency Flash Sale, PWA Offline Sync & Đánh Giá Sản Phẩm

- **Chống Race-Condition Flash Sale & Bộ Công Cụ Stress Test**:
  - Đảm bảo tính bất biến: Tồn kho không bao giờ bị âm ngay cả khi hàng trăm request gửi đến cùng lúc.
  - Script K6: `server/scripts/stress-test-checkout.js` mô phỏng 200 Virtual Users tranh mua 10 món hàng Flash Sale.
  - Native Node.js Stress Runner: `server/scripts/stress-test-node.js` chạy kiểm thử tải tức thì không phụ thuộc môi trường ngoài qua lệnh `npm run test:stress`.
  - Bộ test tương tranh Jest `server/tests/concurrency.test.js`: Kiểm thử 50 request song song, kiểm thử chống sửa giá (anti-tampering), kiểm thử chạy đua áp mã giảm giá 1 lần (concurrent coupon spam).
- **PWA Offline Support (Storefront)**:
  - Web App Manifest: `client-storefront/public/manifest.json`.
  - Service Worker: `client-storefront/public/service-worker.js` (Cache-First cho tài nguyên tĩnh, Network-First fallback Cache cho API danh mục / sản phẩm).
  - IndexedDB Store: `client-storefront/src/services/offlineDb.js` quản lý cache sản phẩm, giỏ hàng ngoại tuyến và hàng đợi đơn hàng ngoại tuyến (`offlineOrdersQueue`).
  - Offline Alert UI: Component `OfflineBanner.jsx` hiển thị trạng thái mất mạng và tự động kích hoạt đồng bộ khi có kết nối trở lại.
  - Hàng đợi đồng bộ Backend: `POST /api/v1/sync/offline-orders` (chống trùng lặp qua `clientOrderId`) và `POST /api/v1/sync/offline-cart`.
- **Hệ Thống Đánh Giá & Phản Hồi (Reviews & Ratings)**:
  - Schema `Review.model.js`: Đánh giá 1-5 sao, nhận xét, cờ `isVerifiedPurchase`, trạng thái `pending`, `approved`, `rejected`.
  - Ràng buộc Mua hàng thực tế (**Verified Purchase Constraint**): Chặn người chưa mua hoặc đơn chưa hoàn thành bằng HTTP 403.
  - Tự động tái tính toán điểm trung bình: Cập nhật trường `ratingAverage` và `reviewCount` trên `Product.model.js`.
  - Admin UI: Trang `client-admin/src/pages/Reviews.jsx` (Ant Design Table, duyệt/ẩn đánh giá, huy hiệu Verified Purchase).
  - Storefront UI: Component `ProductReviews.jsx` (Tổng quan sao, thanh phân bố tỷ lệ sao, bình luận đã duyệt, form gửi đánh giá sao tương tác).

---

### 🧪 Danh Sách Test Suites Đã Được Xác Minh (Jest 51/51 Tests Passed)

```bash
cd server
npm test
```

1. `tests/email.test.js` (5 tests) — Email invoice & HMAC-SHA256 QR token
2. `tests/coupon.test.js` (8 tests) — Coupon logic, percentage, fixed, limits, expiry
3. `tests/order.controller.test.js` (7 tests) — Checkout, stock deduction, rollback, cancellation
4. `tests/checkout.api.test.js` (4 tests) — Supertest API checkout & validation
5. `tests/payment.vnpay.test.js` (12 tests) — URL generator, Checksum HMAC-SHA512, Return handler, IPN Webhook
6. `tests/socket.test.js` (5 tests) — JWT Handshake, room partitioning, notification emitters
7. `tests/concurrency.test.js` (3 tests) — 50 concurrent requests, anti-price tampering, coupon race
8. `tests/sync.test.js` (3 tests) — Offline orders sync idempotency, out-of-stock handling, cart sync
9. `tests/review.test.js` (4 tests) — Verified purchase check (403), rating validation (400), creation (201), admin moderation (200)

---
