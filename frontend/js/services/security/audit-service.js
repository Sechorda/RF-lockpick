/**
 * Audit Service handles network auditing functionality
 * Manages both normal and karma audit modes
 */
export class AuditService {
    constructor() {
        // Initialize state
        this.networkAuditStatus = new Map(); // Stores audit status and PSK for each network
        this.currentAudit = null;
        this.buttonRegistry = new Map(); // Track all audit buttons
        this.pendingRemovals = new Map(); // Track networks pending removal
        this.karmaStateTimeouts = new Map(); // Track karma state transition timeouts
        this.REMOVAL_TIMEOUT = 300000; // 5 minutes in milliseconds

        // Initialize button states
        this.buttonStates = {
            capturing: {
                running: true,
                complete: false,
                text: '<i class="fa-solid fa-shield-halved"></i><span>Capturing Handshake...</span>',
                background: 'linear-gradient(45deg, #0066ff, #3385ff)'
            },
            handshakeCaptured: {
                running: false,
                complete: true,
                text: '<span style="color: #00ff00;">✓</span> Handshake Captured',
                background: 'linear-gradient(45deg, #006400, #008000)'
            },
            cracking: {
                running: true,
                complete: false,
                text: '<i class="fa-solid fa-shield-halved"></i><span>Cracking PSK...</span>',
                background: 'linear-gradient(45deg, #0066ff, #3385ff)'
            },
            complete: {
                running: false,
                complete: true,
                text: '<span style="color: #00ff00;">✓</span> PSK Found',
                background: 'linear-gradient(45deg, #006400, #008000)'
            },
            error: {
                running: false,
                complete: true,
                text: 'PSK not found in wordlist',
                background: 'linear-gradient(45deg, #FF0000, #8B0000)'
            },
            default: {
                running: false,
                complete: false,
                text: '<i class="fa-solid fa-shield-halved"></i><span>Audit Network</span>',
                background: 'linear-gradient(45deg, #0052cc, #0066ff)'
            }
        };

        // Bind event handlers
        this.handleNetworkUpdate = this.handleNetworkUpdate.bind(this);
        this.handleViewToggle = this.handleViewToggle.bind(this);

        // Setup event listeners
        document.addEventListener('networksUpdated', this.handleNetworkUpdate);
        document.addEventListener('viewToggled', this.handleViewToggle);
    }

    // Handle Karma-specific state transitions
    handleKarmaStateTransition(ssid, status) {
        if (this.karmaStateTimeouts.has(ssid)) {
            clearTimeout(this.karmaStateTimeouts.get(ssid));
            this.karmaStateTimeouts.delete(ssid);
        }

        if (status === 'handshakeCaptured') {
            const timeoutId = setTimeout(() => {
                const currentState = this.networkAuditStatus.get(ssid);
                if (currentState?.status === 'handshakeCaptured') {
                    this.updateAuditButton(ssid, 'cracking');
                }
            }, 1500);
            this.karmaStateTimeouts.set(ssid, timeoutId);
        }
    }

    updateAuditButton(ssid, status, psk = null) {
        const networks = window.networks || [];
        const network = networks.find(n => n.ssid.name === ssid);
        const existingState = this.networkAuditStatus.get(ssid) || {};
        const isKarmaAudit = network?.ssid?.isKarmaMode || existingState.isKarmaAudit;

        // Skip transition if already in a final state
        if (existingState.status === 'complete' || existingState.status === 'error') {
            return;
        }

        // For handshakeCaptured, ensure we store capture time
        const baseState = {
            ...existingState,
            status,
            persistent: true,
            isKarmaAudit: isKarmaAudit,
            timestamp: status === 'handshakeCaptured' ? Date.now() : existingState.timestamp
        };

        // Update network status
        this.networkAuditStatus.set(ssid, baseState);

        // Apply button state
        if (this.buttonStates[status]) {
            this.updateAllButtonsForNetwork(ssid, this.buttonStates[status]);
        }

        // Handle special cases for karma audit
        if (isKarmaAudit) {
            if (status === 'handshakeCaptured') {
                this.updateHandshakeField(ssid);
                
                // Update device registry with handshake status
                if (network?.ssid?.kismet_device_base_macaddr) {
                    const device = window.deviceRegistry.get(network.ssid.kismet_device_base_macaddr);
                    if (device) {
                        const updatedDevice = {
                            ...device,
                            ...network.ssid,
                            handshakeCaptured: true,
                            isKarmaMode: true,
                            persistent: true,
                            isTransitioning: true
                        };
                        window.deviceRegistry.set(network.ssid.kismet_device_base_macaddr, updatedDevice);
                    }
                }

                // Update handshake field first to ensure UI updates
                this.updateHandshakeField(ssid);

                // Then handle karma state transition
                this.handleKarmaStateTransition(ssid, status);
            }
        }

        // Handle PSK updates
        if (status === 'complete' && psk) {
            this.networkAuditStatus.set(ssid, {
                ...baseState,
                psk
            });
        }
    }

