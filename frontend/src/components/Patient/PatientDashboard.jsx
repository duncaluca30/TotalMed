import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Typography, Button, TextField } from '@mui/material';
import { startRegistration } from '@simplewebauthn/browser';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const PatientDashboard = () => {
  const { patientData, setPatientData } = useOutletContext();
  const showToast = useToast();
  
  const [setupStep, setSetupStep] = useState('initial');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [setupPin, setSetupPin] = useState('');

  const handleStart2FASetup = async () => {
    try {
      const data = await fetchWithAuth('/api/auth/2fa/generate', { method: 'POST' });
      setQrCodeUrl(data.qrCodeUrl);
      setTwoFactorSecret(data.secret);
      setSetupStep('scan');
    } catch (err) { 
      showToast(err.message || 'Failed to generate 2FA', 'error'); 
    }
  };

  const handleVerify2FASetup = async (e) => {
    e.preventDefault();
    try {
      await fetchWithAuth('/api/auth/2fa/verify-setup', {
        method: 'POST',
        body: JSON.stringify({ token: setupPin })
      });
      setSetupStep('success');
      showToast('2FA activated successfully!', 'success');
      setPatientData({ ...patientData, user: { ...patientData.user, isTwoFactorEnabled: true }});
    } catch (err) { 
      showToast(err.message || 'Failed to verify 2FA', 'error'); 
    }
  };

  const handleEnableBiometrics = async () => {
    showToast('Initiating biometric setup...', 'info');
    try {
      const options = await fetchWithAuth('/api/auth/webauthn/generate-registration');
      const attestationResponse = await startRegistration({ optionsJSON: options });

      await fetchWithAuth('/api/auth/webauthn/verify-registration', {
        method: 'POST',
        body: JSON.stringify(attestationResponse)
      });

      showToast('Fingerprint/Face ID securely registered!', 'success');
    } catch (error) {
      if (error.name === 'NotAllowedError') {
         showToast('Biometric setup cancelled.', 'warning');
      } else {
         showToast(`Failed: ${error.message || error.name}`, 'error');
      }
    }
  };

  const handleGenerateCode = async () => {
    try {
      const data = await fetchWithAuth('/api/patient/generate-code', { method: 'POST' });
      setPatientData({ ...patientData, accessCode: { code: data.code, expiresAt: data.expiresAt } });
      showToast("Code generated successfully!", "success");
    } catch (error) { 
      showToast(error.message || "Failed to generate code.", "error"); 
    }
  };

  return (
    <Box>
      <div className="card card--profile">
        <h3>Patient Profile</h3>
        <p><strong>Name:</strong> {patientData.firstName} {patientData.lastName}</p>
        <p><strong>DOB:</strong> {new Date(patientData.dateOfBirth).toLocaleDateString()}</p>
      </div>

      {/* 2FA SECURITY DASHBOARD CARD */}
      <div className="card card--security" style={{ marginTop: '20px' }}>
        <h3>🔐 Two-Factor Authentication</h3>
        <p className="text-muted">Protect your vault with Google Authenticator.</p>
        
        {patientData?.user?.isTwoFactorEnabled || setupStep === 'success' ? (
          <Typography sx={{ color: '#00b894', fontWeight: 'bold', mt: 2, fontSize: '1.2em' }}>
            ✅ 2FA is securely enabled on this account.
          </Typography>
        ) : (
          <>
            {setupStep === 'initial' && (
              <Button variant="outlined" onClick={handleStart2FASetup} sx={{ mt: 1 }}>Enable 2FA</Button>
            )}
            {setupStep === 'scan' && (
              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Typography sx={{ mb: 2 }}>Scan this QR code with your Authenticator App:</Typography>
                <img src={qrCodeUrl} alt="QR Code" style={{ width: '180px', border: '10px solid white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                <Typography sx={{ mt: 1, fontSize: '0.85em', color: '#636e72' }}>Manual Key: <strong>{twoFactorSecret}</strong></Typography>
                
                <Box component="form" onSubmit={handleVerify2FASetup} sx={{ display: 'flex', gap: 1, mt: 3, justifyContent: 'center' }}>
                  <TextField size="small" label="Enter 6-digit code" value={setupPin} onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, ''))} inputProps={{ maxLength: 6 }} required />
                  <Button type="submit" variant="contained" sx={{ backgroundColor: '#0984e3' }}>Verify</Button>
                </Box>
              </Box>
            )}
          </>
        )}
        <hr className="section-divider" />
        
        <h3>👆 Biometric Login</h3>
        <p className="text-muted">Register this device to log in with Fingerprint, Face ID, or Windows Hello.</p>
        <Button 
          variant="contained" 
          onClick={handleEnableBiometrics} 
          sx={{ mt: 1, backgroundColor: '#6c5ce7', '&:hover': { backgroundColor: '#a29bfe' }, textTransform: 'none' }}
        >
          Register Current Device
        </Button>
      </div>

      <div className="card card--access-code" style={{ marginTop: '20px' }}>
        <h3>🔐 Share Medical File</h3>
        <p>Generate a temporary 6-digit code to allow a doctor to view your history and add new records. This code expires in 60 minutes.</p>
        
        {!patientData.accessCode ? (
          <button onClick={handleGenerateCode} style={{ backgroundColor: '#f39c12', color: 'white', fontWeight: 'bold' }}>Generate Access Code</button>
        ) : (
          <div className="access-code-display">
            <p style={{ fontSize: '1.2em', marginBottom: '5px' }}>Your Secure Code:</p>
            <h1 className="access-code-value">{patientData.accessCode.code}</h1>
            <p className="text-danger">Show this to your doctor. Do not close this window.</p>
          </div>
        )}
      </div>
    </Box>
  );
};

export default PatientDashboard;
