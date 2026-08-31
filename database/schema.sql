CREATE DATABASE IF NOT EXISTS sevahub;
USE sevahub;

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(30),
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('USER','WORKER') NOT NULL,
  profile_image VARCHAR(500),
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Email OTP verification, used during registration (and can be reused for email changes later)
CREATE TABLE IF NOT EXISTS email_otps (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(150) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  purpose ENUM('REGISTER','LOGIN','RESET') DEFAULT 'REGISTER',
  attempts INT DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_purpose (email, purpose)
);

CREATE TABLE IF NOT EXISTS workers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL UNIQUE,
  experience_years INT DEFAULT 0,
  bio TEXT,
  verification_status ENUM('PENDING','VERIFIED','REJECTED') DEFAULT 'VERIFIED',
  service_area VARCHAR(255),
  service_radius INT DEFAULT 10,
  working_hours VARCHAR(100),
  introduction TEXT,
  rating DECIMAL(3,2) DEFAULT 0,
  total_reviews INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS services (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(20),
  base_price DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS worker_services (
  id INT PRIMARY KEY AUTO_INCREMENT,
  worker_id INT NOT NULL,
  service_id INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  UNIQUE KEY uq_worker_service (worker_id, service_id),
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS worker_availability (
  id INT PRIMARY KEY AUTO_INCREMENT,
  worker_id INT NOT NULL,
  day_of_week VARCHAR(20) NOT NULL,
  start_time TIME,
  end_time TIME,
  is_available BOOLEAN DEFAULT TRUE,
  UNIQUE KEY uq_worker_day (worker_id, day_of_week),
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

-- Only the latest opt-in location is stored. No location history is kept.
CREATE TABLE IF NOT EXISTS user_locations (
  user_id INT PRIMARY KEY,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m DECIMAL(10,2),
  sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_location_sharing_updated (sharing_enabled,updated_at)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  worker_id INT NOT NULL,
  service_id INT NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  address TEXT NOT NULL,
  instructions TEXT,
  original_price DECIMAL(10,2) NOT NULL,
  final_price DECIMAL(10,2),
  payment_method ENUM('Cash','UPI','Card') DEFAULT 'Cash',
  status ENUM('PENDING','BARGAINING','COUNTER_OFFER_PENDING_USER','ACCEPTED','REJECTED','IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'PENDING',
  completion_pin VARCHAR(255),
  customer_tpin VARCHAR(6),
  tpin_attempts INT NOT NULL DEFAULT 0,
  tpin_expires_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bargain_offers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT NOT NULL,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  sender_role ENUM('USER','WORKER') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  message VARCHAR(500),
  status ENUM('PENDING','ACCEPTED','REJECTED','COUNTERED') DEFAULT 'PENDING',
  responded_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT NOT NULL UNIQUE,
  user_id INT NOT NULL,
  worker_id INT NOT NULL,
  rating INT NOT NULL,
  comment TEXT,
  is_removed BOOLEAN DEFAULT FALSE,
  removal_reason VARCHAR(500),
  removed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reward_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  booking_id INT,
  type ENUM('EARN','REDEEM','BONUS') NOT NULL,
  coins INT NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  type VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT IGNORE INTO services (name,description,icon,base_price) VALUES
('Cleaning','Home and office cleaning','🧹',150),
('Plumbing','Repairs and installations','🔧',250),
('Electrician','Electrical repair and installation','⚡',200),
('AC Repair','AC repair and maintenance','❄️',500),
('Appliance Repair','Home appliance repair','🔌',450),
('Beauty & Grooming','Professional beauty services','💇',300),
('Painting','Interior and exterior painting','🎨',450),
('Carpenter','Furniture and carpentry work','🪚',350),
('Home Shifting','Home shifting assistance','📦',500),
('Pest Control','Professional pest control','🐜',500),
('Computer/Laptop Repair','Computer repair services','💻',700),
('Other','Other local services','📌',100);

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
