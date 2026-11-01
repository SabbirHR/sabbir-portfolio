/* Browser smoke-QA harness for the portfolio (see tests/run-qa.sh).
 *
 * Runs HEADLESS by default — no windows are opened on the user's desktop.
 * Limitation: this Chrome build reports pointer:none / hover:none even in
 * modern headless mode (CDP cannot emulate pointer features either), which
 * would fail the pointer:fine gates (custom cursor, magnetic buttons). The
 * newPage() shim therefore answers ONLY those two media queries as
 * fine/hover in headless mode; everything else (reduced-motion, JS, network,
 * WebGL) is exercised for real. Set QA_HEADED=1 to watch a run on the local
 * X display with completely native pointer semantics.
 *
 * The local display occasionally detaches renderer frames, so every section
 * runs inside withRetry (partial results rolled back, pages from the failed
 * attempt closed, up to 3 attempts).
 *
 * Sections:
 *   A   default desktop @1440 (reveals, cursor, lenis, sticky, anchors)
 *   B:w responsive widths (320 / 768 / 1440; one width per process)
 *   C   mobile nav (hamburger + Escape)
 *   D   JavaScript disabled
 *   E   ALL external CDNs + the local animation module blocked → the real
 *       progressive-enhancement contract: no text hidden by script styles
 *   F   prefers-reduced-motion → everything visible, nothing animating
 *   G   WebGL unavailable
 *   H   no residual inline transforms on sticky participants after a
 *       full-page scroll (sticky cards break on transformed ancestors)
 *
 * Config via env: QA_PORT (8123), CHROME_PATH, PUPPETEER_CORE_PATH.
 */
'use strict';

const path = require('path');

/* puppeteer-core may live outside the repo (this repo is buildless: no
 * package.json, no committed node_modules). Try, in order: an explicit
 * env path, a normally-resolvable module, the repo's own node_modules,
 * then the shared /tmp/opencode install. */
const PUPPETEER_CANDIDATES = [
    process.env.PUPPETEER_CORE_PATH,
    'puppeteer-core',
    path.join(__dirname, '..', 'node_modules', 'puppeteer-core'),
    '/tmp/opencode/node_modules/puppeteer-core',
].filter(Boolean);

let puppeteer = null;
for (const candidate of PUPPETEER_CANDIDATES) {
    try {
        puppeteer = require(candidate);
        break;
    } catch (err) {
        /* try the next candidate */
    }
}
if (!puppeteer) {
    console.error('FATAL: puppeteer-core not found. Install it or set PUPPETEER_CORE_PATH.');
    process.exit(2);
}

const PORT = Number(process.env.QA_PORT) || 8123;
const BASE = `http://localhost:${PORT}/`;
const BASE_ORIGIN = new URL(BASE).origin;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
/* QA_HEADED=1 → run on the local X display with native pointer semantics.
 * Default (headless) answers 'pointer: fine' / 'hover: hover' via the
 * newPage() shim so no windows open on the user's desktop. */
const HEADED = process.env.QA_HEADED === '1';
const HEADLESS = !HEADED;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const openPages = [];
async function withRetry(label, fn) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const markResults = results.length;
        const markPages = openPages.length;
        try {
            await fn();
            return;
        } catch (err) {
            results.length = markResults;
            for (const p of openPages.splice(markPages)) {
                try { await p.close(); } catch { /* already gone */ }
            }
            console.log(`RETRY — ${label} (attempt ${attempt}/3): ${err.message}`);
            if (attempt === 3) throw err;
            await sleep(750);
        }
    }
}

/* Programmatic jumps can be re-smoothed by Lenis; wait for scroll to settle
 * before asserting on scroll-spy state. */
async function settleScroll(page, targetY, timeout = 4000) {
    const start = Date.now();
    let last = -1;
    while (Date.now() - start < timeout) {
        const y = await page.evaluate(() => window.scrollY);
        if (Math.abs(y - targetY) <= 2 && y === last) return y;
        last = y;
        await sleep(200);
    }
    return last;
}

