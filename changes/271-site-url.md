### Changes

- **A deployed game's link preview shows its image** (4.5.1, #271). `index.html` wrote the share image as `%BASE%og.png`, a relative URL that LinkedIn's and Facebook's crawlers often ignore. An optional `url` in `games/<id>/site.json`, the game's public address, makes `og:image` absolute (`<url>og.png`) and adds `og:url`; without it, or with an address that is not an absolute `http(s)` URL (or has a query, a fragment or credentials), the page is as before.
