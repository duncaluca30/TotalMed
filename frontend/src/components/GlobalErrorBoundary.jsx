import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Button, Typography, Box } from '@mui/material';

const ErrorFallback = ({ error, resetErrorBoundary }) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh', 
      textAlign: 'center', 
      backgroundColor: '#f8f9fa',
      p: 3 
    }}>
      <Box sx={{ backgroundColor: 'white', p: 4, borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '500px' }}>
        <Typography variant="h4" sx={{ color: '#d63031', mb: 2, fontWeight: 'bold' }}>
          ⚠️ Something went wrong
        </Typography>
        <Typography sx={{ color: '#2d3436', mb: 3 }}>
          An unexpected error occurred in the application. Don't worry, your data is secure.
        </Typography>
        <Box sx={{ backgroundColor: '#fdfbfb', p: 2, borderRadius: '4px', border: '1px solid #dfe6e9', mb: 3, overflowX: 'auto' }}>
          <pre style={{ color: '#d63031', fontSize: '0.85em', textAlign: 'left', margin: 0 }}>
            {error.message}
          </pre>
        </Box>
        <Button 
          variant="contained" 
          onClick={resetErrorBoundary}
          sx={{ backgroundColor: '#0984e3', textTransform: 'none', fontSize: '1.1rem' }}
        >
          Reload Application
        </Button>
      </Box>
    </Box>
  );
};

const GlobalErrorBoundary = ({ children }) => {
  return (
    <ErrorBoundary 
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset state by refreshing the page or routing to home
        window.location.href = '/';
      }}
    >
      {children}
    </ErrorBoundary>
  );
};

export default GlobalErrorBoundary;
