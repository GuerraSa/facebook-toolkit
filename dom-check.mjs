// Page check: runs the userscript on fake Facebook-style pages in a hidden Chrome and reports what works.
// Real Facebook needs a login, so these pages copy the tricks the script must handle instead.
// Run with: node dom-check.mjs   (needs Node 22+ and Chrome, Brave or Edge; set CHROME=/path/to/browser to choose)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSERS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = BROWSERS.find((p) => p && existsSync(p));
if (!browser) { console.error('No Chrome-type browser found. Set CHROME=/path/to/browser'); process.exit(1); }

const script = readFileSync(new URL('./facebook-toolkit.user.js', import.meta.url), 'utf8');
const { postKey } = createRequire(import.meta.url)('./facebook-toolkit.user.js'); // the script's own rule, not a copy
// Stand-ins for Tampermonkey: __store plays the saved values (shared by all tabs), __menu the settings menu item.
const SHIM = `window.__store = {}; window.GM_getValue = (k, d) => k in __store ? structuredClone(__store[k]) : d;
window.GM_setValue = (k, v) => { __store[k] = structuredClone(v); }; window.GM_registerMenuCommand = (n, f) => { window.__menu = f; };
window.GM_addStyle = (c) => document.head.appendChild(Object.assign(document.createElement('style'), { textContent: c }));`;

const post = (id, inner) => `<div id="${id}"><div aria-posinset="1" role="article"><h4><a href="/someone">Someone</a></h4>${inner}<p>body</p></div></div>`;
const comment = (text) => `<div role="article" aria-label="Comment by Friend"><a href="/friend">Friend</a><span>${text}</span></div>`;
const comment2 = (text) => `<div role="article"><a href="/friend">Friend</a><span>${text}</span></div>`; // no label: caught only by nesting
// Shaped like a real right-column ad (Nov 2026): no "Sponsored" text, only the labelled ⋯ button beside the ad's link.
const ad = (who, href = 'https://shop.example/?ad_id=1') => `<div><div data-visualcompletion="ignore-dynamic"><div><div><a href="${href}" target="_blank"><span>Advertiser</span><img alt=""><span>Great deal from ${who}</span><div>shop.example</div></a>` +
  `<div><div><span><div role="button" aria-label="Open menu for ${who} sponsored content"><svg></svg></div></span></div></div></div></div></div></div>`;
