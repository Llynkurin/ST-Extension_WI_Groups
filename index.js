import { extension_settings, renderExtensionTemplateAsync } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

(function () {
    'use strict';
    const MODULE_NAME = 'third-party/ST-Extension_WI_Groups';
    let groupingTimer = null;
    let textareaValues = new Map();

    const defaultSettings = {
        isEnabled: true,
        minGroupSize: 2,
        separator: ':',
        defaultCollapsed: true,
        consolidateGroups: false,
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

    function getGroupName(text) {
        if (!text || !settings.separator) return null;
        const idx = text.indexOf(settings.separator);
        return idx === -1 ? null : text.substring(0, idx).trim();
    }

    function setupGroupKillSwitch(header, groupName) {
        const killSwitch = header.querySelector('.group-kill-switch');
        if (!killSwitch || killSwitch.dataset.listenerAttached) return;

        killSwitch.addEventListener('click', (e) => {
            e.stopPropagation();
            const isTurningOn = killSwitch.classList.contains('fa-toggle-off');
            killSwitch.classList.toggle('fa-toggle-on', isTurningOn);
            killSwitch.classList.toggle('fa-toggle-off', !isTurningOn);

            const entries = document.querySelectorAll(`.world_entry[data-group-name="${groupName}"]`);
            entries.forEach(entry => {
                const entrySwitch = entry.querySelector('.killSwitch');
                if (entrySwitch) {
                    const isEntryOn = entrySwitch.classList.contains('fa-toggle-on');
                    if ((isTurningOn && !isEntryOn) || (!isTurningOn && isEntryOn)) {
                        entrySwitch.click();
                    }
                }
            });
        });
        killSwitch.dataset.listenerAttached = 'true';
    }

    function createGroupHeader(groupName, groupEntries) {
        const header = document.createElement('div');
        header.className = 'group-header';

        const isCollapsed = settings.groupStates[groupName] ?? settings.defaultCollapsed;
        const icon = isCollapsed ? '▶' : '▼';
        const allActive = groupEntries.every(entry => entry.querySelector('.killSwitch')?.classList.contains('fa-toggle-on'));
        const killSwitchState = allActive ? 'fa-toggle-on' : 'fa-toggle-off';

        header.innerHTML = `
            <div class="group-header-content">
                ${settings.consolidateGroups ? '<div class="group-drag-handle">⋮⋮</div>' : ''}
                <span class="group-header-icon">${icon}</span>
                <span class="group-kill-switch fa-solid ${killSwitchState}" title="Toggle all entries in group"></span>
                <span class="group-header-title"><strong>${groupName}</strong></span>
                <span class="group-header-count">${groupEntries.length} Entries</span>
            </div>`;

        header.setAttribute('data-group-name', groupName);
        if (isCollapsed) header.classList.add('collapsed');

        setupGroupKillSwitch(header, groupName);

        if (settings.consolidateGroups) {
            setupGroupDragAndDrop(header);
        }

        header.addEventListener('click', (e) => {
            if (e.target.closest('.group-drag-handle, .group-kill-switch')) return;

            const nowCollapsed = !header.classList.contains('collapsed');
            document.querySelectorAll(`.world_entry[data-group-name="${groupName}"]`)
                .forEach(entry => entry.style.display = nowCollapsed ? 'none' : '');

            header.querySelector('.group-header-icon').textContent = nowCollapsed ? '▶' : '▼';
            header.classList.toggle('collapsed', nowCollapsed);

            settings.groupStates[groupName] = nowCollapsed;
            saveSettings();
        });

        return header;
    }

    function setupGroupDragAndDrop(header) {
        const dragHandle = header.querySelector('.group-drag-handle');
        if (!dragHandle) return;

        dragHandle.draggable = true;
        let draggedHeader = null;

        dragHandle.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            draggedHeader = header;
            e.dataTransfer.setData('text/plain', header.getAttribute('data-group-name'));
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => header.classList.add('dragging'), 0);
        });

        dragHandle.addEventListener('dragend', (e) => {
            e.stopPropagation();
            if (draggedHeader) {
                draggedHeader.classList.remove('dragging');
                draggedHeader = null;
            }
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            scheduleGrouping({ immediatelyHide: false });
        });

        header.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (draggedHeader && draggedHeader !== header) {
                header.classList.add('drag-over');
            }
        });

        header.addEventListener('dragleave', () => {
            header.classList.remove('drag-over');
        });

        header.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            header.classList.remove('drag-over');
            const draggedGroupName = e.dataTransfer.getData('text/plain');
            const targetGroupName = header.getAttribute('data-group-name');
            if (draggedGroupName && draggedGroupName !== targetGroupName) {
                moveGroupBefore(draggedGroupName, targetGroupName);
            }
        });
    }

    function moveGroupBefore(draggedGroupName, targetGroupName) {
        const parent = document.getElementById('world_popup_entries_list');
        if (!parent) return;

        const targetHeader = parent.querySelector(`.group-header[data-group-name="${targetGroupName}"]`);
        const draggedHeader = parent.querySelector(`.group-header[data-group-name="${draggedGroupName}"]`);
        const draggedEntries = parent.querySelectorAll(`.world_entry[data-group-name="${draggedGroupName}"]`);

        if (!targetHeader || !draggedHeader) return;

        const fragment = document.createDocumentFragment();
        fragment.appendChild(draggedHeader);
        draggedEntries.forEach(entry => fragment.appendChild(entry));

        parent.insertBefore(fragment, targetHeader);
    }

    function captureTextareaValues() {
        textareaValues.clear();
        document.querySelectorAll('.world_entry textarea[name="comment"]').forEach(textarea => {
            const entry = textarea.closest('.world_entry');
            if (entry) {
                const entryId = entry.getAttribute('uid');
                textareaValues.set(entryId, textarea.value);
            }
        });
    }

    function hasTextareaChanged() {
        const currentValues = new Map();
        document.querySelectorAll('.world_entry textarea[name="comment"]').forEach(textarea => {
            const entry = textarea.closest('.world_entry');
            if (entry) {
                const entryId = entry.getAttribute('uid');
                currentValues.set(entryId, textarea.value);
            }
        });

        if (currentValues.size !== textareaValues.size) return true;
        for (const [id, value] of currentValues) {
            if (textareaValues.get(id) !== value) return true;
        }
        return false;
    }

    function groupEntries() {
        const entriesList = document.getElementById('world_popup_entries_list');
        if (!entriesList) return;

        if (!settings.isEnabled) {
            cleanup();
            entriesList.classList.add('wi-groups-ready');
            return;
        }

        const allEntries = Array.from(entriesList.querySelectorAll('.world_entry'));
        const groups = new Map();

        allEntries.forEach(entry => {
            const textarea = entry.querySelector('textarea[name="comment"]');
            const groupName = textarea ? getGroupName(textarea.value) : null;
            if (groupName) {
                if (!groups.has(groupName)) groups.set(groupName, []);
                groups.get(groupName).push(entry);
            }
        });

        document.querySelectorAll('.group-header').forEach(header => {
            const groupName = header.getAttribute('data-group-name');
            if (!groups.has(groupName) || groups.get(groupName).length < settings.minGroupSize) {
                header.remove();
            }
        });

        groups.forEach((groupEntries, groupName) => {
            if (groupEntries.length < settings.minGroupSize) return;

            let header = entriesList.querySelector(`.group-header[data-group-name="${groupName}"]`);
            if (!header) {
                header = createGroupHeader(groupName, groupEntries);
                const firstEntry = groupEntries[0];
                if (firstEntry) firstEntry.parentNode.insertBefore(header, firstEntry);
            } else {
                header.querySelector('.group-header-count').textContent = `${groupEntries.length} Entries`;
                const allActive = groupEntries.every(e => e.querySelector('.killSwitch')?.classList.contains('fa-toggle-on'));
                const killSwitch = header.querySelector('.group-kill-switch');
                if (killSwitch) {
                    killSwitch.classList.toggle('fa-toggle-on', allActive);
                    killSwitch.classList.toggle('fa-toggle-off', !allActive);
                }
            }

            const isCollapsed = header.classList.contains('collapsed');
            groupEntries.forEach((entry, i) => {
                entry.setAttribute('data-group-name', groupName);
                entry.style.display = isCollapsed ? 'none' : '';
                if (settings.consolidateGroups) {
                    const expectedPrev = i === 0 ? header : groupEntries[i - 1];
                    if (entry.previousElementSibling !== expectedPrev) {
                        expectedPrev.insertAdjacentElement('afterend', entry);
                    }
                }
            });
        });

        allEntries.forEach(entry => {
            const textarea = entry.querySelector('textarea[name="comment"]');
            const groupName = textarea ? getGroupName(textarea.value) : null;
            if (!groupName || !groups.has(groupName) || groups.get(groupName).length < settings.minGroupSize) {
                entry.removeAttribute('data-group-name');
                entry.style.display = '';
            }
        });

        captureTextareaValues();
        entriesList.classList.add('wi-groups-ready');
    }

    function scheduleGrouping({ immediatelyHide = true } = {}) {
        const entriesList = document.getElementById('world_popup_entries_list');
        if (immediatelyHide && entriesList) {
            entriesList.classList.remove('wi-groups-ready');
        }
        clearTimeout(groupingTimer);
        groupingTimer = setTimeout(groupEntries, 150);
    }

    function cleanup() {
        clearTimeout(groupingTimer);
        const entriesList = document.getElementById('world_popup_entries_list');
        if (entriesList) {
            entriesList.classList.remove('wi-groups-ready');
            document.querySelectorAll('.group-header').forEach(h => h.remove());
            document.querySelectorAll('.world_entry[data-group-name]').forEach(e => {
                e.removeAttribute('data-group-name');
                e.style.display = '';
            });
        }
        document.getElementById('world_popup')?.classList.add('wi-groups-disabled');
    }

    function setupEventListeners() {
        $('#world_info, #world_editor_select').on('change', () => scheduleGrouping());
        $('#world_button').on('click', () => scheduleGrouping());

        const entriesList = document.getElementById('world_popup_entries_list');
        if (!entriesList) return;

        entriesList.addEventListener('focusin', (e) => {
            if (e.target.matches('textarea[name="comment"]')) {
                captureTextareaValues();
            }
        });
        entriesList.addEventListener('focusout', (e) => {
            if (e.target.matches('textarea[name="comment"]') && hasTextareaChanged()) {
                scheduleGrouping();
            }
        });

        entriesList.addEventListener('click', (e) => {
            if (e.target.closest('.delete_entry_button, .duplicate_entry_button')) {
                setTimeout(() => scheduleGrouping(), 200);
            }
        });
        entriesList.addEventListener('dragend', (e) => {
            if (e.target.closest('.world_entry')) {
                scheduleGrouping({ immediatelyHide: false });
            }
        });
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
            Object.assign(settings, newSettings);
            saveSettings();
            $('#consolidate-help-text').text(settings.consolidateGroups ? 'Group entries together.' : 'Entries stay in their original positions.');
            scheduleGrouping();
        };

        $('#wi-accordion-enabled').prop('checked', settings.isEnabled).on('change', onSettingsChange);
        $('#wi-accordion-collapsed').prop('checked', settings.defaultCollapsed).on('change', onSettingsChange);
        $('#wi-accordion-consolidate').prop('checked', settings.consolidateGroups).on('change', onSettingsChange);
        $('#wi-accordion-min-size').val(settings.minGroupSize).on('input', onSettingsChange);
        $('#wi-accordion-separator').val(settings.separator).on('input', onSettingsChange);
        $('#consolidate-help-text').text(settings.consolidateGroups ? 'Group entries together.' : 'Entries stay in their original positions.');
    }

    jQuery(async () => {
        const checkPopup = setInterval(async () => {
            if ($('#world_popup_entries_list').length) {
                clearInterval(checkPopup);
                await initializeSettings();
                setupEventListeners();
                scheduleGrouping();
            }
        }, 500);
    });

    window.WIGroups_cleanup = cleanup;
})();
