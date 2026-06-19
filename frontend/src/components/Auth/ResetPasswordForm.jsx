import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Typography, Box, TextField, Button } from '@mui/material';
import { API_URL } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import PasswordChecklist from './PasswordChecklist';
import { isPasswordValid } from '../../utils/passwordRules';

const ResetPasswordForm = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const showToast = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      return showToast('Passwords do not match.', 'error');
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast('Password updated! Please sign in.', 'success');
        navigate('/login');
      } else {
        showToast(data.error || (data.details?.[0]?.message) || 'Failed to reset password.', 'error');
      }
    } catch {
      showToast('Failed to connect.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="login-branding">
        <h1>TotalMed</h1>
        <p>Secure Ephemeral Health Vault</p>
      </div>

      <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '30px' }}>
        <Typography variant="h4" sx={{ mb: 1, textAlign: 'center', fontWeight: 'bold', color: '#2d3436' }}>
          Reset password
        </Typography>

        {!token ? (
          <Box sx={{ textAlign: 'center', mt: 2 }}>
            <Typography sx={{ color: '#c0392b', mb: 3 }}>
              This reset link is invalid or incomplete. Please request a new one.
            </Typography>
            <Button component={Link} to="/forgot-password" variant="contained" sx={{ textTransform: 'none' }}>
              Request a new link
            </Button>
          </Box>
        ) : (
          <>
            <Typography sx={{ textAlign: 'center', color: '#636e72', mb: 3 }}>
              Choose a new password. It must include an uppercase and lowercase letter, a number, and a special character.
            </Typography>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="New password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} required fullWidth autoFocus
              />
              <PasswordChecklist password={password} />
              <TextField
                label="Confirm new password" type="password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} required fullWidth
              />
              <Button type="submit" variant="contained" size="large"
                disabled={submitting || !isPasswordValid(password) || password !== confirm}
                sx={{ mt: 1, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', py: 1.5, fontSize: '1.1rem', textTransform: 'none', borderRadius: '10px', '&.Mui-disabled': { background: '#c7c9d9', color: '#fff' } }}>
                {submitting ? 'Updating…' : 'Update password'}
              </Button>
            </Box>
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <Button component={Link} to="/login" variant="text" sx={{ textTransform: 'none', color: '#636e72' }}>
                Back to sign in
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordForm;
