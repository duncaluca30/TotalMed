import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './hooks/useToast';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import LoginForm from './components/Auth/LoginForm';
import RegisterForm from './components/Auth/RegisterForm';
import ForgotPasswordForm from './components/Auth/ForgotPasswordForm';
import ResetPasswordForm from './components/Auth/ResetPasswordForm';
import PatientLayout from './components/Patient/PatientLayout';
import PatientDashboard from './components/Patient/PatientDashboard';
import MedicalHistory from './components/Patient/MedicalHistory';
import HealthProfile from './components/Patient/HealthProfile';
import DoctorLayout from './components/Doctor/DoctorLayout';
import DoctorDashboard from './components/Doctor/DoctorDashboard';
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import './App.css';

function App() {
  return (
    <GlobalErrorBoundary>
      <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/forgot-password" element={<ForgotPasswordForm />} />
          <Route path="/reset-password" element={<ResetPasswordForm />} />
          
          <Route 
            path="/patient" 
            element={
              <ProtectedRoute allowedRoles={['PATIENT']}>
                <PatientLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PatientDashboard />} />
            <Route path="health" element={<HealthProfile />} />
            <Route path="history" element={<MedicalHistory />} />
          </Route>
          
          <Route 
            path="/doctor" 
            element={
              <ProtectedRoute allowedRoles={['DOCTOR']}>
                <DoctorLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DoctorDashboard />} />
          </Route>
          
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
    </GlobalErrorBoundary>
  );
}

export default App;