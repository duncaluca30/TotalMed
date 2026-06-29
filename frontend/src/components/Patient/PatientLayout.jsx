import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Tabs, Tab, Skeleton, Typography, Button } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import AppHeader from '../Layout/AppHeader';
import AuthRequestDialog from './AuthRequestDialog';

const PatientLayout = () => {
  const { t } = useTranslation();
  const [patientData, setPatientData] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewingDoctor, setViewingDoctor] = useState(null);
  const [viewingUntil, setViewingUntil] = useState(null); // epoch ms when the grant expires
  const [now, setNow] = useState(Date.now());

  const { logout, authRequest, setAuthRequest, socket } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchWithAuth('/api/patient/dashboard')
      .then(data => {
        setPatientData(data);
        setPagination(data.pagination);
      })
      .catch(() => logout());
  }, [logout]);

  const fetchMoreRecords = async () => {
    if (!pagination || !pagination.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = pagination.page + 1;
      const data = await fetchWithAuth(`/api/patient/dashboard?page=${nextPage}&limit=${pagination.limit}`);

      setPatientData(prev => ({
        ...prev,
        medicalRecords: [...prev.medicalRecords, ...data.medicalRecords]
      }));
      setPagination(data.pagination);
    } catch (error) {
      console.error("Failed to load more records", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!socket) return;

    const handleVaultUpdated = (data) => {
      setPatientData(prev => prev ? {
        ...prev,
        medicalRecords: [data.newRecord, ...prev.medicalRecords],
        accessCode: null
      } : prev);
      setViewingDoctor(null); // adding a record ends the viewing session
      setViewingUntil(null);
      navigate('/patient/history');
    };
    const handleViewingStarted = (data) => {
      setViewingDoctor(data?.doctorName || t('Your doctor'));
      const minutes = data?.durationMinutes || 15;
      setViewingUntil(Date.now() + minutes * 60 * 1000);
      // The access code was consumed on the server the moment access was granted.
      // Clear it locally so we don't keep showing a dead code, and so the
      // "Generate Access Code" button reappears for the next share.
      setPatientData(prev => prev ? { ...prev, accessCode: null } : prev);
    };
    const handleViewingEnded = () => { setViewingDoctor(null); setViewingUntil(null); };

    socket.on('vault-updated', handleVaultUpdated);
    socket.on('vault-viewing-started', handleViewingStarted);
    socket.on('vault-viewing-ended', handleViewingEnded);
    return () => {
      socket.off('vault-updated', handleVaultUpdated);
      socket.off('vault-viewing-started', handleViewingStarted);
      socket.off('vault-viewing-ended', handleViewingEnded);
    };
  }, [socket, navigate, t]);

  // Tick once a second while a doctor is viewing, so the countdown updates and
  // the banner clears itself the moment the grant expires.
  useEffect(() => {
    if (!viewingUntil) return;
    const id = setInterval(() => {
      const tNow = Date.now();
      setNow(tNow);
      if (tNow >= viewingUntil) { setViewingDoctor(null); setViewingUntil(null); }
    }, 1000);
    return () => clearInterval(id);
  }, [viewingUntil]);

  const handleRevokeAccess = async () => {
    try {
      await fetchWithAuth('/api/patient/revoke-access', { method: 'POST' });
      setViewingDoctor(null);
      setViewingUntil(null);
      showToast(t('Access revoked. The doctor can no longer add records.'), 'success');
    } catch (error) {
      showToast(error.message || t('Failed to revoke access.'), 'error');
    }
  };

  const currentTab = location.pathname.includes('/access-log') ? 3
    : location.pathname.includes('/history') ? 2
    : location.pathname.includes('/health') ? 1
    : 0;

  const tabLabels = [t('Dashboard & Vault Key'), t('Health Profile'), t('Medical History'), t('Access Log')];

  if (!patientData) {
    return (
      <div className="container">
        <AppHeader title="TotalMed Patient Portal" />
        <Box sx={{ width: '100%', mt: 3 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={currentTab} textColor="primary" indicatorColor="primary">
              {tabLabels.map((label) => <Tab key={label} label={label} sx={{ fontWeight: 'bold' }} />)}
            </Tabs>
          </Box>
          <div className="card" style={{ marginBottom: '20px' }}>
            <Skeleton variant="text" sx={{ fontSize: '2rem', mb: 1, width: '60%' }} />
            <Skeleton variant="text" sx={{ fontSize: '1rem', width: '40%' }} />
          </div>
          <div className="card">
            <Typography variant="h5" sx={{ mb: 2 }}><Skeleton width="30%" /></Typography>
            <Skeleton variant="rectangular" height={100} sx={{ borderRadius: 2 }} />
          </div>
        </Box>
      </div>
    );
  }

  const handleTabChange = (event, newValue) => {
    if (newValue === 0) navigate('/patient');
    if (newValue === 1) navigate('/patient/health');
    if (newValue === 2) navigate('/patient/history');
    if (newValue === 3) navigate('/patient/access-log');
  };

  return (
    <div className="container">
      <AppHeader title="TotalMed Patient Portal" />

      {viewingDoctor && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          backgroundColor: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.25)',
          borderRadius: '10px', px: 2.5, py: 1.5, mb: 2,
        }}>
          <Box sx={{
            width: 10, height: 10, borderRadius: '50%', backgroundColor: '#5b4fe6', flexShrink: 0,
            animation: 'tmPulse 1.4s ease-in-out infinite',
            '@keyframes tmPulse': {
              '0%, 100%': { opacity: 1, transform: 'scale(1)' },
              '50%': { opacity: 0.3, transform: 'scale(0.8)' },
            },
          }} />
          <Typography sx={{ color: '#5b4fe6', fontWeight: 600 }}>
            {t('{{doctor}} is currently viewing the records you shared.', { doctor: viewingDoctor })}
            {viewingUntil && (() => {
              const secs = Math.max(0, Math.round((viewingUntil - now) / 1000));
              const h = Math.floor(secs / 3600);
              const m = Math.floor((secs % 3600) / 60);
              const s = secs % 60;
              const pretty = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
              return ' ' + t('Access expires in {{time}}.', { time: pretty });
            })()}
          </Typography>
          <Button
            onClick={handleRevokeAccess}
            variant="outlined"
            color="error"
            size="small"
            sx={{ ml: 'auto', flexShrink: 0 }}
          >
            {t('Revoke Access')}
          </Button>
        </Box>
      )}

      <Box sx={{ width: '100%' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={currentTab} onChange={handleTabChange} textColor="primary" indicatorColor="primary">
            {tabLabels.map((label) => <Tab key={label} label={label} sx={{ fontWeight: 'bold' }} />)}
          </Tabs>
        </Box>

        <Outlet context={{ patientData, setPatientData, pagination, fetchMoreRecords, loadingMore }} />
      </Box>

      {authRequest && (
        <AuthRequestDialog
          authRequest={authRequest}
          patientData={patientData}
          onClose={() => setAuthRequest(null)}
          socket={socket}
        />
      )}
    </div>
  );
};

export default PatientLayout;
