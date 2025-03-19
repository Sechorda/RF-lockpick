import { BaseDeviceLabel } from './base/base-device-label.js';
import { NetworkTemplates } from './templates/network-templates.js';
import { AuditService } from '../../services/security/audit-service.js';

/**
 * SSID Device Label component
 * Handles display and interaction for Wi-Fi Network devices
 */
export class SSIDDeviceLabel extends BaseDeviceLabel {
    constructor(data, parentElement) {
        super(data, parentElement);
        
        // Set initial label text and state
        const security = data.security?.split(' + ') || [];
        this.initialLabel = `${data.name || 'Hidden SSID'} (${security.join(' + ')})`;
        
        // Track previous state to avoid unnecessary updates
        this.previousState = {
            handshakeCaptured: data.handshakeCaptured,
            psk: data.psk,
            name: data.name,
            security: data.security,
            isKarmaMode: data.isKarmaMode
        };
        
        // Initialize audit service if not already done
        if (!window.auditService) {
            window.auditService = new AuditService();
        }

        // Parse cracked.txt and update PSKs
        this.updatePskFromCrackedFile();

        // Setup the label and audit handler
        this.setupLabel();
        this.setupAuditHandler();

        // Debounce networksUpdated handler
        this.debouncedNetworkUpdate = this.debounce(() => {
            if (this.data.kismet_device_base_type === "Wi-Fi Network") {
                this.updateContent();
            }
        }, 100);

        // Setup event listeners with debouncing
        document.addEventListener('networksUpdated', this.debouncedNetworkUpdate);

        // Listen for PSK updates with state check
        document.addEventListener('pskUpdated', (event) => {
            if (this.data.name === event.detail.ssid && this.data.psk !== event.detail.psk) {
                this.data.psk = event.detail.psk;
                this.previousState.psk = event.detail.psk;
                this.updatePSKContent();
            }
        });

        // Listen for handshake capture updates with state check
        document.addEventListener('deviceUpdated', (event) => {
            const matchesDevice = this.data.kismet_device_base_macaddr === event.detail.macAddress;
            const matchesSSID = this.data.name === event.detail.ssid;
            
            if (matchesDevice || matchesSSID) {
                const newHandshakeStatus = event.detail.handshakeCaptured !== undefined ? 
                    event.detail.handshakeCaptured : 
                    event.detail.data?.handshakeCaptured;
                
                if (newHandshakeStatus !== undefined && 
                    this.previousState.handshakeCaptured !== newHandshakeStatus) {
                    this.data.handshakeCaptured = newHandshakeStatus;
                    this.previousState.handshakeCaptured = newHandshakeStatus;
                    this.updateHandshakeStatus();
                }
            }
        });
    }

