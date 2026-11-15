import React, { useState } from 'react';
import WebGLFallback from './FloatingCardsWebGL.jsx';
import './FloatingCards.css';

// Actual 12-second Premotio Hole 01 export with the approved card artwork.
// The previous WebGL implementation remains available if the video cannot load.
const PREMOTIO_VIDEO = 'https://adnm32k0mqvvkxwh.public.blob.vercel-storage.com/johnwolf/approved-hole01-paperflow-20261115-v1.mp4';

export default function FloatingCards() {
  const [failed, setFailed] = useState(false);
  if (failed) return <WebGLFallback />;
  return (
    <div className="jw-floating-card-stage" aria-hidden="true">
      <video
        className="jw-premotio-paper-video"
        src={PREMOTIO_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        onError={() => setFailed(true)}
      />
    </div>
  );
}
