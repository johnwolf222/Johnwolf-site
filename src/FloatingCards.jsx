import React, { useState } from 'react';
import WebGLFallback from './FloatingCardsWebGL.jsx';
import './FloatingCards.css';

// Approved 12-second Premotio Hole 01 export: 21 artwork sources, 24 sheets.
// The previous WebGL implementation remains available if the video cannot load.
const PREMOTIO_VIDEO = 'https://adnm32k0mqvvkxwh.public.blob.vercel-storage.com/johnwolf/hole01-all21-sheets24-20261115-v2.mp4';

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
