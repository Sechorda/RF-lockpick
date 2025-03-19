import { EvilTwinManager } from '../../services/security/evil-twin-manager.js';
import { DeviceTemplateManager } from '../device-template-manager.js';

export class DeviceLabel {
    constructor(data, parentElement) {
        this.data = {
            ...data,
            kismet_device_base_type: data.kismet_device_base_type || 'Unknown'
        };
        this.evilTwinManager = new EvilTwinManager();

        // Parse cracked.txt and update PSKs
        this.updatePskFromCrackedFile();
        this.macAddress = this.data.kismet_device_base_macaddr;
        this.element = document.createElement('div');
        this.element.className = 'device-label';
        if (data.kismet_device_base_type === "Wi-Fi Client") {
            this.element.setAttribute('data-client', 'true');
        }
        this.expanded = false;
        this.cachedElements = {}; // Cache for DOM elements
        this.lastUpdateTime = Date.now(); // Track last update time

        if (data.kismet_device_base_type === "Wi-Fi Network") {
            this.element.setAttribute('data-ssid', data.name);
            const security = data.security?.split(' + ') || [];
            this.initialLabel = `${data.name || 'Hidden SSID'} (${security.join(' + ')})`;
        } else if (data.kismet_device_base_type === "Wi-Fi AP") {
            this.initialLabel = `${this.getManufacturer()}${data.freq ? ` (${data.freq})` : ''} ${data.kismet_device_base_signal?.last_signal ? `(${data.kismet_device_base_signal.last_signal} dBm)` : ''}`;
            // Set evil-twin attribute if MAC matches
            if (data.kismet_device_base_macaddr === "00:11:22:33:44:55") {
                this.element.setAttribute('data-evil-twin', 'true');
            }
        }

        // Check for existing state and set button state accordingly
        const existingState = this.evilTwinManager.getPersistentState(data.name);
        if (existingState && existingState.isRunning) {
            this.element.setAttribute('data-evil-twin-running', 'true');
        }

        this.setupLabel();
        this.setupAuditHandler();

        this.updateData(data);

        document.addEventListener('networksUpdated', () => {
            if (this.data.kismet_device_base_type === "Wi-Fi Network" ||
                this.data.kismet_device_base_type === "Wi-Fi AP") {
                this.updateContent();
            }
        });

        // Listen for pskUpdated event
        document.addEventListener('pskUpdated', (event) => {
            if (this.data.name === event.detail.ssid) {
                this.data.psk = event.detail.psk;
                this.updateContent();
            }
        });

        parentElement.appendChild(this.element);
    }

    updateData(newData) {
        const wasExpanded = this.expanded;

        const originalType = this.data.kismet_device_base_type;
        const originalPsk = this.data.psk; // Preserve the PSK value
        const isEvilTwin = this.element.getAttribute('data-evil-twin') === 'true';
        const isOffline = isEvilTwin && this.element.getAttribute('data-evil-twin-offline') === 'true';

        newData = {
            ...newData,
            kismet_device_base_type: originalType,
            psk: newData.psk || originalPsk // Keep existing PSK if new data doesn't have one
        };

        this.data = newData;

        if (originalType === "Wi-Fi Network") {
            this.element.setAttribute('data-ssid', this.data.name);
            if (this.data.persistent) {
                this.element.setAttribute('data-persistent', 'true');
            }
            const security = this.data.security?.split(' + ') || [];
            this.initialLabel = `${this.data.name || 'Hidden SSID'} (${security.join(' + ')})`;
        } else if (originalType === "Wi-Fi AP") {
            let label = `${this.getManufacturer()}${this.data.freq ? ` (${this.data.freq})` : ''} ${this.data.kismet_device_base_signal?.last_signal ? `(${this.data.kismet_device_base_signal.last_signal} dBm)` : ''}`;
            if (isOffline) {
                label += ' (Offline)';
            }
            this.initialLabel = label;
            // Update evil-twin attribute if MAC matches
            if (this.data.kismet_device_base_macaddr === "00:11:22:33:44:55") {
                this.element.setAttribute('data-evil-twin', 'true');
            } else {
                this.element.removeAttribute('data-evil-twin');
            }
        }

        this.updateContent();

        if (wasExpanded) {
            this.expand();
        }
    }

