/**
 * Ollama Web UI - Session/Data Layer
 * IndexedDB chat persistence + localStorage preferences.
 */

(function sessionModule() {
    const DB_NAME = 'OllamaUIDB';
    const STORE_NAME = 'chats';
    const DB_VERSION = 1;
    const CTRL_ENTER_SUBMIT_KEY = 'ctrl_enter_submit';
    let dbHandle = null;

    function openDB() {
        if (dbHandle) {
            return Promise.resolve(dbHandle);
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = () => {
                dbHandle = request.result;
                resolve(dbHandle);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function getAllChats() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveChat(chat) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(chat);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteChat(chatId) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(chatId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    function loadCtrlEnterToSubmitSetting() {
        return localStorage.getItem(CTRL_ENTER_SUBMIT_KEY) === 'true';
    }

    function saveCtrlEnterToSubmitSetting(enabled) {
        localStorage.setItem(CTRL_ENTER_SUBMIT_KEY, String(Boolean(enabled)));
    }

    window.OllamaSession = {
        openDB,
        getAllChats,
        saveChat,
        deleteChat,
        loadCtrlEnterToSubmitSetting,
        saveCtrlEnterToSubmitSetting
    };
})();
