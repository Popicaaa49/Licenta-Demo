import { InsuranceContractClient } from "../blockchain/insuranceContractClient";
import { OracleReportPayload } from "../types/payout";

export class PayoutExecutor {
  constructor(private readonly insuranceClient = new InsuranceContractClient()) {}

  async submit(policyId: number, reportPayload: OracleReportPayload) {
    return this.insuranceClient.submitWeatherReport(policyId, reportPayload);
  }

  async confirm(txHash: string) {
    return this.insuranceClient.waitForTransaction(txHash);
  }
}
