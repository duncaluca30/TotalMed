import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, TextField, InputAdornment, Autocomplete, Chip } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import MinimizeIcon from '@mui/icons-material/Minimize';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import SearchIcon from '@mui/icons-material/Search';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchWithAuth, uploadFile, downloadFile } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import HealthLists from '../Health/HealthLists';
import GynecologySection from '../Health/GynecologySection';
import AppointmentReminders from '../Health/AppointmentReminders';
import VitalSigns from '../Health/VitalSigns';
import Vaccinations from '../Health/Vaccinations';
import RecordAttachments from '../Health/RecordAttachments';
import RecordAmendments from '../Health/RecordAmendments';
import { filterRecords } from '../../utils/recordSearch';
import { ICD10_CODES, icdLabel } from '../../data/icd10';

const PatientVault = ({ doctorData, patient, vaultToken, pagination, onClose, onMinimize }) => {
  const { t } = useTranslation();
  const [newRecord, setNewRecord] = useState({ diagnosis: '', treatment: '', notes: '', icdCode: '' });
  const [recordSearch, setRecordSearch] = useState('');
  const [records, setRecords] = useState(patient.medicalRecords || []);
  const [allergies, setAllergies] = useState(patient.allergies || []);
  const [medications, setMedications] = useState(patient.medications || []);
  const [births, setBirths] = useState(patient.births || []);
  const [appointments, setAppointments] = useState(patient.appointments || []);
  const [vitalSigns, setVitalSigns] = useState(patient.vitalSigns || []);
  const [vaccinations, setVaccinations] = useState(patient.vaccinations || []);
  const [profile, setProfile] = useState({
    sex: patient.sex || null,
    menarcheDate: patient.menarcheDate || null,
    atMenopause: patient.atMenopause || false,
    menopauseDate: patient.menopauseDate || null,
  });
  const showToast = useToast();

  const vaultBody = (payload) => JSON.stringify({ ...payload, patientId: patient.id, vaultToken });

  const addAllergy = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/doctor/allergies', { method: 'POST', body: vaultBody(payload) });
      setAllergies((prev) => [created, ...prev]);
      showToast(t('Allergy added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add allergy.'), 'error'); throw e; }
  };
  const updateAllergy = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/doctor/allergies/${id}`, { method: 'PUT', body: vaultBody(payload) });
      setAllergies((prev) => prev.map((a) => (a.id === id ? updated : a)));
      showToast(t('Allergy updated.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update allergy.'), 'error'); throw e; }
  };
  const deleteAllergy = async (id) => {
    try {
      await fetchWithAuth(`/api/doctor/allergies/${id}`, { method: 'DELETE', body: vaultBody({}) });
      setAllergies((prev) => prev.filter((a) => a.id !== id));
      showToast(t('Allergy removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove allergy.'), 'error'); }
  };
  const addMedication = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/doctor/medications', { method: 'POST', body: vaultBody(payload) });
      setMedications((prev) => [created, ...prev]);
      showToast(t('Medication added.'), 'success');
      return created;
    } catch (e) { showToast(e.message || t('Failed to add medication.'), 'error'); throw e; }
  };
  const updateMedication = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/doctor/medications/${id}`, { method: 'PUT', body: vaultBody(payload) });
      setMedications((prev) => prev.map((m) => (m.id === id ? updated : m)));
      showToast(t('Medication updated.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update medication.'), 'error'); throw e; }
  };
  const deleteMedication = async (id) => {
    try {
      await fetchWithAuth(`/api/doctor/medications/${id}`, { method: 'DELETE', body: vaultBody({}) });
      setMedications((prev) => prev.filter((m) => m.id !== id));
      showToast(t('Medication removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove medication.'), 'error'); }
  };

  const saveProfile = async (fields) => {
    try {
      const updated = await fetchWithAuth('/api/doctor/patient-profile', { method: 'PUT', body: vaultBody(fields) });
      setProfile({ sex: updated.sex, menarcheDate: updated.menarcheDate, atMenopause: updated.atMenopause, menopauseDate: updated.menopauseDate });
      showToast(t('Profile updated.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update profile.'), 'error'); throw e; }
  };
  const addBirth = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/doctor/births', { method: 'POST', body: vaultBody(payload) });
      setBirths((prev) => [created, ...prev]);
      showToast(t('Birth added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add birth.'), 'error'); throw e; }
  };
  const updateBirth = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/doctor/births/${id}`, { method: 'PUT', body: vaultBody(payload) });
      setBirths((prev) => prev.map((b) => (b.id === id ? updated : b)));
      showToast(t('Birth updated.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update birth.'), 'error'); throw e; }
  };
  const deleteBirth = async (id) => {
    try {
      await fetchWithAuth(`/api/doctor/births/${id}`, { method: 'DELETE', body: vaultBody({}) });
      setBirths((prev) => prev.filter((b) => b.id !== id));
      showToast(t('Birth removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove birth.'), 'error'); }
  };

  const sortByDate = (list) => [...list].sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  const addAppointment = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/doctor/appointments', { method: 'POST', body: vaultBody(payload) });
      setAppointments((prev) => sortByDate([...prev, created]));
      showToast(t('Appointment added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add appointment.'), 'error'); throw e; }
  };
  const updateAppointment = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/doctor/appointments/${id}`, { method: 'PUT', body: vaultBody(payload) });
      setAppointments((prev) => sortByDate(prev.map((a) => (a.id === id ? updated : a))));
      showToast(t('Appointment updated.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update appointment.'), 'error'); throw e; }
  };
  const deleteAppointment = async (id) => {
    try {
      await fetchWithAuth(`/api/doctor/appointments/${id}`, { method: 'DELETE', body: vaultBody({}) });
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      showToast(t('Appointment removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove appointment.'), 'error'); }
  };

  const addVital = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/doctor/vitals', { method: 'POST', body: vaultBody(payload) });
      setVitalSigns((prev) => [...prev, created]);
      showToast(t('Reading added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add reading.'), 'error'); throw e; }
  };
  const addVaccination = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/doctor/vaccinations', { method: 'POST', body: vaultBody(payload) });
      setVaccinations((prev) => [created, ...prev]);
      showToast(t('Vaccination added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add vaccination.'), 'error'); throw e; }
  };

  const setRecordAttachments = (recordId, updater) => {
    setRecords((prev) => prev.map((r) =>
      r.id === recordId ? { ...r, attachments: updater(r.attachments || []) } : r
    ));
  };
  const uploadAttachment = async (record, file) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('recordId', record.id);
      fd.append('patientId', patient.id);
      fd.append('vaultToken', vaultToken);
      const meta = await uploadFile('/api/doctor/attachments', fd);
      setRecordAttachments(record.id, (list) => [...list, meta]);
      showToast(t('File attached.'), 'success');
    } catch (e) { showToast(e.message || t('Upload failed.'), 'error'); }
  };
  const downloadAttachment = async (att) => {
    try {
      await downloadFile(`/api/doctor/attachments/${att.id}/download?vaultToken=${encodeURIComponent(vaultToken)}`, att.fileName);
    } catch (e) { showToast(e.message || t('Download failed.'), 'error'); }
  };
  const addAmendment = async (record, text) => {
    try {
      const created = await fetchWithAuth(`/api/doctor/records/${record.id}/amendments`, { method: 'POST', body: vaultBody({ text }) });
      setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, amendments: [...(r.amendments || []), created] } : r)));
      showToast(t('Amendment added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add amendment.'), 'error'); throw e; }
  };

  const handleDownloadPDF = () => {
    if (records.length === 0 && allergies.length === 0 && medications.length === 0) {
      return showToast(t('No data to download.'), "error");
    }
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(91, 79, 230);
    doc.text("TotalMed Secure Health Vault", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(45, 52, 54);
    doc.text("Official Medical Records Report", 14, 32);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 14, 38);
    doc.text(`Patient File: ${patient.firstName} ${patient.lastName}`, 14, 48);
    doc.text(`Attending Physician: Dr. ${doctorData.firstName} ${doctorData.lastName} (${doctorData.specialty})`, 14, 54);

    const sexLabel = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' }[profile.sex] || 'Not specified';
    doc.text(`Sex: ${sexLabel}`, 14, 60);
    let cursorY = 66;
    if (profile.sex === 'FEMALE') {
      const menarche = profile.menarcheDate ? new Date(profile.menarcheDate).toLocaleDateString() : '—';
      doc.text(`Menarche: ${menarche}   |   Menopause: ${profile.atMenopause ? 'Yes' : 'No'}   |   Births: ${births.length}`, 14, cursorY);
      cursorY += 6;
      if (births.length > 0) {
        autoTable(doc, {
          startY: cursorY,
          head: [["Birth modality", "Year"]],
          body: births.map(b => [b.modality === 'CESAREAN' ? 'Cesarean' : 'Natural', b.year || "—"]),
          theme: 'grid',
          headStyles: { fillColor: [214, 51, 108], textColor: [255, 255, 255] },
          styles: { fontSize: 9, cellPadding: 3 },
        });
        cursorY = doc.lastAutoTable.finalY + 6;
      }
    }
    if (allergies.length > 0) {
      autoTable(doc, {
        startY: cursorY,
        head: [["Allergy", "Reaction", "Severity"]],
        body: allergies.map(a => [a.substance, a.reaction || "—", a.severity]),
        theme: 'grid',
        headStyles: { fillColor: [192, 57, 43], textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 3 },
      });
      cursorY = doc.lastAutoTable.finalY + 6;
    }
    if (medications.length > 0) {
      autoTable(doc, {
        startY: cursorY,
        head: [["Medication", "Dosage", "Frequency"]],
        body: medications.map(m => [m.name, m.dosage || "—", m.frequency || "—"]),
        theme: 'grid',
        headStyles: { fillColor: [91, 79, 230], textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 3 },
      });
      cursorY = doc.lastAutoTable.finalY + 6;
    }
    autoTable(doc, {
      startY: cursorY,
      head: [["Date", "Diagnosis", "Treatment Plan", "Attending Dr.", "Clinical Notes"]],
      body: records.map(record => [
        new Date(record.createdAt).toLocaleDateString(),
        record.diagnosis + (record.icdCode ? ` (${record.icdCode})` : ''),
        record.treatment || "N/A",
        `Dr. ${record.doctor?.lastName || 'Unknown'}`,
        record.notes || "None"
      ]),
      theme: 'grid',
      headStyles: { fillColor: [91, 79, 230], textColor: [255, 255, 255] },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 4: { cellWidth: 50 } }
    });
    doc.save(`TotalMed_${patient.lastName}_${patient.firstName}_${new Date().getTime()}.pdf`);
  };

  const handleLockAndExit = async () => {

    try {
      await fetchWithAuth('/api/doctor/lock-vault', {
        method: 'POST',
        body: JSON.stringify({ vaultToken }),
      });
    } catch (err) {
      /* best-effort: closing the session shouldn't block exit */
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
      showToast(t('Record successfully secured in the vault.'), "success");
      onClose();
    } catch (error) {
      showToast(error.message || t('Failed to add record.'), "error");
    }
  };

  const visibleRecords = filterRecords(records, recordSearch);

  return (
    <div className="card card--vault" style={{ marginTop: '30px', padding: 0, overflow: 'hidden' }}>
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
              {t('Vault Unlocked')}
            </Typography>
            <Typography sx={{ fontSize: '1.35em', fontWeight: 700, lineHeight: 1.2, color: 'var(--dark-text)' }}>
              {patient.firstName} {patient.lastName}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleDownloadPDF}
            size="small"
            sx={{ borderColor: '#5b4fe6', color: '#5b4fe6' }}
          >
            {t('Download PDF')}
          </Button>
          {onMinimize && (
            <Button onClick={onMinimize} variant="outlined" size="small" startIcon={<MinimizeIcon />} sx={{ borderColor: '#636e72', color: '#636e72' }}>
              {t('Minimize')}
            </Button>
          )}
          <Button onClick={handleLockAndExit} variant="outlined" color="error" size="small">{t('Lock Vault & Exit')}</Button>
        </Box>
      </Box>

      <Box sx={{ p: 3 }}>
        <Box sx={{
          backgroundColor: 'rgba(231, 76, 60, 0.05)', border: '1px solid rgba(231, 76, 60, 0.2)',
          borderRadius: '10px', p: 2.5, mb: 3,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <HealthAndSafetyOutlinedIcon sx={{ fontSize: 22, color: '#c0392b' }} />
            <Typography sx={{ fontWeight: 700, color: '#c0392b' }}>{t('Allergies & Current Medications')}</Typography>
          </Box>
          <HealthLists
            allergies={allergies}
            medications={medications}
            onAddAllergy={addAllergy}
            onUpdateAllergy={updateAllergy}
            onDeleteAllergy={deleteAllergy}
            onAddMedication={addMedication}
            onUpdateMedication={updateMedication}
            onDeleteMedication={deleteMedication}
          />
          <Box sx={{ borderTop: '1px solid rgba(231, 76, 60, 0.15)', mt: 3, pt: 3 }}>
            <GynecologySection
              sex={profile.sex}
              menarcheDate={profile.menarcheDate}
              atMenopause={profile.atMenopause}
              menopauseDate={profile.menopauseDate}
              births={births}
              onSaveProfile={saveProfile}
              onAddBirth={addBirth}
              onUpdateBirth={updateBirth}
              onDeleteBirth={deleteBirth}
            />
          </Box>
          <Box sx={{ borderTop: '1px solid rgba(231, 76, 60, 0.15)', mt: 3, pt: 3 }}>
            <AppointmentReminders
              appointments={appointments}
              onAdd={addAppointment}
              onUpdate={updateAppointment}
              onDelete={deleteAppointment}
            />
          </Box>
          <Box sx={{ borderTop: '1px solid rgba(231, 76, 60, 0.15)', mt: 3, pt: 3 }}>
            <VitalSigns vitals={vitalSigns} onAdd={addVital} />
          </Box>
          <Box sx={{ borderTop: '1px solid rgba(231, 76, 60, 0.15)', mt: 3, pt: 3 }}>
            <Vaccinations vaccinations={vaccinations} onAdd={addVaccination} />
          </Box>
        </Box>

        {/* Shared records */}
        <Typography variant="h6" sx={{ color: 'var(--dark-text)', mb: 2 }}>
          {t('Patient History')}
          <Typography component="span" sx={{ color: 'var(--light-text)', fontSize: '0.7em', fontWeight: 400, ml: 1 }}>
            ({t('{{count}} record(s) shared', { count: records.length })})
          </Typography>
        </Typography>

        {records.length > 0 && (
          <TextField
            fullWidth size="small" placeholder={t('Search by diagnosis, treatment, notes, doctor or date…')}
            value={recordSearch} onChange={(e) => setRecordSearch(e.target.value)}
            sx={{ mb: 2 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
        )}

        {records.length > 0 ? (
          visibleRecords.length > 0 ? (
          visibleRecords.map(record => (
            <div key={record.id} className="card card--record" style={{ marginBottom: '12px', boxShadow: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: '6px' }}>
                <h4 style={{ margin: 0 }}>{record.diagnosis}</h4>
                <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>{new Date(record.createdAt).toLocaleDateString()}</span>
              </div>
              {record.icdCode && (
                <Chip size="small" label={icdLabel(record.icdCode)} title={icdLabel(record.icdCode)}
                  sx={{ mb: 0.5, maxWidth: '100%', backgroundColor: 'rgba(91,79,230,0.1)', color: '#5b4fe6', fontWeight: 600 }} />
              )}
              <p style={{ margin: '4px 0', fontSize: '0.9em' }}><strong>{t('Attending:')}</strong> Dr. {record.doctor?.lastName || t('Unknown')}</p>
              {record.treatment && <p style={{ margin: '4px 0', fontSize: '0.9em' }}><strong>{t('Treatment:')}</strong> {record.treatment}</p>}
              {record.notes && <div className="record-notes">"{record.notes}"</div>}
              <RecordAttachments
                attachments={record.attachments}
                onUpload={(file) => uploadAttachment(record, file)}
                onDownload={downloadAttachment}
              />
              <RecordAmendments
                amendments={record.amendments}
                onAdd={(text) => addAmendment(record, text)}
              />
            </div>
          ))
          ) : (
            <Typography sx={{ color: 'var(--light-text)', fontStyle: 'italic', py: 2 }}>
              {t('No shared records match "{{search}}".', { search: recordSearch })}
            </Typography>
          )
        ) : (
          <Box sx={{
            textAlign: 'center', py: 4, px: 2,
            backgroundColor: '#f8f9fa', borderRadius: '8px',
            border: '1px dashed #dfe6e9',
          }}>
            <Typography sx={{ color: 'var(--light-text)', fontStyle: 'italic' }}>
              {t('The patient chose not to share any past records.')}
            </Typography>
          </Box>
        )}

        {pagination?.hasMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
            <Typography sx={{ color: '#636e72', fontSize: '0.85em', fontStyle: 'italic' }}>
              {t('{{count}} more record(s) not shown.', { count: pagination.total - records.length })}
            </Typography>
          </Box>
        )}

        <hr className="section-divider" />

        <Box component="form" onSubmit={handleAddRecord} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ color: 'var(--dark-text)', mb: 0 }}>{t('Add New Record')}</Typography>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            backgroundColor: '#fff3f3', border: '1px solid #ffd6d6',
            borderRadius: '8px', px: 2, py: 1.2,
          }}>
            <Typography sx={{ fontSize: '0.85em', color: '#c0392b' }}>
              ⚠️ {t("Adding a record will instantly secure and re-lock the patient's vault.")}
            </Typography>
          </Box>
          <TextField
            label={t('Diagnosis')}
            required
            fullWidth
            value={newRecord.diagnosis}
            onChange={(e) => setNewRecord({...newRecord, diagnosis: e.target.value})}
          />
          <Autocomplete
            options={ICD10_CODES}
            getOptionLabel={(o) => `${o.code} — ${o.description}`}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            value={ICD10_CODES.find((o) => o.code === newRecord.icdCode) || null}
            onChange={(e, option) => setNewRecord({ ...newRecord, icdCode: option ? option.code : '' })}
            renderInput={(params) => <TextField {...params} label={t('ICD-10 code (optional)')} placeholder={t('Search by code or diagnosis…')} />}
          />
          <TextField
            label={t('Treatment Plan')}
            multiline rows={2}
            fullWidth
            value={newRecord.treatment}
            onChange={(e) => setNewRecord({...newRecord, treatment: e.target.value})}
          />
          <TextField
            label={t('Clinical Notes (Private/Encrypted)')}
            multiline rows={3}
            fullWidth
            value={newRecord.notes}
            onChange={(e) => setNewRecord({...newRecord, notes: e.target.value})}
          />
          <Button type="submit" variant="contained" size="large" sx={{ backgroundColor: '#00b894', mt: 1 }}>
            {t('Save Record & Lock Vault')}
          </Button>
        </Box>
      </Box>
    </div>
  );
};

export default PatientVault;
