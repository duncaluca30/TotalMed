import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Button } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../../hooks/useToast';

const MedicalHistory = () => {
  const { patientData } = useOutletContext();
  const showToast = useToast();

  const handleDownloadPDF = () => {
    const recordsToPrint = patientData.medicalRecords;
    if (!recordsToPrint || recordsToPrint.length === 0) {
      return showToast("No records to download.", "error");
    }
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(9, 132, 227); 
    doc.text("TotalMed Secure Health Vault", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(45, 52, 54); 
    doc.text(`Official Medical Records Report`, 14, 32);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 14, 38);
    
    doc.text(`Patient File: ${patientData.firstName} ${patientData.lastName}`, 14, 48);
    
    const startY = 55;
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
      headStyles: { fillColor: [9, 132, 227], textColor: [255, 255, 255] }, 
      styles: { fontSize: 9, cellPadding: 4 }, 
      columnStyles: { 4: { cellWidth: 50 } } 
    });
    doc.save(`TotalMed_Export_${patientData.lastName}_${new Date().getTime()}.pdf`);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, width: '100%', borderBottom: '2px solid #dfe6e9', paddingBottom: '10px', mb: 2 }}>
        <h3 style={{ margin: 0, color: '#2d3436' }}>📁 Your Medical History</h3>
        <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={handleDownloadPDF} sx={{ backgroundColor: '#0984e3' }}>Download Vault PDF</Button>
      </Box>
      
      {patientData.medicalRecords && patientData.medicalRecords.length > 0 ? (
        patientData.medicalRecords.map((record) => (
          <div key={record.id} className="card" style={{ borderLeft: '5px solid #0984e3', marginBottom: '15px', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, color: '#2d3436' }}>{record.diagnosis}</h4>
              <span style={{ fontSize: '0.9em', color: '#636e72' }}>{new Date(record.createdAt).toLocaleDateString()}</span>
            </div>
            <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>Attending Physician:</strong> Dr. {record.doctor?.lastName || 'Unknown'}</p>
            {record.treatment && <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>Treatment Plan:</strong> {record.treatment}</p>}
            {record.notes && <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f1f2f6', borderRadius: '4px', fontSize: '0.9em', fontStyle: 'italic' }}>"{record.notes}"</div>}
          </div>
        ))
      ) : (
        <p style={{ color: '#636e72', fontStyle: 'italic' }}>Your medical vault is currently empty.</p>
      )}
    </Box>
  );
};

export default MedicalHistory;
