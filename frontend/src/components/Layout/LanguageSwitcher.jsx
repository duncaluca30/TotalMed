import { useTranslation } from 'react-i18next';
import { ToggleButtonGroup, ToggleButton } from '@mui/material';

export default function LanguageSwitcher({ size = 'small', sx }) {
  const { i18n } = useTranslation();
  const current = (i18n.language || 'ro').startsWith('en') ? 'en' : 'ro';

  const change = (_e, lng) => {
    if (!lng) return;
    i18n.changeLanguage(lng);
    try { localStorage.setItem('lang', lng); } catch { /* ignore */ }
  };

  return (
    <ToggleButtonGroup
      exclusive
      size={size}
      value={current}
      onChange={change}
      aria-label="language"
      sx={{ '& .MuiToggleButton-root': { px: 1.2, py: 0.2, fontWeight: 700, lineHeight: 1.4 }, ...sx }}
    >
      <ToggleButton value="ro" aria-label="Română">RO</ToggleButton>
      <ToggleButton value="en" aria-label="English">EN</ToggleButton>
    </ToggleButtonGroup>
  );
}
