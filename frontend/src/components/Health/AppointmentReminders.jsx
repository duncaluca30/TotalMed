import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, TextField, Button, IconButton } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import CloseIcon from '@mui/icons-material/Close';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';

const emptyDraft = { specialty: '', dateTime: '', location: '', reason: '' };
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/**
 * Reusable list + editor for a patient's appointment reminders (e.g. "Cardiology
 * · 12 Jun 2027 · Clinica Sfânta Maria"). The parent owns the data and supplies
 * async handlers that perform the API call + state update.
 */
const AppointmentReminders = ({
  appointments = [],
  editable = true,
  onAdd, onUpdate, onDelete,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  const reset = () => { setDraft(emptyDraft); setEditingId(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.specialty.trim() || !draft.dateTime) return;
    // Reminders are for upcoming visits — reject anything before today.
    if (draft.dateTime < todayStr) return;
    setBusy(true);
    try {
      if (editingId) await onUpdate(editingId, draft);
      else await onAdd(draft);
      reset();
    } finally { setBusy(false); }
  };

  const startEdit = (a) => {
    setEditingId(a.id);
    setDraft({ specialty: a.specialty || '', dateTime: toDateInput(a.dateTime), location: a.location || '', reason: a.reason || '' });
  };

  const isPast = (iso) => new Date(iso) < new Date(new Date().toDateString());

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <EventOutlinedIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dark-text)' }}>{t('Appointment reminders')}</Typography>
      </Box>

      {appointments.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {appointments.map((a) => (
            <Box key={a.id} sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
              border: '1px solid #eee', borderLeft: '4px solid #5b4fe6',
              borderRadius: '8px', px: 2, py: 1.2, opacity: isPast(a.dateTime) ? 0.55 : 1,
            }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, color: 'var(--dark-text)' }}>
                  {a.specialty}{a.location ? ` · ${a.location}` : ''}
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'var(--light-text)' }}>
                  {new Date(a.dateTime).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  {a.reason ? ` — ${a.reason}` : ''}
                </Typography>
              </Box>
              {editable && (
                <Box sx={{ display: 'flex', flexShrink: 0 }}>
                  <IconButton size="small" onClick={() => startEdit(a)} aria-label="Edit appointment"><EditOutlinedIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => onDelete(a.id)} aria-label="Delete appointment"><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      ) : (
        <Typography className="text-muted" sx={{ fontStyle: 'italic', fontSize: '0.9rem' }}>{t('No upcoming appointments.')}</Typography>
      )}

      {editable && (
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, mt: 2 }}>
          <TextField size="small" label={t('Specialty / title')} required value={draft.specialty}
            onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} sx={{ flex: '1 1 160px' }} />
          <TextField size="small" type="date" label={t('Date')} required value={draft.dateTime}
            onChange={(e) => setDraft({ ...draft, dateTime: e.target.value })}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: todayStr } }} sx={{ flex: '0 0 170px' }} />
          <TextField size="small" label={t('Location (optional)')} value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })} sx={{ flex: '1 1 160px' }} />
          <TextField size="small" label={t('Note (optional)')} value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })} sx={{ flex: '1 1 160px' }} />
          <Button type="submit" variant="contained" disabled={busy} startIcon={editingId ? null : <AddIcon />} sx={{ flexShrink: 0 }}>
            {editingId ? t('Save') : t('Add')}
          </Button>
          {editingId && <IconButton onClick={reset} aria-label="Cancel edit"><CloseIcon /></IconButton>}
        </Box>
      )}
    </Box>
  );
};

export default AppointmentReminders;
