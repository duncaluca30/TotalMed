import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import { API_URL } from '../../services/api';
import i18n from '../../i18n';
import LanguageSwitcher from '../Layout/LanguageSwitcher';

const VerifyEmail = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  // Derive the initial state from the token so the effect never has to call
  // setState synchronously (which would trigger cascading renders).
  const [status, setStatus] = useState(token ? 'loading' : 'error'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState(token ? '' : i18n.t('This confirmation link is invalid or incomplete.'));
  const ran = useRef(false);

  useEffect(() => {
    if (!token) return;
    // Guard against double-invocation in React StrictMode.
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (response.ok) {
          setStatus('success');
          setMessage(data.message || i18n.t('Email confirmed.'));
        } else {
          setStatus('error');
          setMessage(data.error || i18n.t('Could not confirm your email.'));
        }
      } catch {
        setStatus('error');
        setMessage(i18n.t('Failed to connect to the server.'));
      }
    })();
  }, [token]);

  return (
    <div className="container">
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <LanguageSwitcher />
      </Box>
      <div className="login-branding">
        <h1>TotalMed</h1>
        <p>{t('Secure Ephemeral Health Vault')}</p>
      </div>

      <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '30px', textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography sx={{ color: '#636e72' }}>{t('Confirming your email…')}</Typography>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: '#00b894', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#2d3436', mb: 1 }}>{t('Email confirmed')}</Typography>
            <Typography sx={{ color: '#636e72', mb: 3 }}>{message}</Typography>
            <Button component={Link} to="/login" variant="contained" sx={{ textTransform: 'none' }}>
              {t('Sign in')}
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <ErrorOutlineIcon sx={{ fontSize: 56, color: '#c0392b', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#2d3436', mb: 1 }}>{t('Confirmation failed')}</Typography>
            <Typography sx={{ color: '#c0392b', mb: 3 }}>{message}</Typography>
            <Button component={Link} to="/login" variant="contained" sx={{ textTransform: 'none' }}>
              {t('Back to sign in')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
