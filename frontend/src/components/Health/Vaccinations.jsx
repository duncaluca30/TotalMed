import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, TextField, Button, IconButton } from '@mui/material';
import VaccinesOutlinedIcon from '@mui/icons-material/VaccinesOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';

const empty = { vaccineName: '', date: '', doseNumber: '', nextDoseDate: '', notes: '' };

const Vaccinations = ({ vaccinations = [], editable = true, onAdd, onDelete }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.vaccineName.trim() || !draft.date) return;
    setBusy(true);
    try {
      await onAdd({
        vaccineName: draft.vaccineName.trim(),
        date: draft.date,
        doseNumber: draft.doseNumber === '' ? null : Number(draft.doseNumber),
        nextDoseDate: draft.nextDoseDate || null,
        notes: draft.notes.trim() || null,
      });
      setDraft(empty);
    } finally { setBusy(false); }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <VaccinesOutlinedIcon sx={{ fontSize: 20, color: '#00b894' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dark-text)' }}>{t('Vaccinations')}</Typography>
      </Box>

      {vaccinations.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {vaccinations.map((v) => (
            <Box key={v.id} sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
              border: '1px solid #eee', borderLeft: '4px solid #00b894', borderRadius: '8px', px: 2, py: 1.2,
            }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, color: 'var(--dark-text)' }}>
                  {v.vaccineName}{v.doseNumber ? ` · ${t('dose')} ${v.doseNumber}` : ''}
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'var(--light-text)' }}>
                  {new Date(v.date).toLocaleDateString()}
                  {v.nextDoseDate ? ` · ${t('next due')} ${new Date(v.nextDoseDate).toLocaleDateString()}` : ''}
                  {v.notes ? ` · ${v.notes}` : ''}
                </Typography>
              </Box>
              {editable && onDelete && (
                <IconButton size="small" color="error" onClick={() => onDelete(v.id)} aria-label="Delete vaccination">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
        </Box>
      ) : (
        <Typography className="text-muted" sx={{ fontStyle: 'italic', fontSize: '0.9rem' }}>{t('No vaccinations recorded.')}</Typography>
      )}

      {editable && (
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, mt: 2 }}>
          <TextField size="small" label={t('Vaccine')} required value={draft.vaccineName}
            onChange={(e) => setDraft({ ...draft, vaccineName: e.target.value })} sx={{ flex: '1 1 160px' }} />
          <TextField size="small" type="date" label={t('Date')} required value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: '0 0 150px' }} />
          <TextField size="small" type="number" label={t('Dose #')} value={draft.doseNumber}
            onChange={(e) => setDraft({ ...draft, doseNumber: e.target.value })} sx={{ flex: '0 0 90px' }} />
          <TextField size="small" type="date" label={t('Next due')} value={draft.nextDoseDate}
            onChange={(e) => setDraft({ ...draft, nextDoseDate: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: '0 0 150px' }} />
          <TextField size="small" label={t('Notes (optional)')} value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })} sx={{ flex: '1 1 160px' }} />
          <Button type="submit" variant="contained" disabled={busy} startIcon={<AddIcon />} sx={{ flexShrink: 0 }}>
            {busy ? t('Adding…') : t('Add')}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default Vaccinations;
