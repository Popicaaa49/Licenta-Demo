import React from "react";
import WalletConnect from "./components/WalletConnect";
import GameInterface from "./components/GameInterface";
import MatchesList from "./components/MatchesList";

function App() {
  return (
    <div style={{ textAlign: "center", marginTop: 50 }}>
      <h1>🎮 Game Escrow DApp</h1>
      <WalletConnect />
      <GameInterface />

      <hr style={{ margin: "40px 0" }} />

      {/* 👇 Afișează lista meciurilor */}
      <h2>Active Matches</h2>
      <MatchesList />
    </div>
  );
}

export default App;
