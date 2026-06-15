import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import AppHeader from '../Layout/AppHeader';
import PatientVault from './PatientVault';

const DoctorDashboard = () => {
  const [doctorData, setDoctorData] = useState(null);
  const [vaultCode, setVaultCode] = useState('');
  const [unlockedPatient, setUnlockedPatient] = useState(null);

  const { logout } = useAuth();
  const showToast = useToast();

  useEffect(() => {
    fetchWithAuth('/api/doctor/dashboard')
      .then(data => setDoctorData(data))
      .catch(() => logout());
  }, [logout]);

  const handleUnlockVault = async (e) => {
    e.preventDefault();
    try {
      const data = await fetchWithAuth('/api/doctor/access-vault', {
        method: 'POST',
        body: JSON.stringify({ code: vaultCode })
      });
      setUnlockedPatient(data.patient);
      showToast("Vault Unlocked", "success");
    } catch (error) { 
      showToast(error.message || "Failed to connect.", "error"); 
    }
  };

  if (!doctorData) return <div className="container"><p>Loading system...</p></div>;

  return (
    <div className="container">
      <AppHeader title="TotalMed Doctor Portal" />
      
      <div className="card" style={{ backgroundColor: '#e8f4f8', color: '#2d3436' }}>
        <h3>Physician Profile</h3>
        <p><strong>Dr. {doctorData.firstName} {doctorData.lastName}</strong> | {doctorData.specialty}</p>
      </div>

      {!unlockedPatient ? (
        <div className="card" style={{ marginTop: '30px', backgroundColor: '#ffffff', textAlign: 'center', padding: '30px' }}>
          <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1, color: '#2d3436' }}>🔑 Unlock Patient File</Typography>
          <Typography sx={{ color: '#636e72', mb: 3 }}>Enter the 6-digit access code provided by the patient.</Typography>
          
          <Box component="form" onSubmit={handleUnlockVault} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <TextField 
              label="6-Digit Vault Code" 
              variant="outlined" 
              value={vaultCode} 
              onChange={(e) => setVaultCode(e.target.value)} 
              inputProps={{ maxLength: 6, style: { fontSize: '1.5em', letterSpacing: '8px', textAlign: 'center' } }} 
              required 
            />
            <Button type="submit" variant="contained" size="large" sx={{ backgroundColor: '#0984e3', px: 4 }}>
              Access Vault
            </Button>
          </Box>
        </div>
      ) : (
        <PatientVault 
          doctorData={doctorData}
          patient={unlockedPatient} 
          vaultCode={vaultCode} 
          onClose={() => {
            setUnlockedPatient(null);
            setVaultCode('');
          }} 
        />
      )}
    </div>
  );
};

export default DoctorDashboard;
