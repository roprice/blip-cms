# Blip

Chrome extension that turns your browser into a mini-CMS, for editing website content directly on the live page.

**Free tier:** activate `designMode` on any webpage, make edits, save structured before/after diffs to copy and share. Works on any site.

**Pro tier:** connect a GitHub repo, edit your live site, and commit changes without leaving the page. Also supports local file editing via File System Access API.

## What it's for

Fast content editing - rewriting articles and blurbs, fixing typos, updating copy, adjusting headlines - without opening a code editor or touching a terminal.

## Compatible sites (Pro)

Works best with flat-file, HTML-first sites where the DOM *is* the content: static HTML, GitHub Pages, sites built with Alpine.js, HTMX, Astro, etc. Not built for React/Next.js/Vue or database-backed CMS platforms - unless they use Jamstack-style rendering.

## Architecture

Pure client-side Chrome extension. No Blip backend. Talks directly to GitHub's API. Sidebar runs in an injected iframe (so `designMode` doesn't swallow the controls).

## Status

Working extension, pre-launch. Not yet on the Chrome Web Store.
