// text-diff.js
// Text-diff strategy for plain-text files (.md, .txt, .json, .xml, etc.)
// Used when the page has no meaningful DOM structure (browser renders as <pre> block).
// Also serves as a fallback when the DOM-mapping engine finds zero changes
// but the mutation observer detected edits.

'use strict';

// -------------------------------------------------------
// State
// -------------------------------------------------------
let textDiffSnapshot = null;   // Text content captured at edit-start
let textDiffActive = false;    // Whether this strategy is in use

// -------------------------------------------------------
// Detection: should we use text-diff for this page?
// -------------------------------------------------------

/**
 * Detect whether the current page is a browser-rendered plain-text file.
 * Chrome (and other browsers) wrap raw text files in a single <pre> element
 * inside the <body>. This is the signature we look for.
 *
 * Returns true if the page appears to be a plain-text rendering.
 */
function isPlainTextPage() {
  const body = document.body;
  if (!body) return false;

  // Chrome's plain-text rendering: body contains exactly one <pre> child
  const children = Array.from(body.children);
  if (children.length === 1 && children[0].tagName === 'PRE') return true;

  // Some browsers may add a <style> element alongside the <pre>
  const nonStyleChildren = children.filter(el => el.tagName !== 'STYLE');
  if (nonStyleChildren.length === 1 && nonStyleChildren[0].tagName === 'PRE') return true;

  return false;
}

/**
 * Get the <pre> element that contains the file content.
 * Returns null if not a plain-text page.
 */
function getPreElement() {
  if (!document.body) return null;
  const pre = document.body.querySelector('pre');
  return pre || null;
}

// -------------------------------------------------------
// Snapshot: capture text at edit-start
// -------------------------------------------------------

/**
 * Take a snapshot of the current text content.
 * Call this at the start of an edit session.
 */
function snapshotText() {
  const pre = getPreElement();
  if (pre) {
    textDiffSnapshot = pre.textContent;
    textDiffActive = true;
  } else {
    // Fallback: snapshot the full body text
    textDiffSnapshot = document.body.textContent;
    textDiffActive = true;
  }
  return textDiffSnapshot;
}

/**
 * Get the current text content (for comparison at save time).
 */
function getCurrentText() {
  const pre = getPreElement();
  if (pre) return pre.textContent;
  return document.body.textContent;
}

/**
 * Clear the snapshot (call on cancel or after save).
 */
function clearTextSnapshot() {
  textDiffSnapshot = null;
  textDiffActive = false;
}

// -------------------------------------------------------
// Diff generation: line-by-line comparison
// -------------------------------------------------------

/**
 * Compare two strings line by line and produce an array of change regions.
 * Each region is { beforeLines: string[], afterLines: string[], lineNumber: number }.
 *
 * Uses a simple LCS-adjacent approach: walk both arrays, find matching lines,
 * collect differences. Not optimal for huge files but fast enough for
 * typical web content files (< 5000 lines).
 */
function computeLineDiff(before, after) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const changes = [];

  let i = 0; // index into beforeLines
  let j = 0; // index into afterLines

  while (i < beforeLines.length || j < afterLines.length) {
    // Lines match: advance both
    if (i < beforeLines.length && j < afterLines.length && beforeLines[i] === afterLines[j]) {
      i++;
      j++;
      continue;
    }

    // Lines differ: collect the changed region
    const changeStart = i;
    const removedLines = [];
    const addedLines = [];

    // Look ahead to find the next sync point
    const syncPoint = findSyncPoint(beforeLines, afterLines, i, j);

    // Collect removed lines (in before but not after)
    while (i < syncPoint.beforeIdx) {
      removedLines.push(beforeLines[i]);
      i++;
    }

    // Collect added lines (in after but not before)
    while (j < syncPoint.afterIdx) {
      addedLines.push(afterLines[j]);
      j++;
    }

    if (removedLines.length > 0 || addedLines.length > 0) {
      changes.push({
        lineNumber: changeStart + 1, // 1-indexed for display
        beforeLines: removedLines,
        afterLines: addedLines
      });
    }
  }

  return changes;
}

/**
 * Find the next point where beforeLines[bi] === afterLines[aj]
 * by scanning ahead in both arrays. Returns { beforeIdx, afterIdx }.
 */
function findSyncPoint(beforeLines, afterLines, bi, aj) {
  // Look ahead up to 50 lines in each direction for a matching line
  const maxLookahead = 50;

  for (let range = 1; range <= maxLookahead; range++) {
    // Check if advancing 'before' by 'range' finds a match in 'after'
    if (bi + range < beforeLines.length) {
      for (let k = aj; k < Math.min(aj + range + 1, afterLines.length); k++) {
        if (beforeLines[bi + range] === afterLines[k]) {
          return { beforeIdx: bi + range, afterIdx: k };
        }
      }
    }

    // Check if advancing 'after' by 'range' finds a match in 'before'
    if (aj + range < afterLines.length) {
      for (let k = bi; k < Math.min(bi + range + 1, beforeLines.length); k++) {
        if (beforeLines[k] === afterLines[aj + range]) {
          return { beforeIdx: k, afterIdx: aj + range };
        }
      }
    }
  }

  // No sync found within lookahead: consume everything remaining
  return { beforeIdx: beforeLines.length, afterIdx: afterLines.length };
}

// -------------------------------------------------------
// Format diff output (compatible with edit-history.js format)
// -------------------------------------------------------

/**
 * Build diff snippets from a line diff, in the same { before, after } format
 * that buildDiffSnippets() in edit-history.js produces.
 *
 * Each change region becomes one snippet. Context lines (1 above, 1 below)
 * are included when available to help the user locate the change.
 */
function buildTextDiffSnippets(beforeText, afterText) {
  const changes = computeLineDiff(beforeText, afterText);
  const beforeLines = beforeText.split('\n');
  const afterLines = afterText.split('\n');
  const snippets = [];

  for (const change of changes) {
    // Add 1 line of context above if available
    const contextAboveIdx = change.lineNumber - 2; // 0-indexed, one line before
    let contextAbove = '';
    if (contextAboveIdx >= 0 && contextAboveIdx < beforeLines.length) {
      contextAbove = beforeLines[contextAboveIdx] + '\n';
    }

    // Build before snippet
    const beforeContent = change.beforeLines.length > 0
      ? change.beforeLines.join('\n')
      : '(empty)';

    // Build after snippet
    const afterContent = change.afterLines.length > 0
      ? change.afterLines.join('\n')
      : '(empty)';

    snippets.push({
      before: contextAbove + beforeContent,
      after: contextAbove + afterContent
    });
  }

  return snippets;
}

/**
 * Apply text-diff changes: replace the entire source content with
 * the current editor text. For plain-text files, there's no HTML structure
 * to splice into, so we just return the full new text.
 *
 * @param {string} sourceContent - original file content
 * @returns {object} { newContent, snippets, changeCount } or { noChanges: true }
 */
function applyTextDiff(sourceContent) {
  const currentText = getCurrentText();

  if (!textDiffSnapshot || currentText === textDiffSnapshot) {
    return { noChanges: true };
  }

  // Generate snippets for the edits textarea
  const snippets = buildTextDiffSnippets(textDiffSnapshot, currentText);

  // The new file content is simply the current text
  // (for plain-text files, what you see is what you get)
  return {
    newContent: currentText,
    snippets: snippets,
    changeCount: snippets.length,
    noChanges: false
  };
}
