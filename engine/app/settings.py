"""Engine settings, read from the repo-root .env (the same file the chain service uses)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def _float(name: str, default: float) -> float:
    return float(os.environ.get(name) or default)


DATABASE_URL = os.environ.get("DATABASE_URL", "")
CHAIN_URL = os.environ.get("CHAIN_URL") or f"http://127.0.0.1:{os.environ.get('CHAIN_PORT') or 8787}"
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
DEMO_MODE = (os.environ.get("DEMO_MODE") or "true").lower() == "true"
# Optional: command that streams the replay into gauge_readings. Started by POST /replay/start
# with RUN_ID in its environment, stopped by POST /replay/reset. Ezekiel owns the streamer.
REPLAY_CMD = os.environ.get("REPLAY_CMD", "")
CORS_ORIGINS = [o for o in (os.environ.get("ENGINE_CORS_ORIGINS") or "*").split(",") if o]

# On-chain capital at setup (chain .env): vault = seeded reserve + seeded bond capital.
SNAPSHOT_VAULT = _float("SNAPSHOT_VAULT", 5300)
SNAPSHOT_FLOAT = _float("SNAPSHOT_FLOAT", 2000)
SEED_RESERVE = _float("SEED_RESERVE", 300)

# Reference economics (plan v3.1 section 7). Ezekiel owns these numbers.
TERM_YEARS = _float("TERM_YEARS", 90 / 365)     # policy term t: 90 days (chain TERM_DAYS must match)
THETA = _float("PRICING_THETA", 0.35)           # risk load
COST_OF_CAPITAL = _float("PRICING_C", 0.06)     # bond coupon rate c on k
EXPENSE_RATIO = _float("PRICING_E", 0.10)       # expenses e (simulated book only)
MIN_PREMIUM = _float("MIN_PREMIUM", 1.0)
BOOTSTRAP_N = int(_float("BOOTSTRAP_N", 2000))
HARVEY_WATER_YEAR = int(_float("HARVEY_WATER_YEAR", 2017))
NEAR_FRACTION = _float("NEAR_FRACTION", 0.9)    # status "near" at 90% of trigger

