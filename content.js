'use strict';
// Blip content script - core: sidebar, edit session, observer, save, cancel

// -------------------------------------------------------
// Shared state (referenced by github.js, mapping.js,
// local-fs.js, text-diff.js)
// -------------------------------------------------------
let githubConfig = null;
let sidebarFrame = null;
let isEditing = false;
let sourceContent = null;
let sourceSHA = null;
let sourceDOM = null;
let textNodeMap = [];
let parentMap = [];
let observer = null;
let mutations = [];
let mutatedParents = new Set();
let isSaving = false;
let lastSaveTime = 0;
let lastSaveData = null;
let hasEdits = false;
let editableFiles = [];
let resolvedFilePath = null;
let useTextDiff = false;  // true when text-diff strategy is active

const SAVE_GRACE_MS = 5000;
let currentSidebarWidth = 0;

// -------------------------------------------------------
// Sidebar injection
// -------------------------------------------------------
function injectSidebar() {
  if (document.getElementById('blip-sidebar-frame')) return;

  sidebarFrame = document.createElement('iframe');
  sidebarFrame.id = 'blip-sidebar-frame';
  sidebarFrame.src = chrome.runtime.getURL('sidebar.html');
  sidebarFrame.setAttribute('allowtransparency', 'true');

  // Restore saved position
  chrome.storage.local.get(['blipTabY'], (result) => {
    if (result.blipTabY !== undefined) {
      sidebarFrame.style.top = result.blipTabY + 'px';
    }
  });

  document.documentElement.appendChild(sidebarFrame);
  window.addEventListener('message', handleSidebarMessage);

  sidebarFrame.addEventListener('load', () => {
    getSidebarState().then((storedState) => {
      if (storedState === 'expanded') expandSidebar();
      else if (storedState === 'collapsed') collapseSidebar();
      else if (BLIP_CONFIG.sidebar.startCollapsed) collapseSidebar();
      else expandSidebar();
    });
  });
}

function collapseSidebar() {
  currentSidebarWidth = 0;
  if (sidebarFrame) {
    sidebarFrame.classList.add('blip-iframe-collapsed');
    sidebarFrame.classList.remove('blip-iframe-expanded');

    // Restore dragged position when collapsed
    chrome.storage.local.get(['blipTabY'], (result) => {
      sidebarFrame.style.top = (result.blipTabY !== undefined ? result.blipTabY : 0) + 'px';
    });
  }
  document.documentElement.classList.remove('blip-sidebar-open');
  sendToSidebar('collapse');
  saveSidebarState('collapsed');
}

function expandSidebar() {
  currentSidebarWidth = 300;
  if (sidebarFrame) {
    sidebarFrame.classList.add('blip-iframe-expanded');
    sidebarFrame.classList.remove('blip-iframe-collapsed');
    sidebarFrame.style.top = '0px'; // Lock to top when expanded
  }
  document.documentElement.classList.add('blip-sidebar-open');
  sendToSidebar('expand');
  saveSidebarState('expanded');
}

function saveSidebarState(state) {
  try {
    chrome.storage.local.set({ blipSidebarState: state, blipSidebarTimestamp: Date.now() });
  } catch (e) { /* ignore */ }
}

async function getSidebarState() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['blipSidebarState', 'blipSidebarTimestamp'], (result) => {
        if (chrome.runtime.lastError || !result.blipSidebarState) { resolve(null); return; }
        const age = Date.now() - (result.blipSidebarTimestamp || 0);
        if (age > 30 * 60 * 1000) { resolve(null); return; }
        resolve(result.blipSidebarState);
      });
    } catch (e) { resolve(null); }
  });
}

function removeSidebar() {
  if (sidebarFrame) { sidebarFrame.remove(); sidebarFrame = null; }
  document.documentElement.classList.remove('blip-sidebar-open');
  document.documentElement.style.removeProperty('--blip-sidebar-width');
  window.removeEventListener('message', handleSidebarMessage);
}

// -------------------------------------------------------
// Sidebar communication
// -------------------------------------------------------
function sendToSidebar(action, data = {}) {
  if (!sidebarFrame || !sidebarFrame.contentWindow) return;
  sidebarFrame.contentWindow.postMessage({ source: 'blip-content', action, ...data }, '*');
}

