import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box } from '@mui/material';
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

  return (
    <Box>
      <div className="card card--profile">
        <h3>Patient Profile</h3>
        <p><strong>Name:</strong> {patientData.firstName} {patientData.lastName}</p>
        <p><strong>DOB:</strong> {new Date(patientData.dateOfBirth).toLocaleDateString()}</p>
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

      <div className="card card--access-code" style={{ marginTop: '20px' }}>
        <h3>🔐 Share Medical File</h3>
        <p>Generate a temporary 6-digit code to allow a doctor to view your history and add new records. This code expires in 60 minutes.</p>
        
        {!patientData.accessCode ? (
          <button onClick={handleGenerateCode} style={{ color: 'white', fontWeight: 'bold' }}>Generate Access Code</button>
        ) : (
          <div className="access-code-display">
            <p style={{ fontSize: '1.2em', marginBottom: '5px' }}>Your Secure Code:</p>
            <h1 className="access-code-value">{patientData.accessCode.code}</h1>
            <p className="text-danger">Show this to your doctor. Do not close this window.</p>
          </div>
        )}
      </div>
    </Box>
  );
};

export default PatientDashboard;
