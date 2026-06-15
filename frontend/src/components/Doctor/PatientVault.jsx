import React, { useState } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const PatientVault = ({ doctorData, patient, vaultCode, pagination, fetchMoreRecords, loadingMore, onClose }) => {
  const [newRecord, setNewRecord] = useState({ diagnosis: '', treatment: '', notes: '' });
  const showToast = useToast();

  const handleAddRecord = async (e) => {
    e.preventDefault();
    try {
      await fetchWithAuth('/api/doctor/records', {
        method: 'POST',
        body: JSON.stringify({ ...newRecord, patientId: patient.id, code: vaultCode })
      });
      showToast("Record successfully secured in the vault.", "success");
      onClose();
    } catch (error) { 
      showToast(error.message || "Failed to add record.", "error"); 
    }
  };

  return (
    <div className="card" style={{ marginTop: '20px', backgroundColor: '#ffffff', border: '2px solid #00b894' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <h3 style={{ margin: 0, color: '#00b894' }}>🔓 Vault Unlocked: {patient.firstName} {patient.lastName}</h3>
        <Button onClick={onClose} variant="outlined" color="error" size="small">Lock Vault & Exit</Button>
      </Box>

      <div style={{ padding: '15px', backgroundColor: '#f1f2f6', borderRadius: '4px', marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#2d3436' }}>Patient History</h4>
        {patient.medicalRecords && patient.medicalRecords.length > 0 ? (
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            {patient.medicalRecords.map(record => (
              <li key={record.id} style={{ marginBottom: '10px' }}>
                <strong>{new Date(record.createdAt).toLocaleDateString()} - {record.diagnosis}</strong> (Dr. {record.doctor?.lastName || 'Unknown'})
                {record.treatment && <div style={{ fontSize: '0.9em', color: '#636e72' }}>Treatment: {record.treatment}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#636e72', margin: 0, fontStyle: 'italic' }}>No past records shared by patient.</p>
        )}
        
        {pagination?.hasMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Button 
              variant="outlined" 
              onClick={fetchMoreRecords} 
              disabled={loadingMore}
              size="small"
              sx={{ fontWeight: 'bold' }}
            >
              {loadingMore ? "Loading..." : "Load More Records"}
            </Button>
          </Box>
        )}
      </div>

      <Box component="form" onSubmit={handleAddRecord} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h6" sx={{ color: '#2d3436' }}>Add New Record</Typography>
        <Typography sx={{ fontSize: '0.85em', color: '#e74c3c', mb: 1 }}>
          * Adding a record will instantly secure and re-lock the patient's vault.
        </Typography>
        <TextField 
          label="Diagnosis" 
          required 
          fullWidth 
          value={newRecord.diagnosis} 
          onChange={(e) => setNewRecord({...newRecord, diagnosis: e.target.value})} 
        />
        <TextField 
          label="Treatment Plan" 
          multiline rows={2} 
          fullWidth 
          value={newRecord.treatment} 
          onChange={(e) => setNewRecord({...newRecord, treatment: e.target.value})} 
        />
        <TextField 
          label="Clinical Notes (Private/Encrypted)" 
          multiline rows={3} 
          fullWidth 
          value={newRecord.notes} 
          onChange={(e) => setNewRecord({...newRecord, notes: e.target.value})} 
        />
        <Button type="submit" variant="contained" size="large" sx={{ backgroundColor: '#00b894', mt: 1 }}>
          Inject Record & Lock Vault
        </Button>
      </Box>
    </div>
  );
};

export default PatientVault;
