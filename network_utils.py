import subprocess, time, requests, logging, collections
from typing import Dict, List
from functools import lru_cache

# Constants
KISMET_HOST = "http://localhost:2501"

@lru_cache(maxsize=1)
def get_interfaces() -> Dict[str, List[str]]:
    interfaces = {'wifi': [], 'bluetooth': [], 'ethernet': []}
    try:
        # Get all network interfaces
        ip_result = subprocess.run(['ip', 'link', 'show'], capture_output=True, text=True)
        if ip_result.returncode == 0:
            all_interfaces = [
                line.split(':')[1].strip() 
                for line in ip_result.stdout.split('\n') 
                if line.strip() and not line.startswith(' ')
            ]
            
            # Get WiFi interfaces
            wifi_result = subprocess.run(['iwconfig'], capture_output=True, text=True)
            if wifi_result.returncode == 0:
                wifi_interfaces = [
                    line.split()[0] 
                    for line in wifi_result.stdout.split('\n')
                    if line.strip() and not line.startswith(' ')
                ]
                interfaces['wifi'] = wifi_interfaces
                
            # Get wired Ethernet interfaces using more precise detection
            eth_result = subprocess.run(
                ['ip', '-o', 'link'], 
                capture_output=True, 
                text=True
            )
            if eth_result.returncode == 0:
                interfaces['ethernet'] = [
                    iface for line in eth_result.stdout.split('\n')
                    if (parts := line.strip().split())
                    and 'link/ether' in line
                    and not 'NO-CARRIER' in line
                    and (iface := parts[1].replace(':', ''))
                    and iface not in wifi_interfaces
                ]
        
        # Get Bluetooth interfaces
        bt_result = subprocess.run(['hcitool', 'dev'], capture_output=True, text=True)
        if bt_result.returncode == 0:
            interfaces['bluetooth'] = [
                parts[0] for line in bt_result.stdout.split('\n')
                if (parts := line.strip().split()) and len(parts) >= 1
                and not line.startswith('Devices')
            ]
    except Exception as e:
        print(f"Error getting interfaces: {str(e)}")
    return interfaces

def start_kismet() -> bool:
    try:
        # Kill any existing kismet process
        subprocess.run(['sudo', 'killall', 'kismet'], stderr=subprocess.DEVNULL)
        time.sleep(2)  # Give kismet time to cleanup
            
        # Get available wifi interfaces
        interfaces = get_interfaces()
        if not interfaces['wifi']:
            logging.error("No WiFi interfaces available")
            return False
            
        # Use first available interface
        interface = interfaces['wifi'][0]
        
        # Start kismet with interface (it will handle monitor mode)
        subprocess.Popen(['sudo', 'kismet', '-c', interface, '--no-logging'], 
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                        
        return wait_for_kismet()
    except Exception as e:
        logging.error(f"Error starting kismet: {str(e)}")
        return False

def check_kismet_running() -> bool:
    try: 
        return requests.get(KISMET_HOST, timeout=2).status_code == 200
    except Exception:
        return False

def wait_for_kismet(timeout: int = 30) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        if check_kismet_running():
            return True
        time.sleep(2)
    return False
