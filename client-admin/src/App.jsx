/**
 * App.jsx (Admin Dashboard)
 * ------------------------------------------------------------
 * Component gốc của ứng dụng Admin/Vendor Dashboard.
 * Ở Tuần 1 chỉ là Boilerplate xác nhận app đã dựng thành công,
 * kèm 1 component Ant Design (Result) để confirm thư viện UI hoạt động.
 * ------------------------------------------------------------
 */

import { Result } from 'antd';

function App() {
  return (
    <Result
      status="success"
      title="Admin Dashboard App Ready"
      subTitle="Ứng dụng quản trị đã khởi tạo thành công (React + Vite + Ant Design)."
    />
  );
}

export default App;
