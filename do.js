let audioChunks = [];
let recorder;
const openPhotoGalleryCreate = document.getElementById('open-photo-gallery-create');
const openPhotoGalleryListen = document.getElementById('open-photo-gallery-listen');
const photoInput = document.getElementById('photoInput');
const photoEnhancedInput = document.getElementById('photoEnhancedInput');
const recordButton = document.getElementById('recordAudio');
const stopButton = document.getElementById('stopAudio');
const processButton = document.getElementById('processButton');
const playAudioButton = document.getElementById('listenButton');
const downloadLink = document.getElementById('downloadLink');
const canvasCreate = document.getElementById('canvasCreate');
const audioPlayer = document.getElementById('audioPlayer');
const navCreate = document.getElementById('navCreate');
const navListen = document.getElementById('navListen');
const mainCreate = document.getElementById('mainCreate');
const mainListen = document.getElementById('mainListen');
const errorlog = document.getElementById('errorlog');
const timer = document.getElementById("timer");
let imageHolderBeforeProcessing;

let currentLanguage = 'en';
const texts = {};
let userLanguage = navigator.language || navigator.userLanguage;
let languageCode = getLanguageCode(userLanguage);
setLanguage(languageCode);

function getLanguageCode(language) {
    return language.slice(0, 2);
}

function loadLanguage(language) {
    fetch(`lang/${language}.json`)
        .then(response => response.json())
        .then(data => {
            texts[language] = data;
            updateTexts();
        });
}

function setLanguage(language) {
    currentLanguage = language;
    document.documentElement.lang = language;
    document.querySelector(".language-menu ul").classList.add("hidden");
    if (!texts[language]) {
        loadLanguage(language);
    } else {
        updateTexts();
    }
}

function updateTexts() {
    const langTexts = texts[currentLanguage];
    for (const key in langTexts) {
        const elements = document.querySelectorAll(`[data-lang="${key}"]`);
        elements.forEach(element => {
            element.innerHTML = langTexts[key];
        });
    }
}

document.querySelector(".language-menu .current").addEventListener("click", function(e) {
    document.querySelector(".language-menu ul").classList.toggle("hidden");
})

const maxExifSize = 64 * 1024; // 64 KB
const lengthLimit = 8000;

const supportedMimeTypes = [
    'audio/ogg; codecs=opus',
    'audio/webm; codecs=opus',
    'audio/mp4; codecs=mp4a.40.2',
    'audio/mpeg'
];

// Choose the best supported mime type
let mimeType = '';

for (let type of supportedMimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        errorlog.innerHTML += "<br>" + (mimeType);
        break;
    }
}

if (!mimeType) {
    alert('No supported audio formats found. Please use a different browser.');
    throw new Error('No supported audio formats found.');
}

if (navCreate) {
    navCreate.addEventListener("click", () => {
        navCreate.classList.add("active");
        navListen.classList.remove("active");
        mainCreate.classList.add("active");
        mainListen.classList.remove("active");
    });
}

if (navListen) {
    navListen.addEventListener("click", () => {
        navListen.classList.add("active");
        navCreate.classList.remove("active");
        mainListen.classList.add("active");
        mainCreate.classList.remove("active");
    });
}

if (playAudioButton) {
    playAudioButton.addEventListener("click", () => {
        audioPlayer.play();
    });
}

if (openPhotoGalleryCreate) {
    openPhotoGalleryCreate.addEventListener("click", () => {
        photoInput.click();
    });
}

if (openPhotoGalleryListen) {
    openPhotoGalleryListen.addEventListener("click", () => {
        photoEnhancedInput.click();
    });
}

