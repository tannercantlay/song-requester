\restrict dbmate

-- Dumped from database version 16.14
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    spotify_refresh_token_enc text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocked_guest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_guest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    requester_token text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    public_token text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    requests_paused boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    CONSTRAINT event_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])))
);


--
-- Name: request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    song_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    vote_count integer DEFAULT 1 NOT NULL,
    queue_position integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    played_at timestamp with time zone,
    CONSTRAINT request_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'playing'::text, 'played'::text, 'dismissed'::text])))
);


--
-- Name: request_vote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_vote (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    requester_token text NOT NULL,
    requester_name text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: song; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.song (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    artist text NOT NULL,
    album text,
    album_art_url text,
    duration_ms integer,
    spotify_uri text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    genre text
);


--
-- Name: admin admin_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_email_key UNIQUE (email);


--
-- Name: admin admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_pkey PRIMARY KEY (id);


--
-- Name: blocked_guest blocked_guest_event_id_requester_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_guest
    ADD CONSTRAINT blocked_guest_event_id_requester_token_key UNIQUE (event_id, requester_token);


--
-- Name: blocked_guest blocked_guest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_guest
    ADD CONSTRAINT blocked_guest_pkey PRIMARY KEY (id);


--
-- Name: event event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_pkey PRIMARY KEY (id);


--
-- Name: event event_public_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event
    ADD CONSTRAINT event_public_token_key UNIQUE (public_token);


--
-- Name: request request_event_id_song_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request
    ADD CONSTRAINT request_event_id_song_id_key UNIQUE (event_id, song_id);


--
-- Name: request request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request
    ADD CONSTRAINT request_pkey PRIMARY KEY (id);


--
-- Name: request_vote request_vote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_vote
    ADD CONSTRAINT request_vote_pkey PRIMARY KEY (id);


--
-- Name: request_vote request_vote_request_id_requester_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_vote
    ADD CONSTRAINT request_vote_request_id_requester_token_key UNIQUE (request_id, requester_token);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: song song_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song
    ADD CONSTRAINT song_pkey PRIMARY KEY (id);


--
-- Name: song song_spotify_uri_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song
    ADD CONSTRAINT song_spotify_uri_key UNIQUE (spotify_uri);


--
-- Name: request_event_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX request_event_status_idx ON public.request USING btree (event_id, status);


--
-- Name: request_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX request_queue_idx ON public.request USING btree (event_id, queue_position);


--
-- Name: request_vote_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX request_vote_request_idx ON public.request_vote USING btree (request_id);


--
-- Name: song_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX song_active_idx ON public.song USING btree (is_active);


--
-- Name: song_artist_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX song_artist_trgm_idx ON public.song USING gin (artist public.gin_trgm_ops);


--
-- Name: song_genre_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX song_genre_idx ON public.song USING btree (genre);


--
-- Name: song_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX song_title_trgm_idx ON public.song USING gin (title public.gin_trgm_ops);


--
-- Name: request request_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER request_set_updated_at BEFORE UPDATE ON public.request FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: blocked_guest blocked_guest_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_guest
    ADD CONSTRAINT blocked_guest_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;


--
-- Name: request request_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request
    ADD CONSTRAINT request_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event(id) ON DELETE CASCADE;


--
-- Name: request request_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request
    ADD CONSTRAINT request_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.song(id);


--
-- Name: request_vote request_vote_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_vote
    ADD CONSTRAINT request_vote_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.request(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('0001'),
    ('0002');
