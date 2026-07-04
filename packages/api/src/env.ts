import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(1),
  CRYPTO_KEY: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  API_PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().min(1),
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  SPOTIFY_REDIRECT_URI: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
