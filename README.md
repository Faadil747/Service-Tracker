# Service-Tracker 📊

Service-Tracker is a production-grade, real-time LinkedIn accountability and social media management dashboard. Built on a glassmorphic aesthetic, the platform combines AI-powered content generation, granular task workflow coordination, telemetry analytics, and interactive calendar scheduling for regional teams.

---

## 🚀 Tech Stack

The architecture is divided into a lightweight, high-performance API backend and a responsive, interactive single-page frontend.

### Frontend
- **Framework**: React 19 (using TypeScript & Vite)
- **State Management**: Zustand (for reactive authentication and configuration store)
- **Styling**: Modern, responsive CSS with glassmorphic layout tokens, dynamic transitions, and HSL custom variables
- **Charts / Visualizations**: Recharts (interactive Engagement Sparklines, Audience Growth, Post Performance bars)
- **Routing**: React Router DOM (v7 SPA Routing with URL search-parameter-based deep navigation)
- **Icons**: Lucide React

### Backend
- **Framework**: Python FastAPI
- **Database**: SQLite (SQLAlchemy ORM for schemas and seed migrations)
- **Real-Time updates**: WebSockets (broadcasting telemetry events, tasks progression, and agent state updates)
- **Asynchronous Execution**: Uvicorn ASGI Server
- **AI Integrations**: OpenAI / DeepSeek custom LLM proxy interface for automated brand tone post formulation and reach/sentiment predictions

---

## ⚡ Main Core Features

1. **Analytical Hub (Embedded Dashboard)**
   - Merged metrics dashboard: follower growth, engagement tracking, clicks tracker, and impressions analyzer.
   - Admin Accountability console tracking agent task-completion history, log counts, and regional status parameters.
2. **Interactive Content Calendar**
   - Calendar overlays showing scheduled posts and task assignments.
   - Comprehensive **2026 holiday overlays** for **India (🇮🇳), US (🇺🇸), Indonesia (🇮🇩), and Global (🌐)** with corresponding flag emojis.
   - Post detail inspection popups with instant **Delete Post** capability.
   - URL-parameter-based selection: directly launches post modal view from navigation redirects.
3. **Advanced Tasks Workspace**
   - Three status lanes: **Active**, **On Hold**, and **Completed** tasks.
   - Quick workflow control actions: mark task complete, put on hold (pause status), resume hold, or remote-delete tasks.
   - **Add Task Modal**: Admin creates tasks directly matching assigned regional agents, while Agents submit tasks in `pending_approval` state for Admin review.
4. **Interactive Notifications**
   - Custom notifications dropdown in the header shell.
   - Clicking a notification marks it read immediately and routes the user directly to the Workspace task pane (`?taskId=...`) or Calendar post detail (`?postId=...`).

---

## 🛠 Setup & Installation

### Prerequisites
Ensure you have the following installed on your machine:
- **Node.js** (v18.0.0 or higher)
- **Python** (v3.10 or higher)
- **Git** (for version control)

### Backend Configuration
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   # Windows PowerShell
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # macOS/Linux
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` database configuration file in the `backend/` root directory:
   ```env
   DATABASE_URL=sqlite:///./app.db
   SECRET_KEY=your_development_auth_secret_key_change_in_production
   DEEPSEEK_API_KEY=your_openai_or_deepseek_secret_key
   ```
5. Run database seeds or launch the development server to auto-generate schemas:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The backend API will be live at: `http://localhost:8000`

### Frontend Configuration
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Run the development bundler locally:
   ```bash
   npm run dev
   ```
   The frontend UI will be live at: `http://localhost:5173`

---

## 📁 Repository Structure

```tree
social-tracker-project/
├── backend/                # FastAPI application
│   ├── app/
│   │   ├── models/        # SQLAlchemy schemas
│   │   ├── routers/       # API endpoints (tasks, posts, notifications)
│   │   ├── services/      # AI and social logic hooks
│   │   └── main.py        # ASGI configuration hook
│   └── requirements.txt
└── frontend/               # React Vite client
    ├── src/
    │   ├── components/    # Shared header, navigation elements
    │   ├── services/      # Axios HTTP API wrappers
    │   ├── store/         # Zustand global states
    │   ├── views/         # Calendar, Workspace, Dashboard, and Agent page templates
    │   └── App.tsx
    ├── package.json
    └── vite.config.ts
```
