import React, { useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, TextField, Divider, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import PatientVault from './PatientVault';
import MinimizedVault from './MinimizedVault';
import VaultWaitingScreen from './VaultWaitingScreen';
import ConsultationHistory from './ConsultationHistory';
import SecurityCard from '../Layout/SecurityCard';

const DoctorDashboard = () => {
  const { t } = useTranslation();
  const { doctorData, setDoctorData } = useOutletContext();
  const [vaultCode, setVaultCode] = useState('');
  const [unlockedPatient, setUnlockedPatient] = useState(null);
  const [vaultToken, setVaultToken] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const abortRef = useRef(null);

  const [cnpSearch, setCnpSearch] = useState('');
  const [foundPatient, setFoundPatient] = useState(null);
  const [emergencyReason, setEmergencyReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      showToast(t('Vault Unlocked'), "success");
    } catch (error) {
      // Aborts are user-initiated (Cancel button) — no error toast needed.
      if (error.name !== 'AbortError') {
        showToast(error.message || t('Failed to connect.'), "error");
      }
    } finally {
      setIsWaiting(false);
      abortRef.current = null;
    }
  };

  const handleCancelWait = () => {
    if (abortRef.current) abortRef.current.abort();
    showToast(t('Request cancelled.'), "info");
  };

  const resetVault = () => {
    setUnlockedPatient(null);
    setVaultToken(null);
    setPagination(null);
    setVaultCode('');
    setMinimized(false);
  };

  // Lock from the minimized card: notify the patient that viewing ended (same as
  // "Lock Vault & Exit" inside the vault), then clear the session.
  const handleLockVault = async () => {
    try {
      await fetchWithAuth('/api/doctor/lock-vault', { method: 'POST', body: JSON.stringify({ vaultToken }) });
    } catch { /* non-critical */ }
    resetVault();
  };

  const handleCnpSearch = async (e) => {
    e.preventDefault();
    setFoundPatient(null);
    try {
      const data = await fetchWithAuth(`/api/doctor/patient-search?cnp=${encodeURIComponent(cnpSearch)}`);
      setFoundPatient(data.patient);
    } catch (error) {
      showToast(error.message || t('Patient not found.'), "error");
    }
  };

  const handleEmergencyAccess = async () => {
    setConfirmOpen(false);
    try {
      const data = await fetchWithAuth('/api/doctor/emergency-access', {
        method: 'POST',
        body: JSON.stringify({ patientId: foundPatient.id, reason: emergencyReason }),
      });
      setUnlockedPatient(data.patient);
      setVaultToken(data.vaultToken);
      setPagination(null);
      setCnpSearch('');
      setFoundPatient(null);
      setEmergencyReason('');
      showToast(t('Emergency access granted. Patient has been notified.'), "warning");
    } catch (error) {
      showToast(error.message || t('Emergency access failed.'), "error");
    }
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
          <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1, color: '#2d3436' }}>{t('Unlock Patient File')}</Typography>
          <Typography sx={{ color: '#636e72', mb: 3, maxWidth: 380, mx: 'auto' }}>
            {t("Enter the 6-digit access code provided by the patient. They'll be asked to approve and select which records to share.")}
          </Typography>

          <Box component="form" onSubmit={handleUnlockVault} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <TextField
              label={t('6-Digit Vault Code')}
              variant="outlined"
              value={vaultCode}
              onChange={(e) => setVaultCode(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 6, style: { fontSize: '1.5em', letterSpacing: '8px', textAlign: 'center' } } }}
              required
            />
            <Button type="submit" variant="contained" size="large" sx={{ backgroundColor: '#5b4fe6', px: 4 }}>
              {t('Request Access')}
            </Button>
          </Box>

          <Divider sx={{ my: 4 }}>
            <Typography variant="caption" sx={{ color: 'var(--light-text)', px: 1 }}>{t('Emergency Access')}</Typography>
          </Divider>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, justifyContent: 'center' }}>
            <WarningAmberIcon sx={{ color: '#e17055' }} />
            <Typography variant="body2" sx={{ color: '#e17055', fontWeight: 600 }}>
              {t('Break-the-glass — patient consent bypassed')}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: 'var(--light-text)', mb: 2, maxWidth: 380, mx: 'auto' }}>
            {t('Use only when the patient is unable to provide consent. All access is permanently logged and the patient is notified by email.')}
          </Typography>

          <Box component="form" onSubmit={handleCnpSearch} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <TextField
              label={t('Patient CNP')}
              variant="outlined"
              value={cnpSearch}
              onChange={(e) => { setCnpSearch(e.target.value); setFoundPatient(null); }}
              slotProps={{ htmlInput: { maxLength: 13, inputMode: 'numeric' } }}
              required
            />
            <Button type="submit" variant="outlined" color="warning">
              {t('Search Patient')}
            </Button>
          </Box>

          {foundPatient && (
            <Box sx={{ mt: 2, p: 2, borderRadius: 2, backgroundColor: '#fff3f3', border: '1px solid #fab1a0', maxWidth: 380, mx: 'auto' }}>
              <Typography sx={{ fontWeight: 600, color: '#2d3436' }}>
                {foundPatient.firstName} {foundPatient.lastName}
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--light-text)', mb: 2 }}>
                {t('DOB:')} {new Date(foundPatient.dateOfBirth).toLocaleDateString('ro-RO')}
              </Typography>
              <TextField
                label={t('Reason for emergency access')}
                multiline
                rows={2}
                fullWidth
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Button
                variant="contained"
                color="error"
                fullWidth
                disabled={emergencyReason.trim().length < 10}
                onClick={() => setConfirmOpen(true)}
              >
                {t('Override & Access Vault')}
              </Button>
            </Box>
          )}

          <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
            <DialogTitle sx={{ color: '#d63031' }}>{t('Confirm Emergency Access')}</DialogTitle>
            <DialogContent>
              <DialogContentText>
                {t('You are about to access the medical records of {{name}} without their consent. This action is permanently logged and the patient will be notified immediately by email.', { name: `${foundPatient?.firstName || ''} ${foundPatient?.lastName || ''}`.trim() })}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmOpen(false)}>{t('Cancel')}</Button>
              <Button onClick={handleEmergencyAccess} color="error" variant="contained">{t('Confirm Override')}</Button>
            </DialogActions>
          </Dialog>
        </div>
      ) : minimized ? (
        <MinimizedVault
          patient={unlockedPatient}
          vaultToken={vaultToken}
          onResume={() => setMinimized(false)}
          onLock={handleLockVault}
        />
      ) : (
        <PatientVault
          doctorData={doctorData}
          patient={unlockedPatient}
          vaultToken={vaultToken}
          pagination={pagination}
          onClose={resetVault}
          onMinimize={() => setMinimized(true)}
        />
      )}

      {/* Hide the doctor's own 2FA/biometric settings while a patient vault is
          actively open. When the vault is minimized the doctor is back on their
          dashboard, so the security controls return alongside the resume card. */}
      {(!unlockedPatient || minimized) && <ConsultationHistory />}

      {(!unlockedPatient || minimized) && (
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
