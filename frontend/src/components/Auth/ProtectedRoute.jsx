import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { isAuthenticated, role, loadingAuth } = useAuth();

  if (loadingAuth) {
    return <div className="container"><p>Checking session...</p></div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {

    const home = role === 'PATIENT' ? '/patient' : role === 'ADMIN' ? '/admin' : '/doctor';
    return <Navigate to={home} replace />;
  }

  return children;
};

export default ProtectedRoute;
