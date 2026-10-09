# E-Commerce System — MVC Monorepo

Dự án Web E-Commerce gồm 3 ứng dụng độc lập trong cùng 1 Monorepo:

| Thư mục | Vai trò | Công nghệ | Port mặc định |
|---|---|---|---|
| `server/` | Backend API | Node.js, Express, MongoDB (Mongoose), Socket.io | `5000` |
| `client-storefront/` | Frontend Khách hàng | React + Vite | `5173` |
| `client-admin/` | Frontend Admin/Vendor | React + Vite + Ant Design | `5174` |

## 📁 Cấu trúc thư mục

```
web/
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

# (Tùy chọn) Nạp dữ liệu mẫu ban đầu (sản phẩm, tài khoản admin/vendor/customer)
npm run seed

# Chạy ở chế độ development (tự động reload khi code thay đổi)
npm run dev

# Hoặc chạy ở chế độ production
npm start
```

Sau khi chạy thành công, API sẽ sẵn sàng tại: `http://localhost:5000/api/v1`
Kiểm tra nhanh: `GET http://localhost:5000/api/v1/healthcheck`

Hủy đơn cập nhật trạng thái, hoàn kho và trả lượt coupon trong một MongoDB transaction. Luồng này cần replica set (có thể là replica set một node ở local) hoặc sharded cluster hỗ trợ transaction; cập nhật `MONGO_URI` theo deployment của bạn. MongoDB standalone vẫn chạy các API khác, nhưng API hủy đơn trả HTTP 503 trước mọi thay đổi. Nếu một thao tác hoàn trả thất bại, transaction rollback và đơn giữ trạng thái cũ để có thể thử lại. Không có migration hoặc thay đổi deployment tự động.

Tra cứu đơn hàng công khai chỉ trả thông tin người nhận đã che, trạng thái giao hàng và thời điểm cập nhật. Chi tiết đơn và thanh toán cần liên kết HMAC hợp lệ với `HMAC_SECRET` riêng. Hủy đơn thiếu tài nguyên kho đã ghi nhận trả HTTP 409; hủy lại đơn đã hủy trả HTTP 400.

### 2️⃣ Frontend Storefront — `client-storefront/`

```bash
cd client-storefront

npm install
npm run dev
```

Truy cập: `http://localhost:5173`

#### Cấu hình, kiểm tra và triển khai Storefront

`client-storefront/.env.example` liệt kê biến frontend:

