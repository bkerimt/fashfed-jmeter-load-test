"""
JMeter sonuç dosyalarını (.jtl) okur, özet tablo çıkarır ve kalite kapısı uygular.

JMeter komut satırında assertion başarısız olsa bile "başarılı" çıkış kodu döner.
Bu script hata oranına bakar ve eşik aşılırsa CI'ı kırmızıya düşürür.

Kullanım:
    python3 scripts/check_results.py results/smoke.jtl results/journey.jtl

Eşikler (ortam değişkeni ile değiştirilebilir):
    MAX_ERROR_PCT  izin verilen en yüksek hata oranı (%), varsayılan 0
    MAX_P95_MS     izin verilen en yüksek p95 yanıt süresi (ms), varsayılan 2000
"""
import csv
import math
import os
import sys
from collections import defaultdict

MAX_ERROR_PCT = float(os.environ.get("MAX_ERROR_PCT", "0"))
MAX_P95_MS = float(os.environ.get("MAX_P95_MS", "2000"))
SKIP_PREFIXES = ("99 -",)  # Debug Sampler raporlanmaz


def percentile(values, pct):
    if not values:
        return 0
    ordered = sorted(values)
    index = max(0, math.ceil(pct / 100 * len(ordered)) - 1)
    return ordered[index]


def analyse(path):
    by_label = defaultdict(lambda: {"times": [], "errors": 0, "messages": set()})
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            label = row["label"]
            if label.startswith(SKIP_PREFIXES):
                continue
            stats = by_label[label]
            stats["times"].append(int(row["elapsed"]))
            if row["success"].lower() != "true":
                stats["errors"] += 1
                if row.get("failureMessage"):
                    stats["messages"].add(row["failureMessage"])
    return by_label


def main(paths):
    lines = []
    failed = False

    for path in paths:
        if not os.path.exists(path):
            print(f"HATA: {path} bulunamadı")
            failed = True
            continue

        by_label = analyse(path)
        total = sum(len(s["times"]) for s in by_label.values())
        errors = sum(s["errors"] for s in by_label.values())
        all_times = [t for s in by_label.values() for t in s["times"]]
        error_pct = (errors / total * 100) if total else 100
        p95 = percentile(all_times, 95)

        ok = total > 0 and error_pct <= MAX_ERROR_PCT and p95 <= MAX_P95_MS
        failed |= not ok

        lines.append(f"### {'✅' if ok else '❌'} {os.path.basename(path)}")
        lines.append("")
        lines.append(f"**{total}** istek · hata **%{error_pct:.2f}** (eşik %{MAX_ERROR_PCT:g}) · "
                     f"p95 **{p95} ms** (eşik {MAX_P95_MS:g} ms)")
        lines.append("")
        lines.append("| İstek | Adet | Ort. (ms) | p90 (ms) | p95 (ms) | Maks (ms) | Hata |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|")
        for label in sorted(by_label):
            s = by_label[label]
            t = s["times"]
            lines.append(f"| {label} | {len(t)} | {sum(t) / len(t):.0f} | {percentile(t, 90)} | "
                         f"{percentile(t, 95)} | {max(t)} | {s['errors']} |")
        messages = {m for s in by_label.values() for m in s["messages"]}
        if messages:
            lines.append("")
            lines.append("**Hata mesajları:**")
            for m in sorted(messages)[:10]:
                lines.append(f"- {m}")
        lines.append("")

    report = "\n".join(lines)
    print(report)

    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "a", encoding="utf-8") as f:
            f.write("## JMeter Sonuçları\n\n" + report + "\n")

    if failed:
        print("❌ Kalite kapısı geçilemedi")
        sys.exit(1)
    print("✅ Tüm testler kalite kapısını geçti")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1:])
