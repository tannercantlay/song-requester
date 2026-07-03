-- Dev/local seed. NOT a migration — run manually against a dev database.
-- Safe to run once on a fresh DB; song insert is guarded so it won't duplicate.
-- Create the admin user with the app's `create-admin` script (password is
-- Argon2-hashed there), not here.

INSERT INTO event (name, public_token)
VALUES ('Demo Party', 'demo')
ON CONFLICT (public_token) DO NOTHING;

INSERT INTO song (title, artist)
SELECT v.title, v.artist
FROM (VALUES
  ('Dancing Queen', 'ABBA'),
  ('Superstition', 'Stevie Wonder'),
  ('September', 'Earth, Wind & Fire'),
  ('Mr. Brightside', 'The Killers'),
  ('Levitating', 'Dua Lipa'),
  ('Uptown Funk', 'Mark Ronson ft. Bruno Mars'),
  ('Sweet Caroline', 'Neil Diamond'),
  ('Don''t Stop Me Now', 'Queen'),
  ('Take On Me', 'a-ha'),
  ('Blinding Lights', 'The Weeknd'),
  ('I Wanna Dance with Somebody', 'Whitney Houston'),
  ('Shut Up and Dance', 'WALK THE MOON'),
  ('Come On Eileen', 'Dexys Midnight Runners'),
  ('Hey Ya!', 'OutKast'),
  ('Valerie', 'Mark Ronson ft. Amy Winehouse')
) AS v(title, artist)
WHERE NOT EXISTS (SELECT 1 FROM song);
