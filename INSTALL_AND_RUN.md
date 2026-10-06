# Install and Run CampusLink

CampusLink has three runnable parts: the Python AI service, the Node.js backend, and the React frontend. Run the commands below from PowerShell. The `docs/` directory contains documentation and does not need to be installed or started.

## Prerequisites

- Node.js 22.12 or newer
- Python 3.11 or newer
- A running PostgreSQL database

Create a PostgreSQL database for CampusLink, then set its connection string in `backend/.env` as `DATABASE_URL`.

## Install and Configure

Run each section once from the repository root.

### AI Service

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set `GROQ_API_KEY` in `ai-service/.env` to enable LLM features. It is optional; the service can run without it.

### Backend

```powershell
cd ..\backend
npm install
Copy-Item .env.example .env
```

Edit `backend/.env`: set `DATABASE_URL` to your PostgreSQL connection string and replace `JWT_SECRET` with a long, random value. Then initialize the database:

```powershell
npx prisma generate
npx prisma migrate deploy
npx tsx scripts/setup-sql-lab-role.ts
npx prisma db seed
npx tsx scripts/setup-tenancy.ts
npx tsx scripts/seed-learning.ts
npx tsx scripts/create-admin.ts admin@example.com "YourStrongPassword1" "Platform Admin"
```

The SQL Lab role setup and demo seed are optional. The SQL Lab setup prints a connection string; put it in `SQL_LAB_DATABASE_URL` in `backend/.env`. `npx prisma db seed` adds basic demo data. `setup-tenancy.ts` and `seed-learning.ts` load the college and learning-resource data.

### Frontend

```powershell
cd ..\frontend
npm install
Copy-Item .env.example .env
```

The default `VITE_API_URL` points to the local backend at `http://localhost:5000/api/v1`.

Do not commit `.env` files or put real API keys or passwords in source control.

## Run the Application

Start each service in its own PowerShell terminal, starting from the repository root.

### Terminal 1: AI Service

```powershell
cd ai-service
 .\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Health check: `http://localhost:8000/health`

### Terminal 2: Backend

```powershell
cd backend
npm run dev
```

API health check: `http://localhost:5000/health`

### Terminal 3: Frontend

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser. Keep all three terminals running while using the application.

## Stop the Services

Press `Ctrl+C` in each terminal.