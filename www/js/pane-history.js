/**
 * Ollama Web UI - History Pane
 */

(function historyPaneModule() {
    function getApp() {
        if (!window.OllamaUI) {
            throw new Error('OllamaUI is not initialized');
        }

        return window.OllamaUI;
    }

    async function refreshChats() {
        const app = getApp();
        app.state.chats = await window.OllamaSession.getAllChats();
        app.refreshHistoryList();
    }

    function updateDeleteSelectedState() {
        const app = getApp();
        const checkedCount = app.elements.chatList.querySelectorAll('input[type="checkbox"]:checked').length;
        app.elements.btnDeleteSelected.disabled = checkedCount === 0;
    }

    async function deleteSelectedChats() {
        const app = getApp();
        const idsToDelete = Array.from(app.elements.chatList.querySelectorAll('input[type="checkbox"]:checked'))
            .map((input) => input.dataset.chatId)
            .filter(Boolean);
        if (idsToDelete.length === 0) return;

        const confirmed = confirm(`Delete ${idsToDelete.length} selected chat${idsToDelete.length > 1 ? 's' : ''}?`);
        if (!confirmed) return;

        for (const chatId of idsToDelete) {
            await window.OllamaSession.deleteChat(chatId);
        }

        if (app.state.currentChatId && idsToDelete.includes(app.state.currentChatId)) {
            app.state.currentChatId = null;
            app.clearChatView();
        }

        app.refreshHistorySelectionState();
        await refreshChats();
    }

    async function renameChat(chatId, newName) {
        const app = getApp();
        const chat = app.state.chats.find((entry) => entry.id === chatId);
        if (!chat) return;

        chat.name = newName;
        await window.OllamaSession.saveChat(chat);
        await refreshChats();
    }

    function loadChat(chatId) {
        const app = getApp();
        app.openChat(chatId);
    }

    function renderChatList() {
        const app = getApp();
        app.elements.chatList.querySelectorAll('.history-entry').forEach((node) => node.remove());

        if (!app.state.chats.length) {
            app.elements.historyEmptyState.classList.remove('hidden');
            return;
        }

        app.elements.historyEmptyState.classList.add('hidden');

        app.state.chats.forEach((chat) => {
            const listItem = document.createElement('li');
            listItem.className = `history-entry ${chat.id === app.state.currentChatId ? 'has-background-link-light' : ''}`;

            const left = document.createElement('div');
            left.className = 'history-entry-main';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.chatId = chat.id;
            checkbox.className = 'history-entry-checkbox';
            checkbox.onclick = (event) => {
                event.stopPropagation();
            };
            checkbox.onchange = () => {
                updateDeleteSelectedState();
            };

            const chatLink = document.createElement('a');
            chatLink.className = 'history-entry-link';
            chatLink.href = '#';

            const text = document.createElement('span');
            text.className = 'history-entry-label';
            text.textContent = chat.name;
            chatLink.appendChild(text);

            chatLink.addEventListener('click', (event) => {
                event.preventDefault();
                loadChat(chat.id);
            });

            const renameBtn = document.createElement('button');
            renameBtn.className = 'button is-white is-small history-entry-rename';
            renameBtn.type = 'button';
            renameBtn.title = 'Rename chat';
            renameBtn.setAttribute('aria-label', 'Rename chat');
            renameBtn.textContent = '✎';
            renameBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const newName = prompt('New chat name:', chat.name);
                if (newName && newName.trim()) {
                    renameChat(chat.id, newName.trim());
                }
            });

            left.appendChild(checkbox);
            left.appendChild(chatLink);
            listItem.appendChild(left);
            listItem.appendChild(renameBtn);
            app.elements.chatList.appendChild(listItem);
        });

        updateDeleteSelectedState();
    }

    function init() {
        const app = getApp();

        app.elements.btnDeleteSelected.addEventListener('click', deleteSelectedChats);

        renderChatList();
        updateDeleteSelectedState();
    }

    const historyPane = {
        init,
        refreshChats,
        renderChatList,
        updateDeleteSelectedState,
        deleteSelectedChats,
        renameChat,
        loadChat
    };

    window.OllamaHistoryPane = historyPane;
})();
