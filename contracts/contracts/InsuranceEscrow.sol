// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract InsuranceEscrow {
    enum PolicyState {
        Offered,
        Active,
        Resolved,
        Cancelled
    }

    struct Policy {
        address insurer;
        address insured;
        uint256 coverageAmount;
        uint256 premiumAmount;
        uint256 durationSeconds;
        uint256 startTime;
        uint256 endTime;
        string location;
        uint256 windSpeedKmh;
        PolicyState state;
        bool eventOccurred;
    }

    uint256 public policyCount;
    mapping(uint256 => Policy) public policies;
    mapping(address => bool) public verifiedUsers;

    address public owner;
    address public oracle;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OracleUpdated(address indexed newOracle);
    event VerifiedUpdated(address indexed user, bool verified);
    event PolicyOffered(
        uint256 indexed policyId,
        address indexed insurer,
        uint256 coverageAmount,
        uint256 premiumAmount
    );
    event PolicyAccepted(
        uint256 indexed policyId,
        address indexed insured,
        uint256 startTime,
        uint256 endTime
    );
    event PolicyResolved(
        uint256 indexed policyId,
        bool eventOccurred,
        uint256 payoutToInsured,
        uint256 payoutToInsurer
    );
    event PolicyCancelled(uint256 indexed policyId);

    error NotOwner();
    error NotOracle();
    error NotVerified();
    error PolicyNotFound();
    error PolicyNotOpen();
    error PolicyNotActive();
    error PolicyStillActive();
    error InsurerCannotAccept();
    error NotInsurer();
    error InvalidCoverage();
    error InvalidPremium();
    error InvalidDuration();
    error InvalidPremiumPayment();
    error InvalidOracle();
    error InvalidOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    constructor(address initialOracle) {
        owner = msg.sender;
        oracle = initialOracle == address(0) ? msg.sender : initialOracle;
        verifiedUsers[msg.sender] = true;
        if (oracle != msg.sender) {
            verifiedUsers[oracle] = true;
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert InvalidOracle();
        oracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    function setVerified(address user, bool verified) external onlyOwner {
        verifiedUsers[user] = verified;
        emit VerifiedUpdated(user, verified);
    }

    function createPolicyOffer(
        uint256 premiumAmount,
        uint256 durationSeconds,
        string calldata location,
        uint256 windSpeedKmh
    ) external payable returns (uint256 policyId) {
        if (!verifiedUsers[msg.sender]) revert NotVerified();
        if (msg.value == 0) revert InvalidCoverage();
        if (premiumAmount == 0) revert InvalidPremium();
        if (durationSeconds == 0) revert InvalidDuration();

        policyId = policyCount;
        Policy storage p = policies[policyId];
        p.insurer = msg.sender;
        p.coverageAmount = msg.value;
        p.premiumAmount = premiumAmount;
        p.durationSeconds = durationSeconds;
        p.location = location;
        p.windSpeedKmh = windSpeedKmh;
        p.state = PolicyState.Offered;
        p.eventOccurred = false;

        policyCount++;

        emit PolicyOffered(policyId, msg.sender, msg.value, premiumAmount);
    }

    function cancelOffer(uint256 policyId) external {
        Policy storage p = policies[policyId];

        if (p.insurer == address(0)) revert PolicyNotFound();
        if (p.state != PolicyState.Offered) revert PolicyNotOpen();
        if (msg.sender != p.insurer) revert NotInsurer();

        p.state = PolicyState.Cancelled;

        _safeTransfer(p.insurer, p.coverageAmount);

        emit PolicyCancelled(policyId);
    }

    function acceptPolicy(uint256 policyId) external payable {
        Policy storage p = policies[policyId];

        if (p.insurer == address(0)) revert PolicyNotFound();
        if (p.state != PolicyState.Offered) revert PolicyNotOpen();
        if (msg.sender == p.insurer) revert InsurerCannotAccept();
        if (!verifiedUsers[msg.sender]) revert NotVerified();
        if (msg.value != p.premiumAmount) revert InvalidPremiumPayment();

        p.insured = msg.sender;
        p.startTime = block.timestamp;
        p.endTime = block.timestamp + p.durationSeconds;
        p.state = PolicyState.Active;

        emit PolicyAccepted(policyId, msg.sender, p.startTime, p.endTime);
    }

    function resolvePolicy(uint256 policyId, bool eventOccurred) external onlyOracle {
        Policy storage p = policies[policyId];

        if (p.insurer == address(0)) revert PolicyNotFound();
        if (p.state != PolicyState.Active) revert PolicyNotActive();

        p.state = PolicyState.Resolved;
        p.eventOccurred = eventOccurred;

        uint256 payoutToInsured;
        uint256 payoutToInsurer;

        if (eventOccurred) {
            payoutToInsured = p.coverageAmount;
            payoutToInsurer = p.premiumAmount;
            _safeTransfer(p.insured, payoutToInsured);
            _safeTransfer(p.insurer, payoutToInsurer);
        } else {
            payoutToInsurer = p.coverageAmount + p.premiumAmount;
            _safeTransfer(p.insurer, payoutToInsurer);
        }

        emit PolicyResolved(policyId, eventOccurred, payoutToInsured, payoutToInsurer);
    }

    function finalizeExpiredPolicy(uint256 policyId) external {
        Policy storage p = policies[policyId];

        if (p.insurer == address(0)) revert PolicyNotFound();
        if (p.state != PolicyState.Active) revert PolicyNotActive();
        if (block.timestamp <= p.endTime) revert PolicyStillActive();

        p.state = PolicyState.Resolved;
        p.eventOccurred = false;

        uint256 payoutToInsurer = p.coverageAmount + p.premiumAmount;
        _safeTransfer(p.insurer, payoutToInsurer);

        emit PolicyResolved(policyId, false, 0, payoutToInsurer);
    }

    function getPolicies() external view returns (Policy[] memory) {
        Policy[] memory allPolicies = new Policy[](policyCount);
        for (uint256 i = 0; i < policyCount; i++) {
            allPolicies[i] = policies[i];
        }
        return allPolicies;
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        Policy memory p = policies[policyId];
        if (p.insurer == address(0)) revert PolicyNotFound();
        return p;
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
