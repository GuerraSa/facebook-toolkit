// Run with: node test.js
const assert = require('assert');
const { DEFAULTS, classify, itemId, squash, cleanUrl, postKey, mpRules, mpKeep } = require('./facebook-toolkit.user.js');

const post = (labels = [], links = [], text = '') => ({ labels: new Set(labels.map(squash)), links, text });
const all = { ...DEFAULTS, phrases: ['crypto', 'Giveaway Time'] };

// Each category is caught by its label, ignoring case and spacing.
assert.strictEqual(classify(post(['Sponsored']), all), 'sponsored');
assert.strictEqual(classify(post(['S p o n s o r e d']), all), 'sponsored');
assert.strictEqual(classify(post(['People You May Know']), all), 'people');
assert.strictEqual(classify(post(['Suggested for you']), all), 'people');
assert.strictEqual(classify(post(['Join']), all), 'groups');
assert.strictEqual(classify(post(['Reels and short videos']), all), 'reels');
// ...or by a link.
assert.strictEqual(classify(post([], ['/ads/about/?entry_product=ad_preferences']), all), 'sponsored');
assert.strictEqual(classify(post([], ['https://www.facebook.com/reel/123456/']), all), 'reels');

// Normal posts stay, even when the word appears inside a longer text.
assert.strictEqual(classify(post(['Maria Lopez', 'Like', 'Comment'], ['/maria.lopez'], 'This trip was sponsored by my mom. Join us next time!'), all), null);

// Your own phrases match anywhere in the post, ignoring case.
assert.strictEqual(classify(post([], [], 'Best CRYPTO tips inside'), all), 'phrase');
assert.strictEqual(classify(post([], [], 'giveaway time! share to win'), all), 'phrase');

// Switched-off categories are left alone.
assert.strictEqual(classify(post(['Sponsored'], ['/reel/1']), { ...all, sponsored: false, reels: false }), null);

// Shopping posts are on by default; AI-labelled posts only when switched on.
assert.strictEqual(classify(post(['Shop now']), all), 'shop');
assert.strictEqual(classify(post(['AI info']), all), null);
assert.strictEqual(classify(post(['AI info']), { ...all, aiPosts: true }), 'aiPosts');

// Blocked people, Pages and websites: by name, by link (even through Facebook's redirect), or by the site name on a preview.
const blocked = { ...all, sources: ['Spammy Page', 'example.com', 'https://www.tabloid.net/'] };
assert.strictEqual(classify(post(['Spammy Page']), blocked), 'source');
assert.strictEqual(classify(post([], ['https://l.facebook.com/l.php?u=https%3A%2F%2Fnews.example.com%2Fstory&h=x']), blocked), 'source');
assert.strictEqual(classify(post(['TABLOID.NET']), blocked), 'source');
assert.strictEqual(classify(post(['Spammy'], ['https://notexample.com/']), blocked), null);

// Links lose their tracking; Facebook's redirect becomes the real address; clean links stay exactly as they were.
assert.strictEqual(cleanUrl('https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.org%2F%3Fa%3D1%26fbclid%3Dx&h=AT0'), 'https://example.org/?a=1');
assert.strictEqual(cleanUrl('https://www.facebook.com/someone?__cft__[0]=abc&__tn__=R&id=5'), 'https://www.facebook.com/someone?id=5');
assert.strictEqual(cleanUrl('https://www.facebook.com/share/p/1A/?mibextid=xyz&rdid=q'), 'https://www.facebook.com/share/p/1A/');
assert.strictEqual(cleanUrl('https://example.com/a b?x=1'), 'https://example.com/a b?x=1');

// A post keeps the same fingerprint wherever it shows up; posts with nothing to go on get none.
assert.strictEqual(postKey(['/someone', '/groups/1/posts/777/?__cft__[0]=x'], 'hi'), postKey(['https://www.facebook.com/groups/1/posts/777/'], 'other'));
assert.strictEqual(postKey(['/permalink.php?story_fbid=55&id=4'], ''), postKey(['/permalink.php?id=9&story_fbid=55'], ''));
assert.strictEqual(postKey(['/someone'], 'Hello   world'), postKey([], 'hello world'));
assert.notStrictEqual(postKey([], 'hello world'), postKey([], 'hello there'));
assert.strictEqual(postKey(['/someone'], '  '), null);

// Marketplace search rules.
const r = mpRules('lamp "floor lamp" -broken in:Austin');
assert.deepStrictEqual(r, { must: ['floor lamp'], not: ['broken'], place: ['austin'] });
assert.strictEqual(mpKeep('Floor lamp, brass · $40 · Austin, TX', r), true);
assert.strictEqual(mpKeep('Floor lamp, broken shade · $5 · Austin, TX', r), false);
assert.strictEqual(mpKeep('Floor lamp · $40 · Dallas, TX', r), false);
assert.strictEqual(mpKeep('anything', mpRules(null)), true);

assert.strictEqual(itemId('https://www.facebook.com/marketplace/item/1234567890/?ref=search'), '1234567890');
assert.strictEqual(itemId('/marketplace/category/vehicles'), null);

console.log('all tests passed');
