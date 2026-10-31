/**
 * animations.js — GSAP + ScrollTrigger reveals, hero stagger, animated
 * counters, and timeline draw.
 *
 * CRITICAL progressive-enhancement rule: every "hidden" initial state is set
 * with gsap.set() here, never as static CSS. If GSAP or the CDN fails, or the
 * user prefers reduced motion, this file does nothing and all content renders
 * in its final, fully visible state (SEO-safe).
 *
 * Loaded as a classic-script dependency (window.gsap / window.ScrollTrigger)
 * before this module runs.
 */
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Bail out entirely if GSAP is unavailable or the user prefers reduced motion.
if (!gsap || !ScrollTrigger || prefersReducedMotion()) {
    // Nothing to do — content is already visible.
} else {
    gsap.registerPlugin(ScrollTrigger);
    initHero();
    initSectionReveals();
    initCounters();
    initTimelineDraw();
}

/* --------------------------------------------------------------------------
 * Hero: staggered load-in
 * -------------------------------------------------------------------------- */
function initHero() {
    const items = gsap.utils.toArray(
        '#home .section-tag, #home .hero-title, #home .hero-desc, #home .stat-card'
    );
    if (!items.length) return;
    gsap.set(items, { opacity: 0, y: 24 });
    gsap.to(items, {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.12,
        delay: 0.15,
    });
}

/* --------------------------------------------------------------------------
 * Section reveals: fade-up with stagger on scroll
 * -------------------------------------------------------------------------- */
function initSectionReveals() {
    const revealSelectors = [
        '.section-tag',
        '.section-title',
        '.skill-group',
        '.service-row',
        // Project cards are position:sticky — animate their children only,
        // never the card or .projects-grid (a transformed ancestor breaks sticky).
        '.project-index',
        '.project-main',
        '.timeline-item',
        '.about-grid > div',
        '.contact-info',
        '.contact-form-card',
        '.experience-aside-inner',
        '.footer-inner',
    ];

    gsap.utils.toArray('section, footer').forEach((section) => {
        if (section.id === 'home') return; // hero handled on load
        const items = [];
        revealSelectors.forEach((sel) => {
            section.querySelectorAll(sel).forEach((el) => items.push(el));
        });
        if (!items.length) return;
        gsap.set(items, { opacity: 0, y: 30 });
        gsap.to(items, {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: 'power2.out',
            stagger: 0.1,
            scrollTrigger: {
                trigger: section,
                start: 'top 78%',
                once: true,
            },
        });
    });
}

/* --------------------------------------------------------------------------
 * Animated counters: 4+, 50+, 99.9% — suffixes stay in the DOM
 * -------------------------------------------------------------------------- */
function initCounters() {
    gsap.utils.toArray('.stat-value').forEach((el) => {
        const raw = el.textContent.trim();
        const match = raw.match(/^([\d.]+)(.*)$/);
        if (!match) return;
        const target = parseFloat(match[1]);
        const suffix = match[2]; // "+" or "%" etc.
        const decimals = (match[1].split('.')[1] || '').length;

        const obj = { val: 0 };
        el.textContent = (0).toFixed(decimals) + suffix;

        ScrollTrigger.create({
            trigger: el,
            start: 'top 90%',
            once: true,
            onEnter: () => {
                gsap.to(obj, {
                    val: target,
                    duration: 1.6,
                    ease: 'power2.out',
                    onUpdate: () => {
                        el.textContent = obj.val.toFixed(decimals) + suffix;
                    },
                    onComplete: () => {
                        el.textContent = target.toFixed(decimals) + suffix;
                    },
                });
            },
        });
    });
}

/* --------------------------------------------------------------------------
 * Timeline line: scaleY draw on scroll (scrubbed)
 * -------------------------------------------------------------------------- */
function initTimelineDraw() {
    gsap.utils.toArray('.timeline-line').forEach((line) => {
        gsap.set(line, { scaleY: 0, transformOrigin: 'top center' });
        gsap.to(line, {
            scaleY: 1,
            ease: 'none',
            scrollTrigger: {
                trigger: line.parentElement,
                start: 'top 70%',
                end: 'bottom 60%',
                scrub: true,
            },
        });
    });
}
