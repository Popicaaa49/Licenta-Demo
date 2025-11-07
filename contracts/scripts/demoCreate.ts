import { ethers } from 'hardhat';

async function main() {
  const [_, player2] = await ethers.getSigners();
  const address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const contract = await ethers.getContractAt('GameEscrow', address);
  const tx = await contract.connect(player2).createMatch({ value: ethers.parseEther('0.25') });
  await tx.wait();
  console.log('ok');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
