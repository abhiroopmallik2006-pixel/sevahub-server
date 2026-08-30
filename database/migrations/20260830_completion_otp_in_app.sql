-- SevaHub in-app completion OTP upgrade
-- Run this once on an existing database.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tpin_expires_at TIMESTAMP NULL AFTER tpin_attempts;

-- Old bargain-time TPINs are intentionally invalidated.
UPDATE bookings
SET completion_pin=NULL, customer_tpin=NULL, tpin_attempts=0, tpin_expires_at=NULL
WHERE status IN ('ACCEPTED','IN_PROGRESS');
