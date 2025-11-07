import { ethers } from 'hardhat';

async function main() {
  const [player1] = await ethers.getSigners();
  const address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const contract = await ethers.getContractAt('GameEscrow', address);
  try {
    await contract.connect(player1).createMatch(player1.address, { value: ethers.parseEther('0.0002') });
  } catch (err: any) {
    console.error('expected revert', err.message);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