    updatePskFromCrackedFile() {
        fetch('/cracked.txt')
            .then(response => response.text())
            .then(content => {
                if (!content.trim()) {
                    // File is empty or only whitespace, proceed without PSK
                    return;
                }
                // File exists and has content - try to find a PSK
                const lines = content.split('\n');
                lines.forEach(line => {
                    const parts = line.trim().split(':');
                    if (parts.length === 2 && this.data.name === parts[0]) {
                        this.data.psk = parts[1];
                    }
                });
            })
            .catch(() => {
                // File doesn't exist or other error - proceed without PSK
            })
            .finally(() => {
                // Always update content, with or without PSK
                this.updateContent();
            });
    }

    updateContent() {
        const wasExpanded = this.expanded;

        const manufacturerSpan = this.cachedElements.manufacturerSpan;
        if (manufacturerSpan) {
            let displayText;
            if (this.data.kismet_device_base_type === "Wi-Fi Network") {
                const security = this.data.security?.split(' + ') || [];
                displayText = `${this.data.name || 'Hidden SSID'} (${security.join(' + ')})`;
                this.initialLabel = displayText;
            } else if (this.data.kismet_device_base_type === "Wi-Fi AP") {
                displayText = `${this.getManufacturer()}${this.data.freq ? ` (${this.data.freq})` : ''} ${this.data.kismet_device_base_signal?.last_signal ? `(${this.data.kismet_device_base_signal.last_signal} dBm)` : ''}`;

                // Add (Offline) for KARMA AP or evil twin that's offline
                const isKarma = this.data.isKarmaMode === true;
                const isEvilTwin = this.data.kismet_device_base_macaddr === "00:11:22:33:44:55";
                const isOffline = (isKarma && this.data.isOffline === true) || 
                                (isEvilTwin && this.element.getAttribute('data-evil-twin-offline') === 'true');

                if (isOffline) {
                    displayText += ' (Offline)';
                }
                this.initialLabel = displayText;
            } else {
                displayText = this.getManufacturer();
            }

            if (manufacturerSpan.textContent !== displayText) {
                manufacturerSpan.textContent = displayText;
            }
        }

        if (this.data.kismet_device_base_type === "Wi-Fi Client") {
            const signal = this.cachedElements.signalStrength;
            const lastSeen = this.cachedElements.lastSeen;
            const packets = this.cachedElements.packetStats;

            if (signal) signal.textContent = `${this.data.kismet_device_base_signal?.last_signal || 0} dBm`;
            if (lastSeen && this.data.kismet_device_base_last_time) {
                lastSeen.textContent = new Date(this.data.kismet_device_base_last_time * 1000).toLocaleString();
            }
            if (packets) packets.textContent = this.data.kismet_device_base_packets?.total || 0;
        } else if (this.data.kismet_device_base_type === "Wi-Fi Network") {
            // For Wi-Fi networks, re-render the entire details panel when PSK changes
            const detailsPanel = this.cachedElements.detailsPanel;
            if (detailsPanel) {
                detailsPanel.innerHTML = this.generateDetailsHTML();
                // Reinitialize cached elements
                this.cachedElements.pskValue = detailsPanel.querySelector('.psk-value');
                this.cachedElements.auditButton = detailsPanel.querySelector('.audit-button');
                // Re-setup audit handler if button exists
                if (this.cachedElements.auditButton) {
                    this.setupAuditHandler();
                }

                // Add copy icon for PSK
                if (this.data.psk) {
                }
            }
        }

        if (wasExpanded) {
            this.expanded = true;
            this.element.classList.add('expanded');
        }
    }

