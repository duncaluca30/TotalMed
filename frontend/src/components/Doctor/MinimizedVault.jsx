import React, { useEffect, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import LockClockIcon from '@mui/icons-material/LockClock';
import VisibilityIcon from '@mui/icons-material/Visibility';

// Read the `exp` claim out of the vault JWT (without verifying — we only use it
// to display a countdown; the server still enforces expiry on every request).
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

// Compact placeholder shown when a doctor minimizes an open vault: the session
// stays alive so they can resume without a new access code, until the patient's
// chosen duration runs out (or they lock it).
const MinimizedVault = ({ patient, vaultToken, onResume, onLock }) => {
  const expMs = tokenExpMs(vaultToken);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expMs) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expMs]);

  const secs = expMs ? Math.max(0, Math.round((expMs - now) / 1000)) : null;
  const expired = secs === 0;

  // Once the grant lapses the token is useless — clean up automatically.
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
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#2d3436' }}>Vault minimized</Typography>
      <Typography sx={{ fontWeight: 600, color: 'var(--dark-text)', mt: 0.5 }}>
        {patient.firstName} {patient.lastName}
      </Typography>
      <Typography sx={{ color: '#636e72', mb: 3 }}>
        Access is still active{secs !== null ? ` — expires in ${formatRemaining(secs)}` : ''}. Resume anytime without a new code.
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button onClick={onResume} variant="contained" startIcon={<VisibilityIcon />} sx={{ backgroundColor: '#00b894' }}>
          Resume vault
        </Button>
        <Button onClick={onLock} variant="outlined" color="error">
          Lock Vault &amp; Exit
        </Button>
      </Box>
    </div>
  );
};

export default MinimizedVault;
