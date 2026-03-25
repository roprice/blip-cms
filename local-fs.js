// local-fs.js
// File System Access API module for local file editing (Pro feature)
// Handles directory permission grants, IndexedDB handle persistence,
// read/write operations for file:/// pages, and the local save flow.
//
// Loads before content.js in the manifest. References globals from
// content.js (sourceContent, sourceSHA, resolvedFilePath, isEditing,
// isSaving, mutations, textNodeMap, parentMap, etc.) which are
// declared before this file's functions are called.

'use strict';

// -------------------------------------------------------
// State
// -------------------------------------------------------
let localDirHandle = null;    // Current FileSystemDirectoryHandle
let localFileHandle = null;   // Current FileSystemFileHandle
let localFilePath = null;     // Parsed from window.location.pathname
let localDirPath = null;      // Directory portion of the path
let isLocalMode = false;      // True when on a file:/// page

// -------------------------------------------------------
// IndexedDB helpers for persisting FileSystemDirectoryHandle
// (chrome.storage.local can't hold structured-cloneable handles)
// -------------------------------------------------------
const IDB_NAME = 'blip-local-fs';
const IDB_STORE = 'dir-handles';
const IDB_VERSION = 1;

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirHandle(dirPath, handle) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, dirPath);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadDirHandle(dirPath) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(dirPath);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// -------------------------------------------------------
// Path parsing
// -------------------------------------------------------

/**
 * Parse a file:/// URL into directory path and filename.
 * e.g. file:///Users/rdg/Claude/CLAUDE.md
 *   -> { dirPath: '/Users/rdg/Claude', fileName: 'CLAUDE.md' }
 */
function parseLocalPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const lastSlash = decoded.lastIndexOf('/');
  if (lastSlash < 0) return null;
  return {
    dirPath: decoded.substring(0, lastSlash) || '/',
    fileName: decoded.substring(lastSlash + 1)
  };
}

// -------------------------------------------------------
// Permission & handle management
// -------------------------------------------------------

async function tryRestoreHandle(dirPath) {
  const handle = await loadDirHandle(dirPath);
  if (!handle) return null;
  const perm = await handle.requestPermission({ mode: 'readwrite' });
  return perm === 'granted' ? handle : null;
}

async function promptForDirectory(suggestedDirPath) {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (handle) {
      await saveDirHandle(suggestedDirPath, handle);
      return handle;
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('Blip local-fs: directory picker error', err);
    }
  }
  return null;
}

// -------------------------------------------------------
// File read/write
// -------------------------------------------------------

async function readLocalFile(dirHandle, fileName) {
  const fileHandle = await dirHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const content = await file.text();
  localFileHandle = fileHandle;
  return { content, fileName: file.name, size: file.size };
}

async function writeLocalFile(fileHandle, content) {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return { success: true };
}

// -------------------------------------------------------
// Detection
// -------------------------------------------------------

function isLocalFile() {
  return window.location.protocol === 'file:';
}

// -------------------------------------------------------
// FSAA initialization
// -------------------------------------------------------

async function initLocalFileAccess() {
  if (!isLocalFile()) {
    return { ready: false, error: 'Not a file:// page' };
  }
  if (!window.showDirectoryPicker) {
    return { ready: false, error: 'Browser does not support File System Access API' };
  }

  const parsed = parseLocalPath(window.location.pathname);
  if (!parsed) {
    return { ready: false, error: 'Could not parse file path from URL' };
  }

  localFilePath = parsed.fileName;
  localDirPath = parsed.dirPath;

  // Try to restore a previously granted handle
  const existingHandle = await tryRestoreHandle(localDirPath);
  if (existingHandle) {
    localDirHandle = existingHandle;
    try {
      const result = await readLocalFile(existingHandle, parsed.fileName);
      return { ready: true, ...result, dirPath: localDirPath };
    } catch (err) {
      return { ready: false, error: `File not found: ${parsed.fileName}` };
    }
  }

  return { ready: false, needsGrant: true, dirPath: localDirPath, fileName: parsed.fileName };
}

