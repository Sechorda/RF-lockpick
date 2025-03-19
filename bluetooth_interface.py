import json, subprocess, re, os, time
from typing import Dict, List, Optional, Generator, Any

BLUING_SCAN_TIMEOUT = 30

class BluetoothInterface:
    def __init__(self):
        self.devices = []
        self.last_scan_time = 0
        self.scan_interval = 30
        self.scan_processes = {}

    def run_recon(self, mac_address):
        try:
            process = subprocess.Popen(
                ['sudo', 'bluekit', '-t', mac_address, '--recon'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            process.communicate()
            return process.returncode == 0
        except Exception:
            return False

    def run_vulnerability_scan(self, mac_address):
        try:
            process = subprocess.Popen(
                ['sudo', 'bluekit', '-t', mac_address],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Redirect stderr to stdout to maintain order
                stdin=subprocess.PIPE,  # Enable stdin for sending 'continue'
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            self.scan_processes[mac_address] = process
            
            try:
                while True:
                    output = process.stdout.readline()
                    if output == '' and process.poll() is not None:
                        # Get any remaining output
                        remaining_output = process.stdout.read()
                        if remaining_output:
                            yield remaining_output
                        break
                    if output:
                        yield output
                        
                # Check return code and yield any error messages
                if process.poll() != 0:
                    error_msg = f"BlueKit scan failed with return code {process.poll()}\n"
                    yield error_msg
            finally:
                if process.stdin:
                    process.stdin.close()
                if process.stdout:
                    process.stdout.close()
                process.wait()
                if mac_address in self.scan_processes:
                    del self.scan_processes[mac_address]
                
        except Exception as e:
            error_msg = f"Error running BlueKit scan: {str(e)}\n"
            yield error_msg
            if mac_address in self.scan_processes:
                del self.scan_processes[mac_address]

    def get_scan_report(self, mac_address):
        try:
            # Read report file directly
            report_path = f'/usr/share/BlueToolkit/data/tests/{mac_address}/whole-output.json'
            if not os.path.exists(report_path):
                return None

            with open(report_path, 'r') as f:
                return json.load(f)
        except Exception:
            return None

    def _parse_br_inquiry(self, output):
        devices = []
        current_device = None
        services = []
        
        lines = output.split('\n')
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                i += 1
                continue
            
            if line.startswith('BD_ADDR:'):
                if current_device:
                    current_device['services'] = services
                    devices.append(current_device)
                    services = []
                
                try:
                    # Extract full MAC address and manufacturer
                    mac_parts = line.split('(', 1)
                    mac_addr = mac_parts[0].replace('BD_ADDR:', '').strip()
                    manufacturer = mac_parts[1].split(')')[0].strip() if len(mac_parts) > 1 else "Unknown"
                    
                    current_device = {
                        'type': 'BR/EDR', 'address': mac_addr, 'name': f"Unknown - {mac_addr}", 'rssi': None,
                        'class': None, 'manufacturer': manufacturer, 'services': [], 'uuids': [],
                        'pageScanMode': None, 'reserved': None, 'clockOffset': None,
                        'securityManagerTK': None
                    }
                except Exception as e:
                    current_device = None
                
            elif current_device:
                try:
                    if line.startswith('Page scan repetition mode:'): 
                        current_device['pageScanMode'] = line.split(':')[1].strip()
                    elif line.startswith('Reserved:'): 
                        current_device['reserved'] = line.split(':')[1].strip()
                    elif line.startswith('Clock offset:'): 
                        current_device['clockOffset'] = line.split(':')[1].strip()
                    elif line.startswith('RSSI:'):
                        try: 
                            current_device['rssi'] = int(line.split(':')[1].strip().split()[0])
                        except Exception: 
                            pass
                    elif line.startswith('CoD:'):
                        try:
                            cod_value = line.split(':')[1].strip()
                            service_class_binary = None
                            service_classes = []
                            device_class = None
                            
                            # Look ahead for class details
                            j = i + 1
                            while j < len(lines) and j < i + 10:
                                next_line = lines[j].strip()
                                if not next_line or not lines[j].startswith('    '): break
                                
                                if 'Service Class:' in next_line:
                                    service_class_binary = next_line.split('Service Class:')[1].strip()
                                    k = j + 1
                                    while k < len(lines):
                                        service_line = lines[k].strip()
                                        if not service_line or not lines[k].startswith('        '): break
                                        service_classes.append(service_line)
                                        service_classes.append(service_line)
                                        k += 1
                                    j = k - 1
                                elif 'Major Device Class:' in next_line:
                                    device_class_text = next_line.split('Major Device Class:')[1].strip()
                                    device_class = device_class_text.split(',', 1)[1].strip() if ',' in device_class_text else device_class_text
                                j += 1
                            
                            current_device['class'] = {
                                'raw': cod_value,
                                'device_class': device_class or "Unknown",
                                'service_class_binary': service_class_binary,
                                'service_classes': service_classes
                            }
                            i = j - 1  # Update main loop index to skip processed lines
                        except Exception as e: 
                            current_device['class'] = {'raw': line.split(':')[1].strip()}
                    elif line.startswith('Extended inquiry response:'):
                        # Process indented content under Extended inquiry response
                        j = i + 1
                        while j < len(lines):
                            response_line = lines[j].strip()
                            if not response_line or not lines[j].startswith('    '): break
                            
                            if response_line.startswith('Complete Local Name:'):
                                device_name = response_line.split(':')[1].strip()
                                current_device['name'] = device_name
                            elif response_line.startswith('Complete List of 16-bit Service Class UUIDs'):
                                k = j + 1
                                while k < len(lines):
                                    uuid_line = lines[k].strip()
                                    if not uuid_line or not uuid_line.startswith('        0x'): break
                                    try:
                                        parts = uuid_line.split(None, 1)
                                        uuid = parts[0]
                                        service = parts[1] if len(parts) > 1 else "Unknown"
                                        current_device['uuids'].append(f"16-bit: {uuid}")
                                        services.append(service)
                                    except Exception:
                                        pass
                                    k += 1
                                j = k - 1  # Update inner loop index to skip processed lines
                            j += 1
                        i = j - 1  # Update main loop index to skip processed lines
                    elif line.startswith('Security Manager TK Value'):
                        if i + 1 < len(lines):
                            current_device['securityManagerTK'] = lines[i + 1].strip()
                            i += 1  # Skip the next line since we processed it
                    elif line.startswith('Complete List of 128-bit Service Class UUIDs'):
                        j = i + 1
                        while j < len(lines):
                            uuid_line = lines[j].strip()
                            if not uuid_line or not uuid_line[0].isdigit(): break
                            try:
                                current_device['uuids'].append(f"128-bit: {uuid_line}")
                            except Exception:
                                pass
                            j += 1
                        i = j - 1  # Update main loop index to skip processed lines
                except Exception:
                    pass
            i += 1

        if current_device:
            current_device['services'] = services
            devices.append(current_device)
        return devices

    def _parse_le_scan(self, output):
        devices = []
        current_device = None
        lines = output.split('\n')
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                i += 1
                continue
                
            if line.startswith('Addr:'):
                if current_device: devices.append(current_device)
                addr_match = re.search(r'Addr:\s+([0-9A-F:]{17})', line)
                if addr_match:
                    current_device = {
                        'type': 'LE', 'address': addr_match.group(1), 'manufacturer': 'Unknown',
                        'name': 'Unknown', 'connectable': False, 'rssi': None, 'flags': [],
                        'serviceData': [], 'manufacturerData': [], 'addressType': 'public'
                    }
            
            elif current_device:
                if line.startswith('Addr type:'): current_device['addressType'] = line.split(':')[1].strip()
                elif line.startswith('Complete Local Name:'): current_device['name'] = line.split(':')[1].strip()
                elif line.startswith('RSSI:'):
                    rssi_match = re.search(r'(-?\d+)\s*dBm', line)
                    if rssi_match: current_device['rssi'] = int(rssi_match.group(1))
                elif line.startswith('Connectable:'): current_device['connectable'] = 'True' in line
                elif line.startswith('General Access Profile:'):
                    i += 1
                    while i < len(lines):
                        gap_line = lines[i].strip()
                        if not gap_line or (not lines[i].startswith(' ') and gap_line != 'General Access Profile:'):
                            i -= 1
                            break
                            
                        if gap_line == 'Flags:':
                            i += 1
                            while i < len(lines) and lines[i].startswith('        '):
                                flag = lines[i].strip()
                                if flag: current_device['flags'].append(flag)
                                i += 1
                            i -= 1
                        elif gap_line.startswith('Service Data - 16-bit UUID:'):
                            i += 1
                            uuid = data = None
                            while i < len(lines) and lines[i].startswith('        '):
                                service_line = lines[i].strip()
                                if service_line.startswith('UUID:'): uuid = service_line.split(':')[1].strip()
                                elif service_line.startswith('Data:'): data = service_line.split(':')[1].strip()
                                i += 1
                            if uuid and data: current_device['serviceData'].append({'uuid': uuid, 'data': data})
                            i -= 1
                        elif gap_line.startswith('Complete List of 16-bit Service Class UUIDs:'):
                            i += 1
                            while i < len(lines) and lines[i].startswith('        '): i += 1
                            i -= 1
                        elif gap_line.startswith('Manufacturer Specific Data:'):
                            i += 1
                            company_id = company_name = data = None
                            while i < len(lines) and lines[i].startswith('        '):
                                mfg_line = lines[i].strip()
                                if mfg_line.startswith('Company ID:'):
                                    id_match = re.search(r'Company ID:\s+(0x[0-9A-Fa-f]+)\s+\((.*?)\)', mfg_line)
                                    if id_match:
                                        company_id = id_match.group(1)
                                        company_name = id_match.group(2)
                                elif mfg_line.startswith('Data:'): data = mfg_line.split(':')[1].strip()
                                i += 1
                            if company_id and company_name and data:
                                current_device['manufacturerData'].append({
                                    'companyId': company_id, 'company': company_name, 'data': data
                                })
                                current_device['manufacturer'] = company_name
                                current_device['name'] = f"{company_name} - {current_device['address']}"
                            i -= 1
                        elif gap_line.startswith('Tx Power Level:'):
                            power_match = re.search(r'(-?\d+)\s*dBm', gap_line)
                            if power_match: current_device['txPower'] = int(power_match.group(1))
                            pathloss_match = re.search(r'pathloss\s+(-?\d+)\s*dBm', gap_line)
                            if pathloss_match: current_device['pathLoss'] = int(pathloss_match.group(1))
                        i += 1
            i += 1

        if current_device: devices.append(current_device)
        return devices

    def scan_devices(self):
        current_time = time.time()
        if current_time - self.last_scan_time < self.scan_interval: return self.devices

        self.devices = []
        try:
            br_result = subprocess.run(['sudo', 'bluing', 'br', '--inquiry'], capture_output=True, text=True, timeout=BLUING_SCAN_TIMEOUT)
            if br_result.returncode == 0:
                br_devices = self._parse_br_inquiry(br_result.stdout)
                self.devices.extend(br_devices)
            
            le_result = subprocess.run(['sudo', 'bluing', 'le', '--scan'], capture_output=True, text=True, timeout=BLUING_SCAN_TIMEOUT)
            if le_result.returncode == 0:
                le_devices = self._parse_le_scan(le_result.stdout)
                self.devices.extend(le_devices)
        except Exception:
            pass

        self.last_scan_time = current_time
        return self.devices
