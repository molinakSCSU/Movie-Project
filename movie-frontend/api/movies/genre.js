const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const parseFloatSafe = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildMoviePayload = (tmdbMovie, omdbData) => {
  const title = tmdbMovie?.title || '';
  const releaseDate = tmdbMovie?.release_date || '';
  const year = releaseDate.length >= 4 ? releaseDate.slice(0, 4) : '';

  const imdbRating = omdbData?.imdbRating || 'N/A';
  const genreTag = omdbData?.Genre || '';

  let poster = omdbData?.Poster || '';
  if (!poster || poster === 'N/A') {
    const posterPath = tmdbMovie?.poster_path;
    poster = posterPath ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : '';
  }

  const tmdbVoteAverage = parseFloatSafe(tmdbMovie?.vote_average, 0);
  const userScore = Math.round(tmdbVoteAverage * 10);

  return {
    title,
    genre_ids: tmdbMovie?.genre_ids || [],
    Poster: poster,
    imdb_rating: imdbRating,
    Genre: genreTag,
    overview: tmdbMovie?.overview || '',
    release_year: year,
    tmdb_vote_average: tmdbVoteAverage,
    user_score: userScore,
  };
};

const fetchOmdbData = async (title, year, omdbApiKey) => {
  try {
    const omdbUrl = new URL('https://www.omdbapi.com/');
    omdbUrl.searchParams.set('t', title);
    if (year) {
      omdbUrl.searchParams.set('y', year);
    }
    omdbUrl.searchParams.set('apikey', omdbApiKey);

    const omdbResponse = await fetch(omdbUrl, { method: 'GET' });
    if (!omdbResponse.ok) {
      return null;
    }

    const omdbJson = await omdbResponse.json();
    if (omdbJson?.Response !== 'True') {
      return null;
    }

    return omdbJson;
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const genreId = req.query.genreId;
  if (!genreId) {
    return res.status(400).json({ error: 'Missing genreId query parameter.' });
  }

  const minRatingRaw = req.query.minRating ?? '0';
  const minVoteAverage = parseFloatSafe(minRatingRaw, Number.NaN);
  if (!Number.isFinite(minVoteAverage)) {
    return res.status(400).json({ error: 'minRating must be a valid number.' });
  }

  const tmdbApiKey = process.env.TMDB_API_KEY;
  const omdbApiKey = process.env.OMDB_API_KEY;

  if (!tmdbApiKey || !omdbApiKey) {
    return res.status(500).json({ error: 'Missing OMDB_API_KEY or TMDB_API_KEY environment variables.' });
  }

  const collectedMovies = [];
  const seenTitles = new Set();

  try {
    for (let page = 1; page <= 3; page += 1) {
      const tmdbUrl = new URL('https://api.themoviedb.org/3/discover/movie');
      tmdbUrl.searchParams.set('api_key', tmdbApiKey);
      tmdbUrl.searchParams.set('with_genres', String(genreId));
      tmdbUrl.searchParams.set('vote_average.gte', String(minVoteAverage));
      tmdbUrl.searchParams.set('vote_count.gte', '1000');
      tmdbUrl.searchParams.set('sort_by', 'vote_average.desc');
      tmdbUrl.searchParams.set('page', String(page));

      const tmdbResponse = await fetch(tmdbUrl, { method: 'GET' });
      if (!tmdbResponse.ok) {
        return res.status(tmdbResponse.status).json({ error: 'Failed to fetch data from TMDB.' });
      }

      const tmdbJson = await tmdbResponse.json();
      const tmdbMovies = Array.isArray(tmdbJson?.results) ? tmdbJson.results : [];

      for (const tmdbMovie of tmdbMovies) {
        const title = tmdbMovie?.title;
        if (!title || seenTitles.has(title)) {
          continue;
        }

        const releaseDate = tmdbMovie?.release_date || '';
        const year = releaseDate.length >= 4 ? releaseDate.slice(0, 4) : '';
        const omdbData = await fetchOmdbData(title, year, omdbApiKey);

        collectedMovies.push(buildMoviePayload(tmdbMovie, omdbData));
        seenTitles.add(title);

        if (collectedMovies.length >= 30) {
          break;
        }
      }

      if (collectedMovies.length >= 30) {
        break;
      }
    }

    collectedMovies.sort((a, b) => parseFloatSafe(b.tmdb_vote_average) - parseFloatSafe(a.tmdb_vote_average));
    if (collectedMovies.length === 0) {
      return res.status(404).json({ error: 'No movies found for the selected genre.' });
    }

    return res.status(200).json(collectedMovies.slice(0, 20));
  } catch {
    return res.status(504).json({ error: 'Upstream movie providers did not respond in time.' });
  }
}
