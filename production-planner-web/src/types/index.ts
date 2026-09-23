export type PlanStatus = 'draft' | 'confirmed' | 'printed' | 'in_progress' | 'completed';
export type LabelStatus = 'unprinted' | 'printed' | 'scanned' | 'void';
export type JobType = 'initial' | 'reprint';
export type FillOrder = 'row-major' | 'column-major';
export type PlanningMode = 'single_day' | 'date_range' | 'shift' | 'quantity_only';

export interface ProductionPlan {
  id: string;
  product_id: string;
  planning_mode: PlanningMode;
  start_date: string; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  shift?: string | null; // 'A' | 'B' | 'C'
  target_quantity: number;
  status: PlanStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;

  // Joined product & day execution details
  product_name?: string;
  standard_packing_qty?: number;
  days?: ProductionPlanDay[];

  // Backward compatibility & convenience helpers
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
  production_date: string; // YYYY-MM-DD
  shift?: string | null;
  batch_code: string;
  quantity_for_day: number;
  crates_for_day: number;
  remainder_quantity: number;
  status: PlanStatus;
  created_at: string;

  // Joined labels & parent plan info
  labels?: ProductionPlanLabel[];
  product_name?: string;
  product_id?: string;
}

export interface ProductionPlanLabel {
  id: string;
  plan_day_id?: string;
  plan_id?: string;
  sequence_number: number; // Case No
  expected_quantity: number;
  is_partial: boolean;
  qr_payload: string; // format: batch_code-case_number
  print_job_id?: string | null;
  status: LabelStatus;
  void_reason?: string | null;
  scanned_at?: string | null;
  scanned_by?: string | null;
  created_at: string;

  // Joined contextual details for print queue / display
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

export interface Product {
  id: string;
  name: string;
  item_code?: string;
  batch_identifier?: string;
  bin_qty?: number;
  std_pack_size?: number;
  standard_packing_qty?: number;
}

export interface Machine {
  id: string;
  name: string;
  status?: string;
}
