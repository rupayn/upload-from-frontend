import dotenv from 'dotenv'
dotenv.config()
import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { jwt, sign } from 'hono/jwt'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { v2 as cloudinary } from 'cloudinary'

const env = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env var ${k}`)
  return v
}

const JWT_SECRET = env('JWT_SECRET')
const CLOUD_NAME = env('CLOUDINARY_CLOUD_NAME')
const API_KEY = env('CLOUDINARY_API_KEY')
const API_SECRET = env('CLOUDINARY_API_SECRET')
const UPLOAD_PRESET = env('CLOUDINARY_UPLOAD_PRESET')

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

const app = new Hono<{ Variables: { jwtPayload: { sub: string } } }>()

// ---------- Global security middleware ----------
app.use('*', secureHeaders())
app.use(
  '/api/*',
  cors({
    origin: env('FRONTEND_ORIGIN'), // only YOUR frontend may call the API
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
)

// ---------- Tiny in-memory rate limiter (use Redis in production) ----------
const hits = new Map<string, number[]>()
const rateLimit = (max: number, windowMs: number) =>
  async (c: any, next: () => Promise<void>) => {
    const key = c.get('jwtPayload')?.sub ?? 'anon'
    const now = Date.now()
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= max) return c.json({ error: 'Too many requests' }, 429)
    recent.push(now)
    hits.set(key, recent)
    await next()
  }
app.get("/", (c) => c.text("Hello World!"))

// ---------- 1) Demo login (replace with your real auth) ----------
app.post(
  '/api/login',
  zValidator('json', z.object({ username: z.string(), password: z.string() })),
  async (c) => {
    const { username, password } = c.req.valid('json')
    if (username !== 'demo' || password !== 'demo123') {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    const token = await sign(
      { sub: 'user_1', exp: Math.floor(Date.now() / 1000) + 60 * 60 },
      JWT_SECRET
    )
    return c.json({ token })
  }
)

// ---------- 2) Issue a short-lived, signed upload permission ----------
const signSchema = z.object({
  mimeType: z.enum(ALLOWED_TYPES),
  size: z.number().int().positive().max(MAX_SIZE),
})

app.post(
  '/api/upload/sign',
  jwt({ secret: JWT_SECRET, alg: 'HS256' }), // must be logged in
  rateLimit(10, 60_000), // 10 signatures / minute / user
  zValidator('json', signSchema), // validate type + size BEFORE signing
  (c) => {
    const user = c.get('jwtPayload')

    // Everything below is decided by the SERVER, never by the client.
    const params = {
      timestamp: Math.round(Date.now() / 1000), // Cloudinary rejects after ~1 hour
      folder: `users/${user.sub}`, // user can only write to own folder
      public_id: randomUUID(), // client can't overwrite existing files
      upload_preset: UPLOAD_PRESET, // enforces format + max size on Cloudinary side
    }

    // Any param the client sends must be in this signature, or Cloudinary rejects it.
    const signature = cloudinary.utils.api_sign_request(params, API_SECRET)

    return c.json({
      ...params,
      signature,
      apiKey: API_KEY, // public identifier, safe to share
      cloudName: CLOUD_NAME,
      // NOTE: API_SECRET is never sent to the browser
    })
  }
)

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) }, (i) =>
  console.log(`API running on http://localhost:${i.port}`)
)