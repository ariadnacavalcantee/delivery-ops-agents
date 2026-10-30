"""
Transforma a base pública da Olist (~100 mil pedidos reais) nos agregados que o site usa.

Uso:
    python3 scripts/build_data.py <pasta-com-os-csvs>

CSVs necessários (Brazilian E-Commerce Public Dataset by Olist, CC BY-NC-SA 4.0):
    olist_orders_dataset.csv, olist_order_items_dataset.csv, olist_sellers_dataset.csv,
    olist_customers_dataset.csv, olist_order_reviews_dataset.csv

Saída: src/data/scenarios.json (alguns KB). Os CSVs não vão para o repositório.

Definições:
    atrasado   = entregue depois da data estimada informada ao cliente
    aprovação  = compra → pagamento aprovado
    postagem   = aprovado → entregue à transportadora (responsabilidade do vendedor)
    transporte = transportadora → cliente
    prometido  = compra → data estimada de entrega
"""

import json
import sys
from pathlib import Path

import pandas as pd

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "data")
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "scenarios.json"

SCENARIOS = [
    {
        "id": "fev-mar-2018",
        "label": "Fev–mar 2018",
        "title": "Crise de fevereiro e março de 2018",
        "start": "2018-02-12", "end": "2018-03-19",
        "baseStart": "2018-01-01", "baseEnd": "2018-02-12",
    },
    {
        "id": "black-friday-2017",
        "label": "Black Friday 2017",
        "title": "Black Friday 2017",
        "start": "2017-11-20", "end": "2017-12-04",
        "baseStart": "2017-10-01", "baseEnd": "2017-11-13",
    },
    {
        "id": "abril-2018",
        "label": "Abril 2018",
        "title": "Abril de 2018",
        "start": "2018-04-09", "end": "2018-05-07",
        "baseStart": "2018-03-26", "baseEnd": "2018-04-09",
    },
]

MIN_STATE = 40
MIN_SELLER = 20


def days(s):
    return s.dt.total_seconds() / 86400


def load():
    dates = ["order_purchase_timestamp", "order_approved_at", "order_delivered_carrier_date",
             "order_delivered_customer_date", "order_estimated_delivery_date"]
    o = pd.read_csv(SRC / "olist_orders_dataset.csv", parse_dates=dates)
    it = pd.read_csv(SRC / "olist_order_items_dataset.csv", parse_dates=["shipping_limit_date"])
    se = pd.read_csv(SRC / "olist_sellers_dataset.csv")
    cu = pd.read_csv(SRC / "olist_customers_dataset.csv")
    rv = pd.read_csv(SRC / "olist_order_reviews_dataset.csv")

    # um vendedor por pedido: o do primeiro item (99% dos pedidos têm um vendedor só)
    first = (it.sort_values("order_item_id").groupby("order_id").first().reset_index()
             [["order_id", "seller_id", "shipping_limit_date"]])
    d = (o[o.order_status == "delivered"]
         .dropna(subset=["order_delivered_customer_date", "order_delivered_carrier_date", "order_approved_at"])
         .merge(first, on="order_id")
         .merge(se[["seller_id", "seller_state"]], on="seller_id")
         .merge(cu[["customer_id", "customer_state"]], on="customer_id")
         .merge(rv.groupby("order_id").review_score.mean(), on="order_id", how="left"))

    d["late"] = d.order_delivered_customer_date.dt.normalize() > d.order_estimated_delivery_date
    d["delay"] = days(d.order_delivered_customer_date.dt.normalize() - d.order_estimated_delivery_date)
    d["approve"] = days(d.order_approved_at - d.order_purchase_timestamp)
    d["handover"] = days(d.order_delivered_carrier_date - d.order_approved_at)
    d["seller_late"] = d.order_delivered_carrier_date > d.shipping_limit_date
    d["transit"] = days(d.order_delivered_customer_date - d.order_delivered_carrier_date)
    d["promised"] = days(d.order_estimated_delivery_date - d.order_purchase_timestamp)
    d["total"] = days(d.order_delivered_customer_date - d.order_purchase_timestamp)
    # transporte de pedidos entregues com sucesso (algumas linhas têm datas inconsistentes)
    d = d[(d.transit >= 0) & (d.handover >= 0)]
    return d


def r1(x):
    return None if pd.isna(x) else round(float(x), 1)


def pct(x):
    return None if pd.isna(x) else round(float(x) * 100, 1)


def window(d, a, b):
    return d[(d.order_purchase_timestamp >= a) & (d.order_purchase_timestamp < b)]


def cause_shares(p, base):
    """Para cada pedido atrasado, qual etapa mais passou do normal da linha de base."""
    late = p[p.late].copy()
    if late.empty:
        return []
    t_state = base.groupby("customer_state").transit.mean()
    pr_state = base.groupby("customer_state").promised.mean()
    excess = pd.DataFrame({
        "postagem_do_vendedor": late.handover - base.handover.mean(),
        "aprovacao_do_pagamento": late.approve - base.approve.mean(),
        "transporte": late.transit - late.customer_state.map(t_state).fillna(base.transit.mean()),
        "prazo_prometido_curto": late.customer_state.map(pr_state).fillna(base.promised.mean()) - late.promised,
    })
    top = excess.idxmax(axis=1).value_counts()
    return [{"component": k, "lateOrders": int(v), "sharePct": pct(v / len(late))} for k, v in top.items()]


