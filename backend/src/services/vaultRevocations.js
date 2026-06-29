const revocations = new Map();

const activeDoctorByPatient = new Map();

function revokeVaultAccess(patientId) {
    revocations.set(patientId, Date.now());
}

function setActiveVaultDoctor(patientId, doctorUserId) {
    activeDoctorByPatient.set(patientId, doctorUserId);
}

function getActiveVaultDoctor(patientId) {
    return activeDoctorByPatient.get(patientId) || null;
}

function clearActiveVaultDoctor(patientId) {
    activeDoctorByPatient.delete(patientId);
}

function isVaultTokenRevoked(patientId, tokenIssuedAtSeconds) {
    const revokedAt = revocations.get(patientId);
    if (revokedAt == null) return false;
    return tokenIssuedAtSeconds * 1000 < revokedAt;
}

module.exports = { revokeVaultAccess, isVaultTokenRevoked, setActiveVaultDoctor, getActiveVaultDoctor, clearActiveVaultDoctor };
