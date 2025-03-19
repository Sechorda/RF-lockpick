import { VulnerabilityScanner } from '../services/security/BT_vuln_scan.js';

export class BluetoothView {
    constructor(viewManager) {
        this.vulnerabilityScanner = new VulnerabilityScanner();
        this.container = document.getElementById('blade-container');
        this.canvasContainer = document.getElementById('canvas-container');
        this.devices = new Map(); // Track unique devices by address
        this.reconResults = new Map(); // Track recon results by device address
        this.viewManager = viewManager;
        this.isScanning = false;

        // Ensure canvas container is properly configured
        this.canvasContainer.style.display = 'block';
        this.canvasContainer.style.opacity = '1';

        // Create refresh button
        this.refreshButton = document.createElement('button');
        this.refreshButton.id = 'bluetooth-refresh';
        this.refreshButton.className = 'refresh-button control-button';
        this.refreshButton.innerHTML = '<i class="fa-solid fa-rotate"></i>';
        this.refreshButton.addEventListener('click', () => this.updateDevices());
        this.refreshButton.style.display = 'none';

        document.getElementById('controls').appendChild(this.refreshButton);

        // Start initial scan when constructed
        this.updateDevices();
    }

    async updateDevices() {
        if (this.isScanning) return;

        this.isScanning = true;
        this.showLoading();

        try {
            const response = await fetch('http://localhost:8080/api/bluetooth');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const responseText = await response.text();
            let devices;
            try {
                devices = JSON.parse(responseText);

                // Validate API response structure
                if (!Array.isArray(devices)) {
                    throw new Error('API response is not an array of devices');
                }

            } catch (e) {
                throw new Error('Invalid JSON response from API');
            }

            // Filter and store only devices with valid addresses
            const validDevices = devices.filter(device => device?.address);

            // Clear and update devices map
            this.devices.clear();
            validDevices.forEach(device => {
                this.devices.set(device.address, device);
            });

            // Check if the current view is 'bluetooth' before updating the view
            if (this.viewManager.getCurrentView() === 'bluetooth') {
                this.createView(validDevices);
            }
        } catch (error) {
            this.showError('Failed to fetch Bluetooth devices');
        } finally {
            this.isScanning = false;
        }
    }

    showError(message) {
        this.container.innerHTML = `
            <div class="network-blade error">
                <div class="title">Error</div>
                <div class="details">${message}</div>
            </div>
        `;
    }

    showLoading() {
        this.container.innerHTML = `
            <div class="network-blade loading">
                <div class="loading-spinner"></div>
                <div class="loading-text">Scanning for Bluetooth devices...</div>
            </div>
        `;
    }

    createHeaderElement() {
        const headerWrapper = document.createElement('div');
        headerWrapper.className = 'network-header-wrapper';
        
        const header = document.createElement('div');
        header.className = 'network-header';
        header.innerHTML = `
            <div>Device Name</div>
            <div>Type</div>
            <div>Status</div>
            <div>Details</div>
        `;
        
        headerWrapper.appendChild(header);
        return headerWrapper;
    }

