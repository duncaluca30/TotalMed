import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, TextField, Box, List, ListItem, ListItemText, Checkbox, Button } from '@mui/material';

const AuthRequestDialog = ({ authRequest, patientData, onClose, socket }) => {
  const [popupSearch, setPopupSearch] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);

  const handleAuthDecision = (approved) => {
    socket.emit('auth-response', { 
      code: authRequest.code, 
      approved: approved, 
      sharedRecordIds: selectedRecordIds 
    });
    onClose();
  };

  return (
    <Dialog open={!!authRequest} disableEscapeKeyDown maxWidth="sm" fullWidth>
      <DialogTitle sx={{ backgroundColor: '#0984e3', color: 'white', fontWeight: 'bold' }}>
        🚨 Access Request: {authRequest?.doctorName}
      </DialogTitle>
      <DialogContent sx={{ mt: 2 }}>
        <Typography sx={{ mb: 2, color: '#2d3436' }}>
          Please select the specific medical records you wish to share with this physician.
        </Typography>
        <TextField 
          fullWidth size="small" label="Filter Diagnostics..." variant="outlined" 
          value={popupSearch} onChange={(e) => setPopupSearch(e.target.value)} sx={{ mb: 2 }} 
        />
        <Box sx={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #dfe6e9', borderRadius: '4px' }}>
          <List>
            {(patientData?.medicalRecords || [])
            .filter(record => record.diagnosis.toLowerCase().includes(popupSearch.toLowerCase()))
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
