import React from "react";
import InsuranceInterface from "./InsuranceInterface";
import InsuranceOverview from "./InsuranceOverview";
import InsurancePoliciesList from "./InsurancePoliciesList";

export type InsuranceTab = "overview" | "request" | "marketplace" | "policies";

interface InsuranceWorkspaceProps {
  walletConnected: boolean;
  account: string | null;
  activeTab: InsuranceTab;
  onTabChange: (tab: InsuranceTab) => void;
}

export const insuranceTabs: Array<{
  id: InsuranceTab;
  label: string;
  description: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    description: "Stare rapida a produsului si a fluxurilor active.",
  },
  {
    id: "request",
    label: "Request Coverage",
    description: "Cererea fermierului si parametrii politei.",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    description: "Capital, oferte si actiunile underwriter-ului.",
  },
  {
    id: "policies",
    label: "Policies",
    description: "Polite active, risc live si ultimul raport.",
  },
];

const InsuranceWorkspace: React.FC<InsuranceWorkspaceProps> = ({
  walletConnected,
  account,
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="insurance-workspace">
      {activeTab === "overview" ? (
        <InsuranceOverview
          walletConnected={walletConnected}
          account={account}
          onNavigate={onTabChange}
        />
      ) : null}

      {activeTab === "request" ? (
        <section className="panel">
          <InsuranceInterface
            walletConnected={walletConnected}
            account={account}
            mode="request"
          />
        </section>
      ) : null}

      {activeTab === "marketplace" ? (
        <section className="panel">
          <InsuranceInterface
            walletConnected={walletConnected}
            account={account}
            mode="marketplace"
          />
        </section>
      ) : null}

      {activeTab === "policies" ? (
        <section className="panel">
          <InsurancePoliciesList walletConnected={walletConnected} account={account} />
        </section>
      ) : null}
    </div>
  );
};

export default InsuranceWorkspace;
