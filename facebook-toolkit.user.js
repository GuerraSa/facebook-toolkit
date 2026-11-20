// ==UserScript==
// @name         Facebook Toolkit
// @namespace    https://github.com/GuerraSa/facebook-toolkit
// @version      1.0.0
// @description  A calmer Facebook: hides ads, suggestions, reels, Meta AI and your own filters; cleaner links, video controls, a Marketplace hide button, break reminders and colors.
// @author       GuerraSa
// @match        *://*.facebook.com/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @homepageURL  https://github.com/GuerraSa/facebook-toolkit
// @supportURL   https://github.com/GuerraSa/facebook-toolkit/issues
// @downloadURL  https://github.com/GuerraSa/facebook-toolkit/releases/latest/download/facebook-toolkit.user.js
// @updateURL    https://github.com/GuerraSa/facebook-toolkit/releases/latest/download/facebook-toolkit.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // What to hide, and small helpers with no page access. Also used by test.js
  // ---------------------------------------------------------------------------

  // Whole posts to hide. labels: exact short texts in a post (case and spaces ignored). links: a link address that gives the post away.
  // Each key is also the setting that switches it on.
  const RULES = {
    sponsored: { labels: ['Sponsored'], links: /\/ads\/(about|preferences)|[?&]ad_id=/ },
    people: { labels: ['People you may know', 'Suggested for you'] },
    // "Join" sits next to the group name on posts from groups you are not in.
    groups: { labels: ['Suggested groups', 'Groups you might like', 'Join'] },
    reels: { labels: ['Reels', 'Reels and short videos'], links: /\/reel\// },
    shop: { labels: ['Shop now'] },
    aiPosts: { labels: ['AI info', 'Made with AI', 'Imagined with AI', 'AI generated'] },
  };

  const DEFAULTS = {
    sponsored: true, people: true, groups: true, reels: true, shop: true, prompts: true, follow: false, stories: false, composer: false,
    aiPosts: false, metaAi: true,
    phrases: [], sources: [], seenDays: 0,
    seeMore: false, noPics: false, noCounts: false,
    marketplace: true, mpSponsored: true, mpRules: false,
    clickToPlay: false, videoKeys: false, hold2x: false, dblSkip: false,
    cleanLinks: true,
    startPage: '', breakMin: 0,
    accentOn: false, accent: '#0866ff', black: false,
  };

  const squash = (s) => s.replace(/\s+/g, '').toLowerCase();
  for (const r of Object.values(RULES)) r.labels = r.labels.map(squash);

  // Tracking tags Facebook (and others) add to links.
  const TRACKING = /^(fbclid|__cft__.*|__tn__|__xts__.*|mibextid|rdid|share_url|comment_tracking|paipv|eav|utm_.*)$/i;

  // The same link without tracking; Facebook's "leaving Facebook" redirect (l.facebook.com/l.php?u=…) becomes the real address.
  function cleanUrl(href) {
    let u;
    try { u = new URL(href, 'https://www.facebook.com/'); } catch { return href; }
    if (/^l[m]?\.facebook\.com$/.test(u.hostname) && u.pathname === '/l.php' && u.searchParams.get('u')) return cleanUrl(u.searchParams.get('u'));
    const drop = [...u.searchParams.keys()].filter((k) => TRACKING.test(k));
    if (!drop.length) return href;
    drop.forEach((k) => u.searchParams.delete(k));
    return u.href;
  }

  const hostOf = (href) => { try { return new URL(cleanUrl(href), 'https://www.facebook.com/').hostname.replace(/^www\./, ''); } catch { return ''; } };

  // Why a post should be hidden (a RULES key, 'source' or 'phrase'), or null to keep it.
  // labels: Set of squashed short texts found in the post; links: its link addresses; text: all its text.
  function classify({ labels, links, text }, settings) {
    for (const [key, r] of Object.entries(RULES)) {
      if (!settings[key]) continue;
      if (r.labels.some((l) => labels.has(l)) || (r.links && links.some((h) => r.links.test(h)))) return key;
    }
    for (const s of settings.sources) {
      const v = s.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
      if (!v) continue;
      // A website (has a dot, no spaces): any link to it, or the site name Facebook prints on link previews.
      if (/^[^\s]+\.[a-z]{2,}$/.test(v)) {
        if (labels.has(v) || links.some((h) => { const host = hostOf(h); return host === v || host.endsWith('.' + v); })) return 'source';
      } else if (labels.has(squash(v))) return 'source'; // a person or Page: their name as a link or label
    }
    const t = text.toLowerCase();
    return settings.phrases.some((p) => t.includes(p.toLowerCase())) ? 'phrase' : null;
  }

  // Short, stable fingerprint of a string (cyrb53), so the "already seen" list stays small.
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // A post's identity for "hide seen posts": its own post/video/photo number if a link shows it, else its text. null when neither.
  function postKey(links, body) {
    for (const h of links) {
      let u;
      try { u = new URL(h, 'https://www.facebook.com/'); } catch { continue; }
      const m = u.pathname.match(/\/(?:posts|videos|reel)\/([\w-]+)/);
      const id = m ? m[1] : u.searchParams.get('story_fbid') || u.searchParams.get('fbid') || (u.pathname.startsWith('/watch') && u.searchParams.get('v'));
      if (id) return hash('id:' + id);
    }
    return body && body.trim() ? hash('t:' + squash(body).slice(0, 200)) : null;
  }

  // Marketplace search rules typed into the search box: "two words" must appear, -word must not, in:place must be in the listing.
  function mpRules(query) {
    const r = { must: [], not: [], place: [] };
    for (const [, quoted, minus, inPlace, word] of (query || '').matchAll(/"([^"]+)"|(-?)(in:)?(\S+)/g)) {
      if (quoted) r.must.push(quoted.toLowerCase());
      else if (inPlace) r.place.push(word.toLowerCase());
      else if (minus) r.not.push(word.toLowerCase());
    }
    return r;
  }
  const mpKeep = (text, r) => {
    const t = text.toLowerCase();
    return r.must.every((w) => t.includes(w)) && !r.not.some((w) => t.includes(w)) && r.place.every((p) => t.includes(p));
  };

  // Marketplace listing number from a link, or null.
  const itemId = (href) => (href.match(/\/marketplace\/item\/(\d+)/) || [])[1] || null;

  if (typeof window === 'undefined') {
    module.exports = { DEFAULTS, classify, itemId, squash, cleanUrl, postKey, mpRules, mpKeep };
    return;
  }

  // ---------------------------------------------------------------------------
  // Settings, saved by Tampermonkey
  // ---------------------------------------------------------------------------

  // Re-read before every change: another Facebook tab may have saved since this one opened.
  let settings, hiddenItems;
  const load = () => {
    settings = { ...DEFAULTS, ...GM_getValue('settings', {}) };
    hiddenItems = new Set(GM_getValue('hiddenItems', []));
  };
  load();
  const HIDE = 'data-fbt-hide'; // set on anything hidden; its value says why

  // ---------------------------------------------------------------------------
  // Before the page loads: start page and address-bar cleanup
  // ---------------------------------------------------------------------------

  const START = { feed: '/?filter=all&sk=h_chr', marketplace: '/marketplace/', groups: '/groups/feed/', friends: '/friends/' };
  // Only a fresh visit to the home page: a reload or Back still shows the normal home.
  if (START[settings.startPage] && location.pathname === '/' && !location.search &&
    performance.getEntriesByType('navigation')[0]?.type === 'navigate') {
    location.replace(START[settings.startPage]);
    return;
  }

  const cleanAddress = () => {
    const c = cleanUrl(location.href);
    if (c !== location.href) history.replaceState(history.state, '', c);
  };
  if (settings.cleanLinks) cleanAddress();

  GM_addStyle(`
    [${HIDE}] { display: none !important; }
    html.fbt-nopics div[aria-posinset] svg:has(image), html.fbt-nopics [role="article"] svg:has(image) { display: none !important; }
    html.fbt-nocounts [aria-label="See who reacted to this"] { display: none !important; }
    [data-fbt-card] { position: relative; }
    .fbt-x { position: absolute; top: 8px; right: 8px; z-index: 2; width: 28px; height: 28px; border: 0; border-radius: 50%;
      background: rgba(0,0,0,.65); color: #fff; font-size: 14px; line-height: 28px; cursor: pointer; padding: 0; }
    .fbt-x:hover, .fbt-x:focus-visible { background: #000; outline: 2px solid #fff; }
    #fbt-toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); z-index: 10000; padding: 8px 16px;
      border-radius: 20px; background: rgba(0,0,0,.8); color: #fff; font: 600 16px system-ui, sans-serif; pointer-events: none; }
    #fbt-break { position: fixed; inset: 0; z-index: 9998; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 16px; padding: 16px; text-align: center; font: 18px/1.4 system-ui, sans-serif;
      background: var(--web-wash, #f0f2f5); color: var(--primary-text, #050505); }
    #fbt-break h2 { margin: 0; font-size: 28px; }
    #fbt-panel { position: fixed; top: 64px; right: 16px; z-index: 9999; width: min(380px, calc(100vw - 32px)); max-height: calc(100vh - 80px);
      overflow-y: auto; box-sizing: border-box; padding: 16px; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,.35);
      font: 15px/1.4 system-ui, sans-serif; background: var(--card-background, #fff); color: var(--primary-text, #050505); }
    #fbt-panel h2 { margin: 0 0 4px; font-size: 18px; }
    #fbt-panel h3 { margin: 16px 0 4px; font-size: 15px; }
    #fbt-panel label { display: block; margin: 6px 0; cursor: pointer; }
    #fbt-panel textarea { display: block; width: 100%; box-sizing: border-box; height: 72px; margin-top: 4px; font: inherit;
      background: var(--comment-background, #f0f2f5); color: inherit; border: 1px solid var(--divider, #ccc); border-radius: 6px; }
    #fbt-panel select { font: inherit; margin-left: 4px; }
    #fbt-panel .fbt-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    #fbt-panel .fbt-sticky { position: sticky; bottom: -16px; margin: 12px -16px -16px; padding: 12px 16px; background: inherit; }
    #fbt-panel button, #fbt-break button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 0; cursor: pointer;
      background: var(--secondary-button-background, #e4e6eb); color: inherit; }
    #fbt-panel button.fbt-save { background: #0866ff; color: #fff; }
  `);

  // Your colors: Facebook paints with these variables, so overriding them recolors everything.
  const look = GM_addStyle('');
  function applyLook() {
    const c = settings.accentOn && /^#[0-9a-f]{6}$/i.test(settings.accent) && settings.accent;
    look.textContent = (c ? `:root, .__fb-light-mode, .__fb-dark-mode { --accent: ${c} !important; --primary-button-background: ${c} !important;
        --blue-link: ${c} !important; --primary-deemphasized-button-text: ${c} !important; --progress-ring-blue-foreground: ${c} !important; }` : '') +
      (settings.black ? `.__fb-dark-mode { --web-wash: #000 !important; --surface-background: #000 !important; --nav-bar-background: #000 !important;
        --card-background: #0b0b0b !important; --comment-background: #1a1a1a !important; --popover-background: #121212 !important; }` : '');
    document.documentElement.classList.toggle('fbt-nopics', settings.noPics);
    document.documentElement.classList.toggle('fbt-nocounts', settings.noCounts);
  }
  applyLook();

  // ---------------------------------------------------------------------------
  // Feed: hide whole posts
  // ---------------------------------------------------------------------------

  // Feed posts, plus posts on profiles, Pages, groups and search (top-level articles; nested ones are comments).
  const POSTS = '[role="feed"] > div, div[aria-posinset], [role="main"] [role="article"]:not([role="article"] [role="article"])';
  const COMMENTS = '[aria-label^="Comment by"], [aria-label^="Reply by"]';

  // Everything classify() and postKey() need from one post.
  function facts(post) {
    const labels = new Set();
    const add = (s) => s && s.length < 60 && labels.add(squash(s));
    // Words in comments must not hide the post. Comments are labelled "Comment by …", and are articles inside the post's article.
    const mine = (sel) => [...post.querySelectorAll(sel)].filter((el) => !el.closest(COMMENTS) &&
      !el.closest('[role="article"]')?.parentElement?.closest('[role="article"]'));
    for (const el of mine('span, a, h2, h3, h4, [role="button"]')) add(el.textContent.trim());
    // Facebook scrambles the word "Sponsored" in several ways; read it back the way the screen shows it.
    for (const el of mine('[aria-label]')) add(el.getAttribute('aria-label'));
    // getElementById, not querySelector: Facebook ids look like ":r1a:", which is not a valid selector.
    const byId = (id) => id && document.getElementById(id)?.textContent;
    for (const el of mine('[aria-labelledby]')) el.getAttribute('aria-labelledby').split(' ').forEach((id) => add(byId(id)));
    for (const use of mine('svg use')) add(byId((use.getAttribute('href') || use.getAttribute('xlink:href') || '').slice(1)));
    for (const a of mine('a')) if (a.textContent.length < 60) add(a.innerText);
    const links = mine('a[href]').map((a) => a.getAttribute('href'));
    const body = post.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]')?.textContent;
    return { labels, links, text: post.textContent, body };
  }

  // Posts already checked and kept, with their text length then; only a post whose text changed is checked again.
  // shortcut: a label that changes without changing the post's text (e.g. only an attribute) is missed; recheck all on a timer if that shows up.
  let kept = new WeakMap();

  // "Hide posts I already scrolled past": post fingerprint → when it was first scrolled past.
  // shortcut: the whole list is saved as one value; fine for thousands of posts, split it up if saving ever gets slow.
  const loadedAt = Date.now();
  let seen = {};
  const pruneSeen = (list) => {
    const cutoff = Date.now() - settings.seenDays * 864e5;
    return Object.fromEntries(Object.entries(list).filter(([, t]) => t > cutoff));
  };
  let seenSave = null;
  const saveSeenSoon = () => {
    seenSave = seenSave || setTimeout(() => {
      seenSave = null;
      seen = pruneSeen({ ...GM_getValue('seen', {}), ...seen }); // keep what other tabs saved
      GM_setValue('seen', seen);
    }, 3000);
  };
  const keys = new WeakMap();
  const seenWatch = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting || e.boundingClientRect.bottom > 0) continue; // only once it has gone up past the top
      const k = keys.get(e.target);
      if (k && !seen[k]) { seen[k] = Date.now(); saveSeenSoon(); }
      seenWatch.unobserve(e.target);
    }
  });

  // A single post, reel, photo or video you opened yourself (from a link or a notification) is never hidden.
  const SINGLE = /^\/(reel\/|photo|story\.php|permalink\.php|watch\/?\?(.*&)?v=)|\/(posts|videos)\//;

  function hidePosts() {
    if (SINGLE.test(location.pathname + location.search)) return;
    for (const post of document.querySelectorAll(POSTS)) {
      if (post.hasAttribute(HIDE)) continue;
      const len = post.textContent.length;
      if (kept.get(post) === len) continue;
      const f = facts(post);
      const key = settings.seenDays ? postKey(f.links, f.body) : null;
      const why = classify(f, settings) || (key && seen[key] < loadedAt ? 'seen' : null);
      if (why) { post.setAttribute(HIDE, why); continue; }
      kept.set(post, len);
      if (key) { keys.set(post, key); seenWatch.observe(post); }
    }
  }

  // ---------------------------------------------------------------------------
  // Pieces of the page: prompts, links, Meta AI, the Stories row, …
  // ---------------------------------------------------------------------------

  // Go up from el while ok(parent) says the parent still belongs to the same piece.
  function climb(el, ok) {
    while (el.parentElement && el.parentElement !== document.body && ok(el.parentElement)) el = el.parentElement;
    return el;
  }
  // The smallest box around el that holds little more than el's own text (slack = how many extra letters, e.g. Yes/No buttons).
  // Never a whole post: it stops below the post itself and below any box holding the author's name or the Like button.
  const strip = (el, slack) => climb(el, (p) => p.textContent.length <= el.textContent.length + slack && !p.matches(POSTS) &&
    !p.matches('h2, h3, h4') && !p.querySelector('h2, h3, h4, [aria-label="Like"]'));
  const inPost = (el) => !!el.closest(POSTS);
  const clicked = new WeakSet();

  // Each piece: the setting that switches it on, a test on its squashed text, and what to do with it.
  const BITS = [
    { key: 'prompts', test: (s) => /^areyouinterestedinthis(post|reel)\??$/.test(s), act: (el) => strip(el, 60).setAttribute(HIDE, 'prompt') },
    { key: 'follow', test: (s, el) => s === 'follow' && inPost(el), act: (el) => strip(el, 3).setAttribute(HIDE, 'follow') },
    { key: 'composer', test: (s) => /^what.sonyourmind/.test(s), act: (el) => strip(el, 90).setAttribute(HIDE, 'composer') },
    { key: 'metaAi', test: (s) => /^(askmetaai|metaai)/.test(s), act: (el) => strip(el, 200).setAttribute(HIDE, 'meta-ai') },
    { key: 'noCounts', test: (s, el) => /^\d[\d.,]*[km]?(comments?|shares?|views?|plays?)$/.test(s) && inPost(el), act: (el) => el.setAttribute(HIDE, 'count') },
    {
      key: 'seeMore',
      test: (s, el) => s === 'seemore' && el.matches('[role="button"]') && !el.closest(COMMENTS) && inPost(el) && !clicked.has(el),
      act: (el) => { clicked.add(el); el.click(); },
    },
    {
      // The Stories row: from its "Create story" tile up to the box that holds no feed and no "What's on your mind?".
      key: 'stories', test: (s) => s === 'createstory',
      act: (el) => climb(el, (p) => !p.matches('[role="main"]') && !p.querySelector('[role="feed"]') && !/what.s on your mind/i.test(p.textContent)).setAttribute(HIDE, 'stories'),
    },
  ];
  const CANDIDATES = 'span, a, h2, h3, h4, [role="button"]';

  function scanBits(root) {
    const els = root.matches(CANDIDATES) ? [root, ...root.querySelectorAll(CANDIDATES)] : root.querySelectorAll(CANDIDATES);
    for (const el of els) {
      const t = el.textContent;
      if (t.length > 90 || el.closest('[id^="fbt-"]')) continue; // never our own panel ("Meta AI" is one of its headings)
      const s = squash(t);
      const bit = BITS.find((b) => settings[b.key] && b.test(s, el));
      if (bit) bit.act(el);
    }
  }

  // Ads in the right-hand column: the "Sponsored" heading and everything under it, up to the next section's heading.
  function rightRail() {
    if (!settings.sponsored) return;
    const H = 'h2, h3, h4, [role="heading"]';
    for (const side of document.querySelectorAll('[role="complementary"]')) {
      for (const el of side.querySelectorAll('span, h2, h3, h4')) {
        if (squash(el.textContent) !== 'sponsored') continue;
        const own = el.closest(H) ? 1 : 0;
        climb(el, (p) => p !== side && p.querySelectorAll(H).length <= own).setAttribute(HIDE, 'sponsored');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Marketplace: hide button, sponsored listings, search rules
  // ---------------------------------------------------------------------------

  // The listing's box: the biggest wrapper around its link that holds no other listing.
  const cardOf = (link, id, main) => climb(link, (p) => p !== main &&
    ![...p.querySelectorAll('a[href*="/marketplace/item/"]')].some((a) => itemId(a.href) !== id));
  let handled = new WeakSet(); // listing links already dealt with

  function marketplace() {
    if (!location.pathname.startsWith('/marketplace')) return;
    const main = document.querySelector('[role="main"]') || document.body;
    const links = [...main.querySelectorAll('a[href*="/marketplace/item/"]')];
    // With a single listing on the page its "box" would be the whole results area; wait until there are two.
    if (new Set(links.map((a) => itemId(a.href))).size < 2) return;
    const rules = settings.mpRules ? mpRules(new URLSearchParams(location.search).get('query')) : null;
    for (const link of links) {
      if (handled.has(link)) continue;
      handled.add(link);
      const id = itemId(link.href);
      if (!id) continue;
      const card = cardOf(link, id, main);
      const why = hiddenItems.has(id) ? 'listing'
        : settings.mpSponsored && [...card.querySelectorAll('span')].some((s) => squash(s.textContent) === 'sponsored') ? 'sponsored'
          : rules && !mpKeep(card.textContent, rules) ? 'search-rule' : null;
      if (why) { card.setAttribute(HIDE, why); continue; }
      if (!settings.marketplace || card.querySelector('.fbt-x')) continue;
      const x = document.createElement('button');
      x.className = 'fbt-x';
      x.textContent = '✕';
      x.title = 'Hide this listing';
      x.setAttribute('aria-label', 'Hide this listing');
      x.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hiddenItems = new Set(GM_getValue('hiddenItems', [])).add(id);
        GM_setValue('hiddenItems', [...hiddenItems]);
        card.setAttribute(HIDE, 'listing');
      });
      card.setAttribute('data-fbt-card', '');
      card.appendChild(x);
    }
  }

  // ---------------------------------------------------------------------------
  // Links: no tracking tags, and outside links skip Facebook's click tracking
  // ---------------------------------------------------------------------------

  for (const type of ['click', 'auxclick', 'contextmenu']) {
    addEventListener(type, (e) => {
      if (!settings.cleanLinks) return;
      const a = e.target.closest?.('a[href]');
      if (!a) return;
      const clean = cleanUrl(a.href);
      if (clean !== a.href) a.href = clean; // right-click "Copy link" now copies the clean one
      const u = new URL(a.href);
      if (type !== 'contextmenu' && /^https?:$/.test(u.protocol) && !/(^|\.)facebook\.com$/.test(u.hostname)) e.stopImmediatePropagation();
    }, true);
  }

  // ---------------------------------------------------------------------------
  // Videos: click to play, remembered speed, hold for 2x, double-click to skip, frame step
  // ---------------------------------------------------------------------------

  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  let rate = GM_getValue('rate', 1);
  let lastVideo = null;
  const gesture = { t: 0, el: null };
  const videoAt = (e) => document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.tagName === 'VIDEO');
  const typing = (e) => e.target.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]');
  // shortcut: "your click" = a click within 6 levels above the video in the last 1.5 s; widen if Facebook's play button turns out to sit further away.
  const near = (el, v) => { let p = v; for (let i = 0; i < 6 && p.parentElement; i++) p = p.parentElement; return !!el && p.contains(el); };

  let toastEl = null, toastTimer = null;
  function toast(text) {
    toastEl = toastEl || Object.assign(document.createElement('div'), { id: 'fbt-toast' });
    toastEl.textContent = text;
    document.body.appendChild(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.remove(), 900);
  }

  document.addEventListener('play', (e) => {
    const v = e.target;
    if (v.tagName !== 'VIDEO') return;
    if (settings.clickToPlay && !(Date.now() - gesture.t < 1500 && near(gesture.el, v))) { v.pause(); return; }
    lastVideo = v;
    if (settings.videoKeys && v.playbackRate !== rate) v.playbackRate = rate;
  }, true);

  let holdTimer = null, holding = null;
  const swallowClick = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  addEventListener('pointerdown', (e) => {
    gesture.t = Date.now();
    gesture.el = e.target;
    const v = videoAt(e);
    if (v) lastVideo = v;
    if (settings.hold2x && v && !v.paused && e.button === 0) {
      holdTimer = setTimeout(() => { holding = v; v.playbackRate = 2; toast('2x'); }, 400);
    }
  }, true);
  const endHold = () => {
    clearTimeout(holdTimer);
    if (!holding) return;
    holding.playbackRate = settings.videoKeys ? rate : 1;
    holding = null;
    // Letting go would count as a click and pause the video; skip that one click.
    addEventListener('click', swallowClick, true);
    setTimeout(() => removeEventListener('click', swallowClick, true), 300);
  };
  addEventListener('pointerup', endHold, true);
  addEventListener('pointercancel', endHold, true);

  addEventListener('dblclick', (e) => {
    if (!settings.dblSkip) return;
    const v = videoAt(e);
    if (!v) return;
    const r = v.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x > 0.3 && x < 0.7) return; // the middle keeps Facebook's own double-click
    const step = v.duration < 30 ? 5 : 10;
    v.currentTime = Math.max(0, v.currentTime + (x < 0.3 ? -step : step));
    toast(x < 0.3 ? `−${step}s` : `+${step}s`);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  addEventListener('keydown', (e) => {
    gesture.t = Date.now();
    gesture.el = document.activeElement;
    if (!settings.videoKeys || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const v = lastVideo;
    if (!v || !v.isConnected) return;
    if (e.key === '>' || e.key === '<') {
      const i = SPEEDS.indexOf(rate) === -1 ? 3 : SPEEDS.indexOf(rate);
      rate = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i + (e.key === '>' ? 1 : -1)))];
      v.playbackRate = rate;
      GM_setValue('rate', rate);
      toast(`${rate}x`);
    } else if ((e.key === '.' || e.key === ',') && v.paused) {
      v.currentTime = Math.max(0, v.currentTime + (e.key === '.' ? 1 : -1) / 30); // one frame at 30 fps
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // ---------------------------------------------------------------------------
  // Take a break: after the minutes you pick, cover the feed and Reels
  // ---------------------------------------------------------------------------

  const FEEDS = /^\/($|reel|reels|watch|groups\/feed)/;
  let usage = GM_getValue('usage', { last: 0, secs: 0 });
  let breakBox = null;

  // Every 15 s in the tab you are looking at: add to today's scrolling time. 30 minutes away starts a fresh count.
  function countUsage() {
    if (!settings.breakMin || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    usage = GM_getValue('usage', { last: 0, secs: 0 });
    const now = Date.now();
    if (now - usage.last > 30 * 60e3) usage.secs = 0;
    usage = { last: now, secs: usage.secs + 15 };
    GM_setValue('usage', usage);
    showBreak();
  }

  function showBreak() {
    const due = settings.breakMin && usage.secs >= settings.breakMin * 60 && Date.now() - usage.last < 30 * 60e3 && FEEDS.test(location.pathname);
    if (!due) { breakBox?.remove(); breakBox = null; return; }
    if (breakBox) return;
    const more = Object.assign(document.createElement('button'), { textContent: '5 more minutes' });
    breakBox = Object.assign(document.createElement('div'), { id: 'fbt-break', role: 'dialog', ariaLabel: 'Time for a break' });
    breakBox.append(Object.assign(document.createElement('h2'), { textContent: 'Time for a break' }),
      Object.assign(document.createElement('p'), { textContent: `You've been scrolling for ${Math.round(usage.secs / 60)} minutes. Chats, profiles and Marketplace still work.` }),
      more);
    more.onclick = () => {
      usage = GM_getValue('usage', usage);
      usage = { ...usage, secs: Math.max(0, usage.secs - 5 * 60) };
      GM_setValue('usage', usage);
      showBreak();
    };
    document.body.appendChild(breakBox);
    more.focus();
  }

  // ---------------------------------------------------------------------------
  // Run now, and again whenever Facebook changes the page (at most every 300 ms)
  // ---------------------------------------------------------------------------

  function run(roots = [document.body]) {
    hidePosts();
    marketplace();
    rightRail();
    for (const root of roots) if (root?.isConnected) scanBits(root);
    if (settings.cleanLinks) cleanAddress();
    showBreak();
  }

  // Undo everything, then apply the current settings again.
  function rerun() {
    document.querySelectorAll(`[${HIDE}]`).forEach((el) => el.removeAttribute(HIDE));
    document.querySelectorAll('.fbt-x').forEach((el) => el.remove());
    document.querySelectorAll('[data-fbt-card]').forEach((el) => el.removeAttribute('data-fbt-card'));
    kept = new WeakMap();
    handled = new WeakSet();
    seen = pruneSeen(GM_getValue('seen', {}));
    applyLook();
    run();
  }

  function init() {
    seen = pruneSeen(GM_getValue('seen', {}));
    let roots = new Set(), timer = null;
    // Only the parts that changed are searched for pieces; posts and listings are checked as a whole.
    new MutationObserver((changes) => {
      for (const c of changes) {
        if (c.type === 'characterData') roots.add(c.target.parentElement);
        else for (const n of c.addedNodes) roots.add(n.nodeType === 1 ? n : n.parentElement);
      }
      timer = timer || setTimeout(() => { timer = null; const r = roots; roots = new Set(); run(r); }, 300);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    run();
    setInterval(countUsage, 15e3);
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  // ---------------------------------------------------------------------------
  // Settings panel (Tampermonkey menu → Facebook Toolkit settings)
  // ---------------------------------------------------------------------------

  // [setting, label, type, options]. type: checkbox (default), list (one per line), select, color.
  const FIELDS = [
    ['News feed', [
      ['sponsored', 'Hide sponsored posts and ads (feed, profiles, search, right column)'],
      ['people', 'Hide suggested profiles ("People you may know", "Suggested for you")'],
      ['groups', 'Hide suggested groups and posts from groups you haven\'t joined'],
      ['reels', 'Hide reels'],
      ['shop', 'Hide shopping posts ("Shop now")'],
      ['prompts', 'Hide "Are you interested in this post?"'],
      ['follow', 'Hide Follow links on posts'],
      ['stories', 'Hide the Stories row'],
      ['composer', 'Hide the "What\'s on your mind?" box'],
    ]],
    ['Meta AI', [
      ['aiPosts', 'Hide posts labelled as made with AI'],
      ['metaAi', 'Hide Meta AI (cards, questions under posts, comment summaries, search)'],
    ]],
    ['Your filters', [
      ['phrases', 'Hide posts containing these words or phrases (one per line):', 'list'],
      ['sources', 'Hide posts from or mentioning these people, Pages or websites (one per line, e.g. "Jane Doe" or "example.com"):', 'list'],
      ['seenDays', 'Hide posts I already scrolled past', 'select', [[0, 'off'], [1, 'for 1 day'], [3, 'for 3 days'], [7, 'for 7 days'], [30, 'for 30 days'], [90, 'for 90 days']]],
    ]],
    ['Reading', [
      ['seeMore', 'Open "See more" on long posts automatically'],
      ['noPics', 'Hide profile pictures on posts and comments'],
      ['noCounts', 'Hide like, comment and share counts'],
    ]],
    ['Marketplace', [
      ['marketplace', 'Hide button (✕) on listings'],
      ['mpSponsored', 'Hide sponsored listings'],
      ['mpRules', 'Search rules: "two words" must appear, -word hides, in:town keeps that place'],
    ]],
    ['Videos', [
      ['clickToPlay', 'Videos only play when I click them'],
      ['videoKeys', 'Keys: Shift + > / < changes speed (remembered), , and . step one frame when paused'],
      ['hold2x', 'Hold the mouse on a video for 2x speed'],
      ['dblSkip', 'Double-click the left or right side of a video to skip 10 seconds'],
    ]],
    ['Links', [['cleanLinks', 'Remove tracking from links and the address bar']]],
    ['Opening Facebook', [
      ['startPage', 'Open facebook.com on', 'select', [['', 'the normal home'], ['feed', 'newest posts first'], ['marketplace', 'Marketplace'], ['groups', 'Groups'], ['friends', 'Friends']]],
      ['breakMin', 'Break screen after', 'select', [[0, 'off'], [15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1.5 hours'], [120, '2 hours']]],
    ]],
    ['Colors', [
      ['accentOn', 'Use my own accent color instead of Facebook blue:'],
      ['accent', 'Accent color', 'color'],
      ['black', 'True-black dark mode (turn on Facebook\'s dark mode first)'],
    ]],
  ];

  function el(tag, props = {}, ...children) {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
  }

  function openSettings() {
    document.getElementById('fbt-panel')?.remove();
    load();
    const inputs = {};
    const field = ([key, label, type, options]) => {
      if (type === 'list') return el('label', {}, label, (inputs[key] = el('textarea', { value: settings[key].join('\n') })));
      if (type === 'select') {
        const sel = (inputs[key] = el('select', {}, ...options.map(([v, text]) => el('option', { value: v, textContent: text }))));
        sel.value = settings[key];
        return el('label', {}, label, sel);
      }
      if (type === 'color') return el('label', {}, (inputs[key] = el('input', { type: 'color', value: settings[key], ariaLabel: label })));
      return el('label', {}, (inputs[key] = el('input', { type: 'checkbox', checked: settings[key] })), ' ' + label);
    };
    const clear = el('button', { textContent: `Show my ${hiddenItems.size} hidden listings again`, disabled: !hiddenItems.size });
    const close = () => panel.remove();
    const save = el('button', { className: 'fbt-save', textContent: 'Save' });
    const panel = el('div', { id: 'fbt-panel', role: 'dialog', ariaLabel: 'Facebook Toolkit settings' },
      el('h2', { textContent: 'Facebook Toolkit' }),
      ...FIELDS.flatMap(([title, fields]) => [el('h3', { textContent: title }), ...fields.map(field), ...(title === 'Marketplace' ? [clear] : [])]),
      el('div', { className: 'fbt-row fbt-sticky' }, save, el('button', { textContent: 'Cancel', onclick: close })));

    clear.onclick = () => {
      hiddenItems.clear();
      GM_setValue('hiddenItems', []);
      clear.textContent = 'Hidden listings cleared';
      clear.disabled = true;
      rerun();
    };
    save.onclick = () => {
      for (const [key, input] of Object.entries(inputs)) {
        const d = DEFAULTS[key];
        settings[key] = Array.isArray(d) ? input.value.split('\n').map((p) => p.trim()).filter(Boolean)
          : typeof d === 'boolean' ? input.checked
            : typeof d === 'number' ? Number(input.value) : input.value;
      }
      GM_setValue('settings', settings);
      close();
      rerun();
    };
    panel.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    document.body.appendChild(panel);
    inputs.sponsored.focus();
  }

  GM_registerMenuCommand('Facebook Toolkit settings', openSettings);
})();
