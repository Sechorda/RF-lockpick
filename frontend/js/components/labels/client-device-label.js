import { BaseDeviceLabel } from './base/base-device-label.js';
import { ClientTemplates } from './templates/client-templates.js';

/**
 * Client Device Label component
 * Handles display and interaction for Wi-Fi Client devices
 */
export class ClientDeviceLabel extends BaseDeviceLabel {
    constructor(data, parentElement) {
        super(data, parentElement);
        
        // Set initial label text based on karma mode
        if (this.element.getAttribute('data-karma') === 'true') {
            this.initialLabel = this.data.kismet_device_base_macaddr;
        } else {
            this.initialLabel = this.getManufacturer();
        }

        // Setup the label and handlers
        this.setupLabel();
        this.setupDeauthHandler();
        
        // Listen for network updates
        document.addEventListener('networksUpdated', () => {
            if (this.data.kismet_device_base_type === "Wi-Fi Client") {
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
        detailsPanel.innerHTML = ClientTemplates.generateClientTemplate(this.data);

        // Cache elements for updates
        this.cachedElements = {
            basicLabel,
            manufacturerSpan,
            detailsPanel,
            signalStrength: detailsPanel.querySelector('.detail-value:has(:scope + .detail-key:contains("Signal Strength"))'),
            lastSeen: detailsPanel.querySelector('.detail-value:has(:scope + .detail-key:contains("Last Seen"))'),
            packetStats: detailsPanel.querySelector('.detail-value:has(:scope + .detail-key:contains("Total Packets"))')
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

        deauthButton.addEventListener('click', async () => {
            if (deauthButton.classList.contains('deauthing')) return;

            deauthButton.classList.add('deauthing');
            deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Deauthing...';
            deauthButton.style.backgroundColor = '#ff8787';

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

            const visualizer = window.networkVisualizer?.getNodes();
            if (!visualizer?.nodes) {
                console.error('Network visualizer not initialized');
                deauthButton.classList.remove('deauthing');
                deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Network Error';
                deauthButton.style.backgroundColor = '#808080';
                return;
            }

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

            const apNode = clientNode.userData?.apNode;
            if (!apNode || apNode.userData?.type !== 'ap') {
                console.error('AP node not found for client');
                deauthButton.classList.remove('deauthing');
                deauthButton.innerHTML = '<i class="fa-solid fa-ban"></i> Client Not Connected';
                deauthButton.style.backgroundColor = '#808080';
                return;
            }

            const apData = apNode.userData?.data;
            const apMac = apData?.kismet_device_base_macaddr;
            const channel = clientNode.userData?.apData?.channel;

            if (!apMac || !channel) {
                console.error('Missing required data');
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

    updateContent() {
        const wasExpanded = this.expanded;

        if (this.cachedElements.manufacturerSpan) {
            const displayText = this.element.getAttribute('data-karma') === 'true' ?
                this.data.kismet_device_base_macaddr :
                this.getManufacturer();

            if (this.cachedElements.manufacturerSpan.textContent !== displayText) {
                this.cachedElements.manufacturerSpan.textContent = displayText;
            }
        }

        if (this.cachedElements.signalStrength) {
            this.cachedElements.signalStrength.textContent = 
                `${this.data.kismet_device_base_signal?.last_signal || 0} dBm`;
        }

        if (this.cachedElements.lastSeen && this.data.kismet_device_base_last_time) {
            this.cachedElements.lastSeen.textContent = 
                new Date(this.data.kismet_device_base_last_time * 1000).toLocaleString();
        }

        if (this.cachedElements.packetStats) {
            this.cachedElements.packetStats.textContent = 
                this.data.kismet_device_base_packets?.total || 0;
        }

        if (wasExpanded) {
            this.expanded = true;
            this.element.classList.add('expanded');
        }
    }
}
