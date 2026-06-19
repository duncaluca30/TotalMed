import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Button, TextField, InputAdornment } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SearchIcon from '@mui/icons-material/Search';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../../hooks/useToast';
import { filterRecords } from '../../utils/recordSearch';

const MedicalHistory = () => {
  const { patientData, pagination, fetchMoreRecords, loadingMore } = useOutletContext();
  const showToast = useToast();
  const [search, setSearch] = useState('');

  const visibleRecords = filterRecords(patientData.medicalRecords, search);

  const handleDownloadPDF = () => {
    const recordsToPrint = patientData.medicalRecords || [];
    const allergies = patientData.allergies || [];
    const medications = patientData.medications || [];
    const births = patientData.births || [];
    if (recordsToPrint.length === 0 && allergies.length === 0 && medications.length === 0) {
      return showToast("No data to download.", "error");
    }
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(91, 79, 230); 
    doc.text("TotalMed Secure Health Vault", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(45, 52, 54); 
    doc.text(`Official Medical Records Report`, 14, 32);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 14, 38);
    
    doc.text(`Patient File: ${patientData.firstName} ${patientData.lastName}`, 14, 48);

    const sexLabel = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' }[patientData.sex] || 'Not specified';
    doc.text(`Sex: ${sexLabel}`, 14, 54);
    let startY = 60;
    if (patientData.sex === 'FEMALE') {
      const menarche = patientData.menarcheDate ? new Date(patientData.menarcheDate).toLocaleDateString() : '—';
      doc.text(`Menarche: ${menarche}   |   Menopause: ${patientData.atMenopause ? 'Yes' : 'No'}   |   Births: ${births.length}`, 14, startY);
      startY += 6;
      if (births.length > 0) {
        autoTable(doc, {
          startY,
          head: [["Birth modality", "Year"]],
          body: births.map(b => [b.modality === 'CESAREAN' ? 'Cesarean' : 'Natural', b.year || "—"]),
          theme: 'grid',
          headStyles: { fillColor: [214, 51, 108], textColor: [255, 255, 255] },
          styles: { fontSize: 9, cellPadding: 3 },
        });
        startY = doc.lastAutoTable.finalY + 6;
      }
    }
    if (allergies.length > 0) {
      autoTable(doc, {
        startY,
        head: [["Allergy", "Reaction", "Severity"]],
        body: allergies.map(a => [a.substance, a.reaction || "—", a.severity]),
        theme: 'grid',
        headStyles: { fillColor: [192, 57, 43], textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 3 },
      });
      startY = doc.lastAutoTable.finalY + 6;
    }
    if (medications.length > 0) {
      autoTable(doc, {
        startY,
        head: [["Medication", "Dosage", "Frequency"]],
        body: medications.map(m => [m.name, m.dosage || "—", m.frequency || "—"]),
        theme: 'grid',
        headStyles: { fillColor: [91, 79, 230], textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 3 },
      });
      startY = doc.lastAutoTable.finalY + 6;
    }
    const tableColumn = ["Date", "Diagnosis", "Treatment Plan", "Attending Dr.", "Clinical Notes"];
    const tableRows = [];
    recordsToPrint.forEach(record => {
      tableRows.push([
        new Date(record.createdAt).toLocaleDateString(),
        record.diagnosis,
        record.treatment || "N/A",
        `Dr. ${record.doctor?.lastName || 'Unknown'}`,
        record.notes || "None"
      ]);
    });
    autoTable(doc, {
      startY, head: [tableColumn], body: tableRows, theme: 'grid',
      headStyles: { fillColor: [91, 79, 230], textColor: [255, 255, 255] }, 
      styles: { fontSize: 9, cellPadding: 4 }, 
      columnStyles: { 4: { cellWidth: 50 } } 
    });
    doc.save(`TotalMed_Export_${patientData.lastName}_${new Date().getTime()}.pdf`);
  };

  return (
    <Box>
      <Box className="page-heading">
        <h3 style={{ margin: 0 }}>Your medical history</h3>
        <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={handleDownloadPDF}>Download PDF</Button>
      </Box>

      {patientData.medicalRecords && patientData.medicalRecords.length > 0 && (
        <TextField
          fullWidth size="small" placeholder="Search by diagnosis, treatment, notes, doctor or date…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
      )}

      {patientData.medicalRecords && patientData.medicalRecords.length > 0 ? (
        visibleRecords.length > 0 ? (
        visibleRecords.map((record) => (
          <div key={record.id} className="card card--record" style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h4 style={{ margin: 0 }}>{record.diagnosis}</h4>
              <span className="text-muted">{new Date(record.createdAt).toLocaleDateString()}</span>
            </div>
            <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>Attending Physician:</strong> Dr. {record.doctor?.lastName || 'Unknown'}</p>
            {record.treatment && <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>Treatment Plan:</strong> {record.treatment}</p>}
            {record.notes && <div className="record-notes">"{record.notes}"</div>}
          </div>
        ))
        ) : (
          <p className="text-muted" style={{ fontStyle: 'italic' }}>No records match "{search}".</p>
        )
      ) : (
        <p className="text-muted" style={{ fontStyle: 'italic' }}>Your medical vault is currently empty.</p>
      )}

      {pagination?.hasMore && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 4 }}>
          <Button 
            variant="outlined" 
            onClick={fetchMoreRecords} 
            disabled={loadingMore}
            sx={{ fontWeight: 'bold' }}
          >
            {loadingMore ? "Loading..." : "Load More Records"}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default MedicalHistory;
