import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { token, role } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    // If logged in but wrong role, redirect to appropriate dashboard
    return <Navigate to={role === 'PATIENT' ? '/patient' : '/doctor'} replace />;
  }

  return children;
};

export default ProtectedRoute;
