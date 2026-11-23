import React, { useEffect, useRef, useState } from 'react';
import './AboutExperience.css';
import ChoiceOfTools from './ChoiceOfTools.jsx';
import AboutCapabilities from './AboutCapabilities.jsx';
import WordHighlight from './WordHighlight.jsx';
import './WordHighlight.css';
import {installToolsSoftSnap} from './about/tools-soft-snap.js';
import {installMobileStoryFlow} from './about/mobile-story-flow.js';

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
    const toolsRegion = section.querySelector('#about-tools');
    // Keep the color control out of the way of the mobile tool carousel.
    const toolsVisibility = new IntersectionObserver(entries => {
      section.dataset.toolsInView = entries[0]?.isIntersecting ? 'true' : 'false';
    }, { threshold: .02 });
    if (toolsRegion) toolsVisibility.observe(toolsRegion);

    // The source paragraphs stay accessible and follow natural document
    // flow. Only their mobile entrance opacity/position is animated.
    const chapters = [...section.querySelectorAll('.jw-about-message')];
    const chapterVisibility = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        // A revealed chapter remains readable while scrolling backward.
        // Repeated threshold crossings previously flickered opacity.
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in-view');
        chapterVisibility.unobserve(entry.target);
      });
    }, { threshold: .02, rootMargin: '0px 0px -8% 0px' });
    chapters.forEach(chapter => chapterVisibility.observe(chapter));
    section.classList.add('jw-about-mobile-reveal-ready');
    // The original DOM paragraphs remain both visual and accessible.
    // Both mobile and the wider desktop now share measured two-sided
    // sentences around the ONE persistent GLB head. The source DOM text
    // remains accessible, and reduced-motion readers see native copy.
    const disposeMobileStory = installMobileStoryFlow(section);

    // A finger tap reproduces the existing single-word hover effect.
    // It never prevents native scroll, and a scroll clears the ink.
    let touchedWord = null;
    const clearTouchedWord = () => {
      touchedWord?.classList.remove('is-touched');
      touchedWord = null;
    };
    const onWordTouch = event => {
      if (event.pointerType !== 'touch') return;
      const word = event.target.closest?.('.jw-hover-word');
      if (word === touchedWord) return;
      clearTouchedWord();
      if (word && section.contains(word)) {
        touchedWord = word;
        word.classList.add('is-touched');
      }
    };
    section.addEventListener('pointerdown', onWordTouch, { passive: true });
    window.addEventListener('scroll', clearTouchedWord, { passive: true });
    // On phones, reduced-motion devices, or when WebGL is unavailable,
    // the four readable DOM chapters determine the true About height.
    // The tools panel follows directly after the final visible paragraph.
    const lastChapter = section.querySelector('[data-story="4"]');
    const toolsPanel = section.querySelector('#about-tools');
    const capabilitiesPanel = section.querySelector('#about-capabilities');
    let lastFittedHeight = 0;
    const fitFallbackStory = () => {
      if (section.dataset.storyHeightSource === 'three' || !lastChapter)
        return;
      const top = section.getBoundingClientRect().top;
      const lastLine = lastChapter.getBoundingClientRect().bottom - top;
      const panelHeight = toolsPanel?.getBoundingClientRect().height ||
        window.innerHeight;
      const capabilityHeight = capabilitiesPanel?.getBoundingClientRect().height ||
        window.innerHeight;
      const breathing = Math.max(24, Math.min(30, window.innerHeight * .048));
      const required = Math.ceil(
        lastLine + breathing + capabilityHeight + panelHeight);
      // Do not invalidate the entire page for unchanged ResizeObserver
      // measurements; changes of one pixel are visual no-ops.
      if (Math.abs(required - lastFittedHeight) > 1) {
        lastFittedHeight = required;
        section.style.minHeight = required + 'px';
      }
    };
    fitFallbackStory();
    const chapterObserver = new ResizeObserver(fitFallbackStory);
    if (lastChapter) chapterObserver.observe(lastChapter);
    window.addEventListener('resize', fitFallbackStory, { passive: true });
    document.fonts?.ready.then(() => {
      if (section.isConnected) fitFallbackStory();
    });
    // Softly settle the final tools viewport on scroll rest. Never pin it:
    // a new swipe/wheel/key immediately cancels, and Contact scrolls normally.
    const disposeToolsSnap = installToolsSoftSnap(section, toolsPanel);
    let impactCleanup = 0;
    const clearImpact = () => {
      section.classList.remove('jw-about-impact');
      impactCleanup = 0;
    };
    const impact = event => {
      if (!section.getBoundingClientRect().height) return;
      const center = event.detail || {};
      // Reuse the approved black-ink/purple-shadow recoil on mobile DOM
      // lines. Their separate transform continues to curve around the
      // measured head and is never replaced by this ripple.
      if (window.innerWidth <= 800 &&
          Number.isFinite(center.x) && Number.isFinite(center.y)) {
        for (const word of section.querySelectorAll(
          '.jw-about-message .jw-hover-word')) {
          const rect = word.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
          const distance = Math.hypot(
            (rect.left + rect.right) * .5 - center.x,
            (rect.top + rect.bottom) * .5 - center.y);
          const delay = Math.min(600, distance / 790 * 1000);
          word.style.setProperty('--jw-about-wave-delay',
            delay.toFixed(1) + 'ms');
        }
      }
      if (Number.isFinite(center.x) && Number.isFinite(center.y)) {
        const x = center.x / Math.max(1, window.innerWidth) * 100;
        const y = center.y / Math.max(1, window.innerHeight) * 100;
        section.style.setProperty('--about-impact-x', x + '%');
        section.style.setProperty('--about-impact-y', y + '%');
      }
      section.classList.remove('jw-about-impact');
      void section.offsetWidth;
      section.classList.add('jw-about-impact');
      if (impactCleanup) window.clearTimeout(impactCleanup);
      // The original headline finishes in 900ms. Mobile body lines can
      // begin up to 600ms later, so never clear on the first animationend.
      impactCleanup = window.setTimeout(clearImpact, 1550);
    };
    window.addEventListener('jw-about-impact', impact);
    return () => {
      visibility.disconnect();
      toolsVisibility.disconnect();
      chapterVisibility.disconnect();
      disposeMobileStory();
      clearTouchedWord();
      section.removeEventListener('pointerdown', onWordTouch);
      window.removeEventListener('scroll', clearTouchedWord);
      chapters.forEach(chapter => chapter.classList.remove('is-in-view'));
      delete section.dataset.toolsInView;
      section.classList.remove('jw-about-mobile-reveal-ready');
      chapterObserver.disconnect();
      disposeToolsSnap();
      window.removeEventListener('resize', fitFallbackStory);
      if (impactCleanup) window.clearTimeout(impactCleanup);
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
      data-desktop-flow="bilateral"
      aria-label="About John Wolf — Design Is Life"
    >
      <h2 id="jw-about-heading" className="jw-about-heading">ABOUT</h2>
      <div className="jw-about-statement" aria-label="Design is life">
        <div className="jw-about-type-stack">
          <p className="jw-about-line"><WordHighlight>Now I can’t speak for</WordHighlight></p>
          <p className="jw-about-line"><WordHighlight>everyone... But at least for me,</WordHighlight></p>
          <p className="jw-about-line jw-about-line--last"><WordHighlight>Design is life!</WordHighlight></p>
        </div>
      </div>

      <div className="jw-about-story-messages" aria-label="My story about design">
        <article className="jw-about-message story-message story-left" data-story="1">
          <p><WordHighlight headSplit>So… what is the human nature of design to me?</WordHighlight></p>
          <p><WordHighlight headSplit>Well, it's the creation of the mind's eye, a way to take something intangible like dreams, thoughts, imaginations, ideas, and turn them into things that can literally function in the physical world.</WordHighlight></p>
        </article>
        <article className="jw-about-message story-message story-right" data-story="2">
          <p><WordHighlight headSplit>I was fortunate enough to start early, knowing what makes designs unique and how to communicate that is a practice that can be explained but is better experienced.</WordHighlight></p>
        </article>
        <article className="jw-about-message story-message story-left" data-story="3">
          <p><WordHighlight headSplit>Some people say </WordHighlight><em><WordHighlight headSplit>“art is subjective.”</WordHighlight></em><WordHighlight headSplit> However, I believe there is always a fine line.</WordHighlight></p>
          <p><WordHighlight headSplit>It twists, turns, it bends, and breaks, but somewhere along those lines, we genuinely agree with appealing visuals that intentional lines create.</WordHighlight></p>
        </article>
        <article className="jw-about-message story-message story-right" data-story="4">
          <p><WordHighlight headSplit>What am I good at? </WordHighlight><em><WordHighlight headSplit>Let's see.</WordHighlight></em></p>
          <p><WordHighlight headSplit>Photoshop, Illustrator, Procreate, graphic design, copywriting, visual design, brand identity, logo development, presentations, and recently website development, machine learning, and AI prompt writing. Just to keep it short.</WordHighlight></p>
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
      <AboutCapabilities/>
      <ChoiceOfTools/>
      <div className="jw-about-footer">
        <WordHighlight>JOHN WOLF</WordHighlight> <span aria-hidden="true">·</span> <WordHighlight>DESIGN IS LIFE.</WordHighlight>
      </div>
    </section>
  );
}
