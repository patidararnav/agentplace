import unittest
from datetime import datetime, timedelta

from customer import (
    _sanitize_customer_utterance,
    choose_best_offer,
    acceptance_price_cap,
    customer_offer_utility,
    max_rounds_for_urgency,
    should_accept_vendor_offer,
    target_price_for_days,
)
from orchestrator import build_vendor_slot_candidates, _customer_utility_score
from vendor import (
    _diverse_shortlist_for_negotiation,
    _sanitize_vendor_utterance,
    _slot_opening_price,
)


def _future_iso(days: int, hour: int = 9) -> str:
    dt = datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(days=days)
    dt = dt.replace(hour=hour)
    return dt.isoformat(timespec="seconds")


class NegotiationTests(unittest.TestCase):
    def test_acceptance_cap_scales_with_urgency_and_time(self):
        budget = 200
        urgent_now = acceptance_price_cap(budget=budget, urgency=5, days_ahead=0)
        relaxed_now = acceptance_price_cap(budget=budget, urgency=1, days_ahead=0)
        relaxed_late = acceptance_price_cap(budget=budget, urgency=1, days_ahead=6)

        self.assertLessEqual(urgent_now, budget)
        self.assertGreater(urgent_now, relaxed_now)
        self.assertGreater(relaxed_now, relaxed_late)

    def test_customer_utility_prefers_time_when_urgent(self):
        budget = 200
        expensive_soon = customer_offer_utility(
            budget=budget,
            urgency=5,
            price=190,
            start_iso=_future_iso(1, 9),
            time_price_preference="time_first",
            priority=3,
        )
        cheap_late = customer_offer_utility(
            budget=budget,
            urgency=5,
            price=130,
            start_iso=_future_iso(6, 9),
            time_price_preference="time_first",
            priority=3,
        )
        self.assertGreater(expensive_soon, cheap_late)

    def test_customer_utility_prefers_price_when_not_urgent(self):
        budget = 200
        expensive_soon = _customer_utility_score(
            budget=budget,
            urgency=1,
            price=190,
            start_iso=_future_iso(1, 9),
            time_price_preference="price_first",
            priority=3,
        )
        cheap_late = _customer_utility_score(
            budget=budget,
            urgency=1,
            price=130,
            start_iso=_future_iso(6, 9),
            time_price_preference="price_first",
            priority=3,
        )
        self.assertGreater(cheap_late, expensive_soon)

    def test_vendor_slot_price_rises_with_load_and_urgency(self):
        base_prices = {"plumbing": 150}
        low_load = _slot_opening_price(
            base_prices=base_prices,
            aggression=3,
            service="plumbing",
            urgency=2,
            strategy="maximize_jobs",
            days_ahead=3,
            load_ratio=0.1,
        )
        high_load = _slot_opening_price(
            base_prices=base_prices,
            aggression=3,
            service="plumbing",
            urgency=5,
            strategy="maximize_jobs",
            days_ahead=0,
            load_ratio=0.9,
        )
        self.assertGreaterEqual(high_load, low_load)

    def test_build_vendor_slot_candidates_generates_overlap_slots(self):
        start_iso = _future_iso(2, 9)
        end_iso = _future_iso(2, 12)
        day_name = datetime.fromisoformat(start_iso).strftime("%A")
        windows = [
            {
                "start_iso": start_iso,
                "end_iso": end_iso,
                "priority": 4,
                "hard_constraint": True,
            }
        ]
        vendor_schedule = {
            day_name: ["09:00-17:00"],
        }
        candidates = build_vendor_slot_candidates(
            availability_windows=windows,
            vendor_availability=vendor_schedule,
            vendor_id=0,
            duration_minutes=60,
            latest_acceptable_start_iso="",
            max_candidates=10,
        )
        self.assertGreaterEqual(len(candidates), 2)
        self.assertTrue(all("start_iso" in c and "end_iso" in c for c in candidates))
        self.assertTrue(all(c.get("priority") == 4 for c in candidates))

    def test_build_vendor_slot_candidates_keeps_multi_day_coverage_when_capped(self):
        windows = []
        for day in (1, 2, 3):
            windows.append(
                {
                    "start_iso": _future_iso(day, 8),
                    "end_iso": _future_iso(day, 12),
                    "priority": 1,
                    "hard_constraint": False,
                }
            )

        candidates = build_vendor_slot_candidates(
            availability_windows=windows,
            vendor_availability={},
            vendor_id=0,
            duration_minutes=60,
            latest_acceptable_start_iso="",
            max_candidates=3,
        )
        self.assertEqual(len(candidates), 3)
        distinct_dates = {str(c["start_iso"])[:10] for c in candidates}
        self.assertEqual(len(distinct_dates), 3)

    def test_target_price_decreases_for_later_slots_when_not_urgent(self):
        budget = 200
        now_target = target_price_for_days(budget, urgency=1, days_ahead=0)
        late_target = target_price_for_days(budget, urgency=1, days_ahead=7)
        self.assertGreater(now_target, late_target)

    def test_max_rounds_is_fixed(self):
        for urgency in (1, 2, 3, 4, 5):
            self.assertEqual(max_rounds_for_urgency(urgency), 8)

    def test_final_round_accepts_when_offer_is_within_budget(self):
        self.assertFalse(
            should_accept_vendor_offer(
                budget=50,
                urgency=1,
                vendor_price=41,
                days_ahead=0,
                round_no=1,
                max_rounds=8,
            )
        )
        self.assertTrue(
            should_accept_vendor_offer(
                budget=50,
                urgency=1,
                vendor_price=41,
                days_ahead=0,
                round_no=8,
                max_rounds=8,
            )
        )

    def test_low_urgency_prefers_cheaper_later_offer(self):
        near = {"offer_id": "near", "price": 180, "start_iso": _future_iso(1, 9), "priority": 3}
        far = {"offer_id": "far", "price": 120, "start_iso": _future_iso(6, 9), "priority": 3}
        chosen = choose_best_offer(
            offers=[near, far],
            budget=220,
            urgency=1,
            time_price_preference="price_first",
        )
        self.assertEqual(chosen.get("offer_id"), "far")

    def test_customer_text_sanitizer_blocks_reservation_disclosure(self):
        fallback = "Thanks for the offer. Could we do $729 for the proposed time slot?"
        leaked = "My maximum budget is $748, but I can do $729 if needed."
        safe = _sanitize_customer_utterance(leaked, fallback)
        self.assertEqual(safe, fallback)

    def test_vendor_text_sanitizer_blocks_floor_language(self):
        fallback = "I can do $780 for the proposed time slot."
        leaked = "I appreciate it, but my lowest price is $780 and that's final."
        safe = _sanitize_vendor_utterance(leaked, fallback)
        self.assertEqual(safe, fallback)

    def test_vendor_shortlist_keeps_time_diversity(self):
        offers = [
            {"offer_id": "early", "price": 700, "start_iso": _future_iso(1, 9), "priority": 3},
            {"offer_id": "mid", "price": 690, "start_iso": _future_iso(3, 9), "priority": 3},
            {"offer_id": "late", "price": 680, "start_iso": _future_iso(6, 9), "priority": 3},
            {"offer_id": "late2", "price": 675, "start_iso": _future_iso(6, 11), "priority": 3},
        ]
        shortlisted = _diverse_shortlist_for_negotiation(
            strategy="maximize_jobs",
            offers=offers,
            max_items=3,
        )
        ids = {str(o.get("offer_id")) for o in shortlisted}
        self.assertIn("early", ids)
        self.assertTrue("late" in ids or "late2" in ids)


if __name__ == "__main__":
    unittest.main()
