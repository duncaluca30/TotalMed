import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography, Box, TextField, Button } from '@mui/material';
import { API_URL } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import LanguageSwitcher from '../Layout/LanguageSwitcher';

const ForgotPasswordForm = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const showToast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      // The endpoint always succeeds (it never reveals whether the email exists).
      if (response.ok) {
        setSent(true);
      } else {
        showToast(data.error || t('Something went wrong.'), 'error');
      }
    } catch {
      showToast(t('Failed to connect.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <LanguageSwitcher />
      </Box>
      <div className="login-branding">
        <h1>TotalMed</h1>
        <p>{t('Secure Ephemeral Health Vault')}</p>
      </div>

      <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '30px' }}>
        <Typography variant="h4" sx={{ mb: 1, textAlign: 'center', fontWeight: 'bold', color: '#2d3436' }}>
          {t('Forgot password')}
        </Typography>

        {sent ? (
          <Box sx={{ textAlign: 'center', mt: 2 }}>
            <Typography sx={{ color: '#2d3436', mb: 3 }}>
              {t('If an account exists for')} <strong>{email}</strong>{t(", we've sent a password reset link. Check your inbox (and spam) — the link expires in 30 minutes.")}
            </Typography>
            <Button component={Link} to="/login" variant="contained" sx={{ textTransform: 'none' }}>
              {t('Back to sign in')}
            </Button>
          </Box>
        ) : (
          <>
            <Typography sx={{ textAlign: 'center', color: '#636e72', mb: 3 }}>
              {t("Enter your email and we'll send you a link to reset your password.")}
            </Typography>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label={t('Email Address')} type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required fullWidth autoFocus
              />
              <Button type="submit" variant="contained" size="large" disabled={submitting}
                sx={{ mt: 1, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', py: 1.5, fontSize: '1.1rem', textTransform: 'none', borderRadius: '10px' }}>
                {submitting ? t('Sending…') : t('Send reset link')}
              </Button>
            </Box>
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <Button component={Link} to="/login" variant="text" sx={{ textTransform: 'none', color: '#636e72' }}>
                {t('Back to sign in')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
