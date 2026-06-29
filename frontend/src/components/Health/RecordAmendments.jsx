import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, TextField, Button } from '@mui/material';
import EditNoteIcon from '@mui/icons-material/EditNote';

// Shows the append-only amendments under a record, plus an optional add form
// (rendered only when `onAdd` is supplied — i.e. for a doctor in a vault session).
const RecordAmendments = ({ amendments = [], onAdd }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onAdd(text.trim());
      setText('');
      setOpen(false);
    } finally { setBusy(false); }
  };

  if (amendments.length === 0 && !onAdd) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      {amendments.map((am) => (
        <Box key={am.id} sx={{
          borderLeft: '3px solid #6c5ce7', backgroundColor: 'rgba(108, 92, 231, 0.06)',
          borderRadius: '4px', px: 1.5, py: 1, mb: 0.8,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
            <EditNoteIcon sx={{ fontSize: 16, color: '#6c5ce7' }} />
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#6c5ce7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {t('Amendment')} · {new Date(am.createdAt).toLocaleDateString()}{am.doctor ? ` · ${am.doctor}` : ''}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.88rem', color: 'var(--dark-text)' }}>{am.text}</Typography>
        </Box>
      ))}

      {onAdd && (
        open ? (
          <Box component="form" onSubmit={submit} sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'flex-start' }}>
            <TextField
              size="small" fullWidth multiline maxRows={3}
              placeholder={t('Add a correction or addendum…')}
              value={text} onChange={(e) => setText(e.target.value)} autoFocus
            />
            <Button type="submit" variant="contained" size="small" disabled={busy} sx={{ flexShrink: 0, backgroundColor: '#6c5ce7' }}>
              {busy ? t('Saving…') : t('Save')}
            </Button>
            <Button onClick={() => { setOpen(false); setText(''); }} size="small" sx={{ flexShrink: 0, color: '#636e72', textTransform: 'none' }}>
              {t('Cancel')}
            </Button>
          </Box>
        ) : (
          <Button onClick={() => setOpen(true)} size="small" startIcon={<EditNoteIcon sx={{ fontSize: 16 }} />} sx={{ textTransform: 'none', color: '#6c5ce7', mt: 0.5 }}>
            {t('Add amendment')}
          </Button>
        )
      )}
    </Box>
  );
};

export default RecordAmendments;
