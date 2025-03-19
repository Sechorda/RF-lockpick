import { BaseDeviceLabel } from './base/base-device-label.js';
import { APTemplates } from './templates/ap-templates.js';

/**
 * AP Device Label component
 * Handles display and interaction for Wi-Fi Access Point devices
 */
export class APDeviceLabel extends BaseDeviceLabel {
    constructor(data, parentElement) {
        super(data, parentElement);
        
        // Set initial label text based on mode
        let displayText = `${this.getManufacturer()}${data.freq ? ` (${data.freq})` : ''} ${data.kismet_device_base_signal?.last_signal ? `(${data.kismet_device_base_signal.last_signal} dBm)` : ''}`;
        
        // Add offline indicator if needed
        const isEvilTwin = data.kismet_device_base_macaddr === "00:11:22:33:44:55";
        const isKarma = data.isKarmaMode === true;
        // Consider both KARMA and evil twin cases
        const isOffline = (isEvilTwin || isKarma) && 
                         (data.isOffline === true || this.element.getAttribute('data-evil-twin-offline') === 'true');
        
        if (isOffline) {
            displayText += ' (Offline)';
        }
        this.initialLabel = displayText;

        // Set evil-twin attribute for both KARMA and regular evil twins
        if (isEvilTwin || isKarma) {
            this.element.setAttribute('data-evil-twin', 'true');
        }

        // Check for existing evil twin state and restore if present
        const existingState = JSON.parse(localStorage.getItem(`evilTwinState_${data.name}`));
        if (existingState && existingState.isRunning) {
            this.element.setAttribute('data-evil-twin-running', 'true');
        }

        // Setup the label and event handlers
        this.setupLabel();
        this.setupDeauthHandler();
        this.setupEvilTwinHandler();
        this.setupKarmaAPHandler();

        // Listen for network updates
        document.addEventListener('networksUpdated', () => {
            if (this.data.kismet_device_base_type === "Wi-Fi AP") {
                this.updateContent();
            }
        });
    }

    setupLabel() {
        const basicLabel = document.createElement('div');
        basicLabel.className = 'basic-label';

        const manufacturerSpan = document.createElement('span');
        manufacturerSpan.className = 'manufacturer';
        manufacturerSpan.textContent = this.initialLabel;

        const expandIndicator = document.createElement('span');
        expandIndicator.className = 'expand-indicator';
        expandIndicator.textContent = '›';

        basicLabel.appendChild(manufacturerSpan);
        basicLabel.appendChild(expandIndicator);

        const detailsPanel = document.createElement('div');
        detailsPanel.className = 'details-panel';
        detailsPanel.innerHTML = APTemplates.generateAPTemplate(this.data);

        // Cache elements for updates
        this.cachedElements = {
            basicLabel,
            manufacturerSpan,
            detailsPanel
        };

        // Setup hover behavior
        basicLabel.addEventListener('mouseenter', () => {
            clearTimeout(this._hoverTimeout);
            this.expand();
        });
        this.element.addEventListener('mouseleave', () => {
            this._hoverTimeout = setTimeout(() => this.collapse(), 100);
        });

        this.element.appendChild(basicLabel);
        this.element.appendChild(detailsPanel);
    }

    setupDeauthHandler() {
        const deauthButton = this.element.querySelector('.deauth-button');
        if (!deauthButton) return;

        const bandSelectionContainer = this.element.querySelector('.band-selection-buttons');
        if (!bandSelectionContainer) return;

        deauthButton.addEventListener('click', () => {
            if (deauthButton.classList.contains('deauthing')) return;
            bandSelectionContainer.style.display = bandSelectionContainer.style.display === 'none' ? 'flex' : 'none';
        });

        const handleBandSelection = async (band) => {
            if (deauthButton.classList.contains('deauthing')) return;

            deauthButton.classList.add('deauthing');
            deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Deauthing...';
            deauthButton.style.backgroundColor = '#ff8787';
            bandSelectionContainer.style.display = 'none';

            const wifiInterfaceSelect = document.querySelector('.interface-dropdown[data-tool="hostapd"]');
            if (!wifiInterfaceSelect) {
                console.error('Could not find wifi interface dropdown');
                return;
            }

            const wifiInterface = wifiInterfaceSelect.value;
            if (!wifiInterface) {
                console.error('No wifi interface selected');
                return;
            }

            try {
                const response = await fetch('/api/deauth', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        wifi_interface: wifiInterface,
                        band: band,
                        mac_24ghz: this.data.mac_24ghz,
                        mac_5ghz: this.data.mac_5ghz,
                        is_broadcast: true
                    })
                });

