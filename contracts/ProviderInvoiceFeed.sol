pragma solidity ^0.8.0;

/// @notice Provider-controlled, sealed invoice-count evidence for the v4 demo.
/// The governor reads this contract during review; it does not accept caller-
/// supplied evidence in review(agent).
contract ProviderInvoiceFeed {
    address public immutable provider;
    bytes32 public invoiceRoot;
    uint256 public invoiceCount;
    uint256 public period;
    bool public initialized;
    bool public sealed;

    constructor() {
        provider = msg.sender;
    }

    modifier onlyProvider() {
        require(msg.sender == provider, "Only provider");
        _;
    }

    function updateFeed(
        bytes32 _root,
        uint256 _count,
        uint256 _period
    ) external onlyProvider {
        require(!sealed, "feed sealed");
        invoiceRoot = _root;
        invoiceCount = _count;
        period = _period;
        initialized = true;
    }

    function seal() external onlyProvider {
        require(initialized, "must call updateFeed before seal");
        sealed = true;
    }
}
