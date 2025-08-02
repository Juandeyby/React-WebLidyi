import './App.css';

function App() {
  return (
      <div className="App">
        <header className="App-header">
          <h1>Radio en Vivo</h1>
          <audio controls autoPlay>
            <source src="https://lidyi.com/radio/stream.mp3" type="audio/mpeg" />
            Tu navegador no soporta el elemento de audio.
          </audio>
        </header>
      </div>
  );
}

export default App;
