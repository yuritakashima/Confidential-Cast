# Confidential Cast

Confidential Cast is a BTC prediction dapp that keeps forecasts private with Zama FHEVM and awards encrypted points
equal to each successful stake.

## Project Summary

Confidential Cast lets users submit a price target and direction (above or below) for BTC. Both inputs are encrypted on
the client using Zama FHE before they ever hit the chain. Users stake ETH to back their prediction. Each day at UTC 0,
the contract owner records the BTC price on-chain. On the following day, users confirm their prediction and, if correct,
receive encrypted points equal to their stake. Points are stored on-chain in encrypted form and can be decrypted by the
user via the Zama relayer.

The system is intentionally simple: one asset (BTC), one daily settlement time, and a strict confirm-then-reward flow.
That simplicity makes the privacy and fairness properties easy to audit.

## Problems It Solves

- Forecast privacy: raw prediction values never appear on-chain.
- Direction privacy: "above" or "below" is hidden, preventing reverse inference.
- Front-running protection: encrypted inputs remove the advantage of observing pending transactions.
- Transparent settlement: daily price records are stored on-chain and can be verified by anyone.
- Simple user accountability: predictions are tied to day index and wallet address, and confirmation is explicit.

## Advantages

- End-to-end encryption using Zama FHEVM, including rewards and outcome.
- Clear daily cadence that is easy to track and reason about.
- Minimal data leakage: observers cannot see targets or directions.
- Auditable history of daily prices for external verification.
- No centralized points ledger off-chain; points live in the contract.

## Core Features

- Encrypted BTC price predictions (euint64).
- Encrypted direction (1 = above, 2 = below) as euint8.
- ETH stake attached to each prediction.
- Owner-gated daily price update at UTC day boundaries.
- Encrypted points ledger per user, updated on confirmation.
- Encrypted last result for each user (win or loss).
- Frontend decrypt flows using the Zama relayer SDK.

## Architecture Overview

### Smart Contract (`contracts/ConfidentialCast.sol`)

- Stores daily BTC price records with timestamps.
- Stores encrypted predictions per user per day.
- Calculates win or loss using encrypted comparisons.
- Updates encrypted points without revealing values.
- Emits events for transparency without exposing private inputs.

### Hardhat Tasks (`tasks/ConfidentialCast.ts`)

- Update daily price.
- Submit encrypted predictions.
- Confirm predictions.
- Decrypt points and last result (CLI).

### Frontend (`app/`)

- React + Vite interface with RainbowKit wallet UX.
- Read calls use `viem`, write calls use `ethers`.
- Client-side encryption and decryption via Zama relayer SDK.
- No environment variables; contract details are in TypeScript.

## Tech Stack

- Solidity 0.8.27
- Hardhat + hardhat-deploy
- Zama FHEVM Solidity library
- Zama relayer SDK (frontend encryption and decryption)
- React + Vite + TypeScript
- viem (read)
- ethers v6 (write)
- RainbowKit + wagmi (wallets)

## Data Flow (End to End)

1. User enters predicted price, direction, and ETH stake.
2. The frontend encrypts price and direction with Zama FHE.
3. Encrypted inputs are sent to `submitPrediction` with ETH stake.
4. Each day at UTC 0, the owner calls `updateDailyPrice`.
5. The next day, the user calls `confirmPrediction`.
6. The contract computes win/loss using encrypted comparisons.
7. Encrypted points are updated, and the encrypted result is stored.
8. The user decrypts points and result through the relayer.

## Contract Notes

- `getCurrentDay` is `block.timestamp / 1 days` (UTC day index).
- Predictions are keyed by `(user, day)`.
- The contract holds ETH stakes; points are an internal encrypted score.
- There is no on-chain redemption or withdrawal of points yet.
- Price updates are owner-only and must be performed once per day.

## Frontend Notes

- The frontend is configured for Sepolia and uses the Zama Sepolia relayer.
- Do not use environment variables in the frontend.
- Update `app/src/config/contracts.ts` with the deployed address and ABI.
- ABI must be copied from `deployments/sepolia/ConfidentialCast.json`.

## Setup and Usage

### Prerequisites

- Node.js 20+
- npm
- A funded Sepolia account for deployment and testing
- WalletConnect project ID for RainbowKit

### Install

```bash
npm install
```

### Environment Configuration (Root)

Create a `.env` file in the repo root:

```bash
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=0xyour_private_key
ETHERSCAN_API_KEY=optional_etherscan_key
```

Notes:
- `PRIVATE_KEY` is required for Sepolia deployment.
- Do not use a mnemonic.

### Compile and Test

```bash
npm run compile
npm run test
```

### Deploy to Sepolia

```bash
npx hardhat deploy --network sepolia
```

After deployment:

1. Copy the contract address into `app/src/config/contracts.ts`.
2. Copy the ABI from `deployments/sepolia/ConfidentialCast.json` into
   `app/src/config/contracts.ts` as `CONTRACT_ABI`.
3. Update the WalletConnect project ID in `app/src/config/wagmi.ts`.

### Run Hardhat Tasks

```bash
# Update daily price (owner only)
npx hardhat task:update-price --network sepolia --price 64000

# Submit encrypted prediction
npx hardhat task:submit-prediction --network sepolia --price 63000 --direction 1 --stake 0.02

# Confirm a prediction for a past UTC day index
npx hardhat task:confirm --network sepolia --day 19700

# Decrypt points and last result
npx hardhat task:decrypt-points --network sepolia
npx hardhat task:decrypt-result --network sepolia
```

### Run the Frontend

```bash
cd app
npm install
npm run dev
```

## Security and Privacy Considerations

- Predictions and outcomes are encrypted with Zama FHE.
- Decryption is performed client-side with the user's keypair.
- Observers can verify daily price updates without seeing forecasts.
- The owner role must be protected because it controls price updates.
- ETH stakes remain in the contract; there is no withdrawal path yet.

## Limitations

- Price updates are manual; no oracle integration yet.
- Points are internal and not transferable.
- Only BTC is supported.
- No claim window enforcement beyond "next day or later".

## Future Roadmap

- On-chain oracle integration for BTC price updates.
- Automated daily updates via a keeper.
- Multi-asset support and configurable assets per market.
- On-chain redemption or conversion of points.
- Advanced prediction ranges and confidence bands.
- Public analytics dashboard without revealing private data.

## License

BSD-3-Clause-Clear. See `LICENSE`.
