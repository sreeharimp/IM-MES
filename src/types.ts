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
  materialId?: string;
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
  packedQty?: number;
  status: 'Pending Inspection' | 'In Inspection' | 'Completed';
}

export interface CrateSourceContribution {
  crateId: string;
  binNumber: number;
  qty: number;
}

// Grandchild / Packed Unit
export interface Packet {
  id: string;
  batchId: string;
  productId: string;
  productName: string;
  productCode?: string;
  quantity: number;
  crateSources: CrateSourceContribution[];
  packedBy?: string;
  packedAt: string;
  shiftId?: string;
  status?: 'Packed' | 'Despatched';
  qrCode?: string;
  storageBinId?: string; // e.g. APBIN-01
  locationStatus?: 'WIP Storage' | 'In Transit' | 'Main Store' | 'Carton Packed';
  storageBinBoundAt?: string;
  storeReceivedAt?: string;
  storeReceivedBy?: string;
  cartonId?: string;
}

export interface StorageBin {
  id: string; // e.g. APBIN-01
  currentLocation: 'WIP Warehouse' | 'In Transit' | 'Main Store' | 'Empty';
  packetsCount?: number;
  totalQty?: number;
  lastTransferredAt?: string;
  lastReceivedAt?: string;
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

export type Tab = 'Live Dashboard' | 'Shop Floor' | 'Production Planner' | 'Inspections' | 'Batch Log' | 'Shift Log' | 'Breakdowns' | 'Packing' | 'Machines' | 'About';

export type RolePermissions = Record<string, Tab[]>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  Admin: ['Live Dashboard', 'Shop Floor', 'Production Planner', 'Inspections', 'Batch Log', 'Shift Log', 'Breakdowns', 'Packing', 'Machines', 'About'],
  PowerUser: ['Live Dashboard', 'Shop Floor', 'Production Planner', 'Inspections', 'Batch Log', 'Shift Log', 'Breakdowns', 'Packing', 'Machines', 'About'],
  Supervisor: ['Live Dashboard', 'Shop Floor', 'Production Planner', 'Inspections', 'Batch Log', 'Shift Log', 'Breakdowns', 'Packing', 'About'],
  QC: ['Live Dashboard', 'Batch Log', 'Shift Log', 'Packing', 'Inspections', 'About'],
};

export interface AppSettings {
  id: string; // 'global'
  currentShift: string;
  pendingHandover: boolean;
  lastHandoverSummary: any; // JSONB
  outgoingSupervisorEmail?: string; // email of supervisor who triggered handover
  activeSupervisorName?: string;
  printLabels?: any; // JSONB for editable label system
  role_permissions?: RolePermissions;
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

export interface DefectType {
  id: string;
  name: string;
}

export interface BreakdownReason {
  id: string;
  name: string;
}

export interface CleaningTask {
  id: string;
  label: string;
}

export interface Team {
  id: string;
  supervisorId: string;
  name: string;
  createdAt?: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  operatorId: string;
  addedAt: string;
  removedAt?: string | null;
}

// ── Production Planning & Pre-Printed Labels ─────────────────────────
export type PlanStatus = 'draft' | 'confirmed' | 'printed' | 'in_progress' | 'completed';
export type LabelStatus = 'unprinted' | 'printed' | 'scanned' | 'void';
export type JobType = 'initial' | 'reprint';
export type FillOrder = 'row-major' | 'column-major';
export type PlanningMode = 'single_day' | 'date_range' | 'shift' | 'quantity_only';

export interface ProductionPlan {
  id: string;
  product_id: string;
  planning_mode: PlanningMode;
  start_date: string;
  end_date?: string | null;
  shift?: string | null;
  target_quantity: number;
  status: PlanStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  product_name?: string;
  standard_packing_qty?: number;
  days?: ProductionPlanDay[];
  plan_date?: string;
  batch_code?: string;
  planned_quantity?: number;
  crates_planned?: number;
  remainder_quantity?: number;
  machine_id?: string;
  machine_name?: string;
}

export interface ProductionPlanDay {
  id: string;
  plan_id: string;
  production_date: string;
  shift?: string | null;
  batch_code: string;
  quantity_for_day: number;
  crates_for_day: number;
  remainder_quantity: number;
  status: PlanStatus;
  created_at: string;
  labels?: ProductionPlanLabel[];
  product_name?: string;
  product_id?: string;
}

export interface ProductionPlanLabel {
  id: string;
  plan_day_id?: string;
  plan_id?: string;
  sequence_number: number;
  expected_quantity: number;
  is_partial: boolean;
  qr_payload: string;
  print_job_id?: string | null;
  status: LabelStatus;
  void_reason?: string | null;
  scanned_at?: string | null;
  scanned_by?: string | null;
  created_at: string;
  plan_day?: ProductionPlanDay;
  batch_code?: string;
  production_date?: string;
  product_id?: string;
  product_name?: string;
  paper_type_id?: string;
}

export interface LabelPaperType {
  id: string;
  name: string;
  rows: number;
  columns: number;
  page_width_mm: number;
  page_height_mm: number;
  label_width_mm: number;
  label_height_mm: number;
  margin_top_mm: number;
  margin_left_mm: number;
  gutter_x_mm: number;
  gutter_y_mm: number;
  fill_order: FillOrder;
  active: boolean;
  internal_padding_mm?: number;
  padding_top_mm?: number;
  padding_left_mm?: number;
  padding_right_mm?: number;
  padding_bottom_mm?: number;
  template_config?: any;
  created_by?: string;
  created_at: string;
}

export interface ProductLabelType {
  product_id: string;
  label_paper_type_id: string;
  is_default: boolean;
  paper_type?: LabelPaperType;
}

export interface LabelPrintJob {
  id: string;
  label_paper_type_id: string;
  sheet_count: number;
  job_type: JobType;
  superseded_job_id?: string | null;
  reprint_reason?: string | null;
  reviewed_by?: string | null;
  printed_by: string;
  printed_at: string;
  paper_name?: string;
  sequence_start?: number | null;
  sequence_end?: number | null;
}
