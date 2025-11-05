import React, { useState } from "react";
import { getContract } from "../web3Config";
import { ethers } from "ethers";

const GameInterface: React.FC = () => {
  const [player2, setPlayer2] = useState("");
  const [betAmount, setBetAmount] = useState("0.01");
  const [status, setStatus] = useState("");

  const createMatch = async () => {
    try {
      const { contract } = await getContract();
      const tx = await contract.createMatch(player2, {
        value: ethers.parseEther(betAmount),
      });
      await tx.wait();
      setStatus("✅ Match created successfully!");
    } catch (err) {
      setStatus("❌ Error creating match: " + (err as Error).message);
    }
  };

  const joinMatch = async (id: number) => {
    try {
      const { contract } = await getContract();
      const tx = await contract.joinMatch(id, {
        value: ethers.parseEther(betAmount),
      });
      await tx.wait();
      setStatus("✅ Joined match successfully!");
    } catch (err) {
      setStatus("❌ Error joining match: " + (err as Error).message);
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h1>🎱 GameEscrow DApp</h1>

      <input
        type="text"
        placeholder="Opponent Address"
        value={player2}
        onChange={(e) => setPlayer2(e.target.value)}
      />
      <input
        type="text"
        placeholder="Bet amount in ETH"
        value={betAmount}
        onChange={(e) => setBetAmount(e.target.value)}
      />
      <button onClick={createMatch}>Create Match</button>
      <button onClick={() => joinMatch(0)}>Join Match #0</button>

      <p>{status}</p>
    </div>
  );
};

export default GameInterface;
