import React, { useState } from "react";

const WalletConnect: React.FC = () => {
  const [account, setAccount] = useState("");

  const connectWallet = async () => {
  const { ethereum } = window;
  if (!ethereum) {
    alert("Please install MetaMask!");
    return;
  }

  const accounts = await ethereum.request!({ method: "eth_requestAccounts" });
  setAccount(accounts[0]);
};


  return (
    <div style={{ marginBottom: 20 }}>
      {account ? (
        <p>Connected: {account}</p>
      ) : (
        <button onClick={connectWallet}>🔗 Connect MetaMask</button>
      )}
    </div>
  );
};

export default WalletConnect;