| Biến | Mặc định | Mục đích |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5000/api/v1` | URL REST API đầy đủ, gồm tiền tố `/api/v1`. Khi triển khai, đặt thành URL HTTPS của backend. |

Tạo `.env.local` từ file mẫu khi cần ghi đè mặc định. Vite đóng gói giá trị `VITE_*` vào JavaScript công khai; không đặt secret, khóa ký hay thông tin đăng nhập trong các biến này. Khi dùng API khác origin, cấu hình backend cho phép CORS từ origin storefront đã triển khai. Không dùng URL tương đối `/api/v1` trừ khi đã cấu hình reverse proxy riêng; cấu hình Vercel bên dưới chỉ xử lý SPA routes, không proxy API.

```bash
cd client-storefront
npm ci
npm run lint
npm run build
npm run preview
```

Build local tạo `client-storefront/dist/`, phục vụ preview và regression. Khi deploy Vercel, đặt **Root Directory** thành `client-storefront`, build `npm run build:deploy`, output `dist`; cấu hình Vercel/Netlify trong thư mục client xử lý SPA fallback. Lệnh deploy kiểm tra `VITE_API_BASE_URL` phải là backend HTTPS công khai, không phải localhost hoặc địa chỉ mẫu. Kiểm tra cú pháp URL không chứng minh backend hoạt động; phải smoke-test URL thật sau deploy. Triển khai cần HTTPS cho Service Worker. Đặt biến frontend tại hosting rồi build lại sau khi đổi giá trị.

Backend phải cấu hình `VNP_RETURN_URL` thành URL HTTPS của storefront, kết thúc bằng `/checkout/payment-result`, và `CLIENT_URL`/`ADMIN_URL` đúng các origin triển khai cho CORS và Socket.io. Đăng ký IPN backend `/api/v1/payments/vnpay-ipn` tại cổng merchant. Chỉ IPN xác minh chữ ký, merchant, số tiền và trạng thái giao dịch mới cập nhật thanh toán; Return chỉ đọc trạng thái. `VNP_TMN_CODE`/`VNP_HASH_SECRET` là secrets backend, cần credentials merchant thật; để trống sẽ vô hiệu hóa VNPay trong khi COD vẫn dùng được. Không dùng khóa demo công khai.

#### Hướng dẫn regression Storefront

- Build và lint: `npm run build` và `npm run lint` trong `client-storefront/`.
- Kiểm tra SPA fallback bằng cách mở trực tiếp `/products/:id`, `/checkout/payment-result`, `/my-orders`, `/orders/:id` và `/track-order`.
- Kiểm tra quy trình API với backend và tài khoản test đang chạy: đăng nhập/đăng xuất, tìm kiếm và bộ lọc, chọn biến thể, cart, coupon, COD checkout, lịch sử/chi tiết đơn và tracking. Chỉ xác nhận success sau response từ backend.
- Kiểm tra PWA trên HTTPS (hoặc localhost): cài Service Worker, mở lại app shell khi offline, xác minh sản phẩm đã cache được đánh dấu dữ liệu có thể cũ; thử cart sync khi online trở lại và xác nhận lỗi/stock conflict không xóa công việc đang chờ.
- Kiểm tra layout/overflow và thao tác bàn phím trên viewport 320, 390, 768, 1024 và 1440 px. Đây là viewport giả lập trong trình duyệt, không thay cho kiểm tra thiết bị thật.
- Backend, database, tài khoản test, VNPay callback/IPN và thiết bị thật cần có sẵn để xác nhận các luồng tích hợp; build hoặc browser preview đơn lẻ không xác nhận được các luồng này.

### 3️⃣ Frontend Admin — `client-admin/`

```bash
cd client-admin

# Optional: copy .env.example to .env.local and set the backend URL.
npm install
npm run dev
```

Truy cập: `http://localhost:5174`

#### 🔑 Tài khoản đăng nhập mẫu Admin & Vendor (Database Seed)

Chạy lệnh `npm run seed` trong thư mục `server/` để nạp sẵn dữ liệu và các tài khoản mẫu vào MongoDB. Sau đó bạn có thể sử dụng thông tin bên dưới để đăng nhập:

| Vai trò | Email đăng nhập | Mật khẩu mặc định | Phạm vi quyền hạn |
|---|---|---|---|
| **Admin (Quản trị viên)** | `admin@ecommerce.com` | `Admin@123` | Toàn quyền quản trị hệ thống tại `http://localhost:5174` (Sản phẩm, Danh mục, Đơn hàng, Tồn kho, Người dùng, Thống kê) |
| **Vendor (Người bán)** | `vendor@ecommerce.com` | `Vendor@123` | Đăng nhập `http://localhost:5174`, chỉ xem và quản lý các sản phẩm/đơn hàng thuộc gian hàng của mình |
| **Customer (Khách hàng)** | `customer@ecommerce.com` | `Customer@123` | Đăng nhập tại Storefront `http://localhost:5173` để mua sắm, áp mã giảm giá và theo dõi đơn hàng |

#### Cấu hình Admin/Vendor

`client-admin/.env.example` liệt kê các biến Vite cần thiết:

