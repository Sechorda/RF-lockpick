let networks = [];
export { networks, updateNetworks };
const API_ENDPOINT = 'http://localhost:8080/api/networks';

// Device registry for quick lookups
window.deviceRegistry = new Map();

// Custom event for device updates
const deviceUpdateEvent = new CustomEvent('deviceUpdated', {
    detail: { macAddress: null, data: null }
});

// Update device registry with latest data while preserving persistent states
function updateDeviceRegistry(networkData) {
    const updatedDevices = new Set();
    
    networkData.forEach(network => {
        // Handle network SSID first to ensure proper device type
        if (network.ssid?.kismet_device_base_macaddr) {
            const existingDevice = window.deviceRegistry.get(network.ssid.kismet_device_base_macaddr);
            
            // Preserve existing device data
            // Create base device with existing data
            const ssidDevice = {
                ...existingDevice,
                kismet_device_base_type: "Wi-Fi Network",
                persistent: existingDevice?.persistent || false,
                psk: existingDevice?.psk,
                // Preserve existing security before spreading new data
                security: existingDevice?.security || network.ssid.security || ''
            };
            
            // Spread new data but ensure we don't overwrite critical fields
            const updatedDevice = {
                ...ssidDevice,
                ...network.ssid,
                // Re-apply preserved fields that shouldn't be overwritten
                kismet_device_base_type: "Wi-Fi Network",
                persistent: ssidDevice.persistent,
                psk: ssidDevice.psk,
                security: ssidDevice.security // Ensure security is preserved
            };
            
            window.deviceRegistry.set(network.ssid.kismet_device_base_macaddr, updatedDevice);
            updatedDevices.add(network.ssid.kismet_device_base_macaddr);
        }
        
        // Handle base network device if it's not already handled as an SSID
        if (network.kismet_device_base_macaddr && 
            (!network.ssid || network.kismet_device_base_macaddr !== network.ssid.kismet_device_base_macaddr) &&
            !window.deviceRegistry.get(network.kismet_device_base_macaddr)?.kismet_device_base_type) {
            const existingDevice = window.deviceRegistry.get(network.kismet_device_base_macaddr);
            const updatedDevice = {
                ...network,
                kismet_device_base_type: existingDevice?.kismet_device_base_type || network.kismet_device_base_type,
                persistent: existingDevice?.persistent || false,
                psk: existingDevice?.psk
            };
            window.deviceRegistry.set(network.kismet_device_base_macaddr, updatedDevice);
            updatedDevices.add(network.kismet_device_base_macaddr);
        }
        
        // Handle APs and clients
        if (network.accessPoints) {
            network.accessPoints.forEach(ap => {
                if (ap.kismet_device_base_macaddr) {
                    const existingAP = window.deviceRegistry.get(ap.kismet_device_base_macaddr);
                    // Track if this is a new AP, similar to clients
                    const isNew = !existingAP;
                    // Ensure AP device type is explicitly set
                    const updatedAP = {
                        ...ap,
                        ...existingAP,
                        kismet_device_base_type: "Wi-Fi AP",
                        name: ap.name || existingAP?.name,
                        freq: ap.freq || existingAP?.freq,
                        persistent: existingAP?.persistent || false,
                        psk: existingAP?.psk,
                        isNew: isNew // Only set isNew flag on first appearance
                    };
                    window.deviceRegistry.set(ap.kismet_device_base_macaddr, updatedAP);
                    updatedDevices.add(ap.kismet_device_base_macaddr);

                    // Dispatch update event for new APs
                    if (isNew) {
                        document.dispatchEvent(new CustomEvent('deviceUpdated', {
                            detail: {
                                macAddress: ap.kismet_device_base_macaddr,
                                data: updatedAP,
                                isNew: true
                            }
                        }));
                    }
                }
                
                if (ap.clients) {
                    ap.clients.forEach(client => {
                        if (client.kismet_device_base_macaddr) {
                            const existingClient = window.deviceRegistry.get(client.kismet_device_base_macaddr);
                            // Ensure client device type is explicitly set
                            const updatedClient = {
                                ...client,
                                kismet_device_base_type: "Wi-Fi Client",
                                persistent: existingClient?.persistent || false,
                                isNew: !existingClient // Track if this is a new client
                            };
                            window.deviceRegistry.set(client.kismet_device_base_macaddr, updatedClient);
                            updatedDevices.add(client.kismet_device_base_macaddr);
                            
            // Only dispatch update for new clients or major changes
            const hasSignificantChanges = !existingClient || 
                Math.abs((existingClient.kismet_device_base_signal?.last_signal || 0) - 
                        (client.kismet_device_base_signal?.last_signal || 0)) > 2 ||
                existingClient.kismet_device_base_packets?.total !== client.kismet_device_base_packets?.total;
                
            if (hasSignificantChanges || existingClient?.persistent) {
                document.dispatchEvent(new CustomEvent('deviceUpdated', {
                    detail: {
                        macAddress: client.kismet_device_base_macaddr,
                        data: updatedClient,
                        isNew: !existingClient
                    }
                }));
            }
                        }
                    });
                }
            });
        }
    });
    
    // Only notify about significant device updates
    updatedDevices.forEach(macAddress => {
        const device = window.deviceRegistry.get(macAddress);
        const oldDevice = window.deviceRegistry.get(macAddress);
        
        // Skip update if device hasn't changed significantly
        if (device.kismet_device_base_type === "Wi-Fi Client") {
            // Already handled in client processing
            return;
        }
        
        // For Wi-Fi Networks, always update to ensure PSK changes are reflected immediately
        if (device.kismet_device_base_type === "Wi-Fi Network") {
            document.dispatchEvent(new CustomEvent('deviceUpdated', {
                detail: {
                    macAddress: macAddress,
                    data: device,
                    persistent: device?.persistent || false
                }
            }));
            return;
        }
        
        // For other devices, only update if there are major changes
        const hasSignificantChanges = 
            Math.abs((device.kismet_device_base_signal?.last_signal || 0) - 
                    (oldDevice?.kismet_device_base_signal?.last_signal || 0)) > 2 ||
            device.kismet_device_base_packets?.total !== oldDevice?.kismet_device_base_packets?.total;
            
        if (hasSignificantChanges || device.persistent) {
            document.dispatchEvent(new CustomEvent('deviceUpdated', {
                detail: {
                    macAddress: macAddress,
                    data: device,
                    persistent: device?.persistent || false
                }
            }));
        }
    });
}

