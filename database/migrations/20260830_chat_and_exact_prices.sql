-- SevaHub: user-worker chat + exact service prices
CREATE TABLE IF NOT EXISTS booking_messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT NOT NULL,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_booking_messages (booking_id, created_at)
);
UPDATE services SET base_price=CASE name
 WHEN 'Cleaning' THEN 150 WHEN 'Plumbing' THEN 250 WHEN 'Electrician' THEN 200 WHEN 'AC Repair' THEN 500
 WHEN 'Appliance Repair' THEN 450 WHEN 'Beauty & Grooming' THEN 300 WHEN 'Painting' THEN 450 WHEN 'Carpenter' THEN 350
 WHEN 'Home Shifting' THEN 500 WHEN 'Pest Control' THEN 500 WHEN 'Computer/Laptop Repair' THEN 700 WHEN 'Other' THEN 100 ELSE base_price END;