                if (!response.ok) {
                    throw new Error('Deauth request failed');
                }

                setTimeout(() => {
                    deauthButton.classList.remove('deauthing');
                    deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Deauth All';
                    deauthButton.style.backgroundColor = '#ff6b6b';
                }, 2000);
            } catch (error) {
                console.error('Error sending deauth packet:', error);
                deauthButton.classList.remove('deauthing');
                deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Deauth All';
                deauthButton.style.backgroundColor = '#ff6b6b';
            }
        };

        const band24Button = bandSelectionContainer.querySelector('[data-band="2.4GHz"]');
        const band5Button = bandSelectionContainer.querySelector('[data-band="5GHz"]');

        if (band24Button) band24Button.addEventListener('click', () => handleBandSelection('2.4GHz'));
        if (band5Button) band5Button.addEventListener('click', () => handleBandSelection('5GHz'));
    }

    setupKarmaAPHandler() {
        console.log('Setting up Karma AP handler');
        
        // Store expanded state before any modifications
        const wasExpanded = this.element.classList.contains('expanded');
        
        // First remove any existing handler to prevent duplicates
        const existingButton = this.element.querySelector('.karma-ap-button');
        if (existingButton) {
            const clone = existingButton.cloneNode(true);
            existingButton.parentNode.replaceChild(clone, existingButton);
        }

        // Restore expanded state if it was previously expanded
        if (wasExpanded) {
            this.element.classList.add('expanded');
            this.expanded = true;
        }
        
        const karmaButton = this.element.querySelector('.karma-ap-button');
        if (!karmaButton) {
            console.error('Karma AP button not found in element');
            return;
        }

        // Get the container that's already in the template
        const karmaContainer = this.element.querySelector('.karma-ap-container');
        if (!karmaContainer) {
            console.error('Karma AP container not found in template');
            return;
        }

        // Check for existing state and restore
        const existingState = JSON.parse(localStorage.getItem(`karmaAPState_${this.data.name}`));
        console.log('Existing karma AP state:', existingState);
        if (existingState && existingState.isRunning) {
            karmaButton.innerHTML = '<i class="fa-solid fa-wifi"></i> KARMA-AP running';
            karmaButton.style.backgroundColor = '#388E3C'; // Match evil-twin green color
            karmaButton.classList.add('running');
            karmaButton.setAttribute('data-wifi-interface', existingState.wifiInterface);
            karmaButton.setAttribute('data-target-mac', existingState.targetMac);
            karmaButton.setAttribute('data-band', existingState.band);
            karmaButton.setAttribute('data-wan-interface', existingState.wanInterface);
            
            // Ensure label stays expanded if it was expanded
            if (this.expanded) {
                this.element.classList.add('expanded');
            }

            const stopButton = document.createElement('button');
            stopButton.className = 'stop-button';
            stopButton.style.cssText = `
                width: 100%;
                padding: 5px 10px;
                margin-top: 10px;
                background-color: #ff6b6b;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            `;
            stopButton.innerHTML = '<i class="fa-solid fa-stop"></i> Stop KARMA-AP';
            stopButton.onclick = () => {
                const evilTwinManager = window.evilTwinManager || new window.EvilTwinManager();
                evilTwinManager.handleStop(this.data.name, existingState.wifiInterface);
                localStorage.removeItem(`karmaAPState_${this.data.name}`);
                stopButton.remove();
                karmaButton.innerHTML = '<i class="fa-solid fa-wifi"></i> Create KARMA-AP';
                karmaButton.style.backgroundColor = '';
            };

            karmaContainer.appendChild(stopButton);
        }

        karmaButton.addEventListener('click', () => {
            const wifiInterfaceSelect = document.querySelector('.interface-dropdown[data-tool="hostapd"]');
            const wanInterfaceSelect = document.querySelector('.interface-dropdown[data-tool="lan"]');

            if (!wifiInterfaceSelect || !wanInterfaceSelect) {
                console.error('Could not find interface dropdowns');
                return;
            }

            const wifiInterface = wifiInterfaceSelect.value;
            const wanInterface = wanInterfaceSelect.value;

            if (!wifiInterface || !wanInterface) {
                console.error('No interfaces selected');
                return;
            }

            const bandButtons = karmaContainer.querySelector('.band-selection-buttons');
            if (bandButtons) {
                const wasExpanded = this.element.classList.contains('expanded');
                const defaultDisplay = bandButtons.getAttribute('data-default-display') || 'flex';
                bandButtons.style.display = bandButtons.style.display === 'none' ? defaultDisplay : 'none';
                
                // Maintain expanded state
                if (wasExpanded) {
                    this.element.classList.add('expanded');
                    this.expanded = true;
                }

                // Set up click handlers for band buttons if not already set
                const bandSelectionButtons = bandButtons.querySelectorAll('[data-band]');
                bandSelectionButtons.forEach(btn => {
                    if (!btn.hasAttribute('data-handler-attached')) {
                        btn.setAttribute('data-handler-attached', 'true');
                        btn.addEventListener('click', () => {
                            const selectedBand = btn.dataset.band;
                            bandButtons.style.display = 'none';

                            karmaButton.setAttribute('data-wifi-interface', wifiInterface);
                            karmaButton.setAttribute('data-wan-interface', wanInterface);
                            karmaButton.setAttribute('data-band', selectedBand);

                            const evilTwinManager = window.evilTwinManager || new window.EvilTwinManager();
                            evilTwinManager.setupButton(
                                karmaButton,
                                this.data.name,
                                '', // No PSK for karma APs
                                wifiInterface,
                                wanInterface,
                                "00:11:22:33:44:55", // Fixed MAC for karma APs
                                selectedBand
                            );
                        });
                    }
                });
            }
        });
    }

    setupEvilTwinHandler() {
        const evilTwinButton = this.element.querySelector('.evil-twin-button');
        if (!evilTwinButton) return;

        const evilTwinContainer = this.element.querySelector('.evil-twin-container');
        if (!evilTwinContainer) return;

        // Check for existing state and restore
        const existingState = JSON.parse(localStorage.getItem(`evilTwinState_${this.data.name}`));
        if (existingState && existingState.isRunning) {
            evilTwinButton.innerHTML = '<i class="fa-solid fa-users"></i> Evil-Twin running';
            evilTwinButton.style.backgroundColor = 'green';
            evilTwinButton.setAttribute('data-wifi-interface', existingState.wifiInterface);
            evilTwinButton.setAttribute('data-target-mac', existingState.targetMac);

            const stopButton = document.createElement('button');
            stopButton.className = 'stop-evil-twin-button';
            stopButton.style.cssText = `
                width: 100%;
                padding: 5px 10px;
                margin-top: 10px;
                background-color: #ff6b6b;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            `;
            stopButton.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Evil-Twin';
            stopButton.onclick = () => {
                const evilTwinManager = window.evilTwinManager || new window.EvilTwinManager();
                evilTwinManager.handleStop(this.data.name, existingState.wifiInterface);
                localStorage.removeItem(`evilTwinState_${this.data.name}`);
                stopButton.remove();
                evilTwinButton.innerHTML = '<i class="fa-solid fa-users"></i> Create Evil-Twin';
                evilTwinButton.style.backgroundColor = '';
            };

            evilTwinContainer.appendChild(stopButton);
        }

        evilTwinButton.addEventListener('click', () => {
            const wifiInterfaceSelect = document.querySelector('.interface-dropdown[data-tool="hostapd"]');
            const wanInterfaceSelect = document.querySelector('.interface-dropdown[data-tool="lan"]');

            if (!wifiInterfaceSelect || !wanInterfaceSelect) {
                console.error('Could not find interface dropdowns');
                return;
            }

            const wifiInterface = wifiInterfaceSelect.value;
            const wanInterface = wanInterfaceSelect.value;

            if (!wifiInterface || !wanInterface) {
                console.error('No interfaces selected');
                return;
            }

            let bandButtons = evilTwinContainer.querySelector('.band-selection-buttons');
            if (bandButtons) {
                bandButtons.style.display = bandButtons.style.display === 'none' ? 'flex' : 'none';
            } else {
                bandButtons = document.createElement('div');
                bandButtons.className = 'band-selection-buttons';
                bandButtons.style.cssText = `
                    display: flex;
                    gap: 5px;
                    margin-top: 5px;
                `;

                const createBandButton = (band) => {
                    const btn = document.createElement('button');
                    btn.className = 'evil-twin-button';
                    btn.setAttribute('data-band', band);
                    btn.innerHTML = `<i class="fa-solid fa-wifi"></i> ${band}`;
                    btn.style.flex = '1';
                    return btn;
                };

                const band24Button = createBandButton('2.4GHz');
                const band5Button = createBandButton('5GHz');

                bandButtons.appendChild(band24Button);
                bandButtons.appendChild(band5Button);
                evilTwinContainer.appendChild(bandButtons);

                [band24Button, band5Button].forEach(btn => {
                    btn.addEventListener('click', () => {
                        const selectedBand = btn.dataset.band;
                        bandButtons.style.display = 'none';

                        evilTwinButton.setAttribute('data-wifi-interface', wifiInterface);
                        evilTwinButton.setAttribute('data-wan-interface', wanInterface);
                        evilTwinButton.setAttribute('data-band', selectedBand);

                        if (this.data.psk) {
                            evilTwinButton.setAttribute('data-psk', this.data.psk);
                        }

                        this.startEvilTwin(
                            evilTwinButton,
                            this.data.name,
                            this.data.psk,
                            wifiInterface,
                            wanInterface,
                            this.data.kismet_device_base_macaddr,
                            selectedBand
                        );
                    });
                });
            }
        });
    }

    startEvilTwin(button, ssid, psk, wifiInterface, wanInterface, targetMac, band) {
        const evilTwinManager = window.evilTwinManager || new window.EvilTwinManager();
        evilTwinManager.setupButton(button, ssid, psk, wifiInterface, wanInterface, targetMac, band);
    }


    updateContent() {
        console.log('Updating AP device label content');
        const wasExpanded = this.expanded;

        // Store references to existing buttons and their states before update
        const existingKarmaButton = this.element.querySelector('.karma-ap-button');
        const existingEvilTwinButton = this.element.querySelector('.evil-twin-button');
        const karmaButtonState = existingKarmaButton ? {
            running: existingKarmaButton.classList.contains('running'),
            backgroundColor: existingKarmaButton.style.backgroundColor,
            innerHTML: existingKarmaButton.innerHTML,
            attributes: Array.from(existingKarmaButton.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {})
        } : null;

        // Update manufacturer span if needed
        if (this.cachedElements.manufacturerSpan) {
            let displayText = `${this.getManufacturer()}${this.data.freq ? ` (${this.data.freq})` : ''} ${this.data.kismet_device_base_signal?.last_signal ? `(${this.data.kismet_device_base_signal.last_signal} dBm)` : ''}`;
            
            const isEvilTwin = this.data.kismet_device_base_macaddr === "00:11:22:33:44:55";
            const isKarma = this.data.isKarmaMode === true;
            // Consider both KARMA and evil twin cases consistently
            const isOffline = (isEvilTwin || isKarma) && 
                            (this.data.isOffline === true || this.element.getAttribute('data-evil-twin-offline') === 'true');

            if (isOffline) {
                displayText += ' (Offline)';
            }

            if (this.cachedElements.manufacturerSpan.textContent !== displayText) {
                this.cachedElements.manufacturerSpan.textContent = displayText;
            }

            // Maintain evil-twin attribute consistently
            if (isEvilTwin || isKarma) {
                this.element.setAttribute('data-evil-twin', 'true');
            }
        }

        // Update details panel with preserved button states
        if (this.cachedElements.detailsPanel) {
            console.log('Updating details panel content');
            this.cachedElements.detailsPanel.innerHTML = APTemplates.generateAPTemplate(this.data);
            
            // Restore button states and reattach handlers
            const newKarmaButton = this.element.querySelector('.karma-ap-button');
            if (newKarmaButton && karmaButtonState) {
                console.log('Restoring Karma button state:', karmaButtonState);
                
                // Restore classes and styles
                if (karmaButtonState.running) {
                    newKarmaButton.classList.add('running');
                }
                newKarmaButton.style.backgroundColor = karmaButtonState.backgroundColor;
                newKarmaButton.innerHTML = karmaButtonState.innerHTML;
                
                // Restore attributes
                Object.entries(karmaButtonState.attributes).forEach(([name, value]) => {
                    if (name !== 'class' && name !== 'style') { // Skip class and style as they're already handled
                        newKarmaButton.setAttribute(name, value);
                    }
                });
            }

            // Setup handlers in order
            this.setupDeauthHandler();
            this.setupEvilTwinHandler();
            this.setupKarmaAPHandler();
        }

        if (wasExpanded) {
            this.expanded = true;
            this.element.classList.add('expanded');
        }
    }
}
