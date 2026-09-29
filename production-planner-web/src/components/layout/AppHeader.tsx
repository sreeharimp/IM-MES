import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Tabs,
  Tab,
  Chip,
  Container,
} from '@mui/material';
import {
  CalendarToday as CalendarIcon,
  Description as DescriptionIcon,
  Settings as SettingsIcon,
  History as HistoryIcon,
  Inventory2 as InventoryIcon,
  VerifiedUser as VerifiedIcon,
  Print as PrintQueueIcon,
} from '@mui/icons-material';
import { getCurrentProductionDayStr } from '../../lib/dateWindow';

interface AppHeaderProps {
  currentTab: number;
  onTabChange: (tab: number) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ currentTab, onTabChange }) => {
  const currentProdDay = getCurrentProductionDayStr();

  return (
    <AppBar position="static" elevation={0} sx={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ justifyContent: 'space-between', py: 1 }}>
          {/* Brand & Module Title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 2,
                backgroundColor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '1.25rem',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
              }}
            >
              AP
            </Box>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.2 }}>
                  AGNEY POLYSOFT
                </Typography>
                <Chip
                  icon={<VerifiedIcon sx={{ fontSize: '14px !important', color: '#0284c7 !important' }} />}
                  label="ISO 13485"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    backgroundColor: '#e0f2fe',
                    color: '#0369a1',
                    border: '1px solid #bae6fd',
                  }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 500 }}>
                Production Planning & Pre-Printed Label Engine
              </Typography>
            </Box>
          </Box>

          {/* Production Day Indicator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.75,
                py: 0.75,
                borderRadius: 2,
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <CalendarIcon sx={{ fontSize: 18, color: '#0284c7' }} />
              <Box>
                <Typography variant="caption" display="block" sx={{ color: '#64748b', fontSize: '0.6875rem', lineHeight: 1 }}>
                  PRODUCTION DAY (06:00-05:59)
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {currentProdDay}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Toolbar>

        {/* Navigation Tabs */}
        <Tabs
          value={currentTab}
          onChange={(_, val) => onTabChange(val)}
          sx={{
            minHeight: 44,
            '& .MuiTab-root': {
              minHeight: 44,
              fontSize: '0.875rem',
              fontWeight: 600,
              textTransform: 'none',
              px: 2,
              gap: 1,
              color: '#64748b',
              '&.Mui-selected': {
                color: 'primary.main',
              },
            },
          }}
        >
          <Tab icon={<DescriptionIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Production Plans" />
          <Tab icon={<PrintQueueIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Print Queue" />
          <Tab icon={<InventoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Paper Management" />
          <Tab icon={<SettingsIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Product Packaging Setup" />
          <Tab icon={<HistoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Print & Audit Trails" />
        </Tabs>
      </Container>
    </AppBar>
  );
};
