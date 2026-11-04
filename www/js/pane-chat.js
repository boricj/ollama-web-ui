/**
 * Ollama Web UI - Chat Pane
 */

(function chatPaneModule() {
    function getApiUrl(path) {
        return path;
    }

    function getApp() {
        if (!window.OllamaUI) {
            throw new Error('OllamaUI is not initialized');
        }

        return window.OllamaUI;
    }

    function clearChatMessages() {
        const app = getApp();
        app.elements.chatHistory.querySelectorAll('.chat-message').forEach((node) => node.remove());
        lastScrollHeight = 0;
        autoScrollEnabled = true;
    }

    let lastScrollHeight = 0;
    let wasAtBottomBeforeSend = false;
    let autoScrollEnabled = true;

    function isNearBottom() {
        const app = getApp();
        const chatHistory = app.elements.chatHistory;
        const distanceFromBottom = chatHistory.scrollHeight - (chatHistory.scrollTop + chatHistory.clientHeight);
        return distanceFromBottom <= 4;
    }

    function shouldAutoScroll() {
        const app = getApp();
        const chatHistory = app.elements.chatHistory;
        const heightChanged = chatHistory.scrollHeight !== lastScrollHeight;
        if (!heightChanged || !autoScrollEnabled) {
            return false;
        }

        lastScrollHeight = chatHistory.scrollHeight;

        if (wasAtBottomBeforeSend) {
            wasAtBottomBeforeSend = false;
            autoScrollEnabled = true;
            return true;
        }

        return true;
    }

    function scrollChatIfNeeded() {
        const app = getApp();
        if (shouldAutoScroll()) {
            app.elements.chatHistory.scrollTop = app.elements.chatHistory.scrollHeight;
        }
    }

    function markAtBottomBeforeSend() {
        wasAtBottomBeforeSend = isNearBottom();
        autoScrollEnabled = wasAtBottomBeforeSend;
    }

    async function saveCurrentChat() {
        const app = getApp();
        if (!app.state.currentChatId) return;

        const chat = app.getCurrentChat();
        if (chat) {
            await window.OllamaSession.saveChat(chat);
        }
    }

    function startNewChat(options = {}) {
        const app = getApp();
        const { resetPrompt = true } = options;

        app.state.currentChatId = null;
        clearChatMessages();

        if (resetPrompt) {
            app.elements.userPrompt.value = '';
            app.elements.userPrompt.style.height = 'auto';
        }

        app.updateSendButtonState();
        app.switchView('chat');
        app.refreshHistoryList();
    }

    function appendMessage(role, text, shouldScroll = true) {
        const app = getApp();
        const div = document.createElement('div');
        div.className = `chat-message ${role}`;

        if (role === 'assistant' || role === 'user') {
            div.innerHTML = DOMPurify.sanitize(marked.parse(text));
        } else {
            div.textContent = text;
        }

        app.elements.chatHistory.appendChild(div);
        if (shouldScroll && shouldAutoScroll()) {
            app.elements.chatHistory.scrollTop = app.elements.chatHistory.scrollHeight;
        }
    }

    function setSendButtonLoading(isLoading) {
        const app = getApp();
        const button = app.elements.btnSend;

        if (isLoading) {
            app.state.isSending = true;
            button.classList.add('is-loading');
            button.disabled = true;
            return;
        }

        app.state.isSending = false;
        button.classList.remove('is-loading');
        button.disabled = !(app.elements.userPrompt.value.trim() && app.elements.modelSelect.value);
    }

    function showResponseLoading(chat) {
        const app = getApp();
        if (!chat || app.state.currentChatId !== chat.id || !chat.isStreaming || chat.currentResponse.length > 0) {
            const loadingPlaceholder = app.elements.chatHistory.querySelector('.chat-response-loading');
            if (loadingPlaceholder) {
                loadingPlaceholder.remove();
            }
            return;
        }

        const lastChild = app.elements.chatHistory.lastElementChild;
        if (lastChild && lastChild.classList.contains('chat-response-loading')) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message assistant chat-response-loading';
        wrapper.innerHTML = '<div class="chat-response-loading-content"><span class="chat-response-spinner" aria-hidden="true"></span><span>Thinking...</span></div>';
        app.elements.chatHistory.appendChild(wrapper);
        scrollChatIfNeeded();
    }

    function updateStreamingUI(chat) {
        const app = getApp();
        if (!chat || app.state.currentChatId !== chat.id) return;

        const loadingPlaceholder = app.elements.chatHistory.querySelector('.chat-response-loading');
        if (loadingPlaceholder) {
            loadingPlaceholder.remove();
        }

        const lastMsg = app.elements.chatHistory.lastElementChild;
        if (lastMsg && lastMsg.classList.contains('chat-message') && lastMsg.classList.contains('assistant')) {
            lastMsg.innerHTML = DOMPurify.sanitize(marked.parse(chat.currentResponse));
        } else {
            const div = document.createElement('div');
            div.className = 'chat-message assistant';
            div.innerHTML = DOMPurify.sanitize(marked.parse(chat.currentResponse));
            app.elements.chatHistory.appendChild(div);
        }

        scrollChatIfNeeded();
    }

    function parseOllamaStreamChunk(chat, chunkText) {
        const app = getApp();
        const combinedText = (chat.streamBuffer || '') + chunkText;
        chat.streamBuffer = '';

        const lines = combinedText.split('\n');
        const pendingLine = lines.pop();
        if (pendingLine && pendingLine.trim()) {
            chat.streamBuffer = pendingLine;
        }

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const json = JSON.parse(line);
                if (json.message && typeof json.message.content === 'string') {
                    chat.currentResponse += json.message.content;
                    if (app.state.currentChatId === chat.id) {
                        updateStreamingUI(chat);
                    }
                }
                if (json.done) {
                    return true;
                }
            } catch (error) {
                // Ignore malformed JSON fragments until the stream completes.
            }
        }

        return false;
    }

    function drainFinalStreamBuffer(chat) {
        if (!chat.streamBuffer || !chat.streamBuffer.trim()) {
            return;
        }

        try {
            const json = JSON.parse(chat.streamBuffer);
            if (json.message && typeof json.message.content === 'string') {
                chat.currentResponse += json.message.content;
            }
        } catch (error) {
            // Ignore malformed trailing stream fragments.
        }

        chat.streamBuffer = '';
    }

    function setSubmitShortcut(enabled) {
        const app = getApp();
        app.state.settings.ctrlEnterToSend = !!enabled;
    }

    async function loadModels() {
        const app = getApp();
        app.elements.btnSend.disabled = true;

        try {
            const response = await fetch(getApiUrl('/api/tags'));
            if (!response.ok) throw new Error('Failed to fetch models');

            const data = await response.json();
            app.elements.modelSelect.innerHTML = '';

            if (!data.models || data.models.length === 0) {
                throw new Error('No models found');
            }

            data.models.sort((a, b) => a.name.localeCompare(b.name));
            data.models.forEach((model) => {
                const opt = document.createElement('option');
                opt.value = model.name;
                opt.textContent = model.name;
                app.elements.modelSelect.appendChild(opt);
            });

            app.updateSendButtonState();
        } catch (error) {
            app.elements.modelSelect.innerHTML = '<option value="">Loading models...</option>';
            setTimeout(loadModels, 5000);
        }
    }

    async function handleSend() {
        const app = getApp();
        const prompt = app.elements.userPrompt.value.trim();
        const model = app.elements.modelSelect.value;
        if (!prompt || !model || app.state.isSending) return;

        app.elements.userPrompt.value = '';
        app.elements.userPrompt.style.height = 'auto';
        setSendButtonLoading(true);

        // Remember if we're at the bottom before adding the user message
        markAtBottomBeforeSend();

        if (app.state.currentChatId === null) {
            const chatId = Date.now().toString();
            const chatName = prompt.length > 30 ? `${prompt.substring(0, 27)}...` : prompt;

            app.state.chats.unshift({
                id: chatId,
                name: chatName,
                model,
                messages: [],
                isStreaming: false,
                currentResponse: '',
                streamBuffer: ''
            });

            app.state.currentChatId = chatId;
            app.refreshHistoryList();
            clearChatMessages();
        }

        const chat = app.getCurrentChat();
        if (!chat) {
            app.updateSendButtonState();
            return;
        }

        appendMessage('user', prompt);
        chat.messages.push({ role: 'user', content: prompt });
        await saveCurrentChat();

        chat.isStreaming = true;
        chat.currentResponse = '';
        chat.streamBuffer = '';
        showResponseLoading(chat);

        try {
            const response = await fetch(getApiUrl('/api/chat'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: chat.messages
                        .filter((message) => message.role !== 'error')
                        .map((message) => ({
                            role: message.role === 'assistant' ? 'assistant' : 'user',
                            content: message.content
                        })),
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            if (!response.body) {
                throw new Error('Streaming response missing body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                parseOllamaStreamChunk(chat, chunk);
            }

            drainFinalStreamBuffer(chat);

            chat.streamBuffer = '';
            chat.messages.push({ role: 'assistant', content: chat.currentResponse });
            chat.isStreaming = false;
            showResponseLoading(chat);
            await saveCurrentChat();
        } catch (error) {
            chat.isStreaming = false;
            showResponseLoading(chat);

            if (app.state.currentChatId === chat.id) {
                appendMessage('error', `Error: ${error.message}`);
            }

            chat.messages.push({ role: 'error', content: error.message });
            await saveCurrentChat();
        } finally {
            setSendButtonLoading(false);
            app.elements.userPrompt.style.height = 'auto';
        }
    }

    function init() {
        const app = getApp();
        app.elements.btnNewChat.addEventListener('click', () => startNewChat({ resetPrompt: true }));
        app.elements.btnSend.addEventListener('click', handleSend);

        app.elements.userPrompt.addEventListener('keydown', (event) => {
            const ctrlEnterToSend = !!app.state.settings.ctrlEnterToSend;

            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                handleSend();
                return;
            }

            if (event.key === 'Enter' && !event.shiftKey && !ctrlEnterToSend) {
                event.preventDefault();
                handleSend();
            }
        });

        app.elements.userPrompt.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = `${this.scrollHeight}px`;
            app.updateSendButtonState();
        });

        app.elements.chatHistory.addEventListener('scroll', () => {
            autoScrollEnabled = isNearBottom();
        });

        app.elements.modelSelect.addEventListener('change', () => app.updateSendButtonState());

        startNewChat({ resetPrompt: false });
        loadModels();
    }

    const chatPane = {
        init,
        clearChatMessages,
        appendMessage,
        updateStreamingUI,
        setSubmitShortcut
    };

    window.OllamaChatPane = chatPane;
})();
