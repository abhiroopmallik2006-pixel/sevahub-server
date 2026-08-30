# In-app Completion OTP

This build keeps the existing AI/chat/bargaining flow and changes only service completion verification:

1. Worker taps **Complete service · OTP**.
2. Server generates a fresh 6-digit OTP valid for 10 minutes.
3. OTP is delivered only to the customer side through the app (My Bookings + live Socket.IO event).
4. Customer shares the OTP with the worker after verifying the work is finished.
5. Worker enters it; the server verifies it and marks the booking completed.

For an existing MySQL database, run:
`database/migrations/20260830_completion_otp_in_app.sql`

The AI implementation was not changed.
