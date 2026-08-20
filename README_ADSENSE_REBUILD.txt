ALTER HUB - ADSENSE READINESS REBUILD
Updated: 2026-08-20

WHAT CHANGED
- Added public documentation: Getting Started, Installation, Key System, Troubleshooting, FAQ.
- Added supported-game directory and five detailed support-note pages.
- Added About, Contact/Support, and Changelog pages.
- Reworked the homepage so Games, Documentation, and Updates are primary destinations.
- Removed Google AdSense, Adsterra display ads, and the Adsterra popunder from get-script.html.
- Marked get-script.html noindex,nofollow.
- Added robots.txt, sitemap.xml, canonical links, and index/follow metadata to public content pages.
- The accompanying Cloudflare Worker build removes display ads and anti-adblock gating from key/result pages and marks those pages noindex.

IMPORTANT BEFORE YOU REAPPLY
- Do not add AdSense to get-script.html, key/result pages, admin/login pages, checkout confirmation screens, or other temporary behavioral screens.
- Keep AdSense on substantial publisher-content pages only after approval.
- The new game support pages intentionally do not invent game-specific feature lists. Before review, add real screenshots, tested features, version notes, and known issues where you can verify them.
- Check every public page in a browser on desktop and mobile before deploying.
- Submit https://alterhub.online/sitemap.xml in Google Search Console if you use Search Console.

DEPLOYMENT
The ahs-main directory is the static website. cloudflare-worker-adsense-ready.js is supplied beside it in the outer ZIP and should be deployed separately to your Cloudflare Worker.