function devLog(label, value, status = '', entryId = null) {
  if (!BLIP_CONFIG.dev.enabled) return;
  sendToSidebar('devLog', { label, value, status, entryId });
}

function devSeparator() {
  if (!BLIP_CONFIG.dev.enabled) return;
  sendToSidebar('devSeparator');
}

function handleSidebarMessage(event) {
  const msg = event.data;
  if (msg.source !== 'blip-sidebar') return;
  switch (msg.action) {
    case 'dragStart':
      isDraggingSidebar = true;
      dragOffsetY = msg.offsetY;
      document.body.style.userSelect = 'none';
      sidebarFrame.style.pointerEvents = 'none';
      break;
    case 'ready': sendInitialDevLogs(); break;
    case 'startEdit': startEditSession(); break;
    case 'save':
      // Route: local mode goes to saveLocalEdits (in local-fs.js),
      // otherwise standard saveEdits
      if (isLocalMode && sourceSHA === 'local-file') {
        saveLocalEdits();
      } else {
        saveEdits(msg.commitToRepo !== false && !!resolvedFilePath);
      }
      break;
    case 'saveLocal': saveLocalEdits(); break;
    case 'cancel': cancelEdits(); break;
    case 'closeSidebar': cancelEdits(); collapseSidebar(); break;
    case 'expandSidebar': expandSidebar(); break;
    case 'reloadPage': window.location.reload(); break;
    case 'grantLocalAccess': handleGrantLocalAccess(); break;
    case 'navigateTo': window.location.href = msg.url; break;
  }
}

function sendInitialDevLogs() {
  devLog('Site', window.location.hostname || 'local file', 'success');
  if (githubConfig) {
    devLog('Repo', `${githubConfig.owner}/${githubConfig.repo}`, '');
    devLog('Branch', githubConfig.branch, '');
  }
  devLog('Path', window.location.pathname, '');
  devLog('File', resolvedFilePath || 'resolving...', resolvedFilePath ? 'success' : '', 'resolved-file');
  devSeparator();
  devLog('Source', 'initializing...', '', 'source-status');
  devLog('File SHA', '-', '', 'file-sha');
  devSeparator();
  devLog('Mode', 'designMode OFF, body non-editable', '', 'edit-mode');
  devLog('Observer', 'idle', '', 'observer-status');
  if (editableFiles.length > 0) {
    sendToSidebar('fileInfo', {
      resolvedFile: resolvedFilePath,
      editableFiles: editableFiles.map(f => f.name),
      siteUrl: githubConfig ? githubConfig.siteUrl : null,
      connected: !!resolvedFilePath
    });
  }
}

// -------------------------------------------------------
// MutationObserver
// -------------------------------------------------------
function startObserving() {
  mutations = [];
  mutatedParents.clear();

  observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'characterData') {
        const target = mutation.target;
        const mapping = textNodeMap.find(m => m.liveNode === target);
        if (!mapping) continue;
        const existing = mutations.find(m => m.liveNode === target);
        if (existing) {
          existing.newText = target.textContent;
        } else {
          mutations.push({
            liveNode: target,
            originalText: mapping.originalText,
            newText: target.textContent,
            sourceOffset: mapping.sourceOffset,
            sourceLength: mapping.sourceLength,
            parentMapped: mapping.parentMapped
          });
        }
        if (!hasEdits) { hasEdits = true; sendToSidebar('editsDetected'); }
      }

      if (mutation.type === 'childList') {
        const parent = mutation.target;
        if (parent && parent.nodeType === Node.ELEMENT_NODE) {
          mutatedParents.add(parent);
          for (const pm of parentMap) {
            if (pm.liveParent === parent || pm.liveParent.contains(parent)) {
              mutatedParents.add(pm.liveParent);
            }
          }
          if (!hasEdits) { hasEdits = true; sendToSidebar('editsDetected'); }
        }
      }
    }
  });

  setTimeout(() => {
    observer.observe(document.body, { characterData: true, childList: true, subtree: true });
    devLog('Observer', 'active', 'success', 'observer-status');
  }, BLIP_CONFIG.observer.settleDelayMs);
}

