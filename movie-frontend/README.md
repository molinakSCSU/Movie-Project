# Movie Frontend

Vite + React client for Tonight's Movie Picks, with a colocated Vercel serverless API in `api/`.

## Scripts
```bash
npm install
npm run dev
npm run build
npm run preview
```

## Environment
Use `.env.local` for local overrides:

```env
# Default for Vercel deployment
VITE_API_BASE_URL=/api
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here

# Optional local Flask backend
# VITE_API_BASE_URL=http://127.0.0.1:5050
```

## API
- `GET /api/movies/genre?genreId=<id>`
- Optional query: `minRating`
- `GET /api/profile` (auth required)
- `PUT /api/profile` (auth required)

Set these on Vercel:
- `OMDB_API_KEY`
- `TMDB_API_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
