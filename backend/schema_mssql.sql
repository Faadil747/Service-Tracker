-- Social Tracker — MS SQL schema for the LinkedInTest database.
-- Generated from the SQLAlchemy models. Run this in SSMS against LinkedInTest.
-- Strings are NVARCHAR so emojis / unicode are preserved.

CREATE TABLE users (
	id NVARCHAR(36) NOT NULL, 
	email NVARCHAR(255) NOT NULL, 
	full_name NVARCHAR(255) NOT NULL, 
	hashed_password NVARCHAR(255) NOT NULL, 
	role VARCHAR(9) NOT NULL, 
	region NVARCHAR(50) NOT NULL, 
	linkedin_url NVARCHAR(500) NOT NULL, 
	avatar_url NVARCHAR(500) NOT NULL, 
	is_active BIT NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id)
);
GO

CREATE UNIQUE INDEX ix_users_email ON users (email);
GO

CREATE TABLE page_metrics (
	id NVARCHAR(36) NOT NULL, 
	metric_date DATETIME NOT NULL, 
	page_id NVARCHAR(100) NOT NULL, 
	region NVARCHAR(50) NOT NULL, 
	followers INTEGER NOT NULL, 
	followers_gained INTEGER NOT NULL, 
	followers_lost INTEGER NOT NULL, 
	visitors INTEGER NOT NULL, 
	impressions INTEGER NOT NULL, 
	likes INTEGER NOT NULL, 
	comments INTEGER NOT NULL, 
	shares INTEGER NOT NULL, 
	clicks INTEGER NOT NULL, 
	engagement_rate FLOAT NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id)
);
GO

CREATE INDEX ix_page_metrics_metric_date ON page_metrics (metric_date);
GO

CREATE INDEX ix_page_metrics_region ON page_metrics (region);
GO

CREATE TABLE audience_demographics (
	id NVARCHAR(36) NOT NULL, 
	snapshot_date DATETIME NOT NULL, 
	region NVARCHAR(50) NOT NULL, 
	country NVARCHAR(100) NOT NULL, 
	seniority NVARCHAR(100) NOT NULL, 
	industry NVARCHAR(255) NOT NULL, 
	[function] NVARCHAR(255) NOT NULL, 
	company_size NVARCHAR(50) NOT NULL, 
	follower_count INTEGER NOT NULL, 
	non_follower_reach INTEGER NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id)
);
GO

CREATE TABLE follower_snapshots (
	id NVARCHAR(36) NOT NULL, 
	snapshot_date DATETIME NOT NULL, 
	followers INTEGER NOT NULL, 
	organic_followers INTEGER NOT NULL, 
	paid_followers INTEGER NOT NULL, 
	impressions INTEGER NOT NULL, 
	unique_impressions INTEGER NOT NULL, 
	clicks INTEGER NOT NULL, 
	likes INTEGER NOT NULL, 
	comments INTEGER NOT NULL, 
	shares INTEGER NOT NULL, 
	visitors INTEGER NOT NULL, 
	engagement_rate FLOAT NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_follower_snapshot_date UNIQUE (snapshot_date)
);
GO

CREATE INDEX ix_follower_snapshots_snapshot_date ON follower_snapshots (snapshot_date);
GO

CREATE TABLE campaigns (
	id NVARCHAR(36) NOT NULL, 
	name NVARCHAR(255) NOT NULL, 
	region NVARCHAR(50) NOT NULL, 
	start_date DATETIME NULL, 
	end_date DATETIME NULL, 
	goal NVARCHAR(max) NOT NULL, 
	tags NVARCHAR(max) NOT NULL, 
	created_by_id NVARCHAR(36) NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(created_by_id) REFERENCES users (id)
);
GO

