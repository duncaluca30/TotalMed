import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography, Box, TextField, Button, Tabs, Tab } from '@mui/material';
import { startAuthentication } from '@simplewebauthn/browser';
import { API_URL, setCsrfToken } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import useDragScroll from '../../hooks/useDragScroll';
import LanguageSwitcher from '../Layout/LanguageSwitcher';

const LoginForm = () => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [requires2FA, setRequires2FA] = useState(false);
  const [savedUserId, setSavedUserId] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [available2FAMethods, setAvailable2FAMethods] = useState(['EMAIL']);
  const [selected2FAMethod, setSelected2FAMethod] = useState('EMAIL');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  const { login } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  const tabsRef = useDragScroll('.MuiTabs-scroller', [requires2FA, available2FAMethods.length]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    showToast(t('Verifying credentials...'), 'info');
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: formData.email, password: formData.password })
      });
      const data = await response.json();

      if (!response.ok) {

        setNeedsVerification(response.status === 403 && /verify/i.test(data.error || ''));
        return showToast(data.error, 'error');
      }
      setNeedsVerification(false);

      if (data.requires2FA) {
        setSavedUserId(data.userId);
        setRequires2FA(true);
        setAvailable2FAMethods(data.methods);

        const defaultMethod = data.methods.includes('APP') ? 'APP' : 'EMAIL';
        setSelected2FAMethod(defaultMethod);

        if (defaultMethod === 'EMAIL') {
          handleSendEmailCode(data.userId);
        } else {
          showToast(t('Please open Google Authenticator.'), 'info');
        }
      }
    } catch (error) {
      showToast(t('Failed to connect.'), 'error');
    }
  };

  const handleResendVerification = async () => {
    try {
      await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: formData.email })
      });
      showToast(t('Confirmation email re-sent. Check your inbox.'), 'success');
    } catch {
      showToast(t('Failed to resend email.'), 'error');
    }
  };

  const handleSendEmailCode = async (uid = savedUserId) => {
    showToast(t('Dispatching secure code to your email...'), 'info');
    try {
      const response = await fetch(`${API_URL}/api/auth/2fa/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: uid })
      });
      if (response.ok) {
        setEmailCodeSent(true);
        showToast(t('Code successfully sent to your email!'), 'success');
      } else {
        const data = await response.json();
        showToast(data.error || t('Failed to send email.'), 'error');
      }
    } catch (error) {
      showToast(t('Failed to send email.'), 'error');
    }
  };

  const handle2FAValidation = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/auth/2fa/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: savedUserId, token: twoFactorToken, method: selected2FAMethod })
      });
      const data = await response.json();
      if (response.ok) {
        setCsrfToken(data.csrfToken);
        login(data.role);
        showToast(t('Identity Verified! Welcome.'), 'success');
        navigate(data.role === 'PATIENT' ? '/patient' : data.role === 'ADMIN' ? '/admin' : '/doctor');
      } else {
        showToast(data.error, 'error');
      }
    } catch (error) {
      showToast(t('Failed to validate 2FA.'), 'error');
    }
  };

  const handleBiometricLogin = async () => {
    showToast(t('Waiting for fingerprint/Face ID...'), 'info');
    try {
      const optionsRes = await fetch(`${API_URL}/api/auth/webauthn/generate-authentication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: savedUserId })
      });
      const options = await optionsRes.json();

      const authResponse = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch(`${API_URL}/api/auth/webauthn/verify-authentication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: savedUserId, response: authResponse })
      });
      const data = await verifyRes.json();

      if (verifyRes.ok) {
        setCsrfToken(data.csrfToken);
        login(data.role);
        showToast(t('Identity Verified! Welcome.'), 'success');
        navigate(data.role === 'PATIENT' ? '/patient' : data.role === 'ADMIN' ? '/admin' : '/doctor');
      } else {
        showToast(data.error, 'error');
      }
    } catch (error) {
      console.error(error);
      showToast(t('Biometric login failed or cancelled.'), 'error');
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
        <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 'bold', color: '#2d3436' }}>
          {t('Sign In')}
        </Typography>

        {requires2FA ? (
          <Box component="form" onSubmit={handle2FAValidation} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {available2FAMethods.length > 1 && (
              <Tabs
                ref={tabsRef}
                value={selected2FAMethod}
                onChange={(e, newValue) => {
                  setSelected2FAMethod(newValue);
                  if (newValue === 'EMAIL' && !emailCodeSent) handleSendEmailCode();
                }}
                variant="scrollable"
                scrollButtons={false}
                allowScrollButtonsMobile
                sx={{ mb: 2 }}
              >
                {available2FAMethods.includes('APP') && <Tab label={t('App')} value="APP" />}
                {available2FAMethods.includes('EMAIL') && <Tab label={t('Email')} value="EMAIL" />}
                {available2FAMethods.includes('BIOMETRICS') && <Tab label={t('Biometrics')} value="BIOMETRICS" />}
                {available2FAMethods.includes('BACKUP') && <Tab label={t('Backup code')} value="BACKUP" />}
              </Tabs>
            )}

            {selected2FAMethod === 'BIOMETRICS' ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography sx={{ color: '#636e72', mb: 3 }}>{t("Use your device's secure hardware to log in.")}</Typography>
                <Button
                  variant="contained"
                  onClick={handleBiometricLogin}
                  sx={{ backgroundColor: '#7c3aed', py: 1.5, fontSize: '1.1rem', width: '100%', textTransform: 'none' }}
                >
                  {t('Scan Fingerprint / Face ID')}
                </Button>
              </Box>
            ) : (
              <>
                <Typography sx={{ textAlign: 'center', color: '#2d3436', mb: 1, fontWeight: 'bold' }}>
                  {selected2FAMethod === 'APP'
                    ? t('Enter the 6-digit code from your authenticator app')
                    : selected2FAMethod === 'BACKUP'
                      ? t('Enter one of your saved backup codes')
                      : t('Enter the 6-digit code sent to your email')}
                </Typography>

                {selected2FAMethod === 'BACKUP' ? (
                  <TextField
                    label={t('Backup code')}
                    value={twoFactorToken}
                    onChange={(e) => setTwoFactorToken(e.target.value)}
                    placeholder="xxxxx-xxxxx"
                    slotProps={{ htmlInput: { maxLength: 11, style: { textAlign: 'center', fontSize: '1.2em', letterSpacing: '2px' } } }}
                    required
                    fullWidth
                    autoFocus
                  />
                ) : (
                  <TextField
                    label={t('6-Digit Code')}
                    value={twoFactorToken}
                    onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                    slotProps={{ htmlInput: { maxLength: 6, style: { letterSpacing: '8px', textAlign: 'center', fontSize: '1.5em', fontWeight: 'bold' } } }}
                    required
                    fullWidth
                    autoFocus
                  />
                )}

                <Button type="submit" variant="contained" size="large" sx={{ mt: 1, backgroundColor: '#00b894', py: 1.5, fontSize: '1.1rem', textTransform: 'none' }}>
                  {t('Verify & Access Vault')}
                </Button>

                {selected2FAMethod === 'EMAIL' && (
                   <Button onClick={() => handleSendEmailCode()} variant="text" sx={{ color: '#5b4fe6', textTransform: 'none' }}>
                     {t("Didn't receive it? Resend Email")}
                   </Button>
                )}
              </>
            )}

            <Button onClick={() => { setRequires2FA(false); setEmailCodeSent(false); }} variant="text" sx={{ color: '#636e72', textTransform: 'none' }}>
              {t('Cancel & Return to Login')}
            </Button>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label={t('Email Address')} name="email" type="email" onChange={handleChange} required fullWidth />
            <TextField label={t('Password')} name="password" type="password" onChange={handleChange} required fullWidth />
            <Button type="submit" variant="contained" size="large" sx={{ mt: 1, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 6px 16px rgba(79,70,229,0.3)', py: 1.5, fontSize: '1.1rem', textTransform: 'none', borderRadius: '10px' }}>
              {t('Secure Login')}
            </Button>
          </Box>
        )}

        {!requires2FA && needsVerification && (
          <Box sx={{ mt: 2, p: 1.5, borderRadius: '8px', backgroundColor: '#fff8e1', border: '1px solid #ffe0a3', textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.85rem', color: '#8a6d3b', mb: 0.5 }}>
              {t("Your email isn't confirmed yet.")}
            </Typography>
            <Button onClick={handleResendVerification} variant="text" sx={{ textTransform: 'none', color: '#b7791f', fontWeight: 600 }}>
              {t('Resend confirmation email')}
            </Button>
          </Box>
        )}

        {!requires2FA && (
          <div style={{ marginTop: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <Button component={Link} to="/forgot-password" variant="text" sx={{ textTransform: 'none', color: '#5b4fe6' }}>
              {t('Forgot your password?')}
            </Button>
            <Button component={Link} to="/register" variant="text" sx={{ textTransform: 'none', color: '#636e72' }}>
              {t('New patient? Sign up here')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginForm;
