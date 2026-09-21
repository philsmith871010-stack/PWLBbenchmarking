"""Turn the pwlbtoday.org feeds into the two small files the page reads.

The allocations feed is eight megabytes of every quarter since 2020 for every body that files a
return; the page needs one quarter, one row per authority. The loan book is sixteen thousand
loans under borrower names written the Treasury's way; the page needs them under the names the
returns use. Both are settled here, once a day, and committed, so the page opens on nothing
slower than a static file.

    python tools/precompute.py            # fetch live and write data/peers.json, data/pwlb-loans.json
    python tools/precompute.py --fixtures # from data/feeds/*.json instead (offline, tests)
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEEDS = ROOT / "data" / "feeds"
API = "https://pwlbtoday.org/api/data/"

# the investment columns of the return, folded into the classes a treasurer thinks in
INV = {
    "banks": ["Deposits: banks", "Certificates of deposit: banks"],
    "bs": ["Deposits: building societies", "Certificates of deposit: building societies"],
    "mmf": ["Money market funds"],
    "dmadf": ["Debt Management Account deposit facility"],
    "gov": ["Treasury bills", "British Government (Gilt-edge) securities"],
    "la": ["Loans Local Government"],
    "funds": ["Externally managed funds"],
    "other": ["Other financial intermediaries", "Public corporations", "Other investments"],
}
BOR = {
    "pwlb": ["Loans Longer-term - PWLB"],
    "la": ["Short Term Loans Local Authorities", "Longer Term Loans Local Authorities"],
    "market": ["Loans Longer-term - Banks in UK", "Loans Longer-term - Building Societies",
               "Loans Longer-term - Other financial intermediaries", "Loans Longer-term - Public corporations",
               "Loans Longer-term - Private non-financial corporations", "Loans Longer-term - Households sector",
               "Loans Longer-term - Other Sources", "Securities - Negotiable bonds & commercial paper",
               "Securities - Other stock issues"],
    "short": ["Short term Loans"],
    "gov": ["Loans Longer-term - Central Government", "Loans short term - Central Government"],
}
STOP = {"COUNCIL", "COUNTY", "BOROUGH", "LONDON", "CITY", "OF", "THE", "DISTRICT", "METROPOLITAN", "ROYAL",
        "UNITARY", "AUTHORITY", "COMBINED", "MBC", "DC", "BC", "CC", "LB", "RB", "AND", "COMMON", "UA", "TOWNS", "C", "PCC"}


def feed(key: str, fixtures: bool) -> list[list[str]]:
    if fixtures:
        return json.loads((FEEDS / f"{key}.json").read_text())["data"]["values"]
    with urllib.request.urlopen(API + key, timeout=120) as r:
        return json.load(r)["data"]["values"]


def num(v) -> float:
    try:
        return float(str(v).replace(",", "").replace("£", "").strip() or 0)
    except ValueError:
        return 0.0


def norm(name: str) -> str:
    s = re.sub(r"\(.*?\)", " ", str(name).upper()).replace("&", " AND ").replace("-", " ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    toks = [t for t in s.split() if t not in STOP]
    return " ".join(toks)


def latest(rows, prefix):
    mine = [r for r in rows if r[0].startswith(prefix)]
    q = max(r[1] for r in mine)
    return q, [r for r in mine if r[1] == q]


def iso(dmy: str) -> str:
    d, m, y = dmy.split("/")
    return f"{y}-{m}-{d}"


def main(fixtures: bool) -> None:
    al = feed("la-allocations-live", fixtures)
    hdr, rows = al[0], al[1:]
    col = {h: i for i, h in enumerate(hdr)}
    qi, inv_rows = latest(rows, "LA_Investments")
    qb, bor_rows = latest(rows, "LA_Borrowing")
    lm = feed("la-metrics-data", fixtures)
    lmh = {h: i for i, h in enumerate(lm[0])}
    klass, size = {}, {}
    for r in lm[1:]:                                   # the newest year wins
        code = r[lmh["LA Code"]]
        if code not in klass or r[lmh["Year"]] >= size.get(code, ("", 0))[0]:
            klass[code] = r[lmh["Class"]]
            size[code] = (r[lmh["Year"]], num(r[lmh["NRE"]]))

    auth: dict[str, dict] = {}
    def get(r):
        code = r[col["LGF code"]]
        if code not in auth:
            auth[code] = {"code": code, "name": r[col["Local authority name"]], "class": klass.get(code, ""),
                          "nre": size.get(code, ("", 0))[1], "inv": {}, "bor": {}}
        return auth[code]
    for r in inv_rows:
        a = get(r)
        a["inv"] = {k: round(sum(num(r[col[c]]) for c in cs) / 1000, 3) for k, cs in INV.items()}
        a["inv"]["total"] = round(num(r[col["Investments"]]) / 1000, 3)
    for r in bor_rows:
        a = get(r)
        a["bor"] = {k: round(sum(num(r[col[c]]) for c in cs) / 1000, 3) for k, cs in BOR.items()}
        a["bor"]["total"] = round(num(r[col["Loans"]]) / 1000, 3)

    # the loan book, under the names the returns use
    bc = feed("bc-loans", fixtures)
    bh = {h: i for i, h in enumerate(bc[0])}
    by_norm = defaultdict(list)
    for code, a in auth.items():
        by_norm[norm(a["name"])].append(code)
    loans: dict[str, list] = defaultdict(list)
    unmatched, matched_names = defaultdict(float), {}
    for r in bc[1:]:
        who = r[bh["BORROWER"]]
        if who not in matched_names:
            n = norm(who)
            hit = by_norm.get(n)
            if not hit:
                # a unique authority whose every token is in the borrower's name
                # the longest authority name whose every token is in the borrower's name: Bath and
                # North East Somerset, not North Somerset, for a Bath borrower
                cands = sorted(((len(k.split()), c) for k, cs in by_norm.items() if k and set(k.split()) <= set(n.split()) for c in cs), reverse=True)
                hit = [cands[0][1]] if cands and (len(cands) == 1 or cands[0][0] > cands[1][0]) else None
            matched_names[who] = hit[0] if hit else None
        code = matched_names[who]
        if not code:
            unmatched[who] += num(r[bh["Principal"]])
            continue
        method = r[bh["Method"]].upper()
        method = "MATURITY" if method == "FIXED" else method
        loans[code].append([method, r[bh["Start"]], r[bh["Maturity"]], round(num(r[bh["Principal"]])), num(r[bh["Rate"]])])

    # new PWLB loans, the last two years, under the same names: what the peers actually raised
    act = feed("pwlb-activity", fixtures)
    ah = {h: i for i, h in enumerate(act[0])}
    activity: dict[str, list] = defaultdict(list)
    def dmy_words(s):
        try:
            return datetime.strptime(s.strip(), "%d %b %Y").date().isoformat()
        except ValueError:
            return None
    cutoff = date.today().replace(year=date.today().year - 2).isoformat()
    for r in act[1:]:
        when = dmy_words(r[ah["Settlement Date"]])
        if not when or when < cutoff:
            continue
        who = r[ah["Counterparty Name"]]
        if who not in matched_names:
            n = norm(who); hit = by_norm.get(n)
            if not hit:
                cands = sorted(((len(k.split()), c) for k, cs in by_norm.items() if k and set(k.split()) <= set(n.split()) for c in cs), reverse=True)
                hit = [cands[0][1]] if cands and (len(cands) == 1 or cands[0][0] > cands[1][0]) else None
            matched_names[who] = hit[0] if hit else None
        code = matched_names[who]
        if not code:
            continue
        kind = r[ah["Loan Type and Repayment Method"]].upper()
        method = "ANNUITY" if "ANNUITY" in kind else "EIP" if "EIP" in kind else "MATURITY"
        mat = dmy_words(r[ah["Maturity Date"]])
        activity[code].append([when, mat, method, round(num(r[ah["Amount Advanced (£)"]])), num(r[ah["Interest Rate (%)"]])])

    out = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "quarter": iso(qi), "quarter_borrowing": iso(qb),
           "authorities": sorted(auth.values(), key=lambda a: a["name"])}
    (ROOT / "data" / "peers.json").write_text(json.dumps(out, separators=(",", ":")))
    (ROOT / "data" / "pwlb-loans.json").write_text(json.dumps({"generated": out["generated"], "loans": loans, "activity": activity, "activity_from": cutoff}, separators=(",", ":")))
    big = sorted(unmatched.items(), key=lambda x: -x[1])[:8]
    print(f"{len(auth)} authorities, quarter {out['quarter']}; loans matched for {len(loans)} of them, "
          f"{sum(len(v) for v in loans.values())} loans; {len(unmatched)} borrowers unmatched, largest: "
          + "; ".join(f"{k} ({v/1e6:.0f}m)" for k, v in big))


if __name__ == "__main__":
    main("--fixtures" in sys.argv)