async function grantAndLoad() {
  if (!localDirPath || !localFilePath) {
    return { ready: false, error: 'No local file context' };
  }
  const handle = await promptForDirectory(localDirPath);
  if (!handle) {
    return { ready: false, error: 'Folder access was cancelled' };
  }
  localDirHandle = handle;
  try {
    const result = await readLocalFile(handle, localFilePath);
    return { ready: true, ...result, dirPath: localDirPath };
  } catch (err) {
    return { ready: false, error: `File not found in selected folder: ${localFilePath}` };
  }
}

async function saveLocalFileToDisk(content) {
  if (!localFileHandle) {
    return { success: false, error: 'No file handle available' };
  }
  try {
    await writeLocalFile(localFileHandle, content);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// -------------------------------------------------------
// Init flow: called from content.js init()
// Checks Pro license, attempts FSAA access, sends status to sidebar.
// -------------------------------------------------------

async function initLocalEditing() {
  // Check Pro license directly from storage (not via licensing.js)
  // because file:// pages may have a different storage context.
  // Retry once after a short delay if the first read comes back empty,
  // since chrome.storage can race on file:// page load.
  let isPro = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const licenseResult = await new Promise((resolve) => {
      chrome.storage.local.get(['blipMembership'], resolve);
    });
    const membership = licenseResult.blipMembership || {};
    isPro = membership.foundingMember || membership.foundingVIP;
    if (isPro) break;
    if (attempt === 0) await new Promise(r => setTimeout(r, 500));
  }

  if (!isPro) {
    sendToSidebar('localFileStatus', {
      status: 'not-pro',
      fileName: window.location.pathname.split('/').pop(),
      dirPath: window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'))
    });
    return;
  }

  const result = await initLocalFileAccess();

  if (result.ready) {
    sourceContent = result.content;
    sourceSHA = 'local-file';
    resolvedFilePath = result.fileName;

    sendToSidebar('localFileStatus', {
      status: 'ready',
      fileName: result.fileName,
      dirPath: result.dirPath,
      fileSize: result.size
    });
    sendToSidebar('fileInfo', {
      resolvedFile: result.fileName,
      editableFiles: [result.fileName],
      siteUrl: 'local file',
      connected: true
    });

    devLog('Mode', 'local file editing', 'success');
    devLog('File', result.fileName, 'success', 'resolved-file');
    devLog('Source', `loaded (${result.size} bytes)`, 'success', 'source-status');

  } else if (result.needsGrant) {
    sendToSidebar('localFileStatus', {
      status: 'needs-grant',
      fileName: result.fileName,
      dirPath: result.dirPath
    });
    devLog('Mode', 'local file - awaiting folder access', '', 'local-status');

  } else {
    sendToSidebar('localFileStatus', {
      status: 'error',
      error: result.error
    });
    devLog('Local', result.error, 'error', 'local-status');
  }
}

// -------------------------------------------------------
// Grant flow: called when user clicks "Grant folder access"
// -------------------------------------------------------

async function handleGrantLocalAccess() {
  const result = await grantAndLoad();

  if (result.ready) {
    sourceContent = result.content;
    sourceSHA = 'local-file';
    resolvedFilePath = result.fileName;

    sendToSidebar('localFileStatus', {
      status: 'ready',
      fileName: result.fileName,
      dirPath: result.dirPath,
      fileSize: result.size
    });
    sendToSidebar('fileInfo', {
      resolvedFile: result.fileName,
      editableFiles: [result.fileName],
      siteUrl: 'local file',
      connected: true
    });

    devLog('Mode', 'local file editing', 'success', 'local-status');
    devLog('File', result.fileName, 'success', 'resolved-file');
    devLog('Source', `loaded (${result.size} bytes)`, 'success', 'source-status');

  } else {
    sendToSidebar('localFileStatus', {
      status: 'error',
      error: result.error
    });
  }
}

// -------------------------------------------------------
// Save flow: handles local file saves
// Routes between text-diff (plain-text files) and DOM-mapping
// (HTML files), with text-diff as fallback when DOM engine
// finds zero changes but edits were detected.
// -------------------------------------------------------

async function saveLocalEdits() {
  if (!isEditing || !sourceContent || isSaving) return;
  isSaving = true;
  sendToSidebar('tabState', { state: 'saving' });

  try {
    devSeparator();

    // --- Text-diff path (primary for .md, .txt, .json, etc.) ---
    if (useTextDiff) {
      const diffResult = applyTextDiff(sourceContent);

      if (diffResult.noChanges) {
        isSaving = false;
        sendToSidebar('noChanges');
        return;
      }

      devLog('Changes', `${diffResult.changeCount} region(s) changed`, 'success');

      const diffText = formatDiffEntry(
        window.location.href,
        resolvedFilePath || 'unknown',
        diffResult.snippets
      );
      sendToSidebar('diffEntry', { diffText });

      const writeResult = await saveLocalFileToDisk(diffResult.newContent);
      if (!writeResult.success) {
        throw new Error(writeResult.error || 'Failed to write local file');
      }

      sourceContent = diffResult.newContent;
      devLog('Save', `written to ${resolvedFilePath}`, 'success');

      clearTextSnapshot();
      exitEditMode();
      isSaving = false;
      sendToSidebar('saved');
      sendToSidebar('tabState', { state: 'saved' });
      return;
    }

    // --- DOM-mapping path (for local HTML files) ---

    // Flush pending mutations
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

    let totalChanges = simpleChanges.length + parentLevelChanges.length;

    // --- Fallback: DOM engine found nothing, try text-diff ---
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

        const writeResult = await saveLocalFileToDisk(diffResult.newContent);
        if (!writeResult.success) {
          throw new Error(writeResult.error || 'Failed to write local file');
        }

        sourceContent = diffResult.newContent;
        devLog('Save', `written to ${resolvedFilePath} (via fallback)`, 'success');
        clearTextSnapshot();
        exitEditMode();
        isSaving = false;
        sendToSidebar('saved');
        sendToSidebar('tabState', { state: 'saved' });
        return;
      }
    }

    if (totalChanges === 0) {
      isSaving = false;
      sendToSidebar('noChanges');
      return;
    }

    devLog('Changes', `${totalChanges} edit${totalChanges !== 1 ? 's' : ''}`, 'success');

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

    const diffSnippets = buildDiffSnippets(sourceContent, allReplacements);
    const diffText = formatDiffEntry(
      window.location.href,
      resolvedFilePath || 'unknown',
      diffSnippets
    );
    sendToSidebar('diffEntry', { diffText });

    let newContent = sourceContent;
    for (const rep of allReplacements) {
      newContent = newContent.substring(0, rep.sourceOffset) + rep.replacement + newContent.substring(rep.sourceOffset + rep.sourceLength);
    }

    const writeResult = await saveLocalFileToDisk(newContent);
    if (!writeResult.success) {
      throw new Error(writeResult.error || 'Failed to write local file');
    }

    sourceContent = newContent;
    devLog('Save', `written to ${resolvedFilePath}`, 'success');

    buildTextNodeMap(document.body, sourceContent, true);
    clearTextSnapshot();
    exitEditMode();
    isSaving = false;
    sendToSidebar('saved');
    sendToSidebar('tabState', { state: 'saved' });

  } catch (err) {
    isSaving = false;
    sendToSidebar('tabState', { state: 'error' });
    devLog('Save error', err.message, 'error');
    sendToSidebar('error', { userMessage: 'Could not save to local file: ' + err.message, recoverable: true });
  }
}