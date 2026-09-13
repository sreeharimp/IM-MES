# 🔍 IM-MES QC Inspection Portal

**IM-MES QC Inspector** is a high-performance, lightweight Quality Control (QC) Visual Inspection application designed for industrial barcode/QR code scanner devices. It is a streamlined, teal-branded companion app split from the main **IM-MES Production Tracker** to facilitate quick "scan-and-go" visual audits without shop-floor overhead.

---

## 🚀 Key Features

- **Dual-View Inspection Interface**:
  - **Overview (Home)**: Focuses strictly on a large pulsing scan button, a manual ID input field, and high-level product summary cards (no lengthy scroll lists).
  - **Inspection List**: Displays individual pending crates with sorting (oldest/newest first) and select filters by product name.
- **Click-to-Filter Navigation**: Tapping a product card on the Overview dashboard instantly routes to the Inspection List pre-filtered for that product.
- **Smart Barcode Search Fallback**: Scanning or typing a barcode instantly searches local memory. If not found, it queries the Supabase database directly:
  - If a crate was already checked, it displays: *"Unit ID already inspected by [Name] on [Date]."*
  - If pending in the DB, it opens the inspection dialog immediately.
- **Instant Thermal Printing**: Quick print-slip triggers directly inside the bin lists or inspection sealing modals.
- **App Separation**: Styled in a distinct **Teal/Mint theme** to visually separate it from the standard blue MES portal.
- **Isolated Android Package**: Configured to compile as a standalone APK (`com.im.mes.inspector` named `QC Inspector`) that can install and run concurrently side-by-side with the main app on the same scanner.

---

## 🛠️ Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Vanilla CSS (Custom tokens under `.inspection-app`) + Framer Motion
- **Native Wrap**: Capacitor 8 + Android ML Kit Barcode Scanner
- **Database/Backend**: Supabase (PostgreSQL Realtime)
- **Containerization**: Docker & Nginx

---

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- [Android Studio](https://developer.android.com/studio) (for native compilation)

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start Development Server**:
   - **QC Inspector Portal (Default)**:
     ```bash
     npm run dev
     ```
   - **Full MES Supervisor Portal**:
     ```bash
     npm run dev:full
     ```

3. **Browser Routing**:
   - Serve QC Inspector at: `http://localhost:5173/`
   - Serve Full MES Supervisor at: `http://localhost:5173/?mode=full`

---

## 📱 Android Compilation (Capacitor)

This repository is configured to build the standalone QC Inspector Android application:

1. **Build the production assets**:
   ```bash
   npm run build
   ```

2. **Sync changes to the Android platform**:
   ```bash
   npx cap sync
   ```

3. **Build target package (`com.im.mes.inspector`)**:
   - **Via CLI**:
     ```bash
     cd android && ./gradlew assembleDebug
     ```
     *(Generates debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`)*
   - **Via Android Studio**:
     ```bash
     npx cap open android
     ```
     Select target scanner hardware and click the **Run** button to deploy side-by-side on the device.

---

## 📂 Project Structure

- `src/AppInspection.tsx`: The primary entry layout for the QC Inspector Portal.
- `src/App.tsx`: The original supervisor and operator shop-floor dashboard.
- `src/components/InspectionModal.tsx`: Visual audit categorization and QC threshold modals.
- `src/components/CameraScanner.tsx`: ML Kit native camera scanner overlay.
- `src/main.tsx`: Conditional router rendering the correct app layout.

---

Developed with ❤️ by @theparticle
