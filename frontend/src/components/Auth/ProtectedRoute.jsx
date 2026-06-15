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
    // If logged in but wrong role, redirect to appropriate dashboard
    return <Navigate to={role === 'PATIENT' ? '/patient' : '/doctor'} replace />;
  }

  return children;
};

export default ProtectedRoute;
