import { ethers } from 'ethers';
import GameEscrow from '../frontend/src/contracts/GameEscrow.json' assert { type: 'json' };

async function main() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const iface = new ethers.Interface(GameEscrow.abi);
  const data = iface.encodeFunctionData('createMatch', ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8']);
  console.log('data', data);
  try {
    const txHash = await provider.send('eth_sendTransaction', [{
      from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      to: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      value: '0x2386f26fc10000',
      gas: '0x30d40',
      data
    }]);
    console.log('txHash', txHash);
  } catch (err) {
    console.error('error', err);
  }
}

main().catch(console.error);
