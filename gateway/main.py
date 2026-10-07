import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routes_recognition import router as recognition_router
from src.routes_catalog import router as catalog_router
from src.routes_recommendation import router as recommendation_router
from src.config import RECOGNITION_SERVICE_URL, CATALOG_SERVICE_URL, RECOMMENDATION_SERVICE_URL

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("gateway")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("MusicTalk API Gateway starting up...")
    logger.info(f"  Recognition Service → {RECOGNITION_SERVICE_URL}")
    logger.info(f"  Catalog Service     → {CATALOG_SERVICE_URL}")
    logger.info(f"  Recommendation Svc  → {RECOMMENDATION_SERVICE_URL}")
    yield
    logger.info("Gateway shutting down.")


app = FastAPI(
    title="MusicTalk API Gateway",
    description="Unified API gateway for all MusicTalk microservices.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend in development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all downstream service routes
app.include_router(recognition_router)
app.include_router(catalog_router)
app.include_router(recommendation_router)


@app.get("/health")
async def gateway_health():
    """Gateway-level health check."""
    return {
        "status": "ok",
        "service": "gateway",
        "downstream": {
            "recognition": RECOGNITION_SERVICE_URL,
            "catalog": CATALOG_SERVICE_URL,
            "recommendation": RECOMMENDATION_SERVICE_URL,
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
