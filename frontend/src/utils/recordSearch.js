// Shared keyword filtering for medical records, used by the patient history,
// the share-records dialog, and the doctor's vault view so all three behave the
// same. Matches across diagnosis, treatment, clinical notes, attending doctor,
// and the formatted date. Empty/blank query returns everything.
export function filterRecords(records, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return records || [];

  return (records || []).filter((record) => {
    const haystack = [
      record.diagnosis,
      record.treatment,
      record.notes,
      record.doctor?.lastName ? `dr. ${record.doctor.lastName}` : '',
      record.createdAt ? new Date(record.createdAt).toLocaleDateString() : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}
