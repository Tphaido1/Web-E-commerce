import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Form, Input, Typography, message } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../services/authService.js';

function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const destination = location.state?.from || '/dashboard';

  const handleSubmit = async (values) => {
    setError('');
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 650));
    if (values.email.toLowerCase() === 'demo@nova.store' && values.password === 'demo123') {
      authService.login();
      message.success('Welcome back to NOVA Commerce');
      navigate(destination, { replace: true });
    } else {
      setError('Invalid demo credentials. Use demo@nova.store and demo123.');
    }
    setLoading(false);
  };

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
          <Form layout="vertical" onFinish={handleSubmit} requiredMark={false} initialValues={{ email: 'demo@nova.store' }}>
            <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Enter a valid email.' }]}>
              <Input size="large" prefix={<MailOutlined />} placeholder="you@company.com" />
            </Form.Item>
            <Form.Item label="Password" name="password" rules={[{ required: true, min: 6, message: 'Password must be at least 6 characters.' }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="Your password" />
            </Form.Item>
            <div className="login-options"><Checkbox>Remember me</Checkbox><Typography.Link>Forgot password?</Typography.Link></div>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>Sign in</Button>
          </Form>
          <Typography.Text className="demo-hint">Demo: demo@nova.store / demo123</Typography.Text>
        </div>
      </section>
    </main>
  );
}

export default Login;