if (photoInput) {
    photoInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        const fileType = file.type;

        document.body.classList.add('loading');

        if (fileType === 'image/heic' || fileType === 'image/heif') {
            try {
                const convertedBlob = await heic2any({
                    blob: file,
                    toType: "image/jpeg",
                });
                errorlog.innerHTML += "<br>" + ('HEIC converted to JPEG successfully.');
                const convertedFile = new File([convertedBlob], file.name.replace(/\.[^/.]+$/, ".jpeg"), { type: "image/jpeg" });
                handleImage(convertedFile);
                imageHolderBeforeProcessing = convertedFile;
            } catch (error) {
                errorlog.innerHTML += "<br>" + ("Error converting HEIC to JPEG:", error);
                document.body.classList.remove('loading');
                errorlog.innerHTML += "<br>" + ('Failed to convert HEIC file. Please try another image.');
            }
        } else {
            handleImage(file);
            imageHolderBeforeProcessing = file;
        }
    });
}

if (stopButton) {
    stopButton.addEventListener('click', () => {
        clearTimeout(recordTimeout);
        stopRecording();
    });
}

if (recordButton) {
    recordButton.addEventListener('click', async () => {
        audioChunks = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let targetBitrate;

        if (mimeType === 'audio/ogg; codecs=opus') {
            // Choose a bitrate that allows for a 10-second recording to fit within the EXIF size limit (64 KB) for OGG Opus
            targetBitrate = 54000; // Target bitrate in bits per second
        } else {
            // Choose a lower bitrate for other MIME types (e.g., audio/mp4)
            targetBitrate = 32000; // Lower bitrate for non-OGG formats
        }

        recorder = new MediaRecorder(stream, { mimeType: mimeType, audioBitsPerSecond: targetBitrate });
        recorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        recorder.start();
        recordButton.disabled = true;
        recordButton.classList.remove("highlight");
        stopButton.disabled = false;
        stopButton.classList.add("highlight");

        startTimer();

        setTimeout(() => {
            stopRecording();
        }, lengthLimit);
    });
}

if (processButton) {
    processButton.addEventListener('click', async () => {
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        const audioArrayBuffer = await audioBlob.arrayBuffer();
        const audioArray = new Uint8Array(audioArrayBuffer);

        // Log the size of the recorded audio data
        errorlog.innerHTML += "<br>" + (`Recorded audio data size: ${Math.floor(audioArray.length / 1024)} kB`);

        if (photoInput.files.length === 0) {
            alert('Please select a photo first.');
            return;
        }

        const file = imageHolderBeforeProcessing;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const photoDataUrl = event.target.result;

            // Extract existing EXIF data
            const exifObj = piexif.load(photoDataUrl);

            // Insert audio data into a custom EXIF field
            exifObj.Exif[piexif.ExifIFD.UserComment] = String.fromCharCode.apply(null, audioArray);

            // Insert modified EXIF data into the image
            const exifBytes = piexif.dump(exifObj);
            const newPhotoDataUrl = piexif.insert(exifBytes, photoDataUrl);

            const base64 = newPhotoDataUrl.split(',')[1];
            const blob = base64ToBlob(base64, 'image/jpeg');
            const blobURL = URL.createObjectURL(blob);

            downloadLink.href = blobURL;
            downloadLink.download = 'enhanced_photo.jpg';
            downloadLink.classList.remove("disabled");
            downloadLink.classList.add("highlight");
            processButton.disabled = true;
            processButton.classList.remove("highlight");
        };
        reader.readAsDataURL(file);
    });
}

