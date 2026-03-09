importScripts('ort.min.js');

let session = null;

// Load model
async function loadModel() {
    try {
        session = await ort.InferenceSession.create(chrome.runtime.getURL('mobilenet.onnx'), {
            executionProviders: ['webgl'],
            // Consider 'wasm' as a fallback if 'webgl' causes issues in service workers
            // executionProviders: ['wasm']
        });
        console.log("Model loaded successfully.");
    } catch (e) {
        console.error("Failed to load ONNX model:", e);
        chrome.runtime.sendMessage({ type: 'predictionError', error: `Model loading failed: ${e.message}` });
    }
}

// Ensure the model is loaded when the service worker starts
loadModel();

// Listen for messages from popup.js or content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'predictImage') {
        if (message.tensorData) {
            // tensorData is already an ArrayBuffer, so Float32Array can be directly created
            predictWithTensor(message.tensorData);
        } else if (message.imageUrl) {
            predictWithUrl(message.imageUrl);
        }
    } else if (message.type === 'captureAndPredict') {
        captureAndPredict();
    }
});

// Function to handle prediction when a tensor is already available (from file upload)
async function predictWithTensor(tensorDataArray) {
    if (!session) {
        console.error("Model not loaded yet.");
        chrome.runtime.sendMessage({ type: 'predictionError', error: 'Model not loaded yet.' });
        return;
    }
    try {
        const inputTensor = new ort.Tensor('float32', new Float32Array(tensorDataArray), [1, 3, 128, 128]);
        const feeds = {};
        feeds[session.inputNames[0]] = inputTensor;
        const results = await session.run(feeds);
        const output = results[session.outputNames[0]].data;
        const label = output[0] > 0.5 ? "Fake" : "Real"; // adjust based on your model's output
        chrome.runtime.sendMessage({ type: 'predictionResult', label: label });
    } catch (e) {
        console.error("Prediction error:", e);
        chrome.runtime.sendMessage({ type: 'predictionError', error: `Prediction failed: ${e.message}` });
    }
}


// Function to handle prediction from an image URL
async function predictWithUrl(url) {
    if (!session) {
        console.error("Model not loaded yet.");
        chrome.runtime.sendMessage({ type: 'predictionError', error: 'Model not loaded yet.' });
        return;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        const tensorData = processImageToTensor(imageBitmap);
        const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, 128, 128]);

        const feeds = {};
        feeds[session.inputNames[0]] = inputTensor;

        const results = await session.run(feeds);
        const output = results[session.outputNames[0]].data;
        const label = output[0] > 0.5 ? "Fake" : "Real"; // adjust based on your model's output
        chrome.runtime.sendMessage({ type: 'predictionResult', label: label });
    } catch (e) {
        console.error("Failed to process image from URL:", e);
        chrome.runtime.sendMessage({ type: 'predictionError', error: `Failed to process image from URL: ${url}. Error: ${e.message}` });
    }
}

// New function to capture visible tab and predict
async function captureAndPredict() {
    if (!session) {
        console.error("Model not loaded yet.");
        chrome.runtime.sendMessage({ type: 'predictionError', error: 'Model not loaded yet.' });
        return;
    }

    try {
        // captureVisibleTab returns a data URL (base64 string)
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        const response = await fetch(dataUrl); // Fetch the data URL as a blob
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob); // Create ImageBitmap from blob

        const tensorData = processImageToTensor(imageBitmap);
        const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, 128, 128]);

        const feeds = {};
        feeds[session.inputNames[0]] = inputTensor;

        const results = await session.run(feeds);
        const output = results[session.outputNames[0]].data; // Make sure this matches your model's output name
        const label = output[0] > 0.5 ? "Fake" : "Real";
        chrome.runtime.sendMessage({ type: 'predictionResult', label: label });

    } catch (e) {
        console.error("Error capturing visible tab:", e);
        chrome.runtime.sendMessage({ type: 'predictionError', error: `Could not capture tab: ${e.message}` });
    }
}


// Common image to tensor function for background script (uses ImageBitmap)
function processImageToTensor(imageBitmap) {
    // Create an OffscreenCanvas
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');

    // Draw the ImageBitmap onto the OffscreenCanvas
    ctx.drawImage(imageBitmap, 0, 0, 128, 128);

    // Get ImageData from OffscreenCanvas
    const imageData = ctx.getImageData(0, 0, 128, 128).data;

    let inputData = new Float32Array(3 * 128 * 128);
    for (let i = 0; i < 128 * 128; i++) {
        inputData[i] = (imageData[i * 4] / 255 - 0.485) / 0.229; // R
        inputData[128 * 128 + i] = (imageData[i * 4 + 1] / 255 - 0.456) / 0.224; // G
        inputData[2 * 128 * 128 + i] = (imageData[i * 4 + 2] / 255 - 0.406) / 0.225; // B
    }
    return inputData;
}

// Context Menu Integration (same as before)
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "detectImageFakeReal",
        title: "Detect Image (Real/Fake)",
        contexts: ["image"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "detectImageFakeReal" && info.srcUrl) {
        // Send the image URL to the active tab to display a temporary message
        chrome.tabs.sendMessage(tab.id, {
            type: "displayStatus",
            message: "Detecting image..."
        });
        predictWithUrl(info.srcUrl);
    }
});