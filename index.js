import { extension_settings, renderExtensionTemplateAsync } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

(function () {
    'use strict';
    const MODULE_NAME = 'third-party/__WI_parentFolders';
    let retryCount = 0;
    let refreshDebounceTimer;

    const defaultSettings = {
        isEnabled: true,
        minGroupSize: 2,
        separator: ':',
        defaultCollapsed: true
    };

    let settings = {};

    function loadSettings() {
        if (extension_settings[MODULE_NAME]) {
            settings = Object.assign({}, defaultSettings, extension_settings[MODULE_NAME]);
        } else {
            settings = { ...defaultSettings };
        }
        extension_settings[MODULE_NAME] = settings;
    }

    function saveSettings() {
        extension_settings[MODULE_NAME] = settings;
        saveSettingsDebounced();
    }

    function onSettingsChange() {
        settings.isEnabled = $('#wi-accordion-enabled').is(':checked');
        settings.minGroupSize = parseInt($('#wi-accordion-min-size').val()) || 2;
        settings.separator = $('#wi-accordion-separator').val() || ':';
        settings.defaultCollapsed = $('#wi-accordion-collapsed').is(':checked');
        saveSettings();
        refreshWIView();
    }

    function getGroupName(text) {
        if (!text || !settings.separator) return null;
        const separatorIndex = text.indexOf(settings.separator);
        if (separatorIndex === -1) return null;
        return text.substring(0, separatorIndex).trim();
    }

    function createGroupHeader(groupName, entryCount) {
        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = `
            <div class="group-header-content">
                <span class="group-header-icon">▼</span>
                <span class="group-header-title"><strong>${groupName}</strong></span>
                <span class="group-header-count">(${entryCount})</span>
            </div>
        `;
        header.setAttribute('data-group-name', groupName);
        header.addEventListener('click', () => toggleGroup(header));
        return header;
    }

    function toggleGroup(header) {
        const groupName = header.getAttribute('data-group-name');
        const isCollapsed = !header.classList.contains('collapsed');
        const entries = document.querySelectorAll(`.world_entry[data-group-name="${groupName}"]`);

        entries.forEach(entry => {
            entry.style.display = isCollapsed ? 'none' : '';
        });

        header.querySelector('.group-header-icon').textContent = isCollapsed ? '▶' : '▼';
        header.classList.toggle('collapsed', isCollapsed);
    }

    function groupEntries() {
        if (!settings.isEnabled) return;
        const entriesList = document.getElementById('world_popup_entries_list');
        if (!entriesList) {
            console.error('[WI Accordion] Entries list (#world_popup_entries_list) not found!');
            return;
        }

        const entries = Array.from(entriesList.querySelectorAll('.world_entry:not([data-group-name])'));
        if (entries.length === 0 && document.querySelectorAll('.group-header').length === 0 && retryCount < 3) {
            retryCount++;
            setTimeout(groupEntries, 500);
            return;
        }
        retryCount = 0;

        const groups = {};
        entries.forEach(entry => {
            const textarea = entry.querySelector('textarea[name="comment"]');
            if (textarea) {
                const groupName = getGroupName(textarea.value);
                if (groupName) {
                    if (!groups[groupName]) groups[groupName] = [];
                    groups[groupName].push(entry);
                }
            }
        });

        Object.keys(groups).forEach(groupName => {
            const groupEntries = groups[groupName];
            const existingGroup = document.querySelector(`.world_entry[data-group-name="${groupName}"]`);

            if (existingGroup) {
                groupEntries.forEach(entry => entry.setAttribute('data-group-name', groupName));
            } else if (groupEntries.length >= settings.minGroupSize) {
                const firstEntry = groupEntries[0];
                const header = createGroupHeader(groupName, groupEntries.length);
                firstEntry.parentNode.insertBefore(header, firstEntry);
                groupEntries.forEach(entry => entry.setAttribute('data-group-name', groupName));

                if (settings.defaultCollapsed) {
                    toggleGroup(header);
                }
            }
        });
    }

    function refreshWIView() {
        document.querySelectorAll('.group-header').forEach(header => header.remove());
        document.querySelectorAll('.world_entry').forEach(entry => {
            entry.style.display = '';
            entry.removeAttribute('data-group-name');
        });
        groupEntries();
    }

    function initializeObserver() {
        const entriesList = document.getElementById('world_popup_entries_list');
        if (entriesList) {
            const observer = new MutationObserver((mutations) => {
                if (settings.isEnabled) {
                    const hasRelevantChanges = mutations.some(mutation =>
                        Array.from(mutation.addedNodes).some(node => node.nodeType === 1 && node.classList.contains('world_entry')) ||
                        Array.from(mutation.removedNodes).some(node => node.nodeType === 1 && (node.classList.contains('world_entry') || node.classList.contains('group-header')))
                    );
                    if (hasRelevantChanges) {
                        clearTimeout(refreshDebounceTimer);
                        refreshDebounceTimer = setTimeout(refreshWIView, 150);
                    }
                }
            });
            observer.observe(entriesList, { childList: true });
        }
    }

    async function initializeSettings() {
        const settingsHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
        $('#extensions_settings').append(settingsHtml);

        loadSettings();

        $('#wi-accordion-enabled').prop('checked', settings.isEnabled).on('change', onSettingsChange);
        $('#wi-accordion-collapsed').prop('checked', settings.defaultCollapsed).on('change', onSettingsChange);
        $('#wi-accordion-min-size').val(settings.minGroupSize).on('input', onSettingsChange);
        $('#wi-accordion-separator').val(settings.separator).on('input', onSettingsChange);
        $('#wi-accordion-refresh').on('click', refreshWIView);
    }

    jQuery(async () => {
        const checkPopup = setInterval(async function () {
            if ($('#world_popup_entries_list').length) {
                clearInterval(checkPopup);
                await initializeSettings();
                initializeObserver();
                refreshWIView();
            }
        }, 500);
    });
})();