import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Typography, Box, TextField, Button } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { API_URL, setCsrfToken } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const RegisterForm = () => {
  const [formData, setFormData] = useState({ 
    email: '', password: '', confirmPassword: '', firstName: '', lastName: '', dateOfBirth: '', phone: '' 
  });
  
  const showToast = useToast();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    const selectedDate = new Date(formData.dateOfBirth);
    if (selectedDate > new Date()) {
      return showToast("Date of birth cannot be in the future.", "error");
    }
    if (formData.password !== formData.confirmPassword) {
      return showToast("Passwords do not match!", "error");
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(formData.password)) {
      return showToast("Password must be 8+ characters, with 1 uppercase, 1 lowercase, 1 number, and 1 special character.", "error");
    }
    
    showToast('Registering...', 'info');
    
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      const data = await response.json();
      
      if (response.ok) {
        setCsrfToken(data.csrfToken);
        showToast('✅ Registration successful! You can now log in.', 'success');
        navigate('/login');
      } else {
        showToast(data.error, 'error');
      }
    } catch (error) { 
      showToast('Failed to connect to server.', 'error'); 
    }
  };

  return (
    <div className="container">
      <div className="login-branding">
        <h1>TotalMed</h1>
        <p>Secure Ephemeral Health Vault</p>
      </div>

      <div className="card" style={{ maxWidth: '400px', margin: '0 auto', padding: '30px' }}>
        <Typography variant="h4" sx={{ mb: 3, textAlign: 'center', fontWeight: 'bold', color: '#2d3436' }}>
          Patient Registration
        </Typography>

        <Box component="form" onSubmit={handleRegister} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="First Name" name="firstName" onChange={handleChange} required fullWidth />
          <TextField label="Last Name" name="lastName" onChange={handleChange} required fullWidth />
          <DatePicker 
            label="Date of Birth *"
            disableFuture
            value={formData.dateOfBirth ? dayjs(formData.dateOfBirth) : null}
            onChange={(newValue) => setFormData({ ...formData, dateOfBirth: newValue ? newValue.format('YYYY-MM-DD') : '' })}
            slotProps={{ textField: { fullWidth: true, required: true } }}
          />
          <TextField label="Phone Number" name="phone" type="tel" onChange={handleChange} required fullWidth />
          <TextField label="Email Address" name="email" type="email" onChange={handleChange} required fullWidth />
          <TextField label="Password" name="password" type="password" onChange={handleChange} required fullWidth />
          <TextField label="Confirm Password" type="password" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} required fullWidth />
          
          <Button type="submit" variant="contained" size="large" sx={{ mt: 1, backgroundColor: '#0984e3', py: 1.5, fontSize: '1.1rem', textTransform: 'none', borderRadius: '8px' }}>
            Register Patient
          </Button>
        </Box>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Button component={Link} to="/login" variant="text" sx={{ textTransform: 'none', color: '#636e72' }}>
            Already have an account? Sign in
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;
