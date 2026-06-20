import React, { useEffect, useState } from 'react';
import { Box, Typography, Chip, Skeleton, Button, Table, TableBody, TableCell, TableHead, TableRow, Paper } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const StatCard = ({ label, value }) => (
  <div className="card" style={{ flex: '1 1 130px', textAlign: 'center', padding: '16px 12px' }}>
    <Typography sx={{ fontSize: '1.9rem', fontWeight: 700, color: '#5b4fe6', lineHeight: 1.1 }}>{value}</Typography>
    <Typography sx={{ fontSize: '0.82rem', color: 'var(--light-text)' }}>{label}</Typography>
  </div>
);

const AdminDashboard = () => {
  const showToast = useToast();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [emergencies, setEmergencies] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const verifyIntegrity = async () => {
    setVerifying(true);
    try {
      const result = await fetchWithAuth('/api/admin/audit-logs/verify');
      setIntegrity(result);
      showToast(result.ok ? 'Audit chain is intact.' : 'Audit chain is BROKEN.', result.ok ? 'success' : 'error');
    } catch (e) {
      showToast(e.message || 'Verification failed.', 'error');
    } finally { setVerifying(false); }
  };

  const loadLogs = async (page = 1) => {
    try {
      const data = await fetchWithAuth(`/api/admin/audit-logs?page=${page}&limit=25`);
      setLogs((prev) => (page === 1 ? data.logs : [...(prev || []), ...data.logs]));
      setPagination(data.pagination);
    } catch (e) { showToast(e.message || 'Failed to load audit logs.', 'error'); }
  };

  useEffect(() => {
    fetchWithAuth('/api/admin/stats').then(setStats).catch((e) => showToast(e.message || 'Failed to load stats.', 'error'));
    loadLogs(1);
    fetchWithAuth('/api/admin/emergency-access')
      .then((d) => setEmergencies(d.accesses || []))
      .catch((e) => showToast(e.message || 'Failed to load emergency log.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, color: 'var(--dark-text)' }}>Overview</Typography>
      {!stats ? (
        <Skeleton variant="rectangular" height={90} sx={{ borderRadius: 2, mb: 3 }} />
      ) : (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 4 }}>
          <StatCard label="Users" value={stats.users} />
          <StatCard label="Patients" value={stats.patients} />
          <StatCard label="Doctors" value={stats.doctors} />
          <StatCard label="Records" value={stats.records} />
          <StatCard label="Attachments" value={stats.attachments} />
          <StatCard label="Emergency accesses" value={stats.emergencies} />
        </Box>
      )}

      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, color: '#c0392b' }}>Emergency access (break-the-glass)</Typography>
      {!emergencies ? (
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mb: 4 }} />
      ) : emergencies.length === 0 ? (
        <p className="text-muted" style={{ fontStyle: 'italic' }}>No emergency accesses recorded.</p>
      ) : (
        <Paper variant="outlined" sx={{ mb: 4, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Doctor</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Patient notified</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {emergencies.map((e) => (
                <TableRow key={e.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{e.doctor}<br /><span style={{ color: '#636e72', fontSize: '0.8em' }}>{e.specialty}</span></TableCell>
                  <TableCell>{e.patient}</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>{e.reason}</TableCell>
                  <TableCell>
                    {e.notifiedAt
                      ? <Chip size="small" label="Sent" sx={{ backgroundColor: 'rgba(0,184,148,0.16)', color: '#0f6e56' }} />
                      : <Chip size="small" label="Pending" sx={{ backgroundColor: 'rgba(237,137,54,0.16)', color: '#b7791f' }} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--dark-text)' }}>Audit trail</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {integrity && (
            <Chip
              size="small"
              label={integrity.ok ? `Chain intact (${integrity.checked})` : `Broken at ${integrity.brokenAtId?.slice(0, 8)}…`}
              sx={integrity.ok
                ? { backgroundColor: 'rgba(0,184,148,0.16)', color: '#0f6e56', fontWeight: 600 }
                : { backgroundColor: 'rgba(231,76,60,0.16)', color: '#c0392b', fontWeight: 600 }}
            />
          )}
          <Button variant="outlined" size="small" onClick={verifyIntegrity} disabled={verifying}>
            {verifying ? 'Verifying…' : 'Verify integrity'}
          </Button>
        </Box>
      </Box>
      {!logs ? (
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
      ) : logs.length === 0 ? (
        <p className="text-muted" style={{ fontStyle: 'italic' }}>No audit entries yet.</p>
      ) : (
        <>
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>IP</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(l.createdAt).toLocaleString()}</TableCell>
                    <TableCell><Chip size="small" label={l.action} sx={{ backgroundColor: 'rgba(91,79,230,0.12)', color: '#5b4fe6', fontWeight: 600 }} /></TableCell>
                    <TableCell>{l.actorEmail}{l.actorRole ? ` (${l.actorRole})` : ''}</TableCell>
                    <TableCell>{l.ipAddress || '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 300, fontSize: '0.78em', color: '#636e72', wordBreak: 'break-word' }}>{l.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
          {pagination?.hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button variant="outlined" onClick={() => loadLogs(pagination.page + 1)}>Load more</Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default AdminDashboard;
