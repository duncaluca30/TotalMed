import React, { createContext, useContext, useState } from 'react';
import { Snackbar, Alert } from '@mui/material';
import { useTranslation } from 'react-i18next';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const { t } = useTranslation();
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });

  const showToast = (message, severity = 'info') => {
    setToast({ open: true, message, severity });
  };

  const handleCloseToast = (event, reason) => {
    if (reason === 'clickaway') return;
    setToast({ ...toast, open: false });
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <Snackbar 
        open={toast.open} 
        autoHideDuration={4000} 
        onClose={handleCloseToast} 
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseToast} 
          severity={toast.severity || 'info'} 
          sx={{ width: '100%', fontSize: '1.1rem', fontWeight: 'bold' }}
        >
          {/* Translate at render time so messages coming straight from the
              backend (English) are localised too. Already-translated strings
              pass through unchanged (no matching key → returns the input). */}
          {toast.message ? t(toast.message) : ''}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
