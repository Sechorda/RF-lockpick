export class CellularView {
    constructor() {
        this.container = document.getElementById('blade-container');
        // Store networks for view recreation
        this.networks = [];
    }

    show() {
        // Show the container and recreate view
        this.container.style.display = 'block';
        this.createView(this.networks);
    }

    createView(networks) {
        this.networks = networks; // Store for later use
        this.container.innerHTML = '';
        
        if (networks.length === 0) {
            this.container.innerHTML = '<div class="network-blade">No cellular networks found</div>';
            return;
        }

        networks.forEach(network => {
            const blade = document.createElement('div');
            blade.className = 'network-blade';
            blade.setAttribute('data-view', 'cellular');
            blade.innerHTML = `
                <div class="title">${network.name}</div>
                <div class="details">
                    <div class="detail-item">
                        <span class="label">MCC</span>
                        <span class="value">${network.mcc}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">MNC</span>
                        <span class="value">${network.mnc}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Signal</span>
                        <span class="value">${network.signalStrength} dBm</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Technology</span>
                        <span class="value">${network.technology}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">Connected</span>
                        <span class="value">${network.connected ? 'Yes' : 'No'}</span>
                    </div>
                </div>
            `;

            this.container.appendChild(blade);
        });
    }

    updateNetworks(networks) {
        this.networks = networks;
        if (this.container.style.display !== 'none') {
            this.createView(networks);
        }
    }
}

export default CellularView;
