# SevaHub – Service Marketplace

A full-stack service marketplace prototype built with **HTML, CSS, Vanilla JavaScript, Node.js, Express and MySQL**.

## Important limitation about `index.html`

A browser cannot start a Node.js server or connect directly to MySQL just by opening an HTML file.

Therefore this project has two modes:

### 1. Demo mode – just open `frontend/index.html`
The complete UI and all major flows work in the browser using `localStorage`:
- User/Worker role selection
- Registration/login
- Worker automatically appears to users
- Booking
- Two-sided bargaining
- Notifications
- Rewards
- Reviews
- Completion PIN
- Theme toggle

### 2. Real MySQL mode – run the backend
For real database persistence:
1. Install Node.js and MySQL.
2. Create a database using `database/schema.sql`.
3. Copy `.env.example` to `.env` and enter your MySQL password.
4. Set up SendGrid for email OTP (see below).
5. Run `npm install`
6. Run `npm start`
7. Open `http://localhost:3000`

In MySQL mode, MySQL is the source of truth and the API handles authentication, workers, bookings and bargaining.

## Email OTP verification (registration)

New accounts created against the real backend (not demo mode) must verify their email with a 6-digit code before the account is created:

1. **Get a SendGrid API key**: sign up at sendgrid.com, create a full-access (or "Mail Send" scoped) API key under Settings → API Keys.
2. **Verify a sender**: under Settings → Sender Authentication, verify a single sender email address (or a domain) — SendGrid will refuse to send from an unverified address.
3. In `.env`, set:
   ```
   SENDGRID_API_KEY=SG.xxxxxxxx
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   ```
4. Restart the server. Registration now: user fills the sign-up form → `POST /api/auth/send-otp` emails a 6-digit code → user enters it → `POST /api/auth/verify-otp` confirms it → the form auto-submits to `POST /api/auth/register`, which only succeeds if that email has a recent verified code.

If `SENDGRID_API_KEY` or `SENDGRID_FROM_EMAIL` is left blank, the server doesn't fail — it logs the OTP to the server console instead (useful for local testing without a SendGrid account) and also returns it in the API response as `devOtp` for convenience. Remove that fallback before going to production.

The **login screen is unchanged** — OTP is only part of the registration/sign-up flow.

## Demo credentials

For seeded demo accounts:
- Username: `Aman Kumar` / Password: `admin`
- Username: `Divyam Garg` / Password: `admin`

For newly created accounts, the demo registration form defaults the password to `admin`.

Passwords are bcrypt-hashed in the backend.

## Project structure

- `frontend/` – single-page UI and browser demo mode
- `backend/` – Express/MySQL API
- `database/` – schema and seed data
- `.env.example` – MySQL configuration template

## MySQL setup

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p sevahub < database/seed.sql
npm install
npm start
```

Then visit:

`http://localhost:3000`

## Bargaining flow

User books a worker → user sends a price → backend stores the offer → worker sees it in the worker dashboard → worker accepts/rejects/counters → user receives the response → accepted amount becomes the booking final price.

The frontend demo simulates the same flow with localStorage when opened directly.

## Production limitations

This is an MVP/demo. A production deployment should add:
- HTTPS
- secure production session/JWT configuration
- proper password reset
- email/phone verification
- real payment gateway
- real map/geolocation provider
- object storage for images/videos
- CSRF protection where applicable
- stronger rate limiting
- audit logs
- admin moderation
- transactional database operations
- production database credentials and secret management
