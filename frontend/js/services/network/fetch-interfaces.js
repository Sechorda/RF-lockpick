let availableInterfaces = {
    wireless: [],
    wired: [],
    bluetooth: []
};
let selectedInterfaces = {
    kismet: null,
    hostapd: null,
    lan: null,
    bluetooth: null
};

// Track whether this is the first initialization
let isInitialLoad = true;

async function fetchInterfaces() {
    try {
        const response = await fetch('/api/interfaces');
        if (!response.ok) throw new Error('Failed to fetch interfaces');
        const data = await response.json();

        // Handle WiFi interfaces
        availableInterfaces.wireless = data.wifi_interfaces.filter(iface => !iface.endsWith('mon')) || [];
        availableInterfaces.wired = data.ethernet_interfaces || [];

        // Handle ethernet interfaces
        availableInterfaces.wired = data.ethernet_interfaces || [];

        // Handle active Kismet interface
        if (data.active_interface) {
            selectedInterfaces.kismet = data.active_interface;
            const kismetDropdown = document.querySelector('.interface-dropdown[data-tool="kismet"]');
            if (kismetDropdown) {
                kismetDropdown.innerHTML = `
                    <option value="${data.active_interface}" selected>${data.active_interface}</option>
                `;
                kismetDropdown.disabled = true;
            }
            // Remove active interface from available wireless interfaces
            availableInterfaces.wireless = availableInterfaces.wireless
                .filter(iface => iface !== data.active_interface);
        }

        // Handle Bluetooth interfaces
        availableInterfaces.bluetooth = data.bluetooth_interfaces || [];
        if (isInitialLoad && availableInterfaces.bluetooth.length > 0 && !selectedInterfaces.bluetooth) {
            selectedInterfaces.bluetooth = availableInterfaces.bluetooth[0];
        }

        updateInterfaceDropdowns();
        isInitialLoad = false;
    } catch (error) {
        console.error('Error fetching interfaces:', error);
        availableInterfaces = {
            wireless: [],
            wired: []
        };
    }
}

function isInterfaceUsed(iface) {
    return Object.values(selectedInterfaces).includes(iface);
}

function updateInterfaceDropdowns() {
    const dropdowns = document.querySelectorAll('.interface-dropdown');
    dropdowns.forEach(dropdown => {
        const tool = dropdown.dataset.tool;
        const currentValue = dropdown.value;
        const currentSelection = selectedInterfaces[tool];
        dropdown.innerHTML = '';

        // Add default option for all tools except kismet (which is handled separately)
        if (tool !== 'kismet') {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Select an interface';
            dropdown.appendChild(defaultOption);
            if (!currentSelection) {
                defaultOption.selected = true;
            }
        }

        if (tool === 'kismet') {
            // Handle Kismet dropdown
            if (selectedInterfaces.kismet) {
                const option = document.createElement('option');
                option.value = selectedInterfaces.kismet;
                option.textContent = selectedInterfaces.kismet;
                option.selected = true;
                option.disabled = true;
                dropdown.appendChild(option);
            } else {
                const noInterfaceOption = document.createElement('option');
                noInterfaceOption.value = '';
                noInterfaceOption.textContent = 'No active interface';
                noInterfaceOption.disabled = true;
                dropdown.appendChild(noInterfaceOption);
            }
        } else if (tool === 'bluetooth') {
            // Handle Bluetooth dropdown
            if (availableInterfaces.bluetooth.length > 0) {
                availableInterfaces.bluetooth.forEach(iface => {
                    const option = document.createElement('option');
                    option.value = iface;
                    option.textContent = iface;
                    const isUsed = isInterfaceUsed(iface) && iface !== currentSelection;
                    option.disabled = isUsed;
                    if (iface === currentSelection) option.selected = true;
                    dropdown.appendChild(option);
                });
            } else {
                const noInterfaceOption = document.createElement('option');
                noInterfaceOption.value = '';
                noInterfaceOption.textContent = 'No Bluetooth interfaces';
                noInterfaceOption.disabled = true;
                dropdown.appendChild(noInterfaceOption);
            }
        } else if (tool === 'lan') {
            // Handle LAN dropdown (both wired and wireless interfaces)
            const allInterfaces = [...availableInterfaces.wired, ...availableInterfaces.wireless];

            if (allInterfaces.length > 0) {
                // Add all interfaces in a single list
                allInterfaces.forEach(iface => {
                    const option = document.createElement('option');
                    option.value = iface;
                    option.textContent = iface;
                    const isUsed = isInterfaceUsed(iface) && iface !== currentSelection;
                    option.disabled = isUsed;
                    if (iface === currentSelection) option.selected = true;
                    dropdown.appendChild(option);
                });

                // Auto-select first available interface only on initial load
                if (isInitialLoad && !currentSelection) {
                    const firstAvailable = allInterfaces.find(iface => !isInterfaceUsed(iface));
                    if (firstAvailable) {
                        dropdown.value = firstAvailable;
                        selectedInterfaces.lan = firstAvailable;
                    }
                }
            } else {
                const noInterfaceOption = document.createElement('option');
                noInterfaceOption.value = '';
                noInterfaceOption.textContent = 'No interfaces available';
                noInterfaceOption.disabled = true;
                dropdown.appendChild(noInterfaceOption);
            }
        } else if (tool === 'hostapd') {
            // Handle hostapd dropdown (wireless interfaces only)
            if (availableInterfaces.wireless.length > 0) {
                availableInterfaces.wireless.forEach(iface => {
                    const option = document.createElement('option');
                    option.value = iface;
                    option.textContent = iface;
                    const isUsed = isInterfaceUsed(iface) && iface !== currentSelection;
                    option.disabled = isUsed;
                    if (iface === currentSelection) option.selected = true;
                    dropdown.appendChild(option);
                });

                // Auto-select first available wireless interface only on initial load
                if (isInitialLoad && !currentSelection) {
                    const firstAvailable = availableInterfaces.wireless.find(iface => !isInterfaceUsed(iface));
                    if (firstAvailable) {
                        dropdown.value = firstAvailable;
                        selectedInterfaces.hostapd = firstAvailable;
                    }
                }
            } else {
                const noInterfaceOption = document.createElement('option');
                noInterfaceOption.value = '';
                noInterfaceOption.textContent = 'No WLAN interfaces available';
                noInterfaceOption.disabled = true;
                dropdown.appendChild(noInterfaceOption);
            }
        }
    });
}

// Initialize interface dropdown event listeners
document.querySelectorAll('.interface-dropdown').forEach(dropdown => {
    dropdown.addEventListener('change', (e) => {
        const tool = e.target.dataset.tool;
        const prevInterface = selectedInterfaces[tool];
        const selectedInterface = e.target.value;

        // Clear the selection if empty value is selected
        if (selectedInterface === '') {
            selectedInterfaces[tool] = null;
            updateInterfaceDropdowns();
            return;
        }

        // Update selected interfaces state
        selectedInterfaces[tool] = selectedInterface;

        // If we're selecting a new interface, update all dropdowns
        if (selectedInterface !== prevInterface) {
            updateInterfaceDropdowns();
        }
    });
});

// Export functions and state
export {
    availableInterfaces,
    selectedInterfaces,
    fetchInterfaces,
    updateInterfaceDropdowns
};
