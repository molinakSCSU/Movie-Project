import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const STORAGE_KEY = 'movie_recommender_state_v4';
const MAX_ACTIVITY_LOG = 220;

const MOVIE_GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Science Fiction' },
  { id: 10770, name: 'TV Movie' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' },
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5050';

const toMovieKey = (movie) => `${movie?.title || 'untitled'}::${movie?.release_year || ''}`;

const parseNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTenPointUserScore = (movie) => {
  const raw = parseNumber(movie?.user_score);
  if (raw <= 0) {
    return 0;
  }
  return raw > 10 ? raw / 10 : raw;
};

const parseGenres = (movie) => {
  if (!movie?.Genre || typeof movie.Genre !== 'string') {
    return [];
  }

  return movie.Genre.split(',').map((genre) => genre.trim()).filter(Boolean);
};

const dedupeMovies = (movies) => {
  const unique = [];
  const seen = new Set();

  for (const movie of movies) {
    const key = toMovieKey(movie);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(movie);
  }

  return unique;
};

const sameOrder = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (toMovieKey(a[i]) !== toMovieKey(b[i])) {
      return false;
    }
  }

  return true;
};

const loadPersistedState = () => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const buildTasteProfile = (watchedEntries, feedbackByMovie, movieCatalog) => {
  const profile = {};

  const bump = (genre, field, amount) => {
    if (!genre) {
      return;
    }

    if (!profile[genre]) {
      profile[genre] = { watched: 0, liked: 0, skipped: 0 };
    }

    profile[genre][field] += amount;
  };

  watchedEntries.forEach((entry) => {
    const movie = movieCatalog[entry.key];
    if (!movie) {
      return;
    }

    parseGenres(movie).forEach((genre) => bump(genre, 'watched', Math.max(1, entry.count || 1)));
  });

  Object.entries(feedbackByMovie).forEach(([key, reaction]) => {
    const movie = movieCatalog[key];
    if (!movie || !reaction) {
      return;
    }

    const field = reaction === 'like' ? 'liked' : 'skipped';
    parseGenres(movie).forEach((genre) => bump(genre, field, 1));
  });

  return profile;
};

const rankMoviesByProfile = (movies, watchedKeys, feedbackByMovie, tasteProfile, hideWatched) => {
  const deduped = dedupeMovies(movies);

  const filtered = hideWatched
    ? deduped.filter((movie) => !watchedKeys.has(toMovieKey(movie)))
    : deduped;

  return filtered.sort((left, right) => {
    const score = (movie) => {
      const key = toMovieKey(movie);
      const genres = parseGenres(movie);

      const imdb = parseNumber(movie.imdb_rating);
      const userScore = toTenPointUserScore(movie);
      const tmdb = parseNumber(movie.tmdb_vote_average);

      const providerScore =
        imdb > 0
          ? imdb * 0.74 + (userScore > 0 ? userScore : tmdb) * 0.26
          : (userScore > 0 ? userScore : tmdb);

      const genreScore = genres.reduce((total, genre) => {
        const stats = tasteProfile[genre];
        if (!stats) {
          return total;
        }

        return total + stats.liked * 0.35 - stats.skipped * 0.45 + stats.watched * 0.04;
      }, 0);

      const seenAdjust = watchedKeys.has(key) ? -1.1 : 0.6;
      const feedbackAdjust =
        feedbackByMovie[key] === 'like' ? 0.9 : feedbackByMovie[key] === 'skip' ? -0.9 : 0;

      return providerScore + genreScore + seenAdjust + feedbackAdjust;
    };

    return score(right) - score(left);
  });
};