function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
    devLog('Observer', 'stopped', '', 'observer-status');
  }
}

// -------------------------------------------------------
// Paste interception
// -------------------------------------------------------
function interceptPaste() { document.addEventListener('paste', onPaste, true); }
function uninterceptPaste() { document.removeEventListener('paste', onPaste, true); }

function onPaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  selection.collapseToEnd();
}

// -------------------------------------------------------
// Edit session
// -------------------------------------------------------
async function startEditSession() {
  try {
    devSeparator();

    const withinGracePeriod = lastSaveData && (Date.now() - lastSaveTime < SAVE_GRACE_MS);

    // Source selection: local file > freemium > grace period > baseline > fetch
    if (isLocalMode && sourceContent && sourceSHA === 'local-file') {
      // Local file mode: source already loaded from FSAA
      devLog('Source', `using local file (${sourceContent.length} bytes)`, 'success', 'source-status');
    } else if (!resolvedFilePath) {
      sourceContent = document.documentElement.outerHTML;
      sourceSHA = 'local-only';
      devLog('Source', 'using local DOM (freemium mode)', 'success', 'source-status');
    } else if (withinGracePeriod) {
      sourceContent = lastSaveData.content;
      sourceSHA = lastSaveData.sha;
      devLog('Source', `using cached version (saved ${Math.round((Date.now() - lastSaveTime) / 1000)}s ago)`, 'success', 'source-status');
      devLog('File SHA', sourceSHA.substring(0, 7) + ' (cached from last save)', 'success', 'file-sha');
    } else if (sourceContent && sourceSHA) {
      devLog('Source', `using baseline (${sourceContent.length} bytes)`, 'success', 'source-status');
      devLog('File SHA', sourceSHA.substring(0, 7) + ' (baseline)', 'success', 'file-sha');
    } else {
      devLog('Source', 'fetching from GitHub...', '', 'source-status');
      const t0 = Date.now();
      const result = await fetchFromGitHub();
      const latency = Date.now() - t0;
      sourceContent = result.content;
      sourceSHA = result.sha;
      devLog('Source', `fetched (${latency}ms, ${result.size} bytes)`, 'success', 'source-status');
      devLog('File SHA', result.sha.substring(0, 7) + ' (fetched)', 'success', 'file-sha');
    }

    const parser = new DOMParser();
    sourceDOM = parser.parseFromString(sourceContent, 'text/html');
    devLog('Parsed source', `${sourceDOM.body.querySelectorAll('*').length} elements`, 'success');

    buildTextNodeMap(document.body, sourceContent);
    interceptPaste();
    startObserving();

    // Activate text-diff strategy for plain-text pages, or as fallback
    if (isPlainTextPage()) {
      useTextDiff = true;
      snapshotText();
      devLog('Strategy', 'text-diff (plain-text file)', 'success');
    } else {
      useTextDiff = false;
      // Still take a snapshot as fallback for DOM engine misses
      snapshotText();
      devLog('Strategy', 'DOM-mapping (HTML page)', 'success');
    }

    document.body.contentEditable = 'true';
    document.designMode = 'on';
    document.documentElement.classList.add('blip-editing');
    isEditing = true;

    devLog('Mode', 'designMode ON, body editable', 'success', 'edit-mode');
    sendToSidebar('editStarted');
    sendToSidebar('tabState', { state: 'editing' });

  } catch (err) {
    devLog('Error', err.message, 'error');
    sendToSidebar('error', { userMessage: 'Could not start editing. Try reloading the page.', recoverable: false });
    sendToSidebar('tabState', { state: 'error' });
  }
}

