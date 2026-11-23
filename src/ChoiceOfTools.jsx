import React, { useRef, useState } from 'react';
import { centeredToolScrollLeft } from './about/mobile-interactions.js';
import './ChoiceOfTools.css';

// Reference artwork order is preserved. Existing PNG/WebP artwork is reused;
// Claude and JavaScript marks are local SVGs, never remote image requests.
export const CHOICE_OF_TOOLS = [
  { id: 'illustrator', name: 'Adobe Illustrator', src: '/tools/illustrator.webp',
    detail: 'Vector artwork, logos, icons, and complete brand identity systems.' },
  { id: 'claude', name: 'Claude', src: '/tools/claude.svg',
    detail: 'Thoughtful AI assistance for writing, researching, and developing ideas.' },
  { id: 'procreate', name: 'Procreate', src: '/tools/procreate.webp',
    detail: 'Hand-drawn illustration, sketching, and painting on the iPad.' },
  { id: 'canva', name: 'Canva', src: '/tools/canva.webp',
    detail: 'Quick visual concepts, social graphics, and presentation layouts.' },
  { id: 'figma', name: 'Figma', src: '/tools/figma.webp',
    detail: 'Interface design, interactive prototypes, and collaborative design systems.' },
  { id: 'github', name: 'GitHub', src: '/tools/github.webp',
    detail: 'Version control and collaboration throughout website development.' },
  { id: 'javascript', name: 'JavaScript', src: '/tools/javascript.svg',
    detail: 'Programming interactive websites, responsive features, and motion.' },
  { id: 'chatgpt', name: 'ChatGPT', src: '/tools/chatgpt.webp',
    detail: 'Creative research, brainstorming, writing, and problem solving.' },
  { id: 'photoshop', name: 'Adobe Photoshop', src: '/tools/photoshop.webp',
    detail: 'Image editing, retouching, compositing, and digital artwork.' },
];

export default function ChoiceOfTools() {
  const rowRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [picked, setPicked] = useState(null);
  const selectedId = hovered ?? picked;
  const activeTool = CHOICE_OF_TOOLS.find(tool => tool.id === selectedId);
  const onEnter = (event, id) => {
    if (event.pointerType === 'mouse') setHovered(id);
  };
  const onLeave = (event, id) => {
    if (event.pointerType === 'mouse')
      setHovered(previous => previous === id ? null : previous);
  };
  const centerMobileTool = element => {
    const row = rowRef.current;
    if (!row || !window.matchMedia('(max-width: 600px)').matches) return;
    const left = centeredToolScrollLeft(
      element.offsetLeft, element.offsetWidth, row.clientWidth,
      row.scrollWidth - row.clientWidth);
    row.scrollTo({
      left,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto' : 'smooth',
    });
  };
  const onPick = (event, id) => {
    setPicked(previous => previous === id ? null : id);
    centerMobileTool(event.currentTarget);
  };

  return (
    <section id="about-tools" className="jw-about-tools"
      aria-labelledby="jw-about-tools-heading" data-active-tool={selectedId ?? 'none'}>
      <div className="jw-about-tools__glow" aria-hidden="true" />
      <h3 id="jw-about-tools-heading" className="jw-about-tools__heading">
        <span>MY </span><span>CHOICE OF TOOLS</span>
      </h3>
      <div className={'jw-about-tools__detail' +
        (activeTool ? ' jw-about-tools__detail--active' : '')}
        role="status" aria-live="polite" aria-atomic="true">
        {activeTool ? (
          <>
            <h4 key={activeTool.id} className="jw-about-tools__name">{activeTool.name}</h4>
            <p key={activeTool.id + '-detail'} className="jw-about-tools__description">
              {activeTool.detail}
            </p>
          </>
        ) : (
          <p className="jw-about-tools__prompt">Choose a tool</p>
        )}
      </div>
      <div className="jw-about-tools__row" ref={rowRef}
        role="group" aria-label="Explore my design and development tools">
        {CHOICE_OF_TOOLS.map(tool => (
          <button key={tool.id} type="button"
            className={'jw-about-tools__item' +
              (tool.id === selectedId ? ' is-selected' : '')}
            aria-label={'Show what I use ' + tool.name + ' for'}
            aria-pressed={tool.id === picked}
            onPointerEnter={event => onEnter(event, tool.id)}
            onPointerLeave={event => onLeave(event, tool.id)}
            onFocus={event => {
              // Safari focuses tapped buttons. Only keyboard focus should
              // preview a tool; touch taps must be able to toggle it off.
              if (event.currentTarget.matches(':focus-visible'))
                setHovered(tool.id);
            }}
            onBlur={() => setHovered(null)}
            onClick={event => onPick(event, tool.id)}>
            <img className="jw-about-tools__logo" src={tool.src} alt=""
              loading="lazy" decoding="async" draggable="false" />
          </button>
        ))}
      </div>
    </section>
  );
}