def build(d, sc):
    p = window(d, sc["start"], sc["end"])
    base = window(d, sc["baseStart"], sc["baseEnd"])
    hist = d[d.order_purchase_timestamp < sc["start"]]
    hist90 = hist[hist.order_purchase_timestamp >= pd.Timestamp(sc["start"]) - pd.Timedelta(days=90)]

    def stage_block(df):
        return {k: r1(df[k].mean()) for k in ["approve", "handover", "transit", "total", "promised"]}

    overview = {
        "orders": int(len(p)),
        "lateOrders": int(p.late.sum()),
        "lateRatePct": pct(p.late.mean()),
        "baselineLateRatePct": pct(base.late.mean()),
        "avgDelayLateDays": r1(p[p.late].delay.mean()),
        "review": r1(p.review_score.mean()),
        "baselineReview": r1(base.review_score.mean()),
        "reviewLate": r1(p[p.late].review_score.mean()),
        "reviewOnTime": r1(p[~p.late].review_score.mean()),
        "sellerLatePct": pct(p.seller_late.mean()),
        "baselineSellerLatePct": pct(base.seller_late.mean()),
    }

    # semanas: linha de base + período
    span = d[(d.order_purchase_timestamp >= sc["baseStart"]) & (d.order_purchase_timestamp < sc["end"])].copy()
    span["week"] = span.order_purchase_timestamp.dt.to_period("W-SUN").dt.start_time
    weeks = sorted(span.week.unique())
    wk = span.groupby("week").agg(orders=("late", "size"), late=("late", "mean"))
    timeline = [{
        "week": w.strftime("%Y-%m-%d"),
        "label": f"{w.day} {['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][w.month-1]}",
        "inPeriod": bool(w >= pd.Timestamp(sc["start"]) - pd.Timedelta(days=6)),
        "orders": int(wk.loc[w, "orders"]),
        "lateRatePct": pct(wk.loc[w, "late"]),
    } for w in weeks]

    # estados (destino do pedido)
    bstate = base.groupby("customer_state").agg(bl=("late", "mean"), bt=("transit", "mean"), bp=("promised", "mean"))
    sg = p.groupby("customer_state").agg(n=("late", "size"), late=("late", "mean"), transit=("transit", "mean"),
                                         promised=("promised", "mean"), review=("review_score", "mean"))
    sg = sg[sg.n >= MIN_STATE].join(bstate)
    states = [{
        "state": s, "orders": int(r.n), "lateRatePct": pct(r.late), "baselineLateRatePct": pct(r.bl),
        "transitDays": r1(r.transit), "baselineTransitDays": r1(r.bt),
        "promisedDays": r1(r.promised), "baselinePromisedDays": r1(r.bp), "review": r1(r.review),
    } for s, r in sg.sort_values("n", ascending=False).iterrows()]

    # heatmap: 8 estados com mais pedidos × semanas
    top8 = [s["state"] for s in states[:8]]
    hm = span[span.customer_state.isin(top8)].groupby(["customer_state", "week"]).late.mean()
    heat = [{"state": s, "cells": [pct(hm.get((s, w), float("nan"))) or 0 for w in weeks]} for s in top8]

    # vendedores com volume no período
    sv = p.groupby("seller_id").agg(n=("late", "size"), late=("late", "mean"), sl=("seller_late", "mean"),
                                    handover=("handover", "mean"), st=("seller_state", "first"),
                                    far=("customer_state", lambda x: (x != "SP").mean()))
    hv = hist90.groupby("seller_id").agg(hn=("late", "size"), hl=("late", "mean"), hsl=("seller_late", "mean"))
    sv = sv[sv.n >= MIN_SELLER].join(hv)
    sellers = [{
        "sellerId": sid[:6], "state": r.st, "orders": int(r.n), "lateRatePct": pct(r.late),
        "postedLatePct": pct(r.sl), "handoverDays": r1(r.handover), "outsideSpPct": pct(r.far),
        "orders90d": int(r.hn) if not pd.isna(r.hn) else 0,
        "lateRate90dPct": pct(r.hl), "postedLate90dPct": pct(r.hsl),
    } for sid, r in sv.sort_values("late", ascending=False).iterrows()]

    return {
        **{k: sc[k] for k in ["id", "label", "title", "start", "end", "baseStart", "baseEnd"]},
        "overview": overview,
        "stages": {"period": stage_block(p), "baseline": stage_block(base)},
        "causes": cause_shares(p, base),
        "timeline": timeline,
        "states": states,
        "heatmap": heat,
        "sellers": sellers,
    }


def main():
    d = load()
    out = {
        "source": {
            "name": "Brazilian E-Commerce Public Dataset by Olist",
            "url": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce",
            "license": "CC BY-NC-SA 4.0",
            "deliveredOrders": int(len(d)),
            "reviewLate": r1(d[d.late].review_score.mean()),
            "reviewOnTime": r1(d[~d.late].review_score.mean()),
        },
        "scenarios": [build(d, sc) for sc in SCENARIOS],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"{OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
