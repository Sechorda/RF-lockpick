import { EvilTwinManager } from '../../../services/security/evil-twin-manager.js';

/**
 * Base class for all device labels
 * Maintains core label functionality while allowing specialized behavior in derived classes
 */
export class BaseDeviceLabel {
    constructor(data, parentElement) {
        this.data = {
            ...data,
            kismet_device_base_type: data.kismet_device_base_type || 'Unknown'
        };
        this.evilTwinManager = new EvilTwinManager();
        this.macAddress = this.data.kismet_device_base_macaddr;
        this.element = document.createElement('div');
        this.element.className = 'device-label';
        this.expanded = false;
        this.cachedElements = {};
        this.lastUpdateTime = Date.now();

        // Set data attributes based on device type
        if (data.kismet_device_base_type === "Wi-Fi Network") {
            this.element.setAttribute('data-ssid', data.name);
        }
        if (data.isKarmaMode) {
            this.element.setAttribute('data-karma', 'true');
        }
        if (data.kismet_device_base_type === "Wi-Fi Client") {
            this.element.setAttribute('data-client', 'true');
        }

        parentElement.appendChild(this.element);
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

    expand() {
        this.expanded = true;
        this.element.classList.add('expanded');
    }

    collapse() {
        this.expanded = false;
        this.element.classList.remove('expanded');
    }

    cleanup() {
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
        } else if (this.expanded) {
            // Preserve expanded state for persistent labels
            this.expanded = true;
            this.element.classList.add('expanded');
        }
    }
}
