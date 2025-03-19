import { networkSearch } from './components/search.js';
import { createClientTransitionButton } from './components/test-button.js';
import { WifiView } from './views/wifi-view.js';
import { BluetoothView } from './views/bluetooth-view.js';
import { CellularView } from './views/cellular-view.js';
import { KarmaView } from './views/karma-view.js';
import { ViewManager } from './core/view-manager.js';
import { fetchInterfaces } from './services/network/fetch-interfaces.js';
import { AuditService } from './services/security/audit-service.js';
import { EvilTwinManager } from './services/security/evil-twin-manager.js';
import { SceneManager } from './core/scene-manager.js';
import { NetworkVisualizer } from './core/network-visualizer.js';
import { KarmaAPVisualizer } from './core/karma-ap-visualizer.js';
import { KarmaAPManager } from './services/security/karma-ap-manager.js';
import { networks, updateNetworks } from './services/network/fetch-networks.js';

// Create test button for client transitions
createClientTransitionButton();

// Initialize core components
const sceneManager = new SceneManager(document.getElementById('canvas-container'));
const networkVisualizer = new NetworkVisualizer(sceneManager);

// Initialize and expose visualizers and managers globally
window.evilTwinManager = new EvilTwinManager();

const karmaAPVisualizer = new KarmaAPVisualizer(networkVisualizer, sceneManager);
window.karmaAPManager = new KarmaAPManager(karmaAPVisualizer);
window.karmaAPVisualizer = karmaAPVisualizer;

// Initialize and expose AuditService globally
const initAuditService = () => {
    try {
        const auditor = new AuditService();
        window.networkAuditor = auditor; // Keep global reference for compatibility
        return auditor;
    } catch (error) {
        console.error('Error initializing AuditService:', error);
        return null;
    }
};
const networkAuditor = initAuditService();

// Initialize views and view manager
const viewManager = new ViewManager();
const wifiView = new WifiView(viewManager);
const bluetoothView = new BluetoothView(viewManager);
const cellularView = new CellularView();
const karmaView = new KarmaView(viewManager);

// Register views with manager
viewManager.wifiView = wifiView;  // Set wifiView reference
viewManager.setBluetoothView(bluetoothView);
viewManager.setCellularView(cellularView);
viewManager.setKarmaView(karmaView);

// Expose KarmaView instance globally for click handler
window.probequestView = karmaView;

// Initialize interfaces
fetchInterfaces();

// Set up view change handling
viewManager.setViewChangeCallback((viewType) => {
    // Clear scene when switching away from WiFi view
    if (viewType !== 'wifi') {
        networkVisualizer.clearScene();
    }

    // Cleanup karma view if switching away from it
    if (viewType !== 'karma' && karmaView.active) {
        karmaView.cleanup();
        karmaView.hide();
    }
    
    // Update networks only in WiFi view
    if (viewType === 'wifi') {
        // Get current network before updating
        const currentNetwork = wifiView.getCurrentNetwork();
        const currentMac = currentNetwork?.ssid?.kismet_device_base_macaddr;
        
        // Update networks list
        wifiView.updateNetworks(networks);
        
        // If we were viewing a network in 3D view, find its updated version
        if (!wifiView.isPanelView()) {
            if (currentMac) {
                const updatedNetwork = networks.find(n => 
                    n.ssid.kismet_device_base_macaddr === currentMac
                );
                if (updatedNetwork) {
                    networkVisualizer.startAnimation();
                    networkVisualizer.visualizeNetwork(updatedNetwork, true, true);
                }
            } else {
                // Check for network with evil-twin AP when switching to WiFi view
                const networkWithEvilTwin = networks.find(n => 
                    n.accessPoints?.some(ap => ap.kismet_device_base_macaddr === "00:11:22:33:44:55")
                );
                if (networkWithEvilTwin) {
                    networkVisualizer.startAnimation();
                    networkVisualizer.visualizeNetwork(networkWithEvilTwin, true, true);
                }
            }
        }
    }
});

// Setup network selection callback
wifiView.setNetworkSelectCallback((network) => {
    const currentNodes = networkVisualizer.getNodes();
    const hasExistingNodes = currentNodes.size > 0;
    networkVisualizer.startAnimation();
    networkVisualizer.visualizeNetwork(network, hasExistingNodes, true);
    networkSearch.clearSearch();
});

