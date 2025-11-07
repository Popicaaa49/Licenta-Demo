import { ethers } from 'hardhat';

async function main() {
  const address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const contract = await ethers.getContractAt('GameEscrow', address);
  const count = await contract.matchCount();
  console.log('matchCount', count.toString());
  for (let i = 0; i < Number(count); i++) {
    const matchData = await contract.matches(i);
    console.log('match', i, matchData);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
