import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, TextField, Box, List, ListItem, ListItemText, Checkbox, Button, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { filterRecords } from '../../utils/recordSearch';

// How long the doctor's vault session stays open after approval. Must match the
// allow-list the server validates in POST /access-vault.
const DURATION_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 60, label: '1 hour' },
  { value: 480, label: '8 hours' },
  { value: 1440, label: '24 hours' },
];

const AuthRequestDialog = ({ authRequest, patientData, onClose, socket }) => {
  const [popupSearch, setPopupSearch] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const [durationMinutes, setDurationMinutes] = useState(15);

  const handleAuthDecision = (approved) => {
    socket.emit('auth-response', {
      code: authRequest.code,
      approved: approved,
      sharedRecordIds: selectedRecordIds,
      durationMinutes,
    });
    onClose();
  };

  return (
    <Dialog open={!!authRequest} disableEscapeKeyDown maxWidth="sm" fullWidth>
      <DialogTitle sx={{ backgroundColor: '#5b4fe6', color: 'white', fontWeight: 'bold' }}>
        🚨 Access Request: {authRequest?.doctorName}
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <Typography sx={{ mb: 2, color: '#2d3436' }}>
          Please select the specific medical records you wish to share with this physician.
        </Typography>
        <TextField
          fullWidth size="small" label="Search by diagnosis, treatment, notes, doctor or date…" variant="outlined"
          value={popupSearch} onChange={(e) => setPopupSearch(e.target.value)} sx={{ mb: 2 }}
        />
        <Box sx={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #dfe6e9', borderRadius: '4px' }}>
          <List>
            {filterRecords(patientData?.medicalRecords || [], popupSearch)
            .map((record) => {
                const isChecked = selectedRecordIds.includes(record.id);
                return (
                  <ListItem key={record.id} button onClick={() => { 
                    isChecked 
                      ? setSelectedRecordIds(selectedRecordIds.filter(id => id !== record.id)) 
                      : setSelectedRecordIds([...selectedRecordIds, record.id]); 
                  }}>
                    <Checkbox checked={isChecked} color="primary" />
                    <ListItemText 
                      primary={<strong>{record.diagnosis}</strong>} 
                      secondary={`${new Date(record.createdAt).toLocaleDateString()} - Dr. ${record.doctor?.lastName || 'Unknown'}`} 
                    />
                  </ListItem>
                );
            })}
            {patientData?.medicalRecords?.length === 0 && (
              <Typography sx={{ p: 2, color: '#636e72', fontStyle: 'italic', textAlign: 'center' }}>
                No medical records available to share.
              </Typography>
            )}
          </List>
        </Box>

        <FormControl fullWidth size="small" sx={{ mt: 2 }}>
          <InputLabel id="vault-duration-label">Access duration</InputLabel>
          <Select
            labelId="vault-duration-label"
            label="Access duration"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          >
            {DURATION_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>
          <Typography sx={{ fontSize: '0.78rem', color: '#636e72', mt: 0.5 }}>
            The doctor can view and add records until this time runs out. You can revoke access at any moment.
          </Typography>
        </FormControl>
      </DialogContent>
      <DialogActions sx={{ p: 3, justifyContent: 'space-between', borderTop: '1px solid #dfe6e9' }}>
        <Button onClick={() => handleAuthDecision(false)} variant="outlined" color="error">Deny All Access</Button>
        <Button onClick={() => handleAuthDecision(true)} variant="contained" color="success">
          {patientData?.medicalRecords?.length === 0 
            ? "Grant Access to Empty Vault" 
            : selectedRecordIds.length === 0 
              ? "Grant Access (Hide Past History)" 
              : `Share ${selectedRecordIds.length} Selected Record(s)`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AuthRequestDialog;