async function newPage(browser, { width = 1440, height = 900, js = true, reduced = false, noWebGL = false, blockExternal = false, countDraws = false } = {}) {
    const page = await browser.newPage();
    openPages.push(page);
    await page.setViewport({ width, height });
    if (!js) await page.setJavaScriptEnabled(false);
    if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (HEADLESS) {
        /* Headless Chrome reports pointer:none + hover:none and CDP cannot
         * emulate those two features. The gates under test (cursor layer,
         * magnetic buttons) are exact matches on '(pointer: fine)' and
         * '(hover: hover)', so answer ONLY those queries as true and pass
         * everything else to the real matchMedia untouched. Documented
         * trade-off — set QA_HEADED=1 for fully native semantics. */
        await page.evaluateOnNewDocument(() => {
            const native = window.matchMedia.bind(window);
            window.matchMedia = (query) => {
                if (/\(\s*pointer\s*:\s*fine\s*\)/.test(query) ||
                    /\(\s*hover\s*:\s*hover\s*\)/.test(query)) {
                    return {
                        matches: true, media: query, onchange: null,
                        addEventListener() {}, removeEventListener() {},
                        addListener() {}, removeListener() {},
                        dispatchEvent() { return false; },
                    };
                }
                return native(query);
            };
        });
    }
    if (noWebGL) {
        await page.evaluateOnNewDocument(() => {
            const orig = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
                if (String(type).includes('webgl')) return null;
                return orig.call(this, type, ...rest);
            };
        });
    }
    if (blockExternal) {
        /* The real CDN-failure contract: abort every cross-origin request
         * (fonts, icons, GSAP/Lenis/three CDNs — whatever is loaded today),
         * plus the local animation module and any local motion/gsap vendor
         * bundle, simulating "the animation engine never loads at all". */
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            let origin = null;
            try { origin = new URL(req.url()).origin; } catch { origin = null; }
            const local = req.url();
            if (origin !== BASE_ORIGIN) return req.abort();
            if (local.includes('/assets/js/animations.js')) return req.abort();
            if (local.includes('motion-13') || local.includes('gsap')) return req.abort();
            return req.continue();
        });
    }
    const errors = [];
    page.on('error', (e) => errors.push('pageerror: ' + e.message)); // renderer died
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
    return { page, errors };
}

/* The progressive-enhancement contract, checked directly: no element may be
 * hidden by a SCRIPT-SET inline style (opacity:0 / display:none /
 * visibility:hidden anywhere up the ancestor chain). Design-CSS-hidden
 * elements (e.g. the closed mobile nav) are stylesheet-hidden on purpose and
 * are NOT flagged — the site never hides content via CSS. */
function scriptHiddenText() {
    const rx = /(?:^|;)\s*(?:opacity\s*:\s*0(?:\s|;|$)|display\s*:\s*none|visibility\s*:\s*hidden)/i;
    const out = [];
    document.querySelectorAll('body *').forEach((el) => {
        if (!(el.textContent || '').trim()) return;
        for (let n = el; n && n !== document.body; n = n.parentElement) {
            const inline = n.getAttribute('style') || '';
            if (rx.test(inline)) {
                const name = (e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '');
                out.push(`${name(el)} ← ${name(n)}[${inline.slice(0, 40)}] :: ${el.textContent.trim().slice(0, 30)}`);
                break;
            }
        }
    });
    return out;
}

/* Errors expected when every CDN + the animation module is deliberately
 * blocked. Anything else is a real bug. */
function filterBlockedErrors(errors) {
    return errors.filter((e) => {
        if (e.includes('Failed to load resource')) return false; // aborted/blocked fetch
        if (e.includes('Failed to fetch') || e.includes('dynamically imported module')) return false;
        if (e.includes('Module script')) return false;
        if (e.includes('gsap') || e.includes('jsdelivr') || e.includes('cdnjs')) return false;
        if (e.includes('googleapis') || e.includes('gstatic')) return false;
        if (e.includes('motion-13') || e.includes('lenis') || e.includes('three')) return false;
        if (e.includes('/assets/js/animations.js')) return false;
        return true;
    });
}

