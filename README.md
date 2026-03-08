# Tonight's Movie Picks

A movie recommender with adaptive ranking, watch-state tracking, and a cinematic interface.

## What It Does
- Pulls top genre movies from TMDB.
- Enriches titles with IMDb metadata from OMDb.
- Supports authenticated profiles with per-user cloud sync.
- Ranks picks using provider scores + personal behavior signals:
  - likes/skips
  - watched history
  - watch-later intent
- Supports `Discover`, `Watched`, `Watch Later`, and `Dashboard` views.
- Persists state in `localStorage`.

## Stack
- Frontend: React 18, Vite, Tailwind CSS v4, shadcn/ui, Clerk React
- API: Vercel Serverless Functions (`movie-frontend/api/movies/genre.js`, `movie-frontend/api/profile.js`)
- Persistence: Neon Postgres (`movie_user_profiles`)
- Data Providers: TMDB + OMDb
- Legacy local backend (optional): Flask in `backend/`

## Structure
```text
Movie-Project/
├── movie-frontend/
│   ├── api/movies/genre.js
│   ├── src/
│   ├── .env.example
│   └── package.json
├── backend/                    # optional legacy local backend
└── README.md
```

## Local Development
### Frontend (Vite)
```bash
cd movie-frontend
npm install
npm run dev
```

### API option A: Vercel local runtime
Run Vercel local dev from `movie-frontend` so `/api/*` functions resolve:
```bash
vercel dev
```

### API option B: Legacy Flask backend
If you want to use Flask locally instead:
1. Set frontend env var in `movie-frontend/.env.local`:
```env
VITE_API_BASE_URL=http://127.0.0.1:5050
```
2. Start backend:
```bash
cd backend
python3 backend.py
```

## Deploy (Recommended: Vercel)
Deploy `movie-frontend` as one Vercel project.

Required environment variables in Vercel Project Settings:
- `OMDB_API_KEY`
- `TMDB_API_KEY`
- `VITE_API_BASE_URL` = `/api`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`

## API Route
- `GET /api/movies/genre?genreId=<id>`
- Optional: `minRating=<number>`
- `GET /api/profile` (requires Clerk Bearer token)
- `PUT /api/profile` (requires Clerk Bearer token)

## Security Notes
- Never commit real API keys.
- `.env` files are ignored.
- Rotate keys if they were exposed.
