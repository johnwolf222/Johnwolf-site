import React, { useState } from 'react';
import WebGLFallback from './FloatingCardsWebGL.jsx';
import './FloatingCards.css';

// Approved 12-second Premotio Hole 01 export: 21 unique artworks, 21 sheets (no repeats).
// The previous WebGL implementation remains available if the video cannot load.
const PREMOTIO_VIDEO = 'https://adnm32k0mqvvkxwh.public.blob.vercel-storage.com/johnwolf/hole01-all21-unique21-no-doubles-20261115-v3.mp4';

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
