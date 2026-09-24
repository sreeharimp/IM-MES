/**
 * Utilities for resolving and formatting supervisor names for production tracking,
 * audit trails, and physical label/slip printing.
 */

export interface SupervisorRecord {
  id?: string;
  email?: string;
  fullName?: string;
  full_name?: string;
  role?: string;
  employee_code?: string;
  employeeCode?: string;
}

/**
 * Resolves a supervisor identifier (which may historically be an email, uuid, or full name)
 * into a clean, human-readable full name.
 * 
 * Guarantees that raw email addresses are never returned or printed on slips.
 */
export const resolveSupervisorName = (
  supervisorIdOrEmail?: string | null,
  supervisors?: SupervisorRecord[],
  activeSupervisorFallback?: string | null
): string => {
  // If no supervisor identifier provided, use the active on-duty shift supervisor
  if (!supervisorIdOrEmail || supervisorIdOrEmail.trim() === '' || supervisorIdOrEmail === 'System') {
    return activeSupervisorFallback && activeSupervisorFallback.trim() !== ''
      ? activeSupervisorFallback.trim()
      : 'N/A';
  }

  const raw = supervisorIdOrEmail.trim();

  // Try matching against supervisor profiles list
  if (supervisors && supervisors.length > 0) {
    const rawLower = raw.toLowerCase();
    const match = supervisors.find(s => {
      const sEmail = s.email?.toLowerCase().trim();
      const sId = s.id?.toLowerCase().trim();
      const sName = (s.fullName || s.full_name)?.toLowerCase().trim();
      return (sEmail && sEmail === rawLower) || (sId && sId === rawLower) || (sName && sName === rawLower);
    });

    if (match) {
      const name = match.fullName || match.full_name;
      if (name && name.trim()) return name.trim();
    }
  }

  // Check if string looks like an email address
  if (raw.includes('@')) {
    // If we have an active shift supervisor, prefer that over an unmapped email
    if (activeSupervisorFallback && activeSupervisorFallback.trim()) {
      return activeSupervisorFallback.trim();
    }
    // Clean fallback: capitalize username part rather than showing entire raw email
    const username = raw.split('@')[0];
    const cleaned = username
      .replace(/[._\d-]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');

    return cleaned || 'Supervisor';
  }

  // If it's a UUID and wasn't found in supervisors
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  if (isUuid) {
    return activeSupervisorFallback && activeSupervisorFallback.trim()
      ? activeSupervisorFallback.trim()
      : 'Supervisor';
  }

  // Raw string is already a name
  return raw;
};
