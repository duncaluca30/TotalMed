import React, { useState } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import { startRegistration } from '@simplewebauthn/browser';
import { fetchWithAuth, setCsrfToken } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import PasswordChecklist from '../Auth/PasswordChecklist';
import { isPasswordValid } from '../../utils/passwordRules';

const StatusPill = ({ children }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, background: 'rgba(0, 184, 148, 0.12)', color: '#0f6e56', px: 1.25, py: 0.5, borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 }}>
    <CheckCircleOutlineIcon sx={{ fontSize: 15 }} /> {children}
  </Box>
);

const SectionHeader = ({ icon, title, pill }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {icon}
      <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dark-text)' }}>{title}</Typography>
    </Box>
    {pill}
  </Box>
);

/**
 * Reusable security settings card: TOTP 2FA setup + WebAuthn biometric login.
 * Used by both the patient and doctor dashboards (2FA is per-user, not per-role).
 *
 * Props:
 *  - isTwoFactorEnabled: boolean
 *  - passkeys: array of registered passkeys (length used to reflect state)
 *  - onTwoFactorEnabled():  called after 2FA is successfully activated
 *  - onPasskeyAdded():      called after a new device is registered
 */
const SecurityCard = ({ isTwoFactorEnabled, passkeys = [], onTwoFactorEnabled, onPasskeyAdded }) => {
  const showToast = useToast();

  const [setupStep, setSetupStep] = useState('initial'); // initial | scan
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [registering, setRegistering] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const hasPasskeys = passkeys.length > 0;
  const twoFactorActive = isTwoFactorEnabled;

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
        body: JSON.stringify({ token: setupPin }),
      });
      setSetupStep('initial');
      setSetupPin('');
      showToast('2FA activated successfully!', 'success');
      onTwoFactorEnabled?.();
    } catch (err) {
      showToast(err.message || 'Failed to verify 2FA', 'error');
    }
  };

  const handleEnableBiometrics = async () => {
    setRegistering(true);
    showToast('Initiating biometric setup...', 'info');
    try {
      const options = await fetchWithAuth('/api/auth/webauthn/generate-registration');
      const attestationResponse = await startRegistration({ optionsJSON: options });

      await fetchWithAuth('/api/auth/webauthn/verify-registration', {
        method: 'POST',
        body: JSON.stringify(attestationResponse),
      });

      showToast('Fingerprint/Face ID securely registered!', 'success');
      onPasskeyAdded?.();
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        showToast('Biometric setup cancelled.', 'warning');
      } else if (error.name === 'InvalidStateError') {
        showToast('This device is already registered.', 'info');
      } else {
        showToast(`Failed: ${error.message || error.name}`, 'error');
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return showToast('New passwords do not match.', 'error');
    setSavingPw(true);
    try {
      const data = await fetchWithAuth('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      // The server rotated our session token — refresh the in-memory CSRF token.
      if (data?.csrfToken) setCsrfToken(data.csrfToken);
      setPw({ current: '', next: '', confirm: '' });
      setPwOpen(false);
      showToast('Password changed. Other devices have been signed out.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to change password.', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="card card--security" style={{ marginTop: '20px' }}>
      {/* ---- Two-Factor Authentication ---- */}
      <SectionHeader
        icon={<ShieldOutlinedIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />}
        title="Two-factor authentication"
        pill={twoFactorActive ? <StatusPill>Enabled</StatusPill> : null}
      />
      <p className="text-muted">Protect your account with an authenticator app.</p>

      {!twoFactorActive && (
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
                <TextField size="small" label="Enter 6-digit code" value={setupPin} onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, ''))} slotProps={{ htmlInput: { maxLength: 6 } }} required />
                <Button type="submit" variant="contained" sx={{ backgroundColor: '#5b4fe6' }}>Verify</Button>
              </Box>
            </Box>
          )}
        </>
      )}

      <hr className="section-divider" />

      {/* ---- Biometric Login ---- */}
      <SectionHeader
        icon={<FingerprintIcon sx={{ fontSize: 22, color: '#7c3aed' }} />}
        title="Biometric login"
        pill={hasPasskeys ? <StatusPill>{passkeys.length} device{passkeys.length > 1 ? 's' : ''}</StatusPill> : null}
      />
      {hasPasskeys ? (
        <>
          <p className="text-muted">Sign in with Fingerprint, Face ID, or Windows Hello on your registered devices.</p>
          <Button
            variant="outlined"
            onClick={handleEnableBiometrics}
            disabled={registering}
            sx={{ mt: 1.5, textTransform: 'none', borderColor: '#7c3aed', color: '#7c3aed' }}
          >
            {registering ? 'Registering…' : 'Register another device'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-muted">Register this device to log in with Fingerprint, Face ID, or Windows Hello.</p>
          <Button
            variant="contained"
            onClick={handleEnableBiometrics}
            disabled={registering}
            sx={{ mt: 1, backgroundColor: '#7c3aed', '&:hover': { backgroundColor: '#a29bfe' }, textTransform: 'none' }}
          >
            {registering ? 'Registering…' : 'Register Current Device'}
          </Button>
        </>
      )}

      <hr className="section-divider" />

      {/* ---- Change password ---- */}
      <SectionHeader
        icon={<KeyOutlinedIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />}
        title="Password"
      />
      {!pwOpen ? (
        <>
          <p className="text-muted">Change your account password. This signs you out on all other devices.</p>
          <Button variant="outlined" onClick={() => setPwOpen(true)} sx={{ mt: 1, textTransform: 'none' }}>Change password</Button>
        </>
      ) : (
        <Box component="form" onSubmit={handleChangePassword} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField size="small" type="password" label="Current password" value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })} required fullWidth />
          <TextField size="small" type="password" label="New password" value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })} required fullWidth />
          <PasswordChecklist password={pw.next} />
          <TextField size="small" type="password" label="Confirm new password" value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required fullWidth />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="submit" variant="contained" disabled={savingPw || !isPasswordValid(pw.next) || pw.next !== pw.confirm}
              sx={{ backgroundColor: '#5b4fe6', textTransform: 'none' }}>
              {savingPw ? 'Saving…' : 'Update password'}
            </Button>
            <Button onClick={() => { setPwOpen(false); setPw({ current: '', next: '', confirm: '' }); }} variant="text" sx={{ textTransform: 'none', color: '#636e72' }}>
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </div>
  );
};

export default SecurityCard;
