USE sevahub;

-- No demo/login accounts are seeded in this build.
-- Create users and workers through the SevaHub registration flow.

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
