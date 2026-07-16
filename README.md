# Australia Property Explorer

Static site hosting for the [property-tool](https://github.com/shlokthakur1/property-tool)
data explorer. This repo holds only the generated `site/` output (HTML/JS/CSS +
`data/properties.json.gz`) — no pipeline code, no API keys.

`properties.json.gz` is gzip-compressed at build time (`build_site.py`) and
decompressed client-side (`app.js`, via `DecompressionStream`) — the raw JSON
crossed GitHub's 100MB per-file push limit once nationwide For_Sale data was
added, gzip brings it down ~14x.

To publish an updated snapshot, from the source repo run:

```
python publish_site.py
```

This syncs `site/` into this repo (including removing anything here that's no
longer produced by a build, not just adding), commits, and pushes.

Served via GitHub Pages from this branch.
