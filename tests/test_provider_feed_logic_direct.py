def _state(destination, payment_count: int) -> dict:
    return {
        "spend_total": payment_count,
        "destination_count": 1,
        "balance": 0,
        "payments": {destination: payment_count},
        "total": {destination: payment_count},
    }


def test_provider_feed_count_and_fail_closed_recorders(direct_deploy):
    governor = direct_deploy("contracts/governor.py")
    address_type = __import__(governor._instance.__class__.__module__).Address
    destination = address_type("0x1111111111111111111111111111111111111111")
    agent = address_type("0x2222222222222222222222222222222222222222")
    state = _state(destination, 48)

    assert governor._payment_count(state) == 48
    assert governor._payment_count(state) != 47

    governor.halt_window[agent] = 1800
    governor._record_feed_conflict(agent, "pinned", state, 47, 48)
    assert governor.governed[agent] == "EVIDENCE_CONFLICT"
    assert governor.halted[agent] is True
    assert governor.verdicts[-1].web_source == "provider_feed"

    governor._record_review_failure(
        agent,
        "pinned",
        state,
        "feed unavailable",
        "UNAVAILABLE",
    )
    assert governor.governed[agent] == "REVIEW_FAILED"
    assert governor.halted[agent] is True
    assert governor.verdicts[-1].web_evidence_status == "UNAVAILABLE"
