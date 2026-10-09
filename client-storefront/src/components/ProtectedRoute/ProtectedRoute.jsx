import { Fragment, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuthSession, subscribeAuthSession } from '../../services/authSession.js';

function ProtectedRoute({ children }) {
  const location = useLocation();
  const [session, setSession] = useState(getAuthSession);

  useEffect(() => subscribeAuthSession(setSession), []);

  if (!session?.accessToken) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        }}
      />
    );
  }

  return <Fragment key={session.sessionId}>{children}</Fragment>;
}

export default ProtectedRoute;
