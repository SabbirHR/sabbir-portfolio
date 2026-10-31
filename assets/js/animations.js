/**
 * animations.js — GSAP + ScrollTrigger reveals, masked line reveals, hero
 * stagger, animated counters, and timeline draw.
 *
 * CRITICAL progressive-enhancement rule: every "hidden" initial state is set
 * with gsap.set() here, never as static CSS. If GSAP or the CDN fails, or the
 * user prefers reduced motion, this file does nothing and all content renders
 * in its final, fully visible state (SEO-safe).
 *
 * Masked line reveals split TEXT NODES ONLY (never innerHTML), so element
 * children such as the <span> around "Logic" and any <br> are preserved.
 * The split runs after document.fonts.ready (then ScrollTrigger.refresh()),
 * with a timeout failsafe so the titles can never stay hidden.
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
    initMaskedReveals();
}

/* --------------------------------------------------------------------------
 * Hero: staggered load-in (the h1 is handled by the masked reveal instead)
 * -------------------------------------------------------------------------- */
function initHero() {
    const items = gsap.utils.toArray(
        '#home .section-tag, #home .hero-desc, #home .stat-card'
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
        clearProps: 'opacity,transform',
    });
}

/* --------------------------------------------------------------------------
 * Section reveals: fade-up with stagger on scroll.
 * Titles are excluded — they get the masked line reveal below (a transform on
 * the same element would fight the word split). Sticky project cards are
 * represented by their children only: a transformed .projects-grid or
 * .project-card would break position:sticky.
 * -------------------------------------------------------------------------- */
function initSectionReveals() {
    const revealSelectors = [
        '.section-tag',
        '.skill-group',
        '.service-row',
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
            clearProps: 'opacity,transform',
            scrollTrigger: {
                trigger: section,
                start: 'top 78%',
                once: true,
            },
        });
    });
}

/* --------------------------------------------------------------------------
 * Masked line reveals: hero h1 + section titles only.
 * -------------------------------------------------------------------------- */
function initMaskedReveals() {
    const targets = gsap.utils.toArray(
        '.hero-title, .section-title, .experience-title, .contact-title'
    );
    if (!targets.length) return;

    // Hidden state via gsap.set (never static CSS) — a no-JS/failed-GSAP page
    // never executes this branch, so content always stays visible.
    gsap.set(targets, { opacity: 0 });

    let done = false;
    function reveal() {
        if (done) return;
        done = true;

        try {
            targets.forEach(splitTextNodes);
            ScrollTrigger.refresh();
        } catch (err) {
            console.warn('animations: masked reveal setup failed; showing titles plainly.', err);
            showPlain();
            return;
        }

        try {
            targets.forEach((el) => {
                const words = el.querySelectorAll('.w > i');
                const isHero = el.classList.contains('hero-title');
                const delay = isHero ? 0.25 : 0;

                if (!words.length) {
                    gsap.set(el, { opacity: 1 });
                    return;
                }

                gsap.set(words, { yPercent: 110 });

                gsap.to(el, {
                    opacity: 1,
                    duration: 0.5,
                    ease: 'power2.out',
                    delay,
                    clearProps: 'opacity',
                });

                gsap.to(words, {
                    yPercent: 0,
                    duration: 1,
                    ease: 'power4.out',
                    stagger: 0.05,
                    delay,
                    clearProps: 'transform', // failsafe: no residual transforms
                    scrollTrigger: isHero
                        ? undefined
                        : { trigger: el, start: 'top 88%', once: true },
                });
            });
        } catch (err) {
            console.warn('animations: masked reveal tween failed; showing titles plainly.', err);
            showPlain();
        }
    }

    /** Last-resort failsafe: every title fully visible, no transforms left. */
    function showPlain() {
        targets.forEach((el) => {
            gsap.set(el, { opacity: 1 });
            const words = el.querySelectorAll('.w > i');
            if (words.length) gsap.set(words, { yPercent: 0, clearProps: 'transform' });
        });
    }

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(reveal).catch(reveal);
        // Failsafe: never leave a title stuck at opacity 0.
        window.setTimeout(reveal, 2500);
    } else {
        reveal();
    }
}

/**
 * Wrap every word of every TEXT NODE in <span class="w"><i>word</i></span>.
 * Element children (<span>, <br>, comments) are untouched — only text node
 * values are split, and whitespace between nodes is preserved verbatim.
 *
 * Args:
 *     el: The heading element to split (idempotent).
 */
function splitTextNodes(el) {
    if (!el || el.dataset.split === 'true') return;

    const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (label) el.setAttribute('aria-label', label);

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    textNodes.forEach((textNode) => {
        const text = textNode.nodeValue;
        if (!text || !text.trim()) return; // keep pure whitespace as-is

        const frag = document.createDocumentFragment();
        text.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
                frag.appendChild(document.createTextNode(part));
                return;
            }
            const w = document.createElement('span');
            w.className = 'w';
            w.setAttribute('aria-hidden', 'true');
            const i = document.createElement('i');
            i.textContent = part; // never innerHTML
            w.appendChild(i);
            frag.appendChild(w);
        });
        textNode.parentNode.replaceChild(frag, textNode);
    });

    el.dataset.split = 'true';
}

/* --------------------------------------------------------------------------
 * Animated counters: 4+, 50+, 99.9% — suffixes stay in the DOM.
 * .stat-value is never split into words (counters rewrite textContent).
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
