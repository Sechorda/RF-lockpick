import { NetworkTemplates } from './labels/templates/network-templates.js';
import { APTemplates } from './labels/templates/ap-templates.js';
import { ClientTemplates } from './labels/templates/client-templates.js';

export class DeviceTemplateManager {
    static generateDetailsHTML(data) {
        switch (data.kismet_device_base_type) {
            case "Wi-Fi Network":
                return NetworkTemplates.generateNetworkTemplate(data);
            case "Wi-Fi Client":
                return ClientTemplates.generateClientTemplate(data);
            case "Wi-Fi AP":
                return APTemplates.generateAPTemplate(data);
            default:
                return APTemplates.generateAPTemplate(data); // Fallback to AP template
        }
    }
}
