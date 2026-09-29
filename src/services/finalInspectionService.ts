import { supabase } from '../lib/supabase';
import { logSystemChange } from '../utils/systemChanges';

export interface FinalInspectionPacket {
  packet_id: string;
  quantity: number;
  product_id?: string;
  product_name?: string;
  batch_code?: string;
  scanned_at: string;
  status: 'PENDING' | 'VALID' | 'INVALID';
  error_reason?: string;
}

export interface FinalInspectionSession {
  session_id: string;
  inspector_id: string;
  inspector_name: string;
  inspector_role: string;
  packets: FinalInspectionPacket[];
  total_quantity: number;
  started_at: string;
}

export interface FinalInspectionRecord {
  id: string;
  session_id: string;
  packet_id: string;
  plan_id?: string;
  product_id?: string;
  product_name?: string;
  batch_code?: string;
  quantity: number;
  inspector_id: string;
  inspector_name: string;
  inspector_role: string;
  status: 'PASSED' | 'REJECTED' | 'HELD';
  defect_notes?: string;
  device_info?: string;
  inspected_at: string;
}

export interface FinalInspectionSubmissionResult {
  success: boolean;
  count?: number;
  total_quantity?: number;
  session_id?: string;
  inspector?: string;
  timestamp?: string;
  error?: string;
  errors?: { packet_id: string; reason: string }[];
}

// â”€â”€ In-Memory Fast Lookup Cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class PacketLookupCache {
  private static cache: Map<string, { quantity: number; product_id?: string; product_name?: string; batch_code?: string; plan_id?: string; status?: string }> = new Map();
  

  static async refresh(): Promise<void> {
    try {
      const [{ data: labels }, { data: pkts }] = await Promise.all([
        supabase
          .from('production_plan_labels')
          .select('id, plan_id, sequence_number, expected_quantity, qr_payload, status, production_plans(product_id, batch_code, products(name))')
          .limit(2000),
        supabase
          .from('packets')
          .select('id, batch_id, product_id, product_name, quantity, status')
          .limit(2000)
      ]);

      if (labels) {
        for (const l of labels as any[]) {
          const qr = (l.qr_payload || '').trim();
          if (qr) {
            this.cache.set(qr.toUpperCase(), {
              quantity: l.expected_quantity || 1000,
              product_id: l.production_plans?.product_id,
              product_name: l.production_plans?.products?.name || 'Medical Connector',
              batch_code: l.production_plans?.batch_code,
              plan_id: l.plan_id,
              status: l.status
            });
          }
        }
      }

      if (pkts) {
        for (const p of pkts) {
          const id = (p.id || '').trim();
          if (id) {
            const existing = this.cache.get(id.toUpperCase());
            this.cache.set(id.toUpperCase(), {
              quantity: p.quantity || existing?.quantity || 1000,
              product_id: p.product_id || existing?.product_id,
              product_name: p.product_name || existing?.product_name || 'Medical Connector',
              batch_code: p.batch_id || existing?.batch_code,
              status: p.status || existing?.status
            });
          }
        }
      }

      
    } catch (err) {
      console.warn('[PacketLookupCache] Lookup cache preload warning:', err);
    }
  }

  static lookup(packetId: string): { quantity: number; product_id?: string; product_name?: string; batch_code?: string; status?: string } | null {
    const key = packetId.trim().toUpperCase();
    return this.cache.get(key) || null;
  }
}

// â”€â”€ Web Audio Feedback Generator (0ms Latency, zero dependencies) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class AudioFeedbackService {
  private static audioCtx: AudioContext | null = null;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Crisp 880Hz industrial success chime
   */
  static playSuccess(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.06); // D6 note

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  /**
   * Dual-tone duplicate warning sound (440Hz -> 330Hz)
   */
  static playDuplicate(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.06);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  /**
   * Low buzz error sound (220Hz)
   */
  static playError(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  static triggerHaptic(type: 'success' | 'warning' | 'error' = 'success'): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'success') {
        navigator.vibrate([40]);
      } else if (type === 'warning') {
        navigator.vibrate([40, 40, 40]);
      } else {
        navigator.vibrate([80, 50, 80]);
      }
    }
  }
}

