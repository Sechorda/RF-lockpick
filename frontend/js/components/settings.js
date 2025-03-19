// Settings configuration
const interfaceTypes = [
    { label: 'Kismet:', tool: 'kismet' },
    { label: 'hostapd:', tool: 'hostapd' },
    { label: 'LAN:', tool: 'lan' },
    { label: 'Bluetooth:', tool: 'bluetooth' }
];

const settingsIconSvg = `
<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path d="M15.95 10.78c.03-.25.05-.51.05-.78s-.02-.53-.06-.78l1.69-1.32c.15-.12.19-.34.1-.51l-1.6-2.77c-.1-.18-.31-.24-.49-.18l-1.99.8c-.42-.32-.86-.58-1.35-.78L12 2.34c-.03-.2-.2-.34-.4-.34H8.4c-.2 0-.36.14-.39.34l-.3 2.12c-.49.2-.94.47-1.35.78l-1.99-.8c-.18-.07-.39 0-.49.18l-1.6 2.77c-.1.18-.06.39.1.51l1.69 1.32c-.04.25-.07.52-.07.78s.02.53.06.78L2.37 12.1c-.15.12-.19.34-.1.51l1.6 2.77c.1.18.31.24.49.18l1.99-.8c.42.32.86.58 1.35.78l.3 2.12c.04.2.2.34.4.34h3.2c.2 0 .37-.14.39-.34l.3-2.12c.49-.2.94-.47 1.35-.78l1.99.8c.18.07.39 0 .49-.18l1.6-2.77c.1-.18.06-.39-.1-.51l-1.67-1.32zM10 13c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/>
</svg>`;

export class Settings {
    constructor() {
        this.mount();
        this.setupEventListeners();
    }

    createSettingsContainer() {
        const container = document.createElement('div');
        container.className = 'settings-container';

        // Create toggle button with icon
        const toggleButton = document.createElement('button');
        toggleButton.id = 'settings-toggle';
        toggleButton.innerHTML = settingsIconSvg;

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.className = 'settings-dropdown';

        // Create interface selects
        interfaceTypes.forEach(({ label, tool }) => {
            const interfaceSelect = document.createElement('div');
            interfaceSelect.className = 'interface-select';

            const labelElement = document.createElement('label');
            labelElement.textContent = label;

            const select = document.createElement('select');
            select.className = 'interface-dropdown';
            select.dataset.tool = tool;

            interfaceSelect.appendChild(labelElement);
            interfaceSelect.appendChild(select);
            dropdown.appendChild(interfaceSelect);
        });

        container.appendChild(toggleButton);
        container.appendChild(dropdown);
        return container;
    }

    mount() {
        const mountPoint = document.getElementById('settings-mount');
        if (!mountPoint) {
            console.error('Settings mount point not found');
            return;
        }

        const settingsContainer = this.createSettingsContainer();
        mountPoint.appendChild(settingsContainer);

        this.settingsToggle = settingsContainer.querySelector('#settings-toggle');
        this.settingsDropdown = settingsContainer.querySelector('.settings-dropdown');
    }

    setupEventListeners() {
        if (!this.settingsToggle || !this.settingsDropdown) return;

        // Toggle dropdown
        this.settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.settingsDropdown.classList.toggle('visible');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.settingsDropdown.classList.contains('visible') &&
                !this.settingsDropdown.contains(e.target) &&
                !this.settingsToggle.contains(e.target)) {
                this.settingsDropdown.classList.remove('visible');
            }
        });

        // Prevent dropdown from closing when clicking inside
        this.settingsDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
}
