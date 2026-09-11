"""Direct-mode coverage for the shared enrollment initializer."""


def test_initialize_enrollment_sets_shared_state_and_rejects_duplicates(direct_deploy):
    governor = direct_deploy("contracts/governor.py")
    address_type = __import__(governor._instance.__class__.__module__).Address
    agent = address_type("0x2222222222222222222222222222222222222222")
    vault = address_type("0x3333333333333333333333333333333333333333")

    governor._initialize_enrollment(
        agent,
        vault,
        "The agent may pay the declared provider.",
        1800,
        120,
        "",
        "",
        300,
    )

    assert governor.vault_of[agent] == vault
    assert governor.mandates[agent] == "The agent may pay the declared provider."
    assert governor.halt_window[agent] == 1800
    assert governor.claim_window[agent] == 120
    assert governor.review_window[agent] == 300
    assert governor.active_version[agent] == 1

    try:
        governor._initialize_enrollment(
            agent,
            vault,
            "A replacement mandate.",
            1800,
            120,
            "",
            "",
            300,
        )
    except Exception as error:
        assert "Agent already enrolled" in str(error)
    else:
        raise AssertionError("duplicate enrollment was not rejected")
