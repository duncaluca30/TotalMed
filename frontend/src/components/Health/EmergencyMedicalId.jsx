import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, TextField, Button, MenuItem, Switch, FormControlLabel } from '@mui/material';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

const EmergencyMedicalId = () => {
  const { t } = useTranslation();
  const showToast = useToast();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ bloodType: '', emergencyContactName: '', emergencyContactPhone: '', enabled: false });
  const [saving, setSaving] = useState(false);

  const load = (data) => {
    setProfile(data);
    setForm({
      bloodType: data.bloodType || '',
      emergencyContactName: data.emergencyContactName || '',
      emergencyContactPhone: data.emergencyContactPhone || '',
      enabled: !!data.emergencyEnabled,
    });
  };

  useEffect(() => {
    fetchWithAuth('/api/patient/emergency-profile').then(load).catch(() => {});
  }, []);

  const save = async (extra = {}) => {
    setSaving(true);
    try {
      const data = await fetchWithAuth('/api/patient/emergency-profile', {
        method: 'PUT',
        body: JSON.stringify({ ...form, ...extra }),
      });
      load(data);
      showToast(t('Emergency ID updated.'), 'success');
    } catch (e) {
      showToast(e.message || t('Failed to update.'), 'error');
    } finally { setSaving(false); }
  };

  const copyLink = () => {
    if (profile?.emergencyUrl) {
      navigator.clipboard?.writeText(profile.emergencyUrl);
      showToast(t('Link copied.'), 'info');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <HealthAndSafetyOutlinedIcon sx={{ fontSize: 20, color: '#d63031' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dark-text)' }}>{t('Emergency Medical ID')}</Typography>
      </Box>
      <Typography className="text-muted" sx={{ fontSize: '0.9rem', mb: 2 }}>
        {t('Share a minimal safety profile — blood type, allergies, current medications and an emergency contact — that a first responder can view without logging in. Your allergies and medications are pulled in automatically.')}
      </Typography>

      <FormControlLabel
        control={<Switch checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />}
        label={t('Enable my Emergency Medical ID')}
      />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1.5 }}>
        <TextField size="small" select label={t('Blood type')} value={form.bloodType}
          onChange={(e) => setForm({ ...form, bloodType: e.target.value })} sx={{ flex: '0 0 130px' }}>
          <MenuItem value="">—</MenuItem>
          {BLOOD_TYPES.map((b) => <MenuItem key={b} value={b}>{b === 'Unknown' ? t('Unknown') : b}</MenuItem>)}
        </TextField>
        <TextField size="small" label={t('Emergency contact name')} value={form.emergencyContactName}
          onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} sx={{ flex: '1 1 180px' }} />
        <TextField size="small" label={t('Emergency contact phone')} value={form.emergencyContactPhone}
          onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} sx={{ flex: '1 1 160px' }} />
      </Box>

      <Button variant="contained" onClick={() => save()} disabled={saving} sx={{ mt: 2, backgroundColor: '#d63031', textTransform: 'none' }}>
        {saving ? t('Saving…') : t('Save')}
      </Button>

      {profile?.emergencyEnabled && profile?.qrDataUrl && (
        <Box sx={{ mt: 3, p: 2, border: '1px dashed #fab1a0', borderRadius: '10px', textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>{t('Your emergency card')}</Typography>
          <img src={profile.qrDataUrl} alt={t('Emergency ID QR')} style={{ width: 160, height: 160, background: '#fff', padding: 8, borderRadius: 8 }} />
          <Typography sx={{ fontSize: '0.78rem', color: '#636e72', wordBreak: 'break-all', mt: 1 }}>{profile.emergencyUrl}</Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 1 }}>
            <Button size="small" onClick={copyLink} sx={{ textTransform: 'none' }}>{t('Copy link')}</Button>
            <Button size="small" color="warning" onClick={() => save({ regenerate: true })} disabled={saving} sx={{ textTransform: 'none' }}>
              {t('Regenerate link')}
            </Button>
          </Box>
          <Typography sx={{ fontSize: '0.75rem', color: '#b2bec3', mt: 1 }}>
            {t('Print it or save it to your phone. Regenerating invalidates the old link.')}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default EmergencyMedicalId;
