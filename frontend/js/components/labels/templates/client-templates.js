/**
 * Client device template generation
 * Handles both normal client display and karma mode
 */
export class ClientTemplates {
    static generateCopyIcon() {
        return '<svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 5px; cursor: pointer; color: var(--text-primary);"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" fill="none" stroke-width="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" fill="none" stroke-width="2"></path></svg>';
    }

    static getBandClass(channel) {
        const channelNum = parseInt(channel);
        if (isNaN(channelNum)) return '';
        return channelNum > 14 ? 'band-5g' : 'band-2g';
    }

    static generateClientTemplate(data) {
        if (data.isKarmaMode) {
            return `
                <div class="detail-section">
                    <div class="detail-section-title">Client Information</div>
                    <div class="detail-row" style="display: grid; grid-template-columns: auto minmax(0, 1fr);">
                        <span class="detail-key">Manufacturer:</span>
                        <span class="detail-value" style="margin-left: 8px;">${data.kismet_device_base_manufacturer || 'Unknown'}</span>
                    </div>
                    <div class="detail-row" style="display: grid; grid-template-columns: auto minmax(0, 1fr);">
                        <span class="detail-key">MAC Address:</span>
                        <span class="detail-value" style="margin-left: 8px;" onclick="navigator.clipboard.writeText('${data.kismet_device_base_macaddr || ''}')" style="cursor: pointer;">
                            ${this.generateCopyIcon()}
                            ${data.kismet_device_base_macaddr || 'Unknown'}
                        </span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="detail-section">
                <div class="detail-section-title">Client Information</div>
                <div class="detail-row">
                    <span class="detail-key">Device Type:</span>
                    <span class="detail-value">${data.kismet_device_base_type || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">Manufacturer:</span>
                    <span class="detail-value">${data.kismet_device_base_manufacturer || data.manufacturer || 'Unknown'}</span>
                </div>
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
                        <span class="band-indicator ${this.getBandClass(data.kismet_device_base_channel)}">
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
                    <span class="detail-key">First Seen:</span>
                    <span class="detail-value">
                        ${data.kismet_device_base_first_time ?
                          new Date(data.kismet_device_base_first_time * 1000).toLocaleString() : 'Unknown'}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">Last Seen:</span>
                    <span class="detail-value">
                        ${data.kismet_device_base_last_time ?
                          new Date(data.kismet_device_base_last_time * 1000).toLocaleString() : 'Unknown'}
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-key">Total Packets:</span>
                    <span class="detail-value">${data.kismet_device_base_packets?.total || 0}</span>
                </div>
            </div>

            <div class="action-section" style="display: flex; flex-direction: row; gap: 10px;">
                <button class="deauth-button" data-mac="${data.kismet_device_base_macaddr}" style="background-color: #ff6b6b; color: white; border: none; padding: 5px 10px; cursor: pointer;">
                    <i class="fa-solid fa-ban"></i> Deauth Client
                </button>
            </div>
        `;
    }
}