    createView(devices) {
        if (!Array.isArray(devices) || devices.length === 0) {
            const headerElement = this.createHeaderElement();
            this.container.innerHTML = '';
            this.container.appendChild(headerElement);
            
            const bladeContainer = document.createElement('div');
            bladeContainer.className = 'network-blade-container';
            
            const noDevicesBlade = document.createElement('div');
            noDevicesBlade.className = 'network-blade no-networks';
            noDevicesBlade.textContent = 'No Bluetooth devices found';
            
            bladeContainer.appendChild(noDevicesBlade);
            this.container.appendChild(bladeContainer);
            return;
        }

        // Reset container and add header
        this.container.innerHTML = '';
        this.container.appendChild(this.createHeaderElement());
        
        // Create blade container
        const bladeContainer = document.createElement('div');
        bladeContainer.className = 'network-blade-container';
        this.container.appendChild(bladeContainer);

        // Process and sort devices
        const sortedDevices = [...devices].sort((a, b) => {
            const aName = a?.name || 'Unknown Device';
            const bName = b?.name || 'Unknown Device';
            return aName.localeCompare(bName);
        });

        // Add device blades
        sortedDevices.forEach(device => {
            const deviceType = device?.type === 'LE' ? 'BTLE' : 'BR/EDR';
            const status = device?.type === 'LE' ? 
                (device?.connectable ? 'Connectable' : 'Not Connectable') : 
                (device?.pageScanMode ? 'Available' : 'Not Available');
            const signalStrength = typeof device?.rssi === 'number' ? 
                `${device.rssi} dBm` : 'N/A';

            const blade = document.createElement('div');
            blade.className = 'network-blade';
            blade.innerHTML = `
                <div class="network-cell-container">
                    <div class="network-cell">${device?.name || 'Unknown Device'}</div>
                    <div class="network-cell">${deviceType}</div>
                    <div class="network-cell">${status}</div>
                    <div class="network-cell">${signalStrength}</div>
                </div>
                <div class="details-panel">
                    <div class="button-container">
                        <button class="recon-button">
                            <i class="fa-solid fa-magnifying-glass"></i>
                            <span class="button-text">Run Recon</span>
                        </button>
                        <div class="button-divider"></div>
                        <button class="${this.vulnerabilityScanner.getButtonClass(device)}">
                            <i class="fa-solid fa-shield-halved"></i>
                            <span class="button-text">${this.vulnerabilityScanner.getButtonText(device)}</span>
                        </button>
                    </div>
                    
                    <div class="detail-grid">
                        <div class="detail-section">
                            <h4>Device Information</h4>
                            <div class="detail-item">
                                <span class="label">Address</span>
                                <span class="value">${device?.address || 'Unknown'}</span>
                            </div>
                            ${deviceType === 'BTLE' ? `
                                <div class="detail-item">
                                    <span class="label">Address Type</span>
                                    <span class="value">${device?.addressType || 'Unknown'}</span>
                                </div>
                                ${typeof device?.txPower === 'number' ? `
                                <div class="detail-item">
                                    <span class="label">Tx Power</span>
                                    <span class="value">${device.txPower} dBm</span>
                                </div>
                                ` : ''}
                                ${typeof device?.pathLoss === 'number' ? `
                                <div class="detail-item">
                                    <span class="label">Path Loss</span>
                                    <span class="value">${device.pathLoss} dBm</span>
                                </div>
                                ` : ''}
                            ` : `
                                <div class="detail-item">
                                    <span class="label">Page Scan Mode</span>
                                    <span class="value">${device?.pageScanMode || 'Unknown'}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="label">Clock Offset</span>
                                    <span class="value">${device?.clockOffset || 'Unknown'}</span>
                                </div>
                                ${device?.class ? `
                                <div class="detail-item">
                                    <span class="label">Device Class</span>
                                    <span class="value">${device.class.device_class || device.class.raw}</span>
                                </div>
                                ` : ''}
                            `}
                        </div>

                        ${Array.isArray(device?.flags) && device.flags.length > 0 ? `
                        <div class="detail-section">
                            <h4>Capabilities</h4>
                            <ul class="detail-list">
                                ${device.flags.map(flag => `<li>${flag || 'Unknown'}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        ${(Array.isArray(device?.services) && device.services.length > 0) ? `
                        <div class="detail-section">
                            <h4>Services</h4>
                            <ul class="detail-list">
                                ${device.services.map(service => `<li>${service}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        ${Array.isArray(device?.manufacturerData) && device.manufacturerData.length > 0 ? `
                        <div class="detail-section">
                            <h4>Manufacturer Data</h4>
                            ${device.manufacturerData.map(data => `
                                <div class="detail-item">
                                    <span class="label">Company</span>
                                    <span class="value">${data.company || data.companyId}</span>
                                </div>
                                <div class="detail-item">
                                    <span class="label">Data</span>
                                    <span class="value">${data.data}</span>
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}
                    </div>

                    <div class="recon-results" style="display: none;">
                        <div class="detail-section">
                            <h4>Recon Results</h4>
                            <div class="recon-data minimized"></div>
                            <button class="expand-recon">Show More</button>
                        </div>
                    </div>
                </div>
            `;

            // Add click handlers
            blade.addEventListener('click', (e) => {
                // Handle button clicks
                if (e.target.closest('.vuln-scan-button')) {
                    e.stopPropagation(); // Prevent blade toggle
                    this.handleVulnerabilityScan(device, e.target.closest('.vuln-scan-button'));
                    return;
                }
                if (e.target.closest('.recon-button')) {
                    e.stopPropagation(); // Prevent blade toggle
                    this.handleRecon(device, e.target.closest('.recon-button'));
                    return;
                }
                // Don't handle clicks inside the details panel
                if (e.target.closest('.details-panel')) {
                    return;
                }

                // Close any other expanded blades
                const expandedBlades = this.container.querySelectorAll('.network-blade.expanded');
                expandedBlades.forEach(expandedBlade => {
                    if (expandedBlade !== blade) {
                        expandedBlade.classList.remove('expanded');
                    }
                });

                // Toggle current blade
                const wasExpanded = blade.classList.contains('expanded');
                blade.classList.toggle('expanded');

                // Check for recon files when expanding
                if (!wasExpanded) {
                    const reconButton = blade.querySelector('.recon-button');
                    this.checkReconFiles(device).then(reconResults => {
                        if (reconResults) {
                            this.displayReconResults(device, blade, reconResults);
                            if (reconButton) reconButton.style.display = 'none';
                        } else {
                            if (reconButton) reconButton.style.display = 'inline-flex';
                        }
                    });

                    // Ensure the clicked blade is visible
                    blade.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });

            bladeContainer.appendChild(blade);
        });
    }

    async handleVulnerabilityScan(device, button) {
        if (this.vulnerabilityScanner.isDeviceBeingScanned(device)) {
            return;
        }

        const buttonText = button.querySelector('.button-text');
        let reportSection = button.parentElement.querySelector('.vulnerability-report');
        if (!reportSection) {
            reportSection = document.createElement('div');
            reportSection.className = 'detail-section vulnerability-report';
            button.parentElement.appendChild(reportSection);
        }

        try {
            const updateInterval = setInterval(() => {
                button.className = this.vulnerabilityScanner.getButtonClass(device);
                buttonText.textContent = this.vulnerabilityScanner.getButtonText(device);
            }, 100);

            const result = await this.vulnerabilityScanner.startScan(device);
            clearInterval(updateInterval);

            reportSection.innerHTML = `
                <h4>Vulnerability Report</h4>
                <div class="detail-item">
                    <span class="label">Exploits Tested</span>
                    <span class="value">${result.stats.tested}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Skipped Tests</span>
                    <span class="value">${result.stats.skipped}</span>
                </div>
                <div class="detail-item">
                    <span class="label">Vulnerabilities Found</span>
                    <span class="value">${result.stats.vulnerable}</span>
                </div>
                ${result.vulnerabilities.length > 0 ? `
                    <div class="detail-subsection">
                        <h5>Detected Vulnerabilities</h5>
                        ${result.vulnerabilities.map(vuln => `
                            <div class="detail-item vulnerability">
                                <span class="label">${vuln.name}</span>
                                <span class="value">${vuln.description}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="detail-item">
                    <span class="label">Scan Time</span>
                    <span class="value">${new Date(result.timestamp).toLocaleString()}</span>
                </div>
            `;
        } catch (error) {
            reportSection.innerHTML = `
                <h4>Vulnerability Report</h4>
                <div class="detail-item error">
                    <span class="value">Scan failed: ${error.message}</span>
                </div>
            `;
        } finally {
            button.className = this.vulnerabilityScanner.getButtonClass(device);
            buttonText.textContent = this.vulnerabilityScanner.getButtonText(device);
        }
    }

    async handleRecon(device, button) {
        const buttonText = button.querySelector('.button-text');
        const originalText = buttonText.textContent;
        button.disabled = true;
        buttonText.textContent = 'Running...';

        try {
            const response = await fetch('http://localhost:8080/api/bluetooth/recon', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ address: device.address }),
            });

            if (!response.ok) throw new Error('Failed to run recon');

            const result = await response.json();
            this.displayReconResults(device, button.closest('.network-blade'), result);
            button.style.display = 'none';
        } catch (error) {
            console.error('Recon failed:', error);
            button.disabled = false;
            buttonText.textContent = originalText;
        }
    }

    displayReconResults(device, blade, results) {
        const resultsContainer = blade.querySelector('.recon-results');
        const dataContainer = resultsContainer.querySelector('.recon-data');
        const expandButton = resultsContainer.querySelector('.expand-recon');
        
        dataContainer.innerHTML = `
            <div class="recon-data-container">
                ${Object.entries(results).map(([key, value]) => `
                    <div class="recon-item">
                        <h5>${key}</h5>
                        <pre>${value}</pre>
                    </div>
                `).join('')}
            </div>
        `;

        expandButton.addEventListener('click', () => {
            dataContainer.classList.toggle('minimized');
            expandButton.textContent = dataContainer.classList.contains('minimized') ? 'Show More' : 'Show Less';
        });

        resultsContainer.style.display = 'block';
    }

    async checkReconFiles(device) {
        try {
            const response = await fetch(`http://localhost:8080/api/bluetooth/recon/${device.address}`);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Failed to check recon files:', error);
            return null;
        }
    }

    show() {
        // Show refresh button and initialize content
        this.refreshButton.style.display = 'flex';
        
        if (this.isScanning) {
            this.showLoading();
        } else if (this.devices.size > 0) {
            this.createView(Array.from(this.devices.values()));
        } else {
            this.updateDevices();
        }
    }

    hide() {
        // Just hide refresh button and remove view class
        this.refreshButton.style.display = 'none';
        this.container.classList.remove('bluetooth-view');
    }
}
