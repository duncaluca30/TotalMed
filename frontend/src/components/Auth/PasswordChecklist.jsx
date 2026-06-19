import React from 'react';
import { Box, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { PASSWORD_RULES } from '../../utils/passwordRules';

const PasswordChecklist = ({ password = '' }) => (
  <Box sx={{
    backgroundColor: '#f8f9fa', border: '1px solid #e9ecef',
    borderRadius: '8px', px: 2, py: 1.5,
  }}>
    {PASSWORD_RULES.map((rule) => {
      const met = rule.test(password);
      return (
        <Box key={rule.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
          {met
            ? <CheckCircleIcon sx={{ fontSize: 18, color: '#00b894' }} />
            : <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: '#b2bec3' }} />}
          <Typography sx={{
            fontSize: '0.85rem',
            color: met ? '#0f6e56' : '#95a5a6',
            fontWeight: met ? 600 : 400,
            transition: 'color 0.15s ease',
          }}>
            {rule.label}
          </Typography>
        </Box>
      );
    })}
  </Box>
);

export default PasswordChecklist;
