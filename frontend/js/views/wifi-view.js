import { networkSearch } from '../components/search.js';

export class WifiView {
    constructor(viewManager) {
        this.container = document.getElementById('blade-container');
        this.currentNetwork = null;
        this.onNetworkSelect = null;
        this.onHideEmptyToggle = null;
        this.karmaMode = false;
        
        // Store view manager reference
        this.viewManager = viewManager;
        
        // Initialize UI elements
        this.hideEmptyToggle = document.getElementById('hide-empty-toggle');
        this.karmaToggle = document.getElementById('karma-toggle');
        
        // Bind event handlers
        this.hideEmptyToggle.addEventListener('click', () => this.toggleHideEmpty());
        this.karmaToggle.addEventListener('click', () => this.toggleKarmaMode());
    }

    createHeaderElement() {
        const headerWrapper = document.createElement('div');
        headerWrapper.className = 'network-header-wrapper';
        
        const header = document.createElement('div');
        header.className = 'network-header';
        
        const networkNameColumn = document.createElement('div');
        networkNameColumn.style.position = 'relative';
        networkNameColumn.style.display = 'flex';
        networkNameColumn.style.alignItems = 'center';
        networkNameColumn.style.gap = '8px';
        
        const networkNameText = document.createElement('span');
        networkNameText.textContent = 'Network Name';
        networkNameColumn.appendChild(networkNameText);
        
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        
        const searchIcon = document.createElement('div');
        searchIcon.className = 'search-icon';
        searchIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'search-input';
        searchInput.id = 'search-input';
        searchInput.placeholder = 'Search';
        
        searchContainer.appendChild(searchIcon);
        searchContainer.appendChild(searchInput);
        
        networkNameColumn.appendChild(searchContainer);
        header.appendChild(networkNameColumn);
        header.appendChild(document.createElement('div')).textContent = 'Band';
        header.appendChild(document.createElement('div')).textContent = 'Security';
        header.appendChild(document.createElement('div')).textContent = 'Connected';
        
        headerWrapper.appendChild(header);
        return headerWrapper;
    }

    createBladeContainer() {
        const container = document.createElement('div');
        container.className = 'network-blade-container';
        return container;
    }

    toggleKarmaMode() {
        // Only update internal state, let karma view handle display
        this.karmaMode = !this.karmaMode;
        
        // Clear current network when entering karma mode
        if (this.karmaMode) {
            this.currentNetwork = null;
            this.container.style.display = 'none';
        } else {
            // When exiting karma mode, restore wifi view
            this.container.style.display = 'block';
            this.createPanelView(this.networks || []);
            // Update view controls
            this.viewManager.viewToggle.textContent = '3D View';
            this.viewManager.hideEmptyToggle.style.display = 'flex';
            this.viewManager.karmaToggle.style.display = 'flex';
            this.viewManager.treeToggle.style.display = 'none';
        }
    }

    // Handle view cleanup when switching views
    resetView() {
        // Only reset if we're in normal karma mode (not visualization)
        if (this.karmaMode && !this.viewManager.probequestView?.isVisualizingNetwork) {
            this.karmaMode = false;
            this.karmaToggle.classList.remove('active');
            this.createPanelView(this.networks || []);
        }
    }

    isMacAddress(str) {
        return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(str);
    }

    sortNetworks(networks) {
        return [...networks].sort((a, b) => {
            const aName = a.ssid.name || '';
            const bName = b.ssid.name || '';
            const aHidden = !aName || this.isMacAddress(aName);
            const bHidden = !bName || this.isMacAddress(bName);
            
            if (aHidden && !bHidden) return 1;
            if (!aHidden && bHidden) return -1;
            return aName.localeCompare(bName);
        });
    }

