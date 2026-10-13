import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService.js';

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(location.state?.error || '');
  const [session, setSession] = useState(() => authService.getSession());
  const returnPath = location.state?.from;
  const destination = typeof returnPath === 'string'
    && returnPath.startsWith('/') && !returnPath.startsWith('//')
    && !/^\/login(?:[/?#]|$)/.test(returnPath)
    ? returnPath : '/dashboard';

  useEffect(() => authService.subscribe(setSession), []);

  const handleSubmit = async (credentials) => {
    setError('');
    setLoading(true);
    try {
      await authService.login(credentials);
      message.success('Chào mừng bạn quay lại NOVA Commerce');
      navigate(destination, { replace: true });
    } catch (loginError) {
      setError(
        loginError.response?.data?.message
        || loginError.message
        || 'Không thể đăng nhập. Vui lòng thử lại.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (session && authService.isAuthenticated()) {
    return <Navigate to={destination} replace />;
  }

  return (
    <main className="login-shell">
      <section className="login-aside">
        <div className="login-brand"><div className="brand-mark">N</div><strong>NOVA</strong></div>
        <div className="login-aside-copy"><Typography.Text className="eyebrow">QUẢN TRỊ HỆ THỐNG</Typography.Text><Typography.Title>Quản lý cửa hàng thông minh và hiệu quả.</Typography.Title><Typography.Paragraph>Không gian làm việc đồng bộ cho danh mục, sản phẩm và đơn hàng của bạn.</Typography.Paragraph></div>
        <span className="login-aside-footer">Không gian làm việc Admin / 2026</span>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <Typography.Text className="eyebrow">CHÀO MỪNG TRỞ LẠI</Typography.Text>
          <Typography.Title level={1}>Đăng nhập vào NOVA</Typography.Title>
          <Typography.Paragraph className="login-subtitle">Nhập thông tin tài khoản của bạn để tiếp tục.</Typography.Paragraph>
          {error && <Alert message={error} type="error" showIcon className="login-alert" />}
          <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
            <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Vui lòng nhập email hợp lệ.' }]}>
              <Input size="large" prefix={<MailOutlined />} placeholder="you@company.com" />
            </Form.Item>
            <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự.' }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="Mật khẩu của bạn" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>Đăng nhập</Button>
          </Form>
        </div>
      </section>
    </main>
  );
}

export default Login;