// -------------------------------------------------------
// Save (online / GitHub mode)
// -------------------------------------------------------
async function saveEdits(commitToRepo = true) {
  if (!isEditing || !sourceContent || isSaving) return;
  isSaving = true;
  sendToSidebar('tabState', { state: 'saving' });

  try {
    if (observer) {
      const pending = observer.takeRecords();
      for (const mutation of pending) {
        if (mutation.type === 'characterData') {
          const target = mutation.target;
          const mapping = textNodeMap.find(m => m.liveNode === target);
          if (!mapping) continue;
          const existing = mutations.find(m => m.liveNode === target);
          if (existing) {
            existing.newText = target.textContent;
          } else {
            mutations.push({
              liveNode: target, originalText: mapping.originalText, newText: target.textContent,
              sourceOffset: mapping.sourceOffset, sourceLength: mapping.sourceLength, parentMapped: mapping.parentMapped
            });
          }
        }
        if (mutation.type === 'childList') {
          const parent = mutation.target;
          if (parent && parent.nodeType === Node.ELEMENT_NODE) {
            mutatedParents.add(parent);
            for (const pm of parentMap) {
              if (pm.liveParent === parent || pm.liveParent.contains(parent)) mutatedParents.add(pm.liveParent);
            }
          }
        }
      }
    }

    devSeparator();

    const simpleChanges = mutations.filter(m => !m.parentMapped && m.newText !== m.originalText);
    const parentLevelChanges = [];

    for (const pm of parentMap) {
      const currentInnerHTML = pm.liveParent.innerHTML;
      const normalizedCurrent = stripDynamicAttributes(currentInnerHTML).replace(/\s+/g, ' ').trim();
      const normalizedOriginal = stripDynamicAttributes(pm.sourceInnerHTML).replace(/\s+/g, ' ').trim();
      const liveText = normalizedCurrent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const sourceText = normalizedOriginal.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (liveText === sourceText) continue;
      if (normalizedCurrent !== normalizedOriginal) {
        parentLevelChanges.push({
          liveParent: pm.liveParent, originalInnerHTML: pm.sourceInnerHTML,
          newInnerHTML: currentInnerHTML, sourceOffset: pm.sourceOffset, sourceLength: pm.sourceLength
        });
      }
    }

    for (const parent of mutatedParents) {
      if (parentMap.some(pm => pm.liveParent === parent)) continue;
      const mapping = findParentInSource(parent, sourceContent);
      if (mapping) {
        const currentInnerHTML = parent.innerHTML;
        const normalizedCurrent = stripDynamicAttributes(currentInnerHTML).replace(/\s+/g, ' ').trim();
        const normalizedOriginal = stripDynamicAttributes(mapping.innerHTML).replace(/\s+/g, ' ').trim();
        const liveText = normalizedCurrent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const sourceText = normalizedOriginal.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (liveText === sourceText) continue;
        if (normalizedCurrent !== normalizedOriginal) {
          parentLevelChanges.push({
            liveParent: parent, originalInnerHTML: mapping.innerHTML,
            newInnerHTML: currentInnerHTML, sourceOffset: mapping.offset, sourceLength: mapping.length
          });
          for (let i = simpleChanges.length - 1; i >= 0; i--) {
            const changeParent = simpleChanges[i].liveNode.parentElement;
            if (changeParent === parent || parent.contains(changeParent)) simpleChanges.splice(i, 1);
          }
        }
      }
    }

    const totalChanges = simpleChanges.length + parentLevelChanges.length;
    devLog('Changes', `${totalChanges} edit${totalChanges !== 1 ? 's' : ''} (${simpleChanges.length} simple, ${parentLevelChanges.length} parent-level)`, 'success');

    // --- Text-diff fallback: DOM engine found 0 but edits were detected ---
    if (totalChanges === 0 && hasEdits && textDiffSnapshot) {
      devLog('Fallback', 'DOM engine found 0 changes, trying text-diff', '', 'fallback-status');
      const diffResult = applyTextDiff(sourceContent);

      if (!diffResult.noChanges) {
        devLog('Fallback', `text-diff found ${diffResult.changeCount} region(s)`, 'success', 'fallback-status');

        const diffText = formatDiffEntry(
          window.location.href,
          resolvedFilePath || 'unknown',
          diffResult.snippets
        );
        sendToSidebar('diffEntry', { diffText });

        // For online HTML editing: capture the diff but don't commit
        // text-diff results to GitHub (would lose HTML structure)
        if (!commitToRepo) {
          sourceContent = diffResult.newContent || sourceContent;
        }
        devLog('Fallback', 'diff captured (not committed - HTML structure preservation)', 'success');

        clearTextSnapshot();
        buildTextNodeMap(document.body, sourceContent, true);
        exitEditMode();
        isSaving = false;
        sendToSidebar('saved');
        sendToSidebar('tabState', { state: 'saved' });
        return;
      }
    }

    if (totalChanges === 0) { isSaving = false; sendToSidebar('noChanges'); return; }

    for (const change of simpleChanges) {
      devLog('Edited', getCssSelector(change.liveNode), 'success');
      devLog('\u2192', change.newText, '');
    }
    for (const change of parentLevelChanges) {
      devLog('Edited (parent)', getCssSelector(change.liveParent), 'success');
      devLog('\u2192', change.newInnerHTML.substring(0, 200) + (change.newInnerHTML.length > 200 ? '...' : ''), '');
    }

    const allReplacements = [
      ...simpleChanges.map(c => ({ sourceOffset: c.sourceOffset, sourceLength: c.sourceLength, replacement: c.newText, type: 'simple' })),
      ...parentLevelChanges.map(c => ({ sourceOffset: c.sourceOffset, sourceLength: c.sourceLength, replacement: c.newInnerHTML, type: 'parent' }))
    ].sort((a, b) => b.sourceOffset - a.sourceOffset);

    for (let i = 0; i < allReplacements.length - 1; i++) {
      const current = allReplacements[i];
      const next = allReplacements[i + 1];
      if (next.sourceOffset + next.sourceLength > current.sourceOffset) {
        if (current.type === 'parent') { allReplacements.splice(i + 1, 1); i--; }
        else if (next.type === 'parent') { allReplacements.splice(i, 1); i--; }
      }
    }

    // ---- Generate diff entry and send to sidebar ----
    const diffSnippets = buildDiffSnippets(sourceContent, allReplacements);
    const diffText = formatDiffEntry(
      window.location.href,
      resolvedFilePath || 'unknown',
      diffSnippets
    );
    sendToSidebar('diffEntry', { diffText });
    devLog('Diff', `${diffSnippets.length} snippet(s) captured`, 'success');

    // ---- Apply replacements to source content ----
    let newContent = sourceContent;
    for (const rep of allReplacements) {
      newContent = newContent.substring(0, rep.sourceOffset) + rep.replacement + newContent.substring(rep.sourceOffset + rep.sourceLength);
    }

    // ---- Commit to GitHub (only if commitToRepo is true) ----
    if (commitToRepo) {
      const txId = Date.now();
      const pushTimestamp = new Date().toISOString().slice(11, 23);
      devSeparator();
      devLog('TX', `#${txId} push initiated at ${pushTimestamp}`, '', 'tx-start');
      devLog('Payload SHA', sourceSHA.substring(0, 7) + ' (sent to GitHub)', '', 'tx-payload-sha');
      devLog('Commit', 'pushing to GitHub...', '', 'commit-status');

      const t0 = Date.now();
      const result = await commitToGitHub(newContent, sourceSHA);
      const latency = Date.now() - t0;

      const responseTimestamp = new Date().toISOString().slice(11, 23);
      devLog('TX', `#${txId} response at ${responseTimestamp} (${latency}ms)`, 'success', 'tx-response');
      devLog('HTTP', '200 OK', 'success', 'tx-http');
      devLog('Returned SHA', result.sha.substring(0, 7) + ' (from server)', 'success', 'tx-returned-sha');

      const oldSHA = sourceSHA;
      sourceSHA = result.sha;
      sourceContent = newContent;
      lastSaveTime = Date.now();
      lastSaveData = { content: newContent, sha: result.sha };

      const stateUpdated = sourceSHA === result.sha;
      devLog('State',
        stateUpdated
          ? `\u2713 local SHA updated: ${oldSHA.substring(0, 7)} \u2192 ${sourceSHA.substring(0, 7)}`
          : `\u2717 SHA mismatch! local=${sourceSHA.substring(0, 7)} server=${result.sha.substring(0, 7)}`,
        stateUpdated ? 'success' : 'error', 'tx-state'
      );
      devLog('Commit', result.commitSha.substring(0, 7), 'success', 'commit-status');
      buildTextNodeMap(document.body, sourceContent, true);
    } else {
      // Diff-only save: update source content locally but don't push
      sourceContent = newContent;
      devLog('Save', 'diff captured (no GitHub commit)', 'success');
      buildTextNodeMap(document.body, sourceContent, true);
    }

    clearTextSnapshot();
    exitEditMode();
    isSaving = false;
    sendToSidebar('saved');
    sendToSidebar('tabState', { state: 'saved' });

  } catch (err) {
    isSaving = false;
    sendToSidebar('tabState', { state: 'error' });
    const errorTimestamp = new Date().toISOString().slice(11, 23);
    const statusMatch = err.message.match(/\((\d{3})\)/);
    const httpStatus = statusMatch ? statusMatch[1] : 'unknown';
    const is409 = httpStatus === '409';
    const isNetwork = err.message.includes('Failed to fetch') || err.message.includes('NetworkError');

    devLog('TX', `error at ${errorTimestamp}`, 'error', 'tx-response');
    devLog('HTTP', isNetwork ? 'network failure' : httpStatus, 'error', 'tx-http');
    devLog('Payload SHA', sourceSHA.substring(0, 7) + ' (was sent)', 'error', 'tx-payload-sha');
    devLog('Error', err.message, 'error');

    if (is409) {
      exitEditMode();
      sendToSidebar('syncError', { userMessage: 'Out of sync. Re-syncing now...' });
      autoRecover();
    } else if (isNetwork) {
      sendToSidebar('error', { userMessage: 'Network error. Check your connection and try saving again.', recoverable: true });
    } else {
      exitEditMode();
      sendToSidebar('syncError', { userMessage: 'Something went wrong. Re-syncing now...' });
      autoRecover();
    }
  }
}