    createPanelView(networks) {
        const previousSearchTerm = networkSearch.getCurrentSearchTerm();
        this.container.innerHTML = '';

        // Add header and blade container
        this.container.appendChild(this.createHeaderElement());
        const bladeContainer = this.createBladeContainer();
        this.container.appendChild(bladeContainer);
        
        // Show loading state initially
        const loadingBlade = document.createElement('div');
        loadingBlade.className = 'network-blade loading';
        loadingBlade.innerHTML = '<div class="loading-spinner"></div>';
        bladeContainer.appendChild(loadingBlade);

        // Clear loading state after 8 seconds if no networks are found
        this.loadingTimeout = setTimeout(() => {
            if (this.container.contains(loadingBlade)) {
                const previousSearchTerm = networkSearch.getCurrentSearchTerm();
                this.container.innerHTML = '';
                this.container.appendChild(this.createHeaderElement());
                const bladeContainer = this.createBladeContainer();
                this.container.appendChild(bladeContainer);
                
                const noNetworksBlade = document.createElement('div');
                noNetworksBlade.className = 'network-blade no-networks';
                noNetworksBlade.style.gridTemplateColumns = 'none';
                noNetworksBlade.textContent = 'No networks found';
                bladeContainer.appendChild(noNetworksBlade);
            }
        }, 8000);

        // If networks array is empty, return early (timeout will handle display)
        if (networks.length === 0) {
            return;
        }

        // Clear timeout and loading state if networks are found
        clearTimeout(this.loadingTimeout);

        // Reset container and add header and blade container
        this.container.innerHTML = '';
        this.container.appendChild(this.createHeaderElement());
        const networkContainer = this.createBladeContainer();
        this.container.appendChild(networkContainer);

        // Initialize network search with new search input
        networkSearch.initializeSearch();

        // Add network blades
        const sortedNetworks = this.sortNetworks(networks);
        sortedNetworks.forEach(network => {
            const totalClients = network.accessPoints.reduce(
                (total, ap) => total + (ap.clients?.length || 0), 
                0
            );

            if (this.viewManager.hideEmptyState && totalClients === 0) {
                return;
            }

            const blade = document.createElement('div');
            blade.className = 'network-blade';
            blade.innerHTML = `
                <div class="network-cell">${network.ssid.name}</div>
                <div class="network-cell">${network.ssid.band}</div>
                <div class="network-cell">${network.ssid.security}</div>
                <div class="network-cell">${totalClients} clients / ${network.accessPoints.length} APs</div>
            `;

            blade.addEventListener('click', () => {
                this.currentNetwork = network;
                this.viewManager.showCanvasView();
                if (this.onNetworkSelect) {
                    this.onNetworkSelect(network);
                }
            });

            networkContainer.appendChild(blade);
        });

        // Restore previous search state if it exists
        if (previousSearchTerm) {
            networkSearch.restoreSearchState();
        }
    }

    toggleHideEmpty() {
        if (this.viewManager) {
            // Update ViewManager's state
            this.viewManager.hideEmptyState = !this.viewManager.hideEmptyState;
            // Update UI to reflect ViewManager's state
            if (this.viewManager.hideEmptyState) {
                this.hideEmptyToggle.classList.add('active');
            } else {
                this.hideEmptyToggle.classList.remove('active');
            }
            
            // Notify callback if exists
            if (this.onHideEmptyToggle) {
                this.onHideEmptyToggle(this.viewManager.hideEmptyState);
            }
            
            // Re-render the panel view to reflect the changes
            this.createPanelView(this.networks || []);
        }
    }

    // Public methods for external control
    setNetworkSelectCallback(callback) {
        this.onNetworkSelect = callback;
    }

    setHideEmptyToggleCallback(callback) {
        this.onHideEmptyToggle = callback;
    }

    getCurrentNetwork() {
        return this.currentNetwork;
    }

    updateNetworks(networks, options = { hasChanges: true }) {
        // Always store the complete networks array for reference
        this.networks = networks; 
        
        if (options.hasChanges) {
            // Update current network if it exists
            if (this.currentNetwork) {
                const updatedNetwork = networks.find(n => 
                    n.ssid.kismet_device_base_macaddr === this.currentNetwork.ssid.kismet_device_base_macaddr
                );
                if (updatedNetwork) {
                    this.currentNetwork = updatedNetwork;
                } else {
                    // If current network no longer exists, check for network with evil-twin AP
                    const networkWithEvilTwin = networks.find(n => 
                        n.accessPoints?.some(ap => ap.kismet_device_base_macaddr === "00:11:22:33:44:55")
                    );
                    if (networkWithEvilTwin) {
                        this.currentNetwork = networkWithEvilTwin;
                    }
                }
            }
            
            // Only update panel view if not in karma mode
            if (!this.karmaMode) {
                // Filter networks based on ViewManager's state
                if (this.viewManager.hideEmptyState) {
                    // Filter out networks with 0 clients
                    const filteredNetworks = networks.filter(network => {
                        const totalClients = network.accessPoints.reduce(
                            (total, ap) => total + (ap.clients?.length || 0), 
                            0
                        );
                        return totalClients > 0;
                    });
                    
                    // Pass filtered networks to createPanelView
                    this.createPanelView(filteredNetworks);
                } else {
                    // Pass all networks to createPanelView
                    this.createPanelView(networks);
                }
                
                // Sync UI with ViewManager's state
                if (this.viewManager.hideEmptyState) {
                    this.hideEmptyToggle.classList.add('active');
                } else {
                    this.hideEmptyToggle.classList.remove('active');
                }
            }
        }
    }

    getHideEmptyNetworks() {
        // Use ViewManager's state as the single source of truth
        return this.viewManager && this.viewManager.hideEmptyState;
    }

    isPanelView() {
        return this.viewManager.isPanelViewVisible();
    }
}

export default WifiView;
