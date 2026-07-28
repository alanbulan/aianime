from ai_anime.modules.model_usage.public import (
    BILLING_RULE_NOT_CONFIGURED_CODE,
    INSUFFICIENT_CREDITS_CODE,
    BillingRuleNotConfiguredError,
    InsufficientCreditsError,
    InsufficientCreditsStop,
    billing_rule_not_configured_payload,
    insufficient_credits_payload,
    is_insufficient_credits_error,
)


def test_insufficient_credit_payload_follows_exception_chain() -> None:
    error = InsufficientCreditsError(user_id="usr_1", cost=7, balance=2)
    wrapper = RuntimeError("provider failed")
    wrapper.__cause__ = error

    assert insufficient_credits_payload(wrapper) == {
        "error_code": INSUFFICIENT_CREDITS_CODE,
        "message": "积分不足，请联系管理员充值",
        "user_id": "usr_1",
        "required": 7,
        "balance": 2,
    }


def test_billing_rule_payload_follows_exception_chain() -> None:
    error = BillingRuleNotConfiguredError(kind=" image ", key=" gpt-image-2 ")
    wrapper = RuntimeError("quote failed")
    wrapper.__context__ = error

    assert billing_rule_not_configured_payload(wrapper) == {
        "error_code": BILLING_RULE_NOT_CONFIGURED_CODE,
        "message": "计费规则未配置，请联系管理员设置积分规则",
        "billing_kind": "image",
        "billing_key": "gpt-image-2",
    }


def test_insufficient_credit_detection_accepts_stop_and_provider_code() -> None:
    assert is_insufficient_credits_error(
        InsufficientCreditsStop(user_id="usr_1", cost=3, balance=0)
    )
    assert is_insufficient_credits_error(message="request failed: INSUFFICIENT_CREDITS")
