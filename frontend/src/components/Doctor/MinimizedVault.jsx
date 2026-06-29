import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button } from '@mui/material';
import LockClockIcon from '@mui/icons-material/LockClock';
import VisibilityIcon from '@mui/icons-material/Visibility';

function tokenExpMs(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function formatRemaining(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const MinimizedVault = ({ patient, vaultToken, onResume, onLock }) => {
  const { t } = useTranslation();
  const expMs = tokenExpMs(vaultToken);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expMs) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expMs]);

  const secs = expMs ? Math.max(0, Math.round((expMs - now) / 1000)) : null;
  const expired = secs === 0;

  useEffect(() => {
    if (expired) onLock();
  }, [expired, onLock]);

  return (
    <div className="card card--centered" style={{ marginTop: '30px' }}>
      <Box sx={{
        width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0, 184, 148, 0.1)',
      }}>
        <LockClockIcon sx={{ fontSize: 32, color: '#00b894' }} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#2d3436' }}>{t('Vault minimized')}</Typography>
      <Typography sx={{ fontWeight: 600, color: 'var(--dark-text)', mt: 0.5 }}>
        {patient.firstName} {patient.lastName}
      </Typography>
      <Typography sx={{ color: '#636e72', mb: 3 }}>
        {secs !== null
          ? t('Access is still active — expires in {{time}}. Resume anytime without a new code.', { time: formatRemaining(secs) })
          : t('Access is still active. Resume anytime without a new code.')}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button onClick={onResume} variant="contained" startIcon={<VisibilityIcon />} sx={{ backgroundColor: '#00b894' }}>
          {t('Resume vault')}
        </Button>
        <Button onClick={onLock} variant="outlined" color="error">
          {t('Lock Vault & Exit')}
        </Button>
      </Box>
    </div>
  );
};

export default MinimizedVault;
