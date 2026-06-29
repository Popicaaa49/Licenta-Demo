// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Parametric agricultural insurance contract for demo purposes
/// @notice The oracle submits normalized weather data, while the off-chain risk
/// engine computes the risk score. The contract only checks the stored trigger
/// conditions and performs the payout automatically.
contract InsuranceEscrow {
    enum PolicyState {
        Active,
        PaidOut,
        Expired,
        Cancelled
    }

    enum QuoteLockState {
        Uninitialized,
        Locked,
        Converted,
        Released
    }

    enum PremiumLockState {
        Uninitialized,
        Locked,
        Converted,
        Released
    }

    enum QuoteTermsState {
        Uninitialized,
        Active,
        Converted,
        Cancelled
    }

    struct Policy {
        address user;
        address underwriter;
        string locationId;
        string cropType;
        uint32 thresholdScore;
        uint32 emergencyRain24h;
        uint256 premiumAmount;
        uint256 payoutAmount;
        uint64 startTime;
        uint64 endTime;
        uint64 lastOracleUpdateAt;
        uint32 lastRiskScore;
        bool payoutTriggered;
        PolicyState state;
    }

    struct WeatherReport {
        uint64 observedAt;
        uint32 rain1h;
        uint32 rain24h;
        uint32 rain72h;
        uint32 consecutiveHeavyRainHours;
        uint32 eventDurationHours;
        uint32 windSpeed;
        int32 temperature;
        uint32 humidity;
        string weatherCondition;
        uint32 riskScore;
    }

    struct CapitalAccount {
        uint256 deposited;
        uint256 locked;
    }

    struct QuoteLock {
        address underwriter;
        uint256 amount;
        QuoteLockState state;
    }

    struct PremiumLock {
        address farmer;
        uint256 amount;
        PremiumLockState state;
    }

    struct QuoteTerms {
        address farmer;
        string locationId;
        string cropType;
        uint32 thresholdScore;
        uint32 emergencyRain24h;
        uint256 premiumAmount;
        uint256 payoutAmount;
        uint64 startTime;
        uint64 endTime;
        uint64 expiresAt;
        QuoteTermsState state;
    }

    uint32 public constant DEFAULT_THRESHOLD_SCORE = 8;
    uint32 public constant DEFAULT_EMERGENCY_RAIN_24H = 80;

    uint256 public policyCount;
    uint256 public sharedPoolBalance;
    uint256 public sharedPoolLockedReserve;
    uint256 public lockedReserve;

    address public owner;
    address public oracle;

    mapping(uint256 => Policy) public policies;
    mapping(uint256 => WeatherReport) private latestReports;
    mapping(bytes32 => uint256[]) private policyIdsByLocation;
    mapping(address => CapitalAccount) private underwriterCapital;
    mapping(uint256 => QuoteLock) private quoteLocks;
    mapping(uint256 => PremiumLock) private premiumLocks;
    mapping(uint256 => QuoteTerms) private quoteTerms;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OracleUpdated(address indexed previousOracle, address indexed newOracle);
    event LiquidityAdded(address indexed sender, uint256 amount);
    event UnderwriterCapitalDeposited(
        address indexed underwriter,
        uint256 amount,
        uint256 totalDeposited
    );
    event UnderwriterCapitalWithdrawn(
        address indexed underwriter,
        uint256 amount,
        uint256 remainingDeposited
    );
    event QuoteCapitalLocked(
        uint256 indexed quoteId,
        address indexed underwriter,
        uint256 amount
    );
    event QuoteCapitalReleased(
        uint256 indexed quoteId,
        address indexed underwriter,
        uint256 amount
    );
    event QuotePremiumLocked(
        uint256 indexed quoteId,
        address indexed farmer,
        uint256 amount
    );
    event QuotePremiumReleased(
        uint256 indexed quoteId,
        address indexed farmer,
        uint256 amount
    );
    event QuoteRegistered(
        uint256 indexed quoteId,
        address indexed farmer,
        uint256 premiumAmount,
        uint256 payoutAmount,
        uint32 thresholdScore,
        uint32 emergencyRain24h,
        uint64 expiresAt
    );
    event QuoteCapitalConverted(
        uint256 indexed quoteId,
        uint256 indexed policyId,
        address indexed underwriter,
        uint256 amount
    );
    event QuotePremiumConverted(
        uint256 indexed quoteId,
        uint256 indexed policyId,
        address indexed farmer,
        uint256 amount
    );
    event QuoteTermsConverted(uint256 indexed quoteId, uint256 indexed policyId);
    event PolicyCreated(
        uint256 indexed policyId,
        address indexed user,
        address indexed underwriter,
        string locationId,
        string cropType,
        uint32 thresholdScore,
        uint32 emergencyRain24h,
        uint256 payoutAmount,
        uint64 startTime,
        uint64 endTime
    );
    event WeatherReportSubmitted(
        uint256 indexed policyId,
        uint64 observedAt,
        uint32 riskScore,
        uint32 rain24h,
        bool payoutTriggered
    );
    event PolicyPaidOut(
        uint256 indexed policyId,
        address indexed user,
        address indexed underwriter,
        uint256 payoutAmount,
        uint32 riskScore,
        uint32 rain24h
    );
    event PolicyExpired(uint256 indexed policyId);
    event PolicyCancelled(uint256 indexed policyId);

    error NotOwner();
    error NotOracle();
    error InvalidOwner();
    error InvalidOracle();
    error InvalidUser();
    error InvalidLocation();
    error InvalidCropType();
    error InvalidTimeRange();
    error InvalidPayoutAmount();
    error InvalidTriggerThreshold();
    error InsufficientUnlockedLiquidity();
    error InvalidCapitalAmount();
    error InvalidQuoteId();
    error QuoteTermsAlreadyRegistered();
    error QuoteTermsNotActive();
    error QuoteExpired();
    error QuoteFarmerMismatch();
    error QuotePremiumAmountMismatch();
    error QuoteCapitalAmountMismatch();
    error InsufficientUnderwriterCapital();
    error QuoteCapitalUnavailable();
    error QuoteLockNotFound();
    error QuoteLockNotActive();
    error QuoteLockAlreadyBound();
    error QuoteLockAlreadyConverted();
    error NotQuoteLockParticipant();
    error PremiumLockNotFound();
    error PremiumLockNotActive();
    error PremiumLockAlreadyBound();
    error PremiumLockAlreadyConverted();
    error NotPremiumLockParticipant();
    error PolicyNotFound();
    error PolicyNotActive();
    error ObservationOutsideCoverage();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    constructor(address initialOracle) payable {
        owner = msg.sender;
        oracle = initialOracle == address(0) ? msg.sender : initialOracle;

        if (msg.value > 0) {
            sharedPoolBalance += msg.value;
            emit LiquidityAdded(msg.sender, msg.value);
        }
    }

    receive() external payable {
        if (msg.sender == owner) {
            sharedPoolBalance += msg.value;
            emit LiquidityAdded(msg.sender, msg.value);
            return;
        }

        CapitalAccount storage account = underwriterCapital[msg.sender];
        account.deposited += msg.value;

        emit UnderwriterCapitalDeposited(msg.sender, msg.value, account.deposited);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();

        address previousOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert InvalidOracle();

        address previousOracle = oracle;
        oracle = newOracle;

        emit OracleUpdated(previousOracle, newOracle);
    }

    function fundPool() external payable onlyOwner {
        if (msg.value == 0) revert InvalidCapitalAmount();

        sharedPoolBalance += msg.value;
        emit LiquidityAdded(msg.sender, msg.value);
    }

    function fundUnderwriterCapital() external payable {
        if (msg.value == 0) revert InvalidCapitalAmount();

        CapitalAccount storage account = underwriterCapital[msg.sender];
        account.deposited += msg.value;

        emit UnderwriterCapitalDeposited(msg.sender, msg.value, account.deposited);
    }

    function withdrawUnderwriterCapital(uint256 amount) external {
        if (amount == 0) revert InvalidCapitalAmount();

        CapitalAccount storage account = underwriterCapital[msg.sender];
        if (_availableUnderwriterCapital(account) < amount) {
            revert InsufficientUnderwriterCapital();
        }

        account.deposited -= amount;
        _safeTransfer(msg.sender, amount);

        emit UnderwriterCapitalWithdrawn(msg.sender, amount, account.deposited);
    }

    function availableLiquidity() public view returns (uint256) {
        if (sharedPoolBalance <= sharedPoolLockedReserve) {
            return 0;
        }

        return sharedPoolBalance - sharedPoolLockedReserve;
    }

    function availableUnderwriterCapital(address underwriter) public view returns (uint256) {
        return _availableUnderwriterCapital(underwriterCapital[underwriter]);
    }

    function getUnderwriterCapitalAccount(
        address underwriter
    ) external view returns (uint256 deposited, uint256 locked, uint256 available) {
        CapitalAccount memory account = underwriterCapital[underwriter];
        deposited = account.deposited;
        locked = account.locked;
        available = _availableUnderwriterCapital(account);
    }

    function getQuoteLock(
        uint256 quoteId
    ) external view returns (address underwriter, uint256 amount, QuoteLockState state) {
        QuoteLock memory quoteLock = quoteLocks[quoteId];
        return (quoteLock.underwriter, quoteLock.amount, quoteLock.state);
    }

    function getPremiumLock(
        uint256 quoteId
    ) external view returns (address farmer, uint256 amount, PremiumLockState state) {
        PremiumLock memory premiumLock = premiumLocks[quoteId];
        return (premiumLock.farmer, premiumLock.amount, premiumLock.state);
    }

    function getQuoteTerms(uint256 quoteId) external view returns (QuoteTerms memory terms) {
        terms = quoteTerms[quoteId];
        if (terms.state == QuoteTermsState.Uninitialized) revert QuoteTermsNotActive();
    }

    function registerQuote(
        uint256 quoteId,
        address farmer,
        string memory locationId,
        string memory cropType,
        uint32 thresholdScore,
        uint32 emergencyRain24h,
        uint256 premiumAmount,
        uint256 payoutAmount,
        uint64 startTime,
        uint64 endTime,
        uint64 expiresAt
    ) external onlyOwner {
        if (quoteId == 0) revert InvalidQuoteId();
        if (quoteTerms[quoteId].state != QuoteTermsState.Uninitialized) {
            revert QuoteTermsAlreadyRegistered();
        }
        if (farmer == address(0)) revert InvalidUser();
        if (bytes(locationId).length == 0) revert InvalidLocation();
        if (bytes(cropType).length == 0) revert InvalidCropType();
        if (premiumAmount == 0 || payoutAmount == 0) revert InvalidCapitalAmount();
        if (thresholdScore == 0 || emergencyRain24h == 0) revert InvalidTriggerThreshold();
        if (endTime <= startTime) revert InvalidTimeRange();
        if (expiresAt <= block.timestamp) revert QuoteExpired();

        quoteTerms[quoteId] = QuoteTerms({
            farmer: farmer,
            locationId: locationId,
            cropType: cropType,
            thresholdScore: thresholdScore,
            emergencyRain24h: emergencyRain24h,
            premiumAmount: premiumAmount,
            payoutAmount: payoutAmount,
            startTime: startTime,
            endTime: endTime,
            expiresAt: expiresAt,
            state: QuoteTermsState.Active
        });

        emit QuoteRegistered(
            quoteId,
            farmer,
            premiumAmount,
            payoutAmount,
            thresholdScore,
            emergencyRain24h,
            expiresAt
        );
    }

    function lockCapitalForQuote(uint256 quoteId, uint256 amount) external {
        QuoteTerms storage terms = _getQuoteTermsForLockedSettlement(quoteId);
        if (amount != terms.payoutAmount) revert QuoteCapitalAmountMismatch();

        PremiumLock storage premiumLock = _getPremiumLockForMutation(quoteId);
        if (premiumLock.state != PremiumLockState.Locked) revert PremiumLockNotActive();
        if (premiumLock.amount != terms.premiumAmount) revert QuotePremiumAmountMismatch();

        QuoteLock storage existing = quoteLocks[quoteId];
        if (existing.state == QuoteLockState.Locked) revert QuoteLockAlreadyBound();
        if (existing.state == QuoteLockState.Converted) revert QuoteLockAlreadyConverted();

        CapitalAccount storage account = underwriterCapital[msg.sender];
        if (_availableUnderwriterCapital(account) < amount) {
            revert InsufficientUnderwriterCapital();
        }

        account.locked += amount;
        lockedReserve += amount;

        quoteLocks[quoteId] = QuoteLock({
            underwriter: msg.sender,
            amount: amount,
            state: QuoteLockState.Locked
        });

        emit QuoteCapitalLocked(quoteId, msg.sender, amount);
    }

    function lockPremiumForQuote(uint256 quoteId) external payable {
        QuoteTerms storage terms = _getActiveQuoteTerms(quoteId);
        if (msg.sender != terms.farmer) revert QuoteFarmerMismatch();
        if (msg.value != terms.premiumAmount) revert QuotePremiumAmountMismatch();

        PremiumLock storage existing = premiumLocks[quoteId];
        if (existing.state == PremiumLockState.Locked) revert PremiumLockAlreadyBound();
        if (existing.state == PremiumLockState.Converted) revert PremiumLockAlreadyConverted();

        premiumLocks[quoteId] = PremiumLock({
            farmer: msg.sender,
            amount: msg.value,
            state: PremiumLockState.Locked
        });

        emit QuotePremiumLocked(quoteId, msg.sender, msg.value);
    }

    function releaseQuoteCapital(uint256 quoteId) external {
        QuoteLock storage quoteLock = _getQuoteLockForMutation(quoteId);
        if (quoteLock.state != QuoteLockState.Locked) revert QuoteLockNotActive();
        if (msg.sender != owner && msg.sender != quoteLock.underwriter) {
            revert NotQuoteLockParticipant();
        }

        _releaseQuoteLock(quoteLock);

        emit QuoteCapitalReleased(quoteId, quoteLock.underwriter, quoteLock.amount);
    }

    function releasePremiumForQuote(uint256 quoteId) external {
        PremiumLock storage premiumLock = _getPremiumLockForMutation(quoteId);
        if (premiumLock.state != PremiumLockState.Locked) revert PremiumLockNotActive();
        if (msg.sender != owner && msg.sender != premiumLock.farmer) {
            revert NotPremiumLockParticipant();
        }

        uint256 amount = premiumLock.amount;
        address farmer = premiumLock.farmer;

        premiumLock.state = PremiumLockState.Released;
        premiumLock.amount = 0;

        _safeTransfer(farmer, amount);

        emit QuotePremiumReleased(quoteId, farmer, amount);
    }

    function createPolicy(
        address user,
        string calldata locationId,
        string calldata cropType,
        uint32 thresholdScore,
        uint32 emergencyRain24h,
        uint256 payoutAmount,
        uint64 startTime,
        uint64 endTime
    ) external onlyOwner returns (uint256 policyId) {
        if (availableLiquidity() < payoutAmount) {
            revert InsufficientUnlockedLiquidity();
        }

        policyId = _createPolicyRecord(
            user,
            address(0),
            locationId,
            cropType,
            thresholdScore,
            emergencyRain24h,
            0,
            payoutAmount,
            startTime,
            endTime
        );

        sharedPoolLockedReserve += payoutAmount;
        lockedReserve += payoutAmount;
    }

    function createPolicyFromQuote(uint256 quoteId) external onlyOwner returns (uint256 policyId) {
        QuoteTerms storage terms = _getQuoteTermsForLockedSettlement(quoteId);
        QuoteLock storage quoteLock = _getQuoteLockForMutation(quoteId);
        if (quoteLock.state != QuoteLockState.Locked) revert QuoteLockNotActive();
        if (quoteLock.amount != terms.payoutAmount) revert QuoteCapitalAmountMismatch();

        PremiumLock storage premiumLock = _getPremiumLockForMutation(quoteId);
        if (premiumLock.state != PremiumLockState.Locked) revert PremiumLockNotActive();
        if (premiumLock.amount != terms.premiumAmount) revert QuotePremiumAmountMismatch();

        policyId = _createPolicyRecord(
            terms.farmer,
            quoteLock.underwriter,
            terms.locationId,
            terms.cropType,
            terms.thresholdScore,
            terms.emergencyRain24h,
            premiumLock.amount,
            quoteLock.amount,
            terms.startTime,
            terms.endTime
        );

        quoteLock.state = QuoteLockState.Converted;
        premiumLock.state = PremiumLockState.Converted;
        terms.state = QuoteTermsState.Converted;

        emit QuoteCapitalConverted(
            quoteId,
            policyId,
            quoteLock.underwriter,
            quoteLock.amount
        );
        emit QuotePremiumConverted(
            quoteId,
            policyId,
            premiumLock.farmer,
            premiumLock.amount
        );
        emit QuoteTermsConverted(quoteId, policyId);
    }

    function cancelPolicy(uint256 policyId) external onlyOwner {
        Policy storage policy = _getPolicyForMutation(policyId);
        if (policy.state != PolicyState.Active) revert PolicyNotActive();

        policy.state = PolicyState.Cancelled;
        _releasePolicyReserve(policy);
        _refundPolicyPremium(policy);

        emit PolicyCancelled(policyId);
    }

    function submitWeatherReport(
        uint256 policyId,
        WeatherReport calldata report
    ) external onlyOracle returns (bool payoutTriggered) {
        Policy storage policy = _getPolicyForMutation(policyId);
        if (policy.state != PolicyState.Active) revert PolicyNotActive();

        if (report.observedAt < policy.startTime || report.observedAt > policy.endTime) {
            revert ObservationOutsideCoverage();
        }

        latestReports[policyId] = report;
        policy.lastOracleUpdateAt = report.observedAt;
        policy.lastRiskScore = report.riskScore;

        payoutTriggered = report.riskScore >= policy.thresholdScore ||
            report.rain24h > policy.emergencyRain24h;

        emit WeatherReportSubmitted(
            policyId,
            report.observedAt,
            report.riskScore,
            report.rain24h,
            payoutTriggered
        );

        if (payoutTriggered) {
            policy.payoutTriggered = true;
            policy.state = PolicyState.PaidOut;
            _releasePolicyReserve(policy);
            _consumePolicyCapital(policy);
            _settlePolicyPremium(policy);

            _safeTransfer(policy.user, policy.payoutAmount);

            emit PolicyPaidOut(
                policyId,
                policy.user,
                policy.underwriter,
                policy.payoutAmount,
                report.riskScore,
                report.rain24h
            );
        }
    }

    function expirePolicy(uint256 policyId) external {
        Policy storage policy = _getPolicyForMutation(policyId);
        if (policy.state != PolicyState.Active) revert PolicyNotActive();
        if (block.timestamp <= policy.endTime) revert ObservationOutsideCoverage();

        policy.state = PolicyState.Expired;
        _releasePolicyReserve(policy);
        _settlePolicyPremium(policy);

        emit PolicyExpired(policyId);
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        Policy memory policy = policies[policyId];
        if (policy.user == address(0)) revert PolicyNotFound();
        return policy;
    }

    function getPolicies() external view returns (Policy[] memory allPolicies) {
        allPolicies = new Policy[](policyCount);

        for (uint256 i = 0; i < policyCount; i++) {
            allPolicies[i] = policies[i];
        }
    }

    function getLatestReport(uint256 policyId) external view returns (WeatherReport memory) {
        Policy memory policy = policies[policyId];
        if (policy.user == address(0)) revert PolicyNotFound();
        return latestReports[policyId];
    }

    function getPoliciesByLocation(
        string calldata locationId
    ) external view returns (uint256[] memory) {
        return policyIdsByLocation[_locationKey(locationId)];
    }

    function _createPolicyRecord(
        address user,
        address underwriter,
        string memory locationId,
        string memory cropType,
        uint32 thresholdScore,
        uint32 emergencyRain24h,
        uint256 premiumAmount,
        uint256 payoutAmount,
        uint64 startTime,
        uint64 endTime
    ) private returns (uint256 policyId) {
        if (user == address(0)) revert InvalidUser();
        if (bytes(locationId).length == 0) revert InvalidLocation();
        if (bytes(cropType).length == 0) revert InvalidCropType();
        if (payoutAmount == 0) revert InvalidPayoutAmount();
        if (endTime <= startTime) revert InvalidTimeRange();

        uint32 effectiveThreshold = thresholdScore == 0
            ? DEFAULT_THRESHOLD_SCORE
            : thresholdScore;
        uint32 effectiveEmergencyRain = emergencyRain24h == 0
            ? DEFAULT_EMERGENCY_RAIN_24H
            : emergencyRain24h;

        if (effectiveThreshold == 0 || effectiveEmergencyRain == 0) {
            revert InvalidTriggerThreshold();
        }

        policyId = policyCount;

        policies[policyId] = Policy({
            user: user,
            underwriter: underwriter,
            locationId: locationId,
            cropType: cropType,
            thresholdScore: effectiveThreshold,
            emergencyRain24h: effectiveEmergencyRain,
            premiumAmount: premiumAmount,
            payoutAmount: payoutAmount,
            startTime: startTime,
            endTime: endTime,
            lastOracleUpdateAt: 0,
            lastRiskScore: 0,
            payoutTriggered: false,
            state: PolicyState.Active
        });

        policyIdsByLocation[_locationKey(locationId)].push(policyId);
        policyCount++;

        emit PolicyCreated(
            policyId,
            user,
            underwriter,
            locationId,
            cropType,
            effectiveThreshold,
            effectiveEmergencyRain,
            payoutAmount,
            startTime,
            endTime
        );
    }

    function _getActiveQuoteTerms(
        uint256 quoteId
    ) private view returns (QuoteTerms storage terms) {
        if (quoteId == 0) revert InvalidQuoteId();

        terms = quoteTerms[quoteId];
        if (terms.state != QuoteTermsState.Active) revert QuoteTermsNotActive();
        if (block.timestamp > terms.expiresAt) revert QuoteExpired();
    }

    function _getQuoteTermsForLockedSettlement(
        uint256 quoteId
    ) private view returns (QuoteTerms storage terms) {
        if (quoteId == 0) revert InvalidQuoteId();

        terms = quoteTerms[quoteId];
        if (terms.state != QuoteTermsState.Active) revert QuoteTermsNotActive();
    }

    function _releasePolicyReserve(Policy storage policy) private {
        lockedReserve -= policy.payoutAmount;

        if (policy.underwriter == address(0)) {
            sharedPoolLockedReserve -= policy.payoutAmount;
            return;
        }

        underwriterCapital[policy.underwriter].locked -= policy.payoutAmount;
    }

    function _consumePolicyCapital(Policy storage policy) private {
        if (policy.underwriter == address(0)) {
            sharedPoolBalance -= policy.payoutAmount;
            return;
        }

        underwriterCapital[policy.underwriter].deposited -= policy.payoutAmount;
    }

    function _refundPolicyPremium(Policy storage policy) private {
        if (policy.premiumAmount == 0) {
            return;
        }

        uint256 premiumAmount = policy.premiumAmount;
        policy.premiumAmount = 0;

        _safeTransfer(policy.user, premiumAmount);
    }

    function _settlePolicyPremium(Policy storage policy) private {
        if (policy.premiumAmount == 0) {
            return;
        }

        uint256 premiumAmount = policy.premiumAmount;
        address recipient = policy.underwriter == address(0) ? owner : policy.underwriter;
        policy.premiumAmount = 0;

        _safeTransfer(recipient, premiumAmount);
    }

    function _releaseQuoteLock(QuoteLock storage quoteLock) private {
        underwriterCapital[quoteLock.underwriter].locked -= quoteLock.amount;
        lockedReserve -= quoteLock.amount;
        quoteLock.state = QuoteLockState.Released;
    }

    function _getPolicyForMutation(uint256 policyId) private view returns (Policy storage policy) {
        policy = policies[policyId];
        if (policy.user == address(0)) revert PolicyNotFound();
    }

    function _getQuoteLockForMutation(
        uint256 quoteId
    ) private view returns (QuoteLock storage quoteLock) {
        if (quoteId == 0) revert InvalidQuoteId();

        quoteLock = quoteLocks[quoteId];
        if (quoteLock.underwriter == address(0)) revert QuoteLockNotFound();
    }

    function _getPremiumLockForMutation(
        uint256 quoteId
    ) private view returns (PremiumLock storage premiumLock) {
        if (quoteId == 0) revert InvalidQuoteId();

        premiumLock = premiumLocks[quoteId];
        if (premiumLock.farmer == address(0)) revert PremiumLockNotFound();
    }

    function _locationKey(string memory locationId) private pure returns (bytes32) {
        return keccak256(bytes(locationId));
    }

    function _availableUnderwriterCapital(
        CapitalAccount memory account
    ) private pure returns (uint256) {
        if (account.deposited <= account.locked) {
            return 0;
        }

        return account.deposited - account.locked;
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
