import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import AppHeader from '../Layout/AppHeader';
import AuthRequestDialog from './AuthRequestDialog';

const PatientLayout = () => {
  const [patientData, setPatientData] = useState(null);
  const { logout, authRequest, setAuthRequest, socket } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchWithAuth('/api/patient/dashboard')
      .then(data => setPatientData(data))
      .catch(() => logout());
  }, [logout]);

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

  if (!patientData) return <div className="container"><p>Loading your secure medical records...</p></div>;

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

        <Outlet context={{ patientData, setPatientData }} />
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
