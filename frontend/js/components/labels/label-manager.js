import { SSIDDeviceLabel } from './SSID-device-label.js';
import { APDeviceLabel } from './AP-device-label.js';
import { ClientDeviceLabel } from './client-device-label.js';

/**
 * Label Manager
 * Handles creation, update, and cleanup of device labels
 */
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
            // Create appropriate label type based on device type
            switch (data.kismet_device_base_type) {
                case "Wi-Fi Network":
                    label = new SSIDDeviceLabel(data, this.container);
                    break;
                case "Wi-Fi AP":
                    label = new APDeviceLabel(data, this.container);
                    break;
                case "Wi-Fi Client":
                    label = new ClientDeviceLabel(data, this.container);
                    break;
                default:
                    label = new ClientDeviceLabel(data, this.container); // Fallback to client type
            }

            // Store node ID on label for AP lookup
            if (data.nodeId) {
                label.element.setAttribute('data-node-id', data.nodeId);
            }
            this.labels.set(macAddress, label);
        } else {
            label.updateData(data);
            // Update label with any existing state
            if (label.evilTwinManager) {
                const existingState = label.evilTwinManager.getPersistentState(data.name);
                if (existingState && existingState.isRunning) {
                    label.element.setAttribute('data-evil-twin-running', 'true');
                }
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
