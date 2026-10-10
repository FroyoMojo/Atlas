# Evidence format (plan v3 section 8.7)

Every payout's Memo carries a hash of the exact reading it acted on. The engine (Python) writes
the preimage and hash when an event opens; the bot (TypeScript) re-hashes the preimage before
paying; the verify page (browser) re-hashes it again. All three must agree byte for byte.

## Preimage

```
atlas|v3|{gauge_id}|{value}|{event_time}|{run_id}|{storm_id}|{event_id}|{feed}|{slot}
```

| Field | Rule |
| --- | --- |
| `value` | The latched triggering value, exactly 2 decimals: `31.46` |
| `event_time` | The event's `opened_at`, UTC, whole seconds, trailing `Z`: `2026-10-11T03:15:00Z`. Drop milliseconds; never `+00:00`. |
| `feed`, `slot` | Switchboard feed pubkey and slot, or `-` when not used |

Hash: SHA-256 of the UTF-8 preimage, lowercase hex. Memo text on-chain: `atlas:v3:<hash>`.

## Code

Python (engine):

```python
import hashlib, datetime as dt

def preimage(gauge_id, value, opened_at, run_id, storm_id, event_id, feed=None, slot=None):
    t = opened_at.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return "|".join(["atlas", "v3", gauge_id, f"{value:.2f}", t, run_id, storm_id, event_id,
                     feed or "-", str(slot) if slot is not None else "-"])

evidence_hash = hashlib.sha256(preimage(...).encode("utf-8")).hexdigest()
```

TypeScript: `chain/src/lib/memo.ts` (`evidencePreimage`, `sha256Hex`). Browser: `web/src/evidence.ts`.

## Test vector

Both implementations were run on this input and produce the same output:

- gauge `08074500`, value `31.456`, opened at `2026-10-11T03:15:00.250Z`, run `run-7`, storm `run-7-s1`, event `run-7-e3`, no feed
- Preimage: `atlas|v3|08074500|31.46|2026-10-11T03:15:00Z|run-7|run-7-s1|run-7-e3|-|-`
- Hash: `a3bf1d54bf92482a546d48927da5801cc8452da55dee080956c8ce7222bf3642`

## What it proves

That the payout matches a recorded reading. It does not prove the reading is true; that is the
oracle's job (Switchboard upgrade, plan 8.10).
