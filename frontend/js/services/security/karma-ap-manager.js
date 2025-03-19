export class KarmaAPManager {
    constructor(karmaVisualizer) {
        this.karmaVisualizer = karmaVisualizer;
        this.activeButtons = new Map(); // Map of SSID -> button element
        this.activeStreams = new Map(); // Map of SSID -> {reader, decoder}
        this.persistentState = new Map(); // Map of SSID -> {isRunning: boolean}
    }

    createButton() {
        const button = document.createElement('button');
        button.className = 'karma-ap-button';
        button.innerHTML = '<i class="fa-solid fa-wifi"></i> Create KARMA-AP';
        return button;
    }

    createStopButton(ssid, wifiInterface) {
        const stopButton = document.createElement('button');
        stopButton.className = 'stop-button';
        stopButton.innerHTML = '<i class="fa-solid fa-pause"></i> Stop';
        stopButton.style.backgroundColor = '#ff6b6b';
        stopButton.style.color = 'white';
        stopButton.style.border = 'none';
        stopButton.style.padding = '5px 10px';
        stopButton.style.cursor = 'pointer';
        stopButton.style.flex = '1';

        console.log('Creating KARMA-AP stop button:', { ssid });

        stopButton.addEventListener('click', () => {
            this.handleStop(ssid, wifiInterface);
        });

        return stopButton;
    }

    setupButton(button, ssid, wifiInterface, wanInterface, band) {
        // Check if interface is selected in settings
        if (!wifiInterface) {
            document.getElementById('toast').textContent = 'No interface selected';
            document.getElementById('toast').classList.add('show');
            setTimeout(() => {
                document.getElementById('toast').classList.remove('show');
            }, 3000);
            return;
        }

        if (!button || !ssid || !band) {
            console.error('Missing required parameters:', {
                hasButton: !!button,
                hasSSID: !!ssid,
                hasWifiInterface: !!wifiInterface,
                hasBand: !!band
            });
            throw new Error('Missing required parameters for KARMA-AP setup');
        }

        console.log('KarmaAPManager.setupButton called with:', {
            ssid,
            hasButton: !!button,
            wifiInterface,
            wanInterface: wanInterface || 'eth0',
            band
        });

        button.innerHTML = '<i class="fa-solid fa-wifi"></i> Create KARMA-AP';
        button.classList.remove('running');
        button.style.pointerEvents = 'auto';
        button.disabled = false;

        if (button.classList.contains('running')) {
            console.log('Button validation failed:', {
                buttonExists: !!button,
                isRunning: true
            });
            return;
        }

        const persistentState = this.persistentState.get(ssid);
        console.log('Persistent state for', ssid, ':', persistentState);
        
        if (persistentState?.isRunning) {
            console.log('Restoring running state:', {
                ssid,
                state: persistentState
            });

            button.innerHTML = '<i class="fa-solid fa-wifi"></i> KARMA-AP running';
            button.style.backgroundColor = '#388E3C';
            button.classList.add('running');
            button.disabled = true;
            button.style.pointerEvents = 'none';

            const deviceLabel = button.closest('.device-label');
            if (deviceLabel?.classList.contains('expanded')) {
                requestAnimationFrame(() => deviceLabel.classList.add('expanded'));
            }
            
            const icon = button.querySelector('i');
            if (icon) icon.classList.remove('spinning');

            const stopButton = this.createStopButton(ssid, wifiInterface);
            stopButton.style.marginLeft = '10px';
            button.parentNode.insertBefore(stopButton, button.nextSibling);

        } else {
            button.classList.add('running');
            button.innerHTML = '<i class="fa-solid fa-wifi spinning"></i> Creating KARMA-AP...';

            button.setAttribute('data-wifi-interface', wifiInterface);
            button.setAttribute('data-wan-interface', wanInterface);
            button.setAttribute('data-band', band);
            this.activeButtons.set(ssid, button);

            this.startKarmaAP(ssid, wifiInterface, wanInterface, band);
        }
    }

    async startKarmaAP(ssid, wifiInterface, wanInterface, band, retryCount = 0) {
        const button = this.activeButtons.get(ssid);
        if (!button) {
            console.error('No active button found for ssid:', ssid);
            return;
        }

        const effectiveWanInterface = wanInterface || 'eth0';
        
        console.log('Starting KARMA-AP with config:', {
            ssid,
            wifiInterface,
            wanInterface: effectiveWanInterface,
            band,
            retryCount
        });

        try {
            const requestBody = {
                args: [
                    'up',
                    wifiInterface,
                    effectiveWanInterface,
                    ssid,
                    band,
                    'NONE'  // KARMA-APs are always open
                ]
            };

            const response = await fetch('/api/mitmrouter/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Network response was not ok: ${response.status} ${response.statusText}\n${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            
            this.activeStreams.set(ssid, {
                reader,
                decoder,
                metadata: {
                    ssid,
                    interface: wifiInterface,
                    band
                }
            });
            
            await this.processStreamResponse(ssid, retryCount);
        } catch (error) {
            this.handleError(ssid);
            console.error('Error creating KARMA-AP:', error);
        }
    }

    async processStreamResponse(ssid, retryCount) {
        const button = this.activeButtons.get(ssid);
        const stream = this.activeStreams.get(ssid);
        if (!button || !stream) return;

        try {
            const { value, done } = await stream.reader.read();
            
            if (done) {
                this.resetButton(ssid);
                return;
            }

            const chunk = stream.decoder.decode(value, { stream: true });
            console.log('KARMA-AP hostapd output:', chunk);

            if (chunk.includes('AP-ENABLED')) {
                console.log('KARMA-AP successfully enabled');
                this.handleSuccess(ssid);
            } else if (chunk.includes('error') || chunk.includes('Error')) {
                console.error('KARMA-AP hostapd error:', chunk);
                this.handleError(ssid);
            } else if (chunk.includes("hostapd_free_hapd_data: Interface") && retryCount < 2) {
                console.log('Interface freed, retrying...');
                setTimeout(() => {
                    const button = this.activeButtons.get(ssid);
                    if (!button) return;
                    const wifiInterface = button.getAttribute('data-wifi-interface');
                    const wanInterface = button.getAttribute('data-wan-interface');
                    const band = button.getAttribute('data-band');
                    this.startKarmaAP(ssid, wifiInterface, wanInterface, band, retryCount + 1);
                }, 1000);
                return;
            }

            return this.processStreamResponse(ssid, retryCount);
        } catch (error) {
            console.error('Error processing stream:', error);
            this.handleError(ssid);
        }
    }

    handleSuccess(ssid) {
        const button = this.activeButtons.get(ssid);
        if (!button) return;

        const wifiInterface = button.getAttribute('data-wifi-interface');
        const band = button.getAttribute('data-band');
        
        button.disabled = true;
        button.style.pointerEvents = 'none';

        const state = {
            isRunning: true,
            wifiInterface,
            band
        };

        console.log('Storing KARMA-AP state:', {
            ssid,
            state
        });
        
        this.persistentState.set(ssid, state);

        // Update visualization
        const deviceLabel = button.closest('.device-label');
        const nodeId = deviceLabel?.getAttribute('data-node-id');
        
        if (nodeId && window.networkVisualizer) {
            const node = window.networkVisualizer.getNodes().get(nodeId);
            if (node) {
                node.userData.data = {
                    ...node.userData.data,
                    isOffline: false,
                    manufacturer: "KARMA-AP"
                };

                this.karmaVisualizer.updateNodeMaterials(node, false);
                
                // Dispatch state update event
                document.dispatchEvent(new CustomEvent('deviceUpdated', {
                    detail: {
                        ssid,
                        karmaAP: {
                            isOffline: false,
                            useRedModel: true
                        }
                    }
                }));
            }
        }

        // Update UI state
        button.innerHTML = '<i class="fa-solid fa-wifi"></i> KARMA-AP running';
        button.style.backgroundColor = '#388E3C';
        button.classList.add('running');
        const icon = button.querySelector('i');
        if (icon) icon.classList.remove('spinning');

        // Add stop button
        const stopButton = this.createStopButton(ssid, wifiInterface);
        stopButton.style.marginLeft = '10px';
        button.parentNode.insertBefore(stopButton, button.nextSibling);

        // Store state in localStorage
        localStorage.setItem(`karmaAPState_${ssid}`, JSON.stringify(state));
    }

    async handleStop(ssid, wifiInterface) {
        const button = this.activeButtons.get(ssid);
        if (!button) return;

        const stopButton = button.parentNode.querySelector('.stop-button');
        if (stopButton) {
            stopButton.disabled = true;
            stopButton.style.pointerEvents = 'none';
            stopButton.innerHTML = '<i class="fa-solid fa-pause"></i> Stopping...';
        }

        button.disabled = true;
        button.style.pointerEvents = 'none';

        await this.stopKarmaAP(ssid, wifiInterface);
    }

    async stopKarmaAP(ssid, wifiInterface, retryCount = 0) {
        try {
            const stopResponse = await fetch('/api/stop-mitmrouter', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    args: ['down', wifiInterface, '', '', '', '']
                })
            });

            if (!stopResponse.ok) {
                throw new Error('Failed to stop KARMA-AP');
            }

            const resetResponse = await fetch('/api/reset-interface', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    interface: wifiInterface
                })
            });

            if (!resetResponse.ok) {
                throw new Error('Failed to reset interface');
            }

            this.resetButton(ssid);
        } catch (error) {
            console.error('Error in stopKarmaAP:', error);
            
            if (retryCount < 2) {
                setTimeout(() => {
                    this.stopKarmaAP(ssid, wifiInterface, retryCount + 1);
                }, 1000);
            } else {
                console.error('Failed to stop KARMA-AP after retries:', error);
                this.resetButton(ssid);
            }
        }
    }

    resetButton(ssid) {
        const button = this.activeButtons.get(ssid);
        if (!button) return;

        button.classList.remove('running');
        button.style.backgroundColor = '';
        button.style.pointerEvents = 'auto';
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-wifi"></i> Create KARMA-AP';

        const deviceLabel = button.closest('.device-label');
        if (deviceLabel) {
            // Update UI
            deviceLabel.setAttribute('data-karma-ap-offline', 'true');
            const manufacturerSpan = deviceLabel.querySelector('.manufacturer');
            if (manufacturerSpan && !manufacturerSpan.textContent.includes('(Offline)')) {
                manufacturerSpan.textContent += ' (Offline)';
            }
            
            // Update visualization
            const nodeId = deviceLabel.getAttribute('data-node-id');
            if (window.networkVisualizer && nodeId) {
                const node = window.networkVisualizer.getNodes().get(nodeId);
                if (node) {
                    node.userData.data = {
                        ...node.userData.data,
                        useRedModel: false,
                        isOffline: true,
                        manufacturer: "KARMA-AP (Offline)"
                    };
                    
                    // Update materials to offline state
                    this.karmaVisualizer.updateNodeMaterials(node, true);
                    
                    // Dispatch state update event
                    document.dispatchEvent(new CustomEvent('deviceUpdated', {
                        detail: {
                            ssid,
                            karmaAP: {
                                isOffline: true,
                                useRedModel: false
                            }
                        }
                    }));
                }
            }
        }

        const stopButton = button.parentNode.querySelector('.stop-button');
        if (stopButton) {
            stopButton.remove();
        }

        this.activeButtons.delete(ssid);
        this.activeStreams.delete(ssid);
        this.persistentState.delete(ssid);
        localStorage.removeItem(`karmaAPState_${ssid}`);
    }

    handleError(ssid) {
        const button = this.activeButtons.get(ssid);
        if (!button) return;

        button.innerHTML = '<i class="fa-solid fa-wifi"></i> Create KARMA-AP';
        button.classList.remove('running');
        button.style.pointerEvents = 'auto';
        button.disabled = false;
        button.style.opacity = '1';
        button.style.backgroundColor = '';
        
        const icon = button.querySelector('i');
        if (icon) icon.classList.remove('spinning');

        const stopButton = button.parentNode.querySelector('.stop-button');
        if (stopButton) {
            stopButton.remove();
        }

        const deviceLabel = button.closest('.device-label');
        if (deviceLabel) {
            deviceLabel.setAttribute('data-karma-ap-offline', 'true');
            const manufacturerSpan = deviceLabel.querySelector('.manufacturer');
            if (manufacturerSpan && !manufacturerSpan.textContent.includes('(Offline)')) {
                manufacturerSpan.textContent += ' (Offline)';
            }
        }

        this.activeButtons.delete(ssid);
        this.activeStreams.delete(ssid);
        this.persistentState.delete(ssid);
    }

    cleanup() {
        this.activeButtons.clear();
        this.activeStreams.clear();
        this.persistentState.clear();
    }
}
