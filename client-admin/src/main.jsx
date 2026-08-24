import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* ConfigProvider: cấu hình ngôn ngữ Tiếng Việt mặc định cho toàn bộ component Ant Design */}
    <ConfigProvider locale={viVN}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);
