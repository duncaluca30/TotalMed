import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Typography, Button, CircularProgress } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import { API_URL } from '../../services/api';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  // Derive the initial state from the token so the effect never has to call
  // setState synchronously (which would trigger cascading renders).
  const [status, setStatus] = useState(token ? 'loading' : 'error'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState(token ? '' : 'This confirmation link is invalid or incomplete.');
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
          setMessage(data.message || 'Email confirmed.');
        } else {
          setStatus('error');
          setMessage(data.error || 'Could not confirm your email.');
        }
      } catch {
        setStatus('error');
        setMessage('Failed to connect to the server.');
      }
    })();
  }, [token]);

  return (
    <div className="container">
      <div className="login-branding">
        <h1>TotalMed</h1>
        <p>Secure Ephemeral Health Vault</p>
      </div>

      <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '30px', textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography sx={{ color: '#636e72' }}>Confirming your email…</Typography>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: '#00b894', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#2d3436', mb: 1 }}>Email confirmed</Typography>
            <Typography sx={{ color: '#636e72', mb: 3 }}>{message}</Typography>
            <Button component={Link} to="/login" variant="contained" sx={{ textTransform: 'none' }}>
              Sign in
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <ErrorOutlineIcon sx={{ fontSize: 56, color: '#c0392b', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#2d3436', mb: 1 }}>Confirmation failed</Typography>
            <Typography sx={{ color: '#c0392b', mb: 3 }}>{message}</Typography>
            <Button component={Link} to="/login" variant="contained" sx={{ textTransform: 'none' }}>
              Back to sign in
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
