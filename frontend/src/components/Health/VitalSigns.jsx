import React, { useMemo, useState } from 'react';
import { Box, Typography, TextField, Button, MenuItem, IconButton } from '@mui/material';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';
import { LineChart } from '@mui/x-charts/LineChart';

// Metric definitions. `dual` metrics (blood pressure) carry two values.
const TYPES = {
  BLOOD_PRESSURE: { label: 'Blood pressure', unit: 'mmHg', dual: true, v1: 'Systolic', v2: 'Diastolic' },
  WEIGHT: { label: 'Weight', unit: 'kg' },
  GLUCOSE: { label: 'Glucose', unit: 'mg/dL' },
  HEART_RATE: { label: 'Heart rate', unit: 'bpm' },
  TEMPERATURE: { label: 'Temperature', unit: '°C' },
};

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Vital-sign tracker with a per-metric trend chart. The parent owns the data and
 * supplies async `onAdd` / `onDelete` handlers (delete is optional — omitted for
 * the doctor view). When `editable` is false, only the chart + history show.
 */
const VitalSigns = ({ vitals = [], editable = true, onAdd, onDelete }) => {
  const [type, setType] = useState('BLOOD_PRESSURE');
  const [draft, setDraft] = useState({ value: '', value2: '', measuredAt: todayStr() });
  const [busy, setBusy] = useState(false);

  const cfg = TYPES[type];
  const series = useMemo(
    () => vitals.filter((v) => v.type === type).sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt)),
    [vitals, type]
  );

  const dates = series.map((v) => new Date(v.measuredAt).toLocaleDateString());

  const submit = async (e) => {
    e.preventDefault();
    if (draft.value === '' || (cfg.dual && draft.value2 === '')) return;
    setBusy(true);
    try {
      await onAdd({
        type,
        value: Number(draft.value),
        value2: cfg.dual ? Number(draft.value2) : null,
        unit: cfg.unit,
        measuredAt: draft.measuredAt,
      });
      setDraft({ value: '', value2: '', measuredAt: todayStr() });
    } finally { setBusy(false); }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <MonitorHeartOutlinedIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dark-text)' }}>Vital signs</Typography>
      </Box>

      <TextField
        size="small" select label="Metric" value={type}
        onChange={(e) => setType(e.target.value)} sx={{ minWidth: 200, mb: 2 }}
      >
        {Object.keys(TYPES).map((k) => <MenuItem key={k} value={k}>{TYPES[k].label}</MenuItem>)}
      </TextField>

      {series.length > 0 ? (
        <LineChart
          height={220}
          xAxis={[{ data: dates, scaleType: 'point' }]}
          series={cfg.dual
            ? [
                { data: series.map((v) => v.value), label: `${cfg.v1} (${cfg.unit})`, color: '#5b4fe6' },
                { data: series.map((v) => v.value2), label: `${cfg.v2} (${cfg.unit})`, color: '#e17055' },
              ]
            : [{ data: series.map((v) => v.value), label: `${cfg.label} (${cfg.unit})`, color: '#5b4fe6' }]}
        />
      ) : (
        <Typography className="text-muted" sx={{ fontStyle: 'italic', fontSize: '0.9rem', py: 2 }}>
          No {cfg.label.toLowerCase()} readings yet.
        </Typography>
      )}

      {/* History with optional delete */}
      {series.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
          {[...series].reverse().slice(0, 6).map((v) => (
            <Box key={v.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--light-text)' }}>
              <span>
                {new Date(v.measuredAt).toLocaleDateString()} — <strong>{cfg.dual ? `${v.value}/${v.value2}` : v.value}</strong> {v.unit}
              </span>
              {editable && onDelete && (
                <IconButton size="small" color="error" onClick={() => onDelete(v.id)} aria-label="Delete reading">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
        </Box>
      )}

      {editable && (
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1.5, mt: 2 }}>
          <TextField size="small" type="date" label="Date" value={draft.measuredAt}
            onChange={(e) => setDraft({ ...draft, measuredAt: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: '0 0 150px' }} />
          <TextField size="small" type="number" label={cfg.dual ? `${cfg.v1} (${cfg.unit})` : `Value (${cfg.unit})`}
            value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            required sx={{ flex: '1 1 120px' }} />
          {cfg.dual && (
            <TextField size="small" type="number" label={`${cfg.v2} (${cfg.unit})`}
              value={draft.value2} onChange={(e) => setDraft({ ...draft, value2: e.target.value })}
              required sx={{ flex: '1 1 120px' }} />
          )}
          <Button type="submit" variant="contained" disabled={busy} startIcon={<AddIcon />} sx={{ flexShrink: 0 }}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default VitalSigns;