| Biến | Mặc định | Mục đích |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5000/api/v1` | REST API base URL, bao gồm tiền tố phiên bản. |
| `VITE_SOCKET_URL` | Origin của `VITE_API_BASE_URL` | Socket.io server origin; đặt riêng nếu realtime server dùng origin khác. |

Vite nhúng các biến `VITE_*` vào bundle khi build. Không đặt secrets trong các biến này. Sau khi thay đổi biến, cần build lại frontend.

#### Build và triển khai SPA

```bash
cd client-admin
npm ci
npm run lint
npm run build
```

Build local tạo `client-admin/dist/`. Vercel/Netlify đã có cấu hình SPA fallback cho `/dashboard`, `/products/*`, `/inventory`, `/users`, `/categories`, `/orders` và `/reviews`, dùng `npm run build:deploy` để chặn endpoint thiếu/localhost trước khi publish. Cấu hình `VITE_API_BASE_URL`, tùy chọn `VITE_SOCKET_URL`, và backend CORS/Socket.io theo origin triển khai. Có thể chạy `npm run check:deploy` để kiểm tra cấu hình trước khi build. Sau triển khai, kiểm tra HTTPS, tải lại đường dẫn trực tiếp, đăng nhập Admin/Vendor, restock, bộ lọc analytics và thông báo đơn mới.

#### Chức năng Admin/Vendor

- **B01 Authentication**: login/session, refresh, role guard và logout đã triển khai; tài khoản vô hiệu hóa bị chặn, thay đổi role/access thu hồi refresh và ngắt socket.
- **B02 Categories**: CRUD dùng API thật; chỉ Admin ghi, Vendor đọc.
- **B03 Products/variants**: Admin chọn Vendor; Vendor chỉ quản lý sản phẩm thuộc mình qua `/products/managed`. Catalog hydrate tồn kho từ Inventory; sửa metadata giữ nguyên tồn kho SKU hiện có. Tồn kho ban đầu chỉ nhập lúc tạo sản phẩm/biến thể mới; dùng Inventory để restock. SKU có đơn chưa kết thúc không được đổi/xóa.
- **B04 Product image upload**: chưa hoàn tất; backend hiện không expose upload endpoint.
- **B05 Orders**: list/filter/pagination/detail/status dùng API; Vendor chỉ nhận dòng đơn thuộc mình và tổng tiền tương ứng. Đơn nhiều Vendor chỉ Admin đổi trạng thái toàn đơn; cần mô hình fulfillment riêng nếu muốn mỗi Vendor cập nhật độc lập.
- **B06 Inventory/Users**: Inventory có tìm SKU/sản phẩm, lọc tồn thấp/hết hàng, restock nguyên tử và ngưỡng cảnh báo. Users dành riêng Admin, lọc/tìm kiếm/xem và thay đổi role/access; không trả password/refresh token. Dữ liệu cũ chưa gán Vendor thuộc phạm vi Admin; không tự migrate hoặc đoán ownership.
- **B07 Review moderation**: frontend đọc/filter cho admin/vendor; chỉ admin có quyền moderation theo backend.
- **B08 Realtime orders**: Admin và Vendor nhận `new_order`; server xác định Vendor từ snapshot dòng đơn, payload Vendor chỉ có số liệu thuộc mình. Client cleanup listener và chống thông báo trùng theo phiên.
- **B09 Analytics**: API tổng hợp thực có khoảng ngày theo UTC+07:00, thẻ thống kê, biểu đồ cột doanh thu và tròn trạng thái. Doanh thu là giá trị hàng sau phân bổ giảm giá, không gồm shipping; đơn paid không hủy hoặc COD delivered chưa thu online được ghi nhận theo ngày tạo đơn.

#### API quản lý Admin/Vendor

Các đường dẫn dưới đây dùng tiền tố `/api/v1` và yêu cầu xác thực. Inventory, analytics và danh sách sản phẩm quản lý dành cho Admin/Vendor; quản lý người dùng dành riêng Admin.

| Endpoint | Tham số hoặc nội dung request |
|---|---|
| `GET /inventory` | `search`, `stockStatus=all\|low\|out`, `page`, `limit` |
| `POST /inventory/:id/restock` | `{ quantity }`, số nguyên dương |
| `PATCH /inventory/:id/threshold` | `{ lowStockThreshold }`, số nguyên không âm |
| `GET /products/managed` | Bộ lọc và phân trang sản phẩm, giới hạn theo Vendor sở hữu |
| `GET /users` | `search`, `role`, `active`, `page`, `limit` |
| `GET /users/:id` | Thông tin tài khoản, không có password hoặc refresh token |
| `PATCH /users/:id` | `{ role?, isActive? }`; không cho tự hạ quyền hoặc khóa mình |
| `GET /analytics` | `from`, `to` theo `YYYY-MM-DD`, tối đa 366 ngày |

Sản phẩm cũ chưa gán Vendor và đơn cũ chưa có snapshot Vendor thuộc phạm vi quản lý Admin. Thay đổi Vendor của sản phẩm không chuyển quyền sở hữu đơn cũ. Thay đổi role/access thu hồi refresh token và ngắt socket hiện tại. Thông báo realtime Vendor chỉ chứa các dòng đơn và số tiền thuộc Vendor đó; socket hết hạn access token sẽ ngắt kết nối.

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

## Chức năng hệ thống

### Danh mục, sản phẩm và giỏ hàng

- **Quản Lý Sản Phẩm & Biến Thể**:
  - `GET /api/v1/products`: Lấy danh sách sản phẩm, phân trang tự động (`page`, `limit`), lọc theo `category`, `minPrice`, `maxPrice`, tìm kiếm `search` và sắp xếp (`price_asc`, `price_desc`, `rating`).
  - `GET /api/v1/products/:id`: Xem chi tiết sản phẩm theo ID hoặc slug.
  - `POST`, `PUT`, `DELETE /api/v1/products`: Thêm/sửa/xóa sản phẩm dành cho Admin/Vendor, tự động đồng bộ tồn kho sang `Inventory.model.js`.
- **Quản Lý Danh Mục Độc Lập (Category Management)**:
  - Schema `Category.model.js` với hook tự động chuẩn hóa slug tiếng Việt (xử lý ký tự đặc biệt đ/Đ).
  - API `GET`, `POST`, `PUT`, `DELETE /api/v1/categories` cho phép Admin quản lý danh mục sản phẩm toàn sàn.
- **Giỏ Hàng Trực Tuyến (Online Cart API)**:
  - `GET /api/v1/cart`: Lấy giỏ hàng của user với `recalculateTotal` tự động tính tổng tiền.
  - `POST /api/v1/cart/items`: Thêm sản phẩm vào giỏ, kiểm tra tính khả dụng từ `Inventory`.
  - `PUT /api/v1/cart/items/:id`: Cập nhật số lượng sản phẩm.
  - `DELETE /api/v1/cart/items/:id` & `DELETE /api/v1/cart`: Xóa từng món hoặc làm trống giỏ hàng.
- **Khởi Tạo Dữ Liệu Tự Động (Database Seeding)**:
  - Chạy `npm run seed` trong thư mục `server/` để tự động dọn sạch và nạp 3 tài khoản mẫu, 5 danh mục, 6 sản phẩm, tồn kho theo SKU và 3 mã giảm giá vào MongoDB.

---

### Đặt hàng, mã giảm giá và hóa đơn QR HMAC

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

### Thanh toán VNPay, Socket.io và audit log

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

### Kiểm thử tải, PWA offline và đánh giá sản phẩm

- **Chống Race-Condition Flash Sale & Bộ Công Cụ Stress Test**:
  - Đảm bảo tính bất biến: Tồn kho không bao giờ bị âm ngay cả khi hàng trăm request gửi đến cùng lúc.
  - Script K6: `server/scripts/stress-test-checkout.js` mô phỏng 200 Virtual Users tranh mua 10 món hàng Flash Sale.
  - Native Node.js Stress Runner: `server/scripts/stress-test-node.js` chạy kiểm thử tải tức thì không phụ thuộc môi trường ngoài qua lệnh `npm run test:stress`.
  - Bộ test tương tranh Jest `server/tests/concurrency.test.js`: Kiểm thử 50 request song song, kiểm thử chống sửa giá (anti-tampering), kiểm thử chạy đua áp mã giảm giá 1 lần (concurrent coupon spam).
- **PWA Offline Support (Storefront)**:
  - Web App Manifest: `client-storefront/public/manifest.json`.
  - Service Worker `storefront-pwa-shell-v3`: precaches the app shell and hashed build assets, uses network-first navigation with an offline shell fallback, caches only public GET product APIs without an Authorization header, and limits other runtime caching to static assets. Old storefront PWA caches are removed when the new worker activates.
  - The manifest references the storefront SVG icons in `client-storefront/public/icons/`.
  - IndexedDB v3 stores public product list/detail snapshots and per-guest/per-account cart snapshots. Cached product content is labeled as potentially stale; queued cart edits are reconciled with the server before being cleared.
  - External product images are cached separately with a 100-image cap. Offline Alert UI: `OfflineBanner.jsx` reports connectivity and resumes supported cart/order synchronization when online; checkout itself remains online-only.
  - Hàng đợi đồng bộ Backend: `POST /api/v1/sync/offline-orders` (chống trùng lặp qua `clientOrderId`) và `POST /api/v1/sync/offline-cart` (protected, merges quantities by SKU).
  - Storefront mobile controls provide keyboard-visible focus, Escape-dismissable dialogs with focus trapping/restoration, and larger touch targets for navigation, filters, and cart actions.
- **Hệ Thống Đánh Giá & Phản Hồi (Reviews & Ratings)**:
  - Schema `Review.model.js`: Đánh giá 1-5 sao, nhận xét, cờ `isVerifiedPurchase`, trạng thái `pending`, `approved`, `rejected`.
  - Ràng buộc Mua hàng thực tế (**Verified Purchase Constraint**): Chặn người chưa mua hoặc đơn chưa hoàn thành bằng HTTP 403.
  - Tự động tái tính toán điểm trung bình: Cập nhật trường `ratingAverage` và `reviewCount` trên `Product.model.js`.
  - Admin UI: Trang `client-admin/src/pages/Reviews.jsx` (Ant Design Table, duyệt/ẩn đánh giá, huy hiệu Verified Purchase).
  - Storefront UI: Component `ProductReviews.jsx` (Tổng quan sao, thanh phân bố tỷ lệ sao, bình luận đã duyệt, form gửi đánh giá sao tương tác).

---

### Bảo mật và giới hạn tần suất

- **Bộ Lọc Giới Hạn Tần Suất (Rate Limiting Engine — `rateLimiter.js`)**:
  - `apiRateLimiter`: Giới hạn toàn sàn cho API endpoints (mặc định 300 request / 15 phút), chống DDoS và thu thập dữ liệu (scraping).
  - `authRateLimiter`: Giới hạn nghiêm ngặt cho luồng xác thực `/auth/login` và `/auth/register` (tối đa 10 lần thử / 15 phút), ngăn chặn tấn công dò quét mật khẩu (Brute-force).
  - `checkoutRateLimiter`: Giới hạn cho API đặt hàng `/orders/checkout` (tối đa 20 đơn / 10 phút), ngăn chặn bot spam đơn ảo.
  - Chuẩn HTTP Headers: Gửi đầy đủ `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` và `Retry-After` khi bị chặn mã HTTP `429 Too Many Requests`.
- **Phòng Thủ Chống NoSQL Injection (`security.middleware.js`)**:
  - Quét đệ quy toàn bộ `req.body`, `req.query`, `req.params`.
  - Triệt tiêu các toán tử MongoDB độc hại (`$gt`, `$ne`, `$where`, `$regex`...) và các key chứa ký tự phân cấp `.` (dot-notation traversal).
  - Hỗ trợ chế độ phát hiện và chặn đứng trực tiếp bằng HTTP 400 Bad Request.
- **Làm Sạch Dữ Liệu Chống Tấn Công XSS (Cross-Site Scripting)**:
  - Tự động làm sạch các chuỗi chứa mã độc: loại bỏ thẻ `<script>`, URI `javascript:`, inline event handlers (`onerror=`, `onload=`, `onclick=`) và thẻ `<iframe>`.
  - Bảo toàn hoàn hảo chuỗi tiếng Việt có dấu và các ký tự hợp lệ.
- **Nâng Cấp HTTP Security Headers (Helmet Policy)**:
  - Cấu hình Content-Security-Policy (CSP) với directive `frame-ancestors 'none'`.
  - Kích hoạt `X-Frame-Options: DENY` triệt tiêu nguy cơ Clickjacking.
  - Kích hoạt `X-Content-Type-Options: nosniff` chống MIME-type sniffing.
  - Ẩn hoàn toàn header `X-Powered-By`.
- **Bảo Vệ Chống HTTP Parameter Pollution (HPP)**:
  - Chuẩn hóa query string chống gửi mảng trùng lặp gây ô nhiễm tham số xử lý ở backend.
- **API Kiểm Toán Trạng Thái Bảo Mật (Security Audit)**:
  - `GET /api/v1/security/audit`: Endpoint công khai báo cáo chi tiết các lớp phòng thủ đang hoạt động trong hệ thống.
  - `POST /api/v1/security/echo`: Endpoint kiểm tra dữ liệu sau khi đi qua các bộ lọc Sanitizer.

---

## Kiểm tra mã nguồn

Chạy kiểm thử và lint trong từng ứng dụng:

```bash
cd server
npm test
npm run lint
```

```bash
cd client-storefront
npm test
npm run lint
npm run build
```

```bash
cd client-admin
npm test
npm run lint
npm run build
```

Mở terminal riêng ở thư mục gốc dự án cho mỗi nhóm lệnh. Test và cấu hình hỗ trợ nằm trong từng ứng dụng. Trên Windows PowerShell có thể dùng `npm.cmd` nếu execution policy chặn `npm.ps1`.

---

## 🌐 Cấu Hình Và Kiểm Chứng Triển Khai Vercel

Monorepo có cấu hình cho **3 Projects riêng biệt** từ cùng repository GitHub. Các cấu hình này chưa có bằng chứng deployment thật; cần kiểm chứng REST API, database, CORS và realtime trên môi trường được chọn:

```
                  GitHub Repository (Web-E-commerce)
                   ┌──────────────┼──────────────┐
                   │              │              │
             (Root: server)  (Root: client-   (Root: client-
                   │          storefront)        admin)
                   ▼              ▼              ▼
            Vercel Project  Vercel Project  Vercel Project
               [Backend]     [Storefront]      [Admin]
```

### 📋 1. Bảng Thiết Lập 3 Projects Trên Vercel Dashboard

Khi kết nối repository GitHub vào [Vercel Dashboard](https://vercel.com), hãy nhấn **"Add New Project"** 3 lần tương ứng với 3 thư mục:

| Dự án Vercel | Root Directory | Framework Preset | Build Command | Output Directory | File cấu hình |
|---|---|---|---|---|---|
| **1. Client Storefront** | `client-storefront` | `Vite` | `npm run build:deploy` | `dist` | `client-storefront/vercel.json` |
| **2. Client Admin** | `client-admin` | `Vite` | `npm run build:deploy` | `dist` | `client-admin/vercel.json` |
| **3. Server Backend** | `server` | `Other` | *(Để trống)* | *(Để trống)* | `server/vercel.json` & `server/api/index.js` |

> [!NOTE]
> Hai file `client-storefront/vercel.json` và `client-admin/vercel.json` đã được cài đặt sẵn quy tắc rewrite SPA:
> `{"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]}` giúp người dùng khi F5 hoặc truy cập đường dẫn con không bị lỗi HTTP 404.

---

### 🔑 2. Cấu Hình Biến Môi Trường (Environment Variables) Trên Vercel

Cấu hình trong mục **Settings → Environment Variables** của từng project trên Vercel:

#### A. Project `client-storefront`:
* `VITE_API_BASE_URL`: Điền URL domain Vercel của Backend (Ví dụ: `https://ecommerce-server-xxx.vercel.app/api/v1`)

#### B. Project `client-admin`:
* `VITE_API_BASE_URL`: Điền URL domain Vercel của Backend (Ví dụ: `https://ecommerce-server-xxx.vercel.app/api/v1`)

#### C. Project `server`:
* `NODE_ENV`: `production`
* `MONGO_URI`: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/ecommerce_prod?retryWrites=true&w=majority`
* `JWT_SECRET`: Khóa bí mật ký Access Token (chuỗi ngẫu nhiên dài và bảo mật)
* `JWT_REFRESH_SECRET`: Khóa bí mật ký Refresh Token
* `CLIENT_URL`: URL Vercel của Storefront (để cấp phép CORS cho khách hàng)
* `ADMIN_URL`: URL Vercel của Admin Dashboard (để cấp phép CORS cho quản trị viên)
* `HMAC_SECRET`: Khóa bí mật sinh mã QR tra cứu đơn hàng
* *(Tùy chọn)*: `CLOUDINARY_*`, `SMTP_*`, `VNP_*` theo mẫu tại [`server/.env.example`](./server/.env.example).

---

### ⚠️ 3. LƯU Ý QUAN TRỌNG DÀNH CHO CÁC THÀNH VIÊN TRONG NHÓM

1. **Về Tài Khoản MongoDB Atlas**:
   * **Tạm thời KHÔNG đụng vào tài khoản MongoDB Atlas thật** và **KHÔNG commit thông tin đăng nhập/mật khẩu lên Git**.
   * Việc kết nối MongoDB Atlas chỉ thực hiện bằng cách dán biến `MONGO_URI` trực tiếp vào bảng Environment Variables trên Vercel ở bước deploy cuối cùng.
2. **Về Quy Trình Git Flow (Thống nhất của nhóm)**:
   * **Bước 1**: Mỗi thành viên tiếp tục làm việc và hoàn tất đầu việc trên nhánh riêng của mình (`kphat`, `thinh`, `NBinh`, `DQVinh`, `tphat`).
   * **Bước 2**: Khi các thành viên hoàn thành đến Tuần 8, mở Pull Request **merge toàn bộ vào nhánh `develop`**.
   * **Bước 3**: Chạy lệnh kiểm thử toàn diện trên nhánh `develop`:
     ```bash
     cd server
     npm test
     ```
     Kiểm tra kết quả và xử lý lỗi trước khi merge.
   * **Bước 4**: Mở Pull Request từ `develop` sang `main` để kích hoạt Vercel tự động deploy bản chính thức.
3. **Về Cơ Chế Tái Sử Dụng Kết Nối MongoDB Serverless**:
   * File `server/src/config/db.js` tái sử dụng kết nối đã mở và chờ cùng một promise khi các request đồng thời kết nối. `server/api/index.js` trả HTTP503 nếu database chưa kết nối được, trước khi chuyển request vào Express.
4. **Về Tính Năng Socket.io Real-time Trên Vercel**:
   * Handler `server/api/index.js` hiện phục vụ Express REST; Socket.io được khởi tạo trong `server/src/server.js`. Cấu hình handler REST không tự cung cấp endpoint Socket.io hoặc polling fallback.
   * Vercel hiện có WebSocket beta, nhưng Socket.io cần export HTTP server và cấu hình client dùng WebSocket transport; state/rooms giữa các instance cần cơ chế chia sẻ bên ngoài. Xem [tài liệu WebSockets Vercel](https://vercel.com/docs/functions/websockets). Chưa kiểm chứng kiến trúc này trên deployment thật của dự án; chạy `server.js` trên Node server vẫn là luồng realtime được kiểm thử local.


