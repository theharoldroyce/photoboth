"use client";

import { useRef, useState, useCallback, useEffect } from "react";

type Photo = { dataUrl: string };
type Phase = "idle" | "countdown" | "flash" | "done";

export default function PhotoboothApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [error, setError] = useState("");
  const [mirrored, setMirrored] = useState(true);
  const [layout, setLayout] = useState<"strip" | "polaroid">("strip");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const bcRef = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef({ phase, countdown, photoCount, mirrored, cameraId: selectedCamera });

  // Keep stateRef current so the onmessage handler always reads fresh values
  useEffect(() => {
    stateRef.current = { phase, countdown, photoCount, mirrored, cameraId: selectedCamera };
  }, [phase, countdown, photoCount, mirrored, selectedCamera]);

  // BroadcastChannel for syncing state to /display screen
  useEffect(() => {
    const bc = new BroadcastChannel("photobooth-sync");
    bcRef.current = bc;

    bc.onmessage = (e) => {
      if (e.data.type === "display-ready") {
        bc.postMessage({ type: "state", ...stateRef.current });
      }
    };

    return () => bc.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Broadcast state whenever it changes
  useEffect(() => {
    bcRef.current?.postMessage({ type: "state", ...stateRef.current });
  }, [phase, countdown, photoCount, mirrored, selectedCamera]);

  const loadCameras = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setCameras(videoDevices);
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId);
      }
    } catch {
      setError("Could not access camera. Please allow camera permissions and try again.");
    }
  }, [selectedCamera]);

  useEffect(() => {
    loadCameras();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedCamera
          ? { deviceId: { exact: selectedCamera }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
        audio: false,
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
    } catch {
      setError("Could not access camera. Please allow camera permissions and try again.");
    }
  }, [selectedCamera]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const captureFrame = useCallback((): string => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return "";
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d")!;
    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/png");
  }, [mirrored]);

  const totalShots = layout === "polaroid" ? 1 : 4;

  const runSession = useCallback(async () => {
    if (!stream || phase !== "idle") return;
    setPhotos([]);
    setPhotoCount(0);
    setPhase("countdown");

    const taken: Photo[] = [];
    for (let i = 0; i < totalShots; i++) {
      for (let c = 3; c >= 1; c--) {
        setCountdown(c);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(0);
      setPhase("flash");
      const dataUrl = captureFrame();
      taken.push({ dataUrl });
      setPhotos([...taken]);
      setPhotoCount(i + 1);
      await new Promise((r) => setTimeout(r, 500));
      if (i < totalShots - 1) setPhase("countdown");
    }
    setPhase("done");
  }, [stream, phase, captureFrame, totalShots]);

  const formatStripDate = useCallback(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    return `${mm}.${dd}.${yy}`;
  }, []);

  const buildStrip = useCallback(async (): Promise<string> => {
    const canvas = stripRef.current!;
    const ctx = canvas.getContext("2d")!;

    if (layout === "polaroid") {
      const SIDE = 40;
      const BOTTOM = 100;
      const TOP = 40;
      const PHOTO_W = 480;
      const PHOTO_H = 480;

      canvas.width = SIDE + PHOTO_W + SIDE;
      canvas.height = TOP + PHOTO_H + BOTTOM;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (photos.length > 0) {
        const img = new Image();
        img.src = photos[0].dataUrl;
        await new Promise((r) => { img.onload = r; });
        ctx.drawImage(img, SIDE, TOP, PHOTO_W, PHOTO_H);
      } else {
        ctx.fillStyle = "#111";
        ctx.fillRect(SIDE, TOP, PHOTO_W, PHOTO_H);
      }

      ctx.fillStyle = "#222";
      ctx.font = "bold 24px 'DM Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(formatStripDate(), canvas.width / 2, TOP + PHOTO_H + BOTTOM / 2 + 8);
    } else {
      const BORDER = 30;
      const PHOTO_W = 420;
      const PHOTO_H = 315;
      const GAP = 16;
      const HEADER_H = 70;
      const FOOTER_H = 40;

      canvas.width = BORDER + PHOTO_W + BORDER;
      canvas.height = BORDER + HEADER_H + (PHOTO_H + GAP) * 4 - GAP + FOOTER_H + BORDER;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#222";
      ctx.font = "bold 28px 'DM Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(formatStripDate(), canvas.width / 2, BORDER + HEADER_H / 2 + 10);

      for (let i = 0; i < 4; i++) {
        const x = BORDER;
        const y = BORDER + HEADER_H + i * (PHOTO_H + GAP);

        if (i < photos.length) {
          const img = new Image();
          img.src = photos[i].dataUrl;
          await new Promise((r) => { img.onload = r; });
          ctx.drawImage(img, x, y, PHOTO_W, PHOTO_H);
        } else {
          ctx.fillStyle = "#111";
          ctx.fillRect(x, y, PHOTO_W, PHOTO_H);
        }
      }
    }

    return canvas.toDataURL("image/png");
  }, [photos, formatStripDate, layout]);

  const downloadStrip = useCallback(async () => {
    const url = await buildStrip();
    const a = document.createElement("a");
    a.href = url;
    a.download = `photobooth-${Date.now()}.png`;
    a.click();
  }, [buildStrip]);

  const reset = () => {
    setPhotos([]);
    setPhase("idle");
    setPhotoCount(0);
  };

  return (
    <main className="app-root">
      <div className="grain" />
      <div className="layout">
        <div className="camera-col">
          <header className="brand">
            <span className="brand-icon">📷</span>
            <h1 className="brand-title">PHOTOBOOTH</h1>
            <p className="brand-sub">instant memories</p>
          </header>

          <div className="camera-wrapper">
            {!stream ? (
              <div className="camera-placeholder">
                <div className="placeholder-icon">📷</div>
                <p className="placeholder-text">Ready to snap?</p>
                {cameras.length > 1 && (
                  <select
                    className="camera-select"
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                  >
                    {cameras.map((cam, i) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                <button className="btn-primary" onClick={startCamera}>
                  Start Camera
                </button>
                {error && <p className="error-text">{error}</p>}
              </div>
            ) : (
              <div className="video-container">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="video-feed"
                  style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
                />
                {phase === "flash" && <div className="flash-overlay" />}
                {phase === "countdown" && countdown > 0 && (
                  <div className="countdown-overlay">
                    <span className="countdown-number">{countdown}</span>
                  </div>
                )}
                {phase !== "idle" && phase !== "done" && (
                  <div className="photo-progress">
                    {Array.from({ length: totalShots }, (_, i) => (
                      <div key={i} className={`progress-dot ${i < photoCount ? "taken" : ""}`} />
                    ))}
                  </div>
                )}
                <div className="video-frame-corners">
                  <span className="corner tl" />
                  <span className="corner tr" />
                  <span className="corner bl" />
                  <span className="corner br" />
                </div>
              </div>
            )}
          </div>

          {stream && phase === "idle" && (
            <div className="controls">
              {cameras.length > 1 && (
                <select
                  className="camera-select"
                  value={selectedCamera}
                  onChange={(e) => {
                    setSelectedCamera(e.target.value);
                    if (stream) {
                      stream.getTracks().forEach((t) => t.stop());
                      setStream(null);
                    }
                  }}
                >
                  {cameras.map((cam, i) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
              <button className="shutter-btn" onClick={runSession}>
                <span className="shutter-inner" />
              </button>
              <p className="controls-hint">{totalShots} {totalShots === 1 ? "shot" : "shots"} · 3 sec countdown</p>
            </div>
          )}

          {(phase === "countdown" || phase === "flash") && (
            <div className="session-status">
              <span className="pulse-dot" />
              Photo {photoCount + 1} of {totalShots}
            </div>
          )}

          {phase === "done" && (
            <div className="done-actions">
              <button className="btn-primary" onClick={downloadStrip}>⬇ Download Strip</button>
              <button className="btn-secondary" onClick={reset}>↩ Retake</button>
            </div>
          )}
        </div>

        <div className="panel-col">
          <section className="strip-section">
            <h2 className="panel-title">Layout</h2>
            <div className="layout-row">
              <button
                className={`layout-btn ${layout === "strip" ? "active" : ""}`}
                onClick={() => setLayout("strip")}
              >
                Strip
              </button>
              <button
                className={`layout-btn ${layout === "polaroid" ? "active" : ""}`}
                onClick={() => setLayout("polaroid")}
              >
                Polaroid
              </button>
            </div>
          </section>

          <section className="strip-section">
            <h2 className="panel-title">Your {layout === "strip" ? "Strip" : "Polaroid"}</h2>
            {layout === "polaroid" ? (
              <div className="photo-strip polaroid-layout" style={{ boxShadow: `0 0 20px #00000022` }}>
                <div className="polaroid-slot">
                  {photos[0] ? (
                    <img src={photos[0].dataUrl} alt="Photo 1" className="strip-img" />
                  ) : (
                    <div className="strip-empty">1</div>
                  )}
                </div>
                <div className="polaroid-date">{formatStripDate()}</div>
              </div>
            ) : (
              <div className="photo-strip" style={{ boxShadow: `0 0 20px #00000022` }}>
                <div className="strip-header">{formatStripDate()}</div>
                <div className="strip-photos">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="strip-slot">
                      {photos[i] ? (
                        <img src={photos[i].dataUrl} alt={`Photo ${i + 1}`} className="strip-img" />
                      ) : (
                        <div className="strip-empty">{i + 1}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

<section className="panel-section">
            <label className="toggle-row">
              <span className="toggle-label">Mirror Camera</span>
              <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} className="sr-only" />
              <div className={`toggle-track ${mirrored ? "on" : ""}`}>
                <div className="toggle-thumb" />
              </div>
            </label>
          </section>

          <section className="panel-section">
            <button
              className="btn-display"
              onClick={() => window.open("/display", "photobooth-display", "fullscreen=yes")}
            >
              Open Display Screen
            </button>
            <p className="display-hint">Opens a full-screen mirror for subjects</p>
          </section>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
      <canvas ref={stripRef} style={{ display: "none" }} />

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0e0a0a; --surface: #1a1212; --border: #2e2222;
          --accent: #e8b86d; --accent2: #d4566a; --text: #f0e8e0;
          --muted: #7a6b62; --radius: 12px;
        }
        body { background: var(--bg); color: var(--text); font-family: 'DM Mono', monospace; min-height: 100vh; }
        .app-root { position: relative; min-height: 100vh; overflow: hidden; }
        .grain {
          pointer-events: none; position: fixed; inset: 0; z-index: 100;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          opacity: 0.35;
        }
        .layout { display: flex; gap: 2rem; max-width: 1100px; margin: 0 auto; padding: 2rem; min-height: 100vh; align-items: flex-start; }
        .camera-col { flex: 1.1; display: flex; flex-direction: column; gap: 1.5rem; position: sticky; top: 2rem; }
        .panel-col { flex: 0.9; display: flex; flex-direction: column; gap: 1.2rem; }
        .brand { text-align: center; padding-bottom: 0.5rem; }
        .brand-icon { font-size: 2rem; display: block; }
        .brand-title {
          font-family: 'Playfair Display', serif; font-size: 2.8rem; font-weight: 900;
          letter-spacing: 0.15em;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1;
        }
        .brand-sub { color: var(--muted); font-size: 0.75rem; letter-spacing: 0.3em; text-transform: uppercase; margin-top: 4px; }
        .camera-wrapper { border-radius: var(--radius); overflow: hidden; border: 2px solid var(--border); aspect-ratio: 4/3; background: #0a0707; }
        .camera-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; }
        .placeholder-icon { font-size: 4rem; opacity: 0.3; }
        .placeholder-text { color: var(--muted); font-size: 0.9rem; }
        .video-container { position: relative; width: 100%; height: 100%; }
        .video-feed { width: 100%; height: 100%; object-fit: cover; display: block; }
        .flash-overlay { position: absolute; inset: 0; background: white; animation: flash 0.5s ease-out forwards; }
        @keyframes flash { 0% { opacity: 1; } 100% { opacity: 0; } }
        .countdown-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); }
        .countdown-number {
          font-family: 'Playfair Display', serif; font-size: 8rem; font-weight: 900;
          color: white; text-shadow: 0 0 40px var(--accent);
          animation: countPop 0.8s ease-out;
        }
        @keyframes countPop { 0% { transform: scale(1.5); opacity: 0; } 50% { transform: scale(1); opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; transform: scale(0.8); } }
        .photo-progress { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
        .progress-dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid white; background: transparent; transition: background 0.3s; }
        .progress-dot.taken { background: var(--accent); border-color: var(--accent); }
        .video-frame-corners { position: absolute; inset: 0; pointer-events: none; }
        .corner { position: absolute; width: 20px; height: 20px; border-color: var(--accent); border-style: solid; }
        .corner.tl { top: 8px; left: 8px; border-width: 2px 0 0 2px; }
        .corner.tr { top: 8px; right: 8px; border-width: 2px 2px 0 0; }
        .corner.bl { bottom: 8px; left: 8px; border-width: 0 0 2px 2px; }
        .corner.br { bottom: 8px; right: 8px; border-width: 0 2px 2px 0; }
        .controls { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
        .shutter-btn { width: 72px; height: 72px; border-radius: 50%; border: 3px solid var(--accent); background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.15s; }
        .shutter-btn:hover { transform: scale(1.05); }
        .shutter-btn:active { transform: scale(0.95); }
        .shutter-inner { width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent2)); display: block; box-shadow: 0 0 20px rgba(232,184,109,0.4); }
        .controls-hint { color: var(--muted); font-size: 0.7rem; letter-spacing: 0.1em; }
        .session-status { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--accent); font-size: 0.85rem; }
        .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent2); animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .done-actions { display: flex; gap: 0.75rem; justify-content: center; }
        .btn-primary { padding: 0.6rem 1.4rem; background: linear-gradient(135deg, var(--accent), var(--accent2)); border: none; border-radius: var(--radius); color: #1a0a0a; font-family: 'DM Mono', monospace; font-weight: 600; font-size: 0.85rem; cursor: pointer; letter-spacing: 0.05em; transition: opacity 0.2s, transform 0.15s; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-secondary { padding: 0.6rem 1.4rem; background: transparent; border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-family: 'DM Mono', monospace; font-size: 0.85rem; cursor: pointer; transition: border-color 0.2s; }
        .btn-secondary:hover { border-color: var(--muted); }
        .error-text { color: var(--accent2); font-size: 0.8rem; text-align: center; }
        .camera-select { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 0.75rem; padding: 0.4rem 0.6rem; cursor: pointer; width: 100%; max-width: 280px; outline: none; }
        .camera-select:focus { border-color: var(--accent); }
        .strip-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; }
        .layout-row { display: flex; gap: 0.5rem; }
        .layout-btn { flex: 1; padding: 0.5rem 0.75rem; border: 2px solid var(--border); border-radius: 8px; cursor: pointer; font-family: 'DM Mono', monospace; font-size: 0.8rem; color: var(--muted); background: transparent; transition: all 0.2s; letter-spacing: 0.05em; }
        .layout-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(232,184,109,0.1); }
        .layout-btn:hover { border-color: var(--accent); }
        .photo-strip { margin-top: 0.75rem; border-radius: 4px; overflow: hidden; background: #ffffff; padding: 12px; }
        .photo-strip.polaroid-layout { padding: 16px 16px 8px; }
        .strip-header { text-align: center; font-size: 0.85rem; font-weight: 700; color: #222; padding: 6px 0 10px; letter-spacing: 0.08em; }
        .strip-photos { display: flex; flex-direction: column; gap: 8px; }
        .strip-slot { aspect-ratio: 4/3; background: #111; border-radius: 2px; overflow: hidden; }
        .strip-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .strip-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #444; font-size: 1.2rem; background: #111; }
        .polaroid-slot { aspect-ratio: 1/1; background: #111; border-radius: 2px; overflow: hidden; }
        .polaroid-date { text-align: center; font-size: 0.85rem; font-weight: 700; color: #222; padding: 12px 0 6px; letter-spacing: 0.08em; }
        .panel-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; }
        .panel-title { font-size: 0.7rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.75rem; }
        .toggle-row { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
        .toggle-label { font-size: 0.75rem; color: var(--muted); }
        .toggle-track { width: 44px; height: 24px; border-radius: 12px; background: var(--border); position: relative; transition: background 0.3s; }
        .toggle-track.on { background: var(--accent); }
        .toggle-thumb { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: white; transition: transform 0.3s; }
        .toggle-track.on .toggle-thumb { transform: translateX(20px); }
        .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
        .btn-display { width: 100%; padding: 0.6rem 1rem; background: transparent; border: 1px solid var(--accent); border-radius: var(--radius); color: var(--accent); font-family: 'DM Mono', monospace; font-size: 0.8rem; cursor: pointer; letter-spacing: 0.08em; transition: all 0.2s; }
        .btn-display:hover { background: var(--accent); color: #1a0a0a; }
        .display-hint { color: var(--muted); font-size: 0.65rem; margin-top: 0.4rem; text-align: center; }
        @media (max-width: 768px) {
          .layout { flex-direction: column; padding: 1rem; }
          .camera-col { position: static; }
        }
      `}</style>
    </main>
  );
}
