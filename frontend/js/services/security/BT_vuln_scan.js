export class VulnerabilityScanner {
    constructor() {
        this.isScanning = false;
        this.progress = null;
        this.currentStep = 0;
        this.totalSteps = 11;
        this.currentDevice = null;
        this.needsContinue = false;
        this.lastError = null;
    }

    async startScan(device) {
        if (this.isScanning) return;
        
        this.isScanning = true;
        // Only reset progress if not continuing
        if (!this.needsContinue) {
            this.progress = 0;
            this.currentStep = 0;
        }
        this.currentDevice = device;

        try {
            let url = `http://localhost:8080/api/bluetooth/vulnscan/${device.address}`;
            if (this.needsContinue) {
                url += '?action=continue';
                this.needsContinue = false;
            }
            const scanResponse = await fetch(url);
            if (!scanResponse.ok) {
                this.needsContinue = true;  // Enable continue mode for any scan failure
                this.lastError = 'The target device is not available. Try restoring the connectivity and click continue.';
                throw new Error(this.lastError);
            }

            const reader = scanResponse.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const {value, done} = await reader.read();
                if (done) break;
                
                const text = decoder.decode(value);
                
                // Check for connectivity prompt
                if (text.includes('Try restoring the connectivity')) {
                    this.needsContinue = true;  // Enable continue mode first
                    this.lastError = 'The target device is not available. Try restoring the connectivity and click continue.';
                    this.isScanning = false;  // Stop scanning after continue mode is set
                    throw new Error(this.lastError);
                }

                // Parse progress percentage from BlueKit output
                const progressMatch = text.match(/Testing exploits:\s+(\d+)%/);
                if (progressMatch) {
                    this.progress = parseInt(progressMatch[1]);
                }
            }

            // Get scan report
            const reportResponse = await fetch(`http://localhost:8080/api/bluetooth/report/${device.address}`);
            if (!reportResponse.ok) throw new Error('Failed to get report');
            
            const report = await reportResponse.json();
            
            // Process vulnerabilities
            const vulnerabilities = report.done_exploits
                .filter(exploit => exploit.code === 2)
                .map(exploit => ({
                    name: exploit.name,
                    description: exploit.data
                }));

            const totalTested = report.done_exploits.length;
            const skipped = report.skipped_exploits.length;

            return {
                device,
                vulnerabilities,
                stats: {
                    total: totalTested + skipped,
                    tested: totalTested,
                    skipped: skipped,
                    vulnerable: vulnerabilities.length
                },
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.lastError = error.message;
            throw error;
        } finally {
            // Only clear state if we're not in continue mode
            if (!this.needsContinue) {
                this.currentDevice = null;
                this.progress = null;
            }
            this.isScanning = false;
        }
    }

    getProgress() {
        return this.progress;
    }

    isDeviceBeingScanned(device) {
        return this.isScanning && this.currentDevice?.address === device?.address;
    }

    needsContinueForDevice(device) {
        return this.needsContinue && this.currentDevice?.address === device?.address;
    }

    getLastError() {
        return this.lastError;
    }

    getButtonText(device) {
        if (this.needsContinueForDevice(device)) {
            return 'Continue';
        }
        if (this.isDeviceBeingScanned(device)) {
            return `Scanning... ${this.progress}%`;
        }
        return 'Vulnerability Scan';
    }

    // Helper method to get button class
    getButtonClass(device) {
        if (this.isDeviceBeingScanned(device)) {
            return 'vuln-scan-button scanning';
        }
        return 'vuln-scan-button';
    }
}
