# Movie Frontend

Vite + React client for Tonight's Movie Picks, with a colocated Vercel serverless API in `api/` for movie fetching.

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
# Frontend + Vercel API base
VITE_API_BASE_URL=/api

# Supabase Auth + profile sync
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional local Flask backend
# VITE_API_BASE_URL=http://127.0.0.1:5050
```

## API
- `GET /api/movies/genre?genreId=<id>`
- Optional query: `minRating`

## Supabase table setup
Run this SQL in Supabase SQL editor:

```sql
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read own profile"
on public.user_profiles
for select
using (auth.uid() = user_id);

create policy "Users can upsert own profile"
on public.user_profiles
for insert
with check (auth.uid() = user_id);

create policy "Users can update own profile"
on public.user_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

Set these on Vercel:
- `OMDB_API_KEY`
- `TMDB_API_KEY`
- `VITE_API_BASE_URL=/api`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
