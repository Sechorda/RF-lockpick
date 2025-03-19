/**
 * Device Labels Entry Point
 * Provides access to both v1 and v2 implementations for gradual transition
 */

// V2 Exports (Refactored Implementation)
export { BaseDeviceLabel } from './base/base-device-label.js';
export { SSIDDeviceLabel } from './SSID-device-label.js';
export { APDeviceLabel } from './AP-device-label.js';
export { ClientDeviceLabel } from './client-device-label.js';
export { LabelManager } from './label-manager.js';

// Template Exports
export { NetworkTemplates } from './templates/network-templates.js';
export { APTemplates } from './templates/ap-templates.js';
export { ClientTemplates } from './templates/client-templates.js';

// Service Exports
export { AuditService } from '../../services/security/audit-service.js';

/**
 * Device Label System Guide:
 * 
 * 1. This implementation provides:
 *    - Cleaner separation of concerns
 *    - Better maintainability through component-based architecture
 *    - Improved template system for device displays
 *    - Dedicated audit service for network security features
 * 
 * 2. Usage:
 *    - Replace DeviceLabel imports with specific device types
 *    - Update LabelManager import to use new implementation
 *    - Initialize AuditService for network audit functionality
 * 
 * Example:
 * ```javascript
 * // Example imports
 * import { SSIDDeviceLabel, APDeviceLabel, ClientDeviceLabel, LabelManager } from './labels/index.js';
 * ```
 * 
 * 3. Refer to component documentation for detailed usage
 */
