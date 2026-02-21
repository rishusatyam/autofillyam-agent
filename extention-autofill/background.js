// Background Service Worker
// Handles background tasks and communication

console.log('🔧 TravelID Scanner background service worker initialized');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('🎉 Extension installed successfully');
    
    // Set default settings
    chrome.storage.local.set({
      settings: {
        autoHighlight: true,
        scanTimeout: 2000,
        debugMode: false
      }
    });
  } else if (details.reason === 'update') {
    console.log('🔄 Extension updated');
  }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Message received:', request);
  
  // Handle different message types if needed
  if (request.action === 'SAVE_SCAN') {
    saveScanData(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Save scan data to chrome.storage
 */
async function saveScanData(data) {
  const key = `scan_${data.provider}_${Date.now()}`;
  
  await chrome.storage.local.set({
    [key]: data,
    lastScan: data
  });
  
  console.log(`💾 Scan data saved: ${key}`);
  
  // Keep only last 10 scans to avoid storage bloat
  await cleanupOldScans();
}

/**
 * Cleanup old scans (keep only last 10)
 */
async function cleanupOldScans() {
  const all = await chrome.storage.local.get(null);
  const scanKeys = Object.keys(all).filter(key => key.startsWith('scan_'));
  
  if (scanKeys.length > 10) {
    // Sort by timestamp (key contains timestamp)
    scanKeys.sort();
    
    // Remove oldest scans
    const toRemove = scanKeys.slice(0, scanKeys.length - 10);
    await chrome.storage.local.remove(toRemove);
    
    console.log(`🧹 Cleaned up ${toRemove.length} old scans`);
  }
}

/**
 * Handle extension icon click
 */
chrome.action.onClicked.addListener((tab) => {
  console.log('🖱️ Extension icon clicked for tab:', tab.id);
});
