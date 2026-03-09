document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('imageFile');
    const urlInput = document.getElementById('imageURL');
    const predictButton = document.getElementById('predictButton');
    const captureVisibleTabButton = document.getElementById('captureVisibleTabButton');
    const extractImagesButton = document.getElementById('extractImagesButton');
    const imageListDiv = document.getElementById('imageList');
    const predictSelectedImageButton = document.getElementById('predictSelectedImageButton');
    const resultElement = document.getElementById('result');
    const dropZone = document.getElementById('dropZone'); // New element

    let selectedImageUrl = null;

    // --- Drag and Drop Handlers ---
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault(); // Prevent default to allow drop
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); // Prevent default browser behavior (e.g., opening file)
        dropZone.classList.remove('drag-over');

        resultElement.innerText = "Processing dropped image...";

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const tensorData = processImageToTensor(img);
                        sendMessageToBackground({ type: 'predictImage', tensorData: tensorData });
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                resultElement.innerText = "Please drop an image file.";
            }
        } else {
            // Handle scenario where something else was dropped (e.g., text, URL)
            // You could try to parse dataTransfer.getData('text/plain')
            resultElement.innerText = "No image file detected in drop.";
        }
    });
    // --- End Drag and Drop Handlers ---


    predictButton.addEventListener('click', async () => {
        resultElement.innerText = "Processing...";
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = async (e) => {
                const img = new Image();
                img.onload = () => {
                    const tensorData = processImageToTensor(img);
                    sendMessageToBackground({ type: 'predictImage', tensorData: tensorData });
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else if (urlInput.value.trim()) {
            const imageUrl = urlInput.value.trim();
            sendMessageToBackground({ type: 'predictImage', imageUrl: imageUrl });
        } else {
            resultElement.innerText = "Please upload a file or enter an image URL.";
        }
    });

    captureVisibleTabButton.addEventListener('click', async () => {
        resultElement.innerText = "Capturing visible tab and processing...";
        sendMessageToBackground({ type: 'captureAndPredict' });
    });

    extractImagesButton.addEventListener('click', async () => {
        resultElement.innerText = "Extracting images from page...";
        imageListDiv.innerHTML = '<p>Loading images...</p>';
        selectedImageUrl = null;
        predictSelectedImageButton.style.display = 'none';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractImageUrlsFromPage,
            }, (injectionResults) => {
                if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                    displayExtractedImages(injectionResults[0].result);
                } else {
                    imageListDiv.innerHTML = '<p>No images found or error extracting.</p>';
                    resultElement.innerText = "No images extracted.";
                }
            });
        }
    });

    predictSelectedImageButton.addEventListener('click', () => {
        if (selectedImageUrl) {
            resultElement.innerText = "Predicting selected image...";
            sendMessageToBackground({ type: 'predictImage', imageUrl: selectedImageUrl });
        } else {
            resultElement.innerText = "No image selected.";
        }
    });

    function displayExtractedImages(urls) {
        imageListDiv.innerHTML = '';
        if (urls.length === 0) {
            imageListDiv.innerHTML = '<p>No images found on this page.</p>';
            return;
        }

        urls.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.title = url; // Show URL on hover
            img.addEventListener('click', () => {
                const previouslySelected = imageListDiv.querySelector('.selected');
                if (previouslySelected) {
                    previouslySelected.classList.remove('selected');
                }
                img.classList.add('selected');
                selectedImageUrl = url;
                predictSelectedImageButton.style.display = 'block';
            });
            imageListDiv.appendChild(img);
        });
        resultElement.innerText = `Found ${urls.length} images. Click to select one for prediction.`;
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'predictionResult') {
            resultElement.innerText = `Prediction: ${message.label}`;
        } else if (message.type === 'predictionError') {
            resultElement.innerText = `Error: ${message.error}`;
        }
    });

    function sendMessageToBackground(message) {
        chrome.runtime.sendMessage(message);
    }

    // Common image to tensor function (used by file input and drag-drop, runs in popup.js)
    function processImageToTensor(img) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 128, 128);
        const imageData = ctx.getImageData(0, 0, 128, 128).data;

        let inputData = new Float32Array(3 * 128 * 128);
        for (let i = 0; i < 128 * 128; i++) {
            inputData[i] = (imageData[i * 4] / 255 - 0.485) / 0.229; // R
            inputData[128 * 128 + i] = (imageData[i * 4 + 1] / 255 - 0.456) / 0.224; // G
            inputData[2 * 128 * 128 + i] = (imageData[i * 4 + 2] / 255 - 0.406) / 0.225; // B
        }
        return Array.from(inputData); // Convert to array for message passing
    }
});

// Function to be injected and executed in the content script context
function extractImageUrlsFromPage() {
    const imageUrls = new Set();
    document.querySelectorAll('img').forEach(img => {
        if (img.src) {
            imageUrls.add(img.src);
        }
    });
    // Consider also <picture> and CSS background-images if needed, but they are more complex for direct extraction.
    return Array.from(imageUrls);
}