if (photoEnhancedInput) {
    photoEnhancedInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            errorlog.innerHTML += "<br>" + ('File loaded into FileReader.');
            const arrayBuffer = e.target.result;
            const photoBlob = new Blob([arrayBuffer], { type: 'image/jpeg' });
            const photoURL = URL.createObjectURL(photoBlob);
            document.getElementById('enhancedPhotoPreview').src = photoURL;

            try {
                errorlog.innerHTML += "<br>" + ('Extracting EXIF data...');
                const exifData = await extractExif(arrayBuffer);
                errorlog.innerHTML += "<br>" + ("EXIF data extracted");

                if (exifData.Exif[piexif.ExifIFD.UserComment]) {
                    const segment = exifData.Exif[piexif.ExifIFD.UserComment];
                    const byteArray = new Uint8Array(segment.split('').map(char => char.charCodeAt(0)));
                    const audioBlob = new Blob([byteArray], { type: mimeType });
                    audioPlayer.src = URL.createObjectURL(audioBlob);
                    playAudioButton.disabled = false;
                    playAudioButton.classList.add("highlight");
                    openPhotoGalleryListen.disabled = true;
                    openPhotoGalleryListen.classList.remove("highlight");
                } else {
                    errorlog.innerHTML += "<br>" + ("No audio metadata found in the selected photo.");
                    status.textContent = 'No audio metadata found in the selected photo.';
                    playAudioButton.disabled = true;
                }
            } catch (error) {
                errorlog.innerHTML += "<br>" + ('Error extracting EXIF metadata:', error);
                status.textContent = 'Error extracting EXIF metadata.';
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

function handleImage(imageFile) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const maxArea = 16777216;
            if (img.width * img.height > maxArea) {
                const scaleFactor = Math.sqrt(maxArea / (img.width * img.height));
                const newWidth = Math.floor(img.width * scaleFactor);
                const newHeight = Math.floor(img.height * scaleFactor);
                canvasCreate.width = newWidth;
                canvasCreate.height = newHeight;
            } else {
                canvasCreate.width = img.width;
                canvasCreate.height = img.height;
            }
            const ctx = canvasCreate.getContext('2d');
            ctx.drawImage(img, 0, 0, canvasCreate.width, canvasCreate.height);

        

            document.body.classList.remove('loading');
            openPhotoGalleryCreate.disabled = true;
            openPhotoGalleryCreate.classList.remove("highlight");
            recordButton.disabled = false;
            recordButton.classList.add("highlight");
            // Call the function to handle EXIF data
            handleExifData(e.target.result);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(imageFile);
}
function handleExifData(dataUrl) {
    try {
        piexif.load(dataUrl);
    } catch (error) {
        errorlog.innerHTML += "<br>" + ('Error loading EXIF data:', error);
    }
}

function stopRecording() {
    recorder.stop();
    processButton.disabled = false;
    processButton.classList.add("highlight");
    stopButton.disabled = true;
    stopButton.classList.remove("highlight");
}

function startTimer() {
    let elapsedTime = 0;
    
    const interval = setInterval(() => {
        elapsedTime += 1;
        timer.textContent = elapsedTime + "/" + (lengthLimit / 1000) + "s";
        
        if (elapsedTime >= 8) {
            clearInterval(interval);
        }
    }, 1000);
}

async function extractExif(arrayBuffer) {
    try {
        errorlog.innerHTML += "<br>" + ("Converting arrayBuffer to binary string.");
        const binaryString = arrayBufferToBinaryString(arrayBuffer);
        errorlog.innerHTML += "<br>" + ("Loading EXIF data.");
        const exifObj = piexif.load(binaryString);
        errorlog.innerHTML += "<br>" + ("EXIF data loaded");
        return exifObj;
    } catch (error) {
        errorlog.innerHTML += "<br>" + ('Error in extractExif:', error);
        throw error;
    }
}

function arrayBufferToBinaryString(arrayBuffer) {
    errorlog.innerHTML += "<br>" + ("Converting arrayBuffer to binary string.");
    let binaryString = '';
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binaryString += String.fromCharCode(bytes[i]);
    }
    errorlog.innerHTML += "<br>" + ("Binary string conversion complete.");
    return binaryString;
}

function asciiToUint8Array(str) {
    errorlog.innerHTML += "<br>" + ("Converting ASCII string to Uint8Array.");
    const chars = [];
    for (let i = 0; i < str.length; ++i) {
        chars.push(str.charCodeAt(i));
    }
    return new Uint8Array(chars);
}

function uint8ArrayToAscii(array) {
    errorlog.innerHTML += "<br>" + ("Converting Uint8Array to ASCII string.");
    return String.fromCharCode.apply(null, array);
}

function base64ToBlob(base64, type) {
    errorlog.innerHTML += "<br>" + ("Converting base64 to Blob.");
    const binary = atob(base64);
    const array = [];
    for (let i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i));
    }
    return new Blob([new Uint8Array(array)], { type: type });
}
