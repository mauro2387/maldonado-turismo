-- Migration: Add 'tags' column to 'places' table
ALTER TABLE places
ADD COLUMN tags TEXT[];