    // Helper method to update handshake field
    updateHandshakeField(ssid) {
        const buttons = this.buttonRegistry.get(ssid);
        if (!buttons) return;

        const networks = window.networks || [];
        const network = networks.find(n => n.ssid.name === ssid);
        if (!network) return;

        // Update both network and SSID node's handshake status
        network.handshakeCaptured = true;
        if (network.ssid) {
            network.ssid.handshakeCaptured = true;
        }

        // Update device registry with full device data
        if (network.ssid?.kismet_device_base_macaddr) {
            const deviceData = window.deviceRegistry.get(network.ssid.kismet_device_base_macaddr);
            const updatedData = {
                ...deviceData,
                ...network.ssid,
                handshakeCaptured: true,
                isTransitioning: true,
                persistent: true,
                isKarmaMode: network.ssid.isKarmaMode
            };
            
            // Update registry with merged data
            window.deviceRegistry.set(network.ssid.kismet_device_base_macaddr, updatedData);
            
            // Notify label to update with full data context
            document.dispatchEvent(new CustomEvent('deviceUpdated', {
                detail: {
                    macAddress: network.ssid.kismet_device_base_macaddr,
                    ssid: ssid,
                    handshakeCaptured: true,
                    data: updatedData,
                    isTransitioning: true,
                    persistent: true
                }
            }));
        }

        // Ensure network list is updated
        document.dispatchEvent(new CustomEvent('networksUpdated', {
            detail: {
                hasChanges: true,
                persistent: true,
                networks: networks
            }
        }));
    }

    // Helper method to handle button states
    applyButtonState(button, status, psk = null) {
        const ssid = button.getAttribute('data-ssid');
        if (!ssid) return;

        const storedStatus = this.networkAuditStatus.get(ssid);
        const currentStatus = storedStatus?.status || status;
        
        // Get button state based on status
        const state = this.buttonStates[currentStatus] || this.buttonStates.default;

        // Apply button state
        button.classList.toggle('running', state.running);
        button.classList.toggle('complete', state.complete);
        button.innerHTML = state.text;
        button.style.background = state.background;

        // Update handshake field if needed
        if (currentStatus === 'handshakeCaptured' && storedStatus?.isKarmaAudit) {
            this.updateHandshakeField(ssid);
        }
    }

