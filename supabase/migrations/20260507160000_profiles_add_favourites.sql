ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favourite_symbols TEXT[] DEFAULT '{}';
