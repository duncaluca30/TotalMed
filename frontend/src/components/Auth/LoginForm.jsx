import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Typography, Box, TextField, Button, Tabs, Tab } from '@mui/material';
import { startAuthentication } from '@simplewebauthn/browser';
import { API_URL } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';

const LoginForm = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [requires2FA, setRequires2FA] = useState(false);
  const [savedUserId, setSavedUserId] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [available2FAMethods, setAvailable2FAMethods] = useState(['EMAIL']);
  const [selected2FAMethod, setSelected2FAMethod] = useState('EMAIL');
  const [emailCodeSent, setEmailCodeSent] = useState(false);

  const { login } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    showToast('Verifying credentials...', 'info');
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: formData.email, password: formData.password })
      });
      const data = await response.json();
      
      if (!response.ok) return showToast(data.error, 'error');

      if (data.requires2FA) {
        setSavedUserId(data.userId);
        setRequires2FA(true);
        setAvailable2FAMethods(data.methods);
        
        const defaultMethod = data.methods.includes('APP') ? 'APP' : 'EMAIL';
        setSelected2FAMethod(defaultMethod);
        
        if (defaultMethod === 'EMAIL') {
          handleSendEmailCode(data.userId);
        } else {
          showToast("Please open Google Authenticator.", "info");
        }
      }
    } catch (error) { 
      showToast('Failed to connect.', 'error'); 
    }
  };

  const handleSendEmailCode = async (uid = savedUserId) => {
    showToast('Dispatching secure code to your email...', 'info');
    try {
      const response = await fetch(`${API_URL}/api/auth/2fa/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: uid })
      });
      if (response.ok) {
        setEmailCodeSent(true);
        showToast('Code successfully sent to your email!', 'success');
      } else {
        const data = await response.json();
        showToast(data.error || 'Failed to send email.', 'error');
      }
    } catch (error) { 
      showToast('Failed to send email.', 'error'); 
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
        login(data.role);
        showToast('Identity Verified! Welcome.', 'success');
        navigate(data.role === 'PATIENT' ? '/patient' : '/doctor');
      } else {
        showToast(data.error, 'error');
      }
    } catch (error) { 
      showToast('Failed to validate 2FA.', 'error'); 
    }
  };

  const handleBiometricLogin = async () => {
    showToast('Waiting for fingerprint/Face ID...', 'info');
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
        login(data.role);
        showToast('Identity Verified! Welcome.', 'success');
        navigate(data.role === 'PATIENT' ? '/patient' : '/doctor');
      } else {
        showToast(data.error, 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('Biometric login failed or cancelled.', 'error');
    }
  };

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#0984e3', fontSize: '2.5em', margin: 0 }}>TotalMed</h1>
        <p style={{ color: '#636e72', marginTop: '5px' }}>Secure Ephemeral Health Vault</p>
      </div>

      <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '30px' }}>
        <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 'bold', color: '#2d3436' }}>
          Sign In
        </Typography>

        {requires2FA ? (
          <Box component="form" onSubmit={handle2FAValidation} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {available2FAMethods.length > 1 && (
              <Tabs 
                value={selected2FAMethod} 
                onChange={(e, newValue) => {
                  setSelected2FAMethod(newValue);
                  if (newValue === 'EMAIL' && !emailCodeSent) handleSendEmailCode();
                }} 
                centered 
                sx={{ mb: 2 }}
              >
                {available2FAMethods.includes('APP') && <Tab label="App" value="APP" />}
                {available2FAMethods.includes('EMAIL') && <Tab label="Email" value="EMAIL" />}
                {available2FAMethods.includes('BIOMETRICS') && <Tab label="Biometrics" value="BIOMETRICS" />}
              </Tabs>
            )}

            {selected2FAMethod === 'BIOMETRICS' ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography sx={{ color: '#636e72', mb: 3 }}>Use your device's secure hardware to log in.</Typography>
                <Button 
                  variant="contained" 
                  onClick={handleBiometricLogin} 
                  sx={{ backgroundColor: '#6c5ce7', py: 1.5, fontSize: '1.1rem', width: '100%', textTransform: 'none' }}
                >
                  👆 Scan Fingerprint / Face ID
                </Button>
              </Box>
            ) : (
              <>
                <Typography sx={{ textAlign: 'center', color: '#2d3436', mb: 1, fontWeight: 'bold' }}>
                  {selected2FAMethod === 'APP' 
                    ? "🔒 Enter the 6-digit code from Google Authenticator" 
                    : "📧 Enter the 6-digit code sent to your email"}
                </Typography>

                <TextField 
                  label="6-Digit Code" 
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                  inputProps={{ maxLength: 6, style: { letterSpacing: '8px', textAlign: 'center', fontSize: '1.5em', fontWeight: 'bold' } }}
                  required 
                  fullWidth 
                  autoFocus
                />

                <Button type="submit" variant="contained" size="large" sx={{ mt: 1, backgroundColor: '#00b894', py: 1.5, fontSize: '1.1rem', textTransform: 'none' }}>
                  Verify & Access Vault
                </Button>

                {selected2FAMethod === 'EMAIL' && (
                   <Button onClick={() => handleSendEmailCode()} variant="text" sx={{ color: '#0984e3', textTransform: 'none' }}>
                     Didn't receive it? Resend Email
                   </Button>
                )}
              </>
            )}

            <Button onClick={() => { setRequires2FA(false); setEmailCodeSent(false); }} variant="text" sx={{ color: '#636e72', textTransform: 'none' }}>
              Cancel & Return to Login
            </Button>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Email Address" name="email" type="email" onChange={handleChange} required fullWidth />
            <TextField label="Password" name="password" type="password" onChange={handleChange} required fullWidth />
            <Button type="submit" variant="contained" size="large" sx={{ mt: 1, backgroundColor: '#0984e3', py: 1.5, fontSize: '1.1rem', textTransform: 'none', borderRadius: '8px' }}>
              Secure Login
            </Button>
          </Box>
        )}

        {!requires2FA && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <Button component={Link} to="/register" variant="text" sx={{ textTransform: 'none', color: '#636e72' }}>
              New patient? Sign up here
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginForm;
