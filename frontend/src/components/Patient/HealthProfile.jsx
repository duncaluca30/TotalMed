import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import HealthLists from '../Health/HealthLists';
import GynecologySection from '../Health/GynecologySection';

const HealthProfile = () => {
  const { patientData, setPatientData } = useOutletContext();
  const showToast = useToast();

  const allergies = patientData.allergies || [];
  const medications = patientData.medications || [];
  const births = patientData.births || [];

  const setAllergies = (next) => setPatientData({ ...patientData, allergies: next });
  const setMedications = (next) => setPatientData({ ...patientData, medications: next });
  const setBirths = (next) => setPatientData({ ...patientData, births: next });

  // ── Sex & gynecological profile ──
  const saveProfile = async (fields) => {
    try {
      const updated = await fetchWithAuth('/api/patient/profile', { method: 'PUT', body: JSON.stringify(fields) });
      setPatientData({ ...patientData, sex: updated.sex, atMenopause: updated.atMenopause, menarcheDate: updated.menarcheDate });
      showToast('Profile updated.', 'success');
    } catch (e) { showToast(e.message || 'Failed to update profile.', 'error'); throw e; }
  };
  const addBirth = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/patient/births', { method: 'POST', body: JSON.stringify(payload) });
      setBirths([created, ...births]);
      showToast('Birth added.', 'success');
    } catch (e) { showToast(e.message || 'Failed to add birth.', 'error'); throw e; }
  };
  const updateBirth = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/patient/births/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setBirths(births.map((b) => (b.id === id ? updated : b)));
      showToast('Birth updated.', 'success');
    } catch (e) { showToast(e.message || 'Failed to update birth.', 'error'); throw e; }
  };
  const deleteBirth = async (id) => {
    try {
      await fetchWithAuth(`/api/patient/births/${id}`, { method: 'DELETE' });
      setBirths(births.filter((b) => b.id !== id));
      showToast('Birth removed.', 'success');
    } catch (e) { showToast(e.message || 'Failed to remove birth.', 'error'); }
  };

  // ── Allergies ──
  const addAllergy = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/patient/allergies', { method: 'POST', body: JSON.stringify(payload) });
      setAllergies([created, ...allergies]);
      showToast('Allergy added.', 'success');
    } catch (e) { showToast(e.message || 'Failed to add allergy.', 'error'); throw e; }
  };
  const updateAllergy = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/patient/allergies/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setAllergies(allergies.map((a) => (a.id === id ? updated : a)));
      showToast('Allergy updated.', 'success');
    } catch (e) { showToast(e.message || 'Failed to update allergy.', 'error'); throw e; }
  };
  const deleteAllergy = async (id) => {
    try {
      await fetchWithAuth(`/api/patient/allergies/${id}`, { method: 'DELETE' });
      setAllergies(allergies.filter((a) => a.id !== id));
      showToast('Allergy removed.', 'success');
    } catch (e) { showToast(e.message || 'Failed to remove allergy.', 'error'); }
  };

  // ── Medications ──
  const addMedication = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/patient/medications', { method: 'POST', body: JSON.stringify(payload) });
      setMedications([created, ...medications]);
      showToast('Medication added.', 'success');
    } catch (e) { showToast(e.message || 'Failed to add medication.', 'error'); throw e; }
  };
  const updateMedication = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/patient/medications/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMedications(medications.map((m) => (m.id === id ? updated : m)));
      showToast('Medication updated.', 'success');
    } catch (e) { showToast(e.message || 'Failed to update medication.', 'error'); throw e; }
  };
  const deleteMedication = async (id) => {
    try {
      await fetchWithAuth(`/api/patient/medications/${id}`, { method: 'DELETE' });
      setMedications(medications.filter((m) => m.id !== id));
      showToast('Medication removed.', 'success');
    } catch (e) { showToast(e.message || 'Failed to remove medication.', 'error'); }
  };

  return (
    <Box>
      <Box className="page-heading">
        <h3 style={{ margin: 0 }}>Health profile</h3>
      </Box>
      <p className="text-muted" style={{ marginTop: 0, marginBottom: 20 }}>
        Keep this up to date — it is always shared with any doctor you grant vault access to, so they can treat you safely.
      </p>
      <div className="card" style={{ marginBottom: '20px' }}>
        <GynecologySection
          sex={patientData.sex}
          menarcheDate={patientData.menarcheDate}
          atMenopause={patientData.atMenopause}
          births={births}
          onSaveProfile={saveProfile}
          onAddBirth={addBirth}
          onUpdateBirth={updateBirth}
          onDeleteBirth={deleteBirth}
        />
      </div>

      <div className="card">
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
      </div>
    </Box>
  );
};

export default HealthProfile;
