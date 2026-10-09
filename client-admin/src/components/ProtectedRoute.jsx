import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { authService } from '../services/authService.js';

function ProtectedRoute() {
  const location = useLocation();
  const [session, setSession] = useState(() => authService.getSession());

  useEffect(() => authService.subscribe(setSession), []);

  if (!authService.isAuthenticated()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname + location.search + location.hash,
          error: session
            ? 'Tài khoản này không có quyền truy cập khu vực quản trị.'
            : 'Vui lòng đăng nhập để tiếp tục.',
        }}
      />
    );
  }

  return <Outlet />;
}

export default ProtectedRoute;
