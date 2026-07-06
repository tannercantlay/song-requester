-- migrate:up

ALTER TABLE song ADD COLUMN genre text;
CREATE INDEX song_genre_idx ON song (genre);

-- migrate:down

DROP INDEX IF EXISTS song_genre_idx;
ALTER TABLE song DROP COLUMN IF EXISTS genre;