    setupAuditHandler() {
        // Clean up any existing handler first
        if (this._cleanupAuditHandler) {
            this._cleanupAuditHandler();
            this._cleanupAuditHandler = null;
        }

        const auditButton = this.element.querySelector('.audit-button');
        // If no button or PSK exists, don't set up handler
        if (!auditButton || this.data.psk) return;

        // Check both the element attribute and the data property
        const isKarmaMode = this.element.getAttribute('data-karma') === 'true' || this.data.isKarmaMode === true;
        
        // Register audit button with network auditor
        if (window.networkAuditor) {
            window.networkAuditor.registerButton(this.data.name, auditButton);
        }

        const clickHandler = async (e) => {
            e.stopPropagation();

            if (!auditButton.classList.contains('running')) {
                try {
                    if (isKarmaMode) {
                        // KARMA MODE: Use network auditor to handle karma audit
                        let clientMacs = [];
                        
                        // Get clients either from accessPoints (when in visualization) or directly from probeRequests
                        if (this.data.accessPoints?.[0]?.clients) {
                            // When network is visualized, get from accessPoints
                            const clients = this.data.accessPoints[0].clients || [];
                            clientMacs = clients.map(client => client.mac || client.kismet_device_base_macaddr);
                        } else if (window.probequestView && this.data.name) {
                            // Get directly from the karma view's probeRequests Map
                            const ssidData = window.probequestView.probeRequests.get(this.data.name);
                            
                            if (ssidData) {
                                clientMacs = Array.from(ssidData.values()).map(client => client.mac);
                            }
                        } else {
                            console.warn('Could not find client data in either location!');
                        }

                        // Get active interface
                        const wifiInterfaceSelect = document.querySelector('.interface-dropdown[data-tool="kismet"]');
                        const wifiInterface = wifiInterfaceSelect?.value;

                        if (!wifiInterface) {
                            console.error('No wifi interface selected');
                            // Fallback - try to get first wifi interface
                            if (window.interfaces && window.interfaces.wifi_interfaces?.length) {
                                wifiInterface = window.interfaces.wifi_interfaces[0];
                            } else {
                                alert('No WiFi interface selected. Please select one in the settings.');
                                return;
                            }
                        }

                        // Call karma audit endpoint directly
                        try {
                            // First update button state to show we're trying
                            auditButton.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Starting...';
                            auditButton.style.background = 'linear-gradient(45deg, #4B0082, #8A2BE2)';
                            
                            // Use network auditor to handle karma audit
                            await window.networkAuditor.startAudit(
                                this.data.name,
                                true, // isKarmaAudit
                                clientMacs
                            );
                        } catch (error) {
                            console.error('Karma audit request failed:', error);
                            alert(`Failed to start karma audit: ${error.message}`);
                            auditButton.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Failed';
                            auditButton.style.background = '#ff6b6b';
                            setTimeout(() => {
                                auditButton.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Audit Network';
                                auditButton.style.background = '';
                            }, 3000);
                        }
                    } else {
                        // NORMAL MODE: Use network auditor to run wifite
                        if (!window.networkAuditor) {
                            console.error('NetworkAuditor not initialized');
                            return;
                        }
                        
                        
                        window.networkAuditor.updateAuditButton(this.data.name, 'capturing');
                        document.dispatchEvent(new CustomEvent('audit-network', {
                            detail: {
                                ssid: this.data.name,
                                uuid: this.data.kismet_device_base_key
                            }
                        }));
                    }
                } catch (error) {
                    console.error('Error starting audit:', error);
                    if (!isKarmaMode && window.networkAuditor) {
                        window.networkAuditor.clearAuditStatus(this.data.name);
                    }
                }
            }
        };

        auditButton.addEventListener('click', clickHandler);

        this._cleanupAuditHandler = () => {
            window.networkAuditor?.unregisterButton(this.data.name, auditButton);
            auditButton.removeEventListener('click', clickHandler);
        };
    }

