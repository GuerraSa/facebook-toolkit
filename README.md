# Facebook Toolkit

A [Tampermonkey](https://www.tampermonkey.net/) userscript that takes the noise out of Facebook. It hides ads, suggestions, reels, Meta AI and anything you filter out, and it cleans up links. It also adds video controls, a hide button for Marketplace listings, break reminders and your own colors.

## Install

1. Install the Tampermonkey extension for your browser (Chrome, Edge, Firefox, Safari).
2. Click **[Install Facebook Toolkit](https://github.com/GuerraSa/facebook-toolkit/releases/latest/download/facebook-toolkit.user.js)**. Tampermonkey opens an install page; click **Install**.
3. Open or refresh `facebook.com`.

Tampermonkey checks this link for updates automatically, so new releases install themselves.

## Features

Everything can be switched on or off in the settings. **(on)** means it starts switched on; everything else starts off.

Hidden things disappear completely. Nothing is deleted or reported: switch a feature off and they come straight back. A single post or reel you open yourself, from a link or a notification, is never hidden.

### News feed
- **Sponsored posts and ads (on):** in the feed, on profiles and Pages, in groups and search, and in the right-hand column. This includes the ads where Facebook scrambles the word "Sponsored" to dodge blockers, and ads that don't show the word at all.
- **Suggested profiles (on):** "People you may know" and "Suggested for you" posts.
- **Suggested groups (on):** "Suggested groups" boxes, plus posts from groups you haven't joined (the ones with a **Join** button).
- **Reels (on):** "Reels and short videos" boxes and posts that are reels.
- **Shopping posts (on):** posts with a **Shop now** button.
- **"Are you interested in this post?" (on):** the question strip Facebook adds under some posts.
- **Follow links:** the **Follow** link next to names on posts.
- **Stories row** and **"What's on your mind?" box** at the top of the feed.

### Meta AI
- **Meta AI (on):** Meta AI cards, the "Ask Meta AI" questions under posts, AI summaries of comments, and Meta AI in search.
- **AI-labelled posts:** posts Facebook marks as made with AI ("AI info").

### Your filters
- **Words and phrases:** hide any post that contains a word or phrase you list, such as `giveaway` or `crypto`. Capital letters don't matter.
- **People, Pages and websites:** hide posts from or mentioning names you list (`Jane Doe`), or with links to sites you list (`example.com`, including its subdomains).
- **Posts you already scrolled past:** remembered for 1, 3, 7, 30 or 90 days and hidden the next time you open Facebook, so you see something new. The list stays in your browser.

### Reading
- **Open "See more" automatically** on long posts.
- **Hide profile pictures** on posts and comments.
- **Hide counts:** the like, comment and share numbers under posts.

### Marketplace
- **Hide button (on):** every listing gets a **✕** in its top-right corner. Click it and that listing is hidden for good, even after you reload or come back days later. To bring hidden listings back, open the settings and click **Show my N hidden listings again**.
- **Sponsored listings and ad tiles (on)** are hidden, so the grid shows only real listings.
- **Search rules:** type them into Marketplace's own search box. `"floor lamp"` keeps only titles with those words, `-broken` hides titles with that word, and `in:austin` keeps only listings in that place. For example: `"floor lamp" -broken in:austin`. Facebook still searches for the whole text, so start with a plain word search and add rules after it.

### Videos
- **Click to play:** videos wait for your click instead of starting by themselves.
- **Keys:** **Shift + >** and **Shift + <** change the speed (remembered for the next videos). With a video paused, **.** and **,** step one frame forward or back.
- **Hold for 2x:** hold the mouse button down on a playing video to watch at double speed; let go to go back.
- **Double-click to skip:** double-click the left or right side of a video to jump back or forward 10 seconds (5 on short videos).

### Links (on)
- Tracking tags (`fbclid`, `__cft__`, `utm_…` and similar) are removed from links and from the address bar, so links you copy are clean.
- Links to other websites go straight there. Facebook's "leaving Facebook" redirect page and its click tracking are skipped.

### Opening Facebook
- **Start page:** open `facebook.com` on the newest posts first, Marketplace, Groups or Friends. A reload still shows the normal home page.
- **Break screen:** after the time you pick (15 minutes to 2 hours), the feed, Reels and Watch are covered by a "Time for a break" screen. **5 more minutes** lets you back in for a bit. Chats, profiles and Marketplace keep working. A 30-minute pause resets the count.

### Colors
- **Accent color:** your own color instead of Facebook blue on buttons, links and the selected tab.
- **True-black dark mode:** turns Facebook's dark gray into black. Turn on Facebook's own dark mode first.

## Settings

Click the Tampermonkey icon in your browser's toolbar, then **Facebook Toolkit settings**. A panel opens on the page with every option, grouped like the list above. Click **Save**: changes apply right away, with no reload needed.

Settings are stored by Tampermonkey in your browser. They don't sync between computers.

## Notes and limits

- Facebook changes its pages often. If something stops being hidden, or a normal post goes missing, please [open an issue](https://github.com/GuerraSa/facebook-toolkit/issues) and say what kind of post it was.
- It works on the English version of Facebook only. It recognizes things by the words Facebook shows ("Sponsored", "People you may know", and so on).
- Ads inside the Reels player aren't skipped.
- Many feature ideas come from [Hushfacebook](https://github.com/SysAdminDoc/Hushfacebook), a mod for the Facebook Android app. This script is written separately for the website; no code is shared.

## Development

The whole script is one file: [`facebook-toolkit.user.js`](facebook-toolkit.user.js). The rules that decide what gets hidden have a self-test:

```sh
node test.js
```

To check the whole script in a real browser (every feature above, including Facebook's scrambled labels, ignoring comments, and two tabs saving at once), run it on fake Facebook-style pages in a hidden browser. This needs Node 22+ and Chrome, Brave or Edge:

```sh
node dom-check.mjs
```

Real Facebook needs a login, so this check can't visit it. After a change, also test by scrolling your own feed.

The labels each category looks for live in the `RULES` list near the top of the script (whole posts) and in the `BITS` list further down (pieces of the page, such as prompts and Meta AI rows). If Facebook renames something, those two lists are the place to update.

To release a new version, bump `@version` in the script header, commit, then push a matching tag:

```sh
git tag v1.0.1 && git push origin v1.0.1
```

GitHub Actions checks that the tag matches `@version`, runs the self-test, and publishes the release with the script attached.
