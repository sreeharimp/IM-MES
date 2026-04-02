# 🏭 IM-MES Production Tracker

**Agney Production Tracker** is a modern, high-performance Manufacturing Execution System (MES) designed for real-time production monitoring, quality control, and batch traceability. Built with a focus on industrial reliability and data integrity.

---

## 🚀 Key Features

- **Real-time Monitoring**: Track machine status, production counts, and operator assignments in real-time.
- **Batch Traceability**: Full ISO 13485-compliant traceability from raw material to finished product bins.
- **Quality Control (QC)**: Integrated inspection module for verifying product quality at every stage.
- **Shift Handover Management**: Robust digital handover process with supervisor verification.
- **Data Analytics**: Live dashboard with OEE (Overall Equipment Effectiveness) and production yield tracking.
- **Supabase Backend**: Fault-tolerant data synchronization and secure user authentication.

## 🛠️ Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS 4 + Framer Motion (Animations)
- **Database/Backend**: Supabase (PostgreSQL)
- **Containerization**: Docker & Docker Compose
- **Icons**: Lucide React
- **Charts**: Recharts

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- [Docker](https://www.docker.com/) (for containerized deployment)

### Local Development

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd agney-production-tracker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```

### 🐳 Docker Deployment (Recommended)

To run the application in a production-ready environment:

1. **Build and start the container**:
   ```bash
   docker-compose up --build
   ```

2. **Access the application**:
   The app will be available at [http://localhost:3000](http://localhost:3000).

## 📂 Project Structure

- `src/components`: UI components (Tableau, TopBar, Admin Panels).
- `src/lib`: Supabase client and shared utility functions.
- `src/types`: TypeScript interfaces for the entire production model.
- `public`: Static assets and icons.
- `Dockerfile` & `nginx.conf`: Production-grade container configuration.

## 🧪 Quality Standards

This project follows strict coding standards suitable for industrial environments:
- **Type Safety**: 100% TypeScript coverage.
- **Architecture**: Modular component-based design.
- **Resilience**: Graceful error handling for network failures.

---

Developed with ❤️ for Agney Production.
