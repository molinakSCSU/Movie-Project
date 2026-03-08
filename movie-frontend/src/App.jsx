import { useEffect, useMemo, useRef, useState } from 'react';
import { SignInButton, UserButton, useAuth } from '@clerk/react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';

const STORAGE_KEY = 'movie_recommender_state_v4';
const MAX_ACTIVITY_LOG = 220;
const PROFILE_SYNC_DEBOUNCE_MS = 820;
const DEFAULT_STATUS_MESSAGE = 'Pick a genre to load the top-rated lineup.';
const VALID_VIEWS = new Set(['discover', 'watched', 'watch-later', 'dashboard']);

const viewTransition = {
  initial: { opacity: 0, y: 18, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -14, filter: 'blur(3px)' },
};

const rowTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

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

const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const normalizeApiBase = (value) => {
  const trimmed = String(value || '').trim();
  const unquoted = trimmed.replace(/^['"]+|['"]+$/g, '');
  if (!unquoted) {
    return '/api';
  }

  if (unquoted.startsWith('/')) {
    return unquoted;
  }

  // Convenience for local env values like "127.0.0.1:5050" or "localhost:5050".
  if (/^[a-z0-9.-]+:\d+(?:\/.*)?$/i.test(unquoted)) {
    return `http://${unquoted}`;
  }

  if (/^https?:\/\//i.test(unquoted)) {
    try {
      const parsed = new URL(unquoted);
      const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
      return `${parsed.origin}${path}`;
    } catch {
      return '/api';
    }
  }

  return '/api';
};

const API_BASE_URL = normalizeApiBase(RAW_API_BASE_URL);

const resolveGenreEndpoint = (genreId) => {
  const encodedGenre = encodeURIComponent(genreId);
  const base = API_BASE_URL.replace(/\/$/, '');

  if (base.startsWith('/')) {
    if (base === '/api' || base.endsWith('/api')) {
      return `${base}/movies/genre?genreId=${encodedGenre}`;
    }
    return `${base}/movies/genre/${encodedGenre}`;
  }

  if (base.endsWith('/api')) {
    return `${base}/movies/genre?genreId=${encodedGenre}`;
  }

  return `${base}/movies/genre/${encodedGenre}`;
};

const resolveProfileEndpoint = () => {
  const base = API_BASE_URL.replace(/\/$/, '');

  if (base.startsWith('/')) {
    return `${base}/profile`;
  }

  return `${base}/profile`;
};

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

const normalizePersistedState = (input) => {
  const source = input && typeof input === 'object' ? input : {};

  return {
    genreId: typeof source.genreId === 'string' ? source.genreId : '',
    topMovies: Array.isArray(source.topMovies) ? source.topMovies : [],
    remainingMovies: Array.isArray(source.remainingMovies) ? source.remainingMovies : [],
    movieCatalog: source.movieCatalog && typeof source.movieCatalog === 'object' ? source.movieCatalog : {},
    watchedEntries: Array.isArray(source.watchedEntries) ? source.watchedEntries : [],
    watchLaterKeys: Array.isArray(source.watchLaterKeys) ? source.watchLaterKeys : [],
    feedbackByMovie: source.feedbackByMovie && typeof source.feedbackByMovie === 'object' ? source.feedbackByMovie : {},
    activityLog: Array.isArray(source.activityLog) ? source.activityLog : [],
    lastSwap: source.lastSwap || null,
    upNextPreview: Array.isArray(source.upNextPreview) ? source.upNextPreview : [],
    view: VALID_VIEWS.has(source.view) ? source.view : 'discover',
    hideWatched: Boolean(source.hideWatched),
    statusMessage:
      typeof source.statusMessage === 'string' && source.statusMessage.trim()
        ? source.statusMessage
        : DEFAULT_STATUS_MESSAGE,
    hasSearched: Boolean(source.hasSearched),
  };
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

function AppContent({ auth, clerkEnabled }) {
  const { isLoaded: isAuthLoaded, isSignedIn, userId, getToken } = auth;
  const persisted = useMemo(() => normalizePersistedState(loadPersistedState()), []);

  const [genreId, setGenreId] = useState(() => persisted.genreId);
  const [topMovies, setTopMovies] = useState(() => persisted.topMovies);
  const [remainingMovies, setRemainingMovies] = useState(() => persisted.remainingMovies);
  const [movieCatalog, setMovieCatalog] = useState(() => persisted.movieCatalog);
  const [watchedEntries, setWatchedEntries] = useState(() => persisted.watchedEntries);
  const [watchLaterKeys, setWatchLaterKeys] = useState(() => persisted.watchLaterKeys);
  const [feedbackByMovie, setFeedbackByMovie] = useState(() => persisted.feedbackByMovie);
  const [activityLog, setActivityLog] = useState(() => persisted.activityLog);
  const [lastSwap, setLastSwap] = useState(() => persisted.lastSwap);
  const [upNextPreview, setUpNextPreview] = useState(() => persisted.upNextPreview);
  const [view, setView] = useState(() => persisted.view);
  const [hideWatched, setHideWatched] = useState(() => persisted.hideWatched);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState(() => persisted.statusMessage);
  const [hasSearched, setHasSearched] = useState(() => persisted.hasSearched);
  const [swapPulse, setSwapPulse] = useState(null);
  const [profileSyncStatus, setProfileSyncStatus] = useState('local-only');
  const [profileSyncError, setProfileSyncError] = useState('');
  const [isProfileHydrating, setIsProfileHydrating] = useState(false);

  const swapTimerRef = useRef(null);
  const profileSaveTimerRef = useRef(null);
  const hasHydratedProfileRef = useRef(false);
  const lastSyncedPayloadRef = useRef('');

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

  const persistableState = useMemo(
    () => ({
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
    }),
    [
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
    ],
  );

  const syncLabel = useMemo(() => {
    if (!clerkEnabled) {
      return 'Guest Mode';
    }

    if (!isAuthLoaded) {
      return 'Auth Loading';
    }

    if (!isSignedIn) {
      return 'Sign In To Sync';
    }

    if (isProfileHydrating || profileSyncStatus === 'syncing') {
      return 'Syncing Profile';
    }

    if (profileSyncStatus === 'cloud') {
      return 'Cloud Synced';
    }

    if (profileSyncStatus === 'degraded') {
      return 'Sync Issue';
    }

    return 'Local Only';
  }, [clerkEnabled, isAuthLoaded, isSignedIn, isProfileHydrating, profileSyncStatus]);
  const isGuestMode = !clerkEnabled || !isSignedIn;
  const rankingWatchedKeys = useMemo(() => (isGuestMode ? new Set() : watchedKeys), [isGuestMode, watchedKeys]);
  const rankingFeedbackByMovie = useMemo(() => (isGuestMode ? {} : feedbackByMovie), [isGuestMode, feedbackByMovie]);
  const rankingTasteProfile = useMemo(() => (isGuestMode ? {} : tasteProfile), [isGuestMode, tasteProfile]);
  const rankingHideWatched = isGuestMode ? false : hideWatched;

  const applyPersistedSnapshot = (snapshot) => {
    const normalized = normalizePersistedState(snapshot);
    setGenreId(normalized.genreId);
    setTopMovies(normalized.topMovies);
    setRemainingMovies(normalized.remainingMovies);
    setMovieCatalog(normalized.movieCatalog);
    setWatchedEntries(normalized.watchedEntries);
    setWatchLaterKeys(normalized.watchLaterKeys);
    setFeedbackByMovie(normalized.feedbackByMovie);
    setActivityLog(normalized.activityLog);
    setLastSwap(normalized.lastSwap);
    setUpNextPreview(normalized.upNextPreview);
    setView(normalized.view);
    setHideWatched(normalized.hideWatched);
    setStatusMessage(normalized.statusMessage);
    setHasSearched(normalized.hasSearched);
  };

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

    const ranked = rankMoviesByProfile(
      currentQueue,
      rankingWatchedKeys,
      rankingFeedbackByMovie,
      rankingTasteProfile,
      rankingHideWatched,
    );
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
      const response = await fetch(resolveGenreEndpoint(genreId));

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

      const ranked = rankMoviesByProfile(
        movies,
        rankingWatchedKeys,
        rankingFeedbackByMovie,
        rankingTasteProfile,
        rankingHideWatched,
      );

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
      const rawMessage =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load movies. Confirm backend and API keys are set.';
      const message = /did not match the expected pattern/i.test(rawMessage)
        ? 'Invalid API URL configuration. Set VITE_API_BASE_URL to /api or http://127.0.0.1:5050.'
        : rawMessage;

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
      if (profileSaveTimerRef.current) {
        clearTimeout(profileSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!clerkEnabled) {
      if (profileSaveTimerRef.current) {
        clearTimeout(profileSaveTimerRef.current);
        profileSaveTimerRef.current = null;
      }
      hasHydratedProfileRef.current = false;
      lastSyncedPayloadRef.current = '';
      setProfileSyncStatus('local-only');
      setProfileSyncError('');
      setIsProfileHydrating(false);
      return;
    }

    if (!isAuthLoaded) {
      return;
    }

    if (!isSignedIn || !userId) {
      if (profileSaveTimerRef.current) {
        clearTimeout(profileSaveTimerRef.current);
        profileSaveTimerRef.current = null;
      }
      hasHydratedProfileRef.current = false;
      lastSyncedPayloadRef.current = '';
      setProfileSyncStatus('local-only');
      setProfileSyncError('');
      setIsProfileHydrating(false);
      return;
    }

    let isCancelled = false;
    hasHydratedProfileRef.current = false;
    setProfileSyncStatus('syncing');
    setProfileSyncError('');
    setIsProfileHydrating(true);

    const loadProfile = async () => {
      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Missing auth token for profile load.');
        }

        const response = await fetch(resolveProfileEndpoint(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          let detail = 'Failed to load profile from cloud.';
          try {
            const payload = await response.json();
            if (payload?.error) {
              detail = payload.error;
            }
          } catch {
            // Keep fallback detail.
          }
          throw new Error(detail);
        }

        const payload = await response.json();
        const remoteState =
          payload?.profileState && typeof payload.profileState === 'object' && !Array.isArray(payload.profileState)
            ? payload.profileState
            : null;

        if (isCancelled) {
          return;
        }

        if (remoteState) {
          const normalized = normalizePersistedState(remoteState);
          applyPersistedSnapshot(normalized);
          lastSyncedPayloadRef.current = JSON.stringify(normalized);
        } else {
          lastSyncedPayloadRef.current = '';
        }

        hasHydratedProfileRef.current = true;
        setProfileSyncStatus('cloud');
      } catch (loadError) {
        if (isCancelled) {
          return;
        }
        const message = loadError instanceof Error ? loadError.message : 'Failed to load profile.';
        setProfileSyncStatus('degraded');
        setProfileSyncError(message);
      } finally {
        if (!isCancelled) {
          setIsProfileHydrating(false);
        }
      }
    };

    loadProfile();

    return () => {
      isCancelled = true;
    };
  }, [clerkEnabled, isAuthLoaded, isSignedIn, userId, getToken]);

  useEffect(() => {
    applyRankingToQueue();
    // Re-rank queue when preference signals change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackByMovie, watchedEntries, hideWatched, isGuestMode]);

  useEffect(() => {
    if (isGuestMode && view !== 'discover') {
      setView('discover');
    }
  }, [isGuestMode, view]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
  }, [persistableState]);

  useEffect(() => {
    if (!clerkEnabled || !isAuthLoaded || !isSignedIn || !userId) {
      return;
    }

    if (!hasHydratedProfileRef.current || isProfileHydrating) {
      return;
    }

    const serialized = JSON.stringify(persistableState);
    if (serialized === lastSyncedPayloadRef.current) {
      return;
    }

    if (profileSaveTimerRef.current) {
      clearTimeout(profileSaveTimerRef.current);
      profileSaveTimerRef.current = null;
    }

    setProfileSyncStatus('syncing');

    profileSaveTimerRef.current = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Missing auth token for profile sync.');
        }

        const response = await fetch(resolveProfileEndpoint(), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ profileState: persistableState }),
        });

        if (!response.ok) {
          let detail = 'Cloud profile sync failed.';
          try {
            const payload = await response.json();
            if (payload?.error) {
              detail = payload.error;
            }
          } catch {
            // Keep fallback detail.
          }
          throw new Error(detail);
        }

        lastSyncedPayloadRef.current = serialized;
        setProfileSyncStatus('cloud');
        setProfileSyncError('');
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : 'Cloud profile sync failed.';
        setProfileSyncStatus('degraded');
        setProfileSyncError(message);
      } finally {
        profileSaveTimerRef.current = null;
      }
    }, PROFILE_SYNC_DEBOUNCE_MS);

    return () => {
      if (profileSaveTimerRef.current) {
        clearTimeout(profileSaveTimerRef.current);
        profileSaveTimerRef.current = null;
      }
    };
  }, [clerkEnabled, isAuthLoaded, isSignedIn, userId, isProfileHydrating, persistableState, getToken]);

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(78%_46%_at_50%_-8%,rgba(225,177,92,0.36),rgba(12,10,12,0.05)_56%,transparent_78%),radial-gradient(42%_34%_at_12%_88%,rgba(152,34,56,0.3),transparent_74%),linear-gradient(145deg,#08090b_0%,#111014_44%,#1a1013_100%)]" />
      <div className="cinema-spotlight pointer-events-none fixed inset-0 -z-10" />
      <div className="cinema-grain pointer-events-none fixed inset-0 -z-10" />
      <div className="cinema-vignette pointer-events-none fixed inset-0 -z-10" />

      <div className="mx-auto max-w-[1280px] px-4 py-6 md:py-8">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          className="grid gap-5 border-b border-border/80 pb-6"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold tracking-tight">Tonight&apos;s Movie Picks</p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-[0.14em] ${
                  profileSyncStatus === 'degraded'
                    ? 'border-destructive/60 text-destructive'
                    : 'border-border/70 text-muted-foreground'
                }`}
              >
                {syncLabel}
              </span>
              {clerkEnabled && isAuthLoaded && !isSignedIn && (
                <SignInButton mode="modal">
                  <Button size="xs" variant="outline">
                    Sign In
                  </Button>
                </SignInButton>
              )}
              {clerkEnabled && isSignedIn && <UserButton />}
            </div>
          </div>

          {!isGuestMode && profileSyncError && <p className="text-xs text-destructive">{profileSyncError}</p>}

          <div className="grid gap-7 justify-items-center py-2 text-center">
            <div className="grid max-w-[900px] justify-items-center gap-4">
              <h1 className="max-w-[14ch] text-5xl leading-[0.94] tracking-tight text-foreground md:text-7xl lg:text-8xl">
                Find your next movie in one search.
              </h1>
              <p className="max-w-[66ch] text-sm leading-relaxed text-muted-foreground md:text-base">
                Select a genre and get the highest-rated titles first. Every result includes TMDB user
                score, IMDb rating, year, and synopsis.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <p>Genre: {selectedGenreName}</p>
                <p>{topMovies.length > 0 ? `${topMovies.length} active rows` : 'Awaiting search'}</p>
                <p>{remainingMovies.length} reserve titles</p>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-center gap-3">
              <div className="grid gap-1 text-left">
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
            <p>
              {isGuestMode
                ? 'Demo mode: search and swap only. Sign in to unlock watched, watch later, and your dashboard.'
                : 'Results start with highest IMDb + user score, then adapt to your likes, skips, and watch history.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {!isGuestMode && (
                <>
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
                </>
              )}
            </div>
          </div>
        </motion.header>

        <main className="mt-5 grid min-h-[58dvh] grid-rows-[auto_auto_minmax(0,1fr)] border-t border-border/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 py-3">
            <p className="text-sm font-medium text-foreground">
              {isGuestMode && 'Top Picks'}
              {!isGuestMode && view === 'discover' && 'Top Picks'}
              {!isGuestMode && view === 'watched' && 'Watched History'}
              {!isGuestMode && view === 'watch-later' && 'Watch Later'}
              {!isGuestMode && view === 'dashboard' && 'Personal Dashboard'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {!isGuestMode && view === 'discover' && (
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

          <section className="min-h-0 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {view === 'discover' && (
                <motion.div
                  key="discover-view"
                  variants={viewTransition}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
                >
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
                    <LayoutGroup>
                      <motion.ol layout className="grid h-full divide-y divide-border/70">
                        {topMovies.map((movie, index) => {
                      const key = toMovieKey(movie);
                      const feedback = feedbackByMovie[key];
                      const isWatchLater = watchLaterSet.has(key);

                        return (
                          <motion.li
                            layout
                            variants={rowTransition}
                            initial="initial"
                            animate="animate"
                            transition={{ duration: 0.46, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
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
                            {!isGuestMode && (
                              <>
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
                              </>
                            )}
                          </div>
                          </motion.li>
                        );
                      })}
                      </motion.ol>
                    </LayoutGroup>
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

                {!isGuestMode && upNextPreview.length > 0 && (
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
                </motion.div>
              )}

              {view === 'watched' && (
                <motion.div
                  key="watched-view"
                  variants={viewTransition}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
                >
                {watchedList.length === 0 ? (
                  <div className="grid h-full place-items-center py-8 text-sm text-muted-foreground">
                    No watched history yet. Mark movies as watched from Discover.
                  </div>
                ) : (
                  <motion.ol layout className="grid divide-y divide-border/70">
                    {watchedList.map((entry) => {
                      const movie = entry.movie;
                      const key = entry.key;
                      const feedback = feedbackByMovie[key];
                      const isWatchLater = watchLaterSet.has(key);

                      return (
                        <motion.li
                          layout
                          variants={rowTransition}
                          initial="initial"
                          animate="animate"
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          key={`watched-${key}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3"
                        >
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
                        </motion.li>
                      );
                    })}
                  </motion.ol>
                )}
                </motion.div>
              )}

              {view === 'watch-later' && (
                <motion.div
                  key="watch-later-view"
                  variants={viewTransition}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
                >
                {watchLaterList.length === 0 ? (
                  <div className="grid h-full place-items-center py-8 text-sm text-muted-foreground">
                    No watch-later titles yet. Save titles from Discover or Watched.
                  </div>
                ) : (
                  <motion.ol layout className="grid divide-y divide-border/70">
                    {watchLaterList.map((entry) => {
                      const movie = entry.movie;
                      return (
                        <motion.li
                          layout
                          variants={rowTransition}
                          initial="initial"
                          animate="animate"
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                          key={`later-${entry.key}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3"
                        >
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
                        </motion.li>
                      );
                    })}
                  </motion.ol>
                )}
                </motion.div>
              )}

              {view === 'dashboard' && (
                <motion.div
                  key="dashboard-view"
                  variants={viewTransition}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
                  className="grid gap-4 py-4 text-sm"
                >
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
                  <motion.ol layout className="grid gap-1">
                    {activityLog.slice(0, 10).map((entry) => (
                      <motion.li
                        layout
                        variants={rowTransition}
                        initial="initial"
                        animate="animate"
                        transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                        key={entry.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-1.5"
                      >
                        <span className="text-sm">
                          {entry.type.replaceAll('-', ' ')}: {entry.title}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {new Date(entry.at).toLocaleString()}
                        </span>
                      </motion.li>
                    ))}
                    {activityLog.length === 0 && <li className="text-muted-foreground">No activity yet.</li>}
                  </motion.ol>
                </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </main>
      </div>
    </div>
  );
}

function AuthenticatedApp({ clerkEnabled }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();

  return (
    <AppContent
      clerkEnabled={clerkEnabled}
      auth={{ isLoaded, isSignedIn: Boolean(isSignedIn), userId: userId ?? null, getToken }}
    />
  );
}

function App({ clerkEnabled = false }) {
  if (!clerkEnabled) {
    return (
      <AppContent
        clerkEnabled={false}
        auth={{
          isLoaded: true,
          isSignedIn: false,
          userId: null,
          getToken: async () => null,
        }}
      />
    );
  }

  return <AuthenticatedApp clerkEnabled={clerkEnabled} />;
}

export default App;
