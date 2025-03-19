import { DeviceLabel } from '../components/labels/label-utils.js';

export class KarmaAPVisualizer {
    constructor(networkVisualizer, sceneManager) {
        this.networkVisualizer = networkVisualizer;
        this.sceneManager = sceneManager;
        this.materials = {
            karmaAp: new THREE.MeshPhongMaterial({
                color: 0xff0000,
                emissive: 0x660000,
                shininess: 70,
                transparent: true,
                opacity: 0.9
            }),
            karmaIndicator: new THREE.MeshPhongMaterial({
                color: 0xff0000,
                emissive: 0xff0000,
                emissiveIntensity: 2,
                shininess: 100,
                transparent: true,
                opacity: 0.9
            }),
            offline: new THREE.MeshPhongMaterial({
                color: 0x808080,
                emissive: 0x404040,
                shininess: 70,
                transparent: true,
                opacity: 0.9
            })
        };

        // Store references for instance management
        this.customMaterials = new Map();
        
        // Force materials to initialize
        Object.values(this.materials).forEach(material => {
            material.needsUpdate = true;
        });
    }

    updateNodeMaterials(node, isOffline = false) {
        if (!node) return;

        // Ensure customMaterials has an entry for this node
        const nodeId = node.uuid;
        if (!this.customMaterials.has(nodeId)) {
            this.customMaterials.set(nodeId, {
                main: this.materials.karmaAp.clone(),
                indicator: this.materials.karmaIndicator.clone()
            });
        }

        const materials = this.customMaterials.get(nodeId);
        
        node.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;

            const isIndicator = child.material?.emissive?.getHex() === 0x0066ff;
            const material = isIndicator ? materials.indicator : materials.main;

            if (isOffline) {
                child.material = this.materials.offline.clone();
            } else {
                child.material = material;
            }
            
            child.material.needsUpdate = true;
            child.material.uniformsNeedUpdate = true;
        });

        // Force scene update
        this.networkVisualizer.startAnimation();
        this.sceneManager.render();
    }

    cleanupNodeMaterials(nodeId) {
        this.customMaterials.delete(nodeId);
    }

    isKarmaAPMac(macAddress) {
        return macAddress === 'CA:FE:KA:RM:00:01';
    }

    forceRender() {
        if (this.networkVisualizer && this.sceneManager) {
            this.networkVisualizer.startAnimation();
            this.sceneManager.render();
            
            // Queue another render to ensure changes are applied
            requestAnimationFrame(() => {
                this.sceneManager.render();
            });
        }
    }
}
