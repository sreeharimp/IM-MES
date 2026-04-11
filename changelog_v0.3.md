# Changelog v0.3

## 🖨️ Thermal Printing & Traceability Engine
- **Print Subsystem Integration:** Global `@media print` utilities added to format output exclusively for 80mm thermal receipt printers directly through standard Android bridging services (e.g. RawBT).
- **QR Code Traceability:** Formatted `react.qrcode` onto all physical receipts, mathematically composing a verifiable string (`Batch#-MachineID-Bin#`) mapping directly back to internal database parameters.
- **Dynamic Operator & Shift Tracking:** Receipts dynamically fetch full Operator profiles and active Shift periods.
- **UI Streamlining:** The old manual-sign "Scanned / Passed By" blocks and Machine Model data have been stripped from the receipt to keep the design laser-focused for purely digital QA handoffs.
- **Header Formatting:** Renamed core paperwork to "PRODUCTION SLIP" and formatted Batch/Bin logic strictly onto one readable line.

## ♻️ Operational Reprinting
- **Inspection Tab Extension:** Built an intuitive cross-referential "Reprint" function directly onto the pending Inspection bin list. Managers/Supervisors can identically recreate any lost Production Slip dynamically inside an auto-closing print modal!

## ⚙️ Core Infrastructure
- **Real-Time Operator Registry Syncing:** Expanded the global Supabase `postgres_changes` architecture to stream `operators` creation data back to the primary supervisor interface. This prevents "Missing Operator" UID strings from displaying upon immediate creation & assignment loops.
