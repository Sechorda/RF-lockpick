import { DeviceLabel } from '../components/labels/label-utils.js';

export class EvilTwinVisualizer {
    constructor(networkVisualizer, sceneManager) {
        this.networkVisualizer = networkVisualizer;
        this.sceneManager = sceneManager;
        this.materials = this.sceneManager.getMaterials();
        this.MAX_THEORETICAL_CLIENTS = 4;
        
        // Add evil-twin material
        this.materials.evilAp = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0x660000,
            shininess: 70,
            transparent: true,
            opacity: 0.9
        });

        // Store reference for callbacks
        this.currentEvilTwin = null;
    }

    isEvilTwinMac(macAddress) {
        return macAddress === "00:11:22:33:44:55";
    }

    cleanupExistingEvilTwin(labelContainer) {
        // Clean up existing evil-twin labels
        labelContainer.querySelectorAll('.device-label[data-evil-twin="true"]').forEach(label => {
            label.remove();
        });
    }

    calculateTheoreticalClientBoundaries(apPosition, isEvilTwin = false) {
        // Calculate positions for theoretical maximum clients
        const theoreticalPositions = Array.from({ length: this.MAX_THEORETICAL_CLIENTS }, (_, index) => {
            return this.networkVisualizer.calculateClientPosition(
                apPosition.x,
                index,
                this.MAX_THEORETICAL_CLIENTS,
                isEvilTwin
            );
        });

        // Find the leftmost and rightmost x positions
        const xPositions = theoreticalPositions.map(pos => pos.x);
        return {
            leftBoundary: Math.min(...xPositions),
            rightBoundary: Math.max(...xPositions)
        };
    }

    createEvilTwinNode(apData, ssidNode, targetPosition) {
        console.log('[EvilTwinVisualizer] Creating evil twin node', { targetPosition });
        
        // Create offline materials
        const offlineMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080,
            emissive: 0x404040,
            shininess: 70,
            transparent: true,
            opacity: 0.9
        });

        const offlineIndicatorMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080,
            emissive: 0x404040,
            emissiveIntensity: 1,
            shininess: 100,
        });

        // Calculate original AP position and offset
        const originalAPOffset = this.networkVisualizer.isListView ? 1.5 : 1;
        const originalAPPosition = new THREE.Vector3(
            targetPosition.x + originalAPOffset,
            targetPosition.y,
            targetPosition.z
        );

        // Calculate maximum space needed for original AP's clients
        const originalAPs = Array.from(this.networkVisualizer.nodes.values()).filter(
            node => node.userData?.type === 'ap' && !node.userData?.isEvilTwin
        );
        
        if (originalAPs.length > 0) {
            const originalAP = originalAPs[0];
            originalAP.position.copy(originalAPPosition);

            // Update positions of clients connected to the original AP
            const clientNodes = Array.from(this.networkVisualizer.nodes.values()).filter(
                node => node.userData?.type === 'client' && node.userData?.apNode === originalAP
            );
            
            clientNodes.forEach((clientNode, index) => {
                const newPosition = this.networkVisualizer.calculateClientPosition(
                    originalAPPosition.x,
                    index,
                    clientNodes.length,
                    false
                );
                this.networkVisualizer.nodeTargetPositions.set(clientNode.uuid, newPosition);
                
                // Smoothly animate to new position
                const currentPos = clientNode.position.clone();
                clientNode.position.copy(currentPos);
                this.networkVisualizer.startAnimation();
            });
        }

        // Calculate required spacing based on maximum client spread
        const spreadWidth = 2.5; // From calculateClientPosition
        const bufferSpace = this.networkVisualizer.isListView ? 2 : 1.5; // Minimum space between client groups
        
        // Calculate initial evil twin position with consistent offset
        const evilTwinOffset = spreadWidth * 3.30 + bufferSpace * 2;
        const evilTwinX = originalAPPosition.x - evilTwinOffset;
        
        const evilTwinPosition = new THREE.Vector3(evilTwinX, 0.5, 0);
        
        console.log('[EvilTwinVisualizer] Positioning:', {
            originalAP: originalAPPosition.x,
            evilTwin: evilTwinX,
            spacing: originalAPPosition.x - evilTwinX,
            view: this.networkVisualizer.isListView ? 'list' : 'regular'
        });

        // Create evil twin node with consistent positioning
        const evilNode = this.networkVisualizer.geometries.ap.clone();
        evilNode.position.copy(evilTwinPosition); // Set initial position immediately
        const evilLabel = new DeviceLabel(apData, this.networkVisualizer.labelContainer);
        evilLabel.element.setAttribute('data-evil-twin', 'true');
        evilLabel.element.setAttribute('data-node-id', evilNode.uuid);

        // Store original position for column view toggle
        evilNode.userData = { 
            type: 'ap', 
            data: apData,
            labelInstance: evilLabel,
            ssidNode: ssidNode,
            isEvilTwin: true,
            originalPosition: evilTwinPosition.clone(), // Store spawn position to maintain it
            spawnPosition: evilTwinPosition.clone() // Additional reference to ensure position stability
        };

        // Check if evil twin is running and apply appropriate styling
        const existingState = JSON.parse(localStorage.getItem(`evilTwinState_${apData.name}`));
        const isOffline = !existingState?.isRunning;

        if (isOffline) {
            evilLabel.element.setAttribute('data-evil-twin-offline', 'true');
            const manufacturerSpan = evilLabel.element.querySelector('.manufacturer');
            if (manufacturerSpan && !manufacturerSpan.textContent.includes('(Offline)')) {
                manufacturerSpan.textContent += ' (Offline)';
            }
        }

        evilNode.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (child.material === this.networkVisualizer.materials.ap) {
                    child.material = isOffline ? offlineMaterial : this.materials.evilAp;
                } else if (child.material?.emissive?.getHex() === 0x0066ff) {
                    child.material = isOffline ? offlineIndicatorMaterial : new THREE.MeshPhongMaterial({
                        color: 0xff0000,
                        emissive: 0xff0000,
                        emissiveIntensity: 2,
                        shininess: 100,
                    });
                }
            }
        });

        return { node: evilNode, position: evilTwinPosition };
    }

    handleEvilTwinSpawnAnimation(evilNode, targetPosition, ssidNode) {
        this.networkVisualizer.startAnimation();
        
        // Calculate optimal spawn position based on final position
        const spawnOffset = this.networkVisualizer.isListView ?
            new THREE.Vector3(-1.5, -0.2, 0) :
            new THREE.Vector3(-1, -1, 0.5); // Reduced offset for closer spawn
        
        // Calculate spawn position relative to target for smoother transition
        const actualSpawnPosition = targetPosition.clone().add(spawnOffset);
        evilNode.position.copy(actualSpawnPosition);
        evilNode.scale.set(0.1, 0.1, 0.1);

        // Create connection with zero initial opacity
        const connection = this.createEvilTwinConnection(ssidNode, evilNode);
        connection.material.opacity = 0;

        const startTime = Date.now();
        const duration = this.networkVisualizer.ANIMATION_DURATION * 1.2; // Slightly longer for smoother effect
        
        const animate = () => {
            if (!evilNode) return;
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Enhanced easing function for smoother motion
            const eased = progress < 0.5 ?
                4 * Math.pow(progress, 3) :
                1 - Math.pow(-2 * progress + 2, 3) / 2;

            // Smooth scale up with elastic effect
            const scale = 0.1 + (0.9 * eased);
            evilNode.scale.set(scale, scale, scale);

            // Enhanced bounce effect
            const bouncePhase = Math.min(1, progress * 1.2);
            const bounceAmount = bouncePhase < 1 ?
                Math.sin(bouncePhase * Math.PI) * 0.15 * (1 - bouncePhase) :
                0;

            // Interpolate position with bounce effect
            const pos = new THREE.Vector3().lerpVectors(actualSpawnPosition, targetPosition, eased);
            pos.y += bounceAmount;
            evilNode.position.copy(pos);

            // Smooth connection fade-in
            this.updateEvilTwinConnection(connection, pos, ssidNode.position);
            connection.material.opacity = Math.pow(eased, 2) * 0.4;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    createEvilTwinConnection(ssidNode, evilNode) {
        const midY = (ssidNode.position.y + evilNode.position.y) / 2;
        const points = [
            evilNode.position.clone(),
            new THREE.Vector3(evilNode.position.x, midY, evilNode.position.z),
            new THREE.Vector3(ssidNode.position.x, midY, ssidNode.position.z),
            ssidNode.position.clone()
        ];
        const connection = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({
                color: 0xff0000,
                opacity: 0.4,
                transparent: true
            })
        );
        this.sceneManager.add(connection);
        this.networkVisualizer.connections.push(connection);
        return connection;
    }

    updateEvilTwinConnection(connection, evilTwinPos, ssidPos) {
        const midY = (ssidPos.y + evilTwinPos.y) / 2;
        const points = [
            evilTwinPos.clone(),
            new THREE.Vector3(evilTwinPos.x, midY, evilTwinPos.z),
            new THREE.Vector3(ssidPos.x, midY, ssidPos.z),
            ssidPos.clone()
        ];
        connection.geometry.setFromPoints(points);
    }
}
