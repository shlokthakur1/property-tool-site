# Australia Property Explorer

Static site hosting for the [property-tool](https://github.com/shlokthakur1/property-tool)
data explorer. This repo holds only the generated `site/` output (HTML/JS/CSS +
`data/properties.json`) — no pipeline code, no API keys.

To publish an updated snapshot, re-copy the source repo's `site/` folder here
and push:

```
cp -r ../property-tool/site/. .
git add -A
git commit -m "Refresh data"
git push
```

Served via GitHub Pages from this branch.
