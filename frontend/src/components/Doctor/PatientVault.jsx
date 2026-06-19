import React, { useState } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import HealthLists from '../Health/HealthLists';
import GynecologySection from '../Health/GynecologySection';

const PatientVault = ({ doctorData, patient, vaultToken, pagination, onClose }) => {
  const [newRecord, setNewRecord] = useState({ diagnosis: '', treatment: '', notes: '' });
  const [allergies, setAllergies] = useState(patient.allergies || []);
  const [medications, setMedications] = useState(patient.medications || []);
  const [births, setBirths] = useState(patient.births || []);
  const [profile, setProfile] = useState({
    sex: patient.sex || null,
    menarcheDate: patient.menarcheDate || null,
    atMenopause: patient.atMenopause || false,
  });
  const showToast = useToast();

  // Doctor-side allergy/medication mutations carry the active vault session so
  // the server can verify the doctor still has access to this patient.
  const vaultBody = (payload) => JSON.stringify({ ...payload, patientId: patient.id, vaultToken });

  const addAllergy = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/doctor/allergies', { method: 'POST', body: vaultBody(payload) });
      setAllergies((prev) => [created, ...prev]);
      showToast('Allergy added.', 'success');
    } catch (e) { showToast(e.message || 'Failed to add allergy.', 'error'); throw e; }
  };
  const updateAllergy = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/doctor/allergies/${id}`, { method: 'PUT', body: vaultBody(payload) });
      setAllergies((prev) => prev.map((a) => (a.id === id ? updated : a)));
      showToast('Allergy updated.', 'success');
    } catch (e) { showToast(e.message || 'Failed to update allergy.', 'error'); throw e; }
  };
  const deleteAllergy = async (id) => {
    try {
      await fetchWithAuth(`/api/doctor/allergies/${id}`, { method: 'DELETE', body: vaultBody({}) });
      setAllergies((prev) => prev.filter((a) => a.id !== id));
      showToast('Allergy removed.', 'success');
    } catch (e) { showToast(e.message || 'Failed to remove allergy.', 'error'); }
  };
  const addMedication = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/doctor/medications', { method: 'POST', body: vaultBody(payload) });
      setMedications((prev) => [created, ...prev]);
      showToast('Medication added.', 'success');
    } catch (e) { showToast(e.message || 'Failed to add medication.', 'error'); throw e; }
  };
  const updateMedication = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/doctor/medications/${id}`, { method: 'PUT', body: vaultBody(payload) });
      setMedications((prev) => prev.map((m) => (m.id === id ? updated : m)));
      showToast('Medication updated.', 'success');
    } catch (e) { showToast(e.message || 'Failed to update medication.', 'error'); throw e; }
  };
  const deleteMedication = async (id) => {
    try {
      await fetchWithAuth(`/api/doctor/medications/${id}`, { method: 'DELETE', body: vaultBody({}) });
      setMedications((prev) => prev.filter((m) => m.id !== id));
      showToast('Medication removed.', 'success');
    } catch (e) { showToast(e.message || 'Failed to remove medication.', 'error'); }
  };

  const saveProfile = async (fields) => {
    try {
      const updated = await fetchWithAuth('/api/doctor/patient-profile', { method: 'PUT', body: vaultBody(fields) });
      setProfile({ sex: updated.sex, menarcheDate: updated.menarcheDate, atMenopause: updated.atMenopause });
      showToast('Profile updated.', 'success');
    } catch (e) { showToast(e.message || 'Failed to update profile.', 'error'); throw e; }
  };
  const addBirth = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/doctor/births', { method: 'POST', body: vaultBody(payload) });
      setBirths((prev) => [created, ...prev]);
      showToast('Birth added.', 'success');
    } catch (e) { showToast(e.message || 'Failed to add birth.', 'error'); throw e; }
  };
  const updateBirth = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/doctor/births/${id}`, { method: 'PUT', body: vaultBody(payload) });
      setBirths((prev) => prev.map((b) => (b.id === id ? updated : b)));
      showToast('Birth updated.', 'success');
    } catch (e) { showToast(e.message || 'Failed to update birth.', 'error'); throw e; }
  };
  const deleteBirth = async (id) => {
    try {
      await fetchWithAuth(`/api/doctor/births/${id}`, { method: 'DELETE', body: vaultBody({}) });
      setBirths((prev) => prev.filter((b) => b.id !== id));
      showToast('Birth removed.', 'success');
    } catch (e) { showToast(e.message || 'Failed to remove birth.', 'error'); }
  };

  const handleDownloadPDF = () => {
    const records = patient.medicalRecords || [];
    if (records.length === 0 && allergies.length === 0 && medications.length === 0) {
      return showToast("No data to download.", "error");
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
        record.diagnosis,
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
            sx={{ borderColor: '#5b4fe6', color: '#5b4fe6' }}
          >
            Download PDF
          </Button>
          <Button onClick={handleLockAndExit} variant="outlined" color="error" size="small">Lock Vault & Exit</Button>
        </Box>
      </Box>

      <Box sx={{ p: 3 }}>
        {/* Allergies & current medications — always shared for patient safety */}
        <Box sx={{
          backgroundColor: 'rgba(231, 76, 60, 0.05)', border: '1px solid rgba(231, 76, 60, 0.2)',
          borderRadius: '10px', p: 2.5, mb: 3,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <HealthAndSafetyOutlinedIcon sx={{ fontSize: 22, color: '#c0392b' }} />
            <Typography sx={{ fontWeight: 700, color: '#c0392b' }}>Allergies &amp; Current Medications</Typography>
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
              births={births}
              onSaveProfile={saveProfile}
              onAddBirth={addBirth}
              onUpdateBirth={updateBirth}
              onDeleteBirth={deleteBirth}
            />
          </Box>
        </Box>

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
