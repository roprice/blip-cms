// Blip background service worker
// Handles GitHub API calls on behalf of the content script.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "VALIDATE_LICENSE") {
    validateLicense(message.key)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === "GITHUB_FETCH") {
    githubFetchFile(message.config)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === "GITHUB_LIST_FILES") {
    githubListFiles(message.config)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "GITHUB_COMMIT") {
    githubCommitFile(message.config, message.content, message.sha)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function githubListFiles(config) {
  const { owner, repo, branch, token } = config;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub list failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  // Return only files (not directories), with name and path
  return data
    .filter((item) => item.type === "file")
    .map((item) => ({ name: item.name, path: item.path, size: item.size }));
}

async function githubFetchFile(config) {
  const { owner, repo, branch, filePath, token } = config;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub fetch failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const content = atob(data.content.replace(/\n/g, ""));
  // Handle UTF-8 properly
  const decoded = new TextDecoder().decode(
    Uint8Array.from(content, (c) => c.charCodeAt(0)),
  );

  return {
    content: decoded,
    sha: data.sha,
    size: data.size,
    path: data.path,
  };
}

async function githubCommitFile(config, newContent, sha) {
  const { owner, repo, branch, filePath, token } = config;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  // Encode content to base64 (UTF-8 safe)
  const base64 = btoa(unescape(encodeURIComponent(newContent)));

  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const commitMessage = `Blip edit: ${timestamp}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: commitMessage,
      content: base64,
      sha: sha,
      branch: branch,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub commit failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return {
    sha: data.content.sha,
    commitSha: data.commit.sha,
    commitMessage: commitMessage,
    commitUrl: data.commit.html_url,
  };
}

// -------------------------------------------------------
// License validation (called from content scripts via message)
// -------------------------------------------------------
async function validateLicense(key) {
  const response = await fetch(
    "https://my.remaphq.com/webhook/validate-blip-license",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    },
  );

  if (!response.ok) {
    throw new Error(`Validation request failed (${response.status})`);
  }

  return await response.json();
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    // Try to toggle if content scripts are already injected
    await chrome.tabs.sendMessage(tab.id, { action: "toggle_blip_sidebar" });
  } catch (err) {
    // Content scripts not yet injected on this tab - inject them now
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          "config.js",
          "licensing.js",
          "github.js",
          "file-resolver.js",
          "mapping.js",
          "edit-history.js",
          "text-diff.js",
          "local-fs.js",
          "content.js",
        ],
      });
    } catch (injectErr) {
      console.log(
        "Blip: Cannot inject on this page (likely a chrome:// restricted URL).",
      );
    }
  }
});
