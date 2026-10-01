# QSentinel Frontend — Animated Design

A separate React/Vite frontend for the QSentinel backend. The existing frontend is not modified.

## Run

```bash
npm install
npm run dev
```

Backend expected at `http://127.0.0.1:8000`.

To override:

```bash
VITE_API_URL=http://127.0.0.1:8000 npm run dev
```

## Pages

- `/` — Home / system overview
- `/verify` — signature creation and verification
- `/simulate` — threat simulator
- `/log` — security audit log

The UI keeps the backend API and quantum logic unchanged.
