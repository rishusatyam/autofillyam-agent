// Popup controller - handles UI interactions

document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scanBtn');
  const statusDiv = document.getElementById('status');
  const resultsDiv = document.getElementById('results');

  // Scan button handler
  scanBtn.addEventListener('click', async () => {
    try {
      setStatus('⏳ Initiating scan...', 'loading');
      scanBtn.disabled = true;

      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      // Check if page URL is valid for extension
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        throw new Error('Cannot scan Chrome internal pages');
      }

      let response;
      try {
        // Try to send message to content script
        response = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' });
      } catch (error) {
        // If content script not loaded, inject it first
        if (error.message.includes('Could not establish connection')) {
          setStatus('⏳ Loading scanner...', 'loading');
          await injectContentScripts(tab.id);
          // Wait a moment for scripts to initialize
          await new Promise(resolve => setTimeout(resolve, 500));
          // Retry sending message
          response = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' });
        } else {
          throw error;
        }
      }

      if (response?.success) {
        displayResults(response.data);
        await saveToStorage(response.data);
        // Automatically download JSON file
        downloadJSON(response.data);
        setStatus('✅ Scan completed and JSON saved!', 'success');
      } else {
        throw new Error(response?.error || 'Scan failed');
      }
    } catch (error) {
      console.error('Scan error:', error);
      setStatus(`❌ ${error.message}`, 'error');
    } finally {
      scanBtn.disabled = false;
    }
  });

  // Inject content scripts programmatically
  async function injectContentScripts(tabId) {
    try {
      // Inject scripts in order
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['utils.js']
      });
      
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['scanner.js']
      });
      
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
    } catch (error) {
      console.error('Failed to inject scripts:', error);
      throw new Error('Failed to load scanner. Please refresh the page.');
    }
  }

  // Helper functions
  function setStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.classList.remove('hidden');
  }

  function displayResults(data) {
    document.getElementById('provider').textContent = data.provider || 'Unknown';
    document.getElementById('fieldCount').textContent = data.fields?.length || 0;
    document.getElementById('scanTime').textContent = formatTimestamp(data.scannedAt);
    
    resultsDiv.classList.remove('hidden');
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  async function saveToStorage(data) {
    const key = `scan_${data.provider}_${Date.now()}`;
    await chrome.storage.local.set({ 
      [key]: data
    });
  }

  function downloadJSON(data) {
    const filename = `scan_${data.provider}_${Date.now()}.json`;
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    });
  }
});
