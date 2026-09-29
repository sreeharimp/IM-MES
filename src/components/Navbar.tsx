import React from 'react';
import {
  Box,
  Button,
  Stack,
  Drawer,
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Menu,
  MenuItem,
  Avatar,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  Logout as LogoutIcon,
  Dashboard as DashboardIcon,
  BarChart as AnalyticsIcon,
  Assessment as AssessmentIcon,
  History as HistoryIcon,
  Inventory as InventoryIcon,
  Settings as SettingsIcon,
  Info as InfoIcon,
  Build as MaintenanceIcon,
  LocalOffer as LabelIcon,
} from '@mui/icons-material';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  profile?: { fullName: string; email: string; role: string } | null;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const tabs = [
  { id: 'Shop Floor', label: 'Shop Floor', icon: DashboardIcon },
  { id: 'Overview', label: 'Dashboard', icon: AnalyticsIcon },
  { id: 'Planning & Labels', label: 'Planning & Labels', icon: LabelIcon },
  { id: 'Inspections', label: 'Inspections', icon: AssessmentIcon },
  { id: 'Batch Log', label: 'Batch Log', icon: InventoryIcon },
  { id: 'Shift Log', label: 'Shift Log', icon: HistoryIcon },
  { id: 'Breakdowns', label: 'Breakdowns', icon: MaintenanceIcon },
  { id: 'Machines', label: 'Machines', icon: SettingsIcon },
  { id: 'About', label: 'About', icon: InfoIcon },
];

const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onLogout,
  profile,
  isCollapsed = false,
  onCollapsedChange,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleTabClick = (tabId: string) => {
    onTabChange(tabId);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const sidebarContent = (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            color: 'primary.main',
            letterSpacing: -1,
            textAlign: 'center',
          }}
        >
          IM-MES
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary' }}>
          Industrial Execution Portal
        </Typography>
      </Box>
      <Divider sx={{ mb: 2 }} />

      <Stack spacing={0.5}>
        {tabs
          .filter((tab) => {
            if (tab.id === 'Machines') {
              return profile?.role === 'Admin' || profile?.role === 'PowerUser';
            }
            if (tab.id === 'Planning & Labels') {
              return ['Admin', 'PowerUser', 'Supervisor', 'Planner', 'Stores'].includes(
                profile?.role || ''
              );
            }
            return true;
          })
          .map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              variant={isActive ? 'contained' : 'text'}
              sx={{
                justifyContent: 'flex-start',
                gap: 1.5,
                textTransform: 'none',
                fontSize: '0.9rem',
                fontWeight: isActive ? 700 : 600,
                py: 1,
                px: 1.5,
                borderRadius: 1,
                color: isActive ? 'white' : 'text.primary',
                bgcolor: isActive ? 'primary.main' : 'transparent',
                '&:hover': {
                  bgcolor: isActive ? 'primary.dark' : '#f1f5f9',
                },
              }}
            >
              <Icon fontSize="small" />
              {!isCollapsed && tab.label}
            </Button>
          );
        })}
      </Stack>
    </Box>
  );

  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => (isMobile ? setMobileOpen(!mobileOpen) : onCollapsedChange?.(!isCollapsed))}
            sx={{ mr: 2 }}
          >
            {isMobile && mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </IconButton>

          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              color: 'primary.main',
              letterSpacing: -0.5,
              flex: 1,
            }}
          >
            IM-MES
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              onClick={handleMenuOpen}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                textTransform: 'none',
                color: 'text.primary',
              }}
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.9rem' }}>
                {profile?.fullName?.charAt(0).toUpperCase()}
              </Avatar>
              {!isMobile && (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {profile?.fullName}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {profile?.role}
                  </Typography>
                </Box>
              )}
            </Button>

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem disabled>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {profile?.email}
                </Typography>
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => {
                  handleMenuClose();
                  onLogout();
                }}
              >
                <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Desktop Sidebar */}
      {!isMobile && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            top: 64,
            width: isCollapsed ? 80 : 280,
            height: `calc(100vh - 64px)`,
            bgcolor: 'background.paper',
            borderRight: '1px solid #e2e8f0',
            overflowY: 'auto',
            transition: 'width 0.3s ease',
            zIndex: 1000,
          }}
        >
          {sidebarContent}
        </Box>
      )}

      {/* Mobile Drawer */}
      <Drawer anchor="left" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ zIndex: 2000 }}>
        <Box sx={{ width: 280 }}>{sidebarContent}</Box>
      </Drawer>
    </>
  );
};

export default Navbar;
