import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Box, Tabs, Tab, Skeleton, Typography } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../Layout/AppHeader';
import AuthRequestDialog from './AuthRequestDialog';

const PatientLayout = () => {
  const [patientData, setPatientData] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  
  const { logout, authRequest, setAuthRequest, socket } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchWithAuth('/api/patient/dashboard')
      .then(data => {
        setPatientData(data);
        setPagination(data.pagination);
      })
      .catch(() => logout());
  }, [logout]);

  const fetchMoreRecords = async () => {
    if (!pagination || !pagination.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = pagination.page + 1;
      const data = await fetchWithAuth(`/api/patient/dashboard?page=${nextPage}&limit=${pagination.limit}`);
      
      setPatientData(prev => ({
        ...prev,
        medicalRecords: [...prev.medicalRecords, ...data.medicalRecords]
      }));
      setPagination(data.pagination);
    } catch (error) {
      console.error("Failed to load more records", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (socket) {
      const handleVaultUpdated = (data) => {
        setPatientData(prev => prev ? { 
          ...prev, 
          medicalRecords: [data.newRecord, ...prev.medicalRecords],
          accessCode: null
        } : prev);
        navigate('/patient/history');
      };
      socket.on('vault-updated', handleVaultUpdated);
      return () => {
        socket.off('vault-updated', handleVaultUpdated);
      };
    }
  }, [socket, navigate]);

  if (!patientData) {
    return (
      <div className="container">
        <AppHeader title="TotalMed Patient Portal" />
        <Box sx={{ width: '100%', mt: 3 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={currentTab} textColor="primary" indicatorColor="primary">
              <Tab label="Dashboard & Vault Key" sx={{ fontWeight: 'bold' }} />
              <Tab label="Medical History" sx={{ fontWeight: 'bold' }} />
            </Tabs>
          </Box>
          <div className="card" style={{ marginBottom: '20px' }}>
            <Skeleton variant="text" sx={{ fontSize: '2rem', mb: 1, width: '60%' }} />
            <Skeleton variant="text" sx={{ fontSize: '1rem', width: '40%' }} />
          </div>
          <div className="card">
            <Typography variant="h5" sx={{ mb: 2 }}><Skeleton width="30%" /></Typography>
            <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2 }} />
          </div>
        </Box>
      </div>
    );
  }

  const currentTab = location.pathname.includes('/history') ? 1 : 0;

  const handleTabChange = (event, newValue) => {
    if (newValue === 0) navigate('/patient');
    if (newValue === 1) navigate('/patient/history');
  };

  return (
    <div className="container">
      <AppHeader title="TotalMed Patient Portal" />
      
      <Box sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={currentTab} onChange={handleTabChange} textColor="primary" indicatorColor="primary">
            <Tab label="Dashboard & Vault Key" sx={{ fontWeight: 'bold' }} />
            <Tab label="Medical History" sx={{ fontWeight: 'bold' }} />
          </Tabs>
        </Box>

        <Outlet context={{ patientData, setPatientData, pagination, fetchMoreRecords, loadingMore }} />
      </Box>

      {authRequest && (
        <AuthRequestDialog 
          authRequest={authRequest} 
          patientData={patientData}
          onClose={() => setAuthRequest(null)}
          socket={socket}
        />
      )}
    </div>
  );
};

export default PatientLayout;
