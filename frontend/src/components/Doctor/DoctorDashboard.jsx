import React, { useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Typography, Button, TextField } from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '1.05rem' }}>
            {`${doctorData.firstName?.[0] || ''}${doctorData.lastName?.[0] || ''}`.toUpperCase()}
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 600, fontSize: '1.15rem', color: 'var(--dark-text)', lineHeight: 1.25 }}>
              Dr. {doctorData.firstName} {doctorData.lastName}
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', color: 'var(--light-text)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <MedicalServicesOutlinedIcon sx={{ fontSize: 16 }} /> {doctorData.specialty}
            </Typography>
          </Box>
        </Box>
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

      {/* Hide the doctor's own 2FA/biometric settings while a patient vault is open,
          so account-security controls aren't mixed in with the patient's file. */}
      {!unlockedPatient && (
        <SecurityCard
          isTwoFactorEnabled={doctorData?.user?.isTwoFactorEnabled}
          passkeys={doctorData?.user?.passkeys || []}
          onTwoFactorEnabled={() => setDoctorData({ ...doctorData, user: { ...doctorData.user, isTwoFactorEnabled: true } })}
          onPasskeyAdded={() => setDoctorData({
            ...doctorData,
            user: { ...doctorData.user, passkeys: [...(doctorData.user?.passkeys || []), { id: `local-${Date.now()}`, deviceType: 'platform' }] },
          })}
        />
      )}
    </>
  );
};

export default DoctorDashboard;
