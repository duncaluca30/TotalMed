import React, { useState } from 'react';
import { Box, Typography, TextField, Button, IconButton, MenuItem, Chip, FormControlLabel, Checkbox } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import CloseIcon from '@mui/icons-material/Close';
import PregnantWomanOutlinedIcon from '@mui/icons-material/PregnantWomanOutlined';

const SEX_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

const MODALITY = {
  NATURAL: { label: 'Natural', color: '#0f6e56', bg: 'rgba(0, 184, 148, 0.12)' },
  CESAREAN: { label: 'Cesarean', color: '#5b4fe6', bg: 'rgba(91, 79, 230, 0.12)' },
};

const emptyBirth = { modality: 'NATURAL', year: '' };
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/**
 * Reusable editor for a patient's sex and (when female) gynecological / obstetric
 * history: menarche date, menopause status, and the list of births. The parent
 * owns the data and supplies async handlers that perform the API call + state
 * update; this component manages form UI and resets itself on success.
 */
const GynecologySection = ({
  sex = null,
  menarcheDate = null,
  atMenopause = false,
  births = [],
  editable = true,
  onSaveProfile,
  onAddBirth, onUpdateBirth, onDeleteBirth,
}) => {
  const [profileDraft, setProfileDraft] = useState({ menarcheDate: toDateInput(menarcheDate), atMenopause });
  const [profileBusy, setProfileBusy] = useState(false);
  const [birthDraft, setBirthDraft] = useState(emptyBirth);
  const [editingBirthId, setEditingBirthId] = useState(null);
  const [birthBusy, setBirthBusy] = useState(false);

  // Re-sync the editable draft when the parent's saved values change (e.g. after
  // a save, or a real-time refresh) — the recommended render-time pattern rather
  // than a setState-in-effect, which avoids cascading renders.
  const [syncedFrom, setSyncedFrom] = useState({ menarcheDate, atMenopause });
  if (syncedFrom.menarcheDate !== menarcheDate || syncedFrom.atMenopause !== atMenopause) {
    setSyncedFrom({ menarcheDate, atMenopause });
    setProfileDraft({ menarcheDate: toDateInput(menarcheDate), atMenopause });
  }

  const changeSex = async (value) => {
    if (!onSaveProfile) return;
    await onSaveProfile({ sex: value });
  };

  const saveProfile = async () => {
    setProfileBusy(true);
    try {
      await onSaveProfile({
        menarcheDate: profileDraft.menarcheDate || null,
        atMenopause: profileDraft.atMenopause,
      });
    } finally { setProfileBusy(false); }
  };

  const resetBirth = () => { setBirthDraft(emptyBirth); setEditingBirthId(null); };

  const submitBirth = async (e) => {
    e.preventDefault();
    const payload = { modality: birthDraft.modality, year: birthDraft.year ? Number(birthDraft.year) : null };
    setBirthBusy(true);
    try {
      if (editingBirthId) {
        await onUpdateBirth(editingBirthId, payload);
      } else {
        await onAddBirth(payload);
      }
      resetBirth();
    } finally { setBirthBusy(false); }
  };

  const startEditBirth = (b) => {
    setEditingBirthId(b.id);
    setBirthDraft({ modality: b.modality, year: b.year || '' });
  };

  const sexLabel = SEX_OPTIONS.find((o) => o.value === sex)?.label || 'Not specified';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <PregnantWomanOutlinedIcon sx={{ fontSize: 20, color: '#d6336c' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dark-text)' }}>
          Sex &amp; gynecological history
        </Typography>
      </Box>

      {/* Sex */}
      {editable ? (
        <TextField
          select size="small" label="Biological sex" value={sex || ''}
          onChange={(e) => changeSex(e.target.value)}
          sx={{ minWidth: 200, mb: 1 }}
        >
          {SEX_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
      ) : (
        <Typography sx={{ mb: 1 }}><strong>Sex:</strong> {sexLabel}</Typography>
      )}

      {/* Female-only obstetric / gynecological section */}
      {sex === 'FEMALE' && (
        <Box sx={{ mt: 1, pl: { xs: 0, sm: 1 }, borderLeft: { sm: '3px solid #f8d7e3' } }}>
          {/* Menarche + menopause */}
          {editable ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
              <TextField
                size="small" type="date" label="First menstruation (menarche)"
                InputLabelProps={{ shrink: true }}
                value={profileDraft.menarcheDate}
                onChange={(e) => setProfileDraft({ ...profileDraft, menarcheDate: e.target.value })}
                sx={{ minWidth: 220 }}
              />
              <FormControlLabel
                control={<Checkbox checked={profileDraft.atMenopause}
                  onChange={(e) => setProfileDraft({ ...profileDraft, atMenopause: e.target.checked })} />}
                label="At menopause"
              />
              <Button variant="outlined" size="small" disabled={profileBusy} onClick={saveProfile}>Save</Button>
            </Box>
          ) : (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.9rem' }}>
                <strong>First menstruation:</strong> {menarcheDate ? new Date(menarcheDate).toLocaleDateString() : '—'}
              </Typography>
              <Typography sx={{ fontSize: '0.9rem' }}>
                <strong>Menopause:</strong> {atMenopause ? 'Yes' : 'No'}
              </Typography>
            </Box>
          )}

          {/* Births */}
          <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--dark-text)', mb: 1 }}>
            Births <Typography component="span" sx={{ color: 'var(--light-text)', fontWeight: 400 }}>({births.length})</Typography>
          </Typography>

          {births.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {births.map((b) => {
                const mod = MODALITY[b.modality] || MODALITY.NATURAL;
                return (
                  <Box key={b.id} sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
                    border: '1px solid #eee', borderLeft: `4px solid ${mod.color}`,
                    borderRadius: '8px', px: 2, py: 1,
                  }}>
                    <Chip label={mod.label} size="small" sx={{ backgroundColor: mod.bg, color: mod.color, fontWeight: 600 }} />
                    <Typography sx={{ color: 'var(--dark-text)' }}>{b.year || 'Year unknown'}</Typography>
                    {editable && (
                      <Box sx={{ display: 'flex', ml: 'auto', flexShrink: 0 }}>
                        <IconButton size="small" onClick={() => startEditBirth(b)} aria-label="Edit birth"><EditOutlinedIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => onDeleteBirth(b.id)} aria-label="Delete birth"><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography className="text-muted" sx={{ fontStyle: 'italic', fontSize: '0.9rem' }}>No births recorded.</Typography>
          )}

          {editable && (
            <Box component="form" onSubmit={submitBirth} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, mt: 2 }}>
              <TextField size="small" select label="Modality" value={birthDraft.modality}
                onChange={(e) => setBirthDraft({ ...birthDraft, modality: e.target.value })} sx={{ flex: '0 0 150px' }}>
                {Object.keys(MODALITY).map((k) => <MenuItem key={k} value={k}>{MODALITY[k].label}</MenuItem>)}
              </TextField>
              <TextField size="small" type="number" label="Year (optional)" value={birthDraft.year}
                onChange={(e) => setBirthDraft({ ...birthDraft, year: e.target.value })}
                inputProps={{ min: 1900, max: new Date().getFullYear() }} sx={{ flex: '0 0 140px' }} />
              <Button type="submit" variant="contained" disabled={birthBusy} startIcon={editingBirthId ? null : <AddIcon />} sx={{ flexShrink: 0 }}>
                {editingBirthId ? 'Save' : 'Add'}
              </Button>
              {editingBirthId && (
                <IconButton onClick={resetBirth} aria-label="Cancel edit"><CloseIcon /></IconButton>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default GynecologySection;
