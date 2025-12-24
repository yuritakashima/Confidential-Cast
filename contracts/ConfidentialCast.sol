// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialCast
/// @notice BTC prediction market with encrypted inputs and encrypted points.
contract ConfidentialCast is ZamaEthereumConfig {
    struct Prediction {
        euint64 price;
        euint8 direction;
        uint64 stake;
        uint256 submittedAt;
        bool claimed;
    }

    struct DailyPrice {
        uint64 price;
        uint256 timestamp;
    }

    address public owner;
    uint256 public lastPriceDay;

    mapping(uint256 => DailyPrice) private _dailyPrices;
    mapping(address => mapping(uint256 => Prediction)) private _predictions;
    mapping(address => euint64) private _points;
    mapping(address => ebool) private _lastResult;

    event PriceUpdated(uint256 indexed day, uint64 price, uint256 timestamp);
    event PredictionSubmitted(address indexed user, uint256 indexed day, uint64 stake, uint256 timestamp);
    event PredictionConfirmed(address indexed user, uint256 indexed day, uint64 stake);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    error OnlyOwner();
    error InvalidOwner();
    error PriceAlreadyUpdated();
    error InvalidPrice();
    error StakeRequired();
    error StakeTooLarge();
    error PredictionExists();
    error PredictionMissing();
    error PredictionAlreadyClaimed();
    error ConfirmationTooEarly();
    error PriceNotAvailable();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert OnlyOwner();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert InvalidOwner();
        }
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function getCurrentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function updateDailyPrice(uint64 price) external onlyOwner {
        if (price == 0) {
            revert InvalidPrice();
        }

        uint256 day = getCurrentDay();
        if (day <= lastPriceDay) {
            revert PriceAlreadyUpdated();
        }

        _dailyPrices[day] = DailyPrice({price: price, timestamp: block.timestamp});
        lastPriceDay = day;

        emit PriceUpdated(day, price, block.timestamp);
    }

    function submitPrediction(
        externalEuint64 predictedPriceInput,
        externalEuint8 directionInput,
        bytes calldata inputProof
    ) external payable {
        if (msg.value == 0) {
            revert StakeRequired();
        }
        if (msg.value > type(uint64).max) {
            revert StakeTooLarge();
        }

        uint256 day = getCurrentDay();
        Prediction storage prediction = _predictions[msg.sender][day];
        if (prediction.stake != 0) {
            revert PredictionExists();
        }

        euint64 predictedPrice = FHE.fromExternal(predictedPriceInput, inputProof);
        euint8 direction = FHE.fromExternal(directionInput, inputProof);

        prediction.price = predictedPrice;
        prediction.direction = direction;
        prediction.stake = uint64(msg.value);
        prediction.submittedAt = block.timestamp;
        prediction.claimed = false;

        FHE.allowThis(prediction.price);
        FHE.allow(prediction.price, msg.sender);
        FHE.allowThis(prediction.direction);
        FHE.allow(prediction.direction, msg.sender);

        emit PredictionSubmitted(msg.sender, day, uint64(msg.value), block.timestamp);
    }

    function confirmPrediction(uint256 day) external {
        Prediction storage prediction = _predictions[msg.sender][day];
        if (prediction.stake == 0) {
            revert PredictionMissing();
        }
        if (prediction.claimed) {
            revert PredictionAlreadyClaimed();
        }
        if (day >= getCurrentDay()) {
            revert ConfirmationTooEarly();
        }

        DailyPrice memory record = _dailyPrices[day];
        if (record.timestamp == 0) {
            revert PriceNotAvailable();
        }

        ebool didWin = _checkPrediction(prediction, record.price);
        euint64 awarded = _calculateReward(prediction.stake, didWin);

        _points[msg.sender] = FHE.add(_points[msg.sender], awarded);
        _lastResult[msg.sender] = didWin;
        prediction.claimed = true;

        FHE.allowThis(_points[msg.sender]);
        FHE.allow(_points[msg.sender], msg.sender);
        FHE.allowThis(_lastResult[msg.sender]);
        FHE.allow(_lastResult[msg.sender], msg.sender);

        emit PredictionConfirmed(msg.sender, day, prediction.stake);
    }

    function _checkPrediction(Prediction storage prediction, uint64 price) internal returns (ebool) {
        euint64 actualPrice = FHE.asEuint64(price);
        ebool isGreater = FHE.gt(actualPrice, prediction.price);
        ebool isLess = FHE.lt(actualPrice, prediction.price);
        ebool wantsGreater = FHE.eq(prediction.direction, FHE.asEuint8(1));
        ebool wantsLess = FHE.eq(prediction.direction, FHE.asEuint8(2));
        return FHE.or(FHE.and(wantsGreater, isGreater), FHE.and(wantsLess, isLess));
    }

    function _calculateReward(uint64 stake, ebool didWin) internal returns (euint64) {
        return FHE.select(didWin, FHE.asEuint64(stake), FHE.asEuint64(0));
    }

    function getDailyPrice(uint256 day) external view returns (uint64 price, uint256 timestamp) {
        DailyPrice memory record = _dailyPrices[day];
        return (record.price, record.timestamp);
    }

    function getLatestPrice() external view returns (uint256 day, uint64 price, uint256 timestamp) {
        DailyPrice memory record = _dailyPrices[lastPriceDay];
        return (lastPriceDay, record.price, record.timestamp);
    }

    function getPredictionMetadata(
        address user,
        uint256 day
    ) external view returns (uint64 stake, uint256 submittedAt, bool claimed) {
        Prediction storage prediction = _predictions[user][day];
        return (prediction.stake, prediction.submittedAt, prediction.claimed);
    }

    function getPredictionEncrypted(address user, uint256 day) external view returns (euint64 price, euint8 direction) {
        Prediction storage prediction = _predictions[user][day];
        return (prediction.price, prediction.direction);
    }

    function getPoints(address user) external view returns (euint64) {
        return _points[user];
    }

    function getLastResult(address user) external view returns (ebool) {
        return _lastResult[user];
    }
}
