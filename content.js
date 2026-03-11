// Blip content script
// Injected into matched pages. Manages sidebar, editing, observation, and commit flow.

(function () {
  'use strict';

  // -------------------------------------------------------
  // State
  // -------------------------------------------------------
  let sidebarFrame = null;
  let isEditing = false;
  let sourceContent = null;   // raw file string from GitHub
  let sourceSHA = null;
  let sourceDOM = null;       // DOMParser result of the source
  let textNodeMap = [];       // { liveNode, sourceOffset, sourceLength, parentMapped }
  let parentMap = [];         // { liveParent, sourceInnerHTML, sourceOffset, sourceLength }
  let observer = null;        // MutationObserver
  let mutations = [];         // recorded characterData mutations
  let mutatedParents = new Set(); // parents that had structural (childList) mutations
  let isSaving = false;       // lock to prevent concurrent saves
  let lastSaveTime = 0;       // timestamp of last successful save
  let lastSaveData = null;    // { content, sha } from last successful save
  let hasEdits = false;       // whether any mutations have been detected
  const SAVE_GRACE_MS = 5000; // use cached data if editing within this window

  // Multi-file state
  let repoFiles = [];         // list of files from GitHub repo
  let editableFiles = [];     // filtered to editable extensions
  let resolvedFilePath = null; // the file path resolved for the current URL

  // -------------------------------------------------------
  // Sidebar injection
  // -------------------------------------------------------
  let dragHandle = null;
  let collapsedTab = null;
  let currentSidebarWidth = 0;

  function injectSidebar() {
    if (document.getElementById('blip-sidebar-frame')) return;

    const width = BLIP_CONFIG.sidebar.defaultWidthPx;

    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id = 'blip-sidebar-frame';
    sidebarFrame.src = chrome.runtime.getURL('sidebar.html');
    sidebarFrame.style.width = width + 'px';

    document.documentElement.appendChild(sidebarFrame);

    injectDragHandle(width);
    injectCollapsedTab();

    window.addEventListener('message', handleSidebarMessage);

    // Start collapsed or expanded based on config
    if (BLIP_CONFIG.sidebar.startCollapsed) {
      collapseSidebar();
    } else {
      currentSidebarWidth = width;
      document.documentElement.style.setProperty('--blip-sidebar-width', width + 'px');
      document.documentElement.classList.add('blip-sidebar-open');
    }
  }

  function injectDragHandle(initialLeft) {
    if (dragHandle) return;

    dragHandle = document.createElement('div');
    dragHandle.id = 'blip-drag-handle';
    dragHandle.style.left = initialLeft + 'px';
    dragHandle.addEventListener('mousedown', startDrag);
    document.documentElement.appendChild(dragHandle);
  }

  function injectCollapsedTab() {
    if (collapsedTab) return;

    collapsedTab = document.createElement('div');
    collapsedTab.id = 'blip-collapsed-tab';
    collapsedTab.textContent = 'blip';
    collapsedTab.addEventListener('click', expandSidebar);
    document.documentElement.appendChild(collapsedTab);
  }

  function setSidebarWidth(w) {
    const clamped = Math.max(BLIP_CONFIG.sidebar.minWidthPx, Math.min(BLIP_CONFIG.sidebar.maxWidthPx, w));
    currentSidebarWidth = clamped;

    if (sidebarFrame) {
      sidebarFrame.style.width = clamped + 'px';
    }
    document.documentElement.style.setProperty('--blip-sidebar-width', clamped + 'px');
    if (dragHandle) dragHandle.style.left = clamped + 'px';
  }

  function collapseSidebar() {
    currentSidebarWidth = 0;
    if (sidebarFrame) {
      sidebarFrame.style.display = 'none';
    }
    document.documentElement.classList.remove('blip-sidebar-open');
    document.documentElement.style.setProperty('--blip-sidebar-width', '0px');
    if (dragHandle) {
      dragHandle.style.left = '0px';
      dragHandle.style.display = 'none';
    }
    if (collapsedTab) {
      collapsedTab.style.display = 'block';
    }
  }

  function expandSidebar() {
    const width = BLIP_CONFIG.sidebar.defaultWidthPx;
    currentSidebarWidth = width;
    if (sidebarFrame) {
      sidebarFrame.style.display = '';
      sidebarFrame.style.width = width + 'px';
    }
    document.documentElement.classList.add('blip-sidebar-open');
    document.documentElement.style.setProperty('--blip-sidebar-width', width + 'px');
    if (dragHandle) {
      dragHandle.style.left = width + 'px';
      dragHandle.style.display = '';
    }
    if (collapsedTab) {
      collapsedTab.style.display = 'none';
    }
  }

  function startDrag(e) {
    e.preventDefault();

    if (sidebarFrame) sidebarFrame.style.transition = 'none';
    if (dragHandle) dragHandle.style.transition = 'none';

    const onMove = (ev) => {
      const x = ev.clientX;
      if (x < 60) {
        collapseSidebar();
        onUp();
        return;
      }
      const w = Math.max(BLIP_CONFIG.sidebar.minWidthPx, Math.min(BLIP_CONFIG.sidebar.maxWidthPx, x));
      currentSidebarWidth = w;
      if (sidebarFrame) sidebarFrame.style.width = w + 'px';
      document.documentElement.style.setProperty('--blip-sidebar-width', w + 'px');
      if (dragHandle) dragHandle.style.left = w + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      if (sidebarFrame) sidebarFrame.style.transition = '';
      if (dragHandle) dragHandle.style.transition = '';
    };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function removeSidebar() {
    if (sidebarFrame) {
      sidebarFrame.remove();
      sidebarFrame = null;
    }
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
      case 'ready':
        sendInitialDevLogs();
        break;
      case 'startEdit':
        startEditSession();
        break;
      case 'save':
        saveEdits();
        break;
      case 'cancel':
        cancelEdits();
        break;
      case 'closeSidebar':
        cancelEdits();
        collapseSidebar();
        break;
      case 'reloadPage':
        window.location.reload();
        break;
    }
  }

  function sendInitialDevLogs() {
    devLog('Site', window.location.hostname, 'success');
    devLog('Repo', `${BLIP_CONFIG.github.owner}/${BLIP_CONFIG.github.repo}`, '');
    devLog('Branch', BLIP_CONFIG.github.branch, '');
    devLog('Path', window.location.pathname, '');
    devLog('File', resolvedFilePath || 'resolving...', resolvedFilePath ? 'success' : '', 'resolved-file');
    devSeparator();
    devLog('Source', 'initializing...', '', 'source-status');
    devLog('File SHA', '-', '', 'file-sha');
    devSeparator();
    devLog('Mode', 'designMode OFF', '', 'edit-mode');
    devLog('Observer', 'idle', '', 'observer-status');
  }

  // -------------------------------------------------------
  // GitHub communication (via background script)
  // -------------------------------------------------------
  async function listRepoFiles() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'GITHUB_LIST_FILES', config: BLIP_CONFIG.github },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  async function fetchFromGitHub(filePath) {
    const configWithPath = { ...BLIP_CONFIG.github, filePath: filePath || resolvedFilePath };
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'GITHUB_FETCH', config: configWithPath },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  async function commitToGitHub(content, sha) {
    const configWithPath = { ...BLIP_CONFIG.github, filePath: resolvedFilePath };
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'GITHUB_COMMIT', config: configWithPath, content, sha },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  // -------------------------------------------------------
  // File resolution: URL path → repo file path
  // -------------------------------------------------------
  function resolveFilePath(pathname, files) {
    // Clean the pathname
    let path = pathname.replace(/^\/+|\/+$/g, ''); // strip leading/trailing slashes

    // Root path → index.html
    if (!path || path === '') {
      const indexFile = files.find(f => f.name === 'index.html');
      return indexFile ? indexFile.path : null;
    }

    // Strip trailing slash and hash/query
    path = path.split('#')[0].split('?')[0];

    // Strategy 1: exact match (e.g., path is "strategy-agent.html")
    const exactMatch = files.find(f => f.path === path || f.name === path);
    if (exactMatch) return exactMatch.path;

    // Strategy 2: append each editable extension
    for (const ext of BLIP_CONFIG.files.editableExtensions) {
      const withExt = path + ext;
      const match = files.find(f => f.path === withExt || f.name === withExt);
      if (match) return match.path;
    }

    // Strategy 3: try the last segment of the path (for /about → about.html)
    const lastSegment = path.split('/').pop();
    if (lastSegment !== path) {
      for (const ext of BLIP_CONFIG.files.editableExtensions) {
        const withExt = lastSegment + ext;
        const match = files.find(f => f.name === withExt);
        if (match) return match.path;
      }
    }

    return null;
  }

  function filterEditableFiles(files) {
    return files.filter(f => {
      // Must have an editable extension
      const hasEditableExt = BLIP_CONFIG.files.editableExtensions.some(ext =>
        f.name.toLowerCase().endsWith(ext)
      );
      if (!hasEditableExt) return false;

      // Exclude files matching exclude patterns
      if (BLIP_CONFIG.files.excludePatterns) {
        const excluded = BLIP_CONFIG.files.excludePatterns.some(pattern =>
          f.name.toLowerCase().includes(pattern.toLowerCase())
        );
        if (excluded) return false;
      }

      return true;
    });
  }

  // -------------------------------------------------------
  // Inline element detection
  // -------------------------------------------------------
  const INLINE_TAGS = new Set([
    'a', 'abbr', 'b', 'bdo', 'br', 'cite', 'code', 'dfn', 'em', 'i',
    'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small',
    'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
  ]);

  function isMixedContentParent(el) {
    // A mixed-content parent has at least one text node child AND at least one element child.
    // This covers inline elements (span, strong, a, etc.) AND block elements (div, p, etc.)
    // because designMode can restructure any sibling relationship during editing.
    let hasTextChild = false;
    let hasElementChild = false;
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
        hasTextChild = true;
      }
      if (child.nodeType === Node.ELEMENT_NODE) {
        hasElementChild = true;
      }
      if (hasTextChild && hasElementChild) return true;
    }
    return false;
  }

  // -------------------------------------------------------
  // Text node mapping (dual-track: simple text nodes + mixed-content parents)
  // -------------------------------------------------------
  function buildTextNodeMap(liveRoot, sourceString, silent = false) {
    textNodeMap = [];
    parentMap = [];
    const processedParents = new Set();
    const liveTextNodes = getTextNodes(liveRoot);

    for (const liveNode of liveTextNodes) {
      const text = liveNode.textContent;
      if (!text || !text.trim()) continue;

      const parentEl = liveNode.parentElement;

      // Check if this text node lives inside a mixed-content parent
      if (parentEl && isMixedContentParent(parentEl) && !processedParents.has(parentEl)) {
        processedParents.add(parentEl);

        const parentMapping = findParentInSource(parentEl, sourceString);
        if (parentMapping) {
          parentMap.push({
            liveParent: parentEl,
            sourceInnerHTML: parentMapping.innerHTML,
            sourceOffset: parentMapping.offset,
            sourceLength: parentMapping.length,
            originalInnerHTML: parentMapping.innerHTML
          });
        }

        // Still map individual text nodes so the observer can detect changes
        mapTextNodesInParent(parentEl, sourceString);
        continue;
      }

      // Skip if already handled as part of a mixed-content parent
      if (parentEl && processedParents.has(parentEl)) continue;

      // Simple text node: direct offset mapping
      const offset = findTextInSource(text, liveNode, sourceString);
      if (offset !== -1) {
        textNodeMap.push({
          liveNode,
          sourceOffset: offset,
          sourceLength: text.length,
          originalText: text,
          parentMapped: false
        });
      }
    }

    if (!silent) {
      devLog('Mapped nodes', `${textNodeMap.length} text nodes`, 'success');
      if (parentMap.length > 0) {
        devLog('Mixed parents', `${parentMap.length} parent-level maps`, 'success');
      }
    }
  }

  function mapTextNodesInParent(parentEl, sourceString) {
    for (const child of parentEl.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
        const offset = findTextInSource(child.textContent, child, sourceString);
        if (offset !== -1) {
          textNodeMap.push({
            liveNode: child,
            sourceOffset: offset,
            sourceLength: child.textContent.length,
            originalText: child.textContent,
            parentMapped: true
          });
        }
      }
      if (child.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has(child.tagName.toLowerCase())) {
        for (const grandchild of child.childNodes) {
          if (grandchild.nodeType === Node.TEXT_NODE && grandchild.textContent.trim()) {
            const offset = findTextInSource(grandchild.textContent, grandchild, sourceString);
            if (offset !== -1) {
              textNodeMap.push({
                liveNode: grandchild,
                sourceOffset: offset,
                sourceLength: grandchild.textContent.length,
                originalText: grandchild.textContent,
                parentMapped: true
              });
            }
          }
        }
      }
    }
  }

  function findParentInSource(liveParent, sourceString) {
    const tag = liveParent.tagName.toLowerCase();
    const innerHTML = liveParent.innerHTML;

    // Find all instances of this tag in source
    const tagRegex = new RegExp(`<${tag}[^>]*>`, 'gi');
    let match;
    const candidates = [];
    while ((match = tagRegex.exec(sourceString)) !== null) {
      candidates.push({ offset: match.index, tagLength: match[0].length });
    }

    if (candidates.length === 0) return null;

    // For each candidate, extract innerHTML and compare
    for (const candidate of candidates) {
      const afterOpenTag = candidate.offset + candidate.tagLength;
      const closeIdx = findMatchingCloseTag(sourceString, afterOpenTag, tag);
      if (closeIdx === -1) continue;

      const candidateInnerHTML = sourceString.substring(afterOpenTag, closeIdx);
      const candidateText = candidateInnerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const innerText = innerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

      if (candidateText === innerText) {
        return {
          innerHTML: candidateInnerHTML,
          offset: afterOpenTag,
          length: candidateInnerHTML.length
        };
      }
    }

    // Fallback: best text similarity match
    let bestMatch = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      const afterOpenTag = candidate.offset + candidate.tagLength;
      const closeIdx = findMatchingCloseTag(sourceString, afterOpenTag, tag);
      if (closeIdx === -1) continue;

      const candidateInnerHTML = sourceString.substring(afterOpenTag, closeIdx);
      const candidateText = candidateInnerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      const innerText = innerHTML.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

      const cWords = new Set(candidateText.split(/\s+/));
      const iWords = new Set(innerText.split(/\s+/));
      const intersection = [...cWords].filter(w => iWords.has(w)).length;
      const union = new Set([...cWords, ...iWords]).size;
      const score = union > 0 ? intersection / union : 0;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          innerHTML: candidateInnerHTML,
          offset: afterOpenTag,
          length: candidateInnerHTML.length
        };
      }
    }

    return bestScore > 0.5 ? bestMatch : null;
  }

  function findMatchingCloseTag(source, startFrom, tagName) {
    let depth = 1;
    const openPattern = new RegExp(`<${tagName}[\\s>]`, 'gi');
    const closePattern = new RegExp(`</${tagName}>`, 'gi');

    openPattern.lastIndex = startFrom;
    closePattern.lastIndex = startFrom;

    const events = [];
    let m;
    while ((m = openPattern.exec(source)) !== null) {
      events.push({ pos: m.index, type: 'open' });
    }
    while ((m = closePattern.exec(source)) !== null) {
      events.push({ pos: m.index, type: 'close' });
    }

    events.sort((a, b) => a.pos - b.pos);

    for (const event of events) {
      if (event.type === 'open') depth++;
      if (event.type === 'close') {
        depth--;
        if (depth === 0) return event.pos;
      }
    }

    return -1;
  }

  function getTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style' || tag === 'noscript') {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.closest('#blip-sidebar-frame')) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  }

  function findTextInSource(text, liveNode, sourceString) {
    const trimmedText = text.trim();
    if (!trimmedText) return -1;

    const escaped = trimmedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexPattern = escaped.replace(/\s+/g, '\\s+');
    const regex = new RegExp(flexPattern, 'g');

    const matches = [];
    let match;
    while ((match = regex.exec(sourceString)) !== null) {
      matches.push({ offset: match.index, length: match[0].length });
    }

    if (matches.length === 0) return -1;
    if (matches.length === 1) return matches[0].offset;

    const allLiveTextNodes = getTextNodes(document.body);
    let occurrenceIndex = 0;
    for (const node of allLiveTextNodes) {
      if (node === liveNode) break;
      if (node.textContent.trim() === trimmedText) {
        occurrenceIndex++;
      }
    }

    if (occurrenceIndex < matches.length) {
      return matches[occurrenceIndex].offset;
    }

    return matches[0].offset;
  }

  // -------------------------------------------------------
  // MutationObserver (characterData + childList for structural changes)
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

          if (!hasEdits) {
            hasEdits = true;
            sendToSidebar('editsDetected');
          }
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
            if (!hasEdits) {
              hasEdits = true;
              sendToSidebar('editsDetected');
            }
          }
        }
      }
    });

    setTimeout(() => {
      observer.observe(document.body, {
        characterData: true,
        childList: true,
        subtree: true
      });
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
  // Paste interception (force plain text)
  // -------------------------------------------------------
  function interceptPaste() {
    document.addEventListener('paste', onPaste, true);
  }

  function uninterceptPaste() {
    document.removeEventListener('paste', onPaste, true);
  }

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

      // Guard: must have a resolved file
      if (!resolvedFilePath) {
        sendToSidebar('error', {
          userMessage: 'No editable file found for this page.',
          recoverable: false
        });
        return;
      }

      const withinGracePeriod = lastSaveData && (Date.now() - lastSaveTime < SAVE_GRACE_MS);

      if (withinGracePeriod) {
        // Use cached data from last save
        sourceContent = lastSaveData.content;
        sourceSHA = lastSaveData.sha;
        devLog('Source', `using cached version (saved ${Math.round((Date.now() - lastSaveTime) / 1000)}s ago)`, 'success', 'source-status');
        devLog('File SHA', sourceSHA.substring(0, 7) + ' (cached from last save)', 'success', 'file-sha');
      } else if (sourceContent && sourceSHA) {
        // Use prefetched baseline (already loaded at init or from last successful save)
        devLog('Source', `using baseline (${sourceContent.length} bytes)`, 'success', 'source-status');
        devLog('File SHA', sourceSHA.substring(0, 7) + ' (baseline)', 'success', 'file-sha');
      } else {
        // Fallback: fetch now (prefetch may have failed)
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

      const nodeCount = sourceDOM.body.querySelectorAll('*').length;
      devLog('Parsed source', `${nodeCount} elements`, 'success');

      buildTextNodeMap(document.body, sourceContent);

      interceptPaste();
      startObserving();

      document.designMode = 'on';
      document.documentElement.classList.add('blip-editing');
      isEditing = true;

      devLog('Mode', 'designMode ON', 'success', 'edit-mode');
      sendToSidebar('editStarted');

    } catch (err) {
      devLog('Error', err.message, 'error');
      sendToSidebar('error', {
        userMessage: 'Could not start editing. Try reloading the page.',
        recoverable: false
      });
    }
  }

  // -------------------------------------------------------
  // Save (dual-track: simple offset replacement + parent innerHTML diff)
  // -------------------------------------------------------
  async function saveEdits() {
    if (!isEditing || !sourceContent || isSaving) return;
    isSaving = true;

    try {
      // Flush pending observer records
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
                liveNode: target,
                originalText: mapping.originalText,
                newText: target.textContent,
                sourceOffset: mapping.sourceOffset,
                sourceLength: mapping.sourceLength,
                parentMapped: mapping.parentMapped
              });
            }
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
            }
          }
        }
      }

      devSeparator();

      // --- Track 1: simple text node changes ---
      const simpleChanges = mutations.filter(m => !m.parentMapped && m.newText !== m.originalText);

      // --- Track 2: parent-level innerHTML changes ---
      const parentLevelChanges = [];

      for (const pm of parentMap) {
        const currentInnerHTML = pm.liveParent.innerHTML;
        const normalizedCurrent = currentInnerHTML.replace(/\s+/g, ' ').trim();
        const normalizedOriginal = pm.sourceInnerHTML.replace(/\s+/g, ' ').trim();

        if (normalizedCurrent !== normalizedOriginal) {
          parentLevelChanges.push({
            liveParent: pm.liveParent,
            originalInnerHTML: pm.sourceInnerHTML,
            newInnerHTML: currentInnerHTML,
            sourceOffset: pm.sourceOffset,
            sourceLength: pm.sourceLength
          });
        }
      }

      // Also handle parents with structural (childList) mutations not in parentMap
      for (const parent of mutatedParents) {
        const alreadyInParentMap = parentMap.some(pm => pm.liveParent === parent);
        if (alreadyInParentMap) continue;

        const mapping = findParentInSource(parent, sourceContent);
        if (mapping) {
          const currentInnerHTML = parent.innerHTML;
          const normalizedCurrent = currentInnerHTML.replace(/\s+/g, ' ').trim();
          const normalizedOriginal = mapping.innerHTML.replace(/\s+/g, ' ').trim();

          if (normalizedCurrent !== normalizedOriginal) {
            parentLevelChanges.push({
              liveParent: parent,
              originalInnerHTML: mapping.innerHTML,
              newInnerHTML: currentInnerHTML,
              sourceOffset: mapping.offset,
              sourceLength: mapping.length
            });

            // Remove simple changes inside this parent (handled at parent level now)
            for (let i = simpleChanges.length - 1; i >= 0; i--) {
              const changeParent = simpleChanges[i].liveNode.parentElement;
              if (changeParent === parent || parent.contains(changeParent)) {
                simpleChanges.splice(i, 1);
              }
            }
          }
        }
      }

      const totalChanges = simpleChanges.length + parentLevelChanges.length;
      devLog('Changes', `${totalChanges} edit${totalChanges !== 1 ? 's' : ''} (${simpleChanges.length} simple, ${parentLevelChanges.length} parent-level)`, 'success');

      if (totalChanges === 0) {
        isSaving = false;
        sendToSidebar('noChanges');
        return;
      }

      for (const change of simpleChanges) {
        const selector = getCssSelector(change.liveNode);
        devLog('Edited', selector, 'success');
        devLog('\u2192', change.newText, '');
      }
      for (const change of parentLevelChanges) {
        const selector = getCssSelector(change.liveParent);
        devLog('Edited (parent)', selector, 'success');
        devLog('\u2192', change.newInnerHTML.substring(0, 200) + (change.newInnerHTML.length > 200 ? '...' : ''), '');
      }

      // Build all replacements
      const allReplacements = [];

      for (const change of simpleChanges) {
        allReplacements.push({
          sourceOffset: change.sourceOffset,
          sourceLength: change.sourceLength,
          replacement: change.newText,
          type: 'simple'
        });
      }

      for (const change of parentLevelChanges) {
        allReplacements.push({
          sourceOffset: change.sourceOffset,
          sourceLength: change.sourceLength,
          replacement: change.newInnerHTML,
          type: 'parent'
        });
      }

      // Sort descending by offset (apply from end to preserve positions)
      allReplacements.sort((a, b) => b.sourceOffset - a.sourceOffset);

      // Resolve overlapping replacements (prefer parent-level)
      for (let i = 0; i < allReplacements.length - 1; i++) {
        const current = allReplacements[i];
        const next = allReplacements[i + 1];
        const nextEnd = next.sourceOffset + next.sourceLength;
        if (nextEnd > current.sourceOffset) {
          if (current.type === 'parent') {
            allReplacements.splice(i + 1, 1);
            i--;
          } else if (next.type === 'parent') {
            allReplacements.splice(i, 1);
            i--;
          }
        }
      }

      // Apply replacements to source
      let newContent = sourceContent;
      for (const rep of allReplacements) {
        const before = newContent.substring(0, rep.sourceOffset);
        const after = newContent.substring(rep.sourceOffset + rep.sourceLength);
        newContent = before + rep.replacement + after;
      }

      // LLM safety net: validate parent-level changes
      let usedLLM = false;
      if (parentLevelChanges.length > 0 && BLIP_CONFIG.llm && BLIP_CONFIG.llm.enabled) {
        const validation = validateHTML(newContent);
        if (!validation.valid) {
          devLog('Validation', 'structural issue detected, calling LLM...', 'error');
          try {
            newContent = await llmRepair(sourceContent, newContent, parentLevelChanges);
            usedLLM = true;
            devLog('LLM repair', 'applied', 'success');
          } catch (llmErr) {
            devLog('LLM repair', `failed: ${llmErr.message}`, 'error');
          }
        }
      }

      // --- Transaction log ---
      const txId = Date.now();
      const pushTimestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
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

      // Update local state
      const oldSHA = sourceSHA;
      sourceSHA = result.sha;
      sourceContent = newContent;

      // Cache for grace period
      lastSaveTime = Date.now();
      lastSaveData = { content: newContent, sha: result.sha };

      // State confirmation
      const stateUpdated = sourceSHA === result.sha;
      devLog('State', stateUpdated
        ? `\u2713 local SHA updated: ${oldSHA.substring(0, 7)} \u2192 ${sourceSHA.substring(0, 7)}`
        : `\u2717 SHA mismatch! local=${sourceSHA.substring(0, 7)} server=${result.sha.substring(0, 7)}`,
        stateUpdated ? 'success' : 'error',
        'tx-state'
      );

      devLog('Commit', result.commitSha.substring(0, 7) + (usedLLM ? ' (LLM-repaired)' : ''), 'success', 'commit-status');

      buildTextNodeMap(document.body, sourceContent, true);

      exitEditMode();
      isSaving = false;
      sendToSidebar('saved');

    } catch (err) {
      isSaving = false;
      const errorTimestamp = new Date().toISOString().slice(11, 23);

      // Extract HTTP status if available
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
        sendToSidebar('syncError', {
          userMessage: 'Out of sync. Re-syncing now...'
        });
        autoRecover();
      } else if (isNetwork) {
        sendToSidebar('error', {
          userMessage: 'Network error. Check your connection and try saving again.',
          recoverable: true
        });
      } else {
        exitEditMode();
        sendToSidebar('syncError', {
          userMessage: 'Something went wrong. Re-syncing now...'
        });
        autoRecover();
      }
    }
  }

  // -------------------------------------------------------
  // Auto-recovery: fetch fresh source after sync errors
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
      sendToSidebar('recoveryFailed', {
        userMessage: 'Could not sync. Please reload the page.'
      });
    }
  }


  // -------------------------------------------------------
  // HTML validation (quick structural check)
  // -------------------------------------------------------
  function validateHTML(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const errors = doc.querySelectorAll('parsererror');

    const corruptionPatterns = [
      /[^<]\/(h[1-6]|p|div|span|strong|em|a|ul|ol|li|section|article|header|footer|nav|main|aside)>/i,
      /<(h[1-6]|p|div|span|strong|em)[^>]*>[^<]*<\/(?!\1)[^>]*>/i
    ];

    let hasCorruption = false;
    for (const pattern of corruptionPatterns) {
      if (pattern.test(htmlString)) {
        hasCorruption = true;
        break;
      }
    }

    return {
      valid: errors.length === 0 && !hasCorruption,
      errorCount: errors.length,
      hasCorruption
    };
  }

  // -------------------------------------------------------
  // LLM repair via Groq (safety net for structural corruption)
  // -------------------------------------------------------
  async function llmRepair(originalSource, corruptedSource, parentChanges) {
    const changedRegions = parentChanges.map(change => {
      const selector = getCssSelector(change.liveParent);
      return {
        selector,
        originalFragment: change.originalInnerHTML,
        newFragment: change.newInnerHTML
      };
    });

    const systemPrompt = 'You are an automated HTML syntax checker. Fix broken HTML syntax only. Preserve all intended content changes. Output ONLY raw corrected HTML. No explanations or markdown.';

    const userPrompt = `Original HTML fragments and their edited versions are below. The edits may have introduced broken HTML syntax (missing brackets, broken tags, unclosed elements). Fix ONLY the syntax errors. Preserve ALL intended text content changes.

${changedRegions.map((r, i) => `Fragment ${i + 1} (${r.selector}):
Original: ${r.originalFragment}
Edited: ${r.newFragment}`).join('\n\n')}

Output ONLY the corrected edited fragments, separated by ---FRAGMENT--- markers. No explanations.`;

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'LLM_REPAIR',
          llmConfig: BLIP_CONFIG.llm,
          systemPrompt,
          userPrompt
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response.success) {
            reject(new Error(response.error));
          } else {
            const repairedText = response.data.content;
            const repairedFragments = repairedText.split('---FRAGMENT---').map(f => f.trim());

            let repairedSource = corruptedSource;
            for (let i = 0; i < parentChanges.length && i < repairedFragments.length; i++) {
              const change = parentChanges[i];
              const repairedFragment = repairedFragments[i];
              if (repairedFragment) {
                repairedSource = repairedSource.replace(change.newInnerHTML, repairedFragment);
              }
            }

            if (response.data.usage) {
              devLog('LLM tokens', `${response.data.usage.prompt_tokens} in, ${response.data.usage.completion_tokens} out`, '');
            }

            resolve(repairedSource);
          }
        }
      );
    });
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
      if (current.id) {
        segment += '#' + current.id;
        parts.unshift(segment);
        break;
      }
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName)
        : [];
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${idx})`;
      }
      parts.unshift(segment);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  // -------------------------------------------------------
  // Exit edit mode (shared cleanup)
  // -------------------------------------------------------
  function exitEditMode() {
    document.designMode = 'off';
    document.documentElement.classList.remove('blip-editing');
    isEditing = false;
    hasEdits = false;
    devLog('Mode', 'designMode OFF', '', 'edit-mode');
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
    if (!currentHost.includes(BLIP_CONFIG.site.url)) return;

    injectSidebar();
    resolveAndPrefetch();
  }

  async function resolveAndPrefetch() {
    try {
      // Step 1: Fetch repo file listing
      const t0 = Date.now();
      repoFiles = await listRepoFiles();
      const listLatency = Date.now() - t0;

      // Step 2: Filter to editable files
      editableFiles = filterEditableFiles(repoFiles);

      devLog('Repo files', `${repoFiles.length} total, ${editableFiles.length} editable`, 'success', 'repo-files');

      // Step 3: Resolve current URL to a file path
      resolvedFilePath = resolveFilePath(window.location.pathname, editableFiles);

      if (!resolvedFilePath) {
        devLog('File', `no match for "${window.location.pathname}"`, 'error', 'resolved-file');
        sendToSidebar('fileInfo', {
          resolvedFile: null,
          editableFiles: editableFiles.map(f => f.name)
        });
        return;
      }

      devLog('File', resolvedFilePath, 'success', 'resolved-file');

      // Send file info to sidebar for the indicator
      sendToSidebar('fileInfo', {
        resolvedFile: resolvedFilePath,
        editableFiles: editableFiles.map(f => f.name)
      });

      // Step 4: Prefetch the resolved file
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

})();
