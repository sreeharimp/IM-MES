import React, { useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import {
  CalendarToday as CalendarIcon,
  Description as DescriptionIcon,
  Settings as SettingsIcon,
  History as HistoryIcon,
  Inventory2 as InventoryIcon,
  Print as PrintQueueIcon,
  Style as LabelTemplateIcon,
} from '@mui/icons-material';
import type { Product, Machine } from '../../types';
import { getCurrentProductionDayStr } from './services/dateWindow';
import { PlanList } from './PlanList';
import { PrintQueue } from './PrintQueue';
import { PaperManagement } from './PaperManagement';
import { LabelTemplateEditor } from './LabelTemplateEditor';
import { ProductPackSetup } from './ProductPackSetup';
import { AuditTrailView } from './AuditTrailView';

// Custom MUI theme matching IM-MES dark palette
const imMesPlannerTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0d0f12',
      paper: '#141720',
    },
    primary: {
      main: '#4d9fff',
    },
    secondary: {
      main: '#8a92a8',
    },
    text: {
      primary: '#e2e6f0',
      secondary: '#8a92a8',
    },
    divider: '#2e3340',
  },
  typography: {
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#141720',
          borderColor: '#2e3340',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#141720',
          border: '1px solid #2e3340',
          backgroundImage: 'none',
          color: '#e2e6f0',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#1c2028',
          color: '#e2e6f0',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#2e3340',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#4d9fff',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#4d9fff',
          },
        },
        input: {
          color: '#e2e6f0',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#8a92a8',
          '&.Mui-focused': {
            color: '#4d9fff',
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: '#141720',
          border: '1px solid #2e3340',
          backgroundImage: 'none',
          color: '#e2e6f0',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: '#e2e6f0',
          '&:hover': {
            backgroundColor: '#1c2028',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(77, 159, 255, 0.15)',
            color: '#4d9fff',
            '&:hover': {
              backgroundColor: 'rgba(77, 159, 255, 0.25)',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: '#8a92a8',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#2e3340',
          color: '#e2e6f0',
        },
        head: {
          backgroundColor: '#1c2028',
          color: '#8a92a8',
          fontWeight: 700,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          color: '#8a92a8',
          '&.Mui-selected': {
            color: '#4d9fff',
          },
        },
      },
    },
  },
});

interface ProductionPlannerModuleProps {
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  products: Product[];
  machines: Machine[];
  onRefreshProducts?: () => void;
}

export const ProductionPlannerModule: React.FC<ProductionPlannerModuleProps> = ({
  currentUser,
  products,
  machines,
  onRefreshProducts,
}) => {
  // If Stores role, default to Print Queue tab (1); otherwise Production Plans (0)
  const [activeSubTab, setActiveSubTab] = useState<number>(currentUser.role === 'Stores' ? 1 : 0);
  const currentProdDay = getCurrentProductionDayStr();

  return (
    <ThemeProvider theme={imMesPlannerTheme}>
      <Box sx={{ width: '100%', py: 1 }}>
        {/* Module Sub-Header with Production Day & User Role Status */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2.5,
            borderRadius: 2,
            border: '1px solid var(--border, #2e3340)',
            bgcolor: 'var(--bg2, #141720)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                bgcolor: 'var(--blue, #4d9fff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '1rem',
              }}
            >
              PP
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)', lineHeight: 1.2 }}>
                Production Planning & Pre-Printed Labels
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                Logged in as <strong style={{ color: 'var(--text, #e2e6f0)' }}>{currentUser.name}</strong> ({currentUser.role})
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.75,
                py: 0.75,
                borderRadius: 2,
                bgcolor: 'var(--bg3, #1c2028)',
                border: '1px solid var(--border, #2e3340)',
              }}
            >
              <CalendarIcon sx={{ fontSize: 18, color: 'var(--blue, #4d9fff)' }} />
              <Box>
                <Typography variant="caption" sx={{ display: 'block', color: 'var(--text2, #8a92a8)', fontSize: '0.65rem', lineHeight: 1 }}>
                  PRODUCTION DAY (06:00-05:59)
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, color: 'var(--text, #e2e6f0)' }}>
                  {currentProdDay}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* Module Navigation Tabs */}
        <Paper elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, mb: 2.5, bgcolor: 'var(--bg2, #141720)' }}>
          <Tabs
            value={activeSubTab}
            onChange={(_, val) => setActiveSubTab(val)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 46,
              px: 1.5,
              '& .MuiTab-root': {
                minHeight: 46,
                fontSize: '0.875rem',
                fontWeight: 600,
                textTransform: 'none',
                px: 2,
                gap: 1,
                color: 'var(--text2, #8a92a8)',
                '&.Mui-selected': {
                  color: 'var(--blue, #4d9fff)',
                },
              },
              '& .MuiTabs-indicator': {
                bgcolor: 'var(--blue, #4d9fff)',
              },
            }}
          >
            <Tab icon={<DescriptionIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Production Plans" />
            <Tab icon={<PrintQueueIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Print Queue" />
            <Tab icon={<InventoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Paper Management" />
            <Tab icon={<LabelTemplateIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Label Templates" />
            <Tab icon={<SettingsIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Product Packaging Setup" />
            <Tab icon={<HistoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Print & Audit Trails" />
          </Tabs>
        </Paper>

        {/* Active Tab View */}
        <Box>
          {activeSubTab === 0 && (
            <PlanList
              products={products}
              machines={machines}
              currentUserName={currentUser.name}
              currentUserRole={currentUser.role}
              onNavigateToQueue={() => setActiveSubTab(1)}
            />
          )}
          {activeSubTab === 1 && <PrintQueue currentUserName={currentUser.name} />}
          {activeSubTab === 2 && (
            <PaperManagement
              currentUserRole={currentUser.role}
              currentUserName={currentUser.name}
            />
          )}
          {activeSubTab === 3 && (
            <LabelTemplateEditor
              currentUserRole={currentUser.role}
              currentUserName={currentUser.name}
            />
          )}
          {activeSubTab === 4 && (
            <ProductPackSetup
              products={products}
              currentUserRole={currentUser.role}
              onRefreshProducts={onRefreshProducts}
            />
          )}
          {activeSubTab === 5 && <AuditTrailView />}
        </Box>
      </Box>
    </ThemeProvider>
  );
};
