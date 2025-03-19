// Simple test button for client-node transitions
export function createClientTransitionButton() {
    const button = document.createElement('button');
    button.textContent = 'Test Client Transition';
    button.style.cssText = 'position: fixed; bottom: 20px; right: 20px; padding: 10px; z-index: 1000;';
    
    button.addEventListener('click', () => {
        // Get network visualizer nodes
        const visualizer = window.networkVisualizer?.getNodes();
        if (!visualizer?.nodes) {
            console.error('Network visualizer not initialized');
            return;
        }

        // Get all client nodes
        const allNodes = Array.from(visualizer.nodes.values());
        const clientNodes = allNodes.filter(node => node.userData?.type === 'client');
        
        if (clientNodes.length === 0) {
            console.log('No client nodes found');
            return;
        }

        // Pick a random client
        const randomClient = clientNodes[Math.floor(Math.random() * clientNodes.length)];
        const clientMac = randomClient.userData.data.kismet_device_base_macaddr;
        
        // Trigger the transition
        window.networkVisualizer.switchClientAP(clientMac);
    });

    document.body.appendChild(button);
}