// -------------------------------------------------------
// Auto-recovery
// -------------------------------------------------------
async function autoRecover() {
  try {
    devSeparator();
    devLog('Recovery', 'fetching latest from GitHub...', '', 'recovery-status');
    const t0 = Date.now();
    const result = await fetchFromGitHub();
    const latency = Date.now() - t0;
    const oldSHA = sourceSHA;
    sourceContent = result.content;
    sourceSHA = result.sha;
    lastSaveData = { content: result.content, sha: result.sha };
    lastSaveTime = Date.now();
    devLog('Recovery', `synced in ${latency}ms`, 'success', 'recovery-status');
    devLog('State', `\u2713 SHA updated: ${oldSHA ? oldSHA.substring(0, 7) : 'null'} \u2192 ${result.sha.substring(0, 7)}`, 'success', 'recovery-state');
    sendToSidebar('recovered');
  } catch (recoverErr) {
    devLog('Recovery', `failed: ${recoverErr.message}`, 'error', 'recovery-status');
    sendToSidebar('recoveryFailed', { userMessage: 'Could not sync. Please reload the page.' });
  }
}

// -------------------------------------------------------
// Cancel
// -------------------------------------------------------
function cancelEdits() {
  if (!isEditing) return;
  for (const mapping of textNodeMap) {
    if (mapping.liveNode && mapping.liveNode.textContent !== mapping.originalText) {
      mapping.liveNode.textContent = mapping.originalText;
    }
  }
  for (const pm of parentMap) {
    if (pm.liveParent && pm.liveParent.innerHTML !== pm.originalInnerHTML) {
      pm.liveParent.innerHTML = pm.originalInnerHTML;
    }
  }
  exitEditMode();
  sendToSidebar('cancelled');
  sendToSidebar('tabState', { state: 'default' });
}

