import json, base64, requests, time
from typing import Dict, List, Optional

class KismetInterface:
    def __init__(self, host: str, username: str, password: str):
        self.host = host
        self.auth_header = {"Authorization": f"Basic {base64.b64encode(f'{username}:{password}'.encode()).decode()}"}
        self.seen_aps = set()  # Track seen AP MAC addresses

    def get_devices(self) -> List[Dict]:
        try:
            response = requests.get(f"{self.host}/devices/views/all/devices.json", headers=self.auth_header)
            response.raise_for_status()
            data = response.json()
            return self.process_data(data if isinstance(data, list) else data.get('devices', []))
        except: return []

    def get_active_interface(self) -> Optional[str]:
        try:
            response = requests.get(f"{self.host}/datasource/all_sources.json", headers=self.auth_header)
            response.raise_for_status()
            return next((source.get('kismet.datasource.interface') for source in response.json() 
                        if source.get('kismet.datasource.running', False)), None)
        except: return None

    @staticmethod
    def _get_security(ap: Dict) -> str:
        crypto_set = ap.get("dot11.device", {}).get("dot11.device.last_beaconed_ssid_record", {}).get("dot11.advertisedssid.crypt_set", 0)
        security = []
        if crypto_set & 0x10000000: security.append("WPA3")
        if crypto_set & 0x00000002: security.append("WPA2")
        if crypto_set & 0x00000001: security.append("WPA")
        if crypto_set & 0x00000010: security.append("WEP")
        if ap.get("dot11.device", {}).get("dot11.device.last_beaconed_ssid_record", {}).get("dot11.advertisedssid.wpa_mfp_required"): 
            security.append("MFP")
        return " + ".join(security) if security else "Open"

    def process_data(self, devices: List[Dict]) -> List[Dict]:
        networks = []
        ssid_groups = {}
        current_time = time.time()
        
        for device in devices:
            if ("dot11.device" not in device or 
                device.get("kismet.device.base.type") != "Wi-Fi AP" or 
                current_time - device.get("kismet.device.base.last_time", 0) > 240): continue
                
            ssid = device.get("kismet.device.base.name", "Unknown")
            mac = device.get("kismet.device.base.macaddr")
            base_key = device.get("kismet.device.base.key", "").split('_')[0]
            if not base_key: continue
            
            # Group all APs by SSID and base_key, including evil-twins
            ssid_groups.setdefault(ssid, {}).setdefault(base_key, []).append(device)

        for ssid, base_key_groups in ssid_groups.items():
            for base_key, ap_list in base_key_groups.items():
                if not ap_list: continue
                
                # Get strongest AP excluding evil-twin
                regular_aps = [ap for ap in ap_list if ap.get("kismet.device.base.macaddr") != "00:11:22:33:44:55"]
                strongest_ap = max(regular_aps, key=lambda ap: ap.get("kismet.device.base.signal", {}).get("kismet.common.signal.last_signal", -100))
                
                # Get manufacturer from regular APs
                manufacturer = next((ap.get("kismet.device.base.manuf") for ap in regular_aps 
                                  if ap.get("kismet.device.base.manuf") and ap.get("kismet.device.base.manuf") != "Unknown"), 
                                  strongest_ap.get("kismet.device.base.manuf", "Unknown"))

                # Get all clients from regular APs
                all_clients = {}
                for ap in regular_aps:
                    all_clients.update(ap.get("dot11.device", {}).get("dot11.device.associated_client_map", {}))

                # Determine band based on channels (excluding evil-twin)
                channels = sorted(set(str(ap.get("kismet.device.base.channel", "Unknown")) for ap in regular_aps))
                has_2ghz = any(int(ch) <= 14 for ch in channels if ch.isdigit())
                has_5ghz = any(int(ch) > 14 for ch in channels if ch.isdigit())
                band = "Dual-Band" if has_2ghz and has_5ghz else ("5GHz" if has_5ghz else "2.4GHz")

                # Create a single AP entry that represents all APs for this SSID
                accessPoints = []
                
                # Check if any AP is an evil twin or karma AP
                evil_twin_ap = next((ap for ap in ap_list if ap.get("kismet.device.base.macaddr") == "00:11:22:33:44:55"), None)
                karma_ap = next((ap for ap in ap_list if ap.get("karma_ap") is True), None)
                
                # First create the regular AP entry
                # Group APs by band (excluding evil twin)
                regular_aps = [ap for ap in ap_list if ap.get("kismet.device.base.macaddr") != "00:11:22:33:44:55"]
                band_2ghz_aps = [ap for ap in regular_aps if int(ap.get("kismet.device.base.channel", 0)) <= 14]
                band_5ghz_aps = [ap for ap in regular_aps if int(ap.get("kismet.device.base.channel", 0)) > 14]
                
                # Get strongest AP from each band
                strongest_2ghz = max(band_2ghz_aps, key=lambda ap: ap.get("kismet.device.base.signal", {}).get("kismet.common.signal.last_signal", -100)) if band_2ghz_aps else None
                strongest_5ghz = max(band_5ghz_aps, key=lambda ap: ap.get("kismet.device.base.signal", {}).get("kismet.common.signal.last_signal", -100)) if band_5ghz_aps else None
                
                # Create MAC address list for device label
                mac_addresses = []
                if strongest_2ghz:
                    mac_addresses.append(f"2.4GHz: {strongest_2ghz.get('kismet.device.base.macaddr')}")
                if strongest_5ghz:
                    mac_addresses.append(f"5GHz: {strongest_5ghz.get('kismet.device.base.macaddr')}")
                
                # Get clients for regular APs
                regular_clients = {}
                for ap in regular_aps:
                    regular_clients.update(ap.get("dot11.device", {}).get("dot11.device.associated_client_map", {}))
                
                # Create regular AP entry
                accessPoints.append({
                    "kismet_device_base_type": "Wi-Fi AP",
                    "name": ssid,
                    "freq": band,
                    "kismet_device_base_manufacturer": manufacturer,
                    "kismet_device_base_first_time": min(ap.get("kismet.device.base.first_time", float('inf')) for ap in regular_aps),
                    "kismet_device_base_last_time": max(ap.get("kismet.device.base.last_time", 0) for ap in regular_aps),
                    "kismet_device_base_signal": {"last_signal": max(ap.get("kismet.device.base.signal", {}).get("kismet.common.signal.last_signal", 0) for ap in regular_aps)},
                    "kismet_device_base_macaddr": strongest_ap.get("kismet.device.base.macaddr"),
                    "kismet_device_base_key": base_key,
                    "band": band,
                    "mac_addresses": mac_addresses,
                    "kismet_device_base_num_clients": len(regular_clients),
                    "clients": [self._process_client(client_mac, client_device, current_time, strongest_ap) 
                              for client_mac, client_device in ((mac, next((d for d in devices if d.get("kismet.device.base.macaddr") == mac), None))
                                                               for mac in regular_clients.keys())]
                })
                
                # Add strongest AP MAC to seen set
                if strongest_ap.get("kismet.device.base.macaddr"):
                    self.seen_aps.add(strongest_ap.get("kismet.device.base.macaddr"))

                # If evil twin or karma AP exists, add it as an additional AP
                if evil_twin_ap or karma_ap:
                    target_ap = evil_twin_ap or karma_ap
                    ap_type = "Evil Twin AP" if evil_twin_ap else "KARMA-AP"
                    # Handle evil twin AP separately - keep its specific channel and band
                    ap_mac = evil_twin_ap.get("kismet.device.base.macaddr")
                    ap_channel = str(target_ap.get("kismet.device.base.channel", "Unknown"))
                    ap_band = "5GHz" if int(target_ap.get("kismet.device.base.channel", 0)) > 14 else "2.4GHz"
                    
                    # Get clients only from the target AP
                    ap_clients = target_ap.get("dot11.device", {}).get("dot11.device.associated_client_map", {})
                    
                    accessPoints.append({
                        "kismet_device_base_type": "Wi-Fi AP",
                        "name": ssid,
                        "freq": ap_band,
                        "kismet_device_base_manufacturer": ap_type,
                        "kismet_device_base_first_time": target_ap.get("kismet.device.base.first_time"),
                        "kismet_device_base_last_time": target_ap.get("kismet.device.base.last_time"),
                        "kismet_device_base_signal": {"last_signal": target_ap.get("kismet.device.base.signal", {}).get("kismet.common.signal.last_signal", 0)},
                        "kismet_device_base_macaddr": ap_mac,
                        "kismet_device_base_key": base_key,
                        "band": ap_band,
                        "mac_addresses": [f"{ap_band}: {ap_mac}"],
                        "kismet_device_base_num_clients": len(ap_clients),
                        "isNew": ap_mac not in self.seen_aps,
                        "isKarmaMode": karma_ap is not None,
                        "clients": [self._process_client(client_mac, client_device, current_time, target_ap) 
                                  for client_mac, client_device in ((mac, next((d for d in devices if d.get("kismet.device.base.macaddr") == mac), None))
                                                                   for mac in ap_clients.keys())]
                    })
                    if ap_mac:
                        self.seen_aps.add(ap_mac)
                
                network = {
                    "ssid": {
                        "kismet_device_base_type": "Wi-Fi Network",
                        "kismet_device_base_manufacturer": manufacturer,
                        "name": ssid,
                        "band": band,
                        "security": self._get_security(strongest_ap),
                        "kismet_device_base_first_time": min(ap.get("kismet.device.base.first_time", float('inf')) for ap in ap_list),
                        "kismet_device_base_last_time": max(ap.get("kismet.device.base.last_time", 0) for ap in ap_list),
                        "kismet_device_base_channel": ", ".join(channels),
                        "kismet_device_base_signal": {"last_signal": max(ap.get("kismet.device.base.signal", {}).get("kismet.common.signal.last_signal", -100) for ap in ap_list)},
                        "kismet_device_base_macaddr": strongest_ap.get("kismet.device.base.macaddr"),
                        "kismet_device_base_key": base_key,
                        "kismet_device_base_num_clients": len(all_clients)
                    },
                    "accessPoints": accessPoints
                }
                # Add AP MAC to seen set
                if strongest_ap.get("kismet.device.base.macaddr"):
                    self.seen_aps.add(strongest_ap.get("kismet.device.base.macaddr"))

                networks.append(network)

        return networks

    @staticmethod
    def _process_client(client_mac: str, client_device: Optional[Dict], current_time: float, strongest_ap: Dict) -> Dict:
        if client_device and current_time - client_device.get("kismet.device.base.last_time", 0) <= 240:
            return {
                "kismet_device_base_type": "Wi-Fi Client",
                "name": client_device.get("kismet.device.base.name", "Unknown Client"),
                "kismet_device_base_manufacturer": client_device.get("kismet.device.base.manuf", "Unknown"),
                "kismet_device_base_first_time": client_device.get("kismet.device.base.first_time"),
                "kismet_device_base_last_time": client_device.get("kismet.device.base.last_time"),
                "kismet_device_base_signal": {"last_signal": client_device.get("kismet.device.base.signal", {}).get("kismet.common.signal.last_signal", 0)},
                "kismet_device_base_packets": {"total": client_device.get("kismet.device.base.packets.tx_total", 0)},
                "kismet_device_base_macaddr": client_mac,
                "kismet_device_base_channel": str(client_device.get("kismet.device.base.channel", "Unknown")),
                "dot11_device": client_device.get("dot11.device", {})
            }
        return {
            "kismet_device_base_type": "Wi-Fi Client",
            "name": f"Unknown Client ({client_mac})",
            "kismet_device_base_manufacturer": "Unknown",
            "kismet_device_base_first_time": None,
            "kismet_device_base_last_time": None,
            "kismet_device_base_signal": {"last_signal": 0},
            "kismet_device_base_packets": {"total": 0},
            "kismet_device_base_macaddr": client_mac,
            "kismet_device_base_channel": str(strongest_ap.get("kismet.device.base.channel", "Unknown"))
        }
