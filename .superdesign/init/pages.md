# Key screens and dependencies

## `/` (role selection, sign-in, registration)

Entry: `frontend/js/app.js`

Dependencies:
- `frontend/index.html`
- `frontend/css/style.css`
- `frontend/css/responsive.css`

## User dashboard

Entry: `renderUser()` in `frontend/js/app.js`

Dependencies:
- `nav()` in `frontend/js/app.js`
- `userServices()`, `showWorkers()`, `openBooking()`, `createBooking()`
- `userBookings()`, notifications, rewards and history renderers
- `frontend/css/style.css`

## Worker dashboard

Entry: `renderWorker()` in `frontend/js/app.js`

Dependencies:
- `nav()` in `frontend/js/app.js`
- worker booking renderer and action handlers
- `frontend/css/style.css`

## Booking/bargaining views

Entry: booking and offer renderers in `frontend/js/app.js`

Dependencies:
- `/api/bookings`
- `/api/bargains`
- Socket.IO event feedback