// Setup view toggle callback
viewManager.setViewToggleCallback((isPanelView) => {
    if (!isPanelView) {
        // Find the current network in the latest networks data
        const currentNetwork = wifiView.getCurrentNetwork();
        if (currentNetwork) {
            const updatedNetwork = networks.find(n => 
                n.ssid.kismet_device_base_macaddr === currentNetwork.ssid.kismet_device_base_macaddr
            );
            if (updatedNetwork) {
                networkVisualizer.startAnimation();
                networkVisualizer.visualizeNetwork(updatedNetwork, true, true);
                networkSearch.clearSearch();
            }
        } else {
            // Check for network with evil-twin AP when switching to 3D view
            const networkWithEvilTwin = networks.find(n => 
                n.accessPoints?.some(ap => ap.kismet_device_base_macaddr === "00:11:22:33:44:55")
            );
            if (networkWithEvilTwin) {
                networkVisualizer.startAnimation();
                networkVisualizer.visualizeNetwork(networkWithEvilTwin, true, true);
                networkSearch.clearSearch();
            }
        }
    } else {
        networkVisualizer.clearScene();
        wifiView.updateNetworks(networks);
        // Restore audit button states when switching back to panel view
        if (networkAuditor?.restoreAllButtonStates) {
            setTimeout(() => networkAuditor.restoreAllButtonStates(), 100);
        }
    }
});

wifiView.setHideEmptyToggleCallback((hideEmpty) => {
    networkSearch.setHideEmptyNetworks(hideEmpty);
    wifiView.updateNetworks(networks);
});

document.addEventListener('audit-network', async (event) => {
    const { ssid } = event.detail;
    try {
        await networkAuditor.startAudit(ssid);
    } catch (error) {
        console.error('Error during audit:', error);
        // Reset button state on error
        networkAuditor.clearAuditStatus(ssid);
    }
});

// Handle network updates
document.addEventListener('networksUpdated', (event) => {
    if (viewManager.getCurrentView() === 'wifi') {
        const { hasChanges, isTransitioning } = event.detail;
        
        // Update panel view if there are changes
        if (hasChanges) {
            wifiView.updateNetworks(networks, { hasChanges, isTransitioning });
        }
        
        // Update 3D view if needed
        if (!wifiView.isPanelView() && hasChanges) {
            const currentNetwork = wifiView.getCurrentNetwork();
            if (currentNetwork) {
                const updatedNetwork = networks.find(n => 
                    n.ssid.kismet_device_base_macaddr === currentNetwork.ssid.kismet_device_base_macaddr
                );
                
                if (updatedNetwork) {
                    // Always preserve scene state when updating
                    networkVisualizer.startAnimation();
                    networkVisualizer.visualizeNetwork(updatedNetwork, true, true);
                }
            } else {
                // If no current network is selected but we have networks,
                // check if we need to visualize a network with an evil-twin AP
                const networkWithEvilTwin = networks.find(n => 
                    n.accessPoints?.some(ap => ap.kismet_device_base_macaddr === "00:11:22:33:44:55")
                );
                
                if (networkWithEvilTwin) {
                    networkVisualizer.startAnimation();
                    networkVisualizer.visualizeNetwork(networkWithEvilTwin, true, true);
                }
            }
            
            // Update audit button states
            if (networkAuditor?.restoreAllButtonStates) {
                setTimeout(() => networkAuditor.restoreAllButtonStates(), 100);
            }
        }
    }
    document.getElementById('canvas-container').classList.remove('loading');
});

// Handle tree view toggle
document.getElementById('tree-toggle').addEventListener('click', () => {
    const isListView = !networkVisualizer.isListView;
    document.getElementById('tree-toggle').classList.toggle('active', isListView);
    networkVisualizer.setListView(isListView);
    
    const currentNetwork = wifiView.getCurrentNetwork();
    if (currentNetwork) {
        const updatedNetwork = networks.find(n => 
            n.ssid.kismet_device_base_macaddr === currentNetwork.ssid.kismet_device_base_macaddr
        );
        if (updatedNetwork) {
            networkVisualizer.startAnimation();
            networkVisualizer.visualizeNetwork(updatedNetwork, true, true);
        }
    } else {
        // Check for network with evil-twin AP when toggling tree view
        const networkWithEvilTwin = networks.find(n => 
            n.accessPoints?.some(ap => ap.kismet_device_base_macaddr === "00:11:22:33:44:55")
        );
        if (networkWithEvilTwin) {
            networkVisualizer.startAnimation();
            networkVisualizer.visualizeNetwork(networkWithEvilTwin, true, true);
        }
    }
});

// Setup settings dropdown
const settingsToggle = document.getElementById('settings-toggle');
const settingsDropdown = document.querySelector('.settings-dropdown');
if (settingsToggle && settingsDropdown) {
    settingsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        settingsDropdown.classList.toggle('visible');
    });
    document.addEventListener('click', (e) => {
        if (settingsDropdown.classList.contains('visible') && 
            !settingsDropdown.contains(e.target) && 
            !settingsToggle.contains(e.target)) {
            settingsDropdown.classList.remove('visible');
        }
    });
    settingsDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Initialize view
wifiView.updateNetworks(networks);
setTimeout(() => networkAuditor.restoreAllButtonStates(), 100);

// Start animation loop
sceneManager.startAnimation(() => {
    if (!wifiView.isPanelView() && viewManager.getCurrentView() === 'wifi') {
        networkVisualizer.animate();
    }
});
