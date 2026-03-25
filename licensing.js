// licensing.js
// Centralized license management for Blip.
// Loads after config.js (needs BLIP_CONFIG.capabilities).
// Loads before local-fs.js and content.js (they call isProFeature/getTier).
//
// Exposes three globals:
//   getTier()                -> 'foundingVIP' | 'foundingMember' | 'free'
//   isProFeature(featureName) -> boolean
//   activateKey(key)         -> Promise<{ success, tier?, error? }>

'use strict';

// -------------------------------------------------------
// Internal cache (populated on load, updated on activation)
// -------------------------------------------------------
let _cachedTier = 'free';
let _cachedKey = null;
let _cacheReady = false;

// Promise that resolves once the initial storage read is done.
// Other scripts can await this if they need tier info at startup.
const licenseReady = new Promise((resolve) => {
  try {
    chrome.storage.local.get(
      ['blipMembership', 'blipLicenseKey', 'blipLicenseTimestamp'],
      (result) => {
        if (chrome.runtime.lastError) {
          // Storage access failed (possible on file:// without permission)
          _cacheReady = true;
          resolve('free');
          return;
        }

        const membership = result.blipMembership || {};
        _cachedKey = result.blipLicenseKey || null;

        if (membership.foundingVIP) {
          _cachedTier = 'foundingVIP';
        } else if (membership.foundingMember) {
          _cachedTier = 'foundingMember';
        } else {
          _cachedTier = 'free';
        }

        _cacheReady = true;
        resolve(_cachedTier);

        // If licensed, check whether the cache is stale and re-validate in background
        if (_cachedTier !== 'free' && _cachedKey) {
          const ts = result.blipLicenseTimestamp || 0;
          const age = Date.now() - ts;
          if (age > BLIP_CONFIG.licenseTTL) {
            _revalidateInBackground(_cachedKey);
          }
        }
      }
    );
  } catch (e) {
    _cacheReady = true;
    resolve('free');
  }
});


// -------------------------------------------------------
// getTier() - returns current tier synchronously
// -------------------------------------------------------
function getTier() {
  return _cachedTier;
}


// -------------------------------------------------------
// isProFeature(featureName) - capability check
// -------------------------------------------------------
function isProFeature(featureName) {
  if (_cachedTier === 'free') return false;
  const caps = BLIP_CONFIG.capabilities[_cachedTier];
  return caps ? caps.includes(featureName) : false;
}


// -------------------------------------------------------
// activateKey(key) - validate via background.js, cache on success
// -------------------------------------------------------
async function activateKey(key) {
  try {
    // Route the fetch through background.js (service worker)
    // to avoid cross-origin issues from the sidebar iframe
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'VALIDATE_LICENSE', key },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result);
        }
      );
    });

    if (!response.success) {
      return { success: false, error: response.error || 'Validation failed' };
    }

    if (!response.data || !response.data.valid) {
      return { success: false, error: 'invalid' };
    }

    // Valid key - update cache and storage
    const tier = response.data.tier;
    const membership = { [tier]: true };

    _cachedTier = tier;
    _cachedKey = key;

    chrome.storage.local.set({
      blipMembership: membership,
      blipLicenseKey: key,
      blipLicenseTimestamp: Date.now()
    });

    return { success: true, tier };

  } catch (err) {
    return { success: false, error: 'network' };
  }
}


// -------------------------------------------------------
// Background re-validation (silent, non-blocking)
// -------------------------------------------------------
function _revalidateInBackground(key) {
  chrome.runtime.sendMessage(
    { type: 'VALIDATE_LICENSE', key },
    (result) => {
      if (chrome.runtime.lastError) return; // offline, ignore

      if (result && result.success && result.data && result.data.valid) {
        // Still valid - refresh the timestamp
        const tier = result.data.tier;
        const membership = { [tier]: true };
        _cachedTier = tier;
        chrome.storage.local.set({
          blipMembership: membership,
          blipLicenseTimestamp: Date.now()
        });
      }
      // If validation fails or endpoint is unreachable,
      // keep the cached tier. Never block the user.
    }
  );
}
