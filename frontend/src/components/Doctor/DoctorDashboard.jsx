import React, { useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Typography, Button, TextField } from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import PatientVault from './PatientVault';
import VaultWaitingScreen from './VaultWaitingScreen';
import SecurityCard from '../Layout/SecurityCard';

const DoctorDashboard = () => {
  const { doctorData, setDoctorData } = useOutletContext();
  const [vaultCode, setVaultCode] = useState('');
  const [unlockedPatient, setUnlockedPatient] = useState(null);
  const [vaultToken, setVaultToken] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const abortRef = useRef(null);

  const showToast = useToast();

  const handleUnlockVault = async (e) => {
    e.preventDefault();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsWaiting(true);
    try {
      const data = await fetchWithAuth('/api/doctor/access-vault', {
        method: 'POST',
        body: JSON.stringify({ code: vaultCode }),
        signal: controller.signal,
      });
      setUnlockedPatient(data.patient);
      setVaultToken(data.vaultToken);
      setPagination(data.pagination);
      showToast("Vault Unlocked", "success");
    } catch (error) {
      // Aborts are user-initiated (Cancel button) — no error toast needed.
      if (error.name !== 'AbortError') {
        showToast(error.message || "Failed to connect.", "error");
      }
    } finally {
      setIsWaiting(false);
      abortRef.current = null;
    }
  };

  const handleCancelWait = () => {
    if (abortRef.current) abortRef.current.abort();
    showToast("Request cancelled.", "info");
  };

  const resetVault = () => {
    setUnlockedPatient(null);
    setVaultToken(null);
    setPagination(null);
    setVaultCode('');
  };

  return (
    <>
      <div className="card card--profile-doctor">
        <h3>Physician Profile</h3>
        <p><strong>Dr. {doctorData.firstName} {doctorData.lastName}</strong> | {doctorData.specialty}</p>
      </div>

      {isWaiting ? (
        <VaultWaitingScreen onCancel={handleCancelWait} />
      ) : !unlockedPatient ? (
        <div className="card card--centered" style={{ marginTop: '30px' }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(91, 79, 230, 0.1)',
          }}>
            <LockOpenIcon sx={{ fontSize: 32, color: '#5b4fe6' }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1, color: '#2d3436' }}>Unlock Patient File</Typography>
          <Typography sx={{ color: '#636e72', mb: 3, maxWidth: 380, mx: 'auto' }}>
            Enter the 6-digit access code provided by the patient. They'll be asked to
            approve and select which records to share.
          </Typography>

          <Box component="form" onSubmit={handleUnlockVault} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <TextField
              label="6-Digit Vault Code"
              variant="outlined"
              value={vaultCode}
              onChange={(e) => setVaultCode(e.target.value)}
              inputProps={{ maxLength: 6, style: { fontSize: '1.5em', letterSpacing: '8px', textAlign: 'center' } }}
              required
            />
            <Button type="submit" variant="contained" size="large" sx={{ backgroundColor: '#5b4fe6', px: 4 }}>
              Request Access
            </Button>
          </Box>
        </div>
      ) : (
        <PatientVault
          doctorData={doctorData}
          patient={unlockedPatient}
          vaultToken={vaultToken}
          pagination={pagination}
          onClose={resetVault}
        />
      )}

      <SecurityCard
        isTwoFactorEnabled={doctorData?.user?.isTwoFactorEnabled}
        passkeys={doctorData?.user?.passkeys || []}
        onTwoFactorEnabled={() => setDoctorData({ ...doctorData, user: { ...doctorData.user, isTwoFactorEnabled: true } })}
        onPasskeyAdded={() => setDoctorData({
          ...doctorData,
          user: { ...doctorData.user, passkeys: [...(doctorData.user?.passkeys || []), { id: `local-${Date.now()}`, deviceType: 'platform' }] },
        })}
      />
    </>
  );
};

export default DoctorDashboard;
