/**
 * In-memory registry of vault-access revocations.
 *
 * When a patient revokes an active doctor session, we record the moment of
 * revocation keyed by patientId. Any vault token that was issued BEFORE that
 * moment is then rejected when the doctor tries to add a record.
 *
 * This is intentionally in-memory: vault tokens live only 15 minutes, the
 * deployment runs a single instance (WEB_CONCURRENCY=1), and a server restart
 * simply expires every outstanding token anyway. No persistence needed.
 */
const revocations = new Map(); // patientId -> epoch ms of revocation

// patientId -> the user id (socket room) of the doctor currently holding an
// active vault session. Lets us push a real-time "access revoked" event to that
// specific doctor so their open vault page closes itself immediately.
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

/**
 * @param {string} patientId
 * @param {number} tokenIssuedAtSeconds - the JWT `iat` claim (seconds)
 * @returns {boolean} true if the token predates the latest revocation
 */
function isVaultTokenRevoked(patientId, tokenIssuedAtSeconds) {
    const revokedAt = revocations.get(patientId);
    if (revokedAt == null) return false;
    return tokenIssuedAtSeconds * 1000 < revokedAt;
}

module.exports = { revokeVaultAccess, isVaultTokenRevoked, setActiveVaultDoctor, getActiveVaultDoctor, clearActiveVaultDoctor };
