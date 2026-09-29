import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  VerifiedUser as VerifiedIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import { LabelPrintJob } from '../../types';
import { supabase } from '../../lib/supabase';

export const AuditTrailView: React.FC = () => {
  const [printJobs, setPrintJobs] = useState<LabelPrintJob[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchAuditData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Print Jobs
      const { data: jobs, error: jobsError } = await supabase
        .from('label_print_jobs')
        .select('*')
        .order('printed_at', { ascending: false })
        .limit(50);

      if (jobsError) console.warn('Could not fetch label_print_jobs:', jobsError.message);
      setPrintJobs(jobs || []);

      // 2. Fetch System Changes audit entries
      const { data: changes, error: changesError } = await supabase
        .from('system_changes')
        .select('*')
        .or('module.eq.Production Planning,module.eq.Print Management')
        .order('changed_at', { ascending: false })
        .limit(50);

      if (changesError) console.warn('Could not fetch system_changes:', changesError.message);
      setAuditLogs(changes || []);
    } catch (err) {
      console.error('Audit fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditData();
  }, []);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Print Jobs & Regulatory Audit Trails
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            ISO 13485 compliant history of every initial print run and supervisor-authorized reprint.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchAuditData}
        >
          Refresh Logs
        </Button>
      </Box>

      {/* Print Jobs Ledger */}
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>
        Label Print Jobs History (Immutable Chain)
      </Typography>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3, mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Job Timestamp</TableCell>
              <TableCell>Job Type</TableCell>
              <TableCell>Sequence Range</TableCell>
              <TableCell align="right">Sheet Count</TableCell>
              <TableCell>Printed By</TableCell>
              <TableCell>Reviewed / Authorized By</TableCell>
              <TableCell>Reprint Reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : printJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#64748b' }}>
                  No label print jobs recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              printJobs.map((job) => (
                <TableRow key={job.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {new Date(job.printed_at).toLocaleDateString()}{' '}
                      {new Date(job.printed_at).toLocaleTimeString()}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                      ID: {job.id.slice(0, 8)}...
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      label={job.job_type.toUpperCase()}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.6875rem',
                        bgcolor: job.job_type === 'reprint' ? '#fef3c7' : '#dcfce7',
                        color: job.job_type === 'reprint' ? '#b45309' : '#15803d',
                      }}
                    />
                  </TableCell>

                  <TableCell>
                    {job.sequence_start != null && job.sequence_end != null ? (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                          Cases #{job.sequence_start} - #{job.sequence_end}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          ({job.sequence_end - job.sequence_start + 1} labels)
                        </Typography>
                      </>
                    ) : (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                          Batch Print Run
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          Queue Consolidated
                        </Typography>
                      </>
                    )}
                  </TableCell>

                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {job.sheet_count} sheet(s)
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2">{job.printed_by}</Typography>
                  </TableCell>

                  <TableCell>
                    {job.reviewed_by ? (
                      <Chip
                        icon={<VerifiedIcon sx={{ fontSize: '14px !important', color: '#0369a1 !important' }} />}
                        label={job.reviewed_by}
                        size="small"
                        sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}
                      />
                    ) : (
                      <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                        N/A (Initial Job)
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell>
                    {job.reprint_reason ? (
                      <Typography variant="body2" sx={{ color: '#b45309', fontWeight: 500 }}>
                        "{job.reprint_reason}"
                      </Typography>
                    ) : (
                      <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                        Standard Initial Run
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* System Changes Audit Entries */}
      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>
        Module Audit Trail (`system_changes` entries)
      </Typography>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Changed At</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Module / Table</TableCell>
              <TableCell>Description / Reason</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {auditLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 3, color: '#64748b' }}>
                  No system change entries recorded for planning module yet.
                </TableCell>
              </TableRow>
            ) : (
              auditLogs.map((log) => (
                <TableRow key={log.id} hover>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(log.changed_at).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={log.action} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {log.changed_by_name}
                    </Typography>
                    {log.changed_by_role && (
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        {log.changed_by_role}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {log.module} / {log.table_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{log.reason || 'N/A'}</Typography>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