CREATE TABLE notifications (
	id NVARCHAR(36) NOT NULL, 
	user_id NVARCHAR(36) NOT NULL, 
	type NVARCHAR(50) NOT NULL, 
	title NVARCHAR(255) NOT NULL, 
	body NVARCHAR(max) NOT NULL, 
	is_read BIT NOT NULL, 
	reference_id NVARCHAR(36) NOT NULL, 
	reference_type NVARCHAR(50) NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
GO

CREATE INDEX ix_notifications_user_id ON notifications (user_id);
GO

CREATE INDEX ix_notifications_created_at ON notifications (created_at);
GO

CREATE INDEX ix_notifications_is_read ON notifications (is_read);
GO

CREATE TABLE alerts (
	id NVARCHAR(36) NOT NULL, 
	raised_by_id NVARCHAR(36) NOT NULL, 
	title NVARCHAR(255) NOT NULL, 
	body NVARCHAR(max) NOT NULL, 
	priority NVARCHAR(20) NOT NULL, 
	status NVARCHAR(20) NOT NULL, 
	region NVARCHAR(50) NOT NULL, 
	reference_id NVARCHAR(36) NOT NULL, 
	reference_type NVARCHAR(50) NOT NULL, 
	resolved_at DATETIME NULL, 
	resolved_by_id NVARCHAR(36) NULL, 
	target_user_id NVARCHAR(36) NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(raised_by_id) REFERENCES users (id), 
	FOREIGN KEY(resolved_by_id) REFERENCES users (id), 
	FOREIGN KEY(target_user_id) REFERENCES users (id)
);
GO

CREATE TABLE comments (
	id NVARCHAR(36) NOT NULL, 
	entity_type NVARCHAR(50) NOT NULL, 
	entity_id NVARCHAR(36) NOT NULL, 
	author_id NVARCHAR(36) NOT NULL, 
	content NVARCHAR(max) NOT NULL, 
	parent_id NVARCHAR(36) NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(author_id) REFERENCES users (id), 
	FOREIGN KEY(parent_id) REFERENCES comments (id)
);
GO

CREATE INDEX ix_comments_entity_id ON comments (entity_id);
GO

CREATE TABLE api_config (
	id NVARCHAR(36) NOT NULL, 
	key_name NVARCHAR(100) NOT NULL, 
	value_encrypted NVARCHAR(max) NOT NULL, 
	description NVARCHAR(500) NOT NULL, 
	updated_by_id NVARCHAR(36) NULL, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	UNIQUE (key_name), 
	FOREIGN KEY(updated_by_id) REFERENCES users (id)
);
GO

CREATE TABLE activity_log (
	id NVARCHAR(36) NOT NULL, 
	user_id NVARCHAR(36) NULL, 
	action NVARCHAR(100) NOT NULL, 
	entity_type NVARCHAR(50) NOT NULL, 
	entity_id NVARCHAR(36) NOT NULL, 
	metadata_json NVARCHAR(max) NOT NULL, 
	ip_address NVARCHAR(50) NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
GO

CREATE INDEX ix_activity_log_created_at ON activity_log (created_at);
GO

CREATE INDEX ix_activity_log_user_id ON activity_log (user_id);
GO

CREATE TABLE tasks (
	id NVARCHAR(36) NOT NULL, 
	title NVARCHAR(500) NOT NULL, 
	description NVARCHAR(max) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	region NVARCHAR(50) NOT NULL, 
	due_date DATETIME NULL, 
	recurrence NVARCHAR(50) NOT NULL, 
	recurrence_end_date DATETIME NULL, 
	priority NVARCHAR(20) NOT NULL, 
	campaign_id NVARCHAR(36) NULL, 
	created_by_id NVARCHAR(36) NOT NULL, 
	approved_by_id NVARCHAR(36) NULL, 
	claimed_by_id NVARCHAR(36) NULL, 
	approved_at DATETIME NULL, 
	completed_at DATETIME NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id), 
	FOREIGN KEY(created_by_id) REFERENCES users (id), 
	FOREIGN KEY(approved_by_id) REFERENCES users (id), 
	FOREIGN KEY(claimed_by_id) REFERENCES users (id)
);
GO

CREATE INDEX ix_tasks_completed_at ON tasks (completed_at);
GO

CREATE INDEX ix_tasks_status ON tasks (status);
GO

CREATE INDEX ix_tasks_priority ON tasks (priority);
GO

CREATE INDEX ix_tasks_region ON tasks (region);
GO

CREATE TABLE task_assignments (
	id NVARCHAR(36) NOT NULL, 
	task_id NVARCHAR(36) NOT NULL, 
	agent_id NVARCHAR(36) NOT NULL, 
	assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(task_id) REFERENCES tasks (id), 
	FOREIGN KEY(agent_id) REFERENCES users (id)
);
GO

CREATE TABLE task_completions (
	id NVARCHAR(36) NOT NULL, 
	task_id NVARCHAR(36) NOT NULL, 
	agent_id NVARCHAR(36) NOT NULL, 
	completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	proof_url NVARCHAR(500) NOT NULL, 
	notes NVARCHAR(max) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(task_id) REFERENCES tasks (id), 
	FOREIGN KEY(agent_id) REFERENCES users (id)
);
GO

CREATE TABLE task_approvals (
	id NVARCHAR(36) NOT NULL, 
	task_id NVARCHAR(36) NOT NULL, 
	approver_id NVARCHAR(36) NOT NULL, 
	status NVARCHAR(20) NOT NULL, 
	comment NVARCHAR(max) NOT NULL, 
	decided_at DATETIME NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(task_id) REFERENCES tasks (id), 
	FOREIGN KEY(approver_id) REFERENCES users (id)
);
GO

CREATE TABLE posts (
	id NVARCHAR(36) NOT NULL, 
	title NVARCHAR(500) NOT NULL, 
	content NVARCHAR(max) NOT NULL, 
	status VARCHAR(9) NOT NULL, 
	post_type VARCHAR(13) NOT NULL, 
	region NVARCHAR(50) NOT NULL, 
	priority NVARCHAR(20) NOT NULL, 
	scheduled_at DATETIME NULL, 
	published_at DATETIME NULL, 
	linkedin_post_id NVARCHAR(255) NOT NULL, 
	image_url NVARCHAR(500) NOT NULL, 
	hashtags NVARCHAR(max) NOT NULL, 
	tone NVARCHAR(50) NOT NULL, 
	employee_engagement NVARCHAR(max) NOT NULL, 
	campaign_id NVARCHAR(36) NULL, 
	task_id NVARCHAR(36) NULL, 
	created_by_id NVARCHAR(36) NOT NULL, 
	approved_by_id NVARCHAR(36) NULL, 
	review_comment NVARCHAR(max) NULL, 
	is_template BIT NOT NULL, 
	ab_variant NVARCHAR(10) NOT NULL, 
	predicted_reach INTEGER NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(campaign_id) REFERENCES campaigns (id), 
	FOREIGN KEY(task_id) REFERENCES tasks (id), 
	FOREIGN KEY(created_by_id) REFERENCES users (id), 
	FOREIGN KEY(approved_by_id) REFERENCES users (id)
);
GO

CREATE INDEX ix_posts_scheduled_at ON posts (scheduled_at);
GO

CREATE INDEX ix_posts_status ON posts (status);
GO

CREATE INDEX ix_posts_region ON posts (region);
GO

CREATE TABLE post_drafts (
	id NVARCHAR(36) NOT NULL, 
	post_id NVARCHAR(36) NOT NULL, 
	content NVARCHAR(max) NOT NULL, 
	version INTEGER NOT NULL, 
	created_by_id NVARCHAR(36) NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(post_id) REFERENCES posts (id), 
	FOREIGN KEY(created_by_id) REFERENCES users (id)
);
GO

CREATE TABLE post_metrics (
	id NVARCHAR(36) NOT NULL, 
	post_id NVARCHAR(36) NOT NULL, 
	metric_date DATETIME NOT NULL, 
	impressions INTEGER NOT NULL, 
	likes INTEGER NOT NULL, 
	comments INTEGER NOT NULL, 
	shares INTEGER NOT NULL, 
	clicks INTEGER NOT NULL, 
	engagement_velocity FLOAT NOT NULL, 
	sentiment_score FLOAT NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(post_id) REFERENCES posts (id)
);
GO

CREATE INDEX ix_post_metrics_post_id ON post_metrics (post_id);
GO

CREATE TABLE link_tracking (
	id NVARCHAR(36) NOT NULL, 
	post_id NVARCHAR(36) NULL, 
	agent_id NVARCHAR(36) NOT NULL, 
	original_url NVARCHAR(max) NOT NULL, 
	short_code NVARCHAR(20) NOT NULL, 
	short_url NVARCHAR(255) NOT NULL, 
	utm_source NVARCHAR(100) NOT NULL, 
	utm_medium NVARCHAR(100) NOT NULL, 
	utm_campaign NVARCHAR(255) NOT NULL, 
	utm_content NVARCHAR(255) NOT NULL, 
	region NVARCHAR(50) NOT NULL, 
	total_clicks INTEGER NOT NULL, 
	click_data NVARCHAR(max) NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(post_id) REFERENCES posts (id), 
	FOREIGN KEY(agent_id) REFERENCES users (id), 
	UNIQUE (short_code)
);
GO


-- ── First admin login ──────────────────────────────────────────────────────
-- Email: admin@gorecruitai.com    Password: admin@123    (CHANGE THIS after first login!)
IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@gorecruitai.com')
INSERT INTO users (id, email, full_name, hashed_password, role, region, linkedin_url, avatar_url, is_active, created_at, updated_at)
VALUES ('2d5e0661-3260-4bb4-be85-992519685e40', 'admin@gorecruitai.com', 'Administrator', '$2b$12$lW/Xr6qfHFA/8PmOf.rEP.NdtXO84jS4rqh8PC2VwhhwQaSS41TFy', 'admin', 'Global', '', '', 1, GETDATE(), GETDATE());
GO
