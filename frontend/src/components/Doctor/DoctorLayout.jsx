import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Skeleton } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../Layout/AppHeader';

const DoctorLayout = () => {
  const [doctorData, setDoctorData] = useState(null);
  const { logout } = useAuth();

  useEffect(() => {
    fetchWithAuth('/api/doctor/dashboard')
      .then(data => setDoctorData(data))
      .catch(() => logout());
  }, [logout]);

  if (!doctorData) {
    return (
      <div className="container">
        <AppHeader title="TotalMed Doctor Portal" />
        <div className="card card--profile-doctor">
          <Skeleton variant="text" sx={{ fontSize: '1.5rem', width: '40%', mb: 1 }} />
          <Skeleton variant="text" sx={{ fontSize: '1rem', width: '60%' }} />
        </div>
        <div className="card card--centered" style={{ marginTop: '30px' }}>
          <Skeleton variant="text" sx={{ fontSize: '2rem', width: '50%', margin: '0 auto', mb: 2 }} />
          <Skeleton variant="rectangular" height={60} sx={{ borderRadius: 2, mb: 2 }} />
          <Skeleton variant="rectangular" height={40} width={150} sx={{ borderRadius: 2, margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <AppHeader title="TotalMed Doctor Portal" />
      <Outlet context={{ doctorData }} />
    </div>
  );
};

export default DoctorLayout;
