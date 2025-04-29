import time, logging
from fastapi import Request

logger = logging.getLogger("api")

async def timing_middleware(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000
    logger.info("[TIMING] %s %.1f ms", request.url.path, ms)
    response.headers["X-Process-Time"] = f"{ms:.1f}ms"
    return response