    updatePskFromCrackedFile() {
        fetch('/cracked.txt')
            .then(response => response.text())
            .then(content => {
                if (!content.trim()) return;
                
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
                this.updateContent();
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
        detailsPanel.innerHTML = NetworkTemplates.generateNetworkTemplate(this.data);

        // Cache elements for updates
        this.cachedElements = {
            basicLabel,
            manufacturerSpan,
            detailsPanel,
            pskValue: detailsPanel.querySelector('.psk-row:has(.detail-key:contains("PSK")) .psk-value'),
            handshakeStatus: detailsPanel.querySelector('.psk-row:has(.detail-key:contains("Handshake")) .handshake-value'),
            auditButton: detailsPanel.querySelector('.audit-button'),
            securityValue: detailsPanel.querySelector('.detail-value:has(:scope + .detail-key:contains("Security"))')
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

    setupAuditHandler() {
        const auditButton = this.element.querySelector('.audit-button');
        if (!auditButton || this.data.psk) return;

        // Check if this is a karma audit
        const isKarmaMode = this.element.getAttribute('data-karma') === 'true' || this.data.isKarmaMode === true;

        // Only register with network auditor if not in karma mode
        if (!isKarmaMode) {
            window.auditService.registerButton(this.data.name, auditButton);
        }

        const clickHandler = async (e) => {
            e.stopPropagation();
            
            if (!auditButton.classList.contains('running')) {
                try {
                    if (isKarmaMode) {
                        // Get client MACs for karma audit
                        let clientMacs = [];
                        
                        if (this.data.accessPoints?.[0]?.clients) {
                            clientMacs = this.data.accessPoints[0].clients.map(
                                client => client.mac || client.kismet_device_base_macaddr
                            );
                        } else if (window.probequestView && this.data.name) {
                            const ssidData = window.probequestView.probeRequests.get(this.data.name);
                            if (ssidData) {
                                clientMacs = Array.from(ssidData.values()).map(client => client.mac);
                            }
                        }

                        await window.auditService.startAudit(this.data.name, true, clientMacs);
                    } else {
                        // Normal network audit
                        await window.auditService.startAudit(this.data.name);
                    }
                } catch (error) {
                    console.error('Error starting audit:', error);
                    window.auditService.clearAuditStatus(this.data.name);
                }
            }
        };

        auditButton.addEventListener('click', clickHandler);

        // Store cleanup handler
        this._cleanupAuditHandler = () => {
            window.auditService?.unregisterButton(this.data.name, auditButton);
            auditButton.removeEventListener('click', clickHandler);
        };
    }
    
    // Utility method for debouncing
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Clean up event listeners
    cleanup() {
        document.removeEventListener('networksUpdated', this.debouncedNetworkUpdate);
        if (this._cleanupAuditHandler) {
            this._cleanupAuditHandler();
        }
    }

    updateHandshakeStatus() {
        if (!this.cachedElements.handshakeStatus) return;
        
        const wasExpanded = this.expanded;
        
        if (this.data.handshakeCaptured) {
            this.cachedElements.handshakeStatus.textContent = 'Captured ✓';
            this.cachedElements.handshakeStatus.style.color = 'var(--success-color)';
            this.cachedElements.handshakeStatus.classList.remove('empty');
        } else {
            this.cachedElements.handshakeStatus.textContent = 'Not Available';
            this.cachedElements.handshakeStatus.style.color = 'var(--error-color)';
            this.cachedElements.handshakeStatus.classList.add('empty');
        }

        // Preserve expanded state
        if (wasExpanded) {
            this.expanded = true;
            this.element.classList.add('expanded');
        }
    }

    // Separate method for updating PSK content
    updatePSKContent() {
        if (!this.cachedElements.pskValue) return;

        const wasExpanded = this.expanded;

        if (this.data.psk) {
            // Safely escape PSK for HTML and onclick attribute
            const escapedPsk = this.data.psk
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/'/g, "\\'")
                .replace(/"/g, '&quot;');

            // Update PSK display with copy icon
            this.cachedElements.pskValue.innerHTML = `${NetworkTemplates.generateCopyIcon()}${escapedPsk}`;
            this.cachedElements.pskValue.setAttribute('onclick', `navigator.clipboard.writeText('${escapedPsk}')`);
            this.cachedElements.pskValue.classList.remove('empty');

            // Trigger pskUpdated event to ensure consistency across components
            document.dispatchEvent(new CustomEvent('pskUpdated', {
                detail: {
                    ssid: this.data.name,
                    psk: this.data.psk
                }
            }));

            // Update network state
            if (window.networks) {
                const network = window.networks.find(n => n.ssid.name === this.data.name);
                if (network) {
                    network.psk = this.data.psk;
                    network.ssid.psk = this.data.psk;
                    
                    // Update device registry
                    if (network.ssid.kismet_device_base_macaddr && window.deviceRegistry) {
                        const device = window.deviceRegistry.get(network.ssid.kismet_device_base_macaddr);
                        if (device) {
                            window.deviceRegistry.set(network.ssid.kismet_device_base_macaddr, {
                                ...device,
                                psk: this.data.psk
                            });
                        }
                    }
                }
            }
        } else {
            this.cachedElements.pskValue.textContent = 'Not Available';
            this.cachedElements.pskValue.removeAttribute('onclick');
            this.cachedElements.pskValue.classList.add('empty');
        }

        // Preserve expanded state
        if (wasExpanded) {
            this.expanded = true;
            this.element.classList.add('expanded');
        }
    }

    updateContent() {
        const wasExpanded = this.expanded;
        let hasChanges = false;

        // Check and update network info
        if (this.cachedElements.manufacturerSpan) {
            const security = this.data.security?.split(' + ') || [];
            const displayText = `${this.data.name || 'Hidden SSID'} (${security.join(' + ')})`;
            
            if (this.cachedElements.manufacturerSpan.textContent !== displayText) {
                this.cachedElements.manufacturerSpan.textContent = displayText;
                hasChanges = true;
            }
        }

        // Check and update security value
        if (this.cachedElements.securityValue && 
            this.data.security !== this.previousState.security) {
            this.cachedElements.securityValue.textContent = this.data.security || 'None';
            this.previousState.security = this.data.security;
            hasChanges = true;
        }

        // Check and update PSK value
        if (this.data.psk !== this.previousState.psk) {
            this.updatePSKContent();
            this.previousState.psk = this.data.psk;
            hasChanges = true;
        }

        // Check and update handshake status
        if (this.data.handshakeCaptured !== this.previousState.handshakeCaptured) {
            this.updateHandshakeStatus();
            this.previousState.handshakeCaptured = this.data.handshakeCaptured;
            hasChanges = true;
        }

        // Handle audit button visibility
        if (this.data.psk !== this.previousState.psk) {
            if (this.data.psk) {
                if (this.cachedElements.auditButton && this.cachedElements.auditButton.parentNode) {
                    this.cachedElements.auditButton.parentNode.removeChild(this.cachedElements.auditButton);
                    this.cachedElements.auditButton = null;
                }
            } else if (!this.cachedElements.auditButton) {
                const button = document.createElement('button');
                button.className = 'audit-button';
                button.setAttribute('data-ssid', this.data.name);
                button.setAttribute('data-uuid', this.data.kismet_device_base_key);
                button.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Audit Network';
                this.cachedElements.detailsPanel.appendChild(button);
                this.cachedElements.auditButton = button;
                this.setupAuditHandler();
            }
            hasChanges = true;
        }

        // Only preserve expanded state if there were actual changes
        if (hasChanges && wasExpanded) {
            this.expanded = true;
            this.element.classList.add('expanded');
        }
    }
}
