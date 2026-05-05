import { ContractService } from "../services/contractService";

const demoPolicies = [
  {
    userAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    locationLabel: "Timis Demo Farm",
    latitude: 45.7489,
    longitude: 21.2087,
    cropType: "wheat",
    thresholdScore: 8,
    emergencyRain24h: 80,
    payoutAmountEth: "1.25",
    startTime: "2026-07-01T00:00:00Z",
    endTime: "2026-07-31T23:59:59Z",
  },
  {
    userAddress: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    locationLabel: "Bihor Demo Farm",
    latitude: 47.0465,
    longitude: 21.9189,
    cropType: "corn",
    thresholdScore: 8,
    emergencyRain24h: 80,
    payoutAmountEth: "1.75",
    startTime: "2026-07-01T00:00:00Z",
    endTime: "2026-07-31T23:59:59Z",
  },
];

const main = async () => {
  const contractService = new ContractService();

  for (const policy of demoPolicies) {
    const result = await contractService.createContract(policy);
    console.log(
      `Seeded policy ${result.contractId} for ${result.locationId} with tx ${result.transactionHash}`
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
