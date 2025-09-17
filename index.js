import { extension_settings, renderExtensionTemplateAsync } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

(function () {
    'use strict';
    const MODULE_NAME = 'third-party/ST-Extension_WI_Groups';
    let observer = null;
    let groupingTimer = null;
    let isReady = false;

    const defaultSettings = {
        isEnabled: true,
        minGroupSize: 2,
        separator: ':',
        defaultCollapsed: true,
        consolidateGroups: true,
        groupStates: {}
    };

    let settings = { ...defaultSettings };

    function loadSettings() {
        settings = Object.assign({}, defaultSettings, extension_settings[MODULE_NAME] || {});
        if (!settings.groupStates) settings.groupStates = {};
        extension_settings[MODULE_NAME] = settings;
    }

    function saveSettings() {
        extension_settings[MODULE_NAME] = settings;
        saveSettingsDebounced();
    }

    function addPreventiveCSS() {
        if (document.getElementById('wi-groups-preventive-css')) return;

        const style = document.createElement('style');
        style.id = 'wi-groups-preventive-css';
        style.textContent = `
            #world_popup_entries_list:not(.wi-groups-ready) {
                max-height: 0px !important;
                overflow: hidden !important;
            }
            
            #world_popup_entries_list.wi-groups-ready {
                max-height: 9999px !important;
                overflow: visible !important;
                transition: all 0.4s ease-out;
            }
            
            .wi-groups-disabled #world_popup_entries_list {
                max-height: none !important;
                overflow: visible !important;
                transition: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function markAsReady() {
        const entriesList = document.getElementById('world_popup_entries_list');
        const popup = document.getElementById('world_popup');

        if (entriesList) {
            entriesList.classList.add('wi-groups-ready');
        }

        if (popup) {
            if (settings.isEnabled) {
                popup.classList.remove('wi-groups-disabled');
            } else {
                popup.classList.add('wi-groups-disabled');
            }
        }

        isReady = true;
    }

    function markAsNotReady() {
        const entriesList = document.getElementById('world_popup_entries_list');
        if (entriesList) {
            entriesList.classList.remove('wi-groups-ready');
        }
        isReady = false;
    }

    function getGroupName(text) {
        if (!text || !settings.separator) return null;
        const idx = text.indexOf(settings.separator);
        return idx === -1 ? null : text.substring(0, idx).trim();
    }

    function createGroupHeader(groupName, entryCount) {
        const header = document.createElement('div');
        header.className = 'group-header';

        const isCollapsed = settings.groupStates[groupName] ?? settings.defaultCollapsed;
        const icon = isCollapsed ? '▶' : '▼';

        header.innerHTML = `
            <div class="group-header-content">
                <span class="group-header-icon">${icon}</span>
                <span class="group-header-title"><strong>${groupName}</strong></span>
                <span class="group-header-count">${entryCount} Entries</span>
            </div>`;

        header.setAttribute('data-group-name', groupName);
        if (isCollapsed) header.classList.add('collapsed');

        header.addEventListener('click', () => {
            const wasCollapsed = header.classList.contains('collapsed');
            const nowCollapsed = !wasCollapsed;

            document.querySelectorAll(`.world_entry[data-group-name="${groupName}"]`)
                .forEach(entry => entry.style.display = nowCollapsed ? 'none' : '');

            header.querySelector('.group-header-icon').textContent = nowCollapsed ? '▶' : '▼';
            header.classList.toggle('collapsed', nowCollapsed);

            settings.groupStates[groupName] = nowCollapsed;
            saveSettings();
        });

        return header;
    }

    function groupEntries() {
        const entriesList = document.getElementById('world_popup_entries_list');
        if (!entriesList) {
            markAsReady();
            return;
        }

        if (!settings.isEnabled) {
            document.querySelectorAll('.group-header').forEach(header => header.remove());
            document.querySelectorAll('.world_entry').forEach(entry => {
                entry.style.display = '';
                entry.removeAttribute('data-group-name');
            });
            markAsReady();
            return;
        }

        const allEntries = Array.from(entriesList.querySelectorAll('.world_entry'));
        if (allEntries.length === 0) {
            markAsReady();
            return;
        }

        const groups = {};

        allEntries.forEach(entry => {
            const textarea = entry.querySelector('textarea[name="comment"]');
            if (textarea) {
                const groupName = getGroupName(textarea.value);
                if (groupName) {
                    if (!groups[groupName]) groups[groupName] = [];
                    groups[groupName].push(entry);
                }
            }
        });

        if (settings.consolidateGroups) {
            allEntries.forEach(entry => {
                const currentGroup = entry.getAttribute('data-group-name');
                const textarea = entry.querySelector('textarea[name="comment"]');
                if (textarea) {
                    const newGroup = getGroupName(textarea.value);
                    if (currentGroup && currentGroup !== newGroup) {
                        entry.removeAttribute('data-group-name');
                        entry.style.display = '';
                    }
                }
            });
        }

        Object.entries(groups).forEach(([groupName, groupEntries]) => {
            if (groupEntries.length < settings.minGroupSize) return;

            let header = document.querySelector(`.group-header[data-group-name="${groupName}"]`);

            if (header) {
                header.querySelector('.group-header-count').textContent = `${groupEntries.length} Entries`;
            } else {
                header = createGroupHeader(groupName, groupEntries.length);
                const firstEntry = groupEntries.find(entry => entry.parentNode);
                if (firstEntry) firstEntry.parentNode.insertBefore(header, firstEntry);
            }

            groupEntries.forEach((entry, i) => {
                if (!entry.hasAttribute('data-group-name')) {
                    entry.setAttribute('data-group-name', groupName);

                    if (settings.consolidateGroups) {
                        const target = i === 0 ? header : groupEntries[i - 1];
                        if (target.nextElementSibling !== entry) {
                            target.insertAdjacentElement('afterend', entry);
                        }
                    }
                }

                const isCollapsed = header.classList.contains('collapsed');
                entry.style.display = isCollapsed ? 'none' : '';
            });
        });

        document.querySelectorAll('.group-header').forEach(header => {
            const groupName = header.getAttribute('data-group-name');
            const entries = document.querySelectorAll(`.world_entry[data-group-name="${groupName}"]`);
            if (entries.length < settings.minGroupSize) {
                header.remove();
                entries.forEach(entry => {
                    entry.removeAttribute('data-group-name');
                    entry.style.display = '';
                });
            }
        });

        markAsReady();
    }

    function scheduleGrouping() {
        if (isReady) markAsNotReady();
        clearTimeout(groupingTimer);
        groupingTimer = setTimeout(groupEntries, 50);
    }

    function cleanup() {
        if (observer) observer.disconnect();
        clearTimeout(groupingTimer);
        document.querySelectorAll('.group-header').forEach(header => header.remove());
        document.querySelectorAll('.world_entry').forEach(entry => {
            entry.style.display = '';
            entry.removeAttribute('data-group-name');
        });
        markAsReady();
    }

    function setupBookChangeDetection() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('.select2-selection__choice__remove, .select2-results__option') ||
                e.target.closest('.select2-selection__choice__remove, .select2-results__option')) {
                scheduleGrouping();
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.matches('#world_info, #world_editor_select')) {
                scheduleGrouping();
            }
        });
    }

    function initializeObserver() {
        const entriesList = document.getElementById('world_popup_entries_list');
        if (!entriesList) return;

        if (observer) observer.disconnect();

        observer = new MutationObserver(mutations => {
            if (!settings.isEnabled) return;

            if (mutations.some(m => [...m.addedNodes, ...m.removedNodes].some(n =>
                n.nodeType === 1 && (n.classList?.contains('world_entry') || n.classList?.contains('group-header'))
            ))) {
                scheduleGrouping();
            }
        });

        observer.observe(entriesList, { childList: true });

        entriesList.addEventListener('blur', e => {
            if (e.target.matches?.('textarea[name="comment"]')) scheduleGrouping();
        }, true);

        entriesList.addEventListener('click', e => {
            if (e.target.matches?.('.duplicate_entry_button')) {
                const entry = e.target.closest('.world_entry');
                const groupName = entry?.getAttribute('data-group-name');
                if (groupName) {
                    setTimeout(() => {
                        const newEntry = document.querySelector('.world_entry:not([data-group-name]):last-of-type');
                        const textarea = newEntry?.querySelector('textarea[name="comment"]');
                        if (textarea && !getGroupName(textarea.value)) {
                            textarea.value = groupName + settings.separator + ' ' + textarea.value;
                        }
                        scheduleGrouping();
                    }, 100);
                }
            }
        }, true);
    }

    async function initializeSettings() {
        const settingsHtml = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
        $('#extensions_settings').append(settingsHtml);

        loadSettings();

        const onSettingsChange = () => {
            const newSettings = {
                isEnabled: $('#wi-accordion-enabled').is(':checked'),
                minGroupSize: parseInt($('#wi-accordion-min-size').val()) || 2,
                separator: $('#wi-accordion-separator').val() || ':',
                defaultCollapsed: $('#wi-accordion-collapsed').is(':checked'),
                consolidateGroups: $('#wi-accordion-consolidate').is(':checked')
            };

            const needsRefresh = Object.entries(newSettings).some(([key, value]) =>
                key !== 'defaultCollapsed' && settings[key] !== value
            );

            Object.assign(settings, newSettings);
            saveSettings();

            if (needsRefresh) {
                cleanup();
                scheduleGrouping();
            }
        };

        $('#wi-accordion-enabled').prop('checked', settings.isEnabled).on('change', onSettingsChange);
        $('#wi-accordion-collapsed').prop('checked', settings.defaultCollapsed).on('change', onSettingsChange);
        $('#wi-accordion-consolidate').prop('checked', settings.consolidateGroups).on('change', onSettingsChange);
        $('#wi-accordion-min-size').val(settings.minGroupSize).on('input', onSettingsChange);
        $('#wi-accordion-separator').val(settings.separator).on('input', onSettingsChange);
        $('#wi-accordion-refresh').on('click', () => { cleanup(); scheduleGrouping(); });
    }

    jQuery(async () => {
        addPreventiveCSS();

        const checkPopup = setInterval(async () => {
            if ($('#world_popup_entries_list').length) {
                clearInterval(checkPopup);
                await initializeSettings();
                initializeObserver();
                setupBookChangeDetection();
                scheduleGrouping();
            }
        }, 500);
    });

    window.WIGroups_cleanup = cleanup;
})();
