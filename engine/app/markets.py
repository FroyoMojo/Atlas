"""Market grading (docs/readiness.md): is a gauge a priceable flood-protection market?

A market needs a flood rate that insurance arithmetic can price: reached often enough to be
worth covering, rarely enough that the premium is not simply the payout, over enough years to
trust the estimate. The thresholds are stated here so the grade can be audited, and they are the
same ones used on the Houston markets.
"""
VIABLE_MIN, VIABLE_MAX = 0.05, 0.35      # share of years the policy trigger is reached
A_MIN_YEARS, B_MIN_YEARS = 15, 10         # comparable years of annual peaks


def grade_market(years: int, exceedances: int) -> tuple[str, list[str]]:
    """Returns (grade, reasons). A: viable rate and 15+ years. B: viable rate and 10 to 14 years.
    C: not recommended (rate too high or too low to price, or too little record)."""
    reasons: list[str] = []
    if years <= 0:
        return "C", ["no comparable record"]
    freq = exceedances / years
    if freq > VIABLE_MAX:
        reasons.append(f"trigger reached in {100 * freq:.0f}% of years: the premium would approach the payout")
    elif freq < VIABLE_MIN:
        reasons.append(f"trigger reached in only {100 * freq:.0f}% of years: too rare to price from this record")
    if years < B_MIN_YEARS:
        reasons.append(f"only {years} comparable years")
    if reasons:
        return "C", reasons
    if exceedances < 2:
        return "B", [f"the rate rests on a single event in {years} years: very uncertain"]
    if years >= A_MIN_YEARS:
        return "A", [f"{years} years, trigger reached in {100 * freq:.0f}% of them"]
    return "B", [f"{years} years is short: wide premium band", f"trigger reached in {100 * freq:.0f}% of years"]
