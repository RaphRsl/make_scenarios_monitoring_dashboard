// ==UserScript==
// @name         Make: Auto Send Blueprint on Save with In-Page Green Toast + API token secured
// @namespace    http://tampermonkey.net/
// @version      0.19.1
// @description  Fetch/send full blueprint JSON + URL on save and show in-page green toast in top-right
// @downloadURL  https://raw.githubusercontent.com/raphrsl/make_scenarios_monitoring_dashboard/main/make_export_script.user.js
// @updateURL    https://raw.githubusercontent.com/raphrsl/make_scenarios_monitoring_dashboard/main/make_export_script.user.js
// @match        https://*.make.com/*/scenarios/*
// @connect      *.make.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // Web App URL
  const webAppUrl = 'https://script.google.com/macros/s/AKfycbyVf7d68oC7Tdsmo5ga4x478ejsOOcfWiUxiDHD1W3BJnas4LA0DpJgDN9KUz4N7Efo/exec';

  // Retrieve stored API token
  let apiToken = GM_getValue('apiToken', '');

  // Menu command to set API token
  GM_registerMenuCommand('Set API Token', () => {
    const token = prompt('Enter your API Token:', apiToken);
    if (token !== null) {
      GM_setValue('apiToken', token);
      apiToken = token;
      alert('API Token saved.');
    }
  });

  // Fallback menu command
  GM_registerMenuCommand("🔄 Fetch & Send Raw Blueprint", fetchAndSend);

  // Inject minimal CSS for toast container
  const toastStyle = document.createElement('style');
  toastStyle.textContent = `
    .tm-toast-container { position: fixed; top: 16px; right: 16px; z-index:9999; }
    .tm-toast {
      background: rgba(46, 204, 113, 0.9);
      color: #fff;
      padding: 8px 12px;
      margin-top: 8px;
      border-radius: 4px;
      font-family: sans-serif;
      opacity: 1;
      transition: opacity 0.5s ease;
    }
  `;
  document.head.appendChild(toastStyle);

  // Create toast container
  const toastContainer = document.createElement('div');
  toastContainer.className = 'tm-toast-container';
  document.body.appendChild(toastContainer);

  // Listen for Save button clicks
  document.addEventListener('click', event => {
    const saveBtn = event.target.closest('button[data-testid="btn-inspector-save"]');
    if (saveBtn) {
      console.log("[AutoSend] Save button clicked, sending blueprint...");
      fetchAndSend();
    }
  }, true);

  /**
   * Displays a toast message in-page for 2.5 seconds then fades out.
   * @param {string} msg - The message text
   */
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'tm-toast';
  toast.textContent = msg;

  // Set background color based on message content
  if (msg === 'Scenario saved to Dashboard') {
    toast.style.background = 'rgba(46, 204, 113, 0.9)'; // Green
  } else {
    toast.style.background = 'rgba(231, 76, 60, 0.9)'; // Red
  }

  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 2500);
}

  /**
   * Fetches the full blueprint JSON and POSTs it along with URL & title, then shows toast on success.
   */
  async function fetchAndSend() {
    try {
      // Check if API token is set
      if (!apiToken) {
        alert('API Token is not set. Please set it via the Tampermonkey menu.');
        return;
      }

      console.log("[AutoSend] Starting fetch...");
      const m = location.href.match(/\/scenarios\/(\d+)/);
      if (!m) {
        console.error('[AutoSend] Scenario ID not found.');
        return;
      }
      const scenarioId = m[1];
      const apiUrl = `${location.origin}/api/v2/scenarios/${scenarioId}/blueprint`;

      // Fetch blueprint JSON
      GM_xmlhttpRequest({
        method: 'GET',
        url: apiUrl,
        headers: {
          'Authorization': `Token ${apiToken}`,
          'Accept': 'application/json'
        },
        onload(resp) {
          if (resp.status !== 200) {
            console.error('[AutoSend] API Error', resp.status, resp.statusText);
            showToast('Error fetching blueprint');
            return;
          }

          const rawJson = JSON.parse(resp.responseText);
          const scenarioUrl = location.href.replace(/\/edit(?:\/.*)?$/, '');
          const title = rawJson.response?.blueprint?.name || `Scenario ${scenarioId}`;
          const payload = { scenarioId, raw: rawJson, scenarioUrl, title };

          console.log(`[AutoSend] Sending raw JSON for scenario ${scenarioId}`);

          // POST payload to Apps Script
          GM_xmlhttpRequest({
            method: 'POST',
            url: webAppUrl,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify(payload),
            onload(res) {
              console.log('[AutoSend] GoogleSheet response:', res.responseText);
              try {
                const result = JSON.parse(res.responseText);
                if (result.result === 'success') {
                  showToast(`Scenario saved to Dashboard`);
                } else {
                  showToast('Save failed');
                }
              } catch (e) {
                  // If parsing fails, handle as HTML response
                  const parser = new DOMParser();
                  const doc = parser.parseFromString(res.responseText, 'text/html');
                  const errorMsg = doc.querySelector('p.errorMessage')?.textContent?.trim() || 'Unexpected HTML response';
                  console.warn('[AutoSend] HTML error:', errorMsg);
                  showToast(errorMsg);
              }
            },
            onerror(err) {
              console.error('[AutoSend] Send error:', err);
              showToast('Error sending to sheet');
            }
          });
        },
        onerror(err) {
          console.error('[AutoSend] Fetch failed:', err);
          showToast('Fetch error');
        }
      });
    } catch (err) {
      console.error('[AutoSend] Unexpected error:', err);
      showToast('Unexpected script error');
    }
  }
})();
