CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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