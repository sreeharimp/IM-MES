import React from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Typography,
  LinearProgress,
  Chip,
  Stack,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Devices as DevicesIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

interface DashboardMetric {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  color: 'success' | 'warning' | 'error' | 'info' | 'primary';
  trend?: number;
  trendLabel?: string;
}

interface DashboardOverviewProps {
  metrics?: DashboardMetric[];
  machineStats?: {
    total: number;
    running: number;
    idle: number;
    maintenance: number;
  };
  recentActivity?: Array<{
    id: string;
    machine: string;
    event: string;
    timestamp: string;
    status: 'success' | 'warning' | 'error';
  }>;
}

const DashboardOverviewMUI: React.FC<DashboardOverviewProps> = ({
  metrics = [],
  machineStats = { total: 0, running: 0, idle: 0, maintenance: 0 },
  recentActivity = [],
}) => {
  const defaultMetrics: DashboardMetric[] = [
    {
      title: 'Machines Running',
      value: machineStats.running,
      unit: `/ ${machineStats.total}`,
      icon: <DevicesIcon sx={{ fontSize: 40 }} />,
      color: 'success',
      trend: 5,
      trendLabel: 'vs. yesterday',
    },
    {
      title: 'Overall Equipment Effectiveness',
      value: '87.5',
      unit: '%',
      icon: <TrendingUpIcon sx={{ fontSize: 40 }} />,
      color: 'primary',
      trend: 2.3,
      trendLabel: 'increase',
    },
    {
      title: 'Total Production',
      value: '125,450',
      unit: 'pcs',
      icon: <CheckCircleIcon sx={{ fontSize: 40 }} />,
      color: 'success',
    },
    {
      title: 'Machines in Maintenance',
      value: machineStats.maintenance,
      unit: '',
      icon: <WarningIcon sx={{ fontSize: 40 }} />,
      color: machineStats.maintenance > 0 ? 'warning' : 'success',
    },
  ];

  const displayMetrics = metrics.length > 0 ? metrics : defaultMetrics;

  return (
    <Box sx={{ p: 2 }}>
      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {displayMetrics.map((metric, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  backgroundColor: `${metric.color}.main`,
                },
              }}
            >
              <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      bgcolor: `${metric.color}.light`,
                      borderRadius: 2,
                      color: `${metric.color}.main`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {metric.icon}
                  </Box>
                  {metric.trend && (
                    <Chip
                      label={`+${metric.trend}% ${metric.trendLabel}`}
                      size="small"
                      color="success"
                      variant="outlined"
                      sx={{ height: 24, fontSize: '0.75rem' }}
                    />
                  )}
                </Box>
                <Typography color="text.secondary" sx={{ fontSize: '0.875rem', fontWeight: 600, mb: 0.5 }}>
                  {metric.title}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {metric.value}
                  </Typography>
                  {metric.unit && (
                    <Typography color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                      {metric.unit}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Machine Status Breakdown */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardHeader
              title="Machine Status"
              titleTypographyProps={{ variant: 'h6' }}
              sx={{ pb: 1 }}
            />
            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Running
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 700 }}>
                      {machineStats.running} / {machineStats.total}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={(machineStats.running / machineStats.total) * 100 || 0}
                    sx={{ height: 8, borderRadius: 4, backgroundColor: '#e0e0e0' }}
                  />
                </Box>

                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Idle
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'info.main', fontWeight: 700 }}>
                      {machineStats.idle} / {machineStats.total}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={(machineStats.idle / machineStats.total) * 100 || 0}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: '#e0e0e0',
                      '& .MuiLinearProgress-bar': { backgroundColor: '#0ea5e9' },
                    }}
                  />
                </Box>

                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Maintenance
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 700 }}>
                      {machineStats.maintenance} / {machineStats.total}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={(machineStats.maintenance / machineStats.total) * 100 || 0}
                    color="warning"
                    sx={{ height: 8, borderRadius: 4, backgroundColor: '#e0e0e0' }}
                  />
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Production Summary */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card>
            <CardHeader
              title="Production Summary"
              titleTypographyProps={{ variant: 'h6' }}
              sx={{ pb: 1 }}
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Paper
                    sx={{
                      p: 2,
                      bgcolor: '#f0fdf4',
                      border: '1px solid #dcfce7',
                      borderRadius: 1.5,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      TODAY
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 700, mt: 0.5 }}>
                      45,320
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      pieces
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Paper
                    sx={{
                      p: 2,
                      bgcolor: '#eff6ff',
                      border: '1px solid #dbeafe',
                      borderRadius: 1.5,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      THIS WEEK
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'info.main', fontWeight: 700, mt: 0.5 }}>
                      285,600
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      pieces
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <Paper
                    sx={{
                      p: 2,
                      bgcolor: '#fef3c7',
                      border: '1px solid #fde68a',
                      borderRadius: 1.5,
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      QUALITY RATE
                    </Typography>
                    <Typography variant="h6" sx={{ color: 'warning.main', fontWeight: 700, mt: 0.5 }}>
                      98.2%
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      accepted
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <Card>
          <CardHeader
            title="Recent Activity"
            titleTypographyProps={{ variant: 'h6' }}
            sx={{ pb: 1 }}
          />
          <TableContainer>
            <Table>
              <TableHead sx={{ bgcolor: '#f8fafc' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Machine</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Event</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Timestamp
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentActivity.slice(0, 5).map((activity) => (
                  <TableRow key={activity.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{activity.machine}</TableCell>
                    <TableCell>{activity.event}</TableCell>
                    <TableCell>
                      <Chip
                        label={activity.status}
                        size="small"
                        color={activity.status === 'success' ? 'success' : activity.status === 'warning' ? 'warning' : 'error'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      {activity.timestamp}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Box>
  );
};

export default DashboardOverviewMUI;
