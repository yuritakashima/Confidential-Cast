import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import type { Address } from 'viem';
import { Contract, ethers } from 'ethers';
import { Header } from './Header';
import { publicClient } from '../config/viem';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/PredictionApp.css';

const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

const toAddress = (address: string) => address as Address;

const formatTimestamp = (timestamp: bigint | null) => {
  if (!timestamp || timestamp === 0n) {
    return 'Not updated yet';
  }
  return new Date(Number(timestamp) * 1000).toLocaleString();
};

const formatBigInt = (value: bigint | null) => (value === null ? '--' : value.toString());

const parseDecryptedValue = (value: unknown) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

export function PredictionApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [currentDay, setCurrentDay] = useState<bigint | null>(null);
  const [latestDay, setLatestDay] = useState<bigint | null>(null);
  const [latestPrice, setLatestPrice] = useState<bigint | null>(null);
  const [latestTimestamp, setLatestTimestamp] = useState<bigint | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [predictionPrice, setPredictionPrice] = useState('');
  const [predictionDirection, setPredictionDirection] = useState<'1' | '2'>('1');
  const [predictionStake, setPredictionStake] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'confirmed'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [targetDay, setTargetDay] = useState('');
  const [predictionMeta, setPredictionMeta] = useState<{
    stake: bigint;
    submittedAt: bigint;
    claimed: boolean;
  } | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  const [decryptedPrediction, setDecryptedPrediction] = useState<{ price: string; direction: string } | null>(null);
  const [decryptedPoints, setDecryptedPoints] = useState<string | null>(null);
  const [decryptedResult, setDecryptedResult] = useState<string | null>(null);
  const [decryptState, setDecryptState] = useState<'idle' | 'working'>('idle');
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const isConfiguredAddress = true;

  const refreshMarket = async () => {
    setIsRefreshing(true);
    setMarketError(null);
    if (!isConfiguredAddress) {
      setMarketError('Contract address is not set yet.');
      setIsRefreshing(false);
      return;
    }
    try {
      const [currentDayValue, latest] = await Promise.all([
        publicClient.readContract({
          address: toAddress(CONTRACT_ADDRESS),
          abi: CONTRACT_ABI,
          functionName: 'getCurrentDay',
        }),
        publicClient.readContract({
          address: toAddress(CONTRACT_ADDRESS),
          abi: CONTRACT_ABI,
          functionName: 'getLatestPrice',
        }),
      ]);

      setCurrentDay(currentDayValue as bigint);
      const [latestDayValue, priceValue, timestampValue] = latest as readonly [bigint, bigint, bigint];
      setLatestDay(latestDayValue);
      setLatestPrice(priceValue);
      setLatestTimestamp(timestampValue);
    } catch (error) {
      console.error('Failed to refresh market data:', error);
      setMarketError('Unable to read market data from the chain.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const performUserDecrypt = async (handles: string[]) => {
    if (!instance || !address || !signerPromise) {
      throw new Error('Wallet and encryption service are required.');
    }

    const keypair = instance.generateKeypair();
    const handleContractPairs = handles.map((handle) => ({
      handle,
      contractAddress: CONTRACT_ADDRESS,
    }));

    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const contractAddresses = [CONTRACT_ADDRESS];
    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Signer not available.');
    }

    const signature = await signer.signTypedData(
      eip712.domain,
      {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
      },
      eip712.message,
    );

    return instance.userDecrypt(
      handleContractPairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contractAddresses,
      address,
      startTimeStamp,
      durationDays,
    );
  };

  const handleSubmitPrediction = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitState('idle');

    if (!isConfiguredAddress) {
      setSubmitError('Set the contract address before submitting.');
      return;
    }

    if (!address || !instance || !signerPromise) {
      setSubmitError('Connect your wallet and wait for the encryption service.');
      return;
    }

    const parsedPrice = Number(predictionPrice);
    if (!Number.isInteger(parsedPrice) || parsedPrice <= 0) {
      setSubmitError('Enter a valid integer price.');
      return;
    }

    if (!predictionStake) {
      setSubmitError('Enter a stake amount in ETH.');
      return;
    }

    let stakeValue: bigint;
    try {
      stakeValue = ethers.parseEther(predictionStake);
    } catch (error) {
      setSubmitError('Invalid stake amount.');
      return;
    }

    if (stakeValue <= 0n) {
      setSubmitError('Stake must be greater than zero.');
      return;
    }

    setSubmitState('submitting');

    try {
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add64(BigInt(parsedPrice));
      input.add8(BigInt(Number(predictionDirection)));
      const encryptedInput = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available.');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.submitPrediction(
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.inputProof,
        { value: stakeValue },
      );
      await tx.wait();

      setSubmitState('confirmed');
      setPredictionPrice('');
      setPredictionStake('');
      setDecryptedPrediction(null);
      setPredictionMeta(null);
      await refreshMarket();
    } catch (error) {
      console.error('Prediction submission failed:', error);
      setSubmitError('Transaction failed. Please try again.');
      setSubmitState('idle');
    }
  };

  const handleLoadPrediction = async () => {
    setMetaError(null);
    setPredictionMeta(null);
    setDecryptedPrediction(null);

    if (!isConfiguredAddress) {
      setMetaError('Set the contract address before loading predictions.');
      return;
    }

    if (!address) {
      setMetaError('Connect your wallet to load a prediction.');
      return;
    }

    if (!targetDay) {
      setMetaError('Enter a UTC day index.');
      return;
    }
    const dayValue = Number(targetDay);
    if (!Number.isInteger(dayValue) || dayValue < 0) {
      setMetaError('Enter a valid UTC day index.');
      return;
    }

    setMetaLoading(true);
    try {
      const metadata = await publicClient.readContract({
        address: toAddress(CONTRACT_ADDRESS),
        abi: CONTRACT_ABI,
        functionName: 'getPredictionMetadata',
        args: [address, BigInt(dayValue)],
      });

      const [stake, submittedAt, claimed] = metadata as readonly [bigint, bigint, boolean];
      setPredictionMeta({ stake, submittedAt, claimed });
    } catch (error) {
      console.error('Failed to load prediction:', error);
      setMetaError('Unable to load prediction metadata.');
    } finally {
      setMetaLoading(false);
    }
  };

  const handleConfirmPrediction = async () => {
    setMetaError(null);
    if (!isConfiguredAddress) {
      setMetaError('Set the contract address before confirming.');
      return;
    }
    if (!address || !signerPromise) {
      setMetaError('Connect your wallet to confirm.');
      return;
    }

    if (!targetDay) {
      setMetaError('Enter a UTC day index.');
      return;
    }
    const dayValue = Number(targetDay);
    if (!Number.isInteger(dayValue) || dayValue < 0) {
      setMetaError('Enter a valid UTC day index.');
      return;
    }

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available.');
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.confirmPrediction(BigInt(dayValue));
      await tx.wait();
      await handleLoadPrediction();
    } catch (error) {
      console.error('Confirmation failed:', error);
      setMetaError('Confirmation failed. Check the day and try again.');
    }
  };

  const handleDecryptPrediction = async () => {
    setDecryptError(null);
    setDecryptState('working');
    try {
      if (!isConfiguredAddress) {
        throw new Error('Contract address is not set.');
      }
      if (!address) {
        throw new Error('Connect your wallet to decrypt.');
      }

      if (!targetDay) {
        throw new Error('Enter a UTC day index.');
      }
      const dayValue = Number(targetDay);
      if (!Number.isInteger(dayValue) || dayValue < 0) {
        throw new Error('Enter a valid UTC day index.');
      }

      const encrypted = await publicClient.readContract({
        address: toAddress(CONTRACT_ADDRESS),
        abi: CONTRACT_ABI,
        functionName: 'getPredictionEncrypted',
        args: [address, BigInt(dayValue)],
      });

      const [priceHandle, directionHandle] = encrypted as readonly [string, string];
      if (priceHandle === ZERO_HANDLE || directionHandle === ZERO_HANDLE) {
        setDecryptedPrediction(null);
        setDecryptState('idle');
        return;
      }

      const result = await performUserDecrypt([priceHandle, directionHandle]);
      const decryptedPrice = parseDecryptedValue(result[priceHandle]);
      const decryptedDirection = parseDecryptedValue(result[directionHandle]);
      const directionLabel = decryptedDirection === '1' ? 'Above' : decryptedDirection === '2' ? 'Below' : 'Unknown';

      setDecryptedPrediction({
        price: decryptedPrice,
        direction: directionLabel,
      });
    } catch (error) {
      console.error('Prediction decryption failed:', error);
      setDecryptError('Unable to decrypt prediction.');
    } finally {
      setDecryptState('idle');
    }
  };

  const handleDecryptPoints = async () => {
    setDecryptError(null);
    setDecryptState('working');
    try {
      if (!isConfiguredAddress) {
        throw new Error('Contract address is not set.');
      }
      if (!address) {
        throw new Error('Connect your wallet to decrypt.');
      }

      const encrypted = await publicClient.readContract({
        address: toAddress(CONTRACT_ADDRESS),
        abi: CONTRACT_ABI,
        functionName: 'getPoints',
        args: [address],
      });

      if ((encrypted as string) === ZERO_HANDLE) {
        setDecryptedPoints('0');
        setDecryptState('idle');
        return;
      }

      const result = await performUserDecrypt([encrypted as string]);
      setDecryptedPoints(parseDecryptedValue(result[encrypted as string]));
    } catch (error) {
      console.error('Point decryption failed:', error);
      setDecryptError('Unable to decrypt points.');
    } finally {
      setDecryptState('idle');
    }
  };

  const handleDecryptResult = async () => {
    setDecryptError(null);
    setDecryptState('working');
    try {
      if (!isConfiguredAddress) {
        throw new Error('Contract address is not set.');
      }
      if (!address) {
        throw new Error('Connect your wallet to decrypt.');
      }

      const encrypted = await publicClient.readContract({
        address: toAddress(CONTRACT_ADDRESS),
        abi: CONTRACT_ABI,
        functionName: 'getLastResult',
        args: [address],
      });

      if ((encrypted as string) === ZERO_HANDLE) {
        setDecryptedResult('No result yet');
        setDecryptState('idle');
        return;
      }

      const result = await performUserDecrypt([encrypted as string]);
      const value = parseDecryptedValue(result[encrypted as string]);
      setDecryptedResult(value === 'true' ? 'Win' : value === 'false' ? 'Loss' : value);
    } catch (error) {
      console.error('Result decryption failed:', error);
      setDecryptError('Unable to decrypt result.');
    } finally {
      setDecryptState('idle');
    }
  };

  useEffect(() => {
    refreshMarket();
  }, []);

  useEffect(() => {
    if (currentDay !== null && targetDay === '') {
      const fallbackDay = currentDay > 0n ? currentDay - 1n : 0n;
      setTargetDay(fallbackDay.toString());
    }
  }, [currentDay, targetDay]);

  const pointsInEth = useMemo(() => {
    if (!decryptedPoints) {
      return null;
    }
    try {
      const pointsValue = BigInt(decryptedPoints);
      return ethers.formatEther(pointsValue);
    } catch (error) {
      return null;
    }
  }, [decryptedPoints]);

  return (
    <div className="prediction-app">
      <Header />
      <main className="prediction-main">
        <section className="market-grid">
          <div className="card market-card">
            <div className="card-header">
              <h2>BTC Daily Snapshot</h2>
              <button type="button" className="ghost-button" onClick={refreshMarket} disabled={isRefreshing}>
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <div className="metric-grid">
              <div>
                <p className="metric-label">Current UTC Day</p>
                <p className="metric-value">{formatBigInt(currentDay)}</p>
              </div>
              <div>
                <p className="metric-label">Last Updated Day</p>
                <p className="metric-value">{formatBigInt(latestDay)}</p>
              </div>
              <div>
                <p className="metric-label">Recorded BTC Price</p>
                <p className="metric-value">{latestPrice ? latestPrice.toString() : '--'}</p>
              </div>
              <div>
                <p className="metric-label">Update Time (UTC)</p>
                <p className="metric-value">{formatTimestamp(latestTimestamp)}</p>
              </div>
            </div>
            {marketError && <p className="status-error">{marketError}</p>}
          </div>
          <div className="card market-card accent-card">
            <h2>Your Encrypted Rewards</h2>
            <p className="card-subtitle">Points mirror your successful ETH stakes.</p>
            <div className="reward-row">
              <div>
                <p className="metric-label">Decrypted Points</p>
                <p className="metric-value">{decryptedPoints ?? '--'}</p>
                {pointsInEth && <p className="metric-subvalue">{pointsInEth} ETH</p>}
              </div>
              <div>
                <p className="metric-label">Last Result</p>
                <p className="metric-value">{decryptedResult ?? '--'}</p>
              </div>
            </div>
            <div className="button-row">
              <button type="button" className="primary-button" onClick={handleDecryptPoints} disabled={decryptState === 'working'}>
                {decryptState === 'working' ? 'Decrypting...' : 'Decrypt Points'}
              </button>
              <button type="button" className="secondary-button" onClick={handleDecryptResult} disabled={decryptState === 'working'}>
                Decrypt Result
              </button>
            </div>
            {decryptError && <p className="status-error">{decryptError}</p>}
          </div>
        </section>

        <section className="prediction-grid">
          <div className="card form-card">
            <h2>Submit a Prediction</h2>
            <p className="card-subtitle">Encrypt your forecast and lock ETH as a stake.</p>
            <form onSubmit={handleSubmitPrediction} className="form-stack">
              <label className="form-field">
                <span>Predicted BTC Price</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={predictionPrice}
                  onChange={(event) => setPredictionPrice(event.target.value)}
                  placeholder="e.g. 64000"
                  min="1"
                  required
                />
              </label>
              <label className="form-field">
                <span>Direction</span>
                <div className="chip-row">
                  <button
                    type="button"
                    className={`chip-button ${predictionDirection === '1' ? 'active' : ''}`}
                    onClick={() => setPredictionDirection('1')}
                  >
                    Above
                  </button>
                  <button
                    type="button"
                    className={`chip-button ${predictionDirection === '2' ? 'active' : ''}`}
                    onClick={() => setPredictionDirection('2')}
                  >
                    Below
                  </button>
                </div>
              </label>
              <label className="form-field">
                <span>Stake (ETH)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={predictionStake}
                  onChange={(event) => setPredictionStake(event.target.value)}
                  placeholder="0.05"
                  required
                />
              </label>
              {submitError && <p className="status-error">{submitError}</p>}
              {!isConfiguredAddress && (
                <p className="status-warning">Contract address is not set yet. Update it after deployment.</p>
              )}
              <button
                type="submit"
                className="primary-button"
                disabled={submitState === 'submitting' || zamaLoading || !isConfiguredAddress}
              >
                {zamaLoading ? 'Initializing Encryption...' : submitState === 'submitting' ? 'Submitting...' : 'Encrypt & Submit'}
              </button>
              {submitState === 'confirmed' && <p className="status-success">Prediction submitted successfully.</p>}
              {zamaError && <p className="status-error">{zamaError}</p>}
            </form>
          </div>

          <div className="card form-card">
            <h2>Confirm & Decrypt</h2>
            <p className="card-subtitle">Confirm on the following day to claim encrypted points.</p>
            <div className="form-stack">
              <label className="form-field">
                <span>Prediction Day (UTC)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={targetDay}
                  onChange={(event) => setTargetDay(event.target.value)}
                  placeholder="Enter day index"
                />
              </label>
              <div className="button-row">
                <button type="button" className="secondary-button" onClick={handleLoadPrediction} disabled={metaLoading}>
                  {metaLoading ? 'Loading...' : 'Load Prediction'}
                </button>
                <button type="button" className="primary-button" onClick={handleConfirmPrediction}>
                  Confirm Prediction
                </button>
              </div>
              {metaError && <p className="status-error">{metaError}</p>}
              {predictionMeta && (
                <div className="meta-panel">
                  <div>
                    <p className="metric-label">Stake</p>
                    <p className="metric-value">{ethers.formatEther(predictionMeta.stake)} ETH</p>
                  </div>
                  <div>
                    <p className="metric-label">Submitted At</p>
                    <p className="metric-value">{formatTimestamp(predictionMeta.submittedAt)}</p>
                  </div>
                  <div>
                    <p className="metric-label">Claimed</p>
                    <p className="metric-value">{predictionMeta.claimed ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              )}
              <div className="button-row">
                <button type="button" className="ghost-button" onClick={handleDecryptPrediction} disabled={decryptState === 'working'}>
                  {decryptState === 'working' ? 'Decrypting...' : 'Decrypt Prediction'}
                </button>
              </div>
              {decryptedPrediction && (
                <div className="meta-panel">
                  <div>
                    <p className="metric-label">Predicted Price</p>
                    <p className="metric-value">{decryptedPrediction.price}</p>
                  </div>
                  <div>
                    <p className="metric-label">Direction</p>
                    <p className="metric-value">{decryptedPrediction.direction}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card notice-card">
          <h2>How It Works</h2>
          <div className="notice-grid">
            <div>
              <h3>Encrypted Forecasts</h3>
              <p>Prediction price and direction are encrypted client-side with Zama FHE before submission.</p>
            </div>
            <div>
              <h3>Daily Settlement</h3>
              <p>BTC price is updated once per UTC day and stored on-chain for validation.</p>
            </div>
            <div>
              <h3>Private Rewards</h3>
              <p>Confirm the next day to receive encrypted points equal to your stake.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
