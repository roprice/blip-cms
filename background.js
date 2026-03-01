// Blip background service worker
// Handles GitHub API calls on behalf of the content script.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GITHUB_FETCH') {
    githubFetchFile(message.config)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === 'GITHUB_COMMIT') {
    githubCommitFile(message.config, message.content, message.sha)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function githubFetchFile(config) {
  const { owner, repo, branch, filePath, token } = config;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub fetch failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const content = atob(data.content.replace(/\n/g, ''));
  // Handle UTF-8 properly
  const decoded = new TextDecoder().decode(
    Uint8Array.from(content, c => c.charCodeAt(0))
  );

  return {
    content: decoded,
    sha: data.sha,
    size: data.size,
    path: data.path
  };
}

async function githubCommitFile(config, newContent, sha) {
  const { owner, repo, branch, filePath, token } = config;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

  // Encode content to base64 (UTF-8 safe)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(newContent);
  const base64 = btoa(String.fromCharCode(...bytes));

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const commitMessage = `Blip edit: ${timestamp}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: commitMessage,
      content: base64,
      sha: sha,
      branch: branch
    })
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
    commitUrl: data.commit.html_url
  };
}
