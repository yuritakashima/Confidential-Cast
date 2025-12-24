import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-left">
            <p className="header-eyebrow">Confidential Cast</p>
            <h1 className="header-title">Encrypted BTC Predictions</h1>
            <p className="header-subtitle">
              Lock ETH, forecast privately, and confirm next day for encrypted rewards.
            </p>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