    handleNetworkUpdate(event) {
        const networks = window.networks || [];
        
        // Verify current audit network still exists
        if (this.currentAudit) {
            const networkExists = networks.some(n => n.ssid.name === this.currentAudit);
            if (!networkExists && !this.pendingRemovals.has(this.currentAudit)) {
                this.pendingRemovals.set(this.currentAudit, Date.now());
            } else if (networkExists) {
                this.pendingRemovals.delete(this.currentAudit);
            }
        }

        // Verify stored audit status networks
        for (const [ssid, status] of this.networkAuditStatus) {
            const networkExists = networks.some(n => n.ssid.name === ssid);
            if (!networkExists) {
                if (!status.persistent && !this.pendingRemovals.has(ssid)) {
                    this.pendingRemovals.set(ssid, Date.now());
                }
            } else {
                this.pendingRemovals.delete(ssid);
                
                // Always preserve karma audit states
                if (status.isKarmaAudit || status.persistent) {
                    const network = networks.find(n => n.ssid.name === ssid);
                    if (network) {
                        // Set isKarmaMode flag on network if it's a karma audit
                        if (status.isKarmaAudit) {
                            network.ssid.isKarmaMode = true;
                        }

                        // Update PSK if available
                        if (status.psk) {
                            network.psk = status.psk;
                            network.ssid.psk = status.psk;
                        }
                        
                        if (network.ssid.kismet_device_base_macaddr) {
                            const updatedDevice = {
                                ...network.ssid,
                                psk: status.psk,
                                persistent: true,
                                isKarmaMode: status.isKarmaAudit
                            };
                            window.deviceRegistry.set(network.ssid.kismet_device_base_macaddr, updatedDevice);
                        }
                    }
                }
            }
        }

        if (event.detail.hasChanges) {
            setTimeout(() => {
                this.restoreAllButtonStates();
            }, 100);
        }
    }

    handleViewToggle() {
        setTimeout(() => this.restoreAllButtonStates(), 300);
    }

    restoreAllButtonStates() {
        for (const [ssid, buttons] of this.buttonRegistry.entries()) {
            const status = this.networkAuditStatus.get(ssid);
            const network = window.networks?.find(n => n.ssid.name === ssid);
            const isKarmaAudit = network?.ssid?.isKarmaMode || status?.isKarmaAudit;

            if (status) {
                // Get button state based on status
                const buttonState = this.buttonStates[status.status] || this.buttonStates.default;
                this.updateAllButtonsForNetwork(ssid, buttonState);

                // Update handshake field if needed
                if (status.status === 'handshakeCaptured' && isKarmaAudit) {
                    buttons.forEach(button => this.updateHandshakeField(ssid));
                }

                // Keep karma mode state
                if (isKarmaAudit) {
                    // Ensure network registry is updated
                    if (network?.ssid?.kismet_device_base_macaddr) {
                        const device = window.deviceRegistry.get(network.ssid.kismet_device_base_macaddr);
                        if (device) {
                            window.deviceRegistry.set(network.ssid.kismet_device_base_macaddr, {
                                ...device,
                                ...network.ssid,
                                handshakeCaptured: status.status === 'handshakeCaptured' || device.handshakeCaptured,
                                isKarmaMode: true,
                                persistent: true,
                                isTransitioning: true
                            });
                            
                            // Ensure UI is updated
                            if (status.status === 'handshakeCaptured' || device.handshakeCaptured) {
                                this.updateHandshakeField(ssid);
                            }
                        }
                    }
                }
            } else {
                const device = network?.ssid?.kismet_device_base_macaddr ? 
                    window.deviceRegistry.get(network.ssid.kismet_device_base_macaddr) : null;
                
                if (!device?.persistent) {
                    // Use default state for new buttons
                    this.updateAllButtonsForNetwork(ssid, this.buttonStates.default);
                }
            }
        }
    }

    updateAllButtonsForNetwork(ssid, state) {
        const buttons = this.buttonRegistry.get(ssid);
        
        if (buttons) {
            buttons.forEach(button => {
                if (state.running) button.classList.add('running');
                else button.classList.remove('running');
                
                if (state.complete) button.classList.add('complete');
                else button.classList.remove('complete');
                
                button.innerHTML = state.text;
                button.style.background = state.background;
            });
        }
    }

    registerButton(ssid, button) {
        if (!this.buttonRegistry.has(ssid)) {
            this.buttonRegistry.set(ssid, new Set());
        }
        this.buttonRegistry.get(ssid).add(button);
        
        const status = this.networkAuditStatus.get(ssid);
        if (status) {
            this.applyButtonState(button, status.status, status.psk);
        }
    }

    unregisterButton(ssid, button) {
        const buttons = this.buttonRegistry.get(ssid);
        if (buttons) {
            buttons.delete(button);
            if (buttons.size === 0) {
                this.buttonRegistry.delete(ssid);
            }
        }
    }

