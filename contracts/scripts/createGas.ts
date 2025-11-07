import { ethers } from 'hardhat';

async function main() {
  const [player1, player2] = await ethers.getSigners();
  const address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const contract = await ethers.getContractAt('GameEscrow', address);
  const tx = await contract.connect(player1).createMatch(player2.address, { value: ethers.parseEther('0.02') });
  const receipt = await tx.wait();
  console.log('gasUsed', receipt.gasUsed.toString());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
