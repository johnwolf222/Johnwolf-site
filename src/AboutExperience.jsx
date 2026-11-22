import React, { useEffect, useRef, useState } from 'react';
import './AboutExperience.css';
import ChoiceOfTools from './ChoiceOfTools.jsx';
import WordHighlight from './WordHighlight.jsx';
import './WordHighlight.css';

// The words and four chapters are preserved from the original Design Is Life
// about.html. The same Candidate F GLB continues from Home and Projects;
// this component NEVER mounts another head, canvas, or page iframe.
export default function AboutExperience() {
  const sectionRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [color, setColor] = useState(false);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    const visibility = new IntersectionObserver(entries => {
      const active = Boolean(entries[0]?.isIntersecting);
      setVisible(active);
      if (!active) {
        // Home retains its approved monochrome head if visitors scroll back.
        setColor(false);
        window.dispatchEvent(new CustomEvent('jw-about-color', {
          detail: { enabled: false },
        }));
      }
    }, { rootMargin: '80px 0px 80px 0px' });
    visibility.observe(section);
    // On phones, reduced-motion devices, or when WebGL is unavailable,
    // the four readable DOM chapters determine the true About height.
    // The tools panel follows directly after the final visible paragraph.
    const lastChapter = section.querySelector('[data-story="4"]');
    const toolsPanel = section.querySelector('#about-tools');
    const fitFallbackStory = () => {
      if (section.dataset.storyHeightSource === 'three' || !lastChapter)
        return;
      const top = section.getBoundingClientRect().top;
      const lastLine = lastChapter.getBoundingClientRect().bottom - top;
      const panelHeight = toolsPanel?.getBoundingClientRect().height ||
        window.innerHeight;
      const breathing = Math.min(100, window.innerHeight * .12);
      section.style.minHeight =
        Math.ceil(lastLine + breathing + panelHeight) + 'px';
    };
    fitFallbackStory();
    const chapterObserver = new ResizeObserver(fitFallbackStory);
    if (lastChapter) chapterObserver.observe(lastChapter);
    window.addEventListener('resize', fitFallbackStory, { passive: true });
    document.fonts?.ready.then(() => {
      if (section.isConnected) fitFallbackStory();
    });
    const impact = event => {
      if (!section.getBoundingClientRect().height) return;
      section.classList.remove('jw-about-impact');
      void section.offsetWidth;
      section.classList.add('jw-about-impact');
      const center = event.detail || {};
      if (Number.isFinite(center.x) && Number.isFinite(center.y)) {
        const x = center.x / Math.max(1, window.innerWidth) * 100;
        const y = center.y / Math.max(1, window.innerHeight) * 100;
        section.style.setProperty('--about-impact-x', x + '%');
        section.style.setProperty('--about-impact-y', y + '%');
      }
    };
    const clearImpact = () => section.classList.remove('jw-about-impact');
    section.addEventListener('animationend', clearImpact);
    window.addEventListener('jw-about-impact', impact);
    return () => {
      visibility.disconnect();
      chapterObserver.disconnect();
      window.removeEventListener('resize', fitFallbackStory);
      section.removeEventListener('animationend', clearImpact);
      window.removeEventListener('jw-about-impact', impact);
      section.classList.remove('jw-about-three-ready', 'jw-about-impact');
    };
  }, []);

  const toggleColor = () => {
    const next = !color;
    setColor(next);
    window.dispatchEvent(new CustomEvent('jw-about-color', {
      detail: { enabled: next },
    }));
  };

  return (
    <section
      id="about"
      ref={sectionRef}
      className="about jw-about-experience"
      aria-label="About John Wolf — Design Is Life"
    >
      <h2 id="jw-about-heading" className="jw-about-heading"><WordHighlight>ABOUT</WordHighlight></h2>
      <div className="jw-about-statement" aria-label="Design is life">
        <div className="jw-about-type-stack">
          <p className="jw-about-line"><WordHighlight>Now I can’t speak for</WordHighlight></p>
          <p className="jw-about-line"><WordHighlight>everyone... But at least for me,</WordHighlight></p>
          <p className="jw-about-line jw-about-line--last"><WordHighlight>Design is life!</WordHighlight></p>
        </div>
      </div>

      <div className="jw-about-story-messages" aria-label="My story about design">
        <article className="jw-about-message story-message story-left" data-story="1">
          <p><WordHighlight>So… what is the human nature of design to me?</WordHighlight></p>
          <p><WordHighlight>Well, it's the creation of the mind's eye, a way to take something intangible like dreams, thoughts, imaginations, ideas, and turn them into things that can literally function in the physical world.</WordHighlight></p>
        </article>
        <article className="jw-about-message story-message story-right" data-story="2">
          <p><WordHighlight>I was fortunate enough to start early, knowing what makes designs unique and how to communicate that is a practice that can be explained but is better experienced.</WordHighlight></p>
        </article>
        <article className="jw-about-message story-message story-left" data-story="3">
          <p><WordHighlight>Some people say </WordHighlight><em><WordHighlight>“art is subjective.”</WordHighlight></em><WordHighlight> However, I believe there is always a fine line.</WordHighlight></p>
          <p><WordHighlight>It twists, turns, it bends, and breaks, but somewhere along those lines, we genuinely agree with appealing visuals that intentional lines create.</WordHighlight></p>
        </article>
        <article className="jw-about-message story-message story-right" data-story="4">
          <p><WordHighlight>What am I good at? </WordHighlight><em><WordHighlight>Let's see.</WordHighlight></em></p>
          <p><WordHighlight>Photoshop, Illustrator, Procreate, graphic design, copywriting, visual design, brand identity, logo development, presentations, and recently website development, machine learning, and AI prompt writing. Just to keep it short.</WordHighlight></p>
        </article>
      </div>

      {visible && <button
        type="button"
        className="jw-about-color-switch"
        aria-label={color ? 'Return head to black and white' : 'Reveal head in color'}
        aria-pressed={color}
        title="Change perspective"
        onClick={toggleColor}
      >
        <span aria-hidden="true" />
      </button>}
      <ChoiceOfTools/>
      <div className="jw-about-footer">
        <WordHighlight>JOHN WOLF</WordHighlight> <span aria-hidden="true">·</span> <WordHighlight>DESIGN IS LIFE.</WordHighlight>
      </div>
    </section>
  );
}
