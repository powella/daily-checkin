-- Daily beacon: shared circles.
--
-- Run this once against the app database, either by pasting it into
-- phpMyAdmin / HeidiSQL, or by opening api/install.cfm?run=1 on the server.
-- Both do the same thing and are safe to run more than once.

CREATE TABLE IF NOT EXISTS players (
  id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  beacon_id INT NULL DEFAULT NULL,
  handle VARCHAR(24) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  seen_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_players_token (token_hash),
  KEY idx_players_beacon (beacon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS beacons (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(24) NOT NULL,
  name_key VARCHAR(48) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_beacons_key (name_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS checkins (
  player_id CHAR(36) NOT NULL,
  day DATE NOT NULL,
  beacon_id INT NULL DEFAULT NULL,
  country CHAR(2) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (player_id, day),
  KEY idx_checkins_day (day),
  KEY idx_checkins_beacon_day (beacon_id, day),
  KEY idx_checkins_country (country),
  CONSTRAINT fk_checkins_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Upgrades for an install created before the boards existed. Safe to re-run.
ALTER TABLE players ADD COLUMN IF NOT EXISTS handle VARCHAR(24) NOT NULL DEFAULT '';
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS country CHAR(2) NOT NULL DEFAULT '';
