-- Job Portal Database Schema
-- Using Aiven defaultdb (no CREATE DATABASE needed)

-- Users table (students + admins)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('student', 'admin', 'employer') DEFAULT 'student',
  avatar VARCHAR(255) DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  skills VARCHAR(500) DEFAULT NULL,
  resume_url VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employers table
CREATE TABLE IF NOT EXISTS employers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  company_name VARCHAR(200) NOT NULL,
  company_logo VARCHAR(255) DEFAULT NULL,
  company_website VARCHAR(255) DEFAULT NULL,
  company_description TEXT DEFAULT NULL,
  industry VARCHAR(100) DEFAULT NULL,
  location VARCHAR(150) DEFAULT NULL,
  verification_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  rejection_reason TEXT DEFAULT NULL,
  verified_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employer_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT DEFAULT NULL,
  location VARCHAR(150) NOT NULL,
  job_type ENUM('full-time', 'part-time', 'short-term', 'contract', 'remote') DEFAULT 'full-time',
  category VARCHAR(100) DEFAULT NULL,
  salary_min DECIMAL(10,2) DEFAULT NULL,
  salary_max DECIMAL(10,2) DEFAULT NULL,
  deadline DATE DEFAULT NULL,
  status ENUM('active', 'closed', 'pending', 'rejected') DEFAULT 'pending',
  rejection_reason TEXT DEFAULT NULL,
  views INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employer_id) REFERENCES employers(id) ON DELETE CASCADE
);

-- Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  job_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_bookmark (user_id, job_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Applications table
CREATE TABLE IF NOT EXISTS applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  job_id INT NOT NULL,
  cover_letter TEXT DEFAULT NULL,
  status ENUM('pending', 'reviewed', 'shortlisted', 'rejected', 'hired') DEFAULT 'pending',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_application (user_id, job_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Job views analytics
CREATE TABLE IF NOT EXISTS job_views (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  user_id INT DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Seed admin user (password: password)
INSERT IGNORE INTO users (name, email, password, role) VALUES
('Admin User', 'admin@jobportal.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- Seed sample employer user (password: password)
INSERT IGNORE INTO users (name, email, password, role) VALUES
('Tech Corp HR', 'employer@techcorp.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employer');

-- Seed sample student user (password: password)
INSERT IGNORE INTO users (name, email, password, role) VALUES
('Sarah Tan', 'student@rp.edu.sg', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'student');
