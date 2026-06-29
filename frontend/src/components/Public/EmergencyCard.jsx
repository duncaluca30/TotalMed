import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Chip, CircularProgress } from '@mui/material';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { API_URL } from '../../services/api';

const SEVERITY_COLOR = { SEVERE: '#c0392b', MODERATE: '#b7791f', MILD: '#0f6e56' };

// PUBLIC page (no login) reached by scanning a patient's Emergency Medical ID QR.
const EmergencyCard = () => {
  const { t } = useTranslation();
  const { token } = useParams();
  const [card, setCard] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    fetch(`${API_URL}/api/public/emergency/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setCard)
      .catch(() => setCard(null));
  }, [token]);

  if (card === undefined) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  if (card === null) {
    return (
      <Box sx={{ maxWidth: 480, mx: 'auto', mt: 8, textAlign: 'center', px: 2 }}>
        <Typography variant="h6" sx={{ color: '#636e72' }}>{t('No emergency card found')}</Typography>
        <Typography sx={{ color: '#b2bec3', mt: 1 }}>{t('This link is invalid or the card has been disabled.')}</Typography>
      </Box>
    );
  }

  const Row = ({ label, value }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
      <Typography sx={{ color: '#636e72' }}>{label}</Typography>
      <Typography sx={{ fontWeight: 600, textAlign: 'right' }}>{value || '—'}</Typography>
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', my: { xs: 2, sm: 5 }, px: 2 }}>
      <Box sx={{
        backgroundColor: '#d63031', color: '#fff', borderRadius: '14px 14px 0 0',
        px: 3, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5,
      }}>
        <MedicalServicesIcon />
        <Box>
          <Typography sx={{ fontWeight: 800, letterSpacing: '1px', lineHeight: 1 }}>{t('EMERGENCY MEDICAL ID')}</Typography>
          <Typography sx={{ fontSize: '0.8rem', opacity: 0.9 }}>{t('TotalMed · for first responders')}</Typography>
        </Box>
      </Box>

      <Box sx={{ border: '1px solid #eee', borderTop: 'none', borderRadius: '0 0 14px 14px', p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{card.firstName} {card.lastName}</Typography>
        <Box sx={{ mt: 1 }}>
          <Row label={t('Date of birth')} value={card.dateOfBirth ? new Date(card.dateOfBirth).toLocaleDateString() : null} />
          <Row label={t('Sex')} value={card.sex ? t({ MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' }[card.sex]) : null} />
          <Row label={t('Blood type')} value={card.bloodType === 'Unknown' ? t('Unknown') : card.bloodType} />
        </Box>

        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <WarningAmberIcon sx={{ fontSize: 18, color: '#c0392b' }} />
            <Typography sx={{ fontWeight: 700, color: '#c0392b' }}>{t('Allergies')}</Typography>
          </Box>
          {card.allergies?.length ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
              {card.allergies.map((a, i) => {
                const color = SEVERITY_COLOR[a.severity] || '#636e72';
                return (
                  <Box key={i} sx={{
                    border: '1px solid #eee', borderLeft: `4px solid ${color}`,
                    borderRadius: '8px', px: 1.5, py: 1,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography sx={{ fontWeight: 700 }}>{a.substance}</Typography>
                      {a.severity && (
                        <Chip size="small" label={t({ SEVERE: 'Severe', MODERATE: 'Moderate', MILD: 'Mild' }[a.severity])}
                          sx={{ backgroundColor: `${color}22`, color, fontWeight: 600 }} />
                      )}
                    </Box>
                    {a.reaction && (
                      <Typography sx={{ fontSize: '0.88rem', color: '#636e72', mt: 0.25 }}>
                        {t('Reaction:')} {a.reaction}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          ) : <Typography sx={{ color: '#b2bec3', fontStyle: 'italic' }}>{t('None recorded')}</Typography>}
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 700, color: '#5b4fe6', mb: 0.5 }}>{t('Current medications')}</Typography>
          {card.medications?.length ? (
            card.medications.map((m, i) => (
              <Typography key={i} sx={{ fontSize: '0.92rem' }}>
                • {m.name}{m.dosage ? ` · ${m.dosage}` : ''}{m.frequency ? ` · ${m.frequency}` : ''}
              </Typography>
            ))
          ) : <Typography sx={{ color: '#b2bec3', fontStyle: 'italic' }}>{t('None recorded')}</Typography>}
        </Box>

        {(card.emergencyContactName || card.emergencyContactPhone) && (
          <Box sx={{ mt: 2, p: 2, backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t('In case of emergency, contact')}</Typography>
            <Typography>{card.emergencyContactName}</Typography>
            {card.emergencyContactPhone && (
              <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                <a href={`tel:${card.emergencyContactPhone}`} style={{ color: '#5b4fe6', textDecoration: 'none' }}>{card.emergencyContactPhone}</a>
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default EmergencyCard;
