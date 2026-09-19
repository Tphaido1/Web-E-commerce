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
