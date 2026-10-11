"""Engine settings, read from the repo-root .env (the same file the chain service uses)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def env_str(name: str, default: str = "") -> str:
    """A value that is only a comment ("REPLAY_CMD=   # note" read by python-dotenv) is empty."""
    v = (os.environ.get(name) or "").strip()
    return default if not v or v.startswith("#") else v


def _float(name: str, default: float) -> float:
    return float(env_str(name) or default)


DATABASE_URL = os.environ.get("DATABASE_URL", "")
CHAIN_URL = os.environ.get("CHAIN_URL") or f"http://127.0.0.1:{os.environ.get('CHAIN_PORT') or 8787}"
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
DEMO_MODE = (os.environ.get("DEMO_MODE") or "true").lower() == "true"
# Protection starts this many days after purchase, so nobody can buy once a storm is forecast.
# The chain service reads the same variable. Default: 7, or 0 in demo mode (the replay is minutes long).
WAITING_DAYS = int(_float("WAITING_DAYS", 0 if DEMO_MODE else 7))
# Outside a replay, close sales while the NWS has a flood or storm watch/warning at the gauge.
LIVE_FREEZE = (os.environ.get("LIVE_FREEZE") or "true").lower() == "true"
# Optional: command that streams the replay into gauge_readings. Started by POST /replay/start
# with RUN_ID in its environment, stopped by POST /replay/reset. Ezekiel owns the streamer.
REPLAY_CMD = env_str("REPLAY_CMD")
CORS_ORIGINS = [o for o in (os.environ.get("ENGINE_CORS_ORIGINS") or "*").split(",") if o]

# On-chain capital at setup (chain .env): vault = seeded reserve + seeded bond capital.
SNAPSHOT_VAULT = _float("SNAPSHOT_VAULT", 5300)
SNAPSHOT_FLOAT = _float("SNAPSHOT_FLOAT", 2000)
SEED_RESERVE = _float("SEED_RESERVE", 300)

# Reference economics (plan v3.1 section 7). Ezekiel owns these numbers.
# Policy term t. One setting for both sides: TERM_DAYS (the chain reads the same variable); an
# explicit TERM_YEARS still wins for old .env files, and preflight checks the two agree.
TERM_DAYS = _float("TERM_DAYS", 90)
TERM_YEARS = _float("TERM_YEARS", TERM_DAYS / 365)
THETA = _float("PRICING_THETA", 0.35)           # risk load
COST_OF_CAPITAL = _float("PRICING_C", 0.06)     # bond coupon rate c on k
EXPENSE_RATIO = _float("PRICING_E", 0.10)       # expenses e (simulated book only)
MIN_PREMIUM = _float("MIN_PREMIUM", 1.0)
BOOTSTRAP_N = int(_float("BOOTSTRAP_N", 2000))
HARVEY_WATER_YEAR = int(_float("HARVEY_WATER_YEAR", 2017))
NEAR_FRACTION = _float("NEAR_FRACTION", 0.9)    # status "near" at 90% of trigger


# Readiness-linked pricing (docs/readiness.md). Off by default: quotes stay on the original formula
# until this is set to true. When on, the risk load and capital charge shrink with the share of the
# promised payouts already covered by the community's own money.
READINESS_PRICING = (os.environ.get("READINESS_PRICING") or "false").lower() == "true"
# Simulated candidate markets: how many households a launch is sized for (gap = payout x households).
SIM_HOUSEHOLDS = int(_float("SIM_HOUSEHOLDS", 500))
