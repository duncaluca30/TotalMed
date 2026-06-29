import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, TextField, Button, IconButton, MenuItem, Chip, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';

const SEVERITY = {
  MILD: { label: 'Mild', color: '#0f6e56', bg: 'rgba(0, 184, 148, 0.12)' },
  MODERATE: { label: 'Moderate', color: '#b7791f', bg: 'rgba(237, 137, 54, 0.14)' },
  SEVERE: { label: 'Severe', color: '#c0392b', bg: 'rgba(231, 76, 60, 0.14)' },
};

const emptyAllergy = { substance: '', reaction: '', severity: 'MODERATE' };
const emptyMedication = { name: '', dosage: '', frequency: '' };

const HealthLists = ({
  allergies = [],
  medications = [],
  editable = true,
  onAddAllergy, onUpdateAllergy, onDeleteAllergy,
  onAddMedication, onUpdateMedication, onDeleteMedication,
  onToggleMedicationReminder,
}) => {
  const { t } = useTranslation();
  const [allergyDraft, setAllergyDraft] = useState(emptyAllergy);
  const [editingAllergyId, setEditingAllergyId] = useState(null);
  const [medDraft, setMedDraft] = useState(emptyMedication);
  const [editingMedId, setEditingMedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [medWarnings, setMedWarnings] = useState([]);

  const resetAllergy = () => { setAllergyDraft(emptyAllergy); setEditingAllergyId(null); };
  const resetMed = () => { setMedDraft(emptyMedication); setEditingMedId(null); };

  const submitAllergy = async (e) => {
    e.preventDefault();
    if (!allergyDraft.substance.trim()) return;
    setBusy(true);
    try {
      if (editingAllergyId) {
        await onUpdateAllergy(editingAllergyId, allergyDraft);
      } else {
        await onAddAllergy(allergyDraft);
      }
      resetAllergy();
    } finally { setBusy(false); }
  };

  const submitMed = async (e) => {
    e.preventDefault();
    if (!medDraft.name.trim()) return;
    setBusy(true);
    try {
      if (editingMedId) {
        await onUpdateMedication(editingMedId, medDraft);
      } else {
        const created = await onAddMedication(medDraft);
        setMedWarnings(created?.warnings || []);
      }
      resetMed();
    } finally { setBusy(false); }
  };

  const startEditAllergy = (a) => {
    setEditingAllergyId(a.id);
    setAllergyDraft({ substance: a.substance || '', reaction: a.reaction || '', severity: a.severity || 'MODERATE' });
  };
  const startEditMed = (m) => {
    setEditingMedId(m.id);
    setMedDraft({ name: m.name || '', dosage: m.dosage || '', frequency: m.frequency || '' });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ── Allergies ─────────────────────────────────────────────── */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <WarningAmberIcon sx={{ fontSize: 20, color: '#c0392b' }} />
          <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dark-text)' }}>{t('Allergies')}</Typography>
        </Box>

        {allergies.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {allergies.map((a) => {
              const sev = SEVERITY[a.severity] || SEVERITY.MODERATE;
              return (
                <Box key={a.id} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
                  border: '1px solid #eee', borderLeft: `4px solid ${sev.color}`,
                  borderRadius: '8px', px: 2, py: 1.2,
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, color: 'var(--dark-text)' }}>{a.substance}</Typography>
                    {a.reaction && (
                      <Typography sx={{ fontSize: '0.85rem', color: 'var(--light-text)' }}>{t('Reaction:')} {a.reaction}</Typography>
                    )}
                  </Box>
                  <Chip label={t(sev.label)} size="small" sx={{ backgroundColor: sev.bg, color: sev.color, fontWeight: 600 }} />
                  {editable && (
                    <Box sx={{ display: 'flex', flexShrink: 0 }}>
                      <IconButton size="small" onClick={() => startEditAllergy(a)} aria-label="Edit allergy"><EditOutlinedIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => onDeleteAllergy(a.id)} aria-label="Delete allergy"><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        ) : (
          <Typography className="text-muted" sx={{ fontStyle: 'italic', fontSize: '0.9rem' }}>{t('No known allergies recorded.')}</Typography>
        )}

        {editable && (
          <Box component="form" onSubmit={submitAllergy} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, mt: 2 }}>
            <TextField size="small" label={t('Substance')} required value={allergyDraft.substance}
              onChange={(e) => setAllergyDraft({ ...allergyDraft, substance: e.target.value })} sx={{ flex: '1 1 160px' }} />
            <TextField size="small" label={t('Reaction (optional)')} value={allergyDraft.reaction}
              onChange={(e) => setAllergyDraft({ ...allergyDraft, reaction: e.target.value })} sx={{ flex: '1 1 160px' }} />
            <TextField size="small" select label={t('Severity')} value={allergyDraft.severity}
              onChange={(e) => setAllergyDraft({ ...allergyDraft, severity: e.target.value })} sx={{ flex: '0 0 130px' }}>
              {Object.keys(SEVERITY).map((k) => <MenuItem key={k} value={k}>{t(SEVERITY[k].label)}</MenuItem>)}
            </TextField>
            <Button type="submit" variant="contained" disabled={busy} startIcon={editingAllergyId ? null : <AddIcon />} sx={{ flexShrink: 0 }}>
              {editingAllergyId ? t('Save') : t('Add')}
            </Button>
            {editingAllergyId && (
              <IconButton onClick={resetAllergy} aria-label="Cancel edit"><CloseIcon /></IconButton>
            )}
          </Box>
        )}
      </Box>

      {/* ── Current medications ───────────────────────────────────── */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <MedicationOutlinedIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />
          <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dark-text)' }}>{t('Current medications')}</Typography>
        </Box>

        {medications.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {medications.map((m) => (
              <Box key={m.id} sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
                border: '1px solid #eee', borderLeft: '4px solid #5b4fe6',
                borderRadius: '8px', px: 2, py: 1.2,
              }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600, color: 'var(--dark-text)' }}>
                    {m.name}{m.dosage ? ` · ${m.dosage}` : ''}
                  </Typography>
                  {m.frequency && (
                    <Typography sx={{ fontSize: '0.85rem', color: 'var(--light-text)' }}>{m.frequency}</Typography>
                  )}
                </Box>
                {editable && (
                  <Box sx={{ display: 'flex', flexShrink: 0 }}>
                    {onToggleMedicationReminder && (
                      <IconButton
                        size="small"
                        onClick={() => onToggleMedicationReminder(m.id, !m.reminderEnabled)}
                        title={m.reminderEnabled ? t('Daily reminder on') : t('Daily reminder off')}
                        aria-label="Toggle medication reminder"
                      >
                        {m.reminderEnabled
                          ? <NotificationsActiveOutlinedIcon fontSize="small" sx={{ color: '#5b4fe6' }} />
                          : <NotificationsNoneOutlinedIcon fontSize="small" />}
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={() => startEditMed(m)} aria-label="Edit medication"><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => onDeleteMedication(m.id)} aria-label="Delete medication"><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        ) : (
          <Typography className="text-muted" sx={{ fontStyle: 'italic', fontSize: '0.9rem' }}>{t('No current medications recorded.')}</Typography>
        )}

        {medWarnings.length > 0 && (
          <Alert severity="warning" onClose={() => setMedWarnings([])} sx={{ mt: 2 }}>
            <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{t('Safety check — medication still saved')}</Typography>
            {medWarnings.map((w, i) => <Typography key={i} sx={{ fontSize: '0.85rem' }}>• {w}</Typography>)}
          </Alert>
        )}

        {editable && (
          <Box component="form" onSubmit={submitMed} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, mt: 2 }}>
            <TextField size="small" label={t('Medication')} required value={medDraft.name}
              onChange={(e) => setMedDraft({ ...medDraft, name: e.target.value })} sx={{ flex: '1 1 160px' }} />
            <TextField size="small" label={t('Dosage (optional)')} value={medDraft.dosage}
              onChange={(e) => setMedDraft({ ...medDraft, dosage: e.target.value })} sx={{ flex: '1 1 120px' }} />
            <TextField size="small" label={t('Frequency (optional)')} value={medDraft.frequency}
              onChange={(e) => setMedDraft({ ...medDraft, frequency: e.target.value })} sx={{ flex: '1 1 140px' }} />
            <Button type="submit" variant="contained" disabled={busy} startIcon={editingMedId ? null : <AddIcon />} sx={{ flexShrink: 0 }}>
              {editingMedId ? t('Save') : t('Add')}
            </Button>
            {editingMedId && (
              <IconButton onClick={resetMed} aria-label="Cancel edit"><CloseIcon /></IconButton>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default HealthLists;
