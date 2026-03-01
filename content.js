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
  let textNodeMap = [];       // { liveNode, sourceOffset, sourceLength }
  let observer = null;        // MutationObserver
  let mutations = [];         // recorded characterData mutations
  let userInteractedNodes = new Set(); // nodes the user clicked/focused

  // -------------------------------------------------------
  // Sidebar injection
  // -------------------------------------------------------
  let dragHandle = null;
  let collapsedTab = null;
  let currentSidebarWidth = 0;

  function injectSidebar() {
    if (document.getElementById('blip-sidebar-frame')) return;

    const width = BLIP_CONFIG.sidebar.defaultWidthPx;
    currentSidebarWidth = width;

    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id = 'blip-sidebar-frame';
    sidebarFrame.src = chrome.runtime.getURL('sidebar.html');
    sidebarFrame.style.width = width + 'px';

    document.documentElement.style.setProperty('--blip-sidebar-width', width + 'px');
    document.documentElement.classList.add('blip-sidebar-open');
    document.documentElement.appendChild(sidebarFrame);

    injectDragHandle(width);
    injectCollapsedTab();

    window.addEventListener('message', handleSidebarMessage);
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

    // Remove transition during drag for instant feedback
    if (sidebarFrame) sidebarFrame.style.transition = 'none';
    if (dragHandle) dragHandle.style.transition = 'none';

    const onMove = (ev) => {
      const x = ev.clientX;
      // If dragged below a threshold, collapse
      if (x < 60) {
        collapseSidebar();
        onUp();
        return;
      }
      // Clamp between min and max
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
      // Restore transitions
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
    }
  }

  function sendInitialDevLogs() {
    devLog('Site', window.location.hostname, 'success');
    devLog('Repo', `${BLIP_CONFIG.github.owner}/${BLIP_CONFIG.github.repo}`, '');
    devLog('Branch', BLIP_CONFIG.github.branch, '');
    devLog('File', BLIP_CONFIG.github.filePath, '');
    devSeparator();
    devLog('Source', 'not yet fetched (click Edit)', '', 'source-status');
    devLog('File SHA', '-', '', 'file-sha');
    devSeparator();
    devLog('Mode', 'designMode OFF', '', 'edit-mode');
    devLog('Observer', 'idle', '', 'observer-status');
  }

  // -------------------------------------------------------
  // GitHub communication (via background script)
  // -------------------------------------------------------
  async function fetchFromGitHub() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'GITHUB_FETCH', config: BLIP_CONFIG.github },
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
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'GITHUB_COMMIT', config: BLIP_CONFIG.github, content, sha },
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
  // Text node mapping
  // -------------------------------------------------------
  function buildTextNodeMap(liveRoot, sourceString, silent = false) {
    textNodeMap = [];
    const liveTextNodes = getTextNodes(liveRoot);

    for (const liveNode of liveTextNodes) {
      const text = liveNode.textContent;
      if (!text || !text.trim()) continue;

      const offset = findTextInSource(text, liveNode, sourceString);
      if (offset !== -1) {
        textNodeMap.push({
          liveNode,
          sourceOffset: offset,
          sourceLength: text.length,
          originalText: text
        });
      }
    }

    if (!silent) devLog('Mapped nodes', `${textNodeMap.length} text nodes`, 'success');
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

    // Multiple matches: disambiguate by occurrence order
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
  // MutationObserver
  // -------------------------------------------------------
  function startObserving() {
    mutations = [];

    observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type !== 'characterData') continue;

        const target = mutation.target;

        if (BLIP_CONFIG.observer.trackOnlyUserInitiated) {
          if (!userInteractedNodes.has(target) && !userInteractedNodes.has(target.parentElement)) {
            continue;
          }
        }

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
            sourceLength: mapping.sourceLength
          });
        }
      }
    });

    setTimeout(() => {
      observer.observe(document.body, {
        characterData: true,
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
  // User interaction tracking
  // -------------------------------------------------------
  function trackUserInteractions() {
    document.addEventListener('click', onUserInteract, true);
    document.addEventListener('focus', onUserInteract, true);
    document.addEventListener('keydown', onUserKeydown, true);
  }

  function untrackUserInteractions() {
    document.removeEventListener('click', onUserInteract, true);
    document.removeEventListener('focus', onUserInteract, true);
    document.removeEventListener('keydown', onUserKeydown, true);
    userInteractedNodes.clear();
  }

  function onUserInteract(e) {
    if (e.target && e.target !== sidebarFrame) {
      userInteractedNodes.add(e.target);
      if (e.target.childNodes) {
        for (const child of e.target.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            userInteractedNodes.add(child);
          }
        }
      }
    }
  }

  function onUserKeydown(e) {
    const sel = window.getSelection();
    if (sel && sel.anchorNode) {
      userInteractedNodes.add(sel.anchorNode);
      if (sel.anchorNode.parentElement) {
        userInteractedNodes.add(sel.anchorNode.parentElement);
      }
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
      devLog('Source', 'fetching from GitHub...', '', 'source-status');

      // Step 1: Fetch source from GitHub
      const result = await fetchFromGitHub();
      sourceContent = result.content;
      sourceSHA = result.sha;

      devLog('Source', `fetched, ${result.size} bytes`, 'success', 'source-status');
      devLog('File SHA', result.sha.substring(0, 7) + ' (diffing against this)', 'success', 'file-sha');

      // Step 2: Parse source DOM
      const parser = new DOMParser();
      sourceDOM = parser.parseFromString(sourceContent, 'text/html');

      const nodeCount = sourceDOM.body.querySelectorAll('*').length;
      devLog('Parsed source', `${nodeCount} elements`, 'success');

      // Step 3: Build text node map
      buildTextNodeMap(document.body, sourceContent);

      // Step 4: Set up interaction tracking and paste interception
      trackUserInteractions();
      interceptPaste();

      // Step 5: Start observing
      startObserving();

      // Step 6: Enable design mode
      document.designMode = 'on';
      document.documentElement.classList.add('blip-editing');
      isEditing = true;

      devLog('Mode', 'designMode ON', 'success', 'edit-mode');
      sendToSidebar('editStarted');

    } catch (err) {
      devLog('Error', err.message, 'error');
      sendToSidebar('error', { message: `Failed to start: ${err.message}` });
    }
  }

  // -------------------------------------------------------
  // Save
  // -------------------------------------------------------
  async function saveEdits() {
    if (!isEditing || !sourceContent) return;

    try {
      // Flush pending observer records
      if (observer) {
        const pending = observer.takeRecords();
        for (const mutation of pending) {
          if (mutation.type !== 'characterData') continue;
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
              sourceLength: mapping.sourceLength
            });
          }
        }
      }

      const actualChanges = mutations.filter(m => m.newText !== m.originalText);

      devSeparator();
      devLog('Changes', `${actualChanges.length} edit${actualChanges.length !== 1 ? 's' : ''}`, 'success');

      if (actualChanges.length === 0) {
        sendToSidebar('error', { message: 'No changes detected' });
        return;
      }

      for (const change of actualChanges) {
        const selector = getCssSelector(change.liveNode);
        devLog('Edited', selector, 'success');
        devLog('\u2192', change.newText, '');
      }

      // Apply changes to source (reverse offset order to preserve positions)
      let newContent = sourceContent;
      const sorted = actualChanges.sort((a, b) => b.sourceOffset - a.sourceOffset);

      for (const change of sorted) {
        const before = newContent.substring(0, change.sourceOffset);
        const after = newContent.substring(change.sourceOffset + change.sourceLength);
        newContent = before + change.newText + after;
      }

      devLog('Commit', 'pushing to GitHub...', '', 'commit-status');

      const result = await commitToGitHub(newContent, sourceSHA);

      sourceSHA = result.sha;
      sourceContent = newContent;

      devLog('Commit', result.commitSha.substring(0, 7) + ' (view on GitHub)', 'success', 'commit-status');
      devLog('File SHA', result.sha.substring(0, 7) + ' (new base for next edit)', 'success', 'file-sha');

      buildTextNodeMap(document.body, sourceContent, true);

      exitEditMode();
      sendToSidebar('saved');

    } catch (err) {
      devLog('Error', err.message, 'error');
      sendToSidebar('error', { message: `Save failed: ${err.message}` });
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
    devLog('Mode', 'designMode OFF', '', 'edit-mode');
    mutations = [];
    stopObserving();
    untrackUserInteractions();
    uninterceptPaste();
  }

  // -------------------------------------------------------
  // Initialize
  // -------------------------------------------------------
  function init() {
    const currentHost = window.location.hostname.replace('www.', '');
    if (!currentHost.includes(BLIP_CONFIG.site.url)) return;

    injectSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
