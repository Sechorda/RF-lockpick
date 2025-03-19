/**
 * Access Point device template generation
 * Handles both normal AP display and karma mode
 */
export class APTemplates {
    static generateCopyIcon() {
        return '<svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 5px; cursor: pointer; color: var(--text-primary);"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" fill="none" stroke-width="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" fill="none" stroke-width="2"></path></svg>';
    }

    static generateAPTemplate(data) {
        // In KARMA mode, we exclude the SSID field
        if (data.isKarmaMode) {
            return `
            <div class="detail-section" data-ssid="${data.name}">
                <div class="detail-section-title">Access Point Information</div>
                <div class="detail-row">
                        <span class="detail-key">MAC Address:</span>
                        <span class="detail-value" onclick="navigator.clipboard.writeText('${data.kismet_device_base_macaddr || ''}')" style="cursor: pointer;">
                            ${this.generateCopyIcon()}
                            ${data.kismet_device_base_macaddr || 'Unknown'}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-key">Channel:</span>
                        <span class="detail-value">
                            <span class="band-indicator ${data.kismet_device_base_channel > 14 ? 'band-5g' : 'band-2g'}">
                                ${data.kismet_device_base_channel || 'Unknown'}
                            </span>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-key">Signal Strength:</span>
                        <span class="detail-value">
                            ${data.kismet_device_base_signal?.last_signal ? `${data.kismet_device_base_signal.last_signal} dBm` : 'Unknown'}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-key">Connected Clients:</span>
                        <span class="detail-value">${(data.clients || []).length}</span>
                    </div>
                </div>

                <div class="ap-container karma-ap-container" data-ssid="${data.name}">
                    <button class="ap-button-base karma-ap-button">
                        <i class="fa-solid fa-users"></i> Create KARMA-AP
                    </button>
                    <div class="band-selection-buttons" data-default-display="flex">
                        <button class="ap-button-base karma-ap-button" data-band="2.4GHz">
                            <i class="fa-solid fa-users"></i> 2.4GHz
                        </button>
                        <button class="ap-button-base karma-ap-button" data-band="5GHz">
                            <i class="fa-solid fa-users"></i> 5GHz
                        </button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="detail-section" data-ssid="${data.name || ''}">
                <div class="detail-section-title">Basic Information</div>
                <div class="detail-row">
                    <span class="detail-key">Device Type:</span>
                    <span class="detail-value">${data.kismet_device_base_type || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">Manufacturer:</span>
                    <span class="detail-value">${data.kismet_device_base_manufacturer || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">MAC Address (2.4GHz):</span>
                    <span class="detail-value" onclick="navigator.clipboard.writeText('${data.mac_addresses?.[0]?.split(': ')[1] || ''}')" style="cursor: pointer;">
                        ${this.generateCopyIcon()}
                        ${data.mac_addresses?.[0]?.split(': ')[1] || 'Unknown'}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">MAC Address (5GHz):</span>
                    <span class="detail-value" onclick="navigator.clipboard.writeText('${data.mac_addresses?.[1]?.split(': ')[1] || ''}')" style="cursor: pointer;">
                        ${this.generateCopyIcon()}
                        ${data.mac_addresses?.[1]?.split(': ')[1] || 'Unknown'}
                    </span>
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">Network Information</div>
                <div class="detail-row">
                    <span class="detail-key">SSID:</span>
                    <span class="detail-value">${data.name || 'Hidden'}</span>
                </div>
                ${data.kismet_device_base_macaddr === "00:11:22:33:44:55" ? `
                <div class="detail-row">
                    <span class="detail-key">PSK:</span>
                    <span class="detail-value psk-value" onclick="navigator.clipboard.writeText('${data.psk || "NONE"}')" style="cursor: pointer;">
                        ${this.generateCopyIcon()}
                        ${data.psk || "Open Network (No PSK)"}
                    </span>
                </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-key">Frequency:</span>
                    <span class="detail-value">${data.freq || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">Connected Clients:</span>
                    <span class="detail-value">${(data.clients || []).length}</span>
                </div>
            </div>

            <div class="band-selection-buttons" style="display: none; margin-top: 10px;">
                <button class="deauth-button" data-band="2.4GHz" style="flex: 1;">
                    <i class="fa-solid fa-wifi"></i> 2.4GHz
                </button>
                <button class="deauth-button" data-band="5GHz" style="flex: 1;">
                    <i class="fa-solid fa-wifi"></i> 5GHz
                </button>
            </div>

            ${data.security ? `
                <div class="detail-section">
                    <div class="detail-section-title">Security</div>
                    <div class="security-tags">
                        ${data.security.split(' + ').map(sec => `
                            <span class="security-tag">${sec}</span>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }
}
