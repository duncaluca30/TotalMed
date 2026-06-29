import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button, Skeleton } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import { fetchWithAuth } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const ConsultationHistory = () => {
  const { t } = useTranslation();
  const showToast = useToast();
  const [items, setItems] = useState(null);
  const [pagination, setPagination] = useState(null);

  const load = async (page = 1) => {
    try {
      const data = await fetchWithAuth(`/api/doctor/consultations?page=${page}&limit=20`);
      setItems((prev) => (page === 1 ? data.consultations : [...(prev || []), ...data.consultations]));
      setPagination(data.pagination);
    } catch (e) { showToast(e.message || t('Failed to load consultations.'), 'error'); }
  };

  useEffect(() => { load(1); }, []);

  return (
    <div className="card" style={{ marginTop: '20px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <HistoryIcon sx={{ fontSize: 20, color: '#5b4fe6' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dark-text)' }}>{t('Recent consultations')}</Typography>
      </Box>

      {items === null ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rectangular" height={48} sx={{ borderRadius: 1 }} />)}
        </Box>
      ) : items.length === 0 ? (
        <Typography className="text-muted" sx={{ fontStyle: 'italic', fontSize: '0.9rem' }}>
          {t("You haven't added any records yet.")}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((c) => (
            <Box key={c.id} sx={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1.5,
              border: '1px solid #eee', borderRadius: '8px', px: 2, py: 1.2,
            }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, color: 'var(--dark-text)' }}>{c.patient}</Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'var(--light-text)' }}>{c.diagnosis}</Typography>
              </Box>
              <Typography sx={{ fontSize: '0.8rem', color: 'var(--light-text)', whiteSpace: 'nowrap' }}>
                {new Date(c.createdAt).toLocaleDateString()}
              </Typography>
            </Box>
          ))}
          {pagination?.hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Button variant="text" onClick={() => load(pagination.page + 1)} sx={{ textTransform: 'none' }}>{t('Load more')}</Button>
            </Box>
          )}
        </Box>
      )}
    </div>
  );
};

export default ConsultationHistory;
