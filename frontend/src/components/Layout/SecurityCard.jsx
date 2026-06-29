import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
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
 */
const SecurityCard = ({ isTwoFactorEnabled, passkeys = [], onTwoFactorEnabled, onPasskeyAdded }) => {
  const { t } = useTranslation();
  const showToast = useToast();

  const [setupStep, setSetupStep] = useState('initial'); // initial | scan
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [registering, setRegistering] = useState(false);

  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const [backupCodes, setBackupCodes] = useState(null);
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleGenerateBackupCodes = async () => {
    setGeneratingCodes(true);
    try {
      const data = await fetchWithAuth('/api/auth/2fa/backup-codes', { method: 'POST' });
      setBackupCodes(data.codes || []);
    } catch (err) {
      showToast(err.message || t('Failed to generate backup codes.'), 'error');
    } finally { setGeneratingCodes(false); }
  };

  const handleDownloadCodes = () => {
    const blob = new Blob([
      `TotalMed backup codes\nGenerated: ${new Date().toLocaleString()}\n\n${backupCodes.join('\n')}\n\nEach code works once. Keep them somewhere safe.`,
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'totalmed-backup-codes.txt';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSignOutEverywhere = async () => {
    setSigningOut(true);
    try {
      const data = await fetchWithAuth('/api/auth/logout-all', { method: 'POST' });
      if (data?.csrfToken) setCsrfToken(data.csrfToken);
      showToast(t('Signed out of all other devices.'), 'success');
    } catch (err) {
      showToast(err.message || t('Failed to sign out other devices.'), 'error');
    } finally { setSigningOut(false); }
  };

  const hasPasskeys = passkeys.length > 0;
  const twoFactorActive = isTwoFactorEnabled;

  const handleStart2FASetup = async () => {
    try {
      const data = await fetchWithAuth('/api/auth/2fa/generate', { method: 'POST' });
      setQrCodeUrl(data.qrCodeUrl);
      setTwoFactorSecret(data.secret);
      setSetupStep('scan');
    } catch (err) {
      showToast(err.message || t('Failed to generate 2FA'), 'error');
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
      showToast(t('2FA activated successfully!'), 'success');
      onTwoFactorEnabled?.();
    } catch (err) {
      showToast(err.message || t('Failed to verify 2FA'), 'error');
    }
  };

  const handleEnableBiometrics = async () => {
    setRegistering(true);
    showToast(t('Initiating biometric setup...'), 'info');
    try {
      const options = await fetchWithAuth('/api/auth/webauthn/generate-registration');
      const attestationResponse = await startRegistration({ optionsJSON: options });

      await fetchWithAuth('/api/auth/webauthn/verify-registration', {
        method: 'POST',
        body: JSON.stringify(attestationResponse),
      });

      showToast(t('Fingerprint/Face ID securely registered!'), 'success');
      onPasskeyAdded?.();
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        showToast(t('Biometric setup cancelled.'), 'warning');
      } else if (error.name === 'InvalidStateError') {
        showToast(t('This device is already registered.'), 'info');
      } else {
        showToast(t('Failed: {{msg}}', { msg: error.message || error.name }), 'error');
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return showToast(t('New passwords do not match.'), 'error');
    setSavingPw(true);
    try {
      const data = await fetchWithAuth('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });

      if (data?.csrfToken) setCsrfToken(data.csrfToken);
      setPw({ current: '', next: '', confirm: '' });
      setPwOpen(false);
      showToast(t('Password changed. Other devices have been signed out.'), 'success');
    } catch (err) {
      showToast(err.message || t('Failed to change password.'), 'error');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="card card--security" style={{ marginTop: '20px' }}>
      <SectionHeader
        icon={<ShieldOutlinedIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />}
        title={t('Two-factor authentication')}
        pill={twoFactorActive ? <StatusPill>{t('Enabled')}</StatusPill> : null}
      />
      <p className="text-muted">{t('Protect your account with an authenticator app.')}</p>

      {!twoFactorActive && (
        <>
          {setupStep === 'initial' && (
            <Button variant="outlined" onClick={handleStart2FASetup} sx={{ mt: 1 }}>{t('Enable 2FA')}</Button>
          )}
          {setupStep === 'scan' && (
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Typography sx={{ mb: 2 }}>{t('Scan this QR code with your Authenticator App:')}</Typography>
              <img src={qrCodeUrl} alt={t('QR Code')} style={{ width: '180px', border: '10px solid white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
              <Typography sx={{ mt: 1, fontSize: '0.85em', color: '#636e72' }}>{t('Manual Key:')} <strong>{twoFactorSecret}</strong></Typography>

              <Box component="form" onSubmit={handleVerify2FASetup} sx={{ display: 'flex', gap: 1, mt: 3, justifyContent: 'center' }}>
                <TextField size="small" label={t('Enter 6-digit code')} value={setupPin} onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, ''))} slotProps={{ htmlInput: { maxLength: 6 } }} required />
                <Button type="submit" variant="contained" sx={{ backgroundColor: '#5b4fe6' }}>{t('Verify')}</Button>
              </Box>
            </Box>
          )}
        </>
      )}

      <hr className="section-divider" />

      <SectionHeader
        icon={<FingerprintIcon sx={{ fontSize: 22, color: '#7c3aed' }} />}
        title={t('Biometric login')}
        pill={hasPasskeys ? <StatusPill>{t('{{count}} device(s)', { count: passkeys.length })}</StatusPill> : null}
      />
      {hasPasskeys ? (
        <>
          <p className="text-muted">{t('Sign in with Fingerprint, Face ID, or Windows Hello on your registered devices.')}</p>
          <Button
            variant="outlined"
            onClick={handleEnableBiometrics}
            disabled={registering}
            sx={{ mt: 1.5, textTransform: 'none', borderColor: '#7c3aed', color: '#7c3aed' }}
          >
            {registering ? t('Registering…') : t('Register another device')}
          </Button>
        </>
      ) : (
        <>
          <p className="text-muted">{t('Register this device to log in with Fingerprint, Face ID, or Windows Hello.')}</p>
          <Button
            variant="contained"
            onClick={handleEnableBiometrics}
            disabled={registering}
            sx={{ mt: 1, backgroundColor: '#7c3aed', '&:hover': { backgroundColor: '#a29bfe' }, textTransform: 'none' }}
          >
            {registering ? t('Registering…') : t('Register Current Device')}
          </Button>
        </>
      )}

      <hr className="section-divider" />

      <SectionHeader
        icon={<KeyOutlinedIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />}
        title={t('Password')}
      />
      {!pwOpen ? (
        <>
          <p className="text-muted">{t('Change your account password. This signs you out on all other devices.')}</p>
          <Button variant="outlined" onClick={() => setPwOpen(true)} sx={{ mt: 1, textTransform: 'none' }}>{t('Change password')}</Button>
        </>
      ) : (
        <Box component="form" onSubmit={handleChangePassword} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField size="small" type="password" label={t('Current password')} value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })} required fullWidth />
          <TextField size="small" type="password" label={t('New password')} value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })} required fullWidth />
          <PasswordChecklist password={pw.next} />
          <TextField size="small" type="password" label={t('Confirm new password')} value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required fullWidth />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button type="submit" variant="contained" disabled={savingPw || !isPasswordValid(pw.next) || pw.next !== pw.confirm}
              sx={{ backgroundColor: '#5b4fe6', textTransform: 'none' }}>
              {savingPw ? t('Saving…') : t('Update password')}
            </Button>
            <Button onClick={() => { setPwOpen(false); setPw({ current: '', next: '', confirm: '' }); }} variant="text" sx={{ textTransform: 'none', color: '#636e72' }}>
              {t('Cancel')}
            </Button>
          </Box>
        </Box>
      )}

      <hr className="section-divider" />

      <SectionHeader
        icon={<RestartAltIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />}
        title={t('Backup codes')}
      />
      <p className="text-muted">{t('Single-use codes to sign in if you lose access to your other methods.')}</p>
      <Button variant="outlined" onClick={handleGenerateBackupCodes} disabled={generatingCodes} sx={{ mt: 1, textTransform: 'none' }}>
        {generatingCodes ? t('Generating…') : t('Generate backup codes')}
      </Button>

      <hr className="section-divider" />

      <SectionHeader
        icon={<DevicesOutlinedIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />}
        title={t('Active sessions')}
      />
      <p className="text-muted">{t('Sign out everywhere else if you used a shared or lost device. This device stays signed in.')}</p>
      <Button variant="outlined" color="error" onClick={handleSignOutEverywhere} disabled={signingOut} sx={{ mt: 1, textTransform: 'none' }}>
        {signingOut ? t('Signing out…') : t('Sign out of all other devices')}
      </Button>

      <Dialog open={!!backupCodes} onClose={() => setBackupCodes(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{t('Your backup codes')}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#636e72', mb: 2 }}>
            {t("Save these now — they won't be shown again. Each code works once.")}
          </Typography>
          <Box sx={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
            fontFamily: 'monospace', fontSize: '1rem',
            backgroundColor: '#f8f9fa', borderRadius: '8px', p: 2,
          }}>
            {(backupCodes || []).map((c) => <span key={c}>{c}</span>)}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleDownloadCodes} sx={{ textTransform: 'none' }}>{t('Download .txt')}</Button>
          <Button onClick={() => setBackupCodes(null)} variant="contained" sx={{ textTransform: 'none', backgroundColor: '#5b4fe6' }}>{t('Done')}</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default SecurityCard;
