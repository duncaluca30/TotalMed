import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, TextField, InputAdornment, Chip } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DataObjectIcon from '@mui/icons-material/DataObject';
import SearchIcon from '@mui/icons-material/Search';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from '../../hooks/useToast';
import { filterRecords } from '../../utils/recordSearch';
import { uploadFile, downloadFile, fetchWithAuth } from '../../services/api';
import RecordAttachments from '../Health/RecordAttachments';
import RecordAmendments from '../Health/RecordAmendments';
import { icdLabel } from '../../data/icd10';

const MedicalHistory = () => {
  const { t } = useTranslation();
  const { patientData, setPatientData, pagination, fetchMoreRecords, loadingMore } = useOutletContext();
  const showToast = useToast();
  const [search, setSearch] = useState('');

  const setRecordAttachments = (recordId, updater) => {
    setPatientData((prev) => ({
      ...prev,
      medicalRecords: prev.medicalRecords.map((r) =>
        r.id === recordId ? { ...r, attachments: updater(r.attachments || []) } : r
      ),
    }));
  };

  const uploadAttachment = async (record, file) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('recordId', record.id);
      const meta = await uploadFile('/api/patient/attachments', fd);
      setRecordAttachments(record.id, (list) => [...list, meta]);
      showToast(t('File attached.'), 'success');
    } catch (e) { showToast(e.message || t('Upload failed.'), 'error'); }
  };
  const downloadAttachment = async (att) => {
    try { await downloadFile(`/api/patient/attachments/${att.id}/download`, att.fileName); }
    catch (e) { showToast(e.message || t('Download failed.'), 'error'); }
  };
  const deleteAttachment = async (record, att) => {
    try {
      await fetchWithAuth(`/api/patient/attachments/${att.id}`, { method: 'DELETE' });
      setRecordAttachments(record.id, (list) => list.filter((a) => a.id !== att.id));
      showToast(t('Attachment removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove attachment.'), 'error'); }
  };

  const handleExportJson = async () => {
    try { await downloadFile('/api/patient/export', 'totalmed-export.json'); }
    catch (e) { showToast(e.message || t('Export failed.'), 'error'); }
  };

  const visibleRecords = filterRecords(patientData.medicalRecords, search);

  const handleDownloadPDF = () => {
    const recordsToPrint = patientData.medicalRecords || [];
    const allergies = patientData.allergies || [];
    const medications = patientData.medications || [];
    const births = patientData.births || [];
    if (recordsToPrint.length === 0 && allergies.length === 0 && medications.length === 0) {
      return showToast(t('No data to download.'), "error");
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
        record.diagnosis + (record.icdCode ? ` (${record.icdCode})` : ''),
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
        <h3 style={{ margin: 0 }}>{t('Your medical history')}</h3>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<DataObjectIcon />} onClick={handleExportJson}>{t('Export (JSON)')}</Button>
          <Button variant="contained" startIcon={<PictureAsPdfIcon />} onClick={handleDownloadPDF}>{t('Download PDF')}</Button>
        </Box>
      </Box>

      {patientData.medicalRecords && patientData.medicalRecords.length > 0 && (
        <TextField
          fullWidth size="small" placeholder={t('Search by diagnosis, treatment, notes, doctor or date…')}
          value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 2 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
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
            {record.icdCode && (
              <Chip size="small" label={icdLabel(record.icdCode)} title={icdLabel(record.icdCode)}
                sx={{ mb: 1, maxWidth: '100%', backgroundColor: 'rgba(91,79,230,0.1)', color: '#5b4fe6', fontWeight: 600 }} />
            )}
            <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>{t('Attending Physician:')}</strong> Dr. {record.doctor?.lastName || t('Unknown')}</p>
            {record.treatment && <p style={{ margin: '5px 0', fontSize: '0.95em' }}><strong>{t('Treatment Plan:')}</strong> {record.treatment}</p>}
            {record.notes && <div className="record-notes">"{record.notes}"</div>}
            <RecordAttachments
              attachments={record.attachments}
              onUpload={(file) => uploadAttachment(record, file)}
              onDownload={downloadAttachment}
              onDelete={(att) => deleteAttachment(record, att)}
            />
            <RecordAmendments amendments={record.amendments} />
          </div>
        ))
        ) : (
          <p className="text-muted" style={{ fontStyle: 'italic' }}>{t('No records match "{{search}}".', { search })}</p>
        )
      ) : (
        <p className="text-muted" style={{ fontStyle: 'italic' }}>{t('Your medical vault is currently empty.')}</p>
      )}

      {pagination?.hasMore && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 4 }}>
          <Button 
            variant="outlined" 
            onClick={fetchMoreRecords} 
            disabled={loadingMore}
            sx={{ fontWeight: 'bold' }}
          >
            {loadingMore ? t('Loading...') : t('Load More Records')}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default MedicalHistory;
