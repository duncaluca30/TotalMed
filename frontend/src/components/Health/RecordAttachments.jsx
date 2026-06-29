import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Chip, Button, CircularProgress } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DownloadIcon from '@mui/icons-material/Download';

function prettySize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Renders the attachment chips for a single record plus an optional upload
// control. The parent owns the actual network calls so this stays reusable
// across the patient view and the doctor vault.
const RecordAttachments = ({ attachments = [], onUpload, onDownload, onDelete }) => {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handlePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file || !onUpload) return;
    setBusy(true);
    try { await onUpload(file); } finally { setBusy(false); }
  };

  if (attachments.length === 0 && !onUpload) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 1 }}>
      {attachments.map((att) => (
        <Chip
          key={att.id}
          icon={<DownloadIcon sx={{ fontSize: 16 }} />}
          label={`${att.fileName} · ${prettySize(att.sizeBytes)}`}
          size="small"
          variant="outlined"
          onClick={() => onDownload?.(att)}
          onDelete={onDelete ? () => onDelete(att) : undefined}
          sx={{ maxWidth: 280, cursor: 'pointer' }}
        />
      ))}
      {onUpload && (
        <>
          <input ref={inputRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handlePick} />
          <Button
            size="small"
            variant="text"
            startIcon={busy ? <CircularProgress size={14} /> : <AttachFileIcon sx={{ fontSize: 16 }} />}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            sx={{ textTransform: 'none' }}
          >
            {busy ? t('Uploading…') : t('Attach file')}
          </Button>
        </>
      )}
    </Box>
  );
};

export default RecordAttachments;
