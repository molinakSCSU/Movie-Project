import { verifyToken } from '@clerk/backend';
import { neon } from '@neondatabase/serverless';

const MAX_PROFILE_PAYLOAD_BYTES = 1024 * 1024;

const ensureProfileTable = async (sql) => {
  await sql`
    CREATE TABLE IF NOT EXISTS movie_user_profiles (
      clerk_user_id TEXT PRIMARY KEY,
      profile_state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
};

const parseJsonBody = (body) => {
  if (!body) {
    return null;
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  if (typeof body === 'object') {
    return body;
  }

  return null;
};

const extractBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== 'string') {
    return '';
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return '';
  }

  return token;
};

const assertRequiredEnv = () => {
  if (!process.env.CLERK_SECRET_KEY) {
    return 'Missing CLERK_SECRET_KEY environment variable.';
  }

  if (!process.env.DATABASE_URL) {
    return 'Missing DATABASE_URL environment variable.';
  }

  return null;
};

const authorizeRequest = async (req) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return { error: 'Missing Bearer token.' };
  }

  const { data, errors } = await verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  if (errors?.length || !data?.sub) {
    return { error: 'Invalid or expired session token.' };
  }

  return { userId: data.sub };
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const missingEnvError = assertRequiredEnv();
  if (missingEnvError) {
    return res.status(500).json({ error: missingEnvError });
  }

  try {
    const authResult = await authorizeRequest(req);
    if (authResult.error) {
      return res.status(401).json({ error: authResult.error });
    }

    const sql = neon(process.env.DATABASE_URL);
    await ensureProfileTable(sql);

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT profile_state, updated_at
        FROM movie_user_profiles
        WHERE clerk_user_id = ${authResult.userId}
        LIMIT 1
      `;

      const row = rows[0];
      return res.status(200).json({
        profileState: row?.profile_state ?? null,
        updatedAt: row?.updated_at ?? null,
      });
    }

    const body = parseJsonBody(req.body);
    const profileState = body?.profileState;

    if (!profileState || typeof profileState !== 'object' || Array.isArray(profileState)) {
      return res.status(400).json({ error: 'profileState must be a JSON object.' });
    }

    const serialized = JSON.stringify(profileState);
    const payloadSize = Buffer.byteLength(serialized, 'utf8');
    if (payloadSize > MAX_PROFILE_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'profileState payload is too large.' });
    }

    const rows = await sql`
      INSERT INTO movie_user_profiles (clerk_user_id, profile_state)
      VALUES (${authResult.userId}, ${serialized}::jsonb)
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET profile_state = EXCLUDED.profile_state, updated_at = NOW()
      RETURNING updated_at
    `;

    return res.status(200).json({ ok: true, updatedAt: rows[0]?.updated_at ?? null });
  } catch (error) {
    if (error?.name === 'NeonDbError') {
      return res.status(503).json({ error: 'Database unavailable. Please try again.' });
    }

    if (error?.name === 'SyntaxError') {
      return res.status(400).json({ error: 'Invalid JSON payload.' });
    }

    const fallback = 'Unexpected server error while syncing profile.';
    const message = error instanceof Error ? error.message : fallback;
    return res.status(500).json({ error: message || fallback });
  }
}