    async startAudit(ssid, isKarmaAudit = false, clientMacs = []) {
        if (this.currentAudit) {
            return;
        }

        // Get existing state and network info
        const existingStatus = this.networkAuditStatus.get(ssid);
        const networks = window.networks || [];
        const network = networks.find(n => n.ssid.name === ssid);
        
        // For karma audits, check if handshake is already captured
        if (isKarmaAudit && existingStatus?.status === 'handshakeCaptured') {
            return;
        }

        // Initialize audit state
        const baseState = {
            status: 'capturing',
            persistent: true,
            isKarmaAudit: isKarmaAudit,
            timestamp: Date.now()
        };

        this.networkAuditStatus.set(ssid, baseState);
        this.currentAudit = ssid;

        // Log before updating button
        const buttons = this.buttonRegistry.get(ssid);
        this.updateAuditButton(ssid, 'capturing');

        try {
            if (isKarmaAudit) {
                // Get active interface
                const wifiInterfaceSelect = document.querySelector('.interface-dropdown[data-tool="kismet"]');
                const wifiInterface = wifiInterfaceSelect?.value;

                if (!wifiInterface) {
                    throw new Error('No WiFi interface selected');
                }

                const response = await fetch('/api/karma/audit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        ssid: ssid,
                        clients: clientMacs,
                        interface: wifiInterface
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                // Process the karma audit stream
                const reader = response.body.getReader();
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        // Convert chunk to text and add to buffer
                        buffer += new TextDecoder().decode(value);

                        // Process complete lines
                        const lines = buffer.split('\n');
                        // Keep last incomplete line in buffer
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
                                    this.handleStreamEvent(data, ssid, true);
                                } catch (err) {
                                }
                            }
                        }
                    }
                } catch (error) {
                } finally {
                    reader.releaseLock();
                }
            } else {
                // Handle regular audit
                const response = await fetch('/api/audit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ssid })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                // For regular audits, use EventSource
                const eventSource = new EventSource(`/api/audit/stream/${encodeURIComponent(ssid)}`);
                eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleStreamEvent(data, ssid, false);
                    } catch (err) {
                    }
                };

                eventSource.onerror = () => {
                    eventSource.close();
                    const status = this.networkAuditStatus.get(ssid);
                    // Don't clear persistent states
                    if (!status?.persistent) {
                        this.clearAuditStatus(ssid);
                    }
                };
            }
        } catch (error) {
            this.currentAudit = null;
            // Reset button to default state on error
            this.updateAllButtonsForNetwork(ssid, this.buttonStates.default);
            throw error;
        }
    }

    handleStreamEvent(data, ssid, isKarmaAudit) {
        const currentStatus = this.networkAuditStatus.get(ssid);
        const buttons = this.buttonRegistry.get(ssid);
        
        // Skip if we're already in a final state
        if (currentStatus?.status === 'complete' || currentStatus?.status === 'error') {
            return;
        }

        if (data.type === 'handshakeCaptured' || (data.type === 'output' && data.text?.includes('[DEBUG] Handshake captured:'))) {
            
            // Set handshake captured state
            this.networkAuditStatus.set(ssid, {
                ...currentStatus,
                status: 'handshakeCaptured',
                timestamp: Date.now()
            });
            
            // Update device state and UI
            this.updateHandshakeField(ssid);
            this.updateAllButtonsForNetwork(ssid, this.buttonStates.handshakeCaptured);
            
            // For karma audit, schedule transition to cracking
            if (isKarmaAudit) {
                setTimeout(() => {
                    const stateAtTimeout = this.networkAuditStatus.get(ssid);
                    if (stateAtTimeout?.status === 'handshakeCaptured') {
                        this.networkAuditStatus.set(ssid, {
                            ...stateAtTimeout,
                            status: 'cracking'
                        });
                        this.updateAllButtonsForNetwork(ssid, this.buttonStates.cracking);
                    }
                }, 1500);
            } else {
                this.updateAuditButton(ssid, 'handshakeCaptured');
            }
        } else if (data.type === 'output') {
            // Check for aircrack-ng success pattern
            if (data.text?.includes('[*] KEY FOUND!')) {
                const match = data.text.match(/\[\*\] KEY FOUND! \[(.+?)\]/);
                if (match && match[1]) {
                    const psk = match[1].trim();
                    
                    // For both karma and regular audits, update to complete state
                    this.networkAuditStatus.set(ssid, {
                        ...currentStatus,
                        status: 'complete',
                        psk: psk,
                        persistent: true
                    });
                    this.updateAllButtonsForNetwork(ssid, this.buttonStates.complete);
                    this.handlePSKFound(ssid, psk);
                    this.currentAudit = null;
                }
            }
            // Check for aircrack-ng failure pattern
            else if (data.text?.includes('KEY NOT FOUND') || data.text?.includes('Passphrase not in dictionary')) {
                this.networkAuditStatus.set(ssid, {
                    ...currentStatus,
                    status: 'error',
                    persistent: true
                });
                this.updateAllButtonsForNetwork(ssid, this.buttonStates.error);
                this.currentAudit = null;
            }
            // Check for general failure
            else if (data.text?.includes('Failed to crack handshake')) {
                this.networkAuditStatus.set(ssid, {
                    ...currentStatus,
                    status: 'error',
                    persistent: true
                });
                this.updateAllButtonsForNetwork(ssid, this.buttonStates.error);
                this.currentAudit = null;
            }
        } else if (data.type === 'psk') {
            this.handlePSKFound(ssid, data.psk);
        }
    }

    handlePSKFound(ssid, psk) {
        const existingStatus = this.networkAuditStatus.get(ssid);
        if (existingStatus?.status === 'error') {
            return;
        }

        const networks = window.networks || [];
        const network = networks.find(n => n.ssid.name === ssid);
        const isKarmaAudit = network?.ssid?.isKarmaMode;

        // Skip PSK handling for karma mode
        if (isKarmaAudit) {
            return;
        }

        if (network) {
            network.psk = psk;
            network.ssid.psk = psk;
            
            if (network.ssid.kismet_device_base_macaddr) {
                const ssidDevice = window.deviceRegistry.get(network.ssid.kismet_device_base_macaddr);
                if (ssidDevice) {
                    const updatedDevice = {
                        ...network.ssid,
                        psk: psk,
                        persistent: true,
                        isTransitioning: true
                    };
                    
                    window.deviceRegistry.set(network.ssid.kismet_device_base_macaddr, updatedDevice);
                    
                    document.dispatchEvent(new CustomEvent('deviceUpdated', {
                        detail: {
                            macAddress: network.ssid.kismet_device_base_macaddr,
                            data: updatedDevice,
                            isTransitioning: true,
                            persistent: true
                        }
                    }));
                }
            }
        }
        
        if (existingStatus?.status !== 'error') {
            this.networkAuditStatus.set(ssid, { 
                status: 'complete', 
                psk,
                persistent: true
            });
            this.updateAllButtonsForNetwork(ssid, this.buttonStates.complete);

            document.dispatchEvent(new CustomEvent('pskUpdated', {
                detail: {
                    ssid: ssid,
                    psk: psk
                }
            }));

            document.dispatchEvent(new CustomEvent('networksUpdated', {
                detail: { 
                    hasChanges: true,
                    persistent: true
                }
            }));
        }
    }

    clearAuditStatus(ssid) {
        if (!ssid) return;

        const status = this.networkAuditStatus.get(ssid);

        // Never clear persistent or karma audit states
        if (status?.persistent || status?.isKarmaAudit) {
            this.currentAudit = null;
            return;
        }

        // Clear only non-persistent, non-karma audit states
        if (status && !status.isKarmaAudit) {
            this.networkAuditStatus.delete(ssid);
            this.updateAllButtonsForNetwork(ssid, this.buttonStates.default);
        }
        this.currentAudit = null;
    }

    // Cleanup method to remove timeouts
    cleanup() {
        // Clear all karma state timeouts
        for (const timeoutId of this.karmaStateTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.karmaStateTimeouts.clear();
    }
}
