import { supabase } from '../lib/supabase';

export interface SystemChangePayload {
  module: string;
  tableName?: string;
  recordId?: string;
  fieldChanged?: string;
  oldValue?: unknown;
  newValue?: unknown;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'CONFIG';
  reason?: string;
  changeRequest?: string;
  changedByName: string;
  changedByRole?: string;
  changedById?: string;
}

/**
 * Logs an operational change to the `system_changes` table.
 * Designed for administrative, configuration, and master data modifications.
 */
export async function logSystemChange(payload: SystemChangePayload): Promise<void> {
  try {
    const { error } = await supabase.from('system_changes').insert({
      changed_by_id: payload.changedById || null,
      changed_by_name: payload.changedByName || 'System User',
      changed_by_role: payload.changedByRole || null,
      module: payload.module,
      table_name: payload.tableName || null,
      record_id: payload.recordId || null,
      field_changed: payload.fieldChanged || null,
      old_value: payload.oldValue != null ? (typeof payload.oldValue === 'string' ? payload.oldValue : JSON.stringify(payload.oldValue)) : null,
      new_value: payload.newValue != null ? (typeof payload.newValue === 'string' ? payload.newValue : JSON.stringify(payload.newValue)) : null,
      action: payload.action,
      reason: payload.reason || null,
      change_request: payload.changeRequest || null,
    });

    if (error) {
      console.warn('[logSystemChange] Failed to log change to Supabase:', error.message);
    }
  } catch (err) {
    console.warn('[logSystemChange] Unexpected error:', err);
  }
}