// -------------------------------------------------------
// Utilities
// -------------------------------------------------------
function getCssSelector(node) {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!el) return '?';
  const parts = [];
  let current = el;
  while (current && current !== document.body) {
    let segment = current.tagName.toLowerCase();
    if (current.id) { segment += '#' + current.id; parts.unshift(segment); break; }
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName)
      : [];
    if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    parts.unshift(segment);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function stripDynamicAttributes(html) {
  return html
    .replace(/\s+style="[^"]*"/gi, '')
    .replace(/\s+style='[^']*'/gi, '')
    .replace(/\s+:[a-z][^=]*="[^"]*"/gi, '')
    .replace(/\s+x-[a-z][^=]*="[^"]*"/gi, '');
}

function exitEditMode() {
  document.designMode = 'off';
  document.body.removeAttribute('contenteditable');
  clearTextSnapshot();
  document.documentElement.classList.remove('blip-editing');
  isEditing = false;
  hasEdits = false;
  useTextDiff = false;
  devLog('Mode', 'designMode OFF, body non-editable', '', 'edit-mode');
  mutations = [];
  mutatedParents.clear();
  stopObserving();
  uninterceptPaste();
}

// -------------------------------------------------------
// Initialize
// -------------------------------------------------------
function init() {
  const currentHost = window.location.hostname.replace('www.', '');
  injectSidebar();

  // Check if this is a local file before trying GitHub config
  if (isLocalFile()) {
    isLocalMode = true;
    initLocalEditing();
  } else {
    loadSiteConfig(currentHost);
  }
}

