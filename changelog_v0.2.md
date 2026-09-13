# Changelog - Version 0.2 (Industrial Production Suite)
## Release Date: 2026-04-03

### 1. ISO 13485 Traceability & Advanced Bin ID
- **New Bin Identifier Format**: Standardized to `Batch#-MachineID-Bin#` (e.g., `APBT26C29-M01-1`).
- **Machine-to-Machine Continuity**: Bin numbers now iterate across the entire batch sequence. If a mould is moved from one machine to another, the bin sequence continues (e.g., if Machine A ends at Bin 5, Machine B starts at Bin 6).
- **Redundant Traceability**: Every bin record now captures Machine ID, Operator ID, Mould ID, Material Batch, and Shift ID for auditor-grade root cause analysis.

### 2. Branding & UI/UX (Google Blue Design System)
- **Vibrant Light Mode**: Replaced the muted light theme with a "Google Cloud Blue" design system. Top bars and Sidebars are now a clean, professional Google Blue (`#1a73e8`) with bold white text.
- **Improved Contrast**: All dashboard elements in light mode now use high-speed AdminLTE and Google Material colors for maximum visibility in bright factory environments.
- **Tactile Feedback**: Added subtle lift-and-shadow effects to production buttons to reduce "dullness" and improve operator confidence.
- **Dark Mode Persistence**: The original industrial dark mode remains completely unchanged and isolated.

### 3. Session & Supervisor Workflows
- **Zero-Friction Access**: Added session persistence. If the active supervisor refreshes the page, they are automatically re-authorized without any login popups.
- **View-Only Persistent State**: Choosing "View Only" mode now persists across refreshes using localStorage, preventing redundant takeover prompts.
- **Direct Login/Logout**: Admin and Power Users now bypass all handover and confirmation modals. Clicking "Sign Out" performs an immediate session termination.
- **Take Control System**: Fixed and unified the "Take Control" confirmation modal. It now functions correctly from both the initial login detection and the top navigation bar.

### 4. Admin Infrastructure
- **User Management Portal**: Added "Edit" buttons for all registered profiles. Admins can now add or correct **Employee Codes** (required for 13485) and Full Names directly from the dashboard.
- **Real-Time Profile Sync**: Changes to user profiles or roles now propagate instantly across all active stations.
- **Vibrant Error/Success Toasts**: Implemented a dual-state notification system (Green for success, Red for errors) in the Admin Console to provide clear operational feedback.

### 5. Performance Improvements
- **Optimistic UI Updates**: Restored zero-latency response for bin completion. The UI updates the local bin counter instantly before the database handshake is complete.
- **Database Index Optimization**: Updated constraints to ensure that the new `Batch#-MachineID-Bin#` string format maintains high query speeds as production logs grow.

---
*End of Version 0.2 Production Release*
