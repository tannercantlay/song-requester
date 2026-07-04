import SpotifyWebApi from "spotify-web-api-node";
import { env } from "../env.js";
import { HttpError } from "./requests.js";

const SCOPES = ["playlist-read-private", "user-library-read"];

function assertConfigured(): void {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET || !env.SPOTIFY_REDIRECT_URI) {
    throw new HttpError(
      501,
      "Spotify integration isn't configured — set SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI",
    );
  }
}

function client(): SpotifyWebApi {
  assertConfigured();
  return new SpotifyWebApi({
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
    redirectUri: env.SPOTIFY_REDIRECT_URI,
  });
}

export function getAuthorizeUrl(state: string): string {
  return client().createAuthorizeURL(SCOPES, state);
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  const api = client();
  const result = await api.authorizationCodeGrant(code);
  return {
    accessToken: result.body.access_token,
    refreshToken: result.body.refresh_token,
  };
}

export async function getAccessTokenFromRefreshToken(refreshToken: string): Promise<string> {
  const api = client();
  api.setRefreshToken(refreshToken);
  const result = await api.refreshAccessToken();
  return result.body.access_token;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  imageUrl: string | null;
  trackCount: number;
}

export async function listPlaylists(accessToken: string): Promise<SpotifyPlaylist[]> {
  const api = client();
  api.setAccessToken(accessToken);
  const result = await api.getUserPlaylists({ limit: 50 });
  return result.body.items.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.images[0]?.url ?? null,
    trackCount: p.tracks.total,
  }));
}

export interface SpotifyTrack {
  spotifyUri: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtUrl: string | null;
  durationMs: number | null;
}

export async function getPlaylistTracks(accessToken: string, playlistId: string): Promise<SpotifyTrack[]> {
  const api = client();
  api.setAccessToken(accessToken);

  const tracks: SpotifyTrack[] = [];
  let offset = 0;
  const limit = 100;

  for (;;) {
    const result = await api.getPlaylistTracks(playlistId, { offset, limit });
    for (const item of result.body.items) {
      const track = item.track;
      if (!track || track.type !== "track") continue;
      tracks.push({
        spotifyUri: track.uri,
        title: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        album: track.album?.name ?? null,
        albumArtUrl: track.album?.images[0]?.url ?? null,
        durationMs: track.duration_ms ?? null,
      });
    }
    if (result.body.items.length < limit) break;
    offset += limit;
  }

  return tracks;
}
