// This script runs on every page to enable context menu interaction and display results
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'predictionResult') {
        displayTemporaryMessage(`Prediction: ${message.label}`);
    } else if (message.type === 'predictionError') {
        displayTemporaryMessage(`Error: ${message.error}`, true);
    } else if (message.type === 'displayStatus') {
        displayTemporaryMessage(message.message);
    }
});

function displayTemporaryMessage(text, isError = false) {
    let statusDiv = document.getElementById('chrome-extension-image-detector-status');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'chrome-extension-image-detector-status';
        statusDiv.style.position = 'fixed';
        statusDiv.style.bottom = '20px';
        statusDiv.style.right = '20px';
        statusDiv.style.backgroundColor = isError ? '#f44336' : '#5cb85c';
        statusDiv.style.color = 'white';
        statusDiv.style.padding = '10px 15px';
        statusDiv.style.borderRadius = '5px';
        statusDiv.style.zIndex = '10000';
        statusDiv.style.opacity = '0';
        statusDiv.style.transition = 'opacity 0.5s ease-in-out';
        document.body.appendChild(statusDiv);
    }
    statusDiv.innerText = text;
    statusDiv.style.backgroundColor = isError ? '#f44336' : '#5cb85c';
    statusDiv.style.opacity = '1';

    setTimeout(() => {
        statusDiv.style.opacity = '0';
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.parentNode.removeChild(statusDiv);
            }
        }, 500); // Wait for fade out
    }, 3000); // Message displayed for 3 seconds
}

// IMPORTANT: The `extractImageUrlsFromPage` function is now in popup.js
// and executed via chrome.scripting.executeScript.
// If you wanted it here, you'd keep it as a standalone function in this file.