import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import CakeOutlinedIcon from '@mui/icons-material/CakeOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import SecurityCard from '../Layout/SecurityCard';

const PatientDashboard = () => {
  const { patientData, setPatientData } = useOutletContext();
  const showToast = useToast();

  const handleGenerateCode = async () => {
    try {
      const data = await fetchWithAuth('/api/patient/generate-code', { method: 'POST' });
      setPatientData({ ...patientData, accessCode: { code: data.code, expiresAt: data.expiresAt } });
      showToast("Code generated successfully!", "success");
    } catch (error) {
      showToast(error.message || "Failed to generate code.", "error");
    }
  };

  const initials = `${patientData.firstName?.[0] || ''}${patientData.lastName?.[0] || ''}`.toUpperCase();
  const dob = new Date(patientData.dateOfBirth).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const rawCode = patientData.accessCode?.code || '';
  const prettyCode = rawCode.length === 6 ? `${rawCode.slice(0, 3)} ${rawCode.slice(3)}` : rawCode;

  return (
    <Box>
      {/* Profile */}
      <div className="card card--profile">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '1.05rem' }}>
            {initials}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '1.15rem', color: 'var(--dark-text)', lineHeight: 1.25 }}>
              {patientData.firstName} {patientData.lastName}
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', color: 'var(--light-text)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CakeOutlinedIcon sx={{ fontSize: 16 }} /> Date of birth · {dob}
            </Typography>
          </Box>
          {patientData?.user?.isTwoFactorEnabled && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, background: 'rgba(0, 184, 148, 0.12)', color: '#0f6e56', px: 1.25, py: 0.5, borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600 }}>
              <VerifiedUserOutlinedIcon sx={{ fontSize: 15 }} /> 2FA on
            </Box>
          )}
        </Box>
      </div>

      <SecurityCard
        isTwoFactorEnabled={patientData?.user?.isTwoFactorEnabled}
        passkeys={patientData?.user?.passkeys || []}
        onTwoFactorEnabled={() => setPatientData({ ...patientData, user: { ...patientData.user, isTwoFactorEnabled: true } })}
        onPasskeyAdded={() => setPatientData({
          ...patientData,
          user: { ...patientData.user, passkeys: [...(patientData.user?.passkeys || []), { id: `local-${Date.now()}`, deviceType: 'platform' }] },
        })}
      />

      {/* Share medical file */}
      <div className="card card--access-code" style={{ marginTop: '20px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <VpnKeyOutlinedIcon sx={{ fontSize: 20, color: '#7c3aed' }} />
          <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: '#4c1d95' }}>Share medical file</Typography>
        </Box>
        <Typography sx={{ color: '#6b5ca8', fontSize: '0.9rem', mb: 2 }}>
          Generate a temporary 6-digit code to let a doctor view your history and add records. It expires in 60 minutes.
        </Typography>

        {!patientData.accessCode ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleGenerateCode} style={{ color: 'white', fontWeight: 600 }}>Generate code</button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontSize: '0.78rem', color: '#6b5ca8', mb: 0.5 }}>Your secure code</Typography>
              <Typography sx={{ fontSize: '2.1rem', fontWeight: 700, letterSpacing: '6px', color: '#7c3aed', lineHeight: 1 }}>{prettyCode}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.8rem', color: '#c0392b', maxWidth: 220 }}>
              Show this to your doctor. Keep this window open.
            </Typography>
          </Box>
        )}
      </div>
    </Box>
  );
};

export default PatientDashboard;