function networksAreDifferent(oldNetworks, newNetworks) {
    if (oldNetworks.length !== newNetworks.length) return true;
    
    // Compare networks while ignoring PSK field for persistent networks
    return oldNetworks.some((oldNetwork, index) => {
        const newNetwork = newNetworks[index];
        
        // Check if this is a persistent network
        const isPersistent = oldNetwork.ssid?.kismet_device_base_macaddr && 
            window.deviceRegistry.get(oldNetwork.ssid.kismet_device_base_macaddr)?.persistent;
        
        if (isPersistent) {
            // For persistent networks, create comparison objects without PSK
            const oldCompare = {...oldNetwork};
            const newCompare = {...newNetwork};
            
            // Remove PSK from comparison if present
            if (oldCompare.psk) delete oldCompare.psk;
            if (newCompare.psk) delete newCompare.psk;
            if (oldCompare.ssid?.psk) delete oldCompare.ssid.psk;
            if (newCompare.ssid?.psk) delete newCompare.ssid.psk;
            
            return JSON.stringify(oldCompare) !== JSON.stringify(newCompare);
        }
        
        // For non-persistent networks, compare everything
        return JSON.stringify(oldNetwork) !== JSON.stringify(newNetwork);
    });
}

async function updateNetworks() {
    try {
        const response = await fetch(API_ENDPOINT);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const networkData = await response.json();
        
        // Check if there are actual changes before updating
        const hasChanges = networksAreDifferent(networks, networkData);
        
        if (hasChanges) {
            // Preserve PSKs for persistent networks before updating
            const persistentPSKs = new Map();
            networks.forEach(network => {
                if (network.ssid?.kismet_device_base_macaddr) {
                    const device = window.deviceRegistry.get(network.ssid.kismet_device_base_macaddr);
                    if (device?.persistent && device?.psk) {
                        persistentPSKs.set(network.ssid.kismet_device_base_macaddr, device.psk);
                    }
                }
            });
            
            // Create a map of existing network data
            const existingNetworks = new Map();
            networks.forEach(network => {
                if (network.ssid?.kismet_device_base_macaddr) {
                    const device = window.deviceRegistry.get(network.ssid.kismet_device_base_macaddr);
                    existingNetworks.set(network.ssid.kismet_device_base_macaddr, {
                        security: device?.security || network.ssid.security,
                        psk: device?.psk || network.ssid.psk
                    });
                }
            });
            
            // Process new network data to preserve security info
            const processedNetworks = networkData.map(network => {
                if (network.ssid?.kismet_device_base_macaddr) {
                    const existingData = existingNetworks.get(network.ssid.kismet_device_base_macaddr);
                    // Use existing security, or keep the network's original security
                    const security = existingData?.security || network.ssid.security;
                    
                    return {
                        ...network,
                        ssid: {
                            ...network.ssid,
                            security: security
                        }
                    };
                }
                return network;
            });
            
            // Update networks array
            networks.length = 0;
            networks.push(...processedNetworks);
            
            // Restore PSKs
            networks.forEach(network => {
                if (network.ssid?.kismet_device_base_macaddr) {
                    const psk = persistentPSKs.get(network.ssid.kismet_device_base_macaddr);
                    if (psk) {
                        network.psk = psk;
                        network.ssid.psk = psk;
                    }
                }
            });
            networks.sort((a, b) => {
                const signalA = a.ssid.kismet_device_base_signal || -100;
                const signalB = b.ssid.kismet_device_base_signal || -100;
                return signalB - signalA;
            });
            
            // Update device registry with processed networks that have preserved security info
            updateDeviceRegistry(processedNetworks);
            
            // Dispatch network update event with changes flag
            document.dispatchEvent(new CustomEvent('networksUpdated', {
                detail: { hasChanges: true }
            }));
            
            // Restore audit button states if networkAuditor is available
            if (window.networkAuditor?.restoreAllButtonStates) {
                window.networkAuditor.restoreAllButtonStates();
            }
        }
        const errorDiv = document.querySelector('.error-message');
        if (errorDiv) errorDiv.remove();
    } catch (error) {
        document.getElementById('canvas-container').innerHTML = `
            <div class="error-message">
                Error loading network data: ${error.message}<br>
                Make sure Kismet and the proxy server are running (port 8080)
            </div>
        `;
    }
}
// Initial update
updateNetworks();

// Update every 5 seconds to reduce UI updates
setInterval(updateNetworks, 5000);
