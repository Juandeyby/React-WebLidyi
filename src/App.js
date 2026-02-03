import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API = "https://lidyi.com/config";
const ICECAST_STATUS = "https://lidyi.com/radio/status.xsl";
const STREAM_URL = "https://lidyi.com/radio/stream.mp3";

function App() {
    const audioRef = useRef(null);

    /* =========================
       STATE FROM LIQUIDSOAP
    ========================= */
    const [queue, setQueue] = useState([]);
    const [sourceType, setSourceType] = useState("random");
    const [elapsed, setElapsed] = useState(0);
    const [remaining, setRemaining] = useState(0);
    const [duration, setDuration] = useState(0);

    /* =========================
       STATE FROM ICECAST
    ========================= */
    const [nowPlaying, setNowPlaying] = useState("");
    const [listeners, setListeners] = useState(0);

    /* =========================
       UI STATE
    ========================= */
    const [library, setLibrary] = useState([]);
    const [search, setSearch] = useState("");

    const [isLive, setIsLive] = useState(false);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);

    /* =========================
       LOAD LIQUIDSOAP STATUS
    ========================= */
    const loadLiquidsoapStatus = async () => {
        const res = await fetch(`${API}/status`, { cache: "no-store" });
        const data = await res.json();
        const map = Object.fromEntries(data);

        setQueue(map.queue ? JSON.parse(map.queue) : []);
        setSourceType(map.source || "random");
        setElapsed(Number(map.elapsed || 0));
        setRemaining(Number(map.remaining || 0));
        setDuration(Number(map.duration || 0));
    };

    /* =========================
       LOAD ICECAST STATUS (REAL NOW PLAYING)
    ========================= */
    const loadIcecastStatus = async () => {
        try {
            const res = await fetch(ICECAST_STATUS, { cache: "no-store" });
            const html = await res.text();

            const doc = new DOMParser().parseFromString(html, "text/html");

            // Find all mount headers
            const mounts = Array.from(doc.querySelectorAll("h3.mount"));

            // Find EXACT mount
            const streamMount = mounts.find(
                h => h.textContent.trim() === "Mount Point /stream.mp3"
            );

            if (!streamMount) {
                console.warn("Mount /stream.mp3 not found");
                return;
            }

            // The .roundbox is the container of this mount
            const roundbox = streamMount.closest(".roundbox");
            if (!roundbox) return;

            const rows = roundbox.querySelectorAll("table tr");

            let playing = "";
            let currentListeners = 0;

            rows.forEach(row => {
                const cells = row.querySelectorAll("td");
                if (cells.length !== 2) return;

                const label = cells[0].textContent.trim();
                const value = cells[1].textContent.trim();

                if (label === "Currently playing:") {
                    playing = value;
                }

                if (label === "Listeners (current):") {
                    currentListeners = parseInt(value, 10) || 0;
                }
            });

            setNowPlaying(playing);
            setListeners(currentListeners);
        } catch (err) {
            console.error("Icecast status error:", err);
        }
    };

    /* =========================
       LOAD LIBRARY (ONCE)
    ========================= */
    const loadLibrary = async () => {
        const res = await fetch(`${API}/library`, { cache: "no-store" });
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
            setLibrary(JSON.parse(data[0][1]));
        }
    };

    /* =========================
       CONTROLS
    ========================= */
    const skipSong = async () => {
        await fetch(`${API}/skip`, { cache: "no-store" });
    };

    const requestSong = async (songPath) => {
        const fileName = songPath.split("/").pop();
        await fetch(
            `${API}/next?keyword=${encodeURIComponent(fileName)}`,
            { cache: "no-store" }
        );
        setSearch("");
    };

    /* =========================
       FILTERED LIBRARY
    ========================= */
    const filteredLibrary = useMemo(() => {
        if (!search) return [];
        return library.filter((song) =>
            song.toLowerCase().includes(search.toLowerCase())
        );
    }, [search, library]);

    /* =========================
       AUDIO EVENTS
    ========================= */
    const handlePlay = () => {
        setIsLive(true);
        setReconnectAttempts(0);
        if (audioRef.current) audioRef.current.muted = false;
    };

    const handlePause = () => setIsLive(false);

    const handleError = () => {
        setIsLive(false);
        if (reconnectAttempts >= 5) return;

        const delay = Math.min(3000 * (reconnectAttempts + 1), 15000);
        setTimeout(() => {
            audioRef.current?.play().catch(() => {});
            setReconnectAttempts((a) => a + 1);
        }, delay);
    };

    /* =========================
       INIT
    ========================= */
    useEffect(() => {
        loadLiquidsoapStatus();
        loadIcecastStatus();
        loadLibrary();

        const interval = setInterval(() => {
            loadLiquidsoapStatus();
            loadIcecastStatus();
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    const progress =
        duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;

    return (
        <div className="App">
            <h1>
                🎧 Live Radio{" "}
                <span className={isLive ? "live on" : "live off"}>
          {isLive ? "🔴 LIVE" : "⚫ OFFLINE"}
        </span>
            </h1>

            <p>👥 Listeners: {listeners}</p>

            {/* AUDIO */}
            <audio
                ref={audioRef}
                controls
                autoPlay
                muted
                preload="none"
                playsInline
                onPlay={handlePlay}
                onPause={handlePause}
                onError={handleError}
            >
                <source
                    src={`${STREAM_URL}?nocache=${Date.now()}`}
                    type="audio/mpeg"
                />
            </audio>

            {/* NOW PLAYING */}
            <div className="panel">
                <h2>
                    ▶ Now Playing{" "}
                    <span className="badge">
            {sourceType === "queue" ? "REQUEST" : "RANDOM"}
          </span>
                </h2>

                <p>{nowPlaying || "—"}</p>

                <div className="progress">
                    <div className="bar" style={{ width: `${progress}%` }} />
                </div>

                <small>
                    ⏱ {Math.floor(elapsed)}s elapsed ·{" "}
                    {Math.floor(remaining)}s remaining
                </small>

                <h3>⏭ Queue</h3>
                <ul>
                    {queue.length === 0 && <li>Empty</li>}
                    {queue.map((s, i) => (
                        <li key={i}>{s.split("/").pop()}</li>
                    ))}
                </ul>

                <button onClick={skipSong}>⏩ Skip</button>
            </div>

            {/* SEARCH */}
            <div className="panel">
                <h2>🎶 Request Song</h2>

                <input
                    placeholder="Search song..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                {filteredLibrary.slice(0, 20).map((song, i) => (
                    <button key={i} onClick={() => requestSong(song)}>
                        ➕ {song.split("/").pop()}
                    </button>
                ))}
            </div>

            {/* FULL LIBRARY (THIS WAS MISSING) */}
            <div className="panel library">
                <h2>📚 Full Library ({library.length})</h2>

                {library.length === 0 && <p>No songs loaded</p>}

                <ul className="library-list">
                    {library.map((song, i) => (
                        <li key={i}>
                            <button onClick={() => requestSong(song)}>
                                ➕ {song.split("/").pop()}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default App;
