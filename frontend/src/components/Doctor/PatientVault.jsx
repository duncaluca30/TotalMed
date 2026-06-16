import React, { useState } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
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

  return (
    <div className="card card--vault" style={{ marginTop: '20px' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <h3 style={{ margin: 0, color: '#00b894' }}>🔓 Vault Unlocked: {patient.firstName} {patient.lastName}</h3>
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
          <Button onClick={onClose} variant="outlined" color="error" size="small">Lock Vault & Exit</Button>
        </Box>
      </Box>

      <div className="records-list">
        <h4 style={{ margin: '0 0 10px 0' }}>Patient History</h4>
        {patient.medicalRecords && patient.medicalRecords.length > 0 ? (
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            {patient.medicalRecords.map(record => (
              <li key={record.id} style={{ marginBottom: '10px' }}>
                <strong>{new Date(record.createdAt).toLocaleDateString()} - {record.diagnosis}</strong> (Dr. {record.doctor?.lastName || 'Unknown'})
                {record.treatment && <div className="text-muted">Treatment: {record.treatment}</div>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted" style={{ margin: 0, fontStyle: 'italic' }}>No past records shared by patient.</p>
        )}
        
        {pagination?.hasMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Typography sx={{ color: '#636e72', fontSize: '0.85em', fontStyle: 'italic' }}>
              {pagination.total - patient.medicalRecords.length} more record(s) not shown.
            </Typography>
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
