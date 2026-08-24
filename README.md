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

Import file [`postman_collection.json`](./postman_collection.json) vào Postman (File → Import). Collection đã bao gồm biến `{{baseUrl}}` trỏ tới `http://localhost:5000/api/v1` và 2 mẫu request:

- `GET /healthcheck`
- `POST /auth/login`

## 🌳 Quy ước Git Branch (đề xuất cho nhóm 5 người)

- `main`: code ổn định, đã review
- `develop`: nhánh tích hợp chung
- `feature/<ten-thanh-vien>-<chuc-nang>`: mỗi thành viên làm việc trên nhánh riêng, VD: `feature/an-product-crud`

## 📌 Việc cần làm ở Tuần 2 (gợi ý phân công)

- Thiết kế Schema Mongoose cho `models/` (User, Product, Order, Category...)
- Triển khai logic thật cho `auth.routes.js` (hash password bằng `bcryptjs`, ký token bằng `jsonwebtoken`)
- Viết middleware `auth.middleware.js` (xác thực JWT, phân quyền role)
- Xây dựng Controller + Service cho module Product (CRUD)
- Thiết kế layout chính (Header, Footer, Sidebar) cho 2 Frontend
