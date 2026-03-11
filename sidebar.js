// Sidebar script - communicates with content script via postMessage

const editBtn = document.getElementById('editBtn');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');
const defaultState = document.getElementById('defaultState');
const editingState = document.getElementById('editingState');
const savingState = document.getElementById('savingState');
const fileIndicator = document.getElementById('fileIndicator');
const notifications = document.getElementById('notifications');
const devLog = document.getElementById('devLog');
const devPanel = document.getElementById('devPanel');
const devToggle = document.getElementById('devToggle');

devToggle.addEventListener('click', () => {
    devPanel.classList.toggle('collapsed');
});

function sendToContent(action, data = {}) {
    window.parent.postMessage({ source: 'blip-sidebar', action, ...data }, '*');
}

editBtn.addEventListener('click', () => {
    editBtn.disabled = true;
    editBtn.textContent = 'Loading...';
    sendToContent('startEdit');
});

saveBtn.addEventListener('click', () => {
    showSaving();
    sendToContent('save');
});

cancelBtn.addEventListener('click', () => {
    sendToContent('cancel');
});

closeBtn.addEventListener('click', () => {
    sendToContent('closeSidebar');
});

// State transitions
function showEditing() {
    defaultState.classList.add('hidden');
    savingState.classList.add('hidden');
    editingState.classList.remove('hidden');
    saveBtn.disabled = true;  // disabled until edits are detected
    cancelBtn.disabled = false;
    editBtn.disabled = false;
    editBtn.textContent = 'Edit';
    clearNotifications();
}

function showSaving() {
    editingState.classList.add('hidden');
    defaultState.classList.add('hidden');
    savingState.classList.remove('hidden');
    savingState.querySelector('.status-badge').className = 'status-badge saving';
    savingState.querySelector('.status-badge').innerHTML = '<span class="status-dot"></span> Saving...';
}

function showSyncing(message) {
    editingState.classList.add('hidden');
    defaultState.classList.add('hidden');
    savingState.classList.remove('hidden');
    savingState.querySelector('.status-badge').className = 'status-badge syncing';
    savingState.querySelector('.status-badge').innerHTML = '<span class="status-dot"></span> ' + escapeHtml(message);
}

function showDefault() {
    editingState.classList.add('hidden');
    savingState.classList.add('hidden');
    defaultState.classList.remove('hidden');
    editBtn.disabled = false;
    editBtn.textContent = 'Edit';
}

function showNotification(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = message;
    notifications.appendChild(div);

    if (type === 'success' || type === 'info') {
        setTimeout(() => div.remove(), 4000);
    }
}

function showErrorWithReload(userMessage) {
    clearNotifications();
    const div = document.createElement('div');
    div.className = 'notification error';
    div.innerHTML = `
        <div style="margin-bottom: 8px;">${escapeHtml(userMessage)}</div>
        <button class="btn-reload" onclick="window.parent.postMessage({source:'blip-sidebar',action:'reloadPage'},'*')">
            Reload page and try again
        </button>
    `;
    notifications.appendChild(div);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function clearNotifications() {
    notifications.innerHTML = '';
}

// Dev logging
function devLogEntry(label, value, status = '', entryId = null) {
    if (entryId) {
        const existing = devLog.querySelector(`[data-entry-id="${entryId}"]`);
        if (existing) {
            existing.innerHTML = `<span class="label">${label}:</span> <span class="value ${status}">${value}</span>`;
            devLog.scrollTop = devLog.scrollHeight;
            return;
        }
    }
    const entry = document.createElement('div');
    entry.className = 'entry';
    if (entryId) entry.dataset.entryId = entryId;
    entry.innerHTML = `<span class="label">${label}:</span> <span class="value ${status}">${value}</span>`;
    devLog.appendChild(entry);
    devLog.scrollTop = devLog.scrollHeight;
}

function devLogSeparator() {
    const entry = document.createElement('div');
    entry.className = 'entry separator';
    entry.innerHTML = '<hr style="border: none; border-top: 1px solid rgba(0,0,0,0.06); margin: 4px 0;">';
    devLog.appendChild(entry);
    devLog.scrollTop = devLog.scrollHeight;
}

// Listen for messages from content script
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.source !== 'blip-content') return;

    switch (msg.action) {
        case 'editStarted':
            showEditing();
            break;

        case 'editsDetected':
            saveBtn.disabled = false;
            break;

        case 'saved':
            showDefault();
            showNotification('Saved');
            break;

        case 'cancelled':
            showDefault();
            break;

        case 'noChanges':
            showEditing();
            showNotification('Nothing to save yet. Make some edits first.', 'info');
            break;

        case 'syncError':
            // Auto-recovery in progress: show syncing message with countdown
            showSyncing(msg.userMessage || 'Re-syncing...');
            break;

        case 'recovered':
            // Recovery complete: show success and re-enable editing
            showDefault();
            showNotification('Synced. Your edits were not saved, but you can try again.', 'error');
            break;

        case 'recoveryFailed':
            // Recovery failed: show reload option
            showDefault();
            showErrorWithReload(msg.userMessage || 'Could not sync. Please reload the page.');
            break;

        case 'error':
            showEditing();
            if (msg.recoverable) {
                showNotification(msg.userMessage || 'Something went wrong', 'error');
            } else {
                showErrorWithReload(msg.userMessage || 'Something went wrong. Try reloading the page.');
            }
            break;

        case 'devLog':
            devLogEntry(msg.label, msg.value, msg.status || '', msg.entryId || null);
            break;

        case 'devSeparator':
            devLogSeparator();
            break;

        case 'fileInfo':
            updateFileIndicator(msg.resolvedFile, msg.editableFiles);
            break;
    }
});

sendToContent('ready');

function updateFileIndicator(resolvedFile, editableFiles) {
    if (!fileIndicator) return;

    if (!resolvedFile) {
        fileIndicator.innerHTML = `
            <span class="file-icon">&#x2717;</span>
            <span class="file-name">No editable file for this page</span>
        `;
        fileIndicator.classList.add('no-file');
        fileIndicator.classList.remove('has-file');
        editBtn.disabled = true;
        return;
    }

    fileIndicator.innerHTML = `
        <span class="file-icon">&#x25CF;</span>
        <span class="file-name">${escapeHtml(resolvedFile)}</span>
    `;
    fileIndicator.classList.add('has-file');
    fileIndicator.classList.remove('no-file');
    editBtn.disabled = false;
}
