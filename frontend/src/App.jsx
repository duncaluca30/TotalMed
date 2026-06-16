import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './hooks/useToast';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import LoginForm from './components/Auth/LoginForm';
import RegisterForm from './components/Auth/RegisterForm';
import PatientLayout from './components/Patient/PatientLayout';
import PatientDashboard from './components/Patient/PatientDashboard';
import MedicalHistory from './components/Patient/MedicalHistory';
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
          
          <Route 
            path="/patient" 
            element={
              <ProtectedRoute allowedRoles={['PATIENT']}>
                <PatientLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PatientDashboard />} />
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