// â”€â”€ FINAL INSPECTION SERVICE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export class FinalInspectionService {
  private static LOCAL_STORAGE_KEY = 'im_mes_final_inspections_local';

  /**
   * Initialize and pre-cache packet labels
   */
  static async init(): Promise<void> {
    await PacketLookupCache.refresh();
  }

  /**
   * Fast synchronous lookup of packet metadata (0ms)
   */
  static lookupPacket(packetId: string): { quantity: number; product_id?: string; product_name?: string; batch_code?: string; status?: string } | null {
    return PacketLookupCache.lookup(packetId);
  }

  /**
   * Trigger audio & haptic feedback
   */
  static feedback(type: 'success' | 'warning' | 'error'): void {
    if (type === 'success') {
      AudioFeedbackService.playSuccess();
      AudioFeedbackService.triggerHaptic('success');
    } else if (type === 'warning') {
      AudioFeedbackService.playDuplicate();
      AudioFeedbackService.triggerHaptic('warning');
    } else {
      AudioFeedbackService.playError();
      AudioFeedbackService.triggerHaptic('error');
    }
  }

  /**
   * Check if logged-in user role is permitted for Final Inspection
   * Checks dynamic Access Management settings configured in Admin Console,
   * falling back to local storage and default permissions.
   */
  static isUserAuthorized(role?: string | null, customPermissions?: Record<string, string[]> | null): boolean {
    if (!role) return false;
    if (role === 'Admin' || role === 'PowerUser') return true;

    // 1. Direct role_permissions passed from AppSettings / Admin
    if (customPermissions && customPermissions[role]) {
      const perms = customPermissions[role];
      return perms.includes('Final Inspection') || perms.includes('FINAL_INSPECTION');
    }

    // 2. Check localStorage cached role permissions from Admin Access Management
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = localStorage.getItem('mes_role_permissions');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed[role]) {
            return parsed[role].includes('Final Inspection') || parsed[role].includes('FINAL_INSPECTION');
          }
        }
      }
    } catch (e) {}

    // 3. Fallback defaults if no custom RBAC rule was saved yet
    const allowed = ['QC', 'Admin', 'PowerUser', 'Supervisor', 'QC Inspector', 'QC Supervisor', 'Final Inspector'];
    return allowed.some(a => a.toLowerCase() === role.toLowerCase().trim());
  }

  /**
   * Status Transition Rule Validator:
   * 1. Hold items can be passed (or rejected)
   * 2. Passed items can be hold or rejected
   * 3. Rejected items cannot be passed or hold by anyone other than admin
   */
  static canChangeStatus(
    currentStatus: 'PASSED' | 'REJECTED' | 'HELD',
    newStatus: 'PASSED' | 'REJECTED' | 'HELD',
    userRole?: string
  ): { allowed: boolean; reason?: string } {
    if (currentStatus === newStatus) return { allowed: true };

    const role = (userRole || '').trim().toLowerCase();
    const isAdmin = role === 'admin' || role === 'poweruser';

    // Condition 3: Rejected items cannot be passed or hold by anyone other than admin
    if (currentStatus === 'REJECTED') {
      if (!isAdmin) {
        return {
          allowed: false,
          reason: 'Rejected items cannot be passed or held by anyone other than an Admin.'
        };
      }
      return { allowed: true };
    }

    // Condition 1: Hold items can be passed (or rejected)
    if (currentStatus === 'HELD') {
      if (newStatus === 'PASSED' || newStatus === 'REJECTED') {
        return { allowed: true };
      }
    }

    // Condition 2: Passed items can be hold or rejected
    if (currentStatus === 'PASSED') {
      if (newStatus === 'HELD' || newStatus === 'REJECTED') {
        return { allowed: true };
      }
    }

    return { allowed: true };
  }

  /**
   * Update an inspected packet's status with role-based validation and cross-device sync
   */
  static async updatePacketStatus(
    packetId: string,
    newStatus: 'PASSED' | 'REJECTED' | 'HELD',
    user: { name: string; role: string; id?: string },
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const history = await this.getInspectionHistory();
    const existing = history.find(r => r.packet_id === packetId);
    const currentStatus = existing?.status || 'HELD';

    // Validate transition condition
    const check = this.canChangeStatus(currentStatus, newStatus, user.role);
    if (!check.allowed) {
      return {
        success: false,
        error: check.reason || 'Status change not permitted.'
      };
    }

    const now = new Date().toISOString();

    // 1. Update in local storage
    const local = this.getLocalRecords();
    let foundInLocal = false;
    const updatedLocal = local.map(r => {
      if (r.packet_id === packetId) {
        foundInLocal = true;
        return {
          ...r,
          status: newStatus,
          inspector_name: user.name,
          inspector_role: user.role,
          inspected_at: now,
          defect_notes: notes || r.defect_notes
        };
      }
      return r;
    });

    if (!foundInLocal && existing) {
      updatedLocal.unshift({
        ...existing,
        status: newStatus,
        inspector_name: user.name,
        inspector_role: user.role,
        inspected_at: now,
        defect_notes: notes || existing.defect_notes
      });
    }

    localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(updatedLocal));

    // 2. Try remote final_inspections update
    try {
      await supabase
        .from('final_inspections')
        .update({
          status: newStatus,
          inspector_name: user.name,
          inspector_role: user.role,
          inspected_at: now,
          defect_notes: notes || null
        })
        .eq('packet_id', packetId);
    } catch {}

    // 3. Log change in system_changes for cross-device synchronization
    await logSystemChange({
      changedByName: user.name,
      changedByRole: user.role,
      module: 'FINAL_INSPECTION',
      tableName: 'final_inspections',
      recordId: packetId,
      action: 'UPDATE',
      reason: notes || `Status changed from ${currentStatus} to ${newStatus}`,
      newValue: JSON.stringify({
        session_id: existing?.session_id || 'FIS-UPDATE',
        status: newStatus,
        total_quantity: existing?.quantity || 1000,
        packet_count: 1,
        packets: [{
          packet_id: packetId,
          status: newStatus,
          quantity: existing?.quantity || 1000,
          product_name: existing?.product_name,
          batch_code: existing?.batch_code,
          inspector_name: user.name,
          inspector_role: user.role,
          inspected_at: now,
          defect_notes: notes || null
        }],
        inspected_at: now,
        notes: notes || ''
      })
    }).catch(() => {});

    return { success: true };
  }

  /**
   * Create a new Final Inspection Session
   */
  static createSession(inspectorId: string, inspectorName: string, inspectorRole: string): FinalInspectionSession {
    const timestamp = new Date();
    const dStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const sessionId = `FIS-${dStr}-${rand}`;

    return {
      session_id: sessionId,
      inspector_id: inspectorId,
      inspector_name: inspectorName,
      inspector_role: inspectorRole,
      packets: [],
      total_quantity: 0,
      started_at: timestamp.toISOString()
    };
  }

  /**
   * Submit Final Inspection Batch (Transactional Backend Submission)
   */
  static async submitInspection(
    session: FinalInspectionSession,
    status: 'PASSED' | 'REJECTED' | 'HELD' = 'PASSED',
    notes?: string,
    deviceInfo?: string
  ): Promise<FinalInspectionSubmissionResult> {
    // 1. Role Authorization Check
    if (!this.isUserAuthorized(session.inspector_role)) {
      return {
        success: false,
        error: `Unauthorized: User with role "${session.inspector_role}" is not permitted to perform Final Inspection.`
      };
    }

    if (!session.packets || session.packets.length === 0) {
      return {
        success: false,
        error: 'No packets in inspection session to submit.'
      };
    }

    // 2. Try Supabase RPC first
    try {
      const payloadPackets = session.packets.map(p => ({
        packet_id: p.packet_id,
        quantity: p.quantity,
        product_id: p.product_id,
        product_name: p.product_name,
        batch_code: p.batch_code
      }));

      const { data, error } = await supabase.rpc('submit_final_inspection', {
        p_session_id: session.session_id,
        p_packets: payloadPackets,
        p_inspector_id: session.inspector_id,
        p_inspector_name: session.inspector_name,
        p_inspector_role: session.inspector_role,
        p_status: status,
        p_notes: notes || null,
        p_device_info: deviceInfo || navigator?.userAgent?.slice(0, 100) || 'Web/Android'
      });

      if (!error && data) {
        if (data.success) {
          // Log audit change
          await logSystemChange({
            changedByName: session.inspector_name,
            changedByRole: session.inspector_role,
            module: 'FINAL_INSPECTION',
            tableName: 'final_inspections',
            recordId: session.session_id,
            action: 'CREATE',
            reason: notes || 'Final inspection verified',
            newValue: `${session.packets.length} packets (${session.total_quantity} pcs) ${status}`
          }).catch(() => {});

          return {
            success: true,
            count: data.count || session.packets.length,
            total_quantity: data.total_quantity || session.total_quantity,
            session_id: session.session_id,
            inspector: session.inspector_name,
            timestamp: new Date().toISOString()
          };
        } else {
          return {
            success: false,
            error: data.error || 'Validation failed on server',
            errors: data.errors
          };
        }
      }
    } catch (rpcErr) {
      console.warn('[FinalInspectionService] RPC call failed, falling back to direct table integration:', rpcErr);
    }

    // 3. Fallback / Direct Table Transaction (Client-Side Verification)
    return await this.submitDirectTableIntegration(session, status, notes, deviceInfo);
  }

  /**
   * Fallback direct table verification & submission
   */
  private static async submitDirectTableIntegration(
    session: FinalInspectionSession,
    status: 'PASSED' | 'REJECTED' | 'HELD' = 'PASSED',
    notes?: string,
    deviceInfo?: string
  ): Promise<FinalInspectionSubmissionResult> {
    const packetIds = session.packets.map(p => p.packet_id);
    const errors: { packet_id: string; reason: string }[] = [];

    // Phase 1: Check existing inspection records against status transition rules:
    // - Hold items can be passed
    // - Passed items can be hold or rejected
    // - Rejected items cannot be passed or hold by anyone other than admin
    try {
      const history = await this.getInspectionHistory();
      const existingMap = new Map<string, FinalInspectionRecord>();
      for (const h of history) {
        if (packetIds.includes(h.packet_id)) {
          existingMap.set(h.packet_id, h);
        }
      }

      for (const p of session.packets) {
        const ex = existingMap.get(p.packet_id);
        if (ex) {
          const check = this.canChangeStatus(ex.status, status, session.inspector_role);
          if (!check.allowed) {
            errors.push({
              packet_id: p.packet_id,
              reason: check.reason || `Cannot change status from ${ex.status} to ${status}`
            });
          } else if (ex.status === 'PASSED' && status === 'PASSED') {
            errors.push({
              packet_id: p.packet_id,
              reason: `Already verified PASSED on ${new Date(ex.inspected_at).toLocaleDateString()} by ${ex.inspector_name}`
            });
          }
        }
      }

      // Check void labels in production_plan_labels
      const { data: voidLabels } = await supabase
        .from('production_plan_labels')
        .select('qr_payload, status')
        .in('qr_payload', packetIds)
        .eq('status', 'void');

      if (voidLabels && voidLabels.length > 0) {
        for (const vl of voidLabels) {
          errors.push({
            packet_id: vl.qr_payload,
            reason: 'Packet label is marked as VOID'
          });
        }
      }
    } catch (e) {
      console.warn('Error during remote table pre-check:', e);
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: `${errors.length} packet(s) failed validation.`,
        errors
      };
    }

    // Phase 2: Insert into final_inspections
    const now = new Date().toISOString();
    const rowsToInsert = session.packets.map(p => ({
      session_id: session.session_id,
      packet_id: p.packet_id,
      product_id: p.product_id || null,
      product_name: p.product_name || null,
      batch_code: p.batch_code || null,
      quantity: p.quantity || 0,
      inspector_id: session.inspector_id,
      inspector_name: session.inspector_name,
      inspector_role: session.inspector_role,
      status: status,
      defect_notes: notes || null,
      device_info: deviceInfo || 'Web/Mobile',
      inspected_at: now
    }));

    try {
      await supabase.from('final_inspections').insert(rowsToInsert);

      // Update production_plan_labels
      await supabase
        .from('production_plan_labels')
        .update({
          status: 'inspected',
          scanned_at: now,
          scanned_by: session.inspector_name
        })
        .in('qr_payload', packetIds);

      // Update packets
      await supabase
        .from('packets')
        .update({
          status: 'Final Inspected'
        })
        .in('id', packetIds);
    } catch (writeErr) {
      console.warn('[FinalInspectionService] Remote table write fallback to local storage:', writeErr);
    }

    // Always persist to local cache for instant zero-latency retrieval
    this.saveLocalRecords(rowsToInsert as any[]);

    // Log rich payload in system_changes for cross-device synchronization
    await logSystemChange({
      changedByName: session.inspector_name,
      changedByRole: session.inspector_role,
      module: 'FINAL_INSPECTION',
      tableName: 'final_inspections',
      recordId: session.session_id,
      action: 'CREATE',
      reason: notes || 'Final inspection verified',
      newValue: JSON.stringify({
        session_id: session.session_id,
        status: status,
        total_quantity: session.total_quantity,
        packet_count: session.packets.length,
        packets: rowsToInsert,
        inspected_at: now,
        notes: notes || ''
      })
    }).catch(() => {});

    return {
      success: true,
      count: session.packets.length,
      total_quantity: session.total_quantity,
      session_id: session.session_id,
      inspector: session.inspector_name,
      timestamp: now
    };
  }

  /**
   * Fetch complete inspection history from all synchronized sources:
   * 1. final_inspections remote table (if available)
   * 2. system_changes module='FINAL_INSPECTION' (cross-device sync)
   * 3. production_plan_labels where status='inspected'
   * 4. packets where status='Final Inspected'
   * 5. Local storage backup cache
   */
  static async getInspectionHistory(): Promise<FinalInspectionRecord[]> {
    const recordsMap = new Map<string, FinalInspectionRecord>();

    // Source 1: Local Storage Cache (Immediate)
    try {
      const local = this.getLocalRecords();
      for (const rec of local) {
        if (rec.packet_id) recordsMap.set(rec.packet_id, rec);
      }
    } catch {}

    // Source 2: Remote final_inspections table
    try {
      const { data, error } = await supabase
        .from('final_inspections')
        .select('*')
        .order('inspected_at', { ascending: false })
        .limit(200);

      if (!error && data && data.length > 0) {
        for (const row of data as any[]) {
          if (row.packet_id) {
            recordsMap.set(row.packet_id, {
              id: row.id || row.packet_id,
              session_id: row.session_id || 'FIS-HISTORIC',
              packet_id: row.packet_id,
              plan_id: row.plan_id,
              product_id: row.product_id,
              product_name: row.product_name,
              batch_code: row.batch_code,
              quantity: row.quantity || 1000,
              inspector_id: row.inspector_id || 'qc-1',
              inspector_name: row.inspector_name || 'QC Inspector',
              inspector_role: row.inspector_role || 'QC',
              status: row.status || 'PASSED',
              defect_notes: row.defect_notes,
              device_info: row.device_info,
              inspected_at: row.inspected_at || new Date().toISOString()
            });
          }
        }
      }
    } catch (e) {
      console.warn('[FinalInspectionService] Remote table fetch skipped:', e);
    }

    // Source 3: system_changes sync records
    try {
      const { data: changes, error: changeErr } = await supabase
        .from('system_changes')
        .select('*')
        .eq('module', 'FINAL_INSPECTION')
        .order('changed_at', { ascending: false })
        .limit(60);

      if (!changeErr && changes && changes.length > 0) {
        for (const ch of changes) {
          if (!ch.new_value) continue;
          try {
            const parsed = JSON.parse(ch.new_value);
            if (parsed && Array.isArray(parsed.packets)) {
              for (const p of parsed.packets) {
                if (p.packet_id && !recordsMap.has(p.packet_id)) {
                  recordsMap.set(p.packet_id, {
                    id: p.id || p.packet_id,
                    session_id: parsed.session_id || ch.record_id || 'FIS-SYNC',
                    packet_id: p.packet_id,
                    product_id: p.product_id,
                    product_name: p.product_name,
                    batch_code: p.batch_code,
                    quantity: p.quantity || 1000,
                    inspector_id: p.inspector_id || ch.changed_by_id || 'qc-sync',
                    inspector_name: p.inspector_name || ch.changed_by_name || 'Inspector',
                    inspector_role: p.inspector_role || ch.changed_by_role || 'QC',
                    status: (p.status || parsed.status || 'PASSED') as any,
                    defect_notes: p.defect_notes || parsed.notes || ch.reason,
                    device_info: p.device_info,
                    inspected_at: p.inspected_at || parsed.inspected_at || ch.changed_at
                  });
                }
              }
            }
          } catch {
            // Unparsed string like "10 packets (40000 pcs) PASSED"
          }
        }
      }
    } catch (e) {
      console.warn('[FinalInspectionService] system_changes fetch warning:', e);
    }

    // Source 4: production_plan_labels where status='inspected'
    try {
      const { data: labels } = await supabase
        .from('production_plan_labels')
        .select('id, qr_payload, expected_quantity, status, scanned_at, scanned_by, void_reason, production_plans(batch_code, product_id, products(name))')
        .eq('status', 'inspected')
        .limit(300);

      if (labels && labels.length > 0) {
        for (const l of labels as any[]) {
          const q = l.qr_payload;
          if (q && !recordsMap.has(q)) {
            recordsMap.set(q, {
              id: l.id,
              session_id: 'FIS-LABEL-PLAN',
              packet_id: q,
              product_id: l.production_plans?.product_id,
              product_name: l.production_plans?.products?.name || 'Standard Packet',
              batch_code: l.production_plans?.batch_code,
              quantity: l.expected_quantity || 1000,
              inspector_id: 'qc-plan',
              inspector_name: l.scanned_by || 'QC Inspector',
              inspector_role: 'QC',
              status: 'PASSED',
              defect_notes: l.void_reason,
              inspected_at: l.scanned_at || new Date().toISOString()
            });
          }
        }
      }
    } catch {}

    const list = Array.from(recordsMap.values());
    list.sort((a, b) => new Date(b.inspected_at).getTime() - new Date(a.inspected_at).getTime());
    return list;
  }

  /**
   * Group all final inspection records by batch ID / batch code
   */
  static async getAllBatchInspectionSummaries(
    knownBatches?: { id: string; productName?: string }[]
  ): Promise<Record<string, BatchFinalInspectionSummary>> {
    const allRecords = await this.getInspectionHistory();
    const result: Record<string, BatchFinalInspectionSummary> = {};

    // Helper: Initialize empty batch summary
    const initSummary = (bId: string, pName?: string): BatchFinalInspectionSummary => ({
      batchId: bId,
      productName: pName || 'Standard Product',
      totalPackets: 0,
      totalQuantity: 0,
      passedCount: 0,
      rejectedCount: 0,
      heldCount: 0,
      status: 'PENDING',
      inspectors: [],
      packets: []
    });

    // Seed known batches if provided
    if (knownBatches) {
      for (const kb of knownBatches) {
        if (!result[kb.id]) {
          result[kb.id] = initSummary(kb.id, kb.productName);
        }
      }
    }

    // Match each record to appropriate batch
    for (const rec of allRecords) {
      let matchedBatchId = rec.batch_code || '';

      if (!matchedBatchId && knownBatches) {
        // Try finding matching batch by prefix or substring
        const found = knownBatches.find(kb => 
          rec.packet_id.toUpperCase().startsWith(kb.id.toUpperCase()) ||
          kb.id.toUpperCase().startsWith(rec.packet_id.split('-')[0].toUpperCase())
        );
        if (found) matchedBatchId = found.id;
      }

      // If still not matched, derive batch code from packet ID (e.g. APC26E28-001 -> APC26E28)
      if (!matchedBatchId) {
        const parts = rec.packet_id.split('-');
        matchedBatchId = parts.length > 1 ? parts[0] : (rec.batch_code || 'UNASSIGNED');
      }

      if (!result[matchedBatchId]) {
        result[matchedBatchId] = initSummary(matchedBatchId, rec.product_name);
      }

      const summary = result[matchedBatchId];
      summary.packets.push(rec);
      summary.totalPackets += 1;
      summary.totalQuantity += (rec.quantity || 1000);

      if (rec.status === 'PASSED') summary.passedCount += 1;
      else if (rec.status === 'REJECTED') summary.rejectedCount += 1;
      else if (rec.status === 'HELD') summary.heldCount += 1;

      if (rec.inspector_name && !summary.inspectors.includes(rec.inspector_name)) {
        summary.inspectors.push(rec.inspector_name);
      }

      if (!summary.latestInspectedAt || new Date(rec.inspected_at) > new Date(summary.latestInspectedAt)) {
        summary.latestInspectedAt = rec.inspected_at;
      }
    }

    // Compute composite status for each batch
    for (const bId of Object.keys(result)) {
      const summary = result[bId];
      if (summary.totalPackets === 0) {
        summary.status = 'PENDING';
      } else if (summary.rejectedCount > 0) {
        summary.status = 'REJECTED';
      } else if (summary.heldCount > 0) {
        summary.status = 'HELD';
      } else {
        summary.status = 'PASSED';
      }
    }

    return result;
  }

  private static getLocalRecords(): FinalInspectionRecord[] {
    try {
      const raw = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private static saveLocalRecords(records: FinalInspectionRecord[]): void {
    try {
      const existing = this.getLocalRecords();
      // Deduplicate by packet_id
      const map = new Map<string, FinalInspectionRecord>();
      for (const r of existing) map.set(r.packet_id, r);
      for (const r of records) map.set(r.packet_id, r);

      const combined = Array.from(map.values()).slice(0, 800);
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(combined));
    } catch (e) {
      console.warn('Error saving to local storage:', e);
    }
  }
}

export interface BatchFinalInspectionSummary {
  batchId: string;
  productName?: string;
  totalPackets: number;
  totalQuantity: number;
  passedCount: number;
  rejectedCount: number;
  heldCount: number;
  status: 'PASSED' | 'REJECTED' | 'HELD' | 'PENDING';
  latestInspectedAt?: string;
  inspectors: string[];
  packets: FinalInspectionRecord[];
}
