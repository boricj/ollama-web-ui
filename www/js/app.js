/**
 * Ollama Web UI - App Bootstrap
 * Shared state + cross-pane wiring.
 */

(function bootstrapApp() {
    const app = {
        modules: {},
        state: {
            chats: [],
            currentChatId: null,
            isSending: false,
            sidebarCollapsed: false,
            mobileMenuOpen: false,
            settings: {
                ctrlEnterToSend: false
            }
        },
        elements: {
            btnNewChat: document.getElementById('menu-btn-new-chat'),
            btnHistory: document.getElementById('menu-btn-history'),
            btnSettings: document.getElementById('menu-btn-settings'),
            btnDeleteSelected: document.getElementById('history-btn-delete-selected'),
            btnSaveSettings: document.getElementById('settings-btn-save'),
            btnMenuToggle: document.getElementById('menu-btn-toggle'),
            btnMenuHeader: document.getElementById('menu-btn-header'),
            sidebarPanel: document.getElementById('menu-panel'),
            sidebarOverlay: document.getElementById('menu-overlay'),
            chatList: document.getElementById('history-list'),
            historyEmptyState: document.getElementById('history-empty-state'),
            chatHistory: document.getElementById('chat-history'),
            userPrompt: document.getElementById('chat-prompt'),
            btnSend: document.getElementById('chat-btn-send'),
            modelSelect: document.getElementById('chat-model-select'),
            viewChat: document.getElementById('chat-view'),
            viewHistory: document.getElementById('history-view'),
            viewSettings: document.getElementById('settings-view'),
            submitShortcutToggle: document.getElementById('settings-submit-shortcut')
        },
        getCurrentChat() {
            if (!this.state.currentChatId) {
                return null;
            }

            return this.state.chats.find((chat) => chat.id === this.state.currentChatId) || null;
        },
        updateSidebarSelection(view) {
            this.elements.btnHistory.classList.toggle('is-active', view === 'history');
            this.elements.btnSettings.classList.toggle('is-active', view === 'settings');
        },
        setSidebarOpen(isOpen) {
            const mobile = window.innerWidth < 769;
            this.elements.sidebarPanel.classList.toggle('is-open', !!(mobile && isOpen));
            this.elements.sidebarOverlay.classList.toggle('is-visible', !!(mobile && isOpen));
        },
        setSidebarCollapsed(isCollapsed) {
            const desktop = !window.matchMedia('(max-width: 768px)').matches;
            this.elements.sidebarPanel.classList.toggle('is-collapsed', !!(desktop && isCollapsed));
        },
        syncSidebarState() {
            const mobile = window.innerWidth < 769;
            if (mobile) {
                this.elements.sidebarPanel.classList.remove('is-collapsed');
                this.elements.sidebarPanel.classList.toggle('is-open', this.state.mobileMenuOpen);
                this.elements.sidebarOverlay.classList.toggle('is-visible', this.state.mobileMenuOpen);
            } else {
                this.elements.sidebarPanel.classList.remove('is-open');
                this.elements.sidebarPanel.classList.toggle('is-collapsed', this.state.sidebarCollapsed);
                this.elements.sidebarOverlay.classList.remove('is-visible');
            }
        },
        switchView(view) {
            const views = {
                chat: this.elements.viewChat,
                history: this.elements.viewHistory,
                settings: this.elements.viewSettings
            };

            const selectedView = views[view] ? view : 'chat';

            Object.entries(views).forEach(([name, node]) => {
                node.classList.toggle('hidden', name !== selectedView);
            });

            this.updateSidebarSelection(selectedView);

            if (window.innerWidth < 769) {
                this.state.mobileMenuOpen = false;
                this.syncSidebarState();
            }
        },
        registerModule(name, module) {
            this.modules[name] = module;
            return module;
        },
        getModule(name) {
            return this.modules[name] || null;
        },
        refreshHistoryList() {
            const historyPane = this.getModule('history');
            if (historyPane && typeof historyPane.renderChatList === 'function') {
                historyPane.renderChatList();
            }
        },
        refreshHistorySelectionState() {
            const historyPane = this.getModule('history');
            if (historyPane && typeof historyPane.updateDeleteSelectedState === 'function') {
                historyPane.updateDeleteSelectedState();
            }
        },
        clearChatView() {
            const chatPane = this.getModule('chat');
            if (chatPane && typeof chatPane.clearChatMessages === 'function') {
                chatPane.clearChatMessages();
            }
        },
        renderChatMessages(chat) {
            if (!chat) return;

            this.clearChatView();
            const chatPane = this.getModule('chat');
            chat.messages.forEach((message) => {
                if (chatPane && typeof chatPane.appendMessage === 'function') {
                    chatPane.appendMessage(message.role, message.content, false);
                }
            });

            if (chat.isStreaming && chat.currentResponse && chatPane && typeof chatPane.updateStreamingUI === 'function') {
                chatPane.appendMessage('assistant', chat.currentResponse, false);
                chatPane.updateStreamingUI(chat);
            }
        },
        openChat(chatId) {
            const chat = this.state.chats.find((entry) => entry.id === chatId);
            if (!chat) return;

            this.state.currentChatId = chatId;
            this.renderChatMessages(chat);
            this.refreshHistoryList();
            this.switchView('chat');
        },
        updateSendButtonState() {
            const hasText = this.elements.userPrompt.value.trim().length > 0;
            const hasModel = this.elements.modelSelect.value !== '';
            this.elements.btnSend.disabled = !(hasText && hasModel);
        },
        applySettings() {
            const ctrlEnterToSend = !!this.state.settings.ctrlEnterToSend;
            if (this.elements.submitShortcutToggle) {
                this.elements.submitShortcutToggle.checked = ctrlEnterToSend;
            }

            const chatPane = this.getModule('chat');
            if (chatPane && typeof chatPane.setSubmitShortcut === 'function') {
                chatPane.setSubmitShortcut(ctrlEnterToSend);
            }
        }
    };

    window.OllamaUI = app;

    function hydrateModuleRegistry() {
        if (window.OllamaChatPane) {
            app.registerModule('chat', window.OllamaChatPane);
        }
        if (window.OllamaHistoryPane) {
            app.registerModule('history', window.OllamaHistoryPane);
        }
        if (window.OllamaSettingsPane) {
            app.registerModule('settings', window.OllamaSettingsPane);
        }
    }

    function toggleSidebar() {
        if (window.innerWidth < 769) {
            app.state.mobileMenuOpen = !app.state.mobileMenuOpen;
            app.syncSidebarState();
            return;
        }

        app.state.sidebarCollapsed = !app.state.sidebarCollapsed;
        app.syncSidebarState();
    }

    async function init() {
        await window.OllamaSession.openDB();
        app.state.chats = await window.OllamaSession.getAllChats();
        hydrateModuleRegistry();

        if (window.OllamaSession && typeof window.OllamaSession.loadCtrlEnterToSubmitSetting === 'function') {
            app.state.settings.ctrlEnterToSend = window.OllamaSession.loadCtrlEnterToSubmitSetting();
        }

        app.applySettings();

        app.elements.btnMenuToggle.addEventListener('click', toggleSidebar);
        app.elements.btnMenuHeader.addEventListener('click', toggleSidebar);
        app.elements.sidebarOverlay.addEventListener('click', () => {
            app.state.mobileMenuOpen = false;
            app.syncSidebarState();
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 769) {
                app.state.mobileMenuOpen = false;
                app.syncSidebarState();
                return;
            }

            app.state.sidebarCollapsed = false;
            app.syncSidebarState();
        });

        app.elements.btnHistory.addEventListener('click', () => app.switchView('history'));
        app.elements.btnSettings.addEventListener('click', () => app.switchView('settings'));

        app.syncSidebarState();
        const chatPane = app.getModule('chat');
        const historyPane = app.getModule('history');
        const settingsPane = app.getModule('settings');

        if (chatPane && typeof chatPane.init === 'function') {
            chatPane.init();
        }
        if (historyPane && typeof historyPane.init === 'function') {
            historyPane.init();
        }
        if (settingsPane && typeof settingsPane.init === 'function') {
            settingsPane.init();
        }
    }

    init();
})();

function collectAppAssets() {
    const assets = new Set();

    document.querySelectorAll('link[href], script[src]').forEach((element) => {
        const src = element.getAttribute('href') || element.getAttribute('src');
        if (!src) return;

        const url = new URL(src, window.location.href);
        assets.add(url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.href);
    });

    assets.add('/');
    assets.add('/index.html');
    return [...assets];
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const assets = collectAppAssets();

        const sendAssets = () => {
            const controller = navigator.serviceWorker.controller || registration.active;
            if (controller) {
                controller.postMessage({ type: 'SET_ASSETS', assets });
            }
        };

        if (navigator.serviceWorker.controller) {
            sendAssets();
        } else {
            navigator.serviceWorker.addEventListener('controllerchange', sendAssets, { once: true });
        }

        console.log('SW registered: ', registration);
    } catch (error) {
        console.log('SW registration failed: ', error);
    }
}

window.addEventListener('load', () => {
    registerServiceWorker();
});
