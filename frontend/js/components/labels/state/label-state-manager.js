/**
 * Centralized state management for device labels
 * Handles both normal and karma mode states
 */
export class LabelStateManager {
    constructor() {
        if (LabelStateManager.instance) {
            return LabelStateManager.instance;
        }
        LabelStateManager.instance = this;

        this.auditStates = new Map();
        this.labelStates = new Map();
        this.subscribers = new Map();
        
        this.logPrefix = '[LabelStateManager]';
        console.log(`${this.logPrefix} Initialized with empty state`);
    }

    updateAuditState(ssid, isRunning) {
        console.log(`${this.logPrefix} Updating audit state for ${ssid} -> ${isRunning}`);
        const oldState = this.auditStates.get(ssid);
        if (oldState !== isRunning) {
            console.log(`${this.logPrefix} State changed from ${oldState} to ${isRunning}`);
            this.auditStates.set(ssid, isRunning);
            console.log(`${this.logPrefix} Calling notifyStateChange for ${ssid}`);
            this.notifyStateChange(ssid);
        } else {
            console.log(`${this.logPrefix} State unchanged for ${ssid} (${isRunning})`);
        }
    }

    updateLabelState(ssid, updates) {
        const currentState = this.labelStates.get(ssid) || {};
        const newState = {
            ...currentState,
            ...updates
        };
        this.labelStates.set(ssid, newState);
        this.notifyStateChange(ssid);
    }

    getAuditState(ssid) {
        const state = this.auditStates.get(ssid) || false;
        console.log(`${this.logPrefix} Getting audit state for ${ssid} -> ${state}`);
        return state;
    }

    getLabelState(ssid) {
        return this.labelStates.get(ssid) || {};
    }

    subscribe(ssid, callback) {
        console.log(`${this.logPrefix} New subscriber for ${ssid}`);
        if (!this.subscribers.has(ssid)) {
            this.subscribers.set(ssid, new Set());
        }
        this.subscribers.get(ssid).add(callback);
        console.log(`${this.logPrefix} Total subscribers for ${ssid}:`, this.subscribers.get(ssid).size);
    }

    unsubscribe(ssid, callback) {
        if (this.subscribers.has(ssid)) {
            this.subscribers.get(ssid).delete(callback);
            if (this.subscribers.get(ssid).size === 0) {
                this.subscribers.delete(ssid);
            }
        }
    }

    notifyStateChange(ssid) {
        if (this.subscribers.has(ssid)) {
            const state = {
                auditRunning: this.getAuditState(ssid),
                ...this.getLabelState(ssid)
            };
            console.log(`${this.logPrefix} Notifying subscribers for ${ssid} with state:`, state);
            console.log(`${this.logPrefix} Number of subscribers:`, this.subscribers.get(ssid).size);
            
            this.subscribers.get(ssid).forEach(callback => {
                try {
                    console.log(`${this.logPrefix} Calling subscriber callback for ${ssid}`);
                    callback(state);
                } catch (error) {
                    console.error(`${this.logPrefix} Error in subscriber callback:`, error);
                }
            });
        } else {
            console.log(`${this.logPrefix} No subscribers to notify for ${ssid}`);
        }
    }

    dumpState() {
        return {
            auditStates: Object.fromEntries(this.auditStates),
            labelStates: Object.fromEntries(this.labelStates)
        };
    }

    dumpSubscribers() {
        return Array.from(this.subscribers.entries()).map(([ssid, callbacks]) => ({
            ssid,
            subscriberCount: callbacks.size
        }));
    }
}

// Export singleton instance
export default new LabelStateManager();
