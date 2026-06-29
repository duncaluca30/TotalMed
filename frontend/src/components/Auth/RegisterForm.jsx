import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography, Box, TextField, Button } from '@mui/material';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { API_URL } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import PasswordChecklist from './PasswordChecklist';
import { isPasswordValid } from '../../utils/passwordRules';
import LanguageSwitcher from '../Layout/LanguageSwitcher';

const RegisterForm = () => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    email: '', password: '', confirmPassword: '', firstName: '', lastName: '', dateOfBirth: '', phone: '', cnp: ''
  });
  const [registered, setRegistered] = useState(false);

  const showToast = useToast();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    const selectedDate = new Date(formData.dateOfBirth);
    if (selectedDate > new Date()) {
      return showToast(t('Date of birth cannot be in the future.'), "error");
    }
    if (formData.password !== formData.confirmPassword) {
      return showToast(t('Passwords do not match!'), "error");
    }
    if (!isPasswordValid(formData.password)) {
      return showToast(t('Password must be 8+ characters, with 1 uppercase, 1 lowercase, 1 number, and 1 special character.'), "error");
    }

    showToast(t('Registering...'), 'info');

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      const data = await response.json();

      if (response.ok) {
        setRegistered(true);
      } else {
        showToast(data.error, 'error');
      }
    } catch {
      showToast(t('Failed to connect to server.'), 'error');
    }
  };

  const handleResend = async () => {
    try {
      await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: formData.email })
      });
      showToast(t('Confirmation email re-sent.'), 'success');
    } catch {
      showToast(t('Failed to resend email.'), 'error');
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
        {registered ? (
          <Box sx={{ textAlign: 'center' }}>
            <MarkEmailReadOutlinedIcon sx={{ fontSize: 56, color: '#00b894', mb: 1 }} />
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#2d3436', mb: 1 }}>{t('Confirm your email')}</Typography>
            <Typography sx={{ color: '#636e72', mb: 3 }}>
              {t('We sent a confirmation link to')} <strong>{formData.email}</strong>{t('. Click it to activate your account, then sign in.')}
            </Typography>
            <Button component={Link} to="/login" variant="contained" sx={{ textTransform: 'none', mb: 1 }}>
              {t('Go to sign in')}
            </Button>
            <div>
              <Button onClick={handleResend} variant="text" sx={{ textTransform: 'none', color: '#5b4fe6' }}>
                {t("Didn't get it? Resend email")}
              </Button>
            </div>
          </Box>
        ) : (
          <>
            <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 'bold', color: '#2d3436' }}>
              {t('Patient Registration')}
            </Typography>

            <Box component="form" onSubmit={handleRegister} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField label={t('First Name')} name="firstName" onChange={handleChange} required fullWidth />
              <TextField label={t('Last Name')} name="lastName" onChange={handleChange} required fullWidth />
              <DatePicker
                label={t('Date of Birth *')}
                disableFuture
                value={formData.dateOfBirth ? dayjs(formData.dateOfBirth) : null}
                onChange={(newValue) => setFormData({ ...formData, dateOfBirth: newValue ? newValue.format('YYYY-MM-DD') : '' })}
                slotProps={{ textField: { fullWidth: true, required: true } }}
              />
              <TextField label={t('Phone Number')} name="phone" type="tel" onChange={handleChange} required fullWidth />
              <TextField
                label={t('CNP (Cod Numeric Personal)')}
                name="cnp"
                onChange={handleChange}
                fullWidth
                slotProps={{ htmlInput: { maxLength: 13, inputMode: 'numeric', pattern: '\\d{13}' } }}
                helperText={t('Optional — required for emergency access by physicians')}
              />
              <TextField label={t('Email Address')} name="email" type="email" onChange={handleChange} required fullWidth />
              <TextField label={t('Password')} name="password" type="password" value={formData.password} onChange={handleChange} required fullWidth />
              <PasswordChecklist password={formData.password} />
              <TextField label={t('Confirm Password')} type="password" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} required fullWidth />

              <Button type="submit" variant="contained" size="large"
                disabled={!isPasswordValid(formData.password) || formData.password !== formData.confirmPassword}
                sx={{ mt: 1, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 6px 16px rgba(79,70,229,0.3)', py: 1.5, fontSize: '1.1rem', textTransform: 'none', borderRadius: '10px', '&.Mui-disabled': { background: '#c7c9d9', color: '#fff' } }}>
                {t('Register Patient')}
              </Button>
            </Box>

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <Button component={Link} to="/login" variant="text" sx={{ textTransform: 'none', color: '#636e72' }}>
                {t('Already have an account? Sign in')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RegisterForm;
