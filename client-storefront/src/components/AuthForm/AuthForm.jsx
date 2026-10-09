import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login, register } from '../../services/authService.js';
import { getAuthSession, saveAuthSession, subscribeAuthSession } from '../../services/authSession.js';
import './AuthForm.css';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthForm({ mode }) {
  const isLogin = mode === 'login';
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => getAuthSession()?.remembered || false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const activeRef = useRef(true);
  const from = location.state?.from;
  const returnUrl = from?.pathname?.startsWith('/') && !from.pathname.startsWith('//')
    ? `${from.pathname}${from.search || ''}${from.hash || ''}`
    : '/';

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  useEffect(() => {
    const redirectAuthenticated = (session) => {
      if (session?.accessToken) navigate(returnUrl, { replace: true });
    };
    redirectAuthenticated(getAuthSession());
    return subscribeAuthSession(redirectAuthenticated);
  }, [navigate, returnUrl]);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError('');
    setSuccess('');
  };

  const validate = () => {
    if (!isLogin && !form.name.trim()) return 'Vui lòng nhập họ tên.';
    if (!form.email.trim()) return 'Vui lòng nhập email.';
    if (!emailPattern.test(form.email.trim())) return 'Email không đúng định dạng.';
    if (!form.password) return 'Vui lòng nhập mật khẩu.';
    if (!isLogin && form.password.length < 6) return 'Mật khẩu cần có ít nhất 6 ký tự.';
    if (!isLogin && form.password !== form.confirmPassword) return 'Mật khẩu xác nhận không khớp.';
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const initialSessionId = getAuthSession()?.sessionId || null;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError('');
    try {
      const response = isLogin
        ? await login({ email: form.email.trim(), password: form.password })
        : await register({ name: form.name, email: form.email.trim(), password: form.password });

      if (!activeRef.current || (getAuthSession()?.sessionId || null) !== initialSessionId) return;
      if (isLogin) {
        saveAuthSession(response, response?.user, remember);
        navigate(returnUrl, { replace: true });
      } else {
        setSuccess('Đăng ký thành công. Bạn có thể đăng nhập ngay.');
        setForm({ name: '', email: '', password: '', confirmPassword: '' });
      }
    } catch (submitError) {
      if (activeRef.current) setError(submitError.message);
    } finally {
      submittingRef.current = false;
      if (activeRef.current) setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <Link className="auth-brand" to="/"><span className="brand-mark">N</span> NovaMart</Link>
      <section className="auth-panel" aria-labelledby="auth-title">
        <p className="section-kicker">Chào mừng trở lại</p>
        <h1 id="auth-title">{isLogin ? 'Đăng nhập' : 'Tạo tài khoản'}</h1>
        <p className="auth-subtitle">{isLogin ? 'Tiếp tục hành trình mua sắm của bạn.' : 'Bắt đầu khám phá những lựa chọn dành riêng cho bạn.'}</p>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {!isLogin && <label>Họ tên<input name="name" value={form.name} onChange={updateField} autoComplete="name" /></label>}
          <label>Email<input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" /></label>
          <label>Mật khẩu
            <span className="password-field">
              <input name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={updateField} autoComplete={isLogin ? 'current-password' : 'new-password'} />
              <button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Ẩn' : 'Hiện'}</button>
            </span>
          </label>
          {!isLogin && <label>Xác nhận mật khẩu<input name="confirmPassword" type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={updateField} autoComplete="new-password" /></label>}
          {isLogin && <div className="auth-options"><label className="checkbox-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Ghi nhớ đăng nhập</label><a href="#forgot-password" onClick={(event) => { event.preventDefault(); setError('Tính năng khôi phục mật khẩu chưa khả dụng. Vui lòng liên hệ hỗ trợ.'); }}>Quên mật khẩu?</a></div>}
          {error && <p className="form-message error" role="alert">{error}</p>}
          {success && <p className="form-message success" role="status">{success}</p>}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang xử lý...' : isLogin ? 'Đăng nhập' : 'Đăng ký'}</button>
        </form>
        <p className="auth-switch">{isLogin ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'} <Link to={isLogin ? '/register' : '/login'} state={location.state}>{isLogin ? 'Đăng ký' : 'Đăng nhập'}</Link></p>
      </section>
    </main>
  );
}

export default AuthForm;