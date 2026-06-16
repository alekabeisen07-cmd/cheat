const { ipcRenderer } = require('electron');

// ТВОИ КЛЮЧИ GEMINI
const API_KEYS = [
    "AIzaSyDms6gSYdym2TqvK5PPir2lm-ns55s6FSs",
    "AIzaSyCcQAc6RblDc7qFvkcLFRua7Hy_YS1tv34"
];

let currentKeyIndex = 0;
let isThinking = false;

/** 
 * МОДЕЛИ ИЗ ТВОЕГО СПИСКА:
 * gemini-2.5-flash (Стабильная, быстрая)
 * gemini-3.1-flash-lite (Самая новая, стабильная)
 * gemini-3.1-flash-preview (Превью версия)
 */
const MODEL_ID = "gemini-3.1-flash-lite";

function sendLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    ipcRenderer.send('write-log', `[${timestamp}] ${msg}`);
}

// Переключение ключей (Z/X)
ipcRenderer.on('switch-key', (event, index) => {
    currentKeyIndex = index;
    const keyLabel = index === 0 ? 'Z' : 'X';
    document.getElementById('status').innerText = `MODE: ${keyLabel}`;
    sendLog(`SWITCH: Switched to Key ${keyLabel}`);
});

async function askGemini() {
    if (isThinking) return;

    const output = document.getElementById('output');
    const status = document.getElementById('status');
    const keyLabel = currentKeyIndex === 0 ? 'Z' : 'X';

    isThinking = true;
    status.innerText = "THINKING...";
    sendLog(`REQUEST: Analyzing with ${MODEL_ID} (Key ${keyLabel})`);

    try {
        const screenshot = await ipcRenderer.invoke('get-screenshot');
        const base64Image = screenshot.split(',')[1];

        const testPrompt = `You are an expert test-solving assistant. 
        Your task: Analyze the screenshot and solve ALL multiple-choice questions.
        RULES:
        1. If a question asks for multiple answers (e.g., 'choose three'), list ALL correct options.
        2. Format: '[Question Number]: [Answer Text]'.
        3. Be extremely concise. No explanations.
        4. If the test is in Russian/Kazakh, provide answers in that language.
        5. Just list the answers, nothing else.`;

        // Для СТАБИЛЬНЫХ моделей (2.5-flash) используем /v1/
        // Для ПРЕВЬЮ моделей (3.1-flash-preview) используем /v1beta/
        const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL_ID}:generateContent?key=${API_KEYS[currentKeyIndex]}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: testPrompt },
                        { inline_data: { mime_type: "image/png", data: base64Image } }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024
                }
            })
        });

        const data = await response.json();

        if (response.ok) {
            if (data.candidates && data.candidates[0].content) {
                const aiText = data.candidates[0].content.parts[0].text;
                output.innerText = aiText;
                status.innerText = `READY (${keyLabel})`;
                sendLog(`SUCCESS: Answer received.`);
            } else {
                throw new Error("AI returned empty content. Check Safety Filters.");
            }
        } else {
            sendLog(`API ERROR: ${JSON.stringify(data)}`);
            // Если 2.5 не работает, попробуй поменять MODEL_ID на gemini-3.1-flash-lite
            output.innerText = `ERR ${response.status}: ${data.error ? data.error.message : 'Unknown'}`;
            status.innerText = "FAILED";
        }
    } catch (err) {
        sendLog(`CRITICAL ERROR: ${err.message}`);
        status.innerText = "ERROR";
        output.innerText = "CRASH: SEE LOGS";
    }
    isThinking = false;
}

ipcRenderer.on('global-analyze', () => askGemini());