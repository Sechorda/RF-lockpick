export class EvilTwinManager {
    constructor() {
        this.activeButtons = new Map(); // Map of SSID -> button element
        this.activeStreams = new Map(); // Map of SSID -> {reader, decoder}
        this.persistentState = new Map(); // Map of SSID -> {isRunning: boolean, targetMac: string}
        
        // Create materials for evil twin APs
        this.offlineMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080,
            emissive: 0x404040,
            shininess: 70,
            transparent: true,
            opacity: 0.9
        });

        this.materials = {
            evilAp: new THREE.MeshPhongMaterial({
                color: 0xff0000,
                emissive: 0x660000,
                shininess: 70,
                transparent: true,
                opacity: 0.9
            }),
            evilIndicator: new THREE.MeshPhongMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: 2,
                shininess: 100,
                transparent: true,
                opacity: 0.9
            }),
            // Additional materials for various states
            evilHighlight: new THREE.MeshPhongMaterial({
                color: 0xff3333,
                emissive: 0xff0000,
                emissiveIntensity: 1.5,
                shininess: 90,
                transparent: true,
                opacity: 0.95
            })
        };

        // Force materials to initialize
        Object.values(this.materials).forEach(material => {
            material.needsUpdate = true;
        });
    }

    getPersistentState(ssid) {
        return this.persistentState.get(ssid);
    }

    setPersistentState(ssid, state) {
        this.persistentState.set(ssid, state);
    }

    clearPersistentState(ssid) {
        this.persistentState.delete(ssid);
    }

    createButton() {
        const button = document.createElement('button');
        button.className = 'evil-twin-button';
        button.innerHTML = '<i class="fa-solid fa-users"></i> Create Evil-Twin';
        return button;
    }

    createStopButton(ssid, wifiInterface) {
        const stopButton = document.createElement('button');
        stopButton.className = 'ap-stop-button';
        stopButton.innerHTML = '<i class="fa-solid fa-pause"></i> Stop';

        stopButton.addEventListener('click', () => {
            this.handleStop(ssid, wifiInterface);
        });

        return stopButton;
    }

    setupButton(button, ssid, psk, wifiInterface, wanInterface, targetMac, band) {
        // Check if interface is selected in settings
        if (!wifiInterface) {
            document.getElementById('toast').textContent = 'No interface selected';
            document.getElementById('toast').classList.add('show');
            setTimeout(() => {
                document.getElementById('toast').classList.remove('show');
            }, 3000);
            return;
        }

        // Validate required parameters
        if (!button || !ssid || !band) {
            console.error('Missing required parameters:', {
                hasButton: !!button,
                hasSSID: !!ssid,
                hasWifiInterface: !!wifiInterface,
                hasBand: !!band
            });
            throw new Error('Missing required parameters for AP setup');
        }

        const effectivePsk = psk || 'NONE';

        console.log('EvilTwinManager.setupButton called with:', {
            ssid,
            hasButton: !!button,
            wifiInterface,
            wanInterface: wanInterface || 'eth0',
            targetMac,
            band,
            effectivePsk
        });

        // Reset button state
        const buttonText = 'Create Evil-Twin';
        const iconHtml = '<i class="fa-solid fa-users"></i>';
        
        button.innerHTML = `${iconHtml} ${buttonText}`;
        button.classList.remove('running', 'creating');
        button.style.pointerEvents = 'auto';
        button.disabled = false;

        // Check if button exists and is not already running
        if (!button || button.classList.contains('running')) {
            console.log('Button validation failed:', {
                buttonExists: !!button,
                isRunning: button?.classList.contains('running')
            });
            return;
        }

        const persistentState = this.getPersistentState(ssid);
        console.log('Persistent state for', ssid, ':', persistentState);
        
        if (persistentState && persistentState.isRunning) {
            button.innerHTML = '<i class="fa-solid fa-users"></i> Evil-Twin running';
            button.style.backgroundColor = '#388E3C';
            button.classList.add('running');
            button.disabled = true;
            button.style.pointerEvents = 'none';

            // Ensure expanded state is maintained
            const deviceLabel = button.closest('.device-label');
            if (deviceLabel?.classList.contains('expanded')) {
                requestAnimationFrame(() => deviceLabel.classList.add('expanded'));
            }
            const icon = button.querySelector('i');
            if (icon) icon.classList.remove('spinning');

            // Create and position the stop button
            const stopButton = this.createStopButton(ssid, wifiInterface);
            button.parentNode.insertBefore(stopButton, button.nextSibling);

            console.log('Added stop button for running AP:', {
                ssid,
                state: persistentState
            });
        } else {
            button.classList.add('creating');
            const buttonText = 'Creating evil-twin...';
            button.innerHTML = '<i class="fa-solid fa-users spinning"></i> ' + buttonText;

            // Store button reference and attributes
            button.setAttribute('data-target-mac', targetMac);
            button.setAttribute('data-psk', psk || '');
            button.setAttribute('data-wifi-interface', wifiInterface);
            button.setAttribute('data-wan-interface', wanInterface);
            button.setAttribute('data-band', band);
            this.activeButtons.set(ssid, button);

            console.log('Button setup complete:', {
                ssid,
                psk: psk || '',
                band
            });

            this.startEvilTwin(ssid, psk || '', wifiInterface, wanInterface, band, 0);
        }
    }

    async startEvilTwin(ssid, psk, wifiInterface, wanInterface, band, retryCount = 0) {
        // Validate required parameters
        if (!ssid || !wifiInterface || !band) {
            console.error('Missing required parameters for startEvilTwin:', {
                hasSSID: !!ssid,
                hasWifiInterface: !!wifiInterface,
                hasBand: !!band
            });
            throw new Error('Missing required parameters for startEvilTwin');
        }

        const button = this.activeButtons.get(ssid);
        if (!button) {
            console.error('No active button found for ssid:', ssid);
            return;
        }

        // Get PSK from button attributes on retry, otherwise use passed value
        const currentPsk = retryCount > 0 ? button.getAttribute('data-psk') : psk;
        const effectiveWanInterface = wanInterface || 'eth0';
        
        console.log('Starting AP with config:', {
            ssid,
            psk: currentPsk ? '[PSK PRESENT]' : '[NO PSK - OPEN]',
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
                    currentPsk || 'NONE'
                ]
            };

            console.log('Making API request:', requestBody);
            
            const response = await fetch('/api/mitmrouter/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || `Network response was not ok: ${response.status} ${response.statusText}`;
                } catch {
                    errorMessage = `Network response was not ok: ${response.status} ${response.statusText}\n${errorText}`;
                }
                console.error('API response error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText,
                    args: requestBody.args
                });
                throw new Error(errorMessage);
            }

            console.log('Stream connection established for', {
                ssid: requestBody.args[3],
                interface: requestBody.args[1],
                band: requestBody.args[4]
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            
            this.activeStreams.set(ssid, {
                reader,
                decoder,
                metadata: {
                    ssid,
                    interface: requestBody.args[1],
                    band: requestBody.args[4]
                }
            });
            
            await this.processStreamResponse(ssid, retryCount);
        } catch (error) {
            this.handleError(ssid);
            console.error('Error creating evil-twin:', error);
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
            console.log('Hostapd output:', chunk);

            if (chunk.includes('AP-ENABLED')) {
                console.log('AP successfully enabled');
                this.handleSuccess(ssid);
            } else if (chunk.includes('error') || chunk.includes('Error')) {
                console.error('Hostapd error:', chunk);
                this.handleError(ssid);
            } else if (chunk.includes("hostapd_free_hapd_data: Interface") && retryCount < 2) {
                console.log('Interface freed, retrying...');
                setTimeout(() => {
                    const button = this.activeButtons.get(ssid);
                    if (!button) return;
                    const wifiInterface = button.getAttribute('data-wifi-interface');
                    const wanInterface = button.getAttribute('data-wan-interface');
                    const psk = button.getAttribute('data-psk');
                    const band = button.getAttribute('data-band');
                    this.startEvilTwin(ssid, psk, wifiInterface, wanInterface, band, retryCount + 1);
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
        const targetMac = button.getAttribute('data-target-mac');
        const band = button.getAttribute('data-band');
        const psk = button.getAttribute('data-psk');

        button.disabled = true;
        button.style.pointerEvents = 'none';

        // Store persistent state
        const state = {
            isRunning: true,
            targetMac: targetMac,
            wifiInterface: wifiInterface,
            band: band,
            psk: psk
        };

        console.log('Storing AP state:', {
            ssid,
            state
        });
        this.setPersistentState(ssid, state);

        // Remove offline state and update node appearance
        const deviceLabel = button.closest('.device-label');
        
        if (window.networkVisualizer && deviceLabel) {
            deviceLabel.removeAttribute('data-evil-twin-offline');
            deviceLabel.removeAttribute('data-ap-offline');
            
            const manufacturerSpan = deviceLabel.querySelector('.manufacturer');
            if (manufacturerSpan) {
                const text = manufacturerSpan.textContent;
                manufacturerSpan.textContent = text.replace(' (Offline)', '');
            }

            // Update the node appearance
            const nodeId = deviceLabel.getAttribute('data-node-id');
            const node = window.networkVisualizer.getNodes().get(nodeId);
            if (node) {
                if (window.networkVisualizer.updateNodeMaterials) {
                    window.networkVisualizer.updateNodeMaterials(node, this.materials.evilAp);
                }
                
                // Update node data
                node.userData.data = {
                    ...node.userData.data,
                    psk: psk || 'NONE',
                    isOffline: false,
                    kismet_device_base_macaddr: "00:11:22:33:44:55",
                    manufacturer: node.userData.data.manufacturer.replace(' (Offline)', '')
                };

                // Apply materials
                node.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.material = this.materials.evilAp.clone();
                        child.material.needsUpdate = true;
                    }
                });

                if (window.networkVisualizer) {
                    window.networkVisualizer.startAnimation();
                    window.networkVisualizer.sceneManager?.render();
                }
            }
        }

        button.innerHTML = '<i class="fa-solid fa-users"></i> Evil-Twin running';
        button.style.backgroundColor = '#388E3C';
        button.classList.remove('creating');
        button.classList.add('running');
        
        const icon = button.querySelector('i');
        if (icon) icon.classList.remove('spinning');

        // Create stop button
        const stopButton = this.createStopButton(ssid, wifiInterface);
        button.parentNode.insertBefore(stopButton, button.nextSibling);

        // Save state to local storage
        const storageState = {
            isRunning: true,
            targetMac: targetMac,
            wifiInterface: wifiInterface,
            band: band,
            psk: psk
        };

        localStorage.setItem(`evilTwinState_${ssid}`, JSON.stringify(storageState));
    }

    async handleStop(ssid, wifiInterface) {
        const button = this.activeButtons.get(ssid);
        if (!button) return;

        const stopButton = button.parentNode.querySelector('.ap-stop-button');
        if (stopButton) {
            stopButton.disabled = true;
            stopButton.style.pointerEvents = 'none';
            stopButton.innerHTML = '<i class="fa-solid fa-pause"></i> Stopping...';
        }

        button.disabled = true;
        button.style.pointerEvents = 'none';

        await this.stopMitmRouter(ssid, wifiInterface);
    }

    async stopMitmRouter(ssid, wifiInterface, retryCount = 0) {
        const button = this.activeButtons.get(ssid);
        if (!button) return;

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
                throw new Error('Failed to stop mitmrouter');
            }

            console.log('Stopping evil twin, resetting interface:', wifiInterface);
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
            console.error('Error in stopMitmRouter:', error);
            
            if (retryCount < 2) {
                setTimeout(() => {
                    this.stopMitmRouter(ssid, wifiInterface, retryCount + 1);
                }, 1000);
            } else {
                console.error('Failed to stop evil-twin after retries:', error);
                this.resetButton(ssid);
            }
        }
    }

    resetButton(ssid) {
        const button = this.activeButtons.get(ssid);
        if (button) {
            button.classList.remove('running', 'creating');
            button.style.backgroundColor = '';
            button.style.pointerEvents = 'auto';
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-users"></i> Create Evil-Twin';

            const deviceLabel = button.closest('.device-label');
            if (deviceLabel) {
                deviceLabel.setAttribute('data-evil-twin-offline', 'true');
                
                const manufacturerSpan = deviceLabel.querySelector('.manufacturer');
                if (manufacturerSpan && !manufacturerSpan.textContent.includes('(Offline)')) {
                    manufacturerSpan.textContent += ' (Offline)';
                }
                
                const nodeId = deviceLabel.getAttribute('data-node-id');
                if (window.networkVisualizer && nodeId) {
                    const node = window.networkVisualizer.getNodes().get(nodeId);
                    if (node) {
                        node.traverse((child) => {
                            if (child instanceof THREE.Mesh) {
                                child.material = this.offlineMaterial.clone();
                                child.material.needsUpdate = true;
                            }
                        });

                        if (window.networkVisualizer) {
                            window.networkVisualizer.startAnimation();
                            window.networkVisualizer.sceneManager?.render();
                        }
                    }
                }
            }
            
            const stopButton = button.parentNode.querySelector('.ap-stop-button');
            if (stopButton) {
                stopButton.remove();
            }
        }

        this.activeButtons.delete(ssid);
        this.activeStreams.delete(ssid);
        this.clearPersistentState(ssid);
        localStorage.removeItem(`evilTwinState_${ssid}`);
    }

    handleError(ssid) {
        const button = this.activeButtons.get(ssid);
        if (button) {
            button.innerHTML = '<i class="fa-solid fa-users"></i> Create Evil-Twin';
            button.classList.remove('running', 'creating');
            button.style.pointerEvents = 'auto';
            button.disabled = false;
            button.style.opacity = '1';
            button.style.backgroundColor = '';
            
            const icon = button.querySelector('i');
            if (icon) icon.classList.remove('spinning');

            const stopButton = button.parentNode.querySelector('.ap-stop-button');
            if (stopButton) {
                stopButton.remove();
            }

            const deviceLabel = button.closest('.device-label');
            if (deviceLabel) {
                deviceLabel.setAttribute('data-evil-twin-offline', 'true');
                const manufacturerSpan = deviceLabel.querySelector('.manufacturer');
                if (manufacturerSpan && !manufacturerSpan.textContent.includes('(Offline)')) {
                    manufacturerSpan.textContent += ' (Offline)';
                }
            }
        }
        this.activeButtons.delete(ssid);
        this.activeStreams.delete(ssid);
        this.clearPersistentState(ssid);
    }
}
