from flask import Flask, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

OMDB_API_KEY = 'REDACTED_OMDB_KEY'
TMDB_API_KEY = 'REDACTED_TMDB_KEY'



@app.route('/movies/genre/<genre_id>/rating/<min_vote_average>')
def find_movie(genre_id, min_vote_average):
    try:
        tmdb_url = (
            f"https://api.themoviedb.org/3/discover/movie?"
            f"api_key={TMDB_API_KEY}&with_genres={genre_id}"
            f"&vote_average.gte={min_vote_average}&vote_count.gte=1000"
            f"&sort_by=vote_average.desc" 
        )
    
        tmdb_response = requests.get(tmdb_url)
        
        if tmdb_response.status_code == 200:
            tmdb_data = tmdb_response.json()

            movies = tmdb_data.get('results', [])[:20]

            # Now getting IMDB

            imdbrt_movie = []
            for movie in movies:
                title = movie['title']
                omdb_url = f"http://www.omdbapi.com/?t={title}&apikey={OMDB_API_KEY}"
                omdb_response = requests.get(omdb_url)

                imdb_rating = 'N/A'
                poster = ''
                
                
                if omdb_response.status_code == 200:
                    omdb_data = omdb_response.json()
                    if omdb_data ['Response'] == 'True':

                        imdb_rating = omdb_data.get('imdbRating', 'N/A')
                        poster = omdb_data.get('Poster', '')
                        genre_tag = omdb_data.get('Genre', '')

                
                        imdbrt_movie.append({
                            'title': movie['title'],
                            'genre_ids': movie['genre_ids'],
                            'vote_average': int(movie['vote_average']*10),
                            'Poster': poster,
                            'imdb_rating': imdb_rating ,
                            'Genre': genre_tag,
                            

                        })
            return jsonify(imdbrt_movie)
        else:
            return jsonify({'No movies found for the given genre and rating'}), 404
    except Exception as e:
       
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    
    
    app.run(debug=True)
