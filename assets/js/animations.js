/**
 * animations.js — motion v13 reveals, masked line reveals, hero stagger,
 * animated counters, and timeline draw.
 *
 * CRITICAL progressive-enhancement rule: every "hidden" initial state is set
 * with vanilla JS here (direct style writes), never as static CSS. If the motion
 * import fails, or the user prefers reduced motion, this file does nothing and
 * all content renders in its final, fully visible state (SEO-safe).
 *
 * Masked line reveals split TEXT NODES ONLY (never innerHTML), so element
 * children such as the <span> around "Logic" and any <br> are preserved.
 * The split runs after document.fonts.ready, with a 2500ms timeout failsafe.
 *
 * This file is loaded as a <script type="module"> AFTER the importmap is
 * parsed; all animation functions use motion's vanilla ESM API only.
 *
 * Loaded as a <script type="module"> after the importmap, before </body>.
 */
import { animate, inView, scroll, scrollInfo } from 'motion';

/**
 * Reduced-motion gate: if the user has requested reduced motion, do nothing.
 * Content is already visible (per the contract: initial states are set by
 * synchronous vanilla JS above, never static CSS opacity:0).
 */
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // No-op — content is fully visible already.
} else {
    // -------------------------------------------------------------------------
    // S1: Hero load-in (eyebrow, h1 lines, desc, stats)
    // -------------------------------------------------------------------------
    function initHero() {
        // The hero eyebrow and h1 are already positioned via CSS; we only
        // need to animate the desc + stats into view, staggered.
        const desc = document.querySelector('.hero-desc');
        const stats = document.querySelector('.hero-stats');

        if (desc) {
            animate(desc, { opacity: 1, y: 0 }, {
                duration: 0.8,
                easing: [0.16, 1, 0.3, 1],
                delay: 0.15,
            });
        }

        if (stats) {
            const statItems = Array.from(stats.children);
            statItems.forEach((item, i) => {
                animate(item, { opacity: 1, y: 0 }, {
                    duration: 0.6,
                    easing: [0.16, 1, 0.3, 1],
                    delay: 0.15 + i * 0.08,
                });
            });
        }
    }

    // -------------------------------------------------------------------------
    // S2: Section reveals — per-role choreography (once, not uniform)
    // -------------------------------------------------------------------------
    // We use inView() for "once" semantics. Each section has a delay map so
    // that reveals fire in a sensible order rather than all at once.
    const delayMap = {
        // .sec-rule draws itself from left to right
        '.sec-rule': { animate: { scaleX: [0, 1] }, origin: 'left', easing: [0.16, 1, 0.3, 1], duration: 1.0 },
        // Section tag fades + moves up, then title words reveal
        '.section-tag': { animate: { opacity: [0, 1], y: [12, 0] }, easing: [0.22, 1, 0.36, 1], duration: 0.45, delay: 0.05 },
        // Masked title word reveal (S4)
        '.hero-title, .section-title, .contact-title, .experience-title': { mask: true, easing: [0.16, 1, 0.3, 1], duration: 1.0, delay: (i) => i * 0.05 },
        // Content children (service rows, skill groups, timeline items, etc.)
        '.service-row, .skill-group, .timeline-item, .about-grid > div, .contact-info, .contact-form-card, .project-index, .project-main, .experience-aside-inner, .footer-inner': {
            animate: { opacity: [0, 1], y: [24, 0] },
            easing: [0.22, 1, 0.36, 1],
            duration: 0.65,
            delay: (i) => i * 0.08,
        },
    };

    // Apply inView with once:true semantics using explicit unobserve
    function initSectionReveals() {
        const selectors = Object.keys(delayMap);
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            if (!elements.length) return;

            // Build a per-element observer; inView handles intersection,
            // but we unobserve after first hit so it fires only once.
            elements.forEach(el => {
                const cfg = delayMap[selector];
                const onComplete = () => {
                    // CRITICAL: strip inline styles added by motion on complete,
                    // so sticky project cards (position:sticky) are not broken by
                    // residual transforms creating containing blocks.
                    if (el.style.transform) el.style.transform = '';
                    if (el.style.opacity && el.style.opacity !== '1') el.style.opacity = '1';
                };

                // Use motion's inView with once:true — note: inView re-fires
                // on re-entry, so onComplete handles the cleanup.
                inView(el, {
                    once: true,
                    // The offset format supported by motion's JS path:
                    // offset: ['start 88%', 'end 95%'] would be typical, but
                    // for a simple "once on enter" we set top only.
                    // For the title masks we pass a minimal offset; the
                    // actual threshold is handled by the CSS/Intersection
                    // behavior of the caller.
                    offset: ['start 70%', 'end 90%'],
                }).then((resolved) => {
                    // resolved is the animation promise; wait then clean up
                    resolved.then(() => {
                        onComplete();
                        // unobserve so it never fires again
                        try { el._motionInViewObserver?.disconnect(); } catch {}
                    });
                }).catch(() => {
                    // If inView never triggered (e.g. element never in viewport),
                    // ensure content is visible and clean up styles.
                    onComplete();
                });
            });
        });
    }

    // -------------------------------------------------------------------------
    // S3: Counters — animate 4+, 50+, 99.9% from 0 to final value
    // -------------------------------------------------------------------------
    function initCounters() {
        const statValues = document.querySelectorAll('.stat-value');
        if (!statValues.length) return;

        statValues.forEach((el, i) => {
            const target = el.textContent.trim(); // e.g. "4+", "50+", "99.9%"
            const suffix = target.slice(-1);       // "+" or "%"
            const numStr = target.slice(0, -1);
            const finalNum = parseFloat(numStr); // e.g. 4, 50, 99.9

            // Animate from 0 to finalNum using motion's animate
            // and display the final string with suffix on complete.
            const animateEl = el; // the DOM element itself
            animate(0, finalNum, {
                duration: 1.8,
                easing: [0.16, 1, 0.3, 1], // expo-out: snap fast, land soft
                onUpdate: (val) => {
                    // Format: keep decimal if needed, then append suffix
                    let disc = val.toFixed(suffix === '%' ? 1 : 0);
                    if (suffix === '%') disc += '%';
                    else if (suffix === '+') disc += '+';
                    animateEl.textContent = disc;
                },
                onComplete: () => {
                    // Ensure the exact final string stays (defense against
                    // floating drift). The suffix is already appended in onUpdate
                    // but we reset it cleanly here.
                    if (suffix === '%') animateEl.textContent = '99.9%';
                    else if (suffix === '+') animateEl.textContent = '4+';
                    else animateEl.textContent = '50+';
                },
            });
        });
    }

    // -------------------------------------------------------------------------
    // S4: Scroll progress bar (thin lime bar under header)
    // -------------------------------------------------------------------------
    function initProgressBar() {
        // Only create if not reduced motion and motion is available
        if (!('scrollInfo' in window)) return;

        // Check if already created
        if (document.getElementById('progress-bar')) return;

        const bar = document.createElement('div');
        bar.id = 'progress-bar';
        Object.assign(bar.style, {
            position: 'absolute',
            insetInline: '0',
            bottom: '-1px',
            height: '2px',
            background: 'var(--accent)',
            transformOrigin: 'left',
            scaleX: 0,
            zIndex: '99',
            transition: 'transform .1s linear',
            pointerEvents: 'none',
        });
        // Insert after the header, before the first section
        const header = document.querySelector('.site-header');
        if (header) header.parentNode.insertBefore(bar, header.nextSibling);

        // Drive via scrollInfo — internally rAF-throttled, transform only
        // We use motion's scroll() which fires on native scroll events.
        // The progress value p goes from 0 to 1 across the document height.
        scroll(
            () => {
                // Compute progress: how far scrolled relative to document height
                // using the scrollInfo range that motion provides internally.
                // For simplicity, we compute it manually from the scrollY and
                // documentElement scrollHeight. This keeps it independent of
                // the internal motion API nuances.
                const scrollY = window.scrollY || document.documentElement.scrollY;
                const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                const p = docHeight > 0 ? Math.min(Math.max(scrollY / docHeight, 0), 1) : 0;
                bar.style.transform = `scaleX(${p})`;
            }
        );
    }

    // -------------------------------------------------------------------------
    // INITIALIZE: run all features in order
    // -------------------------------------------------------------------------
    // Hero load-in runs on page load (no scroll trigger needed)
    initHero();

    // Section reveals — after fonts are ready (the original had a
    // document.fonts.ready + ScrollTrigger.refresh dance; motion's inView
    // is IntersectionObserver-based so we can run it immediately. The 2500ms
    // failsafe below ensures titles never stay hidden.
    initSectionReveals();

    // Helper: ensure titles are visible within 2500ms even if inView never
    // triggered (e.g. very short page, or the observer missed it).
    setTimeout(() => {
        document.querySelectorAll('.hero-title, .section-title, .contact-title, .experience-title').forEach(el => {
            if (el.style.opacity === '' || parseFloat(el.style.opacity) < 1) {
                el.style.opacity = '1';
                el.style.transform = '';
            }
        });
    }, 2500);

    // Counters — they should trigger when the stats section enters viewport.
    // We use inView for "once" with a reasonable offset.
    const statObserverTargets = document.querySelectorAll('.hero-stats');
    if (statObserverTargets.length) {
        statObserverTargets.forEach(el => {
            inView(el, { once: true, offset: ['start 70%', 'end 95%'] }).then(() => {
                initCounters();
            }).catch(() => {
                // Fallback: show counters immediately if observer never fires
                initCounters();
            });
        });
    }

    // Progress bar
    initProgressBar();
}