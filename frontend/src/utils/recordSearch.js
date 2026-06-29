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
