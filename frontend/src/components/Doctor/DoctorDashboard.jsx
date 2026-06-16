import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Typography, Button, TextField } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import PatientVault from './PatientVault';

const DoctorDashboard = () => {
  const { doctorData } = useOutletContext();
  const [vaultCode, setVaultCode] = useState('');
  const [unlockedPatient, setUnlockedPatient] = useState(null);
  const [vaultToken, setVaultToken] = useState(null);
  const [pagination, setPagination] = useState(null);

  const showToast = useToast();

  const handleUnlockVault = async (e) => {
    e.preventDefault();
    try {
      const data = await fetchWithAuth('/api/doctor/access-vault', {
        method: 'POST',
        body: JSON.stringify({ code: vaultCode })
      });
      setUnlockedPatient(data.patient);
      setVaultToken(data.vaultToken);
      setPagination(data.pagination);
      showToast("Vault Unlocked", "success");
    } catch (error) { 
      showToast(error.message || "Failed to connect.", "error"); 
    }
  };

  return (
    <>
      <div className="card card--profile-doctor">
        <h3>Physician Profile</h3>
        <p><strong>Dr. {doctorData.firstName} {doctorData.lastName}</strong> | {doctorData.specialty}</p>
      </div>

      {!unlockedPatient ? (
        <div className="card card--centered" style={{ marginTop: '30px' }}>
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
          vaultToken={vaultToken} 
          pagination={pagination}
          onClose={() => {
            setUnlockedPatient(null);
            setVaultToken(null);
            setPagination(null);
            setVaultCode('');
          }} 
        />
      )}
    </>
  );
};

export default DoctorDashboard;
