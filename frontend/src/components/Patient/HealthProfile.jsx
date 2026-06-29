import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box } from '@mui/material';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import HealthLists from '../Health/HealthLists';
import GynecologySection from '../Health/GynecologySection';
import VitalSigns from '../Health/VitalSigns';
import Vaccinations from '../Health/Vaccinations';
import EmergencyMedicalId from '../Health/EmergencyMedicalId';

const HealthProfile = () => {
  const { t } = useTranslation();
  const { patientData, setPatientData } = useOutletContext();
  const showToast = useToast();

  const allergies = patientData.allergies || [];
  const medications = patientData.medications || [];
  const births = patientData.births || [];
  const vitalSigns = patientData.vitalSigns || [];
  const vaccinations = patientData.vaccinations || [];

  const setAllergies = (next) => setPatientData({ ...patientData, allergies: next });
  const setMedications = (next) => setPatientData({ ...patientData, medications: next });
  const setBirths = (next) => setPatientData({ ...patientData, births: next });
  const setVitals = (next) => setPatientData({ ...patientData, vitalSigns: next });
  const setVaccinations = (next) => setPatientData({ ...patientData, vaccinations: next });

  const addVaccination = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/patient/vaccinations', { method: 'POST', body: JSON.stringify(payload) });
      setVaccinations([created, ...vaccinations]);
      showToast(t('Vaccination added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add vaccination.'), 'error'); throw e; }
  };
  const deleteVaccination = async (id) => {
    try {
      await fetchWithAuth(`/api/patient/vaccinations/${id}`, { method: 'DELETE' });
      setVaccinations(vaccinations.filter((v) => v.id !== id));
      showToast(t('Vaccination removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove vaccination.'), 'error'); }
  };

  const addVital = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/patient/vitals', { method: 'POST', body: JSON.stringify(payload) });
      setVitals([...vitalSigns, created]);
      showToast(t('Reading added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add reading.'), 'error'); throw e; }
  };
  const deleteVital = async (id) => {
    try {
      await fetchWithAuth(`/api/patient/vitals/${id}`, { method: 'DELETE' });
      setVitals(vitalSigns.filter((v) => v.id !== id));
      showToast(t('Reading removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove reading.'), 'error'); }
  };

  // ── Sex & gynecological profile ──
  const saveProfile = async (fields) => {
    try {
      const updated = await fetchWithAuth('/api/patient/profile', { method: 'PUT', body: JSON.stringify(fields) });
      setPatientData({ ...patientData, sex: updated.sex, atMenopause: updated.atMenopause, menarcheDate: updated.menarcheDate });
      showToast(t('Profile updated.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update profile.'), 'error'); throw e; }
  };
  const addBirth = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/patient/births', { method: 'POST', body: JSON.stringify(payload) });
      setBirths([created, ...births]);
      showToast(t('Birth added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add birth.'), 'error'); throw e; }
  };
  const updateBirth = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/patient/births/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setBirths(births.map((b) => (b.id === id ? updated : b)));
      showToast(t('Birth updated.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update birth.'), 'error'); throw e; }
  };
  const deleteBirth = async (id) => {
    try {
      await fetchWithAuth(`/api/patient/births/${id}`, { method: 'DELETE' });
      setBirths(births.filter((b) => b.id !== id));
      showToast(t('Birth removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove birth.'), 'error'); }
  };

  // ── Allergies ──
  const addAllergy = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/patient/allergies', { method: 'POST', body: JSON.stringify(payload) });
      setAllergies([created, ...allergies]);
      showToast(t('Allergy added.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to add allergy.'), 'error'); throw e; }
  };
  const updateAllergy = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/patient/allergies/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setAllergies(allergies.map((a) => (a.id === id ? updated : a)));
      showToast(t('Allergy updated.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update allergy.'), 'error'); throw e; }
  };
  const deleteAllergy = async (id) => {
    try {
      await fetchWithAuth(`/api/patient/allergies/${id}`, { method: 'DELETE' });
      setAllergies(allergies.filter((a) => a.id !== id));
      showToast(t('Allergy removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove allergy.'), 'error'); }
  };

  // ── Medications ──
  const addMedication = async (payload) => {
    try {
      const created = await fetchWithAuth('/api/patient/medications', { method: 'POST', body: JSON.stringify(payload) });
      setMedications([created, ...medications]);
      showToast(t('Medication added.'), 'success');
      return created;
    } catch (e) { showToast(e.message || t('Failed to add medication.'), 'error'); throw e; }
  };
  const updateMedication = async (id, payload) => {
    try {
      const updated = await fetchWithAuth(`/api/patient/medications/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMedications(medications.map((m) => (m.id === id ? updated : m)));
      showToast(t('Medication updated.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update medication.'), 'error'); throw e; }
  };
  const deleteMedication = async (id) => {
    try {
      await fetchWithAuth(`/api/patient/medications/${id}`, { method: 'DELETE' });
      setMedications(medications.filter((m) => m.id !== id));
      showToast(t('Medication removed.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to remove medication.'), 'error'); }
  };
  const toggleMedicationReminder = async (id, enabled) => {
    try {
      const updated = await fetchWithAuth(`/api/patient/medications/${id}/reminder`, { method: 'POST', body: JSON.stringify({ enabled }) });
      setMedications(medications.map((m) => (m.id === id ? updated : m)));
      showToast(enabled ? t('Daily reminder on.') : t('Daily reminder off.'), 'success');
    } catch (e) { showToast(e.message || t('Failed to update reminder.'), 'error'); }
  };

  return (
    <Box>
      <Box className="page-heading">
        <h3 style={{ margin: 0 }}>{t('Health profile')}</h3>
      </Box>
      <p className="text-muted" style={{ marginTop: 0, marginBottom: 20 }}>
        {t('Keep this up to date — it is always shared with any doctor you grant vault access to, so they can treat you safely.')}
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
          onToggleMedicationReminder={toggleMedicationReminder}
        />
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <VitalSigns vitals={vitalSigns} onAdd={addVital} onDelete={deleteVital} />
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <Vaccinations vaccinations={vaccinations} onAdd={addVaccination} onDelete={deleteVaccination} />
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <EmergencyMedicalId />
      </div>
    </Box>
  );
};

export default HealthProfile;
