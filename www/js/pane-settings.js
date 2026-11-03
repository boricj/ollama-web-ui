/**
 * Ollama Web UI - Settings Pane
 */

(function settingsPaneModule() {
    function getApp() {
        if (!window.OllamaUI) {
            throw new Error('OllamaUI is not initialized');
        }

        return window.OllamaUI;
    }

    function saveSettings() {
        const app = getApp();
        const ctrlEnterToSend = !!app.elements.submitShortcutToggle.checked;

        app.state.settings.ctrlEnterToSend = ctrlEnterToSend;

        if (window.OllamaSession && typeof window.OllamaSession.saveCtrlEnterToSubmitSetting === 'function') {
            window.OllamaSession.saveCtrlEnterToSubmitSetting(ctrlEnterToSend);
        }

        if (window.OllamaChatPane && typeof window.OllamaChatPane.setSubmitShortcut === 'function') {
            window.OllamaChatPane.setSubmitShortcut(ctrlEnterToSend);
        }

        app.applySettings();
        app.switchView('chat');
    }

    function init() {
        const app = getApp();
        app.elements.submitShortcutToggle.checked = !!app.state.settings.ctrlEnterToSend;
        app.elements.btnSaveSettings.addEventListener('click', saveSettings);
    }

    const settingsPane = {
        init,
        saveSettings
    };

    window.OllamaSettingsPane = settingsPane;
})();
