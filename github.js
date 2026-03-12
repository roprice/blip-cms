'use strict';
// GitHub API communication via background service worker

async function listRepoFiles() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: 'GITHUB_LIST_FILES', config: githubConfig },
            (response) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (response.success) resolve(response.data);
                else reject(new Error(response.error));
            }
        );
    });
}

async function fetchFromGitHub(filePath) {
    const configWithPath = { ...githubConfig, filePath: filePath || resolvedFilePath };
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: 'GITHUB_FETCH', config: configWithPath },
            (response) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (response.success) resolve(response.data);
                else reject(new Error(response.error));
            }
        );
    });
}

async function commitToGitHub(content, sha) {
    const configWithPath = { ...githubConfig, filePath: resolvedFilePath };
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: 'GITHUB_COMMIT', config: configWithPath, content, sha },
            (response) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (response.success) resolve(response.data);
                else reject(new Error(response.error));
            }
        );
    });
}