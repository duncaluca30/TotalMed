import React, { useState } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const PatientVault = ({ doctorData, patient, vaultToken, pagination, onClose }) => {
  const [newRecord, setNewRecord] = useState({ diagnosis: '', treatment: '', notes: '' });
  const showToast = useToast();

  const handleDownloadPDF = () => {
    const records = patient.medicalRecords;
    if (!records || records.length === 0) {
      return showToast("No records to download.", "error");
    }
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(9, 132, 227);
    doc.text("TotalMed Secure Health Vault", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(45, 52, 54);
    doc.text("Official Medical Records Report", 14, 32);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 14, 38);
    doc.text(`Patient File: ${patient.firstName} ${patient.lastName}`, 14, 48);
    doc.text(`Attending Physician: Dr. ${doctorData.firstName} ${doctorData.lastName} (${doctorData.specialty})`, 14, 54);
    autoTable(doc, {
      startY: 62,
      head: [["Date", "Diagnosis", "Treatment Plan", "Attending Dr.", "Clinical Notes"]],
      body: records.map(record => [
        new Date(record.createdAt).toLocaleDateString(),
        record.diagnosis,
        record.treatment || "N/A",
        `Dr. ${record.doctor?.lastName || 'Unknown'}`,
        record.notes || "None"
      ]),
      theme: 'grid',
      headStyles: { fillColor: [9, 132, 227], textColor: [255, 255, 255] },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 4: { cellWidth: 50 } }
    });
    doc.save(`TotalMed_${patient.lastName}_${patient.firstName}_${new Date().getTime()}.pdf`);
  };

  const handleLockAndExit = async () => {
    // Best-effort: tell the server we're done so the patient's "doctor is viewing"
    // banner clears. Never block the UI on it.
    try {
      await fetchWithAuth('/api/doctor/lock-vault', {
        method: 'POST',
        body: JSON.stringify({ vaultToken }),
      });
    } catch (err) {
      /* non-critical */
    }
    onClose();
  };

  const handleAddRecord = async (e) => {
    e.preventDefault();
    try {
      await fetchWithAuth('/api/doctor/records', {
        method: 'POST',
        body: JSON.stringify({ ...newRecord, patientId: patient.id, vaultToken })
      });
      showToast("Record successfully secured in the vault.", "success");
      onClose();
    } catch (error) { 
      showToast(error.message || "Failed to add record.", "error"); 
    }
  };

  const records = patient.medicalRecords || [];

  return (
    <div className="card card--vault" style={{ marginTop: '30px', padding: 0, overflow: 'hidden' }}>
      {/* Header strip */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 2,
        backgroundColor: 'rgba(0, 184, 148, 0.08)',
        borderBottom: '1px solid rgba(0, 184, 148, 0.2)',
        px: 3, py: 2.5,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LockOpenIcon sx={{ fontSize: 30, color: '#00b894' }} />
          <Box>
            <Typography sx={{ fontSize: '0.8em', fontWeight: 700, letterSpacing: '1px', color: '#00b894', textTransform: 'uppercase' }}>
              Vault Unlocked
            </Typography>
            <Typography sx={{ fontSize: '1.35em', fontWeight: 700, lineHeight: 1.2, color: 'var(--dark-text)' }}>
              {patient.firstName} {patient.lastName}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleDownloadPDF}
            size="small"
            sx={{ borderColor: '#0984e3', color: '#0984e3' }}
          >
            Download PDF
          </Button>
          <Button onClick={handleLockAndExit} variant="outlined" color="error" size="small">Lock Vault & Exit</Button>
        </Box>
      </Box>

      <Box sx={{ p: 3 }}>
        {/* Shared records */}
        <Typography variant="h6" sx={{ color: 'var(--dark-text)', mb: 2 }}>
          Patient History
          <Typography component="span" sx={{ color: 'var(--light-text)', fontSize: '0.7em', fontWeight: 400, ml: 1 }}>
            ({records.length} record{records.length === 1 ? '' : 's'} shared)
          </Typography>
        </Typography>

        {records.length > 0 ? (
          records.map(record => (
            <div key={record.id} className="card card--record" style={{ marginBottom: '12px', boxShadow: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: '6px' }}>
                <h4 style={{ margin: 0 }}>{record.diagnosis}</h4>
                <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>{new Date(record.createdAt).toLocaleDateString()}</span>
              </div>
              <p style={{ margin: '4px 0', fontSize: '0.9em' }}><strong>Attending:</strong> Dr. {record.doctor?.lastName || 'Unknown'}</p>
              {record.treatment && <p style={{ margin: '4px 0', fontSize: '0.9em' }}><strong>Treatment:</strong> {record.treatment}</p>}
              {record.notes && <div className="record-notes">"{record.notes}"</div>}
            </div>
          ))
        ) : (
          <Box sx={{
            textAlign: 'center', py: 4, px: 2,
            backgroundColor: '#f8f9fa', borderRadius: '8px',
            border: '1px dashed #dfe6e9',
          }}>
            <Typography sx={{ color: 'var(--light-text)', fontStyle: 'italic' }}>
              The patient chose not to share any past records.
            </Typography>
          </Box>
        )}

        {pagination?.hasMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
            <Typography sx={{ color: '#636e72', fontSize: '0.85em', fontStyle: 'italic' }}>
              {pagination.total - records.length} more record(s) not shown.
            </Typography>
          </Box>
        )}

        <hr className="section-divider" />

        {/* Add record */}
        <Box component="form" onSubmit={handleAddRecord} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ color: 'var(--dark-text)', mb: 0 }}>Add New Record</Typography>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            backgroundColor: '#fff3f3', border: '1px solid #ffd6d6',
            borderRadius: '8px', px: 2, py: 1.2,
          }}>
            <Typography sx={{ fontSize: '0.85em', color: '#c0392b' }}>
              ⚠️ Adding a record will instantly secure and re-lock the patient's vault.
            </Typography>
          </Box>
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
            Save Record &amp; Lock Vault
          </Button>
        </Box>
      </Box>
    </div>
  );
};

export default PatientVault;
