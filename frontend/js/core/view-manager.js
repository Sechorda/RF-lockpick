export class ViewManager {
    constructor(wifiView) {
        // Store wifiView reference
        this.wifiView = wifiView;
        this.karmaView = null;
        
        // Initialize view elements
        this.container = document.getElementById('blade-container');
        this.canvasContainer = document.getElementById('canvas-container');
        this.viewToggle = document.getElementById('view-toggle');
        this.treeToggle = document.getElementById('tree-toggle');
        this.hideEmptyToggle = document.getElementById('hide-empty-toggle');
        this.karmaToggle = document.getElementById('karma-toggle');

        // Initialize view type buttons
        this.wifiButton = document.querySelector('.connection-button[title="WiFi"]');
        this.bluetoothButton = document.querySelector('.connection-button[title="Bluetooth"]');
        this.cellularButton = document.querySelector('.connection-button[title="Cellular"]');

        // Initialize state
        this.currentView = null;
        this.isPanelVisible = false;
        this.onViewChange = null;
        this.onViewToggle = null;
        this.previousViewState = {
            isPanelVisible: false,
            currentNetwork: null
        };

        // Initialize view instances
        this.bluetoothView = null;
        this.cellularView = null;

        // Configure initial view state
        this.canvasContainer.style.display = 'block';
        this.canvasContainer.style.opacity = '1';

        // Bind event handlers
        this.viewToggle.addEventListener('click', () => this.toggleView());
        this.setupViewTypeButtons();
        
        // Set initial control visibility
        this.viewToggle.textContent = 'List View';
        this.treeToggle.style.display = 'flex';
        this.hideEmptyToggle.style.display = 'none';
        this.karmaToggle.style.display = 'none';
        
        // Initialize hide-empty state
        this.hideEmptyState = false;
        
        // Set WiFi as default view
        this.setView('wifi');
    }

    setupViewTypeButtons() {
        if (this.wifiButton && this.bluetoothButton && this.cellularButton) {
            this.wifiButton.addEventListener('click', () => this.setView('wifi'));
            this.bluetoothButton.addEventListener('click', () => this.setView('bluetooth'));
            this.cellularButton.addEventListener('click', () => this.setView('cellular'));
        }
    }

    setView(viewType) {
        // Force untoggle karma view if active
        if (this.karmaView?.active && viewType !== 'karma') {
            this.karmaView.toggleKarmaMode();
        }

        // Store previous view state before changing
        if (this.currentView === 'wifi') {
            this.previousViewState = {
                isPanelVisible: this.isPanelVisible,
                currentNetwork: this.wifiView?.getCurrentNetwork()
            };
        }

        // Update button states
        this.wifiButton.classList.remove('active');
        this.bluetoothButton.classList.remove('active');
        this.cellularButton.classList.remove('active');
        
        // Reset to panel view when switching to WiFi
        if (viewType === 'wifi' && this.currentView !== 'wifi') {
            this.isPanelVisible = true;
            // Ensure immediate visibility of required elements
            this.container.style.display = 'block';
            this.canvasContainer.style.display = 'block';
            this.canvasContainer.style.opacity = '1';
            // Show the panel view immediately
            this.showPanelView();
        }
        
        // Clean up previous view
        if (this.currentView === 'wifi') {
            this.wifiView?.resetView();
        } else if (this.currentView === 'bluetooth' && this.bluetoothView) {
            this.bluetoothView.hide();
        }

        switch(viewType) {
            case 'wifi':
                this.wifiButton.classList.add('active');
                // Always show view toggle
                this.viewToggle.style.display = 'flex';
                
                if (this.isPanelVisible) {
                    // Panel view controls
                    this.viewToggle.textContent = '3D View';
                    this.hideEmptyToggle.style.display = 'flex';
                    if (this.hideEmptyState) {
                        this.hideEmptyToggle.classList.add('active');
                    }
                    this.karmaToggle.style.display = 'flex';
                    this.treeToggle.style.display = 'none';
                    // Always show panel when in panel mode
                    this.showPanelView();
                } else {
                    // 3D view controls
                    this.viewToggle.textContent = 'List View';
                    this.treeToggle.style.display = 'flex';
                    this.hideEmptyToggle.style.display = 'none';
                    this.karmaToggle.style.display = 'none';
                    // Show canvas view immediately if coming from another view
                    if (this.currentView !== 'wifi') {
                        this.showCanvasView();
                    }
                }
                break;
            case 'bluetooth':
                // Hide WiFi-specific controls
                this.viewToggle.style.display = 'none';
                this.treeToggle.style.display = 'none';
                this.hideEmptyToggle.style.display = 'none';
                this.karmaToggle.style.display = 'none';
                this.isPanelVisible = false;

                // Reset containers immediately to known state
                this.container.style.display = 'block';
                this.container.classList.add('bluetooth-view');
                this.canvasContainer.style.display = 'block';
                this.canvasContainer.style.opacity = '1';
                
                // Show bluetooth view only after containers are ready
                this.bluetoothButton.classList.add('active');
                if (this.bluetoothView) {
                    this.bluetoothView.show();
                }
                break;

            case 'cellular':
                // Hide WiFi-specific controls
                this.viewToggle.style.display = 'none';
                this.treeToggle.style.display = 'none';
                this.hideEmptyToggle.style.display = 'none';
                this.karmaToggle.style.display = 'none';
                this.isPanelVisible = false;

                // For cellular view, show canvas container with transition
                this.container.style.display = 'none';
                this.canvasContainer.style.display = 'block';
                this.canvasContainer.style.opacity = '1';
                
                this.cellularButton.classList.add('active');
                if (this.cellularView) {
                    this.cellularView.show();
                }
                break;
            default:
                console.warn(`Unknown view type: ${viewType}`);
                this.wifiButton.classList.add('active');
                this.showPanelView();
        }
        
        this.currentView = viewType;
        
        if (this.onViewChange) {
            this.onViewChange(viewType);
        }
    }

    showPanelView() {
        // Store current network before switching views
        if (this.currentView === 'wifi' && !this.karmaView?.active) {
            this.previousViewState.currentNetwork = this.wifiView?.getCurrentNetwork();
        }

        // Handle karma view specially
        if (this.karmaView?.active) {
            // Keep canvas visible for karma mode background
            this.canvasContainer.style.display = 'block';
            this.canvasContainer.style.opacity = '1';
            this.container.style.display = 'none';
        } else {
            // Keep canvas visible at full opacity for normal views
            this.canvasContainer.style.display = 'block';
            this.canvasContainer.style.opacity = '1';
            this.container.style.display = 'block';
        }
        
        // Dispatch view toggled event
        document.dispatchEvent(new CustomEvent('viewToggled', {
            detail: { isPanelView: true }
        }));
        
        this.isPanelVisible = true;
        
        // Update control visibility
        if (this.currentView === 'wifi') {
            this.viewToggle.textContent = '3D View';
            this.hideEmptyToggle.style.display = 'flex';
            this.karmaToggle.style.display = 'flex';
            this.treeToggle.style.display = 'none';
            
            // If not in KARMA mode, show network list
            if (!this.wifiView?.karmaMode) {
                this.wifiView?.createPanelView(this.wifiView.networks || []);
            }
        }
        
        if (this.onViewToggle) {
            this.onViewToggle(true);
        }
    }

    showCanvasView() {
        const isKarmaMode = this.karmaView?.active;
        
        // Store panel visibility before switching views
        if (this.currentView === 'wifi' && !isKarmaMode) {
            this.previousViewState.isPanelVisible = this.isPanelVisible;
        }

        // Handle container visibility based on mode
        if (isKarmaMode && !this.karmaView?.isVisualizingNetwork) {
            // Keep blade container hidden but canvas visible for karma panel view
            this.container.style.display = 'none';
            this.canvasContainer.style.display = 'block';
            this.canvasContainer.style.opacity = '1';
        } else {
            // Normal canvas view behavior
            this.container.style.display = 'none';
            this.canvasContainer.style.display = 'block';
            this.canvasContainer.style.opacity = '1';
        }
        
        this.isPanelVisible = false;
        
        // Update control visibility for wifi view
        if (this.currentView === 'wifi') {
            this.viewToggle.textContent = 'List View';
            this.treeToggle.style.display = 'flex';
            this.hideEmptyToggle.style.display = 'none';
            
            // Keep KARMA toggle visible in KARMA mode
            if (isKarmaMode) {
                this.karmaToggle.style.display = 'flex';
            } else {
                this.karmaToggle.style.display = 'none';
            }
        }
        
        // Dispatch view toggled event
        document.dispatchEvent(new CustomEvent('viewToggled', {
            detail: { isPanelView: false }
        }));
        
        if (this.onViewToggle) {
            this.onViewToggle(false);
        }
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    toggleView() {
        // Only allow view toggling in WiFi view
        if (this.currentView === 'wifi') {
            const isKarmaMode = this.karmaView?.active;
            
            if (this.isPanelVisible) {
                // Check if we can switch to canvas view
                if (!isKarmaMode && !this.wifiView?.getCurrentNetwork()) {
                    this.showToast('Please select a network first');
                    return;
                }
                
                // Common canvas view settings
                this.viewToggle.textContent = 'List View';
                this.treeToggle.style.display = 'flex';
                this.hideEmptyToggle.style.display = 'none';
                
                if (isKarmaMode) {
                    // Keep KARMA toggle visible in 3D view
                    this.karmaToggle.style.display = 'flex';
                    // Show canvas view first
                    this.showCanvasView();
                    // Then update visualization
                    this.karmaView.toggleVisualization(true);
                } else {
                    this.karmaToggle.style.display = 'none';
                    this.showCanvasView();
                }
                
                this.isPanelVisible = false;
            } else {
                // Common panel view settings
                this.viewToggle.textContent = '3D View';
                this.hideEmptyToggle.style.display = 'flex';
                this.karmaToggle.style.display = 'flex';
                this.treeToggle.style.display = 'none';
                
                if (isKarmaMode) {
                    // Update visualization first
                    this.karmaView.toggleVisualization(false);
                }
                
                this.showPanelView();
                this.isPanelVisible = true;
            }
        }
    }

    getCurrentView() {
        return this.currentView;
    }

    isPanelViewVisible() {
        return this.isPanelVisible;
    }

    setViewChangeCallback(callback) {
        this.onViewChange = callback;
    }

    setViewToggleCallback(callback) {
        this.onViewToggle = callback;
    }

    setBluetoothView(view) {
        this.bluetoothView = view;
    }

    setCellularView(view) {
        this.cellularView = view;
    }

    setKarmaView(view) {
        this.karmaView = view;
    }

    getNetworkVisualizer() {
        return window.networkVisualizer;
    }

    getPreviousViewState() {
        return this.previousViewState;
    }

    restorePreviousViewState() {
        if (this.currentView === 'wifi' && this.previousViewState) {
            if (this.previousViewState.isPanelVisible) {
                this.showPanelView();
            } else {
                this.showCanvasView();
            }
            if (this.wifiView && this.previousViewState.currentNetwork) {
                this.wifiView.currentNetwork = this.previousViewState.currentNetwork;
            }
        }
    }
}

export default ViewManager;
