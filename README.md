# PWLB benchmarking

Peer benchmarking for a local authority's treasury portfolio. Paste the range from Excel, confirm
the names against the Counterparty master list, and see your allocation, return, duration,
concentration, credit risk and borrowing against your peer group.

Live: https://philsmith871010-stack.github.io/pwlbbenchmarking/

## What is real and what is not

- **Published.** Every authority's investment and borrowing balances by counterparty class, from
  the quarterly Local authority borrowing and investment returns, and the whole PWLB loan book,
  loan by loan, both read from pwlbtoday.org. Today's PWLB curves and the predicted next reset,
  the same way. Counterparty standing from the Counterparty site's published method.
- **Illustrative.** Peer return, duration, maturity ladder, concentration and credit score, which
  the public data does not carry. They are drawn from a fixed seed per authority, shaped like the
  real thing, and every panel that uses them says so. They will be replaced by the pool once it
  has contributors.
- **The pool.** "Contribute" holds an anonymised summary on this device only. The live version
  posts it to a shared store, with a minimum pool size before anything is shown.

## How it runs

A static site. `tools/precompute.py` settles the two large feeds into `data/peers.json` and
`data/pwlb-loans.json` each weekday morning under the Publish workflow, which also deploys to
GitHub Pages. The page reads those two files, the Counterparty master list from the Counterparty
site, and the rate feeds live with a fixture behind each.

```bash
python tools/precompute.py            # refresh from the live feeds
python tools/precompute.py --fixtures # from data/feeds (offline)
python -m pytest -q                   # the browser walks the whole flow on the example portfolio
```

## The paste

Columns are read from their contents and headings: counterparty, amount, rate, type, start, end
and, for loans, a repayment profile (maturity, annuity or EIP). A row whose type says borrowing,
LOBO, market loan or PWLB is borrowing; everything else is an investment. Confirmed matches are
kept in the browser, so the next paste is one click.
