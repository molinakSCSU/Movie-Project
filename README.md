# Tonight's Movie Picks

A full-stack movie recommender with a modern cream-tone UI, adaptive ranking, and personal tracking tools.

## What It Does
- Pulls highest-rated movies by genre from TMDB.
- Enriches each title with IMDb rating and metadata from OMDb.
- Ranks recommendations with a hybrid model:
  - IMDb + user score base ranking
  - your likes/skips
  - watched history signals
- Supports `Discover`, `Watched`, `Watch Later`, and `Dashboard` views.
- Persists frontend state in `localStorage` so your session survives refreshes.

## Stack
- Frontend: React 18, Vite, Tailwind CSS v4, shadcn/ui
- Backend: Flask, Requests, Flask-CORS, python-dotenv
- Data APIs: TMDB + OMDb

## Project Structure
```text
Movie-Project/
├── backend/
│   ├── backend.py
│   └── .env.example
├── movie-frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## 1) Backend Setup
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install flask flask-cors python-dotenv requests
cp .env.example .env
```

Set API keys in `backend/.env`:
```env
OMDB_API_KEY=your_omdb_key
TMDB_API_KEY=your_tmdb_key
```

Run backend:
```bash
python3 backend.py
```

Backend listens on `http://127.0.0.1:5050`.

## 2) Frontend Setup
```bash
cd movie-frontend
npm install
cp .env.example .env.local
```

`movie-frontend/.env.local`:
```env
VITE_API_BASE_URL=http://127.0.0.1:5050
```

Run frontend:
```bash
npm run dev
```

Open `http://127.0.0.1:5173`.

## API
- `GET /movies/genre/<genre_id>`
  - Returns up to 20 enriched titles.
- `GET /movies/genre/<genre_id>/rating/<min_rating>`
  - Legacy compatibility route.

## Notes For GitHub Safety
- Never commit real API keys.
- `.env` files are ignored by git.
- Use only `.env.example` templates in commits.

## Current UX Highlights
- Minimal, non-card-heavy recommendation rows.
- Fast swap flow with undo.
- Watched/Watch Later actions available directly from recommendation rows.
- View transition animations across Discover/Watched/Watch Later/Dashboard.
