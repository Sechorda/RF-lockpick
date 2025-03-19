#!/usr/bin/env python3
import logging
import os
from app import app
from network_utils import check_kismet_running, start_kismet, wait_for_kismet

# Configure logging
logging.basicConfig(level=logging.INFO)
# Filter out Werkzeug logs except for API calls
logging.getLogger('werkzeug').addFilter(lambda r: '/api/' in r.getMessage())
# Disable Flask's default logger
logging.getLogger('flask').setLevel(logging.ERROR)

def main():
    # Start kismet and wait for it to be ready
    if not start_kismet() or not wait_for_kismet():
        return
    app.run(host='0.0.0.0', port=8080, debug=False)

if __name__ == "__main__":
    main()
