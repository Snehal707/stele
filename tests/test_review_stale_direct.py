"""Direct-mode coverage for the freshness decision without localnet deployment."""


def test_review_stale_reads_timestamp_and_window(direct_deploy):
    """The real Governor helper reports fresh and stale timestamps correctly."""
    governor = direct_deploy("contracts/governor.py")
    address_type = __import__(governor._instance.__class__.__module__).Address
    agent = address_type("0x2222222222222222222222222222222222222222")

    governor.review_window[agent] = 180
    governor.last_review_timestamp[agent] = governor._now()

    assert governor.get_review_window(agent) == 180
    assert governor.get_last_review_timestamp(agent) > 0
    assert governor.is_review_stale(agent) is False

    governor.last_review_timestamp[agent] = governor._now() - 181

    assert governor.is_review_stale(agent) is True


def test_review_stale_fails_closed_before_first_review(direct_deploy):
    """An agent with no review timestamp is stale by design."""
    governor = direct_deploy("contracts/governor.py")
    address_type = __import__(governor._instance.__class__.__module__).Address
    agent = address_type("0x3333333333333333333333333333333333333333")

    governor.review_window[agent] = 180

    assert governor.get_last_review_timestamp(agent) == 0
    assert governor.is_review_stale(agent) is True
