-- SevaHub: GEMS + spend/earn reports repair
-- Run once on an existing database. Safe to re-run.

-- Keep requested service base prices consistent.
UPDATE services SET base_price=CASE name
 WHEN 'Cleaning' THEN 150
 WHEN 'Plumbing' THEN 250
 WHEN 'Electrician' THEN 200
 WHEN 'AC Repair' THEN 500
 WHEN 'Appliance Repair' THEN 450
 WHEN 'Beauty & Grooming' THEN 300
 WHEN 'Painting' THEN 450
 WHEN 'Carpenter' THEN 350
 WHEN 'Home Shifting' THEN 500
 WHEN 'Pest Control' THEN 500
 WHEN 'Computer/Laptop Repair' THEN 700
 WHEN 'Other' THEN 100
 ELSE base_price END;

-- Backfill GEMS for completed bookings that were completed in older builds
-- without a reward transaction. Rule: 1 whole GEM per full ₹100 spent.
INSERT INTO reward_transactions(user_id,booking_id,type,coins,description)
SELECT b.user_id,b.id,'EARN',FLOOR(COALESCE(b.final_price,b.original_price)/100),
       CONCAT('Earned ',FLOOR(COALESCE(b.final_price,b.original_price)/100),' GEMS for ₹',COALESCE(b.final_price,b.original_price),' completed service')
FROM bookings b
WHERE b.status='COMPLETED'
  AND FLOOR(COALESCE(b.final_price,b.original_price)/100)>0
  AND NOT EXISTS (
    SELECT 1 FROM reward_transactions rt
    WHERE rt.booking_id=b.id AND rt.type='EARN'
  );