function App() {
  const persisted = useMemo(() => loadPersistedState(), []);

  const [genreId, setGenreId] = useState(() => persisted.genreId || '');
  const [topMovies, setTopMovies] = useState(() => (Array.isArray(persisted.topMovies) ? persisted.topMovies : []));
  const [remainingMovies, setRemainingMovies] = useState(() =>
    Array.isArray(persisted.remainingMovies) ? persisted.remainingMovies : [],
  );
  const [movieCatalog, setMovieCatalog] = useState(() =>
    persisted.movieCatalog && typeof persisted.movieCatalog === 'object' ? persisted.movieCatalog : {},
  );
  const [watchedEntries, setWatchedEntries] = useState(() =>
    Array.isArray(persisted.watchedEntries) ? persisted.watchedEntries : [],
  );
  const [watchLaterKeys, setWatchLaterKeys] = useState(() =>
    Array.isArray(persisted.watchLaterKeys) ? persisted.watchLaterKeys : [],
  );
  const [feedbackByMovie, setFeedbackByMovie] = useState(() =>
    persisted.feedbackByMovie && typeof persisted.feedbackByMovie === 'object' ? persisted.feedbackByMovie : {},
  );
  const [activityLog, setActivityLog] = useState(() =>
    Array.isArray(persisted.activityLog) ? persisted.activityLog : [],
  );
  const [lastSwap, setLastSwap] = useState(() => persisted.lastSwap || null);
  const [upNextPreview, setUpNextPreview] = useState(() =>
    Array.isArray(persisted.upNextPreview) ? persisted.upNextPreview : [],
  );
  const [view, setView] = useState(() => persisted.view || 'discover');
  const [hideWatched, setHideWatched] = useState(() => Boolean(persisted.hideWatched));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    () => persisted.statusMessage || 'Pick a genre to load the top-rated lineup.',
  );
  const [hasSearched, setHasSearched] = useState(() => Boolean(persisted.hasSearched));
  const [swapPulse, setSwapPulse] = useState(null);

  const swapTimerRef = useRef(null);

  const watchedKeys = useMemo(() => new Set(watchedEntries.map((entry) => entry.key)), [watchedEntries]);
  const watchLaterSet = useMemo(() => new Set(watchLaterKeys), [watchLaterKeys]);

  const tasteProfile = useMemo(
    () => buildTasteProfile(watchedEntries, feedbackByMovie, movieCatalog),
    [watchedEntries, feedbackByMovie, movieCatalog],
  );

  const selectedGenreName = useMemo(
    () => MOVIE_GENRES.find((genre) => String(genre.id) === genreId)?.name ?? 'No genre selected',
    [genreId],
  );

  const watchedList = useMemo(
    () =>
      watchedEntries
        .map((entry) => ({ ...entry, movie: movieCatalog[entry.key] }))
        .filter((entry) => entry.movie)
        .sort((a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()),
    [watchedEntries, movieCatalog],
  );

  const watchLaterList = useMemo(
    () =>
      watchLaterKeys
        .map((key) => ({ key, movie: movieCatalog[key] }))
        .filter((entry) => entry.movie),
    [watchLaterKeys, movieCatalog],
  );

  const dashboardStats = useMemo(() => {
    const totalWatched = watchedEntries.reduce((total, entry) => total + Math.max(1, entry.count || 1), 0);
    const rewatches = watchedEntries.reduce((total, entry) => total + Math.max(0, (entry.count || 1) - 1), 0);

    const imdbValues = watchedList
      .map((entry) => parseNumber(entry.movie.imdb_rating))
      .filter((value) => value > 0);

    const tmdbValues = watchedList
      .map((entry) => parseNumber(entry.movie.user_score))
      .filter((value) => value > 0);

    const average = (values) =>
      values.length > 0
        ? (values.reduce((total, value) => total + value, 0) / values.length).toFixed(1)
        : 'N/A';

    const genreCounts = {};
    watchedList.forEach((entry) => {
      parseGenres(entry.movie).forEach((genre) => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
    });

    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    const likedCount = Object.values(feedbackByMovie).filter((reaction) => reaction === 'like').length;
    const skippedCount = Object.values(feedbackByMovie).filter((reaction) => reaction === 'skip').length;

    return {
      totalWatched,
      rewatches,
      averageImdb: average(imdbValues),
      averageUserScore: average(tmdbValues),
      topGenres,
      likedCount,
      skippedCount,
      watchLaterCount: watchLaterKeys.length,
    };
  }, [watchedEntries, watchedList, feedbackByMovie, watchLaterKeys.length]);

  const addActivity = (type, movie, details) => {
    const now = new Date().toISOString();
    setActivityLog((previous) => [
      {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        title: movie?.title || details || 'Activity',
        details,
        at: now,
        key: movie ? toMovieKey(movie) : null,
      },
      ...previous,
    ].slice(0, MAX_ACTIVITY_LOG));
  };

  const registerMovies = (movies) => {
    setMovieCatalog((previous) => {
      const nextCatalog = { ...previous };
      movies.forEach((movie) => {
        nextCatalog[toMovieKey(movie)] = movie;
      });
      return nextCatalog;
    });
  };

  const applyRankingToQueue = () => {
    const currentQueue = dedupeMovies([...topMovies, ...remainingMovies]);
    if (currentQueue.length === 0) {
      return;
    }

    const ranked = rankMoviesByProfile(currentQueue, watchedKeys, feedbackByMovie, tasteProfile, hideWatched);
    const nextTop = ranked.slice(0, 3);
    const nextRemaining = ranked.slice(3);

    if (sameOrder(topMovies, nextTop) && sameOrder(remainingMovies, nextRemaining)) {
      return;
    }

    setTopMovies(nextTop);
    setRemainingMovies(nextRemaining);
  };

  const handleSearch = async () => {
    if (!genreId) {
      setError('Select a genre before searching.');
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/movies/genre/${genreId}`);

      if (!response.ok) {
        let detail = 'The movie service is unavailable right now.';

        try {
          const payload = await response.json();
          if (payload?.error) {
            detail = payload.error;
          }
        } catch {
          // ignore parsing errors and keep fallback detail
        }

        throw new Error(detail);
      }

      const movies = dedupeMovies(await response.json());
      registerMovies(movies);

      const ranked = rankMoviesByProfile(movies, watchedKeys, feedbackByMovie, tasteProfile, hideWatched);

      if (ranked.length === 0) {
        setTopMovies([]);
        setRemainingMovies([]);
        setStatusMessage(
          hideWatched
            ? 'No unseen movies left for this genre. Turn off "Hide watched" or try another genre.'
            : 'No movies were returned for this genre.',
        );
        setHasSearched(true);
        addActivity('search-empty', null, `No results for ${selectedGenreName}`);
        return;
      }

      setTopMovies(ranked.slice(0, 3));
      setRemainingMovies(ranked.slice(3));
      setUpNextPreview([]);
      setLastSwap(null);
      setStatusMessage('Top picks are live. Use swap to rotate alternatives.');
      setHasSearched(true);
      addActivity('search', null, `Loaded ${ranked.length} results for ${selectedGenreName}`);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load movies. Confirm backend and API keys are set.';

      setTopMovies([]);
      setRemainingMovies([]);
      setError(message);
      setStatusMessage('Search failed. Check backend/API keys, then try again.');
      setHasSearched(true);
      addActivity('error', null, message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwapMovie = (index) => {
    if (remainingMovies.length === 0) {
      setStatusMessage('No backup movies left in this batch.');
      return;
    }

    const [nextMovie, ...rest] = remainingMovies;
    const outgoingMovie = topMovies[index];

    const nextTop = topMovies.map((movie, movieIndex) => (movieIndex === index ? nextMovie : movie));

    setTopMovies(nextTop);
    setRemainingMovies(rest);
    setLastSwap({ index, outgoingMovie, incomingMovie: nextMovie, at: Date.now() });

    setSwapPulse({ index, tick: Date.now() });
    if (swapTimerRef.current) {
      clearTimeout(swapTimerRef.current);
    }

    swapTimerRef.current = setTimeout(() => {
      setSwapPulse(null);
      swapTimerRef.current = null;
    }, 520);

    setStatusMessage(
      rest.length > 0
        ? `${rest.length} backup picks left. Swap another title if needed.`
        : 'No backup movies left in this batch.',
    );

    addActivity('swap', nextMovie, `Swapped into slot ${index + 1}`);
  };

  const handleUndoSwap = () => {
    if (!lastSwap) {
      return;
    }

    const { index, outgoingMovie, incomingMovie } = lastSwap;
    const incomingKey = toMovieKey(incomingMovie);

    setTopMovies((previous) =>
      previous.map((movie, movieIndex) => (movieIndex === index ? outgoingMovie : movie)),
    );

    setRemainingMovies((previous) => [incomingMovie, ...previous.filter((movie) => toMovieKey(movie) !== incomingKey)]);
    setLastSwap(null);
    setStatusMessage('Last swap undone.');
    addActivity('undo-swap', outgoingMovie, 'Reverted last swap');
  };

  const markWatched = (movie) => {
    const key = toMovieKey(movie);

    setWatchedEntries((previous) => {
      const index = previous.findIndex((entry) => entry.key === key);
      if (index === -1) {
        return [{ key, watchedAt: new Date().toISOString(), count: 1 }, ...previous];
      }

      const next = [...previous];
      next[index] = {
        ...next[index],
        watchedAt: new Date().toISOString(),
        count: (next[index].count || 1) + 1,
      };
      return next;
    });

    setStatusMessage(`Marked "${movie.title}" as watched.`);
    addActivity('watched', movie, 'Marked as watched');
  };

  const unmarkWatched = (key) => {
    setWatchedEntries((previous) => previous.filter((entry) => entry.key !== key));
    setStatusMessage('Removed title from watched history.');
  };

  const toggleWatchLater = (movie) => {
    const key = toMovieKey(movie);

    setWatchLaterKeys((previous) =>
      previous.includes(key) ? previous.filter((movieKey) => movieKey !== key) : [key, ...previous],
    );

    const nowWatchLater = !watchLaterSet.has(key);
    setStatusMessage(
      nowWatchLater ? `Saved "${movie.title}" for later.` : `Removed "${movie.title}" from watch later.`,
    );
    addActivity(nowWatchLater ? 'watch-later-add' : 'watch-later-remove', movie, 'Updated watch later list');
  };

  const setReaction = (movie, reaction) => {
    const key = toMovieKey(movie);
    const currentReaction = feedbackByMovie[key];

    setFeedbackByMovie((previous) => {
      const current = previous[key];
      const next = { ...previous };

      if (current === reaction) {
        delete next[key];
      } else {
        next[key] = reaction;
      }

      return next;
    });

    if (currentReaction === reaction) {
      setStatusMessage(`Cleared feedback for "${movie.title}".`);
      addActivity('feedback-clear', movie, 'Cleared feedback');
    } else {
      setStatusMessage(`${reaction === 'like' ? 'Liked' : 'Skipped'} "${movie.title}".`);
      addActivity(reaction === 'like' ? 'like' : 'skip', movie, 'Updated taste profile feedback');
    }
  };

  const handleTenMore = () => {
    if (remainingMovies.length === 0) {
      setStatusMessage('No extra titles left in queue. Run another search for more.');
      return;
    }

    const ten = remainingMovies.slice(0, 10);
    setUpNextPreview(ten);
    setStatusMessage(`Prepared ${ten.length} more titles from this genre.`);
    addActivity('queue-more', null, `Prepared ${ten.length} more titles`);
  };

  useEffect(() => {
    return () => {
      if (swapTimerRef.current) {
        clearTimeout(swapTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    applyRankingToQueue();
    // Re-rank queue when preference signals change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackByMovie, watchedEntries, hideWatched]);

  useEffect(() => {
    const payload = {
      genreId,
      topMovies,
      remainingMovies,
      movieCatalog,
      watchedEntries,
      watchLaterKeys,
      feedbackByMovie,
      activityLog,
      lastSwap,
      upNextPreview,
      view,
      hideWatched,
      statusMessage,
      hasSearched,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [
    genreId,
    topMovies,
    remainingMovies,
    movieCatalog,
    watchedEntries,
    watchLaterKeys,
    feedbackByMovie,
    activityLog,
    lastSwap,
    upNextPreview,
    view,
    hideWatched,
    statusMessage,
    hasSearched,
  ]);

  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(85%_50%_at_52%_-4%,rgba(178,206,225,0.82),rgba(243,236,224,0.36)_48%,transparent_76%),radial-gradient(36%_30%_at_10%_86%,rgba(188,212,202,0.3),transparent_76%),linear-gradient(130deg,#eee1cf_0%,#f7f0e5_56%,#e8dccd_100%)]" />

      <div className="mx-auto max-w-[1280px] px-4 py-6 md:py-8">
        <header className="grid gap-5 border-b border-border/80 pb-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold tracking-tight">Tonight&apos;s Movie Picks</p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Movie Recommender</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid content-start gap-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Movie Discovery
              </p>
              <h1 className="max-w-[13ch] text-4xl leading-none tracking-tight text-foreground md:text-6xl">
                Find your next movie in one search.
              </h1>
              <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground md:text-base">
                Select a genre and get the highest-rated titles first. Every result includes TMDB user
                score, IMDb rating, year, and synopsis.
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <p>Genre: {selectedGenreName}</p>
                <p>{topMovies.length > 0 ? `${topMovies.length} active rows` : 'Awaiting search'}</p>
                <p>{remainingMovies.length} reserve titles</p>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 lg:justify-end">
              <div className="grid gap-1">
                <label htmlFor="genre-select" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Genre
                </label>
                <Select value={genreId} onValueChange={setGenreId} disabled={isLoading}>
                  <SelectTrigger id="genre-select" className="w-[220px] justify-between bg-background/95">
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {MOVIE_GENRES.map((genre) => (
                        <SelectItem key={genre.id} value={String(genre.id)}>
                          {genre.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSearch} disabled={isLoading} className="rounded-full px-5 data-[size=default]:h-9">
                {isLoading ? 'Loading Top Picks...' : 'Get Highest Rated'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <p>Results start with highest IMDb + user score, then adapt to your likes, skips, and watch history.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs" variant={view === 'discover' ? 'default' : 'outline'} onClick={() => setView('discover')}>
                Discover
              </Button>
              <Button size="xs" variant={view === 'watched' ? 'default' : 'outline'} onClick={() => setView('watched')}>
                Watched ({watchedEntries.length})
              </Button>
              <Button size="xs" variant={view === 'watch-later' ? 'default' : 'outline'} onClick={() => setView('watch-later')}>
                Watch Later ({watchLaterKeys.length})
              </Button>
              <Button size="xs" variant={view === 'dashboard' ? 'default' : 'outline'} onClick={() => setView('dashboard')}>
                Dashboard
              </Button>
            </div>
          </div>
        </header>

        <main className="mt-5 grid min-h-[58dvh] grid-rows-[auto_auto_minmax(0,1fr)] border-t border-border/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 py-3">
            <p className="text-sm font-medium text-foreground">
              {view === 'discover' && 'Top Picks'}
              {view === 'watched' && 'Watched History'}
              {view === 'watch-later' && 'Watch Later'}
              {view === 'dashboard' && 'Personal Dashboard'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {view === 'discover' && (
                <>
                  <Button size="xs" variant="outline" onClick={() => setHideWatched((previous) => !previous)}>
                    {hideWatched ? 'Show Watched' : 'Hide Watched'}
                  </Button>
                  <Button size="xs" variant="outline" onClick={handleTenMore}>
                    Give Me 10 More
                  </Button>
                  {lastSwap && (
                    <Button size="xs" variant="outline" onClick={handleUndoSwap}>
                      Undo Swap
                    </Button>
                  )}
                </>
              )}
              <p className="font-mono text-xs text-muted-foreground">
                {view === 'discover' && (topMovies.length > 0 ? `${topMovies.length} rows live` : 'No rows live')}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-border/70 py-2.5">
            <p className="text-sm text-foreground">{statusMessage}</p>
          </div>

          {error && <p className="border-b border-border/70 py-2 text-sm font-medium text-destructive">{error}</p>}

          <section className="min-h-0">
            {view === 'discover' && (
              <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                {isLoading && (
                  <div className="grid h-full gap-0 divide-y divide-border/70">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="grid flex-1 grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-4 py-3">
                        <Skeleton className="h-[122px] w-[84px] rounded-lg" />
                        <div className="grid gap-2">
                          <Skeleton className="h-5 w-2/5" />
                          <Skeleton className="h-4 w-4/5" />
                          <Skeleton className="h-4 w-2/3" />
                        </div>
                        <Skeleton className="h-9 w-28 rounded-full" />
                      </div>
                    ))}
                  </div>
                )}

                {!isLoading && topMovies.length > 0 && (
                  <ol className="grid h-full divide-y divide-border/70">
                    {topMovies.map((movie, index) => {
                      const key = toMovieKey(movie);
                      const feedback = feedbackByMovie[key];
                      const isWatchLater = watchLaterSet.has(key);

                      return (
                        <li
                          key={`${key}-${index}`}
                          className={`grid flex-1 grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-4 py-3 transition-colors ${
                            swapPulse?.index === index ? 'animate-swap-pop bg-accent/30' : ''
                          }`}
                        >
                          <div className="h-[124px] w-[84px] overflow-hidden rounded-md border border-border/80 bg-muted/40">
                            {movie.Poster && movie.Poster !== 'N/A' ? (
                              <img src={movie.Poster} alt={`${movie.title} poster`} className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="grid h-full place-items-center px-2 text-center text-xs text-muted-foreground">Poster unavailable</div>
                            )}
                          </div>

                          <div className="grid min-w-0 gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-lg font-semibold tracking-tight">{movie.title}</p>
                              <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[0.68rem] text-muted-foreground">
                                #{index + 1}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">User {movie.user_score ?? 'N/A'}%</span>
                              <span className="font-mono">IMDb {movie.imdb_rating || 'N/A'}</span>
                              <span>{movie.release_year || 'Year unknown'}</span>
                              <span className="truncate">{movie.Genre || 'Genre unavailable'}</span>
                            </div>
                            <p className="line-clamp-2 max-w-[75ch] text-sm text-muted-foreground">
                              {movie.overview || 'No synopsis available.'}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1.5">
                            <Button size="xs" variant="outline" onClick={() => handleSwapMovie(index)}>
                              Swap In
                            </Button>
                            <Button size="xs" variant="outline" onClick={() => markWatched(movie)}>
                              Watched
                            </Button>
                            <Button size="xs" variant={isWatchLater ? 'secondary' : 'outline'} onClick={() => toggleWatchLater(movie)}>
                              {isWatchLater ? 'Saved' : 'Watch Later'}
                            </Button>
                            <div className="flex gap-1.5">
                              <Button size="xs" variant={feedback === 'like' ? 'default' : 'outline'} onClick={() => setReaction(movie, 'like')}>
                                Like
                              </Button>
                              <Button size="xs" variant={feedback === 'skip' ? 'destructive' : 'outline'} onClick={() => setReaction(movie, 'skip')}>
                                Skip
                              </Button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {!isLoading && topMovies.length === 0 && (
                  <div className="grid h-full place-items-center py-6">
                    <div className="grid max-w-[48ch] gap-2 text-center">
                      <p className="text-xl font-semibold tracking-tight">{hasSearched ? 'No recommendations yet' : 'Start with a genre'}</p>
                      <p className="text-sm text-muted-foreground">
                        {hasSearched
                          ? 'Try another genre. Some genres may have fewer titles with enough rating volume.'
                          : 'Pick a genre and load the highest-rated titles.'}
                      </p>
                    </div>
                  </div>
                )}

                {upNextPreview.length > 0 && (
                  <div className="border-t border-border/70 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Up Next (10 More Like This)
                    </p>
                    <ol className="grid gap-1 text-sm text-muted-foreground md:grid-cols-2">
                      {upNextPreview.map((movie) => (
                        <li key={`preview-${toMovieKey(movie)}`} className="truncate">
                          {movie.title} ({movie.release_year || 'n/a'})
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {view === 'watched' && (
              <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                {watchedList.length === 0 ? (
                  <div className="grid h-full place-items-center py-8 text-sm text-muted-foreground">
                    No watched history yet. Mark movies as watched from Discover.
                  </div>
                ) : (
                  <ol className="grid divide-y divide-border/70">
                    {watchedList.map((entry) => {
                      const movie = entry.movie;
                      const key = entry.key;
                      const feedback = feedbackByMovie[key];
                      const isWatchLater = watchLaterSet.has(key);

                      return (
                        <li key={`watched-${key}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
                          <div className="grid gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold tracking-tight">{movie.title}</p>
                              <span className="text-xs text-muted-foreground">Watched {entry.count || 1} time(s)</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              IMDb {movie.imdb_rating || 'N/A'} • User {movie.user_score ?? 'N/A'}% • {movie.release_year || 'Year unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Last watched {new Date(entry.watchedAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <Button size="xs" variant={isWatchLater ? 'secondary' : 'outline'} onClick={() => toggleWatchLater(movie)}>
                              {isWatchLater ? 'Saved' : 'Watch Later'}
                            </Button>
                            <Button size="xs" variant={feedback === 'like' ? 'default' : 'outline'} onClick={() => setReaction(movie, 'like')}>
                              Like
                            </Button>
                            <Button size="xs" variant={feedback === 'skip' ? 'destructive' : 'outline'} onClick={() => setReaction(movie, 'skip')}>
                              Skip
                            </Button>
                            <Button size="xs" variant="outline" onClick={() => unmarkWatched(key)}>
                              Remove
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}

            {view === 'watch-later' && (
              <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                {watchLaterList.length === 0 ? (
                  <div className="grid h-full place-items-center py-8 text-sm text-muted-foreground">
                    No watch-later titles yet. Save titles from Discover or Watched.
                  </div>
                ) : (
                  <ol className="grid divide-y divide-border/70">
                    {watchLaterList.map((entry) => {
                      const movie = entry.movie;
                      return (
                        <li key={`later-${entry.key}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
                          <div className="grid gap-1">
                            <p className="text-base font-semibold tracking-tight">{movie.title}</p>
                            <p className="text-xs text-muted-foreground">
                              IMDb {movie.imdb_rating || 'N/A'} • User {movie.user_score ?? 'N/A'}% • {movie.release_year || 'Year unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground">{movie.Genre || 'Genre unavailable'}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <Button size="xs" variant="outline" onClick={() => markWatched(movie)}>
                              Mark Watched
                            </Button>
                            <Button size="xs" variant="outline" onClick={() => toggleWatchLater(movie)}>
                              Remove
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}

            {view === 'dashboard' && (
              <div className="grid animate-in fade-in-0 slide-in-from-bottom-1 gap-4 py-4 text-sm duration-300">
                <div className="grid gap-1 border-b border-border/70 pb-3">
                  <p>Total watched actions: {dashboardStats.totalWatched}</p>
                  <p>Rewatches: {dashboardStats.rewatches}</p>
                  <p>Watch later list: {dashboardStats.watchLaterCount}</p>
                  <p>Liked titles: {dashboardStats.likedCount}</p>
                  <p>Skipped titles: {dashboardStats.skippedCount}</p>
                </div>

                <div className="grid gap-1 border-b border-border/70 pb-3">
                  <p>Average IMDb of watched: {dashboardStats.averageImdb}</p>
                  <p>Average User Score of watched: {dashboardStats.averageUserScore}</p>
                  <p>
                    Top genres watched:{' '}
                    {dashboardStats.topGenres.length > 0
                      ? dashboardStats.topGenres.map(([genre, count]) => `${genre} (${count})`).join(', ')
                      : 'No data yet'}
                  </p>
                </div>

                <div className="grid gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Recent Activity
                  </p>
                  <ol className="grid gap-1">
                    {activityLog.slice(0, 10).map((entry) => (
                      <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-1.5">
                        <span className="text-sm">
                          {entry.type.replaceAll('-', ' ')}: {entry.title}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {new Date(entry.at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                    {activityLog.length === 0 && <li className="text-muted-foreground">No activity yet.</li>}
                  </ol>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
