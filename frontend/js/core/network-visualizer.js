import { DeviceLabel, LabelManager } from '../components/labels/label-utils.js';
import { EvilTwinVisualizer } from './evil-twin-visualizer.js';

export class NetworkVisualizer {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.nodes = new Map();
        this.connections = [];
        this.nodeTargetPositions = new Map();
        this.isAnimating = false;
        this.isListView = false;
        this.ANIMATION_DURATION = 1200;
        this.animationStartTime = 0;
        this.materials = this.sceneManager.getMaterials();

        // Add karma connection material for dashed lines
        this.materials.karmaConnection = new THREE.LineDashedMaterial({
            color: 0x4287f5,
            linewidth: 1,
            scale: 2,
            dashSize: 0.1,
            gapSize: 0.1,
            opacity: 0.6,
            transparent: true
        });

        // Initialize evil twin visualizer
        this.evilTwinVisualizer = new EvilTwinVisualizer(this, sceneManager);

        // Store reference to this instance for evil twin manager
        window.networkVisualizer = this;

        this.labelManager = new LabelManager();
        this.setupGeometries();
        this.setupLabelContainer();
    }

switchClientAP(macAddress) {
    const clientNode = Array.from(this.nodes.values()).find(node => node.userData?.data?.kismet_device_base_macaddr === macAddress);
    if (!clientNode) {
        console.error('[Debug] Client node not found for MAC address:', macAddress);
        return;
    }

    const currentAP = clientNode.userData.apNode;
    const availableAPs = Array.from(this.nodes.values()).filter(node => node.userData?.type === 'ap' && node !== currentAP);

    if (availableAPs.length === 0) {
        console.log('[Debug] No available APs to switch to for client:', macAddress);
        return;
    }

    const newAP = availableAPs[Math.floor(Math.random() * availableAPs.length)];

    // Calculate new position
    const clientIndex = newAP.userData.data.clients.length;
    const newPosition = this.calculateClientPosition(newAP.position.x, clientIndex, newAP.userData.data.clients.length);

    // First phase: Switch connection but maintain position
    const initialConnection = this.createConnection(currentAP, clientNode, this.isListView);
    initialConnection.material = initialConnection.material.clone();
    initialConnection.material.transparent = true;
    initialConnection.material.opacity = 0.4;

    const switchConnectionStartTime = Date.now();
    const switchConnection = () => {
        const elapsed = Date.now() - switchConnectionStartTime;
        const progress = Math.min(elapsed / (this.ANIMATION_DURATION / 2), 1);

        // Fade out initial connection
        if (initialConnection) {
            initialConnection.material.opacity = 0.4 * (1 - progress);
        }

        if (progress === 1) {
            // Remove old connection
            if (initialConnection) {
                this.sceneManager.remove(initialConnection);
                const index = this.connections.indexOf(initialConnection);
                if (index > -1) this.connections.splice(index, 1);
            }

            // Create connection to new AP
            const newConnection = this.createConnection(newAP, clientNode, this.isListView);
            newConnection.material = newConnection.material.clone();
            newConnection.material.transparent = true;
            newConnection.material.opacity = 0;

            // Start position animation
            this.startAnimation();
            this.nodeTargetPositions.set(clientNode.uuid, newPosition);

            const moveStartTime = Date.now();
            const moveAnimation = () => {
                const moveElapsed = Date.now() - moveStartTime;
                const moveProgress = Math.min(moveElapsed / (this.ANIMATION_DURATION / 2), 1);

                // Fade in new connection
                if (newConnection) {
                    newConnection.material.opacity = 0.4 * moveProgress;
                }

                if (moveProgress === 1) {
                    // Update client's AP reference
                    clientNode.userData.apNode = newAP;

                    // Update client data in APs
                    newAP.userData.data.clients.push(clientNode.userData.data);
                    currentAP.userData.data.clients = currentAP.userData.data.clients.filter(
                        client => client.kismet_device_base_macaddr !== macAddress
                    );

                    return;
                }

                requestAnimationFrame(moveAnimation);
            };
            moveAnimation();

            return;
        }

        requestAnimationFrame(switchConnection);
    };
    switchConnection();
}

    setupLabelContainer() {
        // Create container for AP and SSID labels
        this.labelContainer = document.createElement('div');
        this.labelContainer.className = 'label-container';
        
        // Add CSS to ensure proper pointer events for AP/SSID labels
        const style = document.createElement('style');
        style.textContent = `
            #${this.labelContainer.id} .device-label {
                pointer-events: none;
            }
            #${this.labelContainer.id} .device-label .basic-label,
            #${this.labelContainer.id} .device-label .details-panel,
            #${this.labelContainer.id} .device-label .audit-button,
            #${this.labelContainer.id} .device-label .detail-value[onclick],
            #${this.labelContainer.id} .device-label .psk-value:not(.empty) {
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(style);
        
        // Set unique ID and add to DOM
        this.labelContainer.id = 'ap-ssid-labels';
        document.getElementById('canvas-container').appendChild(this.labelContainer);
    }

    setupGeometries() {
        this.geometries = {
            ssid: this.createWiFiGeometry(),
            ap: this.createRouterGeometry(),
            client: new THREE.SphereGeometry(0.12, 16, 16)
        };
    }

    createWiFiGeometry() {
        const group = new THREE.Group();
        const arcRadii = [0.7, 0.45, 0.25];
        const arcThickness = 0.04;
        const arcSpacing = 0.12;
        arcRadii.forEach((radius, index) => {
            const arc = new THREE.Mesh(
                new THREE.TorusGeometry(radius, arcThickness, 32, 48, Math.PI),
                this.materials.ssid
            );
            arc.rotation.x = Math.PI / 4;
            arc.rotation.y = Math.PI;
            arc.position.y = -index * arcSpacing;
            group.add(arc);
        });
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 32, 32),
            this.materials.ssid
        );
        dot.position.y = -(arcRadii.length * arcSpacing + 0.05);
        group.add(dot);
        group.scale.set(0.7, 0.7, 0.7);
        return group;
    }

    createRouterGeometry() {
        const group = new THREE.Group();
        const diskGeometry = new THREE.CylinderGeometry(0.3, 0.3 * 0.98, 0.04, 32, 2);
        const disk = new THREE.Mesh(diskGeometry, this.materials.ap);
        disk.rotation.x = Math.PI / 2;
        group.add(disk);
        const ringGeometry = new THREE.RingGeometry(0.046, 0.05, 32);
        const frontRing = new THREE.Mesh(ringGeometry, this.materials.apRing);
        frontRing.position.z = 0.02;
        frontRing.rotation.x = -Math.PI/2;
        group.add(frontRing);
        const backRingMaterial = this.materials.apRing.clone();
        backRingMaterial.opacity = 0.3;
        const backRing = new THREE.Mesh(ringGeometry, backRingMaterial);
        backRing.position.z = -0.02;
        backRing.rotation.x = Math.PI/2;
        group.add(backRing);
        const indicatorLight = new THREE.Mesh(
            new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16),
            new THREE.MeshPhongMaterial({
                color: 0x0066ff,
                emissive: 0x0066ff,
                emissiveIntensity: 2,
                shininess: 100,
            })
        );
        indicatorLight.rotation.x = Math.PI/2;
        indicatorLight.position.set(0, 0, 0.021);
        group.add(indicatorLight);
        const antennaHorizontal = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8),
            this.materials.ap
        );
        antennaHorizontal.rotation.z = Math.PI / 2;
        antennaHorizontal.position.set(-0.36, 0, -0.004);
        group.add(antennaHorizontal);
        const joint = new THREE.Mesh(
            new THREE.SphereGeometry(0.012, 8, 8),
            this.materials.ap
        );
        joint.position.set(-0.42, 0, -0.004);
        group.add(joint);
        const antennaVertical = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8),
            this.materials.ap
        );
        antennaVertical.position.set(-0.42, 0.15, -0.004);
        group.add(antennaVertical);
        return group;
    }

    createNode(type, data, position, existingLabels = null) {
        const mesh = type === 'ssid' || type === 'ap' ?
            this.geometries[type].clone() :
            new THREE.Mesh(this.geometries[type], this.materials[type]);
        mesh.position.copy(position);
        mesh.userData = { 
            type, 
            data,
            nodeType: type,  // Explicit type for easier checking
            spawnPosition: type === 'ap' ? position.clone() : null  // Store initial position for APs
        };

        // Create or reuse label based on node type
        if (type === 'client') {
            // Use LabelManager only for client nodes
            const labelData = {
                ...data,
                nodeId: data.nodeId || mesh.uuid  // Use provided nodeId or fallback to mesh.uuid
            };
            const label = this.labelManager.getOrCreateLabel(labelData);
            mesh.userData.labelInstance = label;
            
            // Set the node ID on the element for lookup
            label.element.setAttribute('data-node-id', labelData.nodeId);
        } else {
            // Try to reuse existing AP/SSID label or create new one
            const uniqueId = `${data.kismet_device_base_macaddr}-${type}`;
            let label = existingLabels?.get(uniqueId);

            if (label) {
                // Update existing label with new data
                label.updateData(data);
            } else {
                // Create new label
                label = new DeviceLabel(data, this.labelContainer);
            }

            // Update initial position
            const screenPos = this.sceneManager.projectToScreen(position);
            const distance = this.sceneManager.getDistanceToCamera(position);
            label.updatePosition(screenPos.x, screenPos.y, distance);

            mesh.userData.labelInstance = label;
        }

        this.sceneManager.add(mesh);
        this.nodes.set(mesh.uuid, mesh);
        return mesh;
    };

    createConnection(source, target, isList) {
        let points;
        let material = this.materials.line;
        let useDashed = false;
        
        if (source.userData?.type === 'ssid' && target.userData?.type === 'ap') {
            // Bracket style connection for SSID to AP
            const midY = (source.position.y + target.position.y) / 2;
            points = [
                source.position.clone(),
                new THREE.Vector3(source.position.x, midY, source.position.z),
                new THREE.Vector3(target.position.x, midY, target.position.z), 
                target.position.clone()
            ];
            // Only color the SSID-AP connection red for evil twins
            if (target.userData?.isEvilTwin) {
                material = new THREE.LineBasicMaterial({ color: 0xff0000, opacity: 0.4, transparent: true });
            }
        } else if (isList) {
            // List view client connections
            points = [
                source.position.clone(),
                new THREE.Vector3(source.position.x - 0.5, source.position.y, source.position.z),
                new THREE.Vector3(source.position.x - 0.5, target.position.y, target.position.z),
                target.position.clone()
            ];
        } else {
            // Direct line for all other connections (including client-AP)
            points = [source.position.clone(), target.position.clone()];
        }

        // Use dashed lines for KARMA mode client connections
        if (source.userData?.type === 'client' || target.userData?.type === 'client') {
            const apNode = source.userData?.type === 'ap' ? source : target;
            if (apNode.userData?.data?.isKarmaMode) {
                // Clone material for independent animation
                material = this.materials.karmaConnection.clone();
                useDashed = true;
            }
        }

        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            material
        );

        // Set up dashed lines
        if (useDashed) {
            line.computeLineDistances();
            // Calculate total line length
            const totalLength = line.geometry.attributes.lineDistance.array[line.geometry.attributes.lineDistance.array.length - 1];
            // Adjust dash pattern based on line length
            line.material.dashSize = totalLength * 0.1;
            line.material.gapSize = totalLength * 0.1;
            line.material.needsUpdate = true;
        }
        this.sceneManager.add(line);
        this.connections.push(line);
        return line;
    }

    clearScene(preserveLabels = false) {
        // Remove connections and nodes from scene
        this.connections.forEach(conn => this.sceneManager.remove(conn));
        this.connections.length = 0;

        // Store existing AP/SSID labels before clearing nodes if preserving
        const existingLabels = new Map();
        if (preserveLabels) {
            this.nodes.forEach(node => {
                if (node.userData.type !== 'client' && node.userData.labelInstance) {
                    const uniqueId = `${node.userData.data.kismet_device_base_macaddr}-${node.userData.type}`;
                    existingLabels.set(uniqueId, node.userData.labelInstance);
                }
            });
        }

        // Clean up all labels if not preserving them
        if (!preserveLabels) {
            // Force cleanup all client labels
            this.labelManager.cleanup(new Set(), true);

            // Clean up AP/SSID labels
            this.nodes.forEach(node => {
                if (node.userData.type !== 'client' && node.userData.labelInstance) {
                    node.userData.labelInstance.cleanup();
                }
            });

            // Clear the label container
            while (this.labelContainer.firstChild) {
                this.labelContainer.removeChild(this.labelContainer.firstChild);
            }
        }

        // Remove nodes from scene
        this.nodes.forEach(node => {
            this.sceneManager.remove(node);
        });

        // Clear node tracking
        this.nodes.clear();
        this.nodeTargetPositions.clear();

        return existingLabels;
    }

    calculateClientPosition(apX, clientIndex, totalClients, isSpecialClient = false) {
        if (this.isListView) {
            // For special clients (evil twin or karma), position them in their own column
            if (isSpecialClient) {
                // Use the AP's original X position for karma clients
                const targetX = apX;
                return new THREE.Vector3(targetX, -0.5 - (clientIndex * 0.5), 0);
            }
            return new THREE.Vector3(apX, -0.5 - (clientIndex * 0.5), 0);
        }

        // For non-list view, use layered arrangement
        const clientsPerLayer = isSpecialClient ? 3 : 4; // Smaller groups for special clients
        const layerIndex = Math.floor(clientIndex / clientsPerLayer);
        const posInLayer = clientIndex % clientsPerLayer;
        const spreadWidth = 2.5;
        const xOffset = (posInLayer - (Math.min(totalClients, clientsPerLayer) - 1) / 2) * spreadWidth;
        const baseY = -1;
        const layerSpacing = 1.2;
        const zOffset = layerIndex * 0.5;

        return new THREE.Vector3(
            apX + xOffset,
            baseY - (layerIndex * layerSpacing),
            zOffset
        );
    }

    visualizeNetwork(network, preserveClientPositions = false, isUpdate = false) {
        if (!network) return;

        // Track active devices for cleanup
        const activeDevices = new Set();
        const clientPositions = new Map();

        if (preserveClientPositions) {
            this.nodes.forEach(node => {
                if (node.userData.type === 'client') {
                    clientPositions.set(
                        node.userData.data.kismet_device_base_macaddr,
                        node.position.clone()
                    );
                }
            });
        }

        // Clear scene and handle label preservation
        const existingLabels = this.clearScene(preserveClientPositions);

        // Create SSID node with complete data
        const ssidData = {
            kismet_device_base_type: "Wi-Fi Network",
            kismet_device_base_macaddr: network.ssid.kismet_device_base_macaddr,
            name: network.ssid.name || 'Hidden SSID',
            security: network.ssid.security || '',
            persistent: true,  // Mark as persistent to preserve label
            psk: network.ssid.psk,  // Important for SSID label
            kismet_device_base_key: network.ssid.kismet_device_base_key,  // Required for audit button
            ...network.ssid
        };

        // Create SSID node first
        const ssidNode = this.createNode('ssid', ssidData, new THREE.Vector3(0, 1.5, 0), existingLabels);

        activeDevices.add(ssidData.kismet_device_base_macaddr);

            // Create AP nodes and their clients
            network.accessPoints.forEach((ap, apIndex) => {
                // First AP goes directly under SSID, others spread horizontally
                const apX = apIndex === 0 ? 0 : (apIndex - (network.accessPoints.length - 2) / 2) * 3;
            // Create AP node
            const apData = {
                kismet_device_base_type: "Wi-Fi AP",
                ...ap,
                fixedX: apX // Store fixed X position for AP
            };
            const targetPosition = new THREE.Vector3(apX, 0.5, 0);
            
            let apNode = this.createNode('ap', apData, targetPosition, existingLabels);
            
            // Ensure spawnPosition is preserved for AP nodes
            apNode.userData.spawnPosition = targetPosition.clone();
            activeDevices.add(apData.kismet_device_base_macaddr);
            apNode.userData.ssidNode = ssidNode;
            
            // Handle KARMA AP styling
            if (apData.isKarmaAP) {
                // Store original position to maintain it
                apNode.userData.originalPosition = targetPosition.clone();
                apNode.userData.fixedPosition = true;
                
                if (apData.useRedModel) {
                    // Apply red model for active KARMA AP (same as evil twin)
                    apNode.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            if (child.material === this.materials.ap) {
                                child.material = this.materials.evilAp;
                            } else if (child.material?.emissive?.getHex() === 0x0066ff) {
                                child.material = new THREE.MeshPhongMaterial({
                                    color: 0xff0000,
                                    emissive: 0xff0000,
                                    emissiveIntensity: 2,
                                    shininess: 100,
                                });
                            }
                        }
                    });
                    
                    // Update label state
                    const label = apNode.userData.labelInstance;
                    if (label) {
                        label.element.removeAttribute('data-evil-twin-offline');
                        label.element.removeAttribute('data-ap-offline');
                        const manufacturerSpan = label.element.querySelector('.manufacturer');
                        if (manufacturerSpan) {
                            manufacturerSpan.textContent = manufacturerSpan.textContent.replace(' (Offline)', '');
                        }
                    }
                } else if (apData.isOffline) {
                    // Apply offline styling (same as evil twin)
                    apNode.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            if (child.material === this.materials.ap) {
                                child.material = new THREE.MeshPhongMaterial({
                                    color: 0x808080,
                                    emissive: 0x404040,
                                    shininess: 70,
                                    transparent: true,
                                    opacity: 0.9
                                });
                            } else if (child.material?.emissive?.getHex() === 0x0066ff) {
                                child.material = new THREE.MeshPhongMaterial({
                                    color: 0x808080,
                                    emissive: 0x404040,
                                    emissiveIntensity: 1,
                                    shininess: 100,
                                });
                            }
                        }
                    });

                    // Update label state
                    const label = apNode.userData.labelInstance;
                    if (label) {
                        label.element.setAttribute('data-evil-twin-offline', 'true');
                        label.element.setAttribute('data-ap-offline', 'true');
                        const manufacturerSpan = label.element.querySelector('.manufacturer');
                        if (manufacturerSpan && !manufacturerSpan.textContent.includes('(Offline)')) {
                            manufacturerSpan.textContent = apData.manufacturer + ' (Offline)';
                        }
                    }
                }

                // Create connection with dashed line style
                const connection = this.createConnection(ssidNode, apNode);
                if (connection.material) {
                    connection.material = this.materials.karmaConnection.clone();
                    connection.computeLineDistances();
                }
            } else if (this.evilTwinVisualizer.isEvilTwinMac(apData.kismet_device_base_macaddr)) {
                // Clean up existing evil twin
                this.evilTwinVisualizer.cleanupExistingEvilTwin(this.labelContainer);

                // Clean up the original node and its label
                const originalLabel = apNode.userData.labelInstance;
                this.sceneManager.remove(apNode);
                this.nodes.delete(apNode.uuid);
                if (originalLabel) {
                    originalLabel.cleanup();
                }

                // Create new evil twin
                const { node: evilNode, position: evilTwinPosition } = this.evilTwinVisualizer.createEvilTwinNode(apData, ssidNode, targetPosition);

                // Add to scene and track
                this.sceneManager.add(evilNode);
                this.nodes.set(evilNode.uuid, evilNode);
                apNode = evilNode;

                if (apData.isNew) {
                    // Set target position for animation
                    this.nodeTargetPositions.set(apNode.uuid, evilTwinPosition.clone());
                    
                    // Let EvilTwinVisualizer handle all spawn animation aspects
                    this.evilTwinVisualizer.handleEvilTwinSpawnAnimation(evilNode, evilTwinPosition, ssidNode);
                } else {
                    // For existing evil twins, just set position and create connection
                    apNode.position.copy(evilTwinPosition);
                    apNode.scale.set(1, 1, 1);
                    this.evilTwinVisualizer.createEvilTwinConnection(ssidNode, apNode);
                }
            } else {
                this.createConnection(ssidNode, apNode);
            }

            if (ap.clients && ap.clients.length > 0) {
                // First, find latest last_seen time for each client across all APs
                const clientLastSeen = new Map();
                network.accessPoints.forEach(currentAP => {
                    currentAP.clients?.forEach(client => {
                        const mac = client.kismet_device_base_macaddr;
                        const lastSeen = new Date(client.kismet_device_base_last_time).getTime();
                        const current = clientLastSeen.get(mac) || { time: 0, ap: null };
                        if (lastSeen > current.time) {
                            clientLastSeen.set(mac, { time: lastSeen, ap: currentAP });
                        }
                    });
                });

                ap.clients.forEach((client, clientIndex) => {
                    activeDevices.add(client.kismet_device_base_macaddr);

                    const targetPosition = this.calculateClientPosition(apX, clientIndex, ap.clients.length, apNode.userData.isEvilTwin);
                    const startPosition = preserveClientPositions &&
                        clientPositions.has(client.kismet_device_base_macaddr) ?
                        clientPositions.get(client.kismet_device_base_macaddr) :
                        targetPosition.clone();

                    // Check if client should be connected to evil twin
                    const existingNodes = Array.from(this.nodes.values());
                    const existingClient = existingNodes.find(
                        node => node.userData?.type === 'client' && 
                               node.userData?.data?.kismet_device_base_macaddr === client.kismet_device_base_macaddr
                    );

                    // Check for stored AP preference, otherwise use existing connection or last seen AP
                    const storedAPType = localStorage.getItem(`client_ap_${client.kismet_device_base_macaddr}`);
                    let targetAP = apNode;

                    // If client has a last seen time with another AP, use that AP instead
                    const lastSeenInfo = clientLastSeen.get(client.kismet_device_base_macaddr);
                    if (lastSeenInfo && lastSeenInfo.ap !== ap) {
                        // Find the node for the AP with the latest last_seen time
                        const latestAPNode = Array.from(this.nodes.values()).find(
                            node => node.userData?.type === 'ap' && 
                                   node.userData?.data?.kismet_device_base_macaddr === lastSeenInfo.ap.kismet_device_base_macaddr
                        );
                        if (latestAPNode) {
                            targetAP = latestAPNode;
                        }
                    }

            if (storedAPType === 'evil-twin') {
                // Find evil twin AP
                const evilTwinAP = existingNodes.find(
                    node => node.userData?.type === 'ap' && node.userData?.isEvilTwin
                );
                if (evilTwinAP) {
                    targetAP = evilTwinAP;
                }
            } else if (existingClient?.userData?.apNode) {
                // If no stored preference but client exists, preserve its current connection
                targetAP = existingClient.userData.apNode;
            }
            
            // Create client node with nodeId in the data
            const nodeId = THREE.MathUtils.generateUUID();
            client.nodeId = nodeId;  // Add nodeId to client data
            const clientNode = this.createNode('client', client, startPosition);
            
            // Get channel from client's Kismet data
            const channel = client.kismet_device_base_channel || 
                          targetAP.userData.data.kismet_device_base_channel;
            
            // Ensure we pass complete AP data to client node
            clientNode.userData = {
                ...clientNode.userData,
                id: nodeId,  // Store ID in userData
                apNode: targetAP,
                type: 'client',
                nodeType: 'client',
                apData: {
                    ...targetAP.userData.data,
                    channel: channel
                }
            };
                    clientNode.material = this.materials.client;

                    if (preserveClientPositions) {
                        this.nodeTargetPositions.set(clientNode.uuid, targetPosition);
                    }

                    // Handle new client animations
                    if ((isUpdate && !clientPositions.has(client.kismet_device_base_macaddr)) || client.isNew) {
                        this.startAnimation();
                        const spawnOffset = this.isListView ?
                            new THREE.Vector3(1.5, -0.2, 0) :
                            new THREE.Vector3(0, -2, 2);
                        const spawnPosition = targetPosition.clone().add(spawnOffset);
                        clientNode.position.copy(spawnPosition);
                        clientNode.scale.set(0.1, 0.1, 0.1);

                        const connection = this.createConnection(apNode, clientNode, this.isListView);
                        connection.material = connection.material.clone();
                        connection.material.opacity = 0;

                        const startTime = Date.now();
                        const animate = () => {
                            if (!clientNode) return;
                            const elapsed = Date.now() - startTime;
                            const progress = Math.min(elapsed / this.ANIMATION_DURATION, 1);
                            const eased = progress < 0.5 ?
                                2 * progress * progress :
                                -1 + (4 - 2 * progress) * progress;

                            const scale = 0.1 + (0.9 * eased);
                            clientNode.scale.set(scale, scale, scale);

                            const bounceProgress = Math.min(1, progress * 1.1);
                            const bounceEase = bounceProgress < 1 ?
                                Math.sin(bounceProgress * Math.PI) * 0.1 * (1 - bounceProgress) :
                                0;
                            const pos = new THREE.Vector3().lerpVectors(spawnPosition, targetPosition, eased);
                            pos.y += bounceEase;
                            clientNode.position.copy(pos);

                            const points = this.isListView ? [
                                apNode.position.clone(),
                                new THREE.Vector3(apNode.position.x - 0.5, apNode.position.y, apNode.position.z),
                                new THREE.Vector3(apNode.position.x - 0.5, clientNode.position.y, clientNode.position.z),
                                clientNode.position.clone()
                            ] : [apNode.position.clone(), clientNode.position.clone()];
                            connection.geometry.setFromPoints(points);

                            const connProgress = Math.min(1, progress * 1.2);
                            connection.material.opacity = Math.pow(connProgress, 2) * 0.4;

                            if (progress < 1) {
                                requestAnimationFrame(animate);
                            }
                        };
                        animate();
                    } else {
                        this.createConnection(apNode, clientNode, this.isListView);
                    }
                });
            }
        });

        // Clean up inactive device labels
        this.labelManager.cleanup(activeDevices);

        // Set initial camera position if not preserving positions
        if (!preserveClientPositions) {
            this.sceneManager.setCameraPosition(new THREE.Vector3(0, 2, 8), new THREE.Vector3(0, 0, 0));
        }
    };

    updateNodePositions() {
        if (!this.isAnimating) return;
        const elapsed = Date.now() - this.animationStartTime;
        const progress = Math.min(elapsed / this.ANIMATION_DURATION, 1);
        const eased = progress < 0.5 ? 
            4 * progress * progress * progress : 
            1 - Math.pow(-2 * progress + 2, 3) / 2;
    
        this.nodes.forEach((node, uuid) => {
            const targetPos = this.nodeTargetPositions.get(uuid);
            if (!targetPos) return;

            if (node.userData.type === 'ap') {
                // For APs, immediately set exact position without interpolation
                node.position.copy(targetPos);
            } else {
                // For other nodes (clients), use smooth interpolation
                node.position.lerp(targetPos, eased);
            }
            
            // Update label position
            const screenPos = this.sceneManager.projectToScreen(node.position);
            const distance = this.sceneManager.getDistanceToCamera(node.position);
            const label = node.userData.labelInstance;
            
            if (label) {
                if (node.userData.type === 'client') {
                    this.labelManager.updateLabelPosition(
                        node.userData.data.kismet_device_base_macaddr,
                        screenPos,
                        distance
                    );
                } else {
                    label.updatePosition(screenPos.x, screenPos.y, distance);
                }
            }
        });
    
        // Update connections
        this.connections.forEach(conn => this.sceneManager.remove(conn));
        this.connections.length = 0;
        this.nodes.forEach(node => {
            if (node.userData.type === 'client') {
                this.createConnection(node.userData.apNode, node, this.isListView);
            } else if (node.userData.type === 'ap') {
                if (node.userData.isEvilTwin) {
                    // Use bracket style connection for evil twin
                    this.createConnection(node.userData.ssidNode, node);
                } else {
                    this.createConnection(node.userData.ssidNode, node);
                }
            }
        });
    
        if (progress === 1) {
            this.isAnimating = false;
        }
    }

    animate() {
        if (this.isAnimating) this.updateNodePositions();

        // Create a Set to track processed labels to prevent duplicate updates
        const processedLabels = new Set();

        // Update label positions synchronously
        this.nodes.forEach(node => {
            if (!node.visible) return; // Skip if node is not visible
            
            const label = node.userData.labelInstance;
            if (!label || processedLabels.has(label.element)) return;

            const screenPos = this.sceneManager.projectToScreen(node.position);
            const distance = this.sceneManager.getDistanceToCamera(node.position);

            // Mark this label as processed
            processedLabels.add(label.element);

            // Use immediate updates for all nodes
            label.updatePosition(screenPos.x, screenPos.y, distance);

            // For SSID and AP nodes, update content in real-time
            if (node.userData.type === 'ssid' || node.userData.type === 'ap') {
                label.updateContent();

                // Preserve evil-twin button state if it exists
                if (node.userData.type === 'ap' && node.userData.isEvilTwin) {
                    const evilTwinButton = label.element.querySelector('.evil-twin-button');
                    if (evilTwinButton && evilTwinButton.innerHTML.includes('Evil-Twin running')) {
                        evilTwinButton.style.backgroundColor = 'green';
                        // Ensure stop button exists
                        if (!evilTwinButton.nextElementSibling?.classList.contains('stop-button')) {
                            const stopButton = document.createElement('button');
                            stopButton.className = 'stop-button';
                            stopButton.innerHTML = '<i class="fa-solid fa-pause"></i>';
            stopButton.className = 'evil-twin-stop-button';
                            evilTwinButton.parentNode.appendChild(stopButton);
                        }
                    }
                }
            }
        });

        // Clean up any orphaned labels
        const validLabelElements = new Set(Array.from(processedLabels));
        this.labelContainer.querySelectorAll('.device-label').forEach(labelElement => {
            if (!validLabelElements.has(labelElement)) {
                labelElement.remove();
            }
        });
    }

    setListView(isListView) {
        this.isListView = isListView;
        
        // Update target positions for all nodes
        this.nodes.forEach((node, uuid) => {
            if (node.userData.type === 'ap') {
                // Keep APs at their fixed positions using stored X coordinate
                const fixedX = node.userData.data.fixedX;
                if (fixedX !== undefined) {
                    const fixedPosition = new THREE.Vector3(fixedX, 0.5, 0);
                    node.position.copy(fixedPosition);
                    this.nodeTargetPositions.set(uuid, fixedPosition);
                }
            } else if (node.userData.type === 'client') {
                // Recalculate client positions based on their AP's fixed position
                const apNode = node.userData.apNode;
                if (apNode && apNode.userData.data.fixedX !== undefined) {
                    const clientIndex = apNode.userData.data.clients.findIndex(
                        client => client.kismet_device_base_macaddr === node.userData.data.kismet_device_base_macaddr
                    );
                    const totalClients = apNode.userData.data.clients.length;
                    const newPosition = this.calculateClientPosition(
                        apNode.userData.data.fixedX,
                        clientIndex,
                        totalClients,
                        apNode.userData.isEvilTwin
                    );
                    this.nodeTargetPositions.set(uuid, newPosition);
                }
            }
        });

        this.startAnimation();
    }

    startAnimation() {
        this.isAnimating = true;
        this.animationStartTime = Date.now();
    }

    updateClientConnection(clientNode, targetAP) {
        // Remove existing connections
        this.connections.forEach(conn => this.sceneManager.remove(conn));
        this.connections.length = 0;

        // Create new connection
        this.createConnection(targetAP, clientNode, this.isListView);
    }

    getNodes() {
        return {
            get: (id) => this.nodes.get(id),
            nodes: this.nodes
        };
    }

    getManufacturerFromMac(macAddress) {
        if (!macAddress) return 'Unknown Device';
        // Extract first 6 characters of MAC address (OUI)
        const oui = macAddress.substring(0, 8).toUpperCase();
        return `Device (${oui})`;
    }
}
