#!/usr/bin/env bash

set -e  # Exit immediately if a command exits with a non-zero status

# Required tools to install
REQUIRED_TOOLS=(
    bluetoolkit
    hcxdumptool
    kismet
    aircrack-ng
    tcpdump
    hostapd
    bluez
)

main() {
    # Install required packages
    echo "Installing required tools..."
    sudo apt-get update >/dev/null 2>&1
    sudo apt-get install -y "${REQUIRED_TOOLS[@]}" >/dev/null 2>&1

    # Install BlueToolkit
    echo "Installing BlueToolkit..."
    git clone https://github.com/sgxgsx/BlueToolkit --recurse-submodules >/dev/null 2>&1
    chmod +x ./BlueToolkit/install.sh
    sudo ./BlueToolkit/install.sh >/dev/null 2>&1

    # Install Wifite2 from GitHub
    echo "Installing Wifite2..."
    sudo git clone --quiet https://github.com/derv82/wifite2.git /usr/local/bin/.wifite2 >/dev/null 2>&1
    sudo ln -sf /usr/local/bin/.wifite2/Wifite.py /usr/local/bin/wifite
    sudo ln -sf /usr/bin/python3 /usr/bin/python

    # Install RF-Lockpick to /usr/local/bin
    echo "Installing RF-Lockpick..."
    sudo mkdir -p /usr/local/bin/RF-Lockpick
    sudo cp -r "$(dirname "$0")"/* /usr/local/bin/RF-Lockpick/
    sudo chmod -R 755 /usr/local/bin/RF-Lockpick

    # Install Python dependencies
    echo "Installing RF-Lockpick Python dependencies..."
    pip3 install flask flask-cors flask-socketio python-dotenv requests >/dev/null 2>&1

    # Create rf wrapper script
    echo "Creating rf wrapper script..."
    sudo tee /usr/local/bin/rf >/dev/null <<'EOF'
#!/bin/bash

# Function to show help
show_help() {
    echo "Usage: rf [option]"
    echo "Options:"
    echo "  (no option)   Start RF-Lockpick server"
    echo "  stop          Stop running RF-Lockpick server"
    echo "  -h, --help    Show this help message"
}

# Function to stop the server
stop_server() {
    local pid=$(pgrep -f "python3 /usr/local/bin/RF-Lockpick/main.py")
    if [ -n "$pid" ]; then
        kill $pid
        echo "RF-Lockpick server stopped"
    else
        echo "RF-Lockpick server is not running"
    fi
}

# Main execution
case "$1" in
    stop)
        stop_server
        exit 0
        ;;
    -h|--help)
        show_help
        exit 0
        ;;
    "")
        # Default behavior - start server
        ;;
    *)
        echo "Invalid option: $1"
        show_help
        exit 1
        ;;
esac

# Start server and capture PID
python3 /usr/local/bin/RF-Lockpick/main.py &>/dev/null &
SERVER_PID=$!

# Wait briefly to check if server crashed immediately
sleep 3

# Check if server is still running
if kill -0 $SERVER_PID &>/dev/null; then
    echo "RF-Lockpick server started successfully"
else
    echo "RF-Lockpick server failed to start (check logs)"
    exit 1
fi

# Disown the process so it keeps running after wrapper exits
disown $SERVER_PID

exit 0
EOF

    sudo chmod +x /usr/local/bin/rf

    echo "Installation complete! You can now run 'rf' to start RF-Lockpick."
}

main
