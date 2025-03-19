/**
 * Network device template generation
 * Handles both normal network display and karma mode
 */
export class NetworkTemplates {
    static generateCopyIcon() {
        return '<svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 5px; cursor: pointer; color: var(--text-primary);"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" fill="none" stroke-width="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" fill="none" stroke-width="2"></path></svg>';
    }

    static generateNetworkTemplate(data) {
    // Handle karma mode display
    if (data.isKarmaMode) {
        return `
            <div class="detail-section">
                <div class="detail-section-title">Network Information</div>
                <div class="detail-row">
                    <span class="detail-key">SSID:</span>
                    <span class="detail-value">${data.name || 'Hidden'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">Security:</span>
                    <span class="detail-value">${data.security || 'None'}</span>
                </div>
            </div>
            <div class="detail-section">
                <div class="psk-row">
                    <span class="detail-key">Handshake:</span>
                    <span class="handshake-value psk-value ${!data.handshakeCaptured ? 'empty' : ''}" style="color: ${data.handshakeCaptured ? 'var(--success-color)' : '#ff6b6b'}">
                        ${data.handshakeCaptured ? 'Captured ✓' : 'Not Available'}
                    </span>
                </div>
                <div class="psk-row">
                    <span class="detail-key">PSK:</span>
                    <span class="psk-value ${!data.psk ? 'empty' : ''}" ${data.psk ? `onclick="navigator.clipboard.writeText('${data.psk.replace(/'/g, "\\'")}')"` : ''}>
                        ${data.psk ? this.generateCopyIcon() : ''}${data.psk || 'Not Available'}
                    </span>
                </div>
            </div>
                ${!data.psk ? `
                    <div class="audit-section">
                        <button class="audit-button" data-ssid="${data.name}" data-uuid="${data.kismet_device_base_key}">
                            <i class="fa-solid fa-shield-halved"></i>
                            <span>Audit Network</span>
                        </button>
                    </div>
                ` : ''}
            `;
        }

        // Normal network display
        return `
            <div class="detail-section">
                <div class="detail-section-title">Network Information</div>
                <div class="detail-row">
                    <span class="detail-key">SSID:</span>
                    <span class="detail-value">${data.name || 'Hidden'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">Security:</span>
                    <span class="detail-value">${data.security || 'None'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">MAC Address:</span>
                    <span class="detail-value" onclick="navigator.clipboard.writeText('${data.kismet_device_base_macaddr || ''}')" style="cursor: pointer;">
                        ${this.generateCopyIcon()}
                        ${data.kismet_device_base_macaddr || 'Unknown'}
                    </span>
                </div>
            </div>

            <div class="detail-section">
                <div class="psk-row">
                    <span class="detail-key">Handshake:</span>
                    <span class="handshake-value psk-value ${!data.handshakeCaptured ? 'empty' : ''}" style="color: ${data.handshakeCaptured ? 'var(--success-color)' : '#ff6b6b'}">
                        ${data.handshakeCaptured ? 'Captured ✓' : 'Not Available'}
                    </span>
                </div>
                <div class="psk-row">
                    <span class="detail-key">PSK:</span>
                    <span class="psk-value ${!data.psk ? 'empty' : ''}" ${data.psk ? `onclick="navigator.clipboard.writeText('${data.psk.replace(/'/g, "\\'")}')"` : ''}>
                        ${data.psk ? this.generateCopyIcon() : ''}${data.psk || 'Not Available'}
                    </span>
                </div>
            </div>

            ${!data.psk ? `
                <div class="audit-section">
                    <button class="audit-button" data-ssid="${data.name}" data-uuid="${data.kismet_device_base_key}">
                        <i class="fa-solid fa-shield-halved"></i>
                        <span>Audit Network</span>
                    </button>
                </div>
            ` : ''}
        `;
    }
}