const LONG = 'A long story about my weekend at the lake with the whole family';
const FEED = `<!doctype html><html><head><style>.h{display:none}</style></head><body>
<div role="main">
<div id="stories"><div><span>Create story</span></div><div><a href="/stories/1">Ann</a></div></div>
<div id="composer"><div><span>What's on your mind, Sam?</span></div><div><span>Live video</span><span>Photo/video</span></div></div>
<div role="feed">
${post('normal', '<span>Like</span><span>Comment</span><p>This trip was sponsored by my mom</p>')}
${post('spons1', '<a href="#"><span>Sp<b class="h">x</b>on<b class="h">q</b>sored</span></a>')}
${post('spons2', '<span aria-labelledby=":r1a:"></span><span id=":r1a:" style="display:none">Sponsored</span>')}
${post('pymk', '<span>People you may know</span>')}
${post('group', '<a href="/groups/1">Cats</a> · <div role="button"><span>Join</span></div>')}
${post('reel', '<a href="/reel/99">watch</a>')}
${post('phrase', '<p>Huge GIVEAWAY time</p>')}
${post('comments', comment('Join') + comment2('Reels') + comment2('<a href="/reel/5">this one</a>'))}
<div id="plain"><div aria-posinset="2"><h4><a href="/someone">Someone</a></h4><p>body</p>${comment('Join')}</div></div>
${post('replies', '<div role="article" aria-label="Reply by Friend"><span>Sponsored</span></div>')}
${post('prompted', '<div id="prompt"><span>Are you interested in this post?</span><div role="button"><span>Yes</span></div><div role="button"><span>No</span></div></div><p>What a day at the market</p>')}
${post('followed', '<h4><a href="/page">Cool Page</a><span> · </span><span id="fl"><div role="button"><span>Follow</span></div></span></h4>')}
${post('aiqpost', '<p>Look at this view</p><div id="aiq"><span>Ask Meta AI</span><div role="button"><span>Where is this?</span></div></div>')}
${post('counted', '<span id="cnt">12 comments</span><span id="shr">1.2K shares</span>')}
${post('long', `<div data-ad-preview="message">${LONG}<div role="button" id="more" onclick="this.dataset.clicked = 1">See more</div></div>`)}
${post('aipost', '<span>AI info</span>')}
${post('spammy', '<h4><a href="/spammy">Spammy Page</a></h4>')}
${post('linked', '<a href="https://l.facebook.com/l.php?u=https%3A%2F%2Fnews.example.com%2Fstory&amp;h=x">read</a>')}
<div id="short1"><div aria-posinset="3" role="article"><div id="c1"><h4><a href="/ann">Ann Lee</a></h4><span>3h</span><p>Nice view!</p><div id="row1"><span>Ask Meta AI</span><div role="button"><span>Where is this place?</span></div><div role="button"><span>What mountain is this?</span></div></div><div role="button" aria-label="Like"><span>Like</span></div></div></div></div>
<div id="short2"><div aria-posinset="4" role="article"><div id="c2"><h4><a href="/bo">Bo Kim</a></h4><span>1h</span><p>So true</p><div id="row2"><span>Are you interested in this post?</span><div role="button"><span>Yes</span></div><div role="button"><span>No</span></div></div><div role="button" aria-label="Like"><span>Like</span></div></div></div></div>
${post('keyed','<a href="/groups/1/posts/42/">2h</a><p>Garden club meets on Sunday</p>')}
${post('adpost', ad('Bike Co', 'https://bikes.example/'))}
${post('pic','<svg id="avatar" width="40" height="40"><image href="x.png" width="40" height="40"></image></svg>')}
</div></div>
<div role="complementary"><div id="rr-ads"><h3>Sponsored</h3><a href="https://ad.example/">Ad one</a></div><div id="rr-bdays"><h3>Birthdays</h3><span>Ann</span></div></div>
<div class="rail"><div id="ad1">${ad('Lamp Co')}</div><div id="ad2">${ad('Shoe Co')}</div><div id="contacts"><h3>Contacts</h3><a href="/ann">Ann</a></div></div>
<a id="ext" target="_blank" href="https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.org%2F%3Fa%3D1%26fbclid%3Dx&amp;h=AT0">ext</a>
<a id="int" href="/someone?__cft__[0]=abc&amp;__tn__=R&amp;id=5">int</a>
<div id="player"><div><video id="vid"></video><div id="overlay"></div></div></div>
<div style="height:3000px"></div>
</body></html>`;
const card = (n, title = 'Item', extra = '') => `<div class="cell"><div><a href="/marketplace/item/${n}/?ref=x"><img alt=""><span>$${n}</span><span>${title}</span>${extra}</a></div></div>`;
const MP = `<!doctype html><html><head></head><body><div role="main"><div class="grid">${card(111)}${card(222)}${card(333)}</div></div></body></html>`;
const MP_SEARCH = `<!doctype html><html><head></head><body><div role="main"><div class="grid">${card(1, 'Red floor lamp')}${card(2, 'Broken floor lamp')}${card(3, 'Chair')}${card(4, 'Floor lamp', '<span>Sponsored</span>')}<div class="cell" id="mpad">${ad('Lamp Co')}</div></div></div></body></html>`;
const MP_ONE = `<!doctype html><html><head></head><body><div role="main"><div class="grid">${card(111)}</div></div></body></html>`;
const PAGES = { '/marketplace/search': MP_SEARCH, '/marketplace/one': MP_ONE, '/marketplace/': MP };

