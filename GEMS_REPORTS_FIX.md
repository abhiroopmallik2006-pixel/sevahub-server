# GEMS + Spend/Earnings Reports Fix

This build fixes the rewards and reports workflow without changing the AI/chat/OTP flow.

## Reward rule
- A customer earns **1 whole GEM for every full ₹100** of the final completed-service amount.
- Example: ₹100 → 1 GEM, ₹250 → 2 GEMS, ₹500 → 5 GEMS, ₹700 → 7 GEMS.
- GEMS are credited only when the worker successfully verifies the customer completion OTP and the booking becomes `COMPLETED`.
- The rewards API automatically backfills a missing EARN transaction for older completed bookings.

## Reports
- `/api/bookings/history?from=YYYY-MM-DD&to=YYYY-MM-DD` now exists.
- USER accounts receive completed-service spend rows and total spend.
- WORKER accounts receive completed-service earnings rows and total earnings.
- Dashboard GEMS/earnings refresh after a service is completed over Socket.IO.

## Existing database
Run once if you already have a database:

`database/migrations/20260830_gems_and_reports_fix.sql`

The backend also repairs missing GEMS automatically when the user opens GEMS balance/history.
