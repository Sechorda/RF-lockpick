export class KarmaView {
    constructor(viewManager) {
        // Ensure required components are initialized
        if (!window.karmaAPManager || !window.karmaAPVisualizer) {
            console.error('KARMA AP components not initialized. KARMA AP functionality may be limited.');
        }
        
        this.container = document.getElementById('probequest-container');
        this.probeRequests = new Map(); // Store unique probe requests by MAC
        this.active = false;
        this.isVisualizingNetwork = false;
        this.hideClientInfo = false;
        this.selectedNetwork = null;
        this.selectedSSID = null;
        this.viewManager = viewManager;
        this.handshakeStatus = false;
        this.pollInterval = null;
        
        // Add state tracking for optimization
        this.previousState = {
            probeRequestsSize: 0,
            lastUpdate: 0
        };
        
        // Debounced update method
        this.debouncedUpdateView = this.debounce(this.updateView.bind(this), 100);
        
        this.setupKarmaToggle();
        this.setupAuditHandlers();
    }

    // Utility method for debouncing
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    setupAuditHandlers() {
        // Add click handler for network audit buttons
        document.addEventListener('click', async (event) => {
            // Try to find closest karma button
            const karmaBtn = event.target.closest('.karma-ap-button');
            
            // Handle KARMA AP button clicks
            if (karmaBtn && !karmaBtn.hasAttribute('data-band')) {
                event.stopPropagation(); // Prevent network blade click
                
                // Use the selected SSID from karma view
                const ssid = this.selectedSSID;
                if (!ssid) {
                    console.error('No SSID selected in karma view');
                    return;
                }

                // Show band selection buttons
                const bandButtons = karmaBtn.parentElement.querySelector('.band-selection-buttons');
                if (bandButtons) {
                    bandButtons.style.display = bandButtons.getAttribute('data-default-display') || 'flex';
                    return;
                }
            }

            // Handle band selection button clicks
            const bandBtn = event.target.closest('.karma-ap-button[data-band]');
            if (bandBtn) {
                event.stopPropagation(); // Prevent network blade click
                // Use the selected SSID from karma view
                const ssid = this.selectedSSID;
                if (!ssid) {
                    console.error('No SSID selected in karma view');
                    return;
                }

                // Get band from the button's data attribute
                const band = bandBtn.getAttribute('data-band');
                if (!band) {
                    console.error('No band found on button');
                    return;
                }

                try {
                    // Get interface from hostapd dropdown
                    const wifiInterfaceSelect = document.querySelector('.interface-dropdown[data-tool="hostapd"]');
                    const wifiInterface = wifiInterfaceSelect?.value;
                    if (!wifiInterface) {
                        throw new Error('No WiFi interface selected');
                    }

                    // Use KarmaAPManager to create KARMA AP
                    if (!window.karmaAPManager) {
                        console.error('KarmaAPManager not initialized');
                        return;
                    }

                    // Get the button for karma ap manager
                    const mainButton = bandBtn.closest('.karma-ap-container').querySelector('.karma-ap-button:not([data-band])');
                    if (!mainButton) {
                        console.error('Could not find main KARMA AP button');
                        return;
                    }

                    // Hide band selection buttons
                    const bandButtons = bandBtn.closest('.band-selection-buttons');
                    if (bandButtons) {
                        bandButtons.style.display = 'none';
                    }

                    // Add karma-ap-container class to enable karma mode detection
                    const container = mainButton.closest('.karma-ap-container') || mainButton.parentElement;
                    container.classList.add('karma-ap-container');

                    // Update icon and text for karma AP
                    mainButton.innerHTML = '<i class="fa-solid fa-wifi spinning"></i> Creating KARMA-AP...';
                    mainButton.classList.add('creating');

                    // Disable the button and maintain consistent styling
                    mainButton.disabled = true;
                    mainButton.style.pointerEvents = 'none';

                    // Keep band buttons visible but disabled during creation
                    bandButtons.querySelectorAll('button').forEach(btn => {
                        btn.disabled = true;
                        btn.style.opacity = '0.5';
                    });

                    // Let KarmaAPManager handle setup
                    window.karmaAPManager.setupButton(
                        mainButton,
                        ssid,
                        wifiInterface,
                        'eth0', // wanInterface
                        band    // band
                    );

                    // Watch for stop button addition and add listener
                    const checkForStop = setInterval(() => {
                        const stopButton = mainButton.nextElementSibling;
                        if (stopButton && stopButton.classList.contains('stop-button')) {
                            clearInterval(checkForStop);
                            stopButton.addEventListener('click', () => {
                                // Mark AP as offline when stopped
                                if (this.selectedNetwork && this.selectedNetwork.ssid.name === ssid) {
                                    this.selectedNetwork.accessPoints[0].isOffline = true;
                                    this.selectedNetwork.accessPoints[0].useRedModel = false;
                                    this.selectedNetwork.accessPoints[0].manufacturer = "KARMA-AP (Offline)";
                                    
                                    // Clear localStorage state
                                    const storageKey = `karmaAPState_${ssid}`;
                                    localStorage.removeItem(storageKey);

                                    // Force UI update
                                    this.visualizeKarmaNetwork(ssid, this.selectedNetwork);

                                    // Notify other components
                                    document.dispatchEvent(new CustomEvent('deviceUpdated', {
                                        detail: {
                                            ssid: ssid,
                                            handshakeCaptured: false,
                                            karmaAP: {
                                                isOffline: true,
                                                useRedModel: false
                                            }
                                        }
                                    }));
                                }
                            });
                        }
                    }, 100);
                } catch (error) {
                    console.error('Failed to start KARMA AP:', error);
                }
                return;
            }

            // Handle original audit button clicks
            const auditBtn = event.target.closest('.audit-button');
            if (!auditBtn) return;

            const ssid = auditBtn.getAttribute('data-ssid');
            if (!ssid) return;

            try {
                // Get interface from hostapd dropdown
                const wifiInterfaceSelect = document.querySelector('.interface-dropdown[data-tool="hostapd"]');
                const wifiInterface = wifiInterfaceSelect?.value;
                if (!wifiInterface) {
                    throw new Error('No WiFi interface selected');
                }

                // Use KarmaAPManager to create KARMA AP
                if (!window.karmaAPManager) {
                    console.error('KarmaAPManager not initialized');
                    return;
                }

                // Create and setup the KARMA AP
                const karmaBtn = window.karmaAPManager.createButton();
                const container = auditBtn.closest('.karma-ap-container') || auditBtn.parentElement;
                container.classList.add('karma-ap-container');
                container.insertBefore(karmaBtn, auditBtn.nextSibling);

                // Let KarmaAPManager handle setup with the new button
                window.karmaAPManager.setupButton(
                    karmaBtn,
                    ssid,
                    wifiInterface,
                    'eth0',  // wanInterface
                    '2.4GHz' // band
                );
            } catch (error) {
                console.error('Failed to start karma AP:', error);
            }
        });
    }

    setupKarmaToggle() {
        const karmaToggle = document.getElementById('karma-toggle');
        const hideEmptyToggle = document.getElementById('hide-empty-toggle');
        
        karmaToggle.addEventListener('click', () => {
            this.toggleKarmaMode();
        });
        
        hideEmptyToggle.addEventListener('click', () => {
            this.hideClientInfo = !this.hideClientInfo;
            hideEmptyToggle.classList.toggle('active');
            this.debouncedUpdateView();
        });
    }

    toggleKarmaMode() {
        this.active = !this.active;
        
        if (this.active) {
            // First, set up karma mode
            if (this.viewManager.wifiView) {
                this.viewManager.wifiView.currentNetwork = null;
                this.viewManager.wifiView.karmaMode = this.active;
            }

            // Clear any existing network state
            const visualizer = this.viewManager.getNetworkVisualizer();
            if (visualizer) {
                visualizer.clearScene(false);
                if (visualizer.nodes && typeof visualizer.nodes.clear === 'function') {
                    visualizer.nodes.clear();
                }
                if (visualizer.connections) {
                    visualizer.connections.length = 0;
                }
            }
            
            // Switch to panel view first
            this.viewManager.showPanelView();
            
            // Hide blade container but ensure canvas container is visible
            document.getElementById('blade-container').style.display = 'none';
            document.getElementById('canvas-container').style.display = 'block';
            document.getElementById('canvas-container').style.opacity = '1';
            
            requestAnimationFrame(() => {
                // Force container to be visible and ensure it's a block element
                this.container.style.cssText = 'display: block !important; visibility: visible !important; position: fixed !important;';
            });
            
            // Initialize table structure if it doesn't exist
            if (!this.container.querySelector('.probe-request-table')) {
                this.container.innerHTML = `
                    <table class="probe-request-table">
                        <thead>
                            <tr>
                                <th>SSID</th>
                                <th>MAC Address</th>
                                <th>Vendor</th>
                                <th>Last Seen</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>`;
            }
            
            // Show loading state immediately
            const tbody = this.container.querySelector('.probe-request-table tbody');
            tbody.innerHTML = `
                <tr class="loading">
                    <td colspan="4" style="text-align: center;">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">Scanning for nearby devices...</div>
                    </td>
                </tr>`;
            
            // Initialize karma functionality
            this.initializeEventSource();
            this.startHandshakePolling();
        } else {
            // Clean up karma mode
            if (this.viewManager.wifiView) {
                this.viewManager.wifiView.karmaMode = false;
            }
            
            this.hide();
            if (this.eventSource) {
                this.eventSource.close();
            }
            this.stopHandshakePolling();

            // Show wifi view
            document.getElementById('blade-container').style.display = 'block';
            if (this.viewManager.wifiView) {
                this.viewManager.wifiView.createPanelView(this.viewManager.wifiView.networks || []);
            }
        }

        // Update button state based on active state
        const button = document.getElementById('karma-toggle');
        if (this.active) {
            button.classList.add('active');
            button.style.background = 'rgba(0, 102, 255, 0.25)';
            button.style.borderColor = 'rgba(0, 102, 255, 0.5)';
            button.style.boxShadow = 'inset 0 2px 4px rgba(0, 102, 255, 0.1)';
        } else {
            button.classList.remove('active');
            button.style.background = '';
            button.style.borderColor = '';
            button.style.boxShadow = '';
        }
    }

    async initializeEventSource() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        try {
            const response = await fetch('/api/probe-monitor/stream');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const reader = response.body.getReader();
            let buffer = '';

            while (true) {
                const {value, done} = await reader.read();
                if (done) break;

                buffer += new TextDecoder().decode(value);
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            await this.updateProbeRequest({
                                ssid: data.ssid,
                                mac: data.mac, 
                                vendor: data.vendor,
                                timestamp: data.timestamp
                            });
                        } catch (err) {
                            console.error('Failed to parse probe request data:', err);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Probe monitor stream error:', error);
            if (this.active) {
                setTimeout(() => this.initializeEventSource(), 5000);
            }
        }
    }

    async updateProbeRequest(data) {
        if (!this.active) return;
        
        // Skip "Broadcast" SSID probe requests
        if (data.ssid === "Broadcast") return;

        const ssidData = this.probeRequests.get(data.ssid) || new Map();
        const existingDevice = ssidData.get(data.mac);
        
        // Only update if data has changed
        if (!existingDevice || 
            existingDevice.vendor !== data.vendor || 
            existingDevice.lastSeen < new Date(data.timestamp)) {
            
            ssidData.set(data.mac, {
                mac: data.mac,
                vendor: data.vendor,
                lastSeen: Date.now(), // Store current timestamp instead of parsing
                count: ((existingDevice?.count || 0) + 1)
            });

            this.probeRequests.set(data.ssid, ssidData);
            this.debouncedUpdateView();
        }
    }

    updateView() {
        if (!this.active) return;

        // Skip update if no changes within debounce window
        const currentTime = Date.now();
        if (currentTime - this.previousState.lastUpdate < 100 && 
            this.probeRequests.size === this.previousState.probeRequestsSize) {
            return;
        }

        // Update state tracking
        this.previousState.lastUpdate = currentTime;
        this.previousState.probeRequestsSize = this.probeRequests.size;

        // Get existing table and tbody
        const table = this.container.querySelector('.probe-request-table');
        if (!table) return; // Table should always exist at this point
        const tbody = table.querySelector('tbody');

        // Show loading state if no probe requests
        if (this.probeRequests.size === 0) {
            tbody.innerHTML = `
                <tr class="loading">
                    <td colspan="4" style="text-align: center;">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">Scanning for nearby devices...</div>
                    </td>
                </tr>`;
            return;
        }

        // Process probe requests
        const rows = [];
        this.probeRequests.forEach((deviceMap, ssid) => {
            deviceMap.forEach(device => {
                rows.push(`
                    <tr data-ssid="${ssid || ''}" onclick="window.probequestView.visualizeKarmaNetwork('${ssid}')">
                        <td>${ssid || 'Unknown Network'}</td>
                        <td>${device.mac}</td>
                        <td>${typeof device.vendor === 'string' && device.vendor.includes('manuf_long=') ? 
                            device.vendor.match(/manuf_long='([^']*)'/)?.[1] || 'Unknown' : 
                            (device.vendor || 'Unknown')}</td>
                        <td>${Math.round((Date.now() - device.lastSeen) / 60000) === 0 ? 'just now' : `${Math.round((Date.now() - device.lastSeen) / 60000)} mins ago`}</td>
                    </tr>`);
            });
        });

        tbody.innerHTML = rows.join('');
    }

    show() {
        // Ensure blade container is hidden before showing karma view
        document.getElementById('blade-container').style.display = 'none';
        
        // Ensure canvas container is visible for background
        document.getElementById('canvas-container').style.display = 'block';
        document.getElementById('canvas-container').style.opacity = '1';
        
        // Show karma container with important flags to ensure visibility
        this.container.style.cssText = 'display: block !important; visibility: visible !important; position: fixed !important;';
        
        if (this.isVisualizingNetwork) {
            this.viewManager.showCanvasView();
            if (this.selectedNetwork && this.selectedSSID) {
                this.visualizeKarmaNetwork(this.selectedSSID, this.selectedNetwork);
            }
        } else {
            this.viewManager.showPanelView();
            this.debouncedUpdateView();
        }
    }

    hide() {
        const wasVisualizingNetwork = this.isVisualizingNetwork;
        this.isVisualizingNetwork = false;
        this.container.style.display = 'none';
        
        if (wasVisualizingNetwork) {
            this.stopHandshakePolling();
            
            const visualizer = this.viewManager.getNetworkVisualizer();
            if (visualizer) {
                visualizer.clearScene();
                if (visualizer.nodes && typeof visualizer.nodes.clear === 'function') {
                    visualizer.nodes.clear();
                }
                if (visualizer.connections) {
                    visualizer.connections.length = 0;
                }
            }
            
            if (this.viewManager.wifiView) {
                this.viewManager.wifiView.currentNetwork = null;
            }
        }
        
        // Show blade container for wifi view
        document.getElementById('blade-container').style.display = 'block';
    }

    async visualizeKarmaNetwork(ssid, existingNetwork = null) {
        try {
            const networkData = existingNetwork || await this.formatNetworkData(ssid);
            if (!networkData) return;

            this.selectedNetwork = networkData;
            this.selectedSSID = ssid;
            this.container.style.display = 'none';
            document.getElementById('blade-container').style.display = 'none';
            this.isVisualizingNetwork = true;
            this.viewManager.showCanvasView();
            this.startHandshakePolling();
            
            setTimeout(() => {
                const visualizer = this.viewManager.getNetworkVisualizer();
                if (visualizer) {
                    visualizer.clearScene(false);
                    if (visualizer.nodes && typeof visualizer.nodes.clear === 'function') {
                        visualizer.nodes.clear();
                    }
                    if (this.viewManager.wifiView) {
                        this.viewManager.wifiView.currentNetwork = null;
                        this.viewManager.wifiView.karmaMode = true;
                    }
                    const nodes = visualizer.getNodes().nodes;
                    if (nodes && typeof nodes.clear === 'function') {
                        nodes.clear();
                    }

                    visualizer.visualizeNetwork(networkData);
                }
            }, 100);
        } catch (error) {
            console.error('Error visualizing karma network:', error);
        }
    }

    async formatNetworkData(ssid) {
        const ssidData = this.probeRequests.get(ssid);
        if (!ssidData) return null;

        try {
            const response = await fetch(`/api/check-file?path=*${ssid}.pcap`);
            const { exists } = await response.json();

            // Don't hardcode PSK - always use null/undefined to ensure proper template behavior
            const psk = undefined;

            return {
                ssid: {
                    name: ssid,
                    kismet_device_base_macaddr: ssid,
                    kismet_device_base_type: "Wi-Fi Network",
                    isKarmaMode: true,
                    handshakeCaptured: exists,
                    psk: psk
                },
                accessPoints: [{
                    // Use unique MAC format for KARMA APs to avoid triggering evil twin positioning
                    kismet_device_base_macaddr: 'CA:FE:KA:RM:00:01',
                    kismet_device_base_type: "Wi-Fi AP",
                    isKarmaMode: true,
                    isKarmaAP: true,
                    isOffline: !exists,
                    useRedModel: exists,
                    handshakeCaptured: exists,
                    fixedPosition: true,
                    kismet_device_base_manufacturer: "KARMA-AP",
                    manufacturer: exists ? "KARMA-AP" : "KARMA-AP (Offline)",
                    clients: Array.from(ssidData.values()).map(client => ({
                        ...client,
                        kismet_device_base_type: "Wi-Fi Client",
                        kismet_device_base_macaddr: client.mac,
                        kismet_device_base_manufacturer: typeof client.vendor === 'string' && client.vendor.includes('manuf_long=') ? 
                            client.vendor.match(/manuf_long='([^']*)'/)?.[1] || 'Unknown' : 
                            (client.vendor || 'Unknown'),
                        manufacturer: typeof client.vendor === 'string' && client.vendor.includes('manuf_long=') ? 
                            client.vendor.match(/manuf_long='([^']*)'/)?.[1] || 'Unknown' : 
                            (client.vendor || 'Unknown'),
                        isKarmaMode: true
                    }))
                }]
            };
        } catch (error) {
            console.error(`Error checking pcap for ${ssid}:`, error);
            return null;
        }
    }

    toggleVisualization(showVisualization) {
        if (showVisualization && this.selectedNetwork && this.selectedSSID) {
            this.isVisualizingNetwork = true;
            this.container.style.display = 'none';
            document.getElementById('blade-container').style.display = 'none';
            this.viewManager.showCanvasView();
            
            const visualizer = this.viewManager.getNetworkVisualizer();
            if (visualizer) {
                visualizer.clearScene(false);
                if (visualizer.nodes && typeof visualizer.nodes.clear === 'function') {
                    visualizer.nodes.clear();
                }
                
                // Increased delay to ensure proper cleanup
                setTimeout(() => {
                    if (visualizer.connections) {
                        visualizer.connections.length = 0;
                    }
                    visualizer.visualizeNetwork(this.selectedNetwork);
                }, 250);
            }
        } else {
            this.isVisualizingNetwork = false;
            
            // Clear visualization
            const visualizer = this.viewManager.getNetworkVisualizer();
            if (visualizer) {
                visualizer.clearScene();
                if (visualizer.nodes && typeof visualizer.nodes.clear === 'function') {
                    visualizer.nodes.clear();
                }
                if (visualizer.connections) {
                    visualizer.connections.length = 0;
                }
            }
            
            // Switch to panel view
            this.viewManager.showPanelView();
            
            // Show karma container while keeping canvas visible for background
            requestAnimationFrame(() => {
                this.container.style.cssText = 'display: block !important; visibility: visible !important;';
                document.getElementById('blade-container').style.display = 'none';
                document.getElementById('canvas-container').style.display = 'block';
                document.getElementById('canvas-container').style.opacity = '1';
                this.debouncedUpdateView();
            });
        }
    }

    startHandshakePolling() {
        this.stopHandshakePolling();
        
        if (!this.isVisualizingNetwork || !this.selectedSSID) {
            return;
        }

        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/check-file?path=*${this.selectedSSID}.pcap`);
                const { exists } = await response.json();
                
                // Check if state changed
                if (this.selectedNetwork && exists !== this.selectedNetwork.ssid.handshakeCaptured) {
                    this.selectedNetwork.ssid.handshakeCaptured = exists;
                    
                    // Update AP state
                    if (this.selectedNetwork.accessPoints && this.selectedNetwork.accessPoints[0]) {
                        const ap = this.selectedNetwork.accessPoints[0];
                        ap.isOffline = !exists;
                        ap.useRedModel = exists;
                        ap.manufacturer = exists ? "KARMA-AP" : "KARMA-AP (Offline)";
                        
                        // Update localStorage state for persistence
                        const storageKey = `karmaAPState_${this.selectedSSID}`;
                        const storageState = exists ? {
                            isRunning: true,
                            targetMac: ap.kismet_device_base_macaddr,
                            wifiInterface: ap.wifiInterface,
                            band: ap.band,
                            psk: 'NONE',
                            isKarmaMode: true
                        } : null;
                        
                        if (storageState) {
                            localStorage.setItem(storageKey, JSON.stringify(storageState));
                        } else {
                            localStorage.removeItem(storageKey);
                        }

                        // Update node appearance using KarmaAPVisualizer
                        const visualizer = this.viewManager.getNetworkVisualizer();
                        if (visualizer) {
                            const node = visualizer.getNodes().get(ap.kismet_device_base_macaddr);
                            if (node && window.karmaAPVisualizer) {
                                window.karmaAPVisualizer.updateNodeMaterials(node, !exists);
                            }
                        }

                        // Trigger UI update
                        this.visualizeKarmaNetwork(this.selectedSSID, this.selectedNetwork);

                        // Notify components
                        document.dispatchEvent(new CustomEvent('deviceUpdated', {
                            detail: {
                                ssid: this.selectedSSID,
                                handshakeCaptured: exists,
                                karmaAP: {
                                    isOffline: !exists,
                                    useRedModel: exists
                                }
                            }
                        }));
                    }
                }
            } catch (error) {
                console.error('Error polling for handshake:', error);
            }
        }, 2000);
    }

    stopHandshakePolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    cleanup() {
        if (this.eventSource) {
            this.eventSource.close();
        }
        this.stopHandshakePolling();
        this.probeRequests.clear();
        this.active = false;
        this.isVisualizingNetwork = false;
        this.selectedNetwork = null;
        this.selectedSSID = null;
        
        // Reset state tracking
        this.previousState = {
            probeRequestsSize: 0,
            lastUpdate: 0
        };
        
        // Stop the tcpdump process when cleaning up
        fetch('/api/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                command: 'sudo pkill -f "tcpdump.*type mgt subtype probe-req"'
            })
        }).catch(console.error);
        
        // Cleanup KARMA AP materials
        if (window.karmaAPVisualizer) {
            const visualizer = this.viewManager.getNetworkVisualizer();
            if (visualizer) {
                const nodeIds = Array.from(visualizer.getNodes()?.keys() || []);
                nodeIds.forEach(nodeId => window.karmaAPVisualizer.cleanupNodeMaterials(nodeId));
            }
        }
        
        // Ensure probe request container is hidden and reset
        if (this.container) {
            this.container.style.display = 'none';
            this.container.innerHTML = `
                <table class="probe-request-table">
                    <thead>
                        <tr>
                            <th>SSID</th>
                            <th>MAC Address</th>
                            <th>Vendor</th>
                            <th>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="loading">
                            <td colspan="4" style="text-align: center;">
                                <div class="loading-spinner"></div>
                                <div class="loading-text">Scanning for nearby devices...</div>
                            </td>
                        </tr>
                    </tbody>
                </table>`;
        }
    }
}

export default KarmaView;
