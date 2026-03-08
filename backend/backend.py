from flask import Flask, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
import requests

load_dotenv()

app = Flask(__name__)
CORS(app)

OMDB_API_KEY = os.getenv('OMDB_API_KEY')
TMDB_API_KEY = os.getenv('TMDB_API_KEY')

TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500'


def _discover_movies_by_genre(genre_id, min_vote_average=0.0):
    """Fetch highest-rated TMDB movies for a genre and enrich with OMDB metadata."""
    collected_movies = []
    seen_titles = set()

    for page in range(1, 4):
        tmdb_response = requests.get(
            'https://api.themoviedb.org/3/discover/movie',
            params={
                'api_key': TMDB_API_KEY,
                'with_genres': genre_id,
                'vote_average.gte': min_vote_average,
                'vote_count.gte': 1000,
                'sort_by': 'vote_average.desc',
                'page': page,
            },
            timeout=12,
        )

        if tmdb_response.status_code != 200:
            return None, ('Failed to fetch data from TMDB.', tmdb_response.status_code)

        tmdb_movies = tmdb_response.json().get('results', [])

        for tmdb_movie in tmdb_movies:
            title = tmdb_movie.get('title')
            if not title or title in seen_titles:
                continue

            release_date = tmdb_movie.get('release_date') or ''
            year = release_date[:4] if len(release_date) >= 4 else ''

            omdb_response = requests.get(
                'http://www.omdbapi.com/',
                params={
                    't': title,
                    'y': year,
                    'apikey': OMDB_API_KEY,
                },
                timeout=10,
            )

            imdb_rating = 'N/A'
            poster = ''
            genre_tag = ''

            if omdb_response.status_code == 200:
                omdb_data = omdb_response.json()
                if omdb_data.get('Response') == 'True':
                    imdb_rating = omdb_data.get('imdbRating', 'N/A')
                    poster = omdb_data.get('Poster', '')
                    genre_tag = omdb_data.get('Genre', '')

            if not poster or poster == 'N/A':
                poster_path = tmdb_movie.get('poster_path')
                poster = f"{TMDB_IMAGE_BASE_URL}{poster_path}" if poster_path else ''

            user_score = int(round(float(tmdb_movie.get('vote_average', 0.0)) * 10))

            collected_movies.append(
                {
                    'title': title,
                    'genre_ids': tmdb_movie.get('genre_ids', []),
                    'Poster': poster,
                    'imdb_rating': imdb_rating,
                    'Genre': genre_tag,
                    'overview': tmdb_movie.get('overview', ''),
                    'release_year': year,
                    'tmdb_vote_average': float(tmdb_movie.get('vote_average', 0.0)),
                    'user_score': user_score,
                }
            )
            seen_titles.add(title)

            if len(collected_movies) >= 30:
                break

        if len(collected_movies) >= 30:
            break

    collected_movies.sort(key=lambda movie: movie['tmdb_vote_average'], reverse=True)
    return collected_movies, None


@app.route('/movies/genre/<genre_id>')
def find_movie(genre_id):
    if not OMDB_API_KEY or not TMDB_API_KEY:
        return jsonify({'error': 'Missing OMDB_API_KEY or TMDB_API_KEY environment variables.'}), 500

    try:
        movies, error = _discover_movies_by_genre(genre_id, min_vote_average=0.0)
        if error:
            message, status = error
            return jsonify({'error': message}), status

        if not movies:
            return jsonify({'error': 'No movies found for the selected genre.'}), 404

        return jsonify(movies[:20])
    except requests.RequestException:
        return jsonify({'error': 'Upstream movie providers did not respond in time.'}), 504
    except Exception as exception:
        return jsonify({'error': str(exception)}), 500


# Legacy compatibility route (old frontend callers)
@app.route('/movies/genre/<genre_id>/rating/<min_rating>')
def find_movie_with_min_rating(genre_id, min_rating):
    if not OMDB_API_KEY or not TMDB_API_KEY:
        return jsonify({'error': 'Missing OMDB_API_KEY or TMDB_API_KEY environment variables.'}), 500

    try:
        min_vote_average = float(min_rating)
    except ValueError:
        return jsonify({'error': 'Rating must be a valid number.'}), 400

    try:
        movies, error = _discover_movies_by_genre(genre_id, min_vote_average=min_vote_average)
        if error:
            message, status = error
            return jsonify({'error': message}), status

        if not movies:
            return jsonify({'error': 'No movies found for the selected filters.'}), 404

        return jsonify(movies[:20])
    except requests.RequestException:
        return jsonify({'error': 'Upstream movie providers did not respond in time.'}), 504
    except Exception as exception:
        return jsonify({'error': str(exception)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5050)
