import React, { useEffect, useState } from "react";
import { getContract } from "../web3Config";

interface Match {
  id: number; // ✅ adăugat pentru TypeScript
  player1: string;
  player2: string;
  betAmount: string;
  winner: string;
  isActive: boolean;
}

const MatchesList: React.FC = () => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMatches = async () => {
    try {
      const { contract } = await getContract();
      const data = await contract.getMatches();
      const formatted = data.map((m: any, i: number) => ({
        id: i,
        player1: m.player1,
        player2: m.player2,
        betAmount: (Number(m.betAmount) / 1e18).toFixed(4), // ETH
        winner: m.winner,
        isActive: m.isActive,
      }));
      setMatches(formatted);
    } catch (err) {
      console.error("❌ Error fetching matches:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();

    const listenToEvents = async () => {
      const { contract } = await getContract();

      contract.on("MatchCreated", () => {
        console.log("🔄 MatchCreated event detected — refreshing list");
        fetchMatches();
      });

      contract.on("MatchJoined", () => {
        console.log("🔄 MatchJoined event detected — refreshing list");
        fetchMatches();
      });

      contract.on("MatchSettled", () => {
        console.log("🔄 MatchSettled event detected — refreshing list");
        fetchMatches();
      });
    };

    listenToEvents();

    return () => {
      getContract().then(({ contract }) => {
        contract.removeAllListeners();
      });
    };
  }, []);

  if (loading) return <p>Loading matches...</p>;

  return (
    <div style={{ marginTop: 30 }}>
      <h2>Active Matches</h2>

      {matches.length === 0 ? (
        <p>No matches created yet.</p>
      ) : (
        <table
          style={{
            margin: "0 auto",
            borderCollapse: "collapse",
            width: "80%",
            border: "1px solid #ccc",
          }}
        >
          <thead>
            <tr style={{ background: "#f4f4f4" }}>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>#</th>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>Player 1</th>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>Player 2</th>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>Bet (ETH)</th>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>Status</th>
              <th style={{ padding: "8px", border: "1px solid #ddd" }}>Winner</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => (
              <tr key={i}>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>{m.id}</td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                  {m.player1.slice(0, 8)}...
                </td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                  {m.player2.slice(0, 8)}...
                </td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>{m.betAmount}</td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                  {m.isActive ? "🟢 Active" : "🔴 Ended"}
                </td>
                <td style={{ padding: "8px", border: "1px solid #ddd" }}>
                  {m.winner === "0x0000000000000000000000000000000000000000"
                    ? "-"
                    : `${m.winner.slice(0, 8)}...`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MatchesList;
