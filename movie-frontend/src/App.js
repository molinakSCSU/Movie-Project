import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [genreId, setGenreId] = useState('');   
  const [minVoteAverage, setMinVoteAverage] = useState(null);
  const [movieData, setMovieData] = useState([]);
  const [remainingMovies, setRemainingMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('Click A Movie');

  const genreList = [
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
    { id: 37, name: 'Western' }
  ];

  const handleSearch = async () => {
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(`http://127.0.0.1:5000/movies/genre/${genreId}/rating/${minVoteAverage}`);
      console.log('API Response:', response.data);
      setMovieData(response.data); //getting movies



      const topMovies = response.data.slice(0, 3); // the 3 movies
      const availableMovies = response.data.slice(3);
      setMovieData(topMovies); 
      setRemainingMovies(availableMovies);


    } catch (error) {
      console.error('Error fetching movie data:', error);
      setMovieData([]); 
      setRemainingMovies([]);

      if (error.response) {
      
        if (error.response.status   
   === 404) {
          setError('A Genre was not selected. Please select a Genre.');

        } else {

          setError('Please try again later.');
        }

      } else if (error.request) {  
  
        setError('No backend response.');
      } else {
          
  
        setError('error');
      }
    } finally {
      setIsLoading(false);
    }
    setMessage('Click to Change')
  };

  

const handleReplaceMovie = (index) => {
  
  if (remainingMovies.length > 0) {
    const newMovie = remainingMovies[0]; // new movie
    const updatedMovieData = [...movieData];
    updatedMovieData[index] = newMovie; // replace movie
    setMovieData(updatedMovieData); // update it
    setRemainingMovies(remainingMovies.slice(1)); // remove the movie


    if (remainingMovies.length == 1 ) {

      setMessage('No More Movies');
 
    }


  }
};

  return (
    <div className="App">
      <h1> THE MOVIE FINDER</h1>

      <select value = {genreId} onChange={(e) => setGenreId(e.target.value)}>
        <option value = "">Select Genre</option>
          {genreList.map((genre) => (
            <option key = {genre.id} value={genre.id}>
          {genre.name}
        </option>
          ))}
        </select>


      <button onClick={handleSearch} >Go</button> 
      

      {isLoading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}


      

      { movieData.length > 0 ? (
      <div>


      <p>{message}</p>


        <div className = "movie-list">
          {movieData.slice(0,3).map((movie,index) => (<div key = {movie.title} className = "movie-card" onClick={() => handleReplaceMovie(index)} style = {{cursor:'pointer'}}>
          <h2>{movie.title} </h2> 
          <p>Genre: {movie.Genre}</p>
          <p>IMDb Rating: {movie.imdb_rating}</p>
          <p>User Score: {movie.vote_average}%</p>
          {movie.Poster && <img src={movie.Poster} alt={`${movie.title} Poster`} />}
        
           </div>
          ))}
        </div>
      </div>

         ) : (

          !isLoading && <p>Select a Movie Genre and click Go</p>)}

    </div>
  );
}

export default App;