import os

# Downstream service URLs — override via environment variables
RECOGNITION_SERVICE_URL = os.getenv("RECOGNITION_SERVICE_URL", "http://localhost:8000")
CATALOG_SERVICE_URL = os.getenv("CATALOG_SERVICE_URL", "http://localhost:8001")
RECOMMENDATION_SERVICE_URL = os.getenv("RECOMMENDATION_SERVICE_URL", "http://localhost:8002")
