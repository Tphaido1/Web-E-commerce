import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { authService } from '../services/authService.js';

function ProtectedRoute() {
  const location = useLocation();
  return authService.isAuthenticated() ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export default ProtectedRoute;
