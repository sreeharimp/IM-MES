export type MachineStatus = 'Running' | 'Idle' | 'Maintenance' | 'Setup';

export interface Machine {
  id: string;
  name: string;
  model: string;
  currentMouldId?: string | null;
  currentOperatorId?: string | null;
  activeProductId?: string | null;
  currentMaterialId?: string | null; // Link to RawMaterial
  materialGrade?: string | null;    // Specific Batch Grade
  materialBatch?: string | null;
  currentBinNumber: number;
  currentShiftProduction: number;
  currentDayProduction: number;
  lastCleaningDone: boolean;
  faiApproved: boolean;
  status: MachineStatus;
  // Live production tracking
  binTarget?: number | null;    // target qty per bin
  binStartTime?: number | null; // epoch ms when current bin started
  activeBatchId?: string | null;   // e.g. APBT26C29
  activeBatchDate?: string | null; // ISO date of the 6am window this batch belongs to
  breakdownStartTime?: number | null; // epoch ms when current breakdown started
  oee?: number;
  availability?: number;
  quality?: number;
}

export interface BreakdownRecord {
  id: string;
  machineId: string;
  machineName: string;
  startTime: string; // ISO
  endTime?: string;  // ISO
  durationMinutes?: number;
  reason: string;
  remarks: string;
  operatorId: string;
  supervisorName?: string;
  status: 'Open' | 'Resolved';
}

export interface BatchRecord {
  id: string;           // e.g. APBT26C29
  machineId: string;
  productId: string;
  productName: string;
  productCode: string;
  mouldId: string;
  materialGrade: string;
  materialBatch: string;
  operatorId: string;
  startTime: string;    // ISO datetime
  endTime?: string;     // ISO datetime, set when batch closes
  crates: number;
  totalOutput: number;
  status: 'Active' | 'Closed';
  batchDate: string;    // YYYY-MM-DD of the 6am window
}

export interface Mould {
  id: string;   // Mould ID
  name: string; // Mould Name
  cavities: number;
  cycleTime: number; // in seconds
}

// Grandparent
export interface Batch {
  id: string;
  date: string; // ISO Date
  machineId: string;
  mouldId: string;
  startTime: string; // ISO 6:00 AM
  endTime?: string;
  resinLot: string;
  masterbatchLot: string;
  supervisorId: string;
  status: 'Active' | 'Closed';
}

// Parent
export interface Crate {
  id: string;
  batchId: string;
  machineId: string;
  binNumber: number;
  startTime: string;
  endTime: string;
  grossQty: number;
  startupScrap: number;
  qcSample: number;
  netQty: number;
  rejectedQty?: number;
  rejectionDetails?: any; // JSON object { "Reason": count }
  operatorId: string;
  supervisorId: string;
  inspectedBy?: string;
  inspectedAt?: string;
  mouldId?: string;
  materialBatch?: string;
  shiftId?: string;
  status: 'Pending Inspection' | 'In Inspection' | 'Completed';
}

// Grandchild
export interface Packet {
  id: string;
  crateId: string;
  inspectorId: string;
  packedTime: string;
  quantity: number; // e.g., 1000
  qrCode: string; // Unique traceability code
}

export interface Operator {
  id: string;
  name: string;
  employeeId: string;
  isCertified: boolean;
}

export interface RawMaterial {
  id: string; // Internal Code / RM ID
  name: string; // Material Name (e.g. PP, PE)
  vendor: string;
}

// Approved / Product-Specific Materials (Junction)
export interface ProductMaterial {
  productId: string;
  materialId: string;
}

export interface StoppageLog {
  id: string;
  crateId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reasonCode: string;
  comment?: string;
}

export interface Product {
  id: string;
  name: string;
  mouldId: string; // Link to Mould
  itemCode: string; // instead of productCode
  batchIdentifier: string; // e.g., 'BT' for APBT26C29
  binQty: number;   // Standard Qty per bin
  stdPackSize: number; // e.g., 1000 or 500
}

export interface ShiftSetting {
  id: string; // 'A', 'B', 'C'
  name: string;
  startTime: string; // '06:00'
  endTime: string;   // '14:00'
}

export interface AppSettings {
  id: string; // 'global'
  currentShift: string;
  pendingHandover: boolean;
  lastHandoverSummary: any; // JSONB
  outgoingSupervisorEmail?: string; // email of supervisor who triggered handover
  activeSupervisorName?: string;
}

export interface ShiftSummary {
  id: string;
  shiftDate: string;
  shiftId: string;
  supervisorName: string;
  totalOutput: number;
  runningMachines: number;
  pendingCrates: number;
  handoverTime: string;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  event_type: string;
  machine_id: string; // can be "Plant"
  operator_id?: string;
  supervisor_name?: string;
  details: string;
  qty?: number;
}
