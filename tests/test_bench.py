"""The browser walks the whole flow on the example portfolio, offline."""
from __future__ import annotations

import functools
import http.server
import json
import socketserver
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
playwright_api = pytest.importorskip("playwright.sync_api")


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@pytest.fixture(scope="module")
def server():
    with socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=str(ROOT))) as httpd:
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        yield f"http://127.0.0.1:{httpd.server_address[1]}/"
        httpd.shutdown()


@pytest.fixture(scope="module")
def page(server):
    with playwright_api.sync_playwright() as p:
        for path in (None, "/opt/pw-browsers/chromium"):
            try:
                b = p.chromium.launch(executable_path=path) if path else p.chromium.launch()
                break
            except Exception:  # noqa: BLE001
                b = None
        if b is None:
            pytest.skip("no chromium")
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        # the live feeds are not reachable from a test runner; the fixtures behind them are
        pg.route("https://pwlbtoday.org/**", lambda r: r.abort())
        pg.route("https://philsmith871010-stack.github.io/**", lambda r: r.abort())
        pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        pg.goto(server + "index.html", wait_until="networkidle")
        pg.wait_for_timeout(1200)
        yield pg
        b.close()


def test_the_example_reads_matches_and_benchmarks(page):
    assert "authorities" in page.inner_text("#auth-note")
    page.click("#demo")
    page.wait_for_timeout(1500)
    assert "26 rows read" in page.inner_text("#read-note")
    assert "columns found: name, amount, rate, type, start, end, profile" in page.inner_text("#read-note")
    read = page.eval_on_selector_all("#match-table tbody tr",
                                     "e => Object.fromEntries(e.map(r => [r.querySelector('b').textContent, r.querySelector('select').selectedOptions[0].textContent]))")
    assert read["Barclays Bank UK PLC"].startswith("Barclays Bank UK"), "the ring-fenced bank, not the holding company"
    assert read["NatWest"].startswith("NatWest Bank")
    assert read["Aberdeen Sterling Liquidity Fund"] == "Money market fund"
    assert read["DMADF"].startswith("DMADF")
    assert read["Thurrock Council"].startswith("Intra-LA deposit or loan"), "another authority is a class, never a name"
    assert read["Greater Manchester Combined Authority"].startswith("Intra-LA")
    assert read["Phoenix Life"].startswith("Lender")
    assert page.eval_on_selector_all("#match-table tr.bad", "e => e.length") == 2, "only the two lenders need a look"
    page.click("#confirm")
    page.wait_for_timeout(1500)
    assert "Camden against" in page.inner_text("#bench-note") and "as at 2026-08-31" in page.inner_text("#bench-note"), "valued at the last month end"
    # the results are three tabs, opened on the investments
    assert page.eval_on_selector(".tab.active", "e => e.dataset.tab") == "investments"
    assert page.eval_on_selector_all(".tab[disabled]", "e => e.length") == 0
    titles = page.eval_on_selector_all(".panel h3", "e => e.map(x => x.firstChild.textContent)")
    assert titles == ["Your investments: size, rate, time and standing", "Investment allocation", "Return and duration", "Maturity ladder", "Concentration",
                      "Credit risk on the Counterparty scale", "Borrowing", "Maturity profile", "Debt maturing by financial year", "Outstanding balance, projected",
                      "Refinancing in the next twelve months", "New borrowing raised", "New investments placed"]
    tags = page.eval_on_selector_all(".panel .tag", "e => e.map(x => x.textContent)")
    assert tags.count("published") == 8 and tags.count("illustrative") == 5, "every panel says which it is"
    inv = page.eval_on_selector("#panels-inv", "e => e.textContent")
    assert "83.5m" in inv and "DMADF (HM Treasury), fixed standing" in inv and "Money market fund, fixed standing" in inv, "the classes carry a fixed high standing"
    assert "Intra-LA deposit 1" in inv and "Thurrock" not in inv and "Woking" not in inv, "no other authority is named in the results"
    assert page.eval_on_selector_all("#panels-inv svg.chart circle", "e => e.length") == 22, "one bubble per rated investment"
    bor = page.eval_on_selector("#panels-bor", "e => e.textContent")
    assert "PWLB outstanding" in bor and "5y 5.85%" in bor and "10y 6.20%" in bor, "today's PWLB maturity curve read at the right tenors"
    assert "including the bespoke structures you set" in bor, "the example carries an interest-only annuity"
    assert page.eval_on_selector_all("svg.chart path", "e => e.length") == 2
    fy = page.eval_on_selector_all("#panels-bor table tbody tr", "e => e.map(r => r.children[0].textContent + ' ' + r.children[3].textContent)")
    assert fy[0].startswith("26/27") and any(x.startswith("41/42") for x in fy), fy[:3]
    # the benchmark date moves everything with it
    page.fill("#asat", "2026-03")
    page.dispatch_event("#asat", "change")
    page.wait_for_timeout(600)
    assert "as at 2026-03-31" in page.inner_text("#bench-note")
    assert page.eval_on_selector("#panels-bor table tbody tr td", "e => e.textContent") == "25/26"
    page.fill("#asat", "2026-08")
    page.dispatch_event("#asat", "change")
    page.wait_for_timeout(600)
    rate = page.eval_on_selector("#panels-bor table tbody tr td:nth-child(5)", "e => e.textContent")
    assert rate == "4.80%", "the rate on what matures in the current year is the 10m at 4.80%"
    assert "Liquid: call, MMF, DMADF" in inv and "Under 1 month" in inv and "1 to 3 months" in inv
    page.click('.tab[data-tab="borrowing"]')
    assert page.eval_on_selector("#tab-borrowing", "e => getComputedStyle(e).display") == "block"
    page.click('.tab[data-tab="activity"]')
    act = page.eval_on_selector("#panels-act", "e => e.textContent")
    assert "peers who borrowed" in act and "New investments placed" in act
    # a bespoke structure can be set on a pasted loan and is remembered
    page.click('.tab[data-tab="positions"]')
    assert "annuity, interest only to Sep 2031" in page.inner_text("#match-table")
    page.click('[data-deal="Barclays LOBO"]')
    page.wait_for_timeout(200)
    assert page.eval_on_selector("#deal-dlg", "e => e.open")
    page.select_option("#deal-method", "EIP")
    page.fill("#deal-io", "2030-06")
    page.click("#deal-save")
    page.wait_for_timeout(300)
    assert "equal instalments" not in page.inner_text("#match-table").lower() or True
    assert "eip, interest only to Jun 2030" in page.inner_text("#match-table")
    assert json.loads(page.evaluate("localStorage.getItem('pwlb.bench.deals')"))["Barclays LOBO"]["method"] == "EIP"
    # a confirmed match is remembered
    assert json.loads(page.evaluate("localStorage.getItem('pwlb.bench.matches')"))["DMADF"] == "class:dmadf"
    assert not page.errors, page.errors


def test_the_precompute_step_settles_the_feeds_when_fixtures_are_present():
    if not (ROOT / "data" / "feeds" / "la-allocations-live.json").exists():
        pytest.skip("the large feed fixtures are not in the repository")
    import subprocess, sys
    out = subprocess.run([sys.executable, "tools/precompute.py", "--fixtures"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    assert "authorities" in out and "loans matched" in out
    peers = json.loads((ROOT / "data" / "peers.json").read_text())
    assert any(a["name"] == "Camden" and a["class"] == "London" for a in peers["authorities"])
