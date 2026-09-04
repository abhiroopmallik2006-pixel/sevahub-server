USE sevahub;

CREATE TABLE IF NOT EXISTS worker_skill_certificates (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  worker_id INT NOT NULL UNIQUE,
  service_id INT NULL,
  title VARCHAR(160) NOT NULL,
  issuer VARCHAR(160) NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  file_size INT NOT NULL,
  file_data LONGBLOB NOT NULL,
  status ENUM('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
  review_reason VARCHAR(500) NULL,
  reviewed_by VARCHAR(150) NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_skill_cert_status (status,updated_at),
  INDEX idx_skill_cert_service (service_id,status),
  CONSTRAINT fk_skill_cert_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  CONSTRAINT fk_skill_cert_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
