CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  lifeguard_role TEXT,
  phone TEXT,
  assigned_zones TEXT,
  certifications TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  photo_uri TEXT,
  shift_start TEXT,
  shift_end TEXT,
  mobile_app_status TEXT DEFAULT 'disconnected',
  acknowledged_alerts INTEGER NOT NULL DEFAULT 0,
  missed_alerts INTEGER NOT NULL DEFAULT 0,
  last_alert_acknowledged_at TEXT,
  on_duty_since TEXT,
  response_time TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_verifications (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'signup',
  code TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (email, purpose)
);

CREATE TABLE IF NOT EXISTS geofence_layouts (
  camera_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  coord_space TEXT NOT NULL DEFAULT 'editor',
  editor_width INTEGER NOT NULL DEFAULT 1000,
  editor_height INTEGER NOT NULL DEFAULT 512,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS geofence_zones (
  id TEXT PRIMARY KEY,
  camera_id TEXT NOT NULL DEFAULT 'CAM-01',
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'toward',
  active_during_standby INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (camera_id) REFERENCES geofence_layouts(camera_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS geofence_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  FOREIGN KEY (zone_id) REFERENCES geofence_zones(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_geofence_zones_camera
  ON geofence_zones(camera_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_geofence_points_zone
  ON geofence_points(zone_id, seq);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  code TEXT,
  title TEXT NOT NULL,
  meta TEXT,
  event_time TEXT,
  event_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  severity TEXT,
  category TEXT,
  confidence REAL,
  camera TEXT NOT NULL DEFAULT 'CAM-01',
  person_id INTEGER,
  zone TEXT,
  zone_label TEXT,
  event_name TEXT,
  is_alert INTEGER NOT NULL DEFAULT 0,
  snapshot_uri TEXT,
  ts REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_camera ON events(camera);