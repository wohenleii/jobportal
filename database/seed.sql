-- Seed data for defaultdb

-- Insert employer profile for the seeded employer user
INSERT IGNORE INTO employers (user_id, company_name, company_website, company_description, industry, location)
SELECT id, 'Tech Corp', 'https://techcorp.com', 'A leading technology company building innovative solutions.', 'Technology', 'San Francisco, CA'
FROM users WHERE email = 'employer@techcorp.com';

-- Insert sample jobs
INSERT IGNORE INTO jobs (employer_id, title, description, requirements, location, job_type, category, salary_min, salary_max, deadline, status) VALUES
(1, 'Frontend Developer', 'We are looking for a skilled Frontend Developer to join our team. You will be responsible for building responsive web applications using modern JavaScript frameworks.', 'React, HTML, CSS, JavaScript, 2+ years experience', 'San Francisco, CA', 'full-time', 'Technology', 70000, 100000, '2026-08-01', 'active'),
(1, 'Backend Engineer', 'Join our backend team to build scalable APIs and microservices. You will work with Node.js, Express, and cloud infrastructure.', 'Node.js, Express, MySQL, AWS, 3+ years experience', 'Remote', 'remote', 'Technology', 90000, 130000, '2026-07-15', 'active'),
(1, 'UI/UX Designer', 'Design beautiful and intuitive user interfaces for our web and mobile products. Collaborate with product and engineering teams.', 'Figma, Adobe XD, Prototyping, 2+ years experience', 'New York, NY', 'full-time', 'Design', 65000, 90000, '2026-07-30', 'active'),
(1, 'Data Analyst Intern', 'Summer internship opportunity for data enthusiasts. Work with real datasets and build dashboards.', 'Python, SQL, Excel, Statistics knowledge', 'Chicago, IL', 'internship', 'Data Science', 20, 25, '2026-06-30', 'active'),
(1, 'DevOps Engineer', 'Manage and improve our CI/CD pipelines, cloud infrastructure, and deployment processes.', 'Docker, Kubernetes, AWS, Jenkins, 4+ years experience', 'Austin, TX', 'full-time', 'Technology', 100000, 140000, '2026-08-15', 'active'),
(1, 'Marketing Manager', 'Lead our digital marketing efforts including SEO, SEM, social media, and content strategy.', 'Digital marketing, SEO, Google Analytics, 3+ years experience', 'Los Angeles, CA', 'full-time', 'Marketing', 60000, 85000, '2026-07-20', 'active');
