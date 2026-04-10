"use client";

import { useRef, useState, useEffect, useCallback } from "react";

type Phase = "idle" | "countdown" | "flash" | "done";

export default function DisplayPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);
  const [frameColor, setFrameColor] = useState("#1a1a1a");
  const [mirrored, setMirrored] = useState(true);
  const [cameraId, setCameraId] = useState("");
  const [connected, setConnected] = useState(false);

  const startCamera = useCallback(async (deviceId: string) => {
    try {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
        audio: false,
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
    } catch {
      /* camera may already be in use or denied */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const cameraIdRef = useRef(cameraId);

  useEffect(() => {
    const bc = new BroadcastChannel("photobooth-sync");

    bc.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "state") {
        setPhase(msg.phase);
        setCountdown(msg.countdown);
        setPhotoCount(msg.photoCount);
        setFrameColor(msg.frameColor);
        setMirrored(msg.mirrored);
        setConnected(true);

        if (msg.cameraId && msg.cameraId !== cameraIdRef.current) {
          cameraIdRef.current = msg.cameraId;
          setCameraId(msg.cameraId);
          startCamera(msg.cameraId);
        }
      }
    };

    // Ask control page to send current state
    bc.postMessage({ type: "display-ready" });

    return () => bc.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startCamera]);

  return (
    <main className="display-root">
      <div className="display-camera">
        {!stream ? (
          <div className="display-waiting">
            <div className="waiting-icon">📷</div>
            <p className="waiting-text">
              {connected ? "Starting camera..." : "Waiting for control screen..."}
            </p>
            <p className="waiting-hint">Open the main page and start the camera</p>
          </div>
        ) : (
          <div className="display-video-wrap">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="display-video"
              style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
            />
            {phase === "flash" && <div className="display-flash" />}
            {phase === "countdown" && countdown > 0 && (
              <div className="display-countdown">
                <span className="display-countdown-num">{countdown}</span>
              </div>
            )}
            {(phase === "countdown" || phase === "flash") && (
              <div className="display-progress">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`display-dot ${i < photoCount ? "taken" : ""}`}
                    style={i < photoCount ? { background: frameColor, borderColor: frameColor } : {}}
                  />
                ))}
              </div>
            )}
            <div className="display-frame-border" style={{ borderColor: frameColor }} />
          </div>
        )}
      </div>

      {phase === "idle" && stream && (
        <div className="display-ready-hint">
          <span className="display-ready-dot" style={{ background: frameColor }} />
          Ready
        </div>
      )}

      {phase === "done" && (
        <div className="display-done">
          <span className="display-done-text" style={{ color: frameColor }}>Done! Check the control screen for your photos.</span>
        </div>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000; color: #f0e8e0; font-family: 'DM Mono', monospace; margin: 0; overflow: hidden; }

        .display-root {
          width: 100vw; height: 100vh; display: flex; flex-direction: column;
          align-items: center; justify-content: center; background: #000; position: relative;
        }

        .display-camera {
          width: 100%; height: 100%; position: relative;
        }

        .display-waiting {
          width: 100%; height: 100%; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 1rem;
        }
        .waiting-icon { font-size: 5rem; opacity: 0.3; }
        .waiting-text { font-size: 1.5rem; color: #7a6b62; }
        .waiting-hint { font-size: 0.85rem; color: #4a3b32; }

        .display-video-wrap {
          width: 100%; height: 100%; position: relative; overflow: hidden;
        }
        .display-video {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }

        .display-flash {
          position: absolute; inset: 0; background: white;
          animation: dflash 0.5s ease-out forwards;
        }
        @keyframes dflash { 0% { opacity: 1; } 100% { opacity: 0; } }

        .display-countdown {
          position: absolute; inset: 0; display: flex;
          align-items: center; justify-content: center;
          background: rgba(0,0,0,0.35);
        }
        .display-countdown-num {
          font-family: 'Playfair Display', serif; font-size: 18rem; font-weight: 900;
          color: white; text-shadow: 0 0 80px rgba(232,184,109,0.6);
          animation: dcountPop 0.8s ease-out;
        }
        @keyframes dcountPop {
          0% { transform: scale(1.5); opacity: 0; }
          50% { transform: scale(1); opacity: 1; }
          90% { opacity: 1; }
          100% { opacity: 0; transform: scale(0.8); }
        }

        .display-progress {
          position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%);
          display: flex; gap: 16px;
        }
        .display-dot {
          width: 20px; height: 20px; border-radius: 50%;
          border: 3px solid white; background: transparent;
          transition: all 0.3s;
        }
        .display-dot.taken { background: white; border-color: white; }

        .display-frame-border {
          position: absolute; inset: 0; border: 6px solid transparent;
          pointer-events: none; transition: border-color 0.3s;
        }

        .display-ready-hint {
          position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 10px;
          font-size: 1.2rem; color: #7a6b62; letter-spacing: 0.2em; text-transform: uppercase;
        }
        .display-ready-dot {
          width: 12px; height: 12px; border-radius: 50%;
          animation: dpulse 2s infinite;
        }
        @keyframes dpulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        .display-done {
          position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%);
          text-align: center;
        }
        .display-done-text {
          font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 700;
        }
      `}</style>
    </main>
  );
}