async function resolveAndPrefetch() {
  try {
    const t0 = Date.now();
    const repoFiles = await listRepoFiles();
    const listLatency = Date.now() - t0;

    editableFiles = filterEditableFiles(repoFiles);
    devLog('Repo files', `${repoFiles.length} total, ${editableFiles.length} editable`, 'success', 'repo-files');

    resolvedFilePath = resolveFilePath(window.location.pathname, editableFiles);

    if (!resolvedFilePath) {
      devLog('File', `no match for "${window.location.pathname}"`, 'error', 'resolved-file');
      sendToSidebar('fileInfo', {
        resolvedFile: null,
        editableFiles: editableFiles.map(f => f.name),
        siteUrl: githubConfig.siteUrl,
        connected: false
      });
      return;
    }

    devLog('File', resolvedFilePath, 'success', 'resolved-file');
    sendToSidebar('fileInfo', {
      resolvedFile: resolvedFilePath,
      editableFiles: editableFiles.map(f => f.name),
      siteUrl: githubConfig.siteUrl,
      connected: true
    });

    const t1 = Date.now();
    const result = await fetchFromGitHub(resolvedFilePath);
    const fetchLatency = Date.now() - t1;

    sourceContent = result.content;
    sourceSHA = result.sha;

    devLog('Prefetch', `ready (${listLatency + fetchLatency}ms, ${result.size} bytes)`, 'success', 'prefetch-status');
    devLog('File SHA', result.sha.substring(0, 7) + ' (baseline)', 'success', 'file-sha');

  } catch (err) {
    devLog('Init', `failed: ${err.message}`, 'error', 'prefetch-status');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


let isDraggingSidebar = false;
let dragOffsetY = 0;

// Listeners for dragging the iframe
document.addEventListener('mousemove', (e) => {
  if (!isDraggingSidebar || !sidebarFrame) return;

  // Calculate new position based on host mouse Y minus the initial click offset
  const newTop = Math.max(0, Math.min(window.innerHeight - 48, e.clientY - dragOffsetY));
  sidebarFrame.style.top = newTop + 'px';
});

document.addEventListener('mouseup', () => {
  if (!isDraggingSidebar) return;
  isDraggingSidebar = false;
  document.body.style.userSelect = '';
  if (sidebarFrame) sidebarFrame.style.pointerEvents = '';

  // Save the final position to local storage
  const finalTop = parseInt(sidebarFrame.style.top || '0', 10);
  chrome.storage.local.set({ blipTabY: finalTop });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggle_blip_sidebar") {
    const sidebarIframe = document.getElementById('blip-sidebar-frame');

    if (sidebarIframe) {
      if (sidebarIframe.style.display === "none") {
        sidebarIframe.style.display = "block";
      } else {
        sidebarIframe.style.display = "none";
      }
    } else {
      console.warn("Blip: Sidebar iframe not found on the page.");
    }
  }
});
