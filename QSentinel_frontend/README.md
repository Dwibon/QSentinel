# QSentinel Frontend

React + Vite dashboard for the QSentinel FastAPI backend.

## Run

From the QSentinel project root:

```bash
cd frontend
npm install
npm run dev
```

Open:

http://localhost:5173

The frontend expects the backend at:

http://127.0.0.1:8000

Start the backend separately:

```bash
python -m uvicorn backend.app:app --reload
```