    cleanup() {
        // Store expanded state before cleanup
        const wasExpanded = this.expanded;
        
        if (this._cleanupAuditHandler) {
            this._cleanupAuditHandler();
        }

        if (this._hoverTimeout) {
            clearTimeout(this._hoverTimeout);
            this._hoverTimeout = null;
        }

        // Only remove the element if it's not an evil-twin or SSID/AP
        const isEvilTwin = this.element.getAttribute('data-evil-twin') === 'true';
        const isPersistent = this.data.kismet_device_base_type === "Wi-Fi Network" || 
                           this.data.kismet_device_base_type === "Wi-Fi AP";

        if (!isEvilTwin && !isPersistent) {
            if (this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
            this.expanded = false;
            this.element.classList.remove('expanded');
        } else if (wasExpanded) {
            // Preserve expanded state for persistent labels
            this.expanded = true;
            this.element.classList.add('expanded');
        }
    }

    setupLabel() {
        const basicLabel = document.createElement('div');
        basicLabel.className = 'basic-label';

        // In KARMA mode, create minimal labels
        if (this.element?.getAttribute('data-karma') === 'true') {
            if (this.data.kismet_device_base_type === "Wi-Fi Client") {
                const macSpan = document.createElement('span');
                macSpan.className = 'manufacturer';
                macSpan.textContent = this.data.kismet_device_base_macaddr;
                
                basicLabel.appendChild(macSpan);
                
                this.cachedElements = {
                    basicLabel,
                    manufacturerSpan: macSpan
                };
                
                return;
            } else if (this.data.kismet_device_base_type === "Wi-Fi AP") {
                const macSpan = document.createElement('span');
                macSpan.className = 'manufacturer';
                let displayText = `${this.data.kismet_device_base_macaddr} (${this.data.freq || 'Unknown'})`;
                
                // Add (Offline) for KARMA AP that's offline
                if (this.data.isKarmaMode === true && this.data.isOffline === true) {
                    displayText += ' (Offline)';
                }
                
                macSpan.textContent = displayText;
                basicLabel.appendChild(macSpan);
                
                const detailsPanel = document.createElement('div');
                detailsPanel.className = 'details-panel';
                detailsPanel.innerHTML = this.generateDetailsHTML();
                
                this.cachedElements = {
                    basicLabel,
                    manufacturerSpan: macSpan,
                    detailsPanel
                };
                
                this.element.appendChild(basicLabel);
                this.element.appendChild(detailsPanel);
                
                return;
            }
        }

        // Regular label setup for non-KARMA mode or non-client devices
        let displayText;
        if (this.data.kismet_device_base_type === "Wi-Fi Network") {
            const security = this.data.security?.split(' + ') || [];
            displayText = `${this.data.name || 'Hidden SSID'} (${security.join(' + ')})`;
            this.initialLabel = displayText;
        } else if (this.data.kismet_device_base_type === "Wi-Fi AP") {
            displayText = `${this.getManufacturer()}${this.data.freq ? ` (${this.data.freq})` : ''} ${this.data.kismet_device_base_signal?.last_signal ? `(${this.data.kismet_device_base_signal.last_signal} dBm)` : ''}`;
            this.initialLabel = displayText;
        } else {
            displayText = this.getManufacturer();
        }

        const manufacturerSpan = document.createElement('span');
        manufacturerSpan.className = 'manufacturer';
        manufacturerSpan.textContent = displayText;

        const expandIndicator = document.createElement('span');
        expandIndicator.className = 'expand-indicator';
        expandIndicator.textContent = '›';

        basicLabel.appendChild(manufacturerSpan);
        basicLabel.appendChild(expandIndicator);

        const detailsPanel = document.createElement('div');
        detailsPanel.className = 'details-panel';
        detailsPanel.innerHTML = this.generateDetailsHTML();

        // Initialize cached elements
        this.cachedElements = {
            basicLabel,
            manufacturerSpan,
            detailsPanel
        };

            // Add deauth and evil twin buttons for AP devices in non-KARMA mode
            if (this.data.kismet_device_base_type === "Wi-Fi AP" &&
                this.data.kismet_device_base_macaddr !== "00:11:22:33:44:55" &&
                !this.data.isKarmaMode) {

            // Create container for evil twin controls
            const evilTwinContainer = document.createElement('div');
            evilTwinContainer.className = 'evil-twin-container';
            evilTwinContainer.style.marginBottom = '10px';

            // Add evil twin button
            const evilTwinButton = this.evilTwinManager.createButton();
            evilTwinContainer.appendChild(evilTwinButton);
            this.cachedElements.evilTwinButton = evilTwinButton;

            // Add evil twin container first 
            detailsPanel.appendChild(evilTwinContainer);

            // Create deauth button
            const deauthButton = document.createElement('button');
            deauthButton.className = 'deauth-button';
            deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Deauth All';
            deauthButton.style.cssText = `
                padding: 5px 10px;
                border-radius: 4px;
                border: none;
                cursor: pointer;
                background-color: #ff6b6b;
                color: white;
                margin-bottom: 10px;
            `;

            // Band selection for deauth
            const bandSelectionContainer = document.createElement('div');
            bandSelectionContainer.className = 'band-selection-buttons';
            bandSelectionContainer.style.cssText = `
                display: none;
                gap: 5px;
                margin-top: 5px;
                margin-bottom: 10px;
            `;

            // Create band buttons for deauth
            const createBandButton = (band) => {
                const btn = document.createElement('button');
                btn.className = 'deauth-band-button';
                btn.setAttribute('data-band', band);
                btn.innerHTML = `<i class="fa-solid fa-wifi"></i> ${band}`;
                btn.style.cssText = `
                    flex: 1;
                    padding: 5px 12px;
                    border-radius: 4px;
                    border: none;
                    cursor: pointer;
                    background-color: #ff6b6b;
                    color: white;
                `;
                return btn;
            };

            const band24Button = createBandButton('2.4GHz');
            const band5Button = createBandButton('5GHz');
            
            bandSelectionContainer.appendChild(band24Button);
            bandSelectionContainer.appendChild(band5Button);

            // Add click handlers
            deauthButton.addEventListener('click', () => {
                if (deauthButton.classList.contains('deauthing')) return;
                
                // Toggle band selection visibility
                bandSelectionContainer.style.display = bandSelectionContainer.style.display === 'none' ? 'flex' : 'none';
            });

            // Handle band selection for deauth
            const handleBandSelection = async (band) => {
                if (deauthButton.classList.contains('deauthing')) return;

                deauthButton.classList.add('deauthing');
                deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Deauthing...';
                deauthButton.style.backgroundColor = '#ff8787';
                bandSelectionContainer.style.display = 'none';

                // Get the selected wifi interface from settings
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

                    // Reset button after 2 seconds
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

            band24Button.addEventListener('click', () => handleBandSelection('2.4GHz'));
            band5Button.addEventListener('click', () => handleBandSelection('5GHz'));

            // Add buttons to details panel after evil twin container
            detailsPanel.appendChild(deauthButton);
            detailsPanel.appendChild(bandSelectionContainer);

            this.cachedElements.evilTwinButton = evilTwinButton;

            // Check for existing state and restore if present
            const existingState = JSON.parse(localStorage.getItem(`evilTwinState_${this.data.name}`));
            if (existingState && existingState.isRunning) {
                evilTwinButton.innerHTML = '<i class="fa-solid fa-users"></i> Evil-Twin running';
                evilTwinButton.style.backgroundColor = 'green';
                evilTwinButton.setAttribute('data-wifi-interface', existingState.wifiInterface);
                evilTwinButton.setAttribute('data-target-mac', existingState.targetMac);

                // Add the stop button below evil twin button
                const stopButton = this.evilTwinManager.createStopButton(
                    this.data.name,
                    existingState.wifiInterface
                );
                stopButton.style.marginTop = '10px';
                evilTwinContainer.appendChild(stopButton);
            }

            evilTwinButton.addEventListener('click', () => {
                // Retrieve selected interfaces from settings
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

                // Create or toggle band selection buttons
                let bandButtons = evilTwinContainer.querySelector('.band-selection-buttons');
                
                if (bandButtons) {
                    // Toggle existing band buttons
                    bandButtons.style.display = bandButtons.style.display === 'none' ? 'flex' : 'none';
                } else {
                    // Create new band selection buttons
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

                    // Add band buttons after the evil twin button
                    evilTwinContainer.appendChild(bandButtons);

                    // Handle band selection
                    [band24Button, band5Button].forEach(btn => {
                        btn.addEventListener('click', () => {
                            const selectedBand = btn.dataset.band;
                            bandButtons.style.display = 'none';
                            
                            // Store interface information as data attributes
                            evilTwinButton.setAttribute('data-wifi-interface', wifiInterface);
                            evilTwinButton.setAttribute('data-wan-interface', wanInterface);
                            evilTwinButton.setAttribute('data-band', selectedBand);

                            // Set PSK if available, otherwise proceed with open network
                            if (this.data.psk) {
                                evilTwinButton.setAttribute('data-psk', this.data.psk);
                            }

                            // Setup the evil twin button
                            this.evilTwinManager.setupButton(
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
        };

        const auditButton = this.element.querySelector('.audit-button');
        if (auditButton) {
            auditButton.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Audit Network';
        }

        if (this.data.kismet_device_base_type === "Wi-Fi Client") {
            const detailRows = detailsPanel.querySelectorAll('.detail-row');
            detailRows.forEach(row => {
                const key = row.querySelector('.detail-key');
                if (key && key.textContent === 'Signal Strength:') {
                    this.cachedElements.signalStrength = row.querySelector('.detail-value');
                } else if (key && key.textContent === 'Last Seen:') {
                    this.cachedElements.lastSeen = row.querySelector('.detail-value');
                }
            });

            this.cachedElements.packetStats = detailsPanel.querySelector('.packet-stat-value');

            // Add deauth button handler for client nodes
            const deauthButton = detailsPanel.querySelector('.deauth-button');
            if (deauthButton) {
                deauthButton.addEventListener('click', async () => {
                    if (deauthButton.classList.contains('deauthing')) return;

                    deauthButton.classList.add('deauthing');
                    deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Deauthing...';
                    deauthButton.style.backgroundColor = '#ff8787';

                    // Get the selected wifi interface from settings
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

                    // Get AP info from the network visualization
                    const visualizer = window.networkVisualizer?.getNodes();
                    if (!visualizer?.nodes) {
                        console.error('Network visualizer not initialized');
                        deauthButton.classList.remove('deauthing');
                        deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Network Error';
                        deauthButton.style.backgroundColor = '#808080';
                        return;
                    }

                    // Find node by MAC address since we're having issues with nodeId
                    const allNodes = Array.from(visualizer.nodes.values());
                    const clientNode = allNodes.find(node => 
                        node.userData?.type === 'client' && 
                        node.userData?.data?.kismet_device_base_macaddr === this.data.kismet_device_base_macaddr
                    );
                    

                    if (!clientNode || clientNode.userData?.type !== 'client') {
                        console.error('Client node not found');
                        deauthButton.classList.remove('deauthing');
                        deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Client Not Found';
                        deauthButton.style.backgroundColor = '#808080';
                        return;
                    }

                    // Then get its associated AP node
                    const apNode = clientNode.userData?.apNode;

                    if (!apNode || apNode.userData?.type !== 'ap') {
                        console.error('AP node not found for client');
                        deauthButton.classList.remove('deauthing');
                        deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Client Not Connected';
                        deauthButton.style.backgroundColor = '#808080';
                        return;
                    }

                    // Get AP data and channel info
                    const apData = apNode.userData?.data;
                    const apMac = apData?.kismet_device_base_macaddr;
                    const channel = clientNode.userData?.apData?.channel;
                    
                    
                    if (!apMac || !channel) {
                        console.error('Missing required data:', {
                            apMac: apMac,
                            channel: channel
                        });
                        console.error('Missing AP data (MAC or channel)');
                        deauthButton.classList.remove('deauthing');
                        deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Client Not Connected';
                        deauthButton.style.backgroundColor = '#808080';
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
                                target_mac: this.data.kismet_device_base_macaddr,
                                ap_mac: apMac,
                                channel: channel
                            })
                        });

                        if (!response.ok) {
                            throw new Error('Deauth request failed');
                        }

                        // Reset button after 2 seconds to show completion
                        setTimeout(() => {
                            deauthButton.classList.remove('deauthing');
                            deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Deauth Client';
                            deauthButton.style.backgroundColor = '#ff6b6b';
                        }, 2000);
                    } catch (error) {
                        console.error('Error sending deauth packet:', error);
                        deauthButton.classList.remove('deauthing');
                        deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Deauth Client';
                        deauthButton.style.backgroundColor = '#ff6b6b';
                    }
                });
            }
        } else if (this.data.kismet_device_base_type === "Wi-Fi Network") {
            this.cachedElements.pskValue = detailsPanel.querySelector('.psk-value');
            this.cachedElements.auditButton = detailsPanel.querySelector('.audit-button');
        }

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

    getManufacturer() {
        // In KARMA mode, only show MAC address for client devices
        if (this.element?.getAttribute('data-karma') === 'true' && 
            this.data.kismet_device_base_type === "Wi-Fi Client") {
            return this.data.kismet_device_base_macaddr;
        }
        
        // For non-KARMA mode or non-client devices, show full manufacturer info
        return this.data.kismet_device_base_manufacturer || this.data.manufacturer || 'Unknown Manufacturer';
    }

    getBandClass() {
        const channel = parseInt(this.data.kismet_device_base_channel);
        if (isNaN(channel)) return '';
        return channel > 14 ? 'band-5g' : 'band-2g';
    }

    formatBytes(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        return `${value.toFixed(2)} ${units[unitIndex]}`;
    }

    generateDetailsHTML() {
        return DeviceTemplateManager.generateDetailsHTML(this.data);
    }

    expand() {
        this.expanded = true;
        this.element.classList.add('expanded');
    }

    collapse() {
        this.expanded = false;
        this.element.classList.remove('expanded');
    }

    updatePosition(x, y, distance) {
        this.lastX = x;
        this.lastY = y;

        const opacity = Math.max(0.7, Math.min(1, 15 / distance));
        let labelX = x + 15;
        let labelY = y - 6;
        const rect = this.element.getBoundingClientRect();
        const padding = 10;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (this.expanded && labelX + rect.width + padding > viewportWidth) {
            labelX = x - rect.width - 15;
        }
        if (this.expanded && labelY + rect.height + padding > viewportHeight) {
            labelY = viewportHeight - rect.height - padding;
        }

        Object.assign(this.element.style, {
            transform: `translate3d(${labelX}px, ${labelY}px, 0)`,
            opacity: this.data.kismet_device_base_type === "Wi-Fi Network" || this.data.kismet_device_base_type === "Wi-Fi AP" ? 1 : opacity
        });

        if (this.data.kismet_device_base_type === "Wi-Fi Network" || this.data.kismet_device_base_type === "Wi-Fi AP") {
            this.element.style.zIndex = this.expanded ? '1000' : '100';
        } else {
            this.element.style.zIndex = this.expanded ? '100' : '10';
        }
    }
}

export class LabelManager {
    constructor() {
        this.labels = new Map(); // MAC address -> DeviceLabel
        this.container = null;
        this.setupContainer();
    }

    setupContainer() {
        this.container = document.createElement('div');
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '1'
        });

        const style = document.createElement('style');
        style.textContent = `
            .device-label[data-ssid] {
                transition: none;
            }
            .device-label[data-ssid] .basic-label,
            .device-label[data-ssid] .details-panel {
                transition: none;
            }
            .device-label .basic-label,
            .device-label .details-panel,
            .device-label .audit-button,
            .device-label .detail-value[onclick],
            .device-label .psk-value:not(.empty) {
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(style);

        document.getElementById('canvas-container').appendChild(this.container);
    }

    getOrCreateLabel(data) {
        const macAddress = data.kismet_device_base_macaddr;
        let label = this.labels.get(macAddress);

        if (!label) {
            label = new DeviceLabel(data, this.container);
            // Store node ID on label for AP lookup
            if (data.nodeId) {
                label.element.setAttribute('data-node-id', data.nodeId);
            }
            this.labels.set(macAddress, label);
        } else {
            label.updateData(data);
            // Update label with any existing state
            const existingState = label.evilTwinManager.getPersistentState(data.name);
            if (existingState && existingState.isRunning) {
                label.element.setAttribute('data-evil-twin-running', 'true');
            }
        }

        return label;
    }

    updateLabelPosition(macAddress, screenPos, distance) {
        const label = this.labels.get(macAddress);
        if (label) {
            label.updatePosition(screenPos.x, screenPos.y, distance);
        }
    }

    removeLabel(macAddress) {
        const label = this.labels.get(macAddress);
        if (label) {
            label.cleanup();
            this.labels.delete(macAddress);
        }
    }

    cleanup(activeDevices, forceCleanup = false) {
        if (!activeDevices && !forceCleanup) return;

        const inactiveLabels = new Set();
        this.labels.forEach((label, macAddress) => {
            if (forceCleanup ||
                (!activeDevices.has(macAddress) &&
                 label.data.kismet_device_base_type === "Wi-Fi Client")) {
                inactiveLabels.add(macAddress);
            } else if (!forceCleanup &&
                      (label.data.kismet_device_base_type === "Wi-Fi AP" ||
                       label.data.kismet_device_base_type === "Wi-Fi Network")) {
                label.updatePosition(label.lastX, label.lastY, 1);
            }
        });

        inactiveLabels.forEach(macAddress => {
            const label = this.labels.get(macAddress);
            if (label) {
                label.cleanup();
                this.labels.delete(macAddress);
            }
        });
    }
}
