import React, { useState, useRef, useEffect } from 'react';
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, TextField, Divider, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../context/AuthContext';
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
  const location = useLocation();
  const navigate = useNavigate();
  const { socket } = useAuth();

  const lockPreviousSession = async (token) => {
    if (!token) return;
    try {
      await fetchWithAuth('/api/doctor/lock-vault', { method: 'POST', body: JSON.stringify({ vaultToken: token }) });
    } catch { /* best-effort */ }
  };

  const requestAccess = async (code) => {
    const previousToken = vaultToken;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsWaiting(true);
    try {
      const data = await fetchWithAuth('/api/doctor/access-vault', {
        method: 'POST',
        body: JSON.stringify({ code }),
        signal: controller.signal,
      });
      await lockPreviousSession(previousToken);
      setUnlockedPatient(data.patient);
      setVaultToken(data.vaultToken);
      setPagination(data.pagination);
      setMinimized(false);
      showToast(t('Vault Unlocked'), "success");
    } catch (error) {

      if (error.name !== 'AbortError') {
        showToast(error.message || t('Failed to connect.'), "error");
      }
    } finally {
      setIsWaiting(false);
      abortRef.current = null;
    }
  };

  const handleUnlockVault = (e) => {
    e.preventDefault();
    requestAccess(vaultCode);
  };

  const autoTriedRef = useRef(false);
  useEffect(() => {
    if (autoTriedRef.current) return;
    const params = new URLSearchParams(location.search);
    const code = params.get('vaultCode');
    if (code && /^\d{6}$/.test(code) && !unlockedPatient && !isWaiting) {
      autoTriedRef.current = true;
      setVaultCode(code);
      requestAccess(code);
      navigate('/doctor', { replace: true });
    }

  }, []);

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

  useEffect(() => {
    if (!socket) return;
    const onRevoked = () => {
      if (unlockedPatient || minimized) {
        showToast(t('The patient revoked access. The vault has been closed.'), 'warning');
        resetVault();
      }
    };
    socket.on('vault-access-revoked', onRevoked);
    return () => socket.off('vault-access-revoked', onRevoked);

  }, [socket, unlockedPatient, minimized]);

  const handleLockVault = async () => {
    try {
      await fetchWithAuth('/api/doctor/lock-vault', { method: 'POST', body: JSON.stringify({ vaultToken }) });
    } catch { /* best-effort */ }
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
    const previousToken = vaultToken;
    try {
      const data = await fetchWithAuth('/api/doctor/emergency-access', {
        method: 'POST',
        body: JSON.stringify({ patientId: foundPatient.id, reason: emergencyReason }),
      });
      await lockPreviousSession(previousToken);
      setUnlockedPatient(data.patient);
      setVaultToken(data.vaultToken);
      setPagination(null);
      setMinimized(false);
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
      ) : unlockedPatient && !minimized ? (
        <PatientVault
          doctorData={doctorData}
          patient={unlockedPatient}
          vaultToken={vaultToken}
          pagination={pagination}
          onClose={resetVault}
          onMinimize={() => setMinimized(true)}
        />
      ) : (
        <>
          {minimized && (
            <MinimizedVault
              patient={unlockedPatient}
              vaultToken={vaultToken}
              onResume={() => setMinimized(false)}
              onLock={handleLockVault}
            />
          )}
          {minimized && (
            <Typography sx={{ textAlign: 'center', mt: 4, mb: -1, fontWeight: 600, color: 'var(--light-text)' }}>
              {t('Or open another patient\'s file')}
            </Typography>
          )}
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
        </>
      )}

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