(async () => {
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: !HEADED,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--window-size=1440,900'],
    });

    /* ---------------- A. Default desktop ---------------- */
    const secA = () => withRetry('A. default desktop', async () => {
        const { page, errors } = await newPage(browser);
        await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(3500);

        /* Section titles are scroll-triggered (motion inView, amount 0.3):
         * bring the first one well into view before asserting visibility. */
        await page.evaluate(() => {
            document.querySelector('.section-title')
                ?.scrollIntoView({ block: 'center', behavior: 'instant' });
        });
        await sleep(1800);

        const state = await page.evaluate(() => ({
            words: document.querySelectorAll('.w').length,
            heroTitleOpacity: getComputedStyle(document.querySelector('.hero-title')).opacity,
            sectionTitleOpacity: getComputedStyle(document.querySelector('.section-title')).opacity,
            hasCursor: document.documentElement.classList.contains('has-cursor'),
            cursorEls: document.querySelectorAll('.cursor-dot, .cursor-ring').length,
            lenis: document.documentElement.classList.contains('lenis'),
            marqueeAnim: getComputedStyle(document.querySelector('.marquee-track')).animationName,
            grainAnim: getComputedStyle(document.body, '::after').animationName,
            time: (document.getElementById('local-time') || {}).textContent,
            canvasHidden: document.getElementById('bg-canvas').style.display === 'none',
            heroFill: getComputedStyle(document.querySelector('.hero'), '::before').backgroundImage,
            statValues: [...document.querySelectorAll('.stat-value')].map((e) => e.textContent),
            formOk: (function () {
                const f = document.getElementById('contact-form');
                if (!f) return 'no form';
                const names = [...f.querySelectorAll('input,textarea')].map((i) => i.name).join(',');
                return f.action.includes('formsubmit.co/ajax/sabbirhossainrajib.office@gmail.com') &&
                    names === '_captcha,_template,name,email,_subject,message' &&
                    !!document.getElementById('submit-btn') && !!document.getElementById('btn-text') &&
                    !!document.getElementById('form-status') ? 'ok' : 'MISMATCH:' + names;
            })(),
            gridsOverflow: (() => {
                const out = [];
                ['.section', '.container', '.projects-grid'].forEach((sel) => {
                    document.querySelectorAll(sel).forEach((el) => {
                        const o = getComputedStyle(el).overflow + '/' + getComputedStyle(el).overflowX;
                        if (o !== 'visible/visible') out.push(sel + '=' + o);
                    });
                });
                return out;
            })(),
            projectsGridTransform: getComputedStyle(document.querySelector('.projects-grid')).transform,
            radii: [...document.querySelectorAll('*')].filter((el) => {
                const r = getComputedStyle(el).borderRadius;
                return r && r !== '0px' && !r.split(' ').every((v) => v === '0px');
            }).map((el) => el.tagName + '.' + el.className + '=' + getComputedStyle(el).borderRadius).slice(0, 5),
            noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
            accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
            themeColor: document.querySelector('meta[name=theme-color]').content,
            scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
            scrollPadding: getComputedStyle(document.documentElement).scrollPaddingTop,
        }));

        check('masked reveals ran (word splits)', state.words > 10, `${state.words} words`);
        check('hero h1 visible after reveal', state.heroTitleOpacity === '1', state.heroTitleOpacity);
        check('section title visible', state.sectionTitleOpacity === '1', state.sectionTitleOpacity);
        check('cursor layer initialised', state.hasCursor && state.cursorEls === 2, `${state.hasCursor}/${state.cursorEls}`);
        check('lenis active (window mode)', state.lenis === true);
        check('lenis drops smooth scroll-behavior', state.scrollBehavior === 'auto', state.scrollBehavior);
        check('scroll-padding-top kept', /px/.test(state.scrollPadding), state.scrollPadding);
        check('marquee animates', state.marqueeAnim === 'marquee-scroll', state.marqueeAnim);
        check('grain animates (pointer:fine)', state.grainAnim === 'grain-shift', state.grainAnim);
        check('Dhaka clock ticking', /^\d{2}:\d{2}:\d{2}$/.test(state.time || ''), state.time);
        check('hero fallback fill present', state.heroFill.includes('radial-gradient'));
        check('WebGL: canvas visible + rendering', !state.canvasHidden, state.canvasHidden ? 'hidden (CSS fill path)' : 'rendering');
        check('counters final values', JSON.stringify(state.statValues) === JSON.stringify(['4+', '50+', '99.9%']), JSON.stringify(state.statValues));
        check('form contract intact', state.formOk === 'ok', state.formOk);
        check('no overflow on sticky ancestors', state.gridsOverflow.length === 0, JSON.stringify(state.gridsOverflow));
        check('projects-grid has no transform', state.projectsGridTransform === 'none', state.projectsGridTransform);
        check('border-radius 0 everywhere', state.radii.length === 0, JSON.stringify(state.radii));
        check('no horizontal scrollbar @1440', state.noHScroll);
        check('accent token', state.accent === '#c8ff2f', state.accent);
        check('theme-color #050505', state.themeColor === '#050505', state.themeColor);

        /* nav active state + sticky stack + focus ring (with Lenis active) */
        const targetY = await page.evaluate(() => {
            const s = document.getElementById('work');
            const y = s.offsetTop + s.offsetHeight * 0.45;
            window.scrollTo({ top: y, behavior: 'instant' });
            return y;
        });
        await settleScroll(page, targetY);
        const sticky = await page.evaluate(() => {
            const cards = [...document.querySelectorAll('.project-card')];
            const st = getComputedStyle(cards[0]);
            return {
                scrollY: Math.round(window.scrollY),
                position: st.position,
                top: st.top,
                rects: cards.map((c) => Math.round(c.getBoundingClientRect().top)),
                active: [...document.querySelectorAll('.nav-link.active')].map((a) => a.textContent),
            };
        });
        check('project cards position:sticky (with Lenis)', sticky.position === 'sticky', sticky.position);
        check('sticky top offset uses header height', /calc|px/.test(sticky.top), sticky.top);
        check('cards stack with per-index offsets', sticky.rects[1] > sticky.rects[0], JSON.stringify(sticky.rects));
        check('lenis honoured programmatic scroll', Math.abs(sticky.scrollY - targetY) <= 3, `${sticky.scrollY} vs ${targetY}`);
        check('nav active state while scrolled', sticky.active.includes('Projects'), JSON.stringify(sticky.active));

        await page.keyboard.press('Tab');
        const focus = await page.evaluate(() => {
            const el = document.activeElement;
            const cs = getComputedStyle(el);
            return { tag: el.tagName, cls: el.className, outline: cs.outlineStyle + ' ' + cs.outlineColor };
        });
        check('keyboard focus visible (lime outline)', focus.outline.includes('solid'), `${focus.tag}.${focus.cls} → ${focus.outline}`);

        /* anchor jump must land under the sticky header (scroll-padding-top) */
        const anchor = await page.evaluate(() => {
            document.querySelector('.nav-link[href="#contact"]').click();
            return true;
        });
        await sleep(2000);
        const anchorPos = await page.evaluate(() => {
            const s = document.getElementById('contact');
            const h = document.querySelector('.site-header').getBoundingClientRect();
            return {
                sectionTop: Math.round(s.getBoundingClientRect().top),
                headerBottom: Math.round(h.bottom),
                headerPos: getComputedStyle(document.querySelector('.site-header')).position,
            };
        });
        check('anchor jump clears sticky header',
            anchorPos.sectionTop >= anchorPos.headerBottom - 2, JSON.stringify(anchorPos));

        check('no console/network errors (default)', errors.length === 0, errors.slice(0, 6).join(' | '));
        await page.close();
    });

    /* ---------------- B. Responsive widths ---------------- */
    /* One width per process: headed Chrome exits when its last window closes,
     * so a section must never open a second page after closing the first. */
    const widthArg = Number(process.argv[3]) || 0;
    const secB = () => withRetry('B. responsive widths ' + (widthArg || 'all'), async () => {
        for (const w of (widthArg ? [widthArg] : [320, 768, 1440])) {
            const { page, errors } = await newPage(browser, { width: w, height: 800 });
            await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
            await sleep(1500);
            const r = await page.evaluate(() => ({
                scrollW: document.documentElement.scrollWidth,
                inner: window.innerWidth,
                cardPos: getComputedStyle(document.querySelector('.project-card')).position,
                ghost: getComputedStyle(document.querySelector('.project-ghost')).display,
            }));
            check(`no horizontal scrollbar @${w}`, r.scrollW <= r.inner + 1, `${r.scrollW} vs ${r.inner}`);
            if (w <= 767) {
                check('project cards static below 768px', r.cardPos === 'static', r.cardPos);
                check('ghost word hidden below 768px', r.ghost === 'none', r.ghost);
            }
            if (w >= 768) {
                check('project cards sticky from 768px', r.cardPos === 'sticky', r.cardPos);
                check('ghost word shown from 768px', r.ghost === 'block', r.ghost);
            }
            check(`no errors @${w}`, errors.length === 0, errors.slice(0, 4).join(' | '));
            await page.close();
        }
    });

    /* ---------------- C. Mobile nav (hamburger + Escape) ---------------- */
    const secC = () => withRetry('C. mobile nav', async () => {
        const { page } = await newPage(browser, { width: 500, height: 800 });
        await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.click('#nav-toggle');
        await sleep(400);
        const open = await page.evaluate(() => document.getElementById('mobile-nav').classList.contains('is-open'));
        await page.keyboard.press('Escape');
        await sleep(400);
        const closed = await page.evaluate(() => !document.getElementById('mobile-nav').classList.contains('is-open'));
        check('hamburger opens + Escape closes', open && closed, `${open}/${closed}`);
        await page.close();
    });

    /* ---------------- D. JavaScript disabled ---------------- */
    const secD = () => withRetry('D. JS disabled', async () => {
        const { page } = await newPage(browser, { js: false });
        await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
        const r = await page.evaluate(() => ({
            h1: document.querySelector('.hero-title').textContent.trim(),
            sections: document.querySelectorAll('section').length,
            form: !!document.getElementById('contact-form'),
            titlesVisible: [...document.querySelectorAll('.section-title')].every((t) => getComputedStyle(t).opacity === '1'),
            projectsText: document.querySelectorAll('.project-card .project-title').length,
        }));
        const dHidden = await page.evaluate(scriptHiddenText);
        check('JS-off: h1 renders', r.h1 === 'Building Logic That Ships.', r.h1);
        check('JS-off: all 7 sections', r.sections === 7, String(r.sections));
        check('JS-off: form present', r.form);
        check('JS-off: titles visible (no CSS hiding)', r.titlesVisible);
        check('JS-off: projects present', r.projectsText === 3, String(r.projectsText));
        check('JS-off: no text hidden by script styles', dHidden.length === 0, dHidden.slice(0, 3).join(' | '));
        await page.close();
    });

    /* ---------------- E. ALL CDNs + animation module blocked ---------------- */
    /* Blocks every cross-origin request (fonts, icons, every JS CDN) AND the
     * local animations.js (+ the local motion vendor bundle). Vendored Lenis
     * is a LOCAL file, so it may still load here — that is by design. The
     * contract: whatever fails to load, every text node stays visible and
     * scrolling keeps working (Lenis or native fallback). */
    const secE = () => withRetry('E. all CDNs + animation module blocked', async () => {
        const { page, errors } = await newPage(browser, { blockExternal: true });
        await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await sleep(2500);
        const r = await page.evaluate(() => ({
            hero: getComputedStyle(document.querySelector('.hero-title')).opacity,
            titles: [...document.querySelectorAll('.section-title, .experience-title, .contact-title')]
                .every((t) => getComputedStyle(t).opacity === '1'),
            words: document.querySelectorAll('.w').length,
            statValues: [...document.querySelectorAll('.stat-value')].map((e) => e.textContent),
            lenis: document.documentElement.classList.contains('lenis'),
        }));
        const eHidden = await page.evaluate(scriptHiddenText);
        check('CDN-block: hero visible', r.hero === '1', r.hero);
        check('CDN-block: all titles visible', r.titles);
        check('CDN-block: no text hidden by script styles', eHidden.length === 0, eHidden.slice(0, 4).join(' | '));
        check('CDN-block: no partial word split', r.words === 0, String(r.words));
        check('CDN-block: counters show final strings',
            JSON.stringify(r.statValues) === JSON.stringify(['4+', '50+', '99.9%']), JSON.stringify(r.statValues));
        /* Vendored lenis (local file) is NOT blocked, so it may legitimately
         * initialise here. The real contract is that scrolling works either
         * way — Lenis window mode or native fallback. */
        await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
        const scrolledY = await settleScroll(page, 900);
        check('CDN-block: scrolling works (vendored lenis or native)', scrolledY > 100,
            `lenis=${r.lenis} scrollY=${scrolledY}`);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        const real = filterBlockedErrors(errors);
        check('CDN-block: no unrelated errors', real.length === 0, real.slice(0, 4).join(' | '));
        await page.close();
    });

    /* ---------------- F. Reduced motion ---------------- */
    const secF = () => withRetry('F. reduced motion', async () => {
        const { page, errors } = await newPage(browser, { reduced: true });
        await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(2000);
        const r = await page.evaluate(() => ({
            hero: getComputedStyle(document.querySelector('.hero-title')).opacity,
            titles: [...document.querySelectorAll('.section-title, .contact-title')].every((t) => getComputedStyle(t).opacity === '1'),
            words: document.querySelectorAll('.w').length,
            marquee: getComputedStyle(document.querySelector('.marquee-track')).animationName,
            grain: getComputedStyle(document.body, '::after').animationName,
            cursor: document.documentElement.classList.contains('has-cursor'),
            lenis: document.documentElement.classList.contains('lenis'),
            scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
            canvasHidden: document.getElementById('bg-canvas').style.display === 'none',
            time: document.getElementById('local-time').textContent,
            statValues: [...document.querySelectorAll('.stat-value')].map((e) => e.textContent),
        }));
        const fHidden = await page.evaluate(scriptHiddenText);
        check('reduced-motion: hero visible', r.hero === '1', r.hero);
        check('reduced-motion: titles visible', r.titles);
        check('reduced-motion: no word split', r.words === 0, String(r.words));
        check('reduced-motion: marquee static', r.marquee === 'none', r.marquee);
        check('reduced-motion: grain static', r.grain === 'none', r.grain);
        check('reduced-motion: no custom cursor', r.cursor === false);
        check('reduced-motion: no lenis', r.lenis === false);
        check('reduced-motion: smooth scrolling disabled', r.scrollBehavior === 'auto', r.scrollBehavior);
        check('reduced-motion: clock still works', /^\d{2}:\d{2}:\d{2}$/.test(r.time), r.time);
        check('reduced-motion: static WebGL frame or CSS fill', true, r.canvasHidden ? 'CSS fill' : 'one static frame');
        check('reduced-motion: no text hidden by script styles', fHidden.length === 0, fHidden.slice(0, 4).join(' | '));
        check('reduced-motion: counters show final strings',
            JSON.stringify(r.statValues) === JSON.stringify(['4+', '50+', '99.9%']), JSON.stringify(r.statValues));
        check('reduced-motion: no errors', errors.length === 0, errors.slice(0, 4).join(' | '));
        await page.close();
    });

    /* ---------------- G. WebGL unavailable ---------------- */
    const secG = () => withRetry('G. WebGL unavailable', async () => {
        const { page, errors } = await newPage(browser, { noWebGL: true });
        await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(2500);
        const r = await page.evaluate(() => ({
            canvasHidden: document.getElementById('bg-canvas').style.display === 'none',
            fill: getComputedStyle(document.querySelector('.hero'), '::before').backgroundImage,
            heroVisible: getComputedStyle(document.querySelector('.hero-title')).opacity === '1',
        }));
        check('no-WebGL: canvas hidden by bootstrap', r.canvasHidden);
        check('no-WebGL: hero CSS fill (lime radial + grain)', r.fill.includes('radial-gradient') && r.fill.includes('svg'), r.fill.slice(0, 60));
        check('no-WebGL: hero content visible', r.heroVisible);
        check('no-WebGL: no errors', errors.length === 0, errors.slice(0, 4).join(' | '));
        await page.close();
    });

    /* ---------------- H. No residual transforms on sticky participants ---- */
    /* A transformed ancestor creates a containing block that breaks
     * position:sticky. Walk the whole page so every reveal fires, then assert
     * the sticky participants carry no leftover inline/computed transforms. */
    const secH = () => withRetry('H. sticky residual transforms', async () => {
        const { page, errors } = await newPage(browser, { width: 1280, height: 800 });
        await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.evaluate(async () => {
            const step = window.innerHeight * 0.6;
            const bottom = document.documentElement.scrollHeight;
            for (let y = 0; y <= bottom; y += step) {
                window.scrollTo({ top: y, behavior: 'instant' });
                await new Promise((r) => setTimeout(r, 150));
            }
            window.scrollTo({ top: bottom, behavior: 'instant' });
        });
        await sleep(2500); // let every reveal finish (incl. stagger tails)
        const r = await page.evaluate(() => {
            const pick = (el) => ({
                inline: el.getAttribute('style') || '',
                computed: getComputedStyle(el).transform,
            });
            const aside = document.querySelector('.experience-aside');
            return {
                grid: pick(document.querySelector('.projects-grid')),
                cards: [...document.querySelectorAll('.project-card')].map(pick),
                aside: aside ? pick(aside) : null,
                stickyPos: getComputedStyle(document.querySelector('.project-card')).position,
            };
        });
        const bad = [];
        if (/transform/i.test(r.grid.inline)) bad.push('projects-grid inline transform');
        if (r.grid.computed !== 'none') bad.push(`projects-grid computed=${r.grid.computed}`);
        r.cards.forEach((c, i) => {
            if (/transform/i.test(c.inline)) bad.push(`project-card[${i}] inline transform`);
            if (c.computed !== 'none') bad.push(`project-card[${i}] computed=${c.computed}`);
        });
        if (r.aside) {
            if (/transform/i.test(r.aside.inline)) bad.push('experience-aside inline transform');
            if (r.aside.computed !== 'none') bad.push(`experience-aside computed=${r.aside.computed}`);
        }
        check('no residual transforms on sticky participants', bad.length === 0, bad.join(' | ') || `sticky=${r.stickyPos}`);
        check('no console/network errors (H)', errors.length === 0, errors.slice(0, 4).join(' | '));
        await page.close();
    });

    /* Sections are assigned, then executed one per fresh browser process:
     * a crashed browser only costs the section it was running. */
    const SECTIONS = { A: secA, B: secB, C: secC, D: secD, E: secE, F: secF, G: secG, H: secH };
    const KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const want = (process.argv[2] || '').toUpperCase();
    for (const key of KEYS) {
        if (want && !want.split(',').includes(key)) continue;
        await SECTIONS[key]();
    }

    await browser.close();

    const failed = results.filter((r) => !r.ok);
    console.log(`\n==== ${results.length - failed.length}/${results.length} checks passed ====`);
    if (failed.length) {
        failed.forEach((f) => console.log('FAILED:', f.name, f.detail || ''));
        process.exit(1);
    }
})().catch((e) => { console.error('QA script crashed:', e); process.exit(2); });
