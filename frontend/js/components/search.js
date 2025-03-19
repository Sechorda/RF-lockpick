import { networks } from '../services/network/fetch-networks.js';

class NetworkSearch {
    constructor() {
        this.hideEmptyNetworks = false;
        // Don't initialize in constructor since element doesn't exist yet
    }

    initializeSearch() {
        this.searchInput = document.getElementById('search-input');
        if (this.searchInput) {
            this.setupEventListeners();
            return true;
        }
        return false;
    }

    setupEventListeners() {
        if (!this.searchInput) return;
        // Remove any existing listeners first
        const newInput = this.searchInput.cloneNode(true);
        this.searchInput.parentNode.replaceChild(newInput, this.searchInput);
        this.searchInput = newInput;
        this.searchInput.addEventListener('input', (e) => this.searchNetworks(e.target.value));
    }
    searchNetworks(query) {
        if (!this.searchInput) return;
        const term = query.toLowerCase().trim();
        this.lastSearchTerm = term; // Store the last search term
        
        if (!term) {
            this.handleEmptySearch();
            return;
        }
        
        document.querySelectorAll('.network-blade').forEach(blade => {
            const network = networks.find(n => n.ssid.name === blade.querySelector('.network-cell').textContent);
            if (!network) return;
            
            const matches = [
                network.ssid?.name,
                network.ssid?.band,
                network.ssid?.security,
                ...network.accessPoints.flatMap(ap => [
                    ap?.name,
                    ap?.manufacturer,
                    ap?.kismet_device_base_macaddr,
                    ap?.kismet_device_base_channel?.toString(),
                    ...ap.clients.flatMap(client => [
                        client?.name,
                        client?.manufacturer,
                        client?.kismet_device_base_macaddr,
                        client?.kismet_device_base_channel?.toString()
                    ])
                ])
            ]
            .filter(Boolean)
            .some(value => value.toLowerCase().includes(term));
            
            const totalClients = network.accessPoints.reduce((total, ap) => total + ap.clients.length, 0);
            blade.style.cssText = matches && (!this.hideEmptyNetworks || totalClients > 0) 
                ? 'display: grid;' 
                : 'display: none;';
        });
    }
    handleEmptySearch() {
        document.querySelectorAll('.network-blade').forEach(blade => {
            const network = networks.find(n => n.ssid.name === blade.querySelector('.network-cell').textContent);
            if (!network) return;
            const totalClients = network.accessPoints.reduce((total, ap) => total + (ap.clients?.length || 0), 0);
            blade.style.cssText = (!this.hideEmptyNetworks || totalClients > 0) 
                ? 'display: grid;' 
                : 'display: none;';
        });
    }
    setHideEmptyNetworks(value) {
        this.hideEmptyNetworks = value;
        this.searchNetworks(this.searchInput.value);
    }
    clearSearch() {
        this.searchInput.value = '';
        this.lastSearchTerm = '';
        this.handleEmptySearch();
    }

    // Method to get the current search term
    getCurrentSearchTerm() {
        return this.lastSearchTerm || '';
    }

    // Method to restore previous search state
    restoreSearchState() {
        if (!this.searchInput) return;
        if (this.lastSearchTerm) {
            this.searchInput.value = this.lastSearchTerm;
            this.searchNetworks(this.lastSearchTerm);
        }
    }
}

// Create singleton instance
export const networkSearch = new NetworkSearch();
