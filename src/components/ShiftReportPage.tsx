import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Machine, Crate, BatchRecord, Operator, BreakdownRecord } from '../types';
import { 
  Printer, Calendar, Clock, RefreshCw, ShieldAlert 
} from 'lucide-react';

interface MachineShiftSummary {
  machine: Machine;
  productName: string;
  productCode: string;
  batchId: string;
  operators: string[];
  binsCount: number;
  totalGross: number;
  totalRejected: number;
  totalNet: number;
  breakdownMinutes: number;
  cratesList: Crate[];
  breakdownsList: BreakdownRecord[];
}

export const ShiftReportPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    // If before 6am, default to yesterday
    if (today.getHours() < 6) {
      today.setDate(today.getDate() - 1);
    }
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const [selectedShift, setSelectedShift] = useState<string>(() => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return 'A';
    if (hour >= 14 && hour < 22) return 'B';
    return 'C';
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [shiftData, setShiftData] = useState<MachineShiftSummary[]>([]);
  const [supervisorName, setSupervisorName] = useState<string>('—');
  const [handoverRemarks, setHandoverRemarks] = useState<string>('');
  const [incomingSupervisor, setIncomingSupervisor] = useState<string>('—');

  const formatReportDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [yyyy, mm, dd] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${dd} ${months[parseInt(mm) - 1]} ${yyyy}`;
  };

  // Get shift start/end timestamps based on date and shift ID in local time
  const getShiftRange = (dateStr: string, shiftId: string) => {
    let startStr = '';
    let endStr = '';

    if (shiftId === 'A') {
      startStr = `${dateStr}T06:00:00`;
      endStr = `${dateStr}T14:00:00`;
    } else if (shiftId === 'B') {
      startStr = `${dateStr}T14:00:00`;
      endStr = `${dateStr}T22:00:00`;
    } else {
      // Shift C starts at 22:00 on the selected date, and ends at 06:00 the next day
      startStr = `${dateStr}T22:00:00`;
      const dateObj = new Date(dateStr);
      dateObj.setDate(dateObj.getDate() + 1);
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      endStr = `${yyyy}-${mm}-${dd}T06:00:00`;
    }

    return {
      start: new Date(startStr),
      end: new Date(endStr)
    };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch machines, operators, products list
      const [
        { data: machs },
        { data: opers },
        { data: summaries }
      ] = await Promise.all([
        supabase.from('machines').select('*').order('id'),
        supabase.from('operators').select('*'),
        supabase.from('shift_summaries')
          .select('*')
          .eq('shift_date', selectedDate)
          .eq('shift_id', selectedShift)
          .order('handover_time', { ascending: false })
          .limit(1)
      ]);

      const activeMachs = machs || [];
      const activeOpers = opers || [];
      setOperators(activeOpers);

      const summary = summaries && summaries.length > 0 ? summaries[0] : null;

      if (summary) {
        setSupervisorName(summary.supervisor_name || '—');
        setHandoverRemarks(summary.remarks || '');
        setIncomingSupervisor(summary.incoming_supervisor_name || '—');
      } else {
        setSupervisorName('—');
        setHandoverRemarks('');
        setIncomingSupervisor('—');
      }

      // Determine time ranges
      const { start, end } = getShiftRange(selectedDate, selectedShift);

      // 2. Fetch Crates completed during the shift window
      const { data: crates } = await supabase
        .from('crates')
        .select('*')
        .gte('end_time', start.toISOString())
        .lt('end_time', end.toISOString())
        .order('end_time', { ascending: true });

      const shiftCrates: Crate[] = (crates || []).map((c: any) => ({
        id: c.id,
        batchId: c.batch_id,
        machineId: c.machine_id,
        binNumber: c.bin_number,
        startTime: c.start_time,
        endTime: c.end_time,
        grossQty: c.gross_qty,
        startupScrap: c.startup_scrap,
        qcSample: c.qc_sample,
        netQty: c.net_qty,
        rejectedQty: c.rejected_qty || 0,
        rejectionDetails: c.rejection_details || null,
        operatorId: c.operator_id,
        supervisorId: c.supervisor_id,
        status: c.status
      }));

      // 3. Fetch Breakdowns that overlap with the shift window
      const { data: breakdowns } = await supabase
        .from('breakdown_records')
        .select('*')
        .or(`end_time.is.null,end_time.gte.${start.toISOString()}`)
        .lte('start_time', end.toISOString())
        .order('start_time', { ascending: true });

      const shiftBreakdowns: BreakdownRecord[] = (breakdowns || []).map((b: any) => ({
        id: b.id,
        machineId: b.machine_id,
        machineName: b.machine_name,
        startTime: b.start_time,
        endTime: b.end_time,
        durationMinutes: b.duration_minutes,
        reason: b.reason,
        remarks: b.remarks,
        operatorId: b.operator_id,
        supervisorName: b.supervisor_name,
        status: b.status
      }));

      // 4. Fetch all related Batch Records to map product names
      const batchIds = [...new Set(shiftCrates.map(c => c.batchId).filter(Boolean))];
      let shiftBatches: BatchRecord[] = [];
      if (batchIds.length > 0) {
        const { data: batches } = await supabase
          .from('batch_records')
          .select('*')
          .in('id', batchIds);
        
        shiftBatches = (batches || []).map((b: any) => ({
          id: b.id,
          machineId: b.machine_id,
          productId: b.product_id,
          productName: b.product_name,
          productCode: b.product_code,
          mouldId: b.mould_id,
          materialGrade: b.material_grade,
          materialBatch: b.material_batch,
          operatorId: b.operator_id,
          startTime: b.start_time,
          endTime: b.end_time,
          crates: b.crates,
          totalOutput: b.total_output || 0,
          status: b.status,
          batchDate: b.batch_date
        }));
      }

      // 5. Compile report statistics per machine
      const reportSummaries: MachineShiftSummary[] = activeMachs.map(m => {
        // Filter crates for this machine
        const mCrates = shiftCrates.filter(c => c.machineId === m.id);

        // Get unique operator IDs for this machine
        const opIds = [...new Set(mCrates.map(c => c.operatorId).filter(Boolean))];
        const mOperators = opIds.map(id => {
          const op = activeOpers.find(o => o.id === id);
          return op ? op.name : id;
        });

        // Get product details
        let pName = '—';
        let pCode = '—';
        let bId = '—';
        if (mCrates.length > 0) {
          const latestCrate = mCrates[mCrates.length - 1];
          const batch = shiftBatches.find(b => b.id === latestCrate.batchId);
          if (batch) {
            pName = batch.productName;
            pCode = batch.productCode;
            bId = batch.id;
          }
        }

        // Calculate production counts
        let totalGross = 0;
        let totalRejected = 0;
        let totalNet = 0;
        mCrates.forEach(c => {
          totalGross += (c.grossQty || 0);
          totalRejected += (c.rejectedQty || 0);
          totalNet += (c.netQty || 0);
        });

        // Filter breakdowns for this machine and calculate shift downtime overlap
        const mBreakdowns = shiftBreakdowns.filter(b => b.machineId === m.id);
        let breakdownMinutes = 0;
        mBreakdowns.forEach(b => {
          const bStart = new Date(b.startTime).getTime();
          const bEnd = b.endTime ? new Date(b.endTime).getTime() : Date.now();
          const overlapStart = Math.max(bStart, start.getTime());
          const overlapEnd = Math.min(bEnd, end.getTime());
          const diffMs = overlapEnd - overlapStart;
          if (diffMs > 0) {
            breakdownMinutes += Math.round(diffMs / 60000);
          }
        });

        return {
          machine: m,
          productName: pName,
          productCode: pCode,
          batchId: bId,
          operators: mOperators,
          binsCount: mCrates.length,
          totalGross,
          totalRejected,
          totalNet,
          breakdownMinutes,
          cratesList: mCrates,
          breakdownsList: mBreakdowns
        };
      });

      setShiftData(reportSummaries);
    } catch (err) {
      console.error("Error generating shift report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate, selectedShift]);

  // Grand totals calculations
  const grandTotalGross = shiftData.reduce((sum, item) => sum + item.totalGross, 0);
  const grandTotalRejected = shiftData.reduce((sum, item) => sum + item.totalRejected, 0);
  const grandTotalNet = shiftData.reduce((sum, item) => sum + item.totalNet, 0);
  const grandTotalBins = shiftData.reduce((sum, item) => sum + item.binsCount, 0);
  const grandTotalDowntime = shiftData.reduce((sum, item) => sum + item.breakdownMinutes, 0);
  const overallRejectionRate = grandTotalGross > 0 ? (grandTotalRejected / grandTotalGross) * 100 : 0;

  const handlePrint = () => {
    window.print();
  };

  const getCrateOperatorName = (operatorId: string) => {
    const op = operators.find(o => o.id === operatorId);
    return op ? op.name : operatorId;
  };

  return (
    <div style={{ padding: '0 4px' }}>
      <style>{`
        .report-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 20px;
          background: var(--mc-bg, rgba(255, 255, 255, 0.02));
          border: 1px solid var(--border, rgba(255,255,255,0.05));
          padding: 15px 20px;
          border-radius: 12px;
        }
        .report-paper {
          background: #ffffff;
          color: #111111;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          font-family: 'Inter', system-ui, sans-serif;
          max-width: 1000px;
          margin: 0 auto 40px auto;
          border: 1px solid #e0e0e0;
        }
        .report-header {
          border-bottom: 2px solid #111;
          padding-bottom: 15px;
          margin-bottom: 25px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .report-title {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          color: #111;
          margin: 0;
        }
        .report-meta-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 30px;
          background: #f8f9fa;
          padding: 15px;
          border-radius: 6px;
          border: 1px solid #e9ecef;
          font-size: 13px;
        }
        .report-meta-item strong {
          color: #495057;
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .report-meta-item span {
          font-size: 14px;
          font-weight: 700;
          color: #212529;
        }
        .report-section-title {
          font-size: 16px;
          font-weight: 800;
          text-transform: uppercase;
          border-bottom: 1px solid #111;
          padding-bottom: 6px;
          margin: 30px 0 15px 0;
          letter-spacing: 0.03em;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 13px;
        }
        .report-table th {
          background: #111;
          color: #fff;
          text-align: left;
          padding: 8px 10px;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.05em;
        }
        .report-table td {
          border-bottom: 1px solid #dee2e6;
          padding: 8px 10px;
          color: #212529;
        }
        .report-table tr:last-child td {
          border-bottom: 2px solid #111;
        }
        .report-table .totals-row td {
          font-weight: 800;
          background: #f8f9fa;
          border-top: 1px solid #111;
          border-bottom: 2px solid #111;
        }
        .machine-card-print {
          border: 1px solid #dee2e6;
          border-radius: 6px;
          padding: 20px;
          margin-bottom: 25px;
          page-break-inside: avoid;
        }
        .machine-header-print {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          border-bottom: 1px dashed #ced4da;
          padding-bottom: 8px;
        }
        .machine-name-print {
          font-size: 16px;
          font-weight: 800;
          color: #111;
        }
        .machine-product-print {
          font-size: 12px;
          color: #495057;
        }
        .rej-pill {
          background: #ffe3e3;
          color: #c92a2a;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          display: inline-block;
        }
        .downtime-pill {
          background: #fff3bf;
          color: #e67700;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          display: inline-block;
        }
        .report-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 25px;
        }
        .report-stat-card {
          border: 1px solid #dee2e6;
          border-radius: 6px;
          padding: 15px;
          text-align: center;
        }
        .report-stat-card .val {
          font-size: 20px;
          font-weight: 800;
          color: #111;
          margin-top: 5px;
        }
        .report-stat-card .lbl {
          font-size: 10px;
          text-transform: uppercase;
          color: #495057;
          letter-spacing: 0.05em;
          font-weight: 700;
        }
        
        @media print {
          body * {
            visibility: hidden;
          }
          .report-paper, .report-paper * {
            visibility: visible;
          }
          .report-paper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          .machine-card-print {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Screen Controls */}
      <div className="report-controls">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text3)' }}>Report Date</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Calendar size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text3)' }} />
              <input 
                type="date" 
                className="fi" 
                value={selectedDate} 
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ paddingLeft: '32px', height: '36px', fontSize: '13px', width: '150px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text3)' }}>Shift</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Clock size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text3)' }} />
              <select 
                className="fi" 
                value={selectedShift} 
                onChange={(e) => setSelectedShift(e.target.value)}
                style={{ paddingLeft: '32px', height: '36px', fontSize: '13px', width: '120px' }}
              >
                <option value="A">Shift A</option>
                <option value="B">Shift B</option>
                <option value="C">Shift C</option>
              </select>
            </div>
          </div>

          <button 
            className="btn bsec" 
            onClick={fetchData} 
            style={{ height: '36px', alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Reload
          </button>
        </div>

        <button 
          className="btn bpri" 
          onClick={handlePrint}
          style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}
          disabled={loading || shiftData.length === 0}
        >
          <Printer size={15} />
          Print / PDF
        </button>
      </div>

      {loading ? (
        <div className="loading" style={{ height: '300px' }}>
          <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
          <span style={{ marginLeft: '10px', color: 'var(--text2)' }}>Generating Shift Report...</span>
        </div>
      ) : (
        <div className="report-paper">
          {/* Report Header */}
          <div className="report-header">
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#495057', letterSpacing: '0.05em' }}>AGNEY POLYSOFT INDIA PRIVATE LIMITED</div>
              <h1 className="report-title">Shift Report</h1>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#868e96' }}>
              <div>GENERATED: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
              <div>SYSTEM STATUS: PRODUCTION CLOSED</div>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="report-meta-grid">
            <div className="report-meta-item">
              <strong>Shift Date</strong>
              <span>{formatReportDate(selectedDate)}</span>
            </div>
            <div className="report-meta-item">
              <strong>Shift ID</strong>
              <span>Shift {selectedShift} ({selectedShift === 'A' ? '06:00 - 14:00' : selectedShift === 'B' ? '14:00 - 22:00' : '22:00 - 06:00'})</span>
            </div>
            <div className="report-meta-item">
              <strong>Supervisor (On Duty)</strong>
              <span>{supervisorName}</span>
            </div>
            <div className="report-meta-item">
              <strong>Incoming Supervisor</strong>
              <span>{incomingSupervisor || '—'}</span>
            </div>
          </div>

          {/* Grand Totals Summary Cards */}
          <div className="report-summary-grid">
            <div className="report-stat-card" style={{ borderLeft: '3px solid #2b8a3e' }}>
              <div className="lbl">Total Shift Output</div>
              <div className="val">{grandTotalNet.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 400 }}>pcs</span></div>
            </div>
            <div className="report-stat-card" style={{ borderLeft: '3px solid #c92a2a' }}>
              <div className="lbl">Total Rejections</div>
              <div className="val">{grandTotalRejected.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 400 }}>pcs</span></div>
            </div>
            <div className="report-stat-card" style={{ borderLeft: '3px solid #e67700' }}>
              <div className="lbl">Rejection Rate</div>
              <div className="val">{overallRejectionRate.toFixed(2)}%</div>
            </div>
            <div className="report-stat-card" style={{ borderLeft: '3px solid #495057' }}>
              <div className="lbl">Total Downtime</div>
              <div className="val">{grandTotalDowntime} <span style={{ fontSize: '11px', fontWeight: 400 }}>mins</span></div>
            </div>
          </div>

          {/* Machine Summary Table */}
          <div className="report-section-title">Machines Production Overview</div>
          <table className="report-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th>Component Run</th>
                <th>Operator(s)</th>
                <th style={{ textAlign: 'right' }}>Bins</th>
                <th style={{ textAlign: 'right' }}>Gross Qty</th>
                <th style={{ textAlign: 'right' }}>Rejected Qty</th>
                <th style={{ textAlign: 'right' }}>Net Qty</th>
                <th style={{ textAlign: 'right' }}>Downtime</th>
                <th style={{ textAlign: 'right' }}>Rej. Rate</th>
              </tr>
            </thead>
            <tbody>
              {shiftData.map(item => {
                const rejRate = item.totalGross > 0 ? (item.totalRejected / item.totalGross) * 100 : 0;
                return (
                  <tr key={item.machine.id}>
                    <td><strong>{item.machine.name}</strong> <span style={{ fontSize: '10px', color: '#868e96' }}>({item.machine.model})</span></td>
                    <td>
                      <div>{item.productName}</div>
                      {item.batchId !== '—' && (
                        <div style={{ fontSize: '10px', color: '#868e96', marginTop: '2px' }}>
                          Batch: {item.batchId}
                        </div>
                      )}
                    </td>
                    <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.operators.join(', ')}>
                      {item.operators.join(', ') || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>{item.binsCount}</td>
                    <td style={{ textAlign: 'right' }}>{item.totalGross.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: item.totalRejected > 0 ? '#c92a2a' : 'inherit' }}>{item.totalRejected.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{item.totalNet.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      {item.breakdownMinutes > 0 ? (
                        <span className="downtime-pill">{item.breakdownMinutes}m</span>
                      ) : '0m'}
                    </td>
                    <td style={{ textAlign: 'right', color: rejRate > 1.5 ? '#c92a2a' : 'inherit' }}>
                      {rejRate > 0 ? `${rejRate.toFixed(2)}%` : '0.00%'}
                    </td>
                  </tr>
                );
              })}
              <tr className="totals-row">
                <td>TOTALS</td>
                <td>—</td>
                <td>—</td>
                <td style={{ textAlign: 'right' }}>{grandTotalBins}</td>
                <td style={{ textAlign: 'right' }}>{grandTotalGross.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: grandTotalRejected > 0 ? '#c92a2a' : 'inherit' }}>{grandTotalRejected.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{grandTotalNet.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{grandTotalDowntime}m</td>
                <td style={{ textAlign: 'right' }}>{overallRejectionRate.toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>

          {/* Machine Bin-Wise Details Tables */}
          <div className="report-section-title" style={{ marginTop: '40px' }}>Detailed Bin Logs Per Machine</div>
          {shiftData.map(item => (
            <div key={item.machine.id} className="machine-card-print">
              <div className="machine-header-print">
                <div className="machine-name-print">
                  🏭 {item.machine.name} ({item.machine.model})
                </div>
                <div className="machine-product-print">
                  <strong>COMPONENT:</strong> {item.productName} {item.batchId !== '—' && `(Batch: ${item.batchId})`}
                </div>
              </div>

              {item.cratesList.length > 0 ? (
                <table className="report-table" style={{ fontSize: '12px', marginBottom: '15px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Bin #</th>
                      <th style={{ width: '120px' }}>Operator</th>
                      <th style={{ width: '100px' }}>End Time</th>
                      <th style={{ textAlign: 'right', width: '90px' }}>Gross Qty</th>
                      <th style={{ textAlign: 'right', width: '90px' }}>Rejected</th>
                      <th style={{ textAlign: 'right', width: '90px' }}>Net Qty</th>
                      <th>Rejection Details / Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.cratesList.map(c => {
                      const endTimeLocal = new Date(c.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                      
                      // Format rejection details
                      let rejDetailsStr = '—';
                      if (c.rejectionDetails && typeof c.rejectionDetails === 'object') {
                        rejDetailsStr = Object.entries(c.rejectionDetails)
                          .map(([reason, count]) => `${reason}: ${count}`)
                          .join(', ');
                      } else if (c.rejectedQty && c.rejectedQty > 0) {
                        rejDetailsStr = `${c.rejectedQty} pcs (Unspecified reasons)`;
                      }

                      return (
                        <tr key={c.id}>
                          <td><strong>Bin {c.binNumber}</strong></td>
                          <td>{getCrateOperatorName(c.operatorId)}</td>
                          <td>{endTimeLocal}</td>
                          <td style={{ textAlign: 'right' }}>{c.grossQty?.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', color: c.rejectedQty && c.rejectedQty > 0 ? '#c92a2a' : 'inherit' }}>
                            {c.rejectedQty ? c.rejectedQty.toLocaleString() : 0}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{c.netQty?.toLocaleString()}</td>
                          <td style={{ color: c.rejectedQty && c.rejectedQty > 0 ? '#c92a2a' : '#868e96', fontSize: '11px' }}>
                            {rejDetailsStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '15px 10px', background: '#f8f9fa', borderRadius: '4px', textAlign: 'center', fontSize: '13px', color: '#868e96', marginBottom: '15px' }}>
                  No bins completed on this machine during the shift.
                </div>
              )}

              {/* Breakdowns list for this machine */}
              {item.breakdownsList.length > 0 && (
                <div style={{ marginTop: '15px', border: '1px solid #ffe3e3', background: '#fff5f5', borderRadius: '4px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#c92a2a', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <ShieldAlert size={14} /> Downtime Breakdown Logs
                  </div>
                  <table className="report-table" style={{ background: 'transparent', margin: 0, fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#c92a2a' }}>
                        <th style={{ background: 'transparent', color: '#fff' }}>Reason / Event</th>
                        <th style={{ background: 'transparent', color: '#fff' }}>Start Time</th>
                        <th style={{ background: 'transparent', color: '#fff' }}>End Time</th>
                        <th style={{ background: 'transparent', color: '#fff', textAlign: 'right' }}>Downtime</th>
                        <th style={{ background: 'transparent', color: '#fff' }}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.breakdownsList.map(b => {
                        const bStartStr = new Date(b.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        const bEndStr = b.endTime 
                          ? new Date(b.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) 
                          : 'ONGOING';
                        
                        // Calculate specific overlap with shift limits
                        const { start, end } = getShiftRange(selectedDate, selectedShift);
                        const bStartTimeVal = new Date(b.startTime).getTime();
                        const bEndTimeVal = b.endTime ? new Date(b.endTime).getTime() : Date.now();
                        const overlapStart = Math.max(bStartTimeVal, start.getTime());
                        const overlapEnd = Math.min(bEndTimeVal, end.getTime());
                        const overlapMins = Math.max(0, Math.round((overlapEnd - overlapStart) / 60000));

                        return (
                          <tr key={b.id} style={{ borderBottom: '1px solid #ffd8d8' }}>
                            <td style={{ color: '#c92a2a' }}><strong>{b.reason}</strong></td>
                            <td>{bStartStr}</td>
                            <td>{bEndStr}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#c92a2a' }}>{overlapMins} mins</td>
                            <td style={{ color: '#495057' }}>{b.remarks || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          {/* Handover Remarks & Signatures */}
          {handoverRemarks && (
            <div style={{ marginTop: '30px', border: '1px solid #ced4da', borderRadius: '6px', padding: '20px', pageBreakInside: 'avoid' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#495057', textTransform: 'uppercase', marginBottom: '8px' }}>
                Shift Handover Remarks
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#212529', fontStyle: 'italic', lineHeight: 1.5 }}>
                "{handoverRemarks}"
              </p>
            </div>
          )}

          {/* Signature Block */}
          <div style={{ marginTop: '60px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', pageBreakInside: 'avoid' }}>
            <div style={{ width: '200px', borderTop: '1px solid #111', paddingTop: '8px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700 }}>{supervisorName}</div>
              <div style={{ fontSize: '10px', color: '#868e96', marginTop: '2px' }}>OUTGOING SUPERVISOR</div>
            </div>
            <div style={{ width: '200px', borderTop: '1px solid #111', paddingTop: '8px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700 }}>{incomingSupervisor || '—'}</div>
              <div style={{ fontSize: '10px', color: '#868e96', marginTop: '2px' }}>INCOMING SUPERVISOR</div>
            </div>
            <div style={{ width: '200px', borderTop: '1px solid #111', paddingTop: '8px', textAlign: 'center' }}>
              <div style={{ height: '15px' }} />
              <div style={{ fontSize: '10px', color: '#868e96', marginTop: '2px' }}>PLANT MANAGER / QA SIGNATURE</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
