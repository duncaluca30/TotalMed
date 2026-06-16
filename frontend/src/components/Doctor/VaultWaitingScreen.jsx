import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';

// Mirrors the server-side approval timeout in doctor.routes.js (30s).
const TIMEOUT_SECONDS = 30;

const VaultWaitingScreen = ({ onCancel }) => {
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const progress = (secondsLeft / TIMEOUT_SECONDS) * 100;

  return (
    <div className="card card--vault" style={{ marginTop: '30px' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 5, px: 2 }}>
        <Box sx={{ position: 'relative', display: 'inline-flex', mb: 3 }}>
          <CircularProgress
            variant="determinate"
            value={progress}
            size={130}
            thickness={2.5}
            sx={{ color: 'var(--success-teal)' }}
          />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
            <Typography sx={{ fontSize: '2.2em', lineHeight: 1 }}>🔐</Typography>
            <Typography sx={{ fontSize: '0.85em', fontWeight: 700, color: 'var(--light-text)', mt: 0.5 }}>
              {secondsLeft}s
            </Typography>
          </Box>
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--dark-text)', mb: 1 }}>
          Waiting for patient approval
        </Typography>
        <Typography sx={{ color: 'var(--light-text)', maxWidth: 420, mb: 1 }}>
          The patient has been notified and is reviewing your request — choosing exactly
          which records to share with you.
        </Typography>
        <Typography sx={{ color: 'var(--light-text)', fontSize: '0.85em', fontStyle: 'italic', mb: 4 }}>
          This request expires automatically in {secondsLeft} second{secondsLeft === 1 ? '' : 's'}.
        </Typography>

        <Button onClick={onCancel} variant="outlined" color="error" size="small">
          Cancel Request
        </Button>
      </Box>
    </div>
  );
};

export default VaultWaitingScreen;
