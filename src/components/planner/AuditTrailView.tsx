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
  Tabs,
  Tab,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  History as HistoryIcon,
  Security as SecurityIcon,
  VerifiedUser as VerifiedIcon,
} from '@mui/icons-material';
import type { LabelPrintJob } from '../../types';
import { supabase } from '../../lib/supabase';

interface SystemChangeLog {
  id: string;
  changed_at?: string;
  created_at?: string;
  changed_by_name: string;
  changed_by_role?: string;
  module: string;
  table_name: string;
  record_id?: string;
  action: string;
  reason?: string;
  new_value?: any;
}

export const AuditTrailView: React.FC = () => {
  const [tab, setTab] = useState<number>(0);
  const [printJobs, setPrintJobs] = useState<LabelPrintJob[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemChangeLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchAuditData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch system audit logs (using changed_at)
      let logsData: SystemChangeLog[] = [];
      const { data: dChanged, error: eChanged } = await supabase
        .from('system_changes')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(100);

      if (!eChanged && dChanged) {
        logsData = dChanged;
      } else {
        const { data: dFallback } = await supabase
          .from('system_changes')
          .select('*')
          .limit(100);
        logsData = (dFallback as any[]) || [];
      }
      setSystemLogs(logsData);

      // 2. Fetch label print jobs with plan info
      const { data: jobsData } = await supabase
        .from('label_print_jobs')
        .select(`
          *,
          paper:label_paper_types (name),
          plan:production_plans (batch_code, plan_date, product_id)
        `)
        .order('printed_at', { ascending: false })
        .limit(100);

      let enhancedJobs: LabelPrintJob[] = (jobsData || []).map((j: any) => ({
        ...j,
        paper_name: j.paper?.name || 'Standard Sheet',
        batch_code: j.plan?.batch_code || null,
        plan_date: j.plan?.plan_date || null,
      }));

      // If label_print_jobs has no rows yet, display print runs recorded in system_changes
      if (enhancedJobs.length === 0 && logsData.length > 0) {
        const printLogs = logsData.filter((l) =>
          ['print_labels', 'reprint_labels', 'PRINT_JOB', 'REPRINT'].includes(l.action)
        );
        const synthJobs: LabelPrintJob[] = printLogs.map((pl) => {
          let parsed: any = {};
          try {
            parsed = typeof pl.new_value === 'string' ? JSON.parse(pl.new_value) : (pl.new_value || {});
          } catch (_) {}
          return {
            id: pl.id,
            printed_at: pl.changed_at || pl.created_at || new Date().toISOString(),
            job_type: pl.action.toLowerCase().includes('reprint') ? 'reprint' : 'initial',
            sheet_count: Math.ceil((parsed.count || 1) / 18) || 1,
            label_paper_type_id: '',
            paper_name: parsed.paper || 'Avery Sheet',
            total_labels: parsed.count || 1,
            is_reprint: pl.action.toLowerCase().includes('reprint'),
            reprint_reason: pl.reason || null,
            reviewed_by: null,
            printed_by: pl.changed_by_name || 'Operator',
          };
        });
        enhancedJobs = synthJobs;
      }

      setPrintJobs(enhancedJobs);
    } catch (err: any) {
      console.error('Audit trail load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditData();
  }, []);

  return (
    <Box>
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
          Audit Trails & Print History
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
          Traceable history of all pre-printed label generation, queue print runs, reprints, and configuration changes
        </Typography>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, val) => setTab(val)}
        sx={{ mb: 2.5, borderBottom: 1, borderColor: 'var(--border, #2e3340)' }}
      >
        <Tab
          icon={<HistoryIcon fontSize="small" />}
          iconPosition="start"
          label={`Label Print Runs (${printJobs.length})`}
        />
        <Tab
          icon={<SecurityIcon fontSize="small" />}
          iconPosition="start"
          label={`System Audit Logs (${systemLogs.length})`}
        />
      </Tabs>

      {isLoading ? (
        <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : tab === 0 ? (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'var(--bg4, #252a35)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Timestamp</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Job Type</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Batch</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Case Range</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Paper Stock</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Sheets Run</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Printed By</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Justification / Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {printJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'var(--text2, #8a92a8)' }}>
                    No label print job logs recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                printJobs.map((job) => (
                  <TableRow key={job.id} hover>
                    <TableCell sx={{ color: 'var(--text2, #8a92a8)', fontSize: '0.8125rem' }}>
                      {new Date(job.printed_at).toLocaleString()}
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={job.job_type.toUpperCase()}
                        size="small"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.6875rem',
                          bgcolor: job.job_type === 'reprint' ? 'rgba(245, 166, 35, 0.15)' : 'rgba(0, 214, 143, 0.15)',
                          color: job.job_type === 'reprint' ? 'var(--amber, #f5a623)' : 'var(--green, #00d68f)',
                        }}
                      />
                    </TableCell>

                    {/* Batch column */}
                    <TableCell>
                      {(job as any).batch_code ? (
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--blue, #4d9fff)' }}>
                          {(job as any).batch_code}
                        </Typography>
                      ) : (
                        <Typography variant="caption" sx={{ color: 'var(--text3, #555e72)' }}>—</Typography>
                      )}
                    </TableCell>

                    {/* Case range column */}
                    <TableCell>
                      {job.sequence_start != null && job.sequence_end != null ? (
                        <>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                            Case #{job.sequence_start} – #{job.sequence_end}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                            ({job.sequence_end - job.sequence_start + 1} label{job.sequence_end - job.sequence_start + 1 !== 1 ? 's' : ''})
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="caption" sx={{ color: 'var(--text3, #555e72)' }}>Full batch</Typography>
                      )}
                    </TableCell>

                    <TableCell sx={{ fontWeight: 600, color: 'var(--text, #e2e6f0)' }}>{job.paper_name}</TableCell>

                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--text, #e2e6f0)' }}>
                        {job.sheet_count} sheet(s)
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" sx={{ color: 'var(--text, #e2e6f0)' }}>{job.printed_by}</Typography>
                    </TableCell>

                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)', display: 'block' }}>
                        {job.reprint_reason || 'Initial print release'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'var(--bg4, #252a35)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Timestamp</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Module</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Action</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>User / Role</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Reason / Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {systemLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'var(--text2, #8a92a8)' }}>
                    No system changes logged yet.
                  </TableCell>
                </TableRow>
              ) : (
                systemLogs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell sx={{ color: 'var(--text2, #8a92a8)', fontSize: '0.8125rem' }}>
                      {new Date(log.changed_at || log.created_at || Date.now()).toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: 'var(--text, #e2e6f0)' }}>{log.module}</TableCell>
                    <TableCell>
                      <Chip
                        label={log.action}
                        size="small"
                        sx={{ fontSize: '0.6875rem', fontWeight: 700, bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text, #e2e6f0)' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--text, #e2e6f0)' }}>
                        {log.changed_by_name}
                      </Typography>
                      {log.changed_by_role && (
                        <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                          ({log.changed_by_role})
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text2, #8a92a8)' }}>
                      {(() => {
                        let extra = '';
                        try {
                          const v = typeof log.new_value === 'string' ? JSON.parse(log.new_value) : log.new_value;
                          if (v?.batch) extra = ` (Batch: ${v.batch}${v.sequence_start != null ? `, Cases #${v.sequence_start}-#${v.sequence_end}` : ''})`;
                        } catch (_) {}
                        return (log.reason || 'System operation') + extra;
                      })()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};
