# Routes

## Browser routes

- `GET /` — static SPA shell (`frontend/index.html`), then role-based views in `frontend/js/app.js`.

## API routes

- `/api/auth` — authentication and OTP routes (`backend/routes/auth.js`)
- `/api/services` — service catalogue and worker lookup (`backend/routes/services.js`)
- `/api/workers` — worker information (`backend/routes/workers.js`)
- `/api/bookings` — create, list, history, completion (`backend/routes/bookings.js`)
- `/api/bargains` — offer creation/history/respond (`backend/routes/bargains.js`)
- `/api/rewards` — GEM balance/history (`backend/routes/rewards.js`)

`backend/server.js` serves the frontend, mounts the API routes, and exposes Socket.IO user rooms for real-time notifications.