// [name, path, setup (runs before the script, e.g. saved settings), check]
const CHECKS = [
  ['Feed: hides the right posts, settings panel', '/', '', `
    const h = (id) => document.getElementById(id).getAttribute('data-fbt-hide');
    const r = { 'normal post kept': h('normal') === null, 'scrambled Sponsored hidden': h('spons1') === 'sponsored',
      'Sponsored behind aria-labelledby hidden': h('spons2') === 'sponsored', 'People you may know hidden': h('pymk') === 'people',
      'Join group hidden': h('group') === 'groups', 'reel hidden': h('reel') === 'reels', 'words in comments ignored': h('comments') === null,
      'comments ignored when the post is not an article': h('plain') === null, 'words in replies ignored': h('replies') === null,
      'right-column ads hidden': h('rr-ads') === 'sponsored', 'rest of right column kept': h('rr-bdays') === null,
      'post with an ad menu hidden': document.querySelector('#adpost [aria-posinset]').getAttribute('data-fbt-hide') === 'sponsored',
      'unlabelled side ads hidden one by one': h('ad1') === 'sponsored' && h('ad2') === 'sponsored' && h('contacts') === null,
      'interest prompt hidden, post kept': h('prompt') === 'prompt' && h('prompted') === null,
      'Meta AI row hidden, post kept': h('aiq') === 'meta-ai' && h('aiqpost') === null,
      'short post: only its Meta AI row hidden': h('row1') === 'meta-ai' && h('c1') === null && h('short1') === null,
      'short post: only its interest prompt hidden': h('row2') === 'prompt' && h('c2') === null && h('short2') === null,
      'off by default: Follow, Stories, composer, counts': h('fl') === null && h('stories') === null && h('composer') === null && h('cnt') === null };
    document.querySelector('[role=feed]').insertAdjacentHTML('beforeend', '<div id="late"><div aria-posinset="9"><span>Sponsored</span></div></div>');
    document.querySelector('#normal h4').insertAdjacentHTML('afterend', '<span>Sponsored</span>');
    await sleep(600);
    r['post added later hidden'] = h('late') === 'sponsored';
    r['label added later to a kept post hidden'] = h('normal') === 'sponsored';
    __store.settings = { phrases: ['giveaway time'] }; // saved by another tab after this one opened
    __menu(); const p = document.getElementById('fbt-panel');
    r['panel shows the other tab\\'s phrase'] = p.querySelector('textarea').value === 'giveaway time';
    p.querySelectorAll('input')[0].checked = false; p.querySelector('.fbt-save').click();
    r['panel closes on Save'] = !document.getElementById('fbt-panel');
    r['settings saved'] = __store.settings.sponsored === false && JSON.stringify(__store.settings.phrases) === '["giveaway time"]';
    r['sponsored posts and ads shown again'] = h('spons1') === null && h('late') === null && h('ad1') === null && !document.querySelector('#adpost [data-fbt-hide]');
    r['phrase post hidden'] = h('phrase') === 'phrase';
    r['other categories still hidden'] = h('reel') === 'reels';
    return r;`],
  ['Feed: every option on', '/', `__store.settings = { follow: true, stories: true, composer: true, seeMore: true, noCounts: true, noPics: true,
      aiPosts: true, sources: ['Spammy Page', 'example.com'], accentOn: true, accent: '#ff0000', black: true };`, `
    const h = (id) => document.getElementById(id).getAttribute('data-fbt-hide');
    return { 'Follow link hidden, post kept': h('fl') === 'follow' && h('followed') === null,
      'Stories row hidden, feed kept': h('stories') === 'stories' && document.querySelector('[role=feed]').offsetHeight > 0,
      'composer hidden': h('composer') === 'composer',
      'counts hidden': h('cnt') === 'count' && h('shr') === 'count' && h('counted') === null,
      '"See more" clicked': document.getElementById('more').dataset.clicked === '1',
      'AI-labelled post hidden': h('aipost') === 'aiPosts',
      'blocked Page hidden': h('spammy') === 'source', 'blocked website hidden': h('linked') === 'source',
      'normal post kept': h('normal') === null,
      'profile picture hidden': getComputedStyle(document.getElementById('avatar')).display === 'none',
      'accent color applied': getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#ff0000' };`],
  ['Hide posts already scrolled past', '/', `__store.settings = { seenDays: 7 }; __store.seen = { ${JSON.stringify(postKey([], LONG + 'See more'))}: Date.now() - 3600e3 };`, `
    const h = (id) => document.getElementById(id).getAttribute('data-fbt-hide');
    const r = { 'post seen yesterday hidden': h('long') === 'seen', 'other posts kept': h('normal') === null };
    for (let y = 0; y < document.body.scrollHeight; y += 300) { window.scrollTo(0, y); await sleep(50); } // like real scrolling: posts cross the top edge
    await sleep(3600);
    r['scrolled-past posts remembered'] = Object.keys(__store.seen || {}).length > 1;
    r['…but not hidden until next visit'] = h('normal') === null;
    return r;`],
  ['Links and videos', '/?x=1&fbclid=zzz', `__store.settings = { clickToPlay: true, videoKeys: true };`, `
    const r = { 'address bar cleaned': location.search === '?x=1' };
    let reached = false; document.body.addEventListener('click', () => { reached = true; });
    const ext = document.getElementById('ext'), int = document.getElementById('int');
    ext.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    r['outside link unwrapped and cleaned'] = ext.href === 'https://example.org/?a=1';
    ext.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    r['Facebook never sees the outside click'] = !reached;
    int.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    r['Facebook link loses tracking'] = int.href === location.origin + '/someone?id=5';
    const v = document.getElementById('vid'); let paused = 0; v.pause = () => { paused++; };
    v.dispatchEvent(new Event('play'));
    r['video does not start by itself'] = paused === 1;
    document.getElementById('overlay').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    v.dispatchEvent(new Event('play'));
    r['video plays after your click'] = paused === 1;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '>', bubbles: true }));
    r['Shift+> speeds up and is remembered'] = v.playbackRate === 1.25 && __store.rate === 1.25;
    return r;`],
  ['Break screen', '/', `__store.settings = { breakMin: 15 }; __store.usage = { last: Date.now(), secs: 15 * 60 };`, `
    const r = { 'break screen shown': !!document.getElementById('fbt-break') };
    document.querySelector('#fbt-break button').click();
    r['"5 more minutes" lets you back in'] = !document.getElementById('fbt-break') && __store.usage.secs === 10 * 60;
    return r;`],
  ['A post opened from a link is never hidden', '/groups/1/posts/9/', '', `
    const h = (id) => document.getElementById(id).getAttribute('data-fbt-hide');
    return { 'group post with Join kept': h('group') === null, 'sponsored and reel posts kept': h('spons1') === null && h('reel') === null && !document.querySelector('#adpost [data-fbt-hide]') };`],
  ['Start page', '/',`__store.settings = { startPage: 'marketplace' };`, `
    return { 'fresh visit to home opens Marketplace': location.pathname === '/marketplace/' };`],
  ['Marketplace: hide button, remembered, works across tabs', '/marketplace/', '', `
    const xs = document.querySelectorAll('.fbt-x');
    const r = { '3 hide buttons': xs.length === 3, 'button sits on the listing box': xs[0].parentElement.className === 'cell' };
    document.querySelector('.grid').insertAdjacentHTML('beforeend', ${JSON.stringify(card(444))}); await sleep(600);
    r['listing added later gets a button'] = document.querySelectorAll('.fbt-x').length === 4;
    r['no listing gets two buttons'] = [...document.querySelectorAll('.cell')].every((c) => c.querySelectorAll('.fbt-x').length === 1);
    __store.hiddenItems = ['999']; // hidden in another tab after this one opened
    xs[1].click();
    r['clicked listing hidden'] = document.querySelectorAll('.cell')[1].getAttribute('data-fbt-hide') === 'listing';
    r['others still visible'] = document.querySelectorAll('[data-fbt-hide]').length === 1;
    r['saved, keeping the other tab\\'s listing'] = JSON.stringify(__store.hiddenItems) === '["999","222"]';
    __menu(); const c = [...document.querySelectorAll('#fbt-panel button')].find((b) => b.textContent.includes('hidden listings'));
    r['clear button counts both'] = c.textContent.includes(' 2 ');
    c.click(); await sleep(50);
    r['cleared, listing back'] = !document.querySelector('[data-fbt-hide]') && __store.hiddenItems.length === 0 && document.querySelectorAll('.fbt-x').length === 4;
    return r;`],
  ['Marketplace: one listing first, more load later', '/marketplace/one', '', `
    const r = { 'no button while only one listing shows': document.querySelectorAll('.fbt-x').length === 0 };
    document.querySelector('.grid').insertAdjacentHTML('beforeend', ${JSON.stringify(card(222) + card(333))}); await sleep(600);
    r['then every listing gets its own button'] = [...document.querySelectorAll('.cell')].every((c) => c.querySelectorAll('.fbt-x').length === 1);
    return r;`],
  ['Marketplace: sponsored listings and search rules', '/marketplace/search?query=%22floor%20lamp%22%20-broken', `__store.settings = { mpRules: true };`, `
    const h = (n) => document.querySelectorAll('.cell')[n].getAttribute('data-fbt-hide');
    return { 'matching listing kept': h(0) === null, '-broken hides it': h(1) === 'search-rule', '"floor lamp" hides others': h(2) === 'search-rule',
      'sponsored listing hidden': h(3) === 'sponsored', 'ad tile (no listing link) hidden': h(4) === 'sponsored' };`],
];

const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end(PAGES[req.url.split('?')[0]] || FEED);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'fbt-'));
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
let failed = 0;
try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const waiting = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (waiting[d.id]) waiting[d.id](d); };
  const send = (method, params = {}) => new Promise((r) => { waiting[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  for (const [name, path, setup, body] of CHECKS) {
    await send('Page.navigate', { url: base + path });
    await sleep(1000);
    await send('Runtime.evaluate', { expression: SHIM + setup + script }); // like Tampermonkey, after the page has loaded
    await sleep(700);
    const res = await send('Runtime.evaluate', { expression: `(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); ${body} })()`, awaitPromise: true, returnByValue: true });
    const results = res.result.result?.value;
    console.log(`\n${name}`);
    if (!results) { failed++; console.log('  ✗ check crashed:', res.result.exceptionDetails?.exception?.description || 'no result'); continue; }
    for (const [what, ok] of Object.entries(results)) { if (ok !== true) failed++; console.log(`  ${ok === true ? '✓' : '✗'} ${what}`, ok === true || ok === false ? '' : ok); }
  }
  ws.close();
} finally { proc.kill('SIGKILL'); server.close(); await sleep(300); rmSync(profile, { recursive: true, force: true }); }
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
