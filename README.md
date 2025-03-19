<div align="center">
  <h1><strong>RF-Lockpick</strong></h1>
  <p>
    <a href="https://github.com/Sechorda/RF-Lockpick/blob/main/LICENSE">
      <img alt="License" src="https://img.shields.io/github/license/Sechorda/RF-Lockpick">
    </a>
  </p>
</div>
<div align="center">

---

# Built With

### Core Tools
[Bluetoolkit](https://github.com/sgxgsx/BlueToolkit)  
[hxcdumptools](https://github.com/ZerBea/hcxdumptool)  
[Wifite2](https://github.com/derv82/wifite2)  
[Kismet](https://www.kismetwireless.net/)  
[aircrack-ng suite](https://www.aircrack-ng.org/)  
[tcpdump](https://www.tcpdump.org/)  
[hostapd](https://w1.fi/hostapd/)  

### Frontend
[![Three.js](https://img.shields.io/badge/Three.js-000?logo=threedotjs&logoColor=fff)](#)
[![HTML](https://img.shields.io/badge/HTML-%23E34F26.svg?logo=html5&logoColor=white)](#)
[![CSS](https://img.shields.io/badge/CSS-1572B6?logo=css3&logoColor=fff)](#)

### Backend
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=fff)](#)
[![Flask](https://img.shields.io/badge/Flask-000?logo=flask&logoColor=fff)](#)

---

# Features

## WiFi View
Lists all available networks  
Select a network to view the 3D ThreeJS scene for network visualization  
Automates handshake capture and cracking  
Creates Evil-Twin AP attacks using cracked PSKs  

![WiFi List](docs/wifi_view_list.png)
![SSID Visualization](docs/ssid_label.png)
![AP Visualization](docs/AP_label.png)

## WiFi Karma View  
Displays all probing SSIDs  
Automates creation of Karma-AP attacks using ThreeJS scene  
Captures probing handshakes for cracking  

![Karma View](docs/karma_view.png)

## Bluetooth View
Displays list of Bluetooth devices and collected data  
Runs extensive recon to gather verbose device capability information  

![Bluetooth List](docs/bt_view_list.png)
![Bluetooth Details](docs/bt_view_expanded.png)

## Cellular View
*Not currently implemented*

---

# Settings
Select network interfaces in settings menu

![Settings Menu](docs/settings_menu.png)

</div>
