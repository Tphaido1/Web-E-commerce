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
      message.success('Welcome back to NOVA Commerce');
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
        <div className="login-aside-copy"><Typography.Text className="eyebrow">COMMERCE OPERATIONS</Typography.Text><Typography.Title>Make every store day count.</Typography.Title><Typography.Paragraph>One calm workspace for your catalog, categories and orders.</Typography.Paragraph></div>
        <span className="login-aside-footer">Admin workspace / 2026</span>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <Typography.Text className="eyebrow">WELCOME BACK</Typography.Text>
          <Typography.Title level={1}>Sign in to NOVA</Typography.Title>
          <Typography.Paragraph className="login-subtitle">Enter your workspace credentials to continue.</Typography.Paragraph>
          {error && <Alert message={error} type="error" showIcon className="login-alert" />}
          <Form layout="vertical" onFinish={handleSubmit} requiredMark={false}>
            <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Enter a valid email.' }]}>
              <Input size="large" prefix={<MailOutlined />} placeholder="you@company.com" />
            </Form.Item>
            <Form.Item label="Password" name="password" rules={[{ required: true, min: 6, message: 'Password must be at least 6 characters.' }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="Your password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>Sign in</Button>
          </Form>
        </div>
      </section>
    </main>
  );
}

export default Login;
