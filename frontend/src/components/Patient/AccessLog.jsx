import React, { useEffect, useState } from 'react';
import { Box, Typography, Chip, Skeleton } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';

// Friendly label + colour for each audited action.
const ACTIONS = {
  VAULT_ACCESSED: { label: 'Viewed records', color: '#5b4fe6', bg: 'rgba(91, 79, 230, 0.12)' },
  RECORD_ADDED: { label: 'Added record', color: '#0f6e56', bg: 'rgba(0, 184, 148, 0.14)' },
  ALLERGY_ADDED: { label: 'Added allergy', color: '#c0392b', bg: 'rgba(231, 76, 60, 0.14)' },
  MEDICATION_ADDED: { label: 'Added medication', color: '#b7791f', bg: 'rgba(237, 137, 54, 0.16)' },
  ATTACHMENT_ADDED: { label: 'Added attachment', color: '#0984e3', bg: 'rgba(9, 132, 227, 0.14)' },
};

const AccessLog = () => {
  const [logs, setLogs] = useState(null);
  const showToast = useToast();

  useEffect(() => {
    fetchWithAuth('/api/patient/access-log')
      .then((data) => setLogs(data.logs || []))
      .catch((e) => { showToast(e.message || 'Failed to load access log.', 'error'); setLogs([]); });
  }, [showToast]);

  return (
    <Box>
      <Box className="page-heading">
        <h3 style={{ margin: 0 }}>Access log</h3>
      </Box>
      <p className="text-muted" style={{ marginTop: 0, marginBottom: 20 }}>
        Every time a doctor views your shared records or adds something to your file, it's recorded here.
      </p>

      {logs === null ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 2 }} />)}
        </Box>
      ) : logs.length === 0 ? (
        <p className="text-muted" style={{ fontStyle: 'italic' }}>No access recorded yet.</p>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {logs.map((entry) => {
            const meta = ACTIONS[entry.action] || { label: entry.action, color: '#636e72', bg: '#f1f2f6' };
            return (
              <div key={entry.id} className="card" style={{ padding: '14px 18px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Chip label={meta.label} size="small" sx={{ backgroundColor: meta.bg, color: meta.color, fontWeight: 600 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, color: 'var(--dark-text)' }}>
                      {entry.actor}{entry.specialty ? ` · ${entry.specialty}` : ''}
                    </Typography>
                    <Typography sx={{ fontSize: '0.82rem', color: 'var(--light-text)' }}>
                      {new Date(entry.createdAt).toLocaleString()}{entry.ipAddress ? ` · IP ${entry.ipAddress}` : ''}
                    </Typography>
                  </Box>
                </Box>
              </div>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default AccessLog;
