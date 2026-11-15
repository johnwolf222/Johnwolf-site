import React, { useEffect, useRef, useState } from 'react';
import FloatingCards from './FloatingCards.jsx';
import './PremotioPaperVideo.css';

// The licensed Premotio Hole 01 export is the verified motion source.
// Only the approved portfolio images appear in the exported loop.
// The original interactive WebGL field remains available as a load fallback.
const VIDEO = '/new-homepage/premotio-hole01-approved.mp4';
const DIR = '/new-homepage/approved-cards/';

function ReducedMotionCards() {
  const positions = [
    [7, 10, -18], [24, 75, 12], [79, 13, 18],
    [91, 66, -16], [12, 51, 27], [73, 85, -12],
  ];
  return (
    <div className="jw-premotio-reduced" aria-hidden="true">
      {positions.map(([x, y, rotation], index) => (
        <img
          key={index}
          src={`${DIR}${String(index + 1).padStart(2, '0')}.webp`}
          alt=""
          style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
        />
      ))}
    </div>
  );
}

export default function PremotioPaperVideo() {
  const stageRef = useRef(null);
  const videoRef = useRef(null);
  const [videoState, setVideoState] = useState('loading');
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const home = document.getElementById('home');
    const work = document.getElementById('work');
    const stage = stageRef.current;
    if (!home || !work || !stage) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = Math.max(1, window.innerHeight);
      const first = home.getBoundingClientRect();
      const last = work.getBoundingClientRect();
      const visible = first.top < height && last.bottom > 0;
      const exitFade = Math.min(1, Math.max(0, last.bottom / (height * 0.22)));
      stage.style.opacity = visible ? String(exitFade) : '0';
      const video = videoRef.current;
      if (video && !reduced && videoState === 'ready') {
        if (visible && document.hidden === false) {
          if (video.paused) video.play().catch(() => {});
        } else if (!video.paused) {
          video.pause();
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.addEventListener('visibilitychange', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [videoState, reduced]);

  if (reduced) {
    return (
      <div ref={stageRef} className="jw-premotio-paper-stage jw-premotio-paper-stage--static" aria-hidden="true">
        <ReducedMotionCards />
      </div>
    );
  }

  if (videoState === 'failed') return <FloatingCards />;

  return (
    <div ref={stageRef} className="jw-premotio-paper-stage" aria-hidden="true">
      <video
        ref={videoRef}
        className={`jw-premotio-paper-video${videoState === 'ready' ? ' is-ready' : ''}`}
        src={VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        onLoadedData={() => setVideoState('ready')}
        onError={() => setVideoState('failed')}
      />
    </div>
  );
}
