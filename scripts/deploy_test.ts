import { Account, CallData, Contract, RpcProvider, stark, hash } from "starknet";
import * as dotenv from "dotenv";
import { getCompiledCode } from "./utils";
dotenv.config();

async function main() {
  const provider = new RpcProvider({
    nodeUrl: process.env.RPC_ENDPOINT,
  });

  // initialize existing predeployed account 0
  console.log("ACCOUNT_ADDRESS=", process.env.DEPLOYER_ADDRESS);
  console.log("ACCOUNT_PRIVATE_KEY=", process.env.DEPLOYER_PRIVATE_KEY);
  const privateKey0 = process.env.DEPLOYER_PRIVATE_KEY ?? "";
  const accountAddress0: string = process.env.DEPLOYER_ADDRESS ?? "";
  const account0 = new Account(provider, accountAddress0, privateKey0);
  console.log("Account connected.\n");

  /* 
  
  Loading files

  */
  // Load Sierra and casm codes
  let windSierraCode, windCasmCode;
  let lifeFormSierraCode, lifeFormCasmCode;
  let loopMinterSierraCode, loopMinterCasmCode;
  let pathMinterSierraCode, pathMinterCasmCode;

  try {
    ({ sierraCode: windSierraCode, casmCode: windCasmCode} = await getCompiledCode(
      "gol_starknet_Wind"
    ));
  } catch (error: any) {
    console.log("Failed to read gol_starknet_Wind files");
    process.exit(1);
  }
  try {
    ({ sierraCode: lifeFormSierraCode, casmCode: lifeFormCasmCode} = await getCompiledCode(
      "gol_starknet_GolLifeforms"
    ));
  } catch (error: any) {
    console.log("Failed to read gol_starknet_GolLifeforms files");
    process.exit(1);
  }
  try {
    ({ sierraCode: loopMinterSierraCode, casmCode: loopMinterCasmCode} = await getCompiledCode(
      "gol_starknet_GolLoopMinter"
    ));
  } catch (error: any) {
    console.log("Failed to read gol_starknet_GolLoopMinter files");
    process.exit(1);
  }
  try {
    ({ sierraCode: pathMinterSierraCode, casmCode: pathMinterCasmCode} = await getCompiledCode(
      "gol_starknet_GolPathMinter"
    ));
  } catch (error: any) {
    console.log("Failed to read gol_starknet_GolPathMinter files");
    process.exit(1);
  }

  /* 
  
  Instantiating objects to interact with contracts

  */

  // Instantiate wind contract
  const windContract = new Contract(
    windSierraCode.abi,
    "0x3cb8ea22a12a11a1f96c59e961997adee05f030e3cf8a9010c233b18639ee48",
    provider
  );
  windContract.connect(account0)
   // Instantiate lifeform contract
   const lifeFormContract = new Contract(
    lifeFormSierraCode.abi,
    "0x3d6ebc9b434f8839ed99b276d35312da91d89c0c58441d18556d1b65811bd30",
    provider
  );
  lifeFormContract.connect(account0)
   // Instantiate loop minter contract
   const loopMinterContract = new Contract(
    loopMinterSierraCode.abi,
    "0x4fa97978478be033a379a3aecbe23526c8b38b9c1b04f5a44e19f6db0d9c6d8",
    provider
  );
  loopMinterContract.connect(account0)
  // Instantiate loop minter contract
  const pathMinterContract = new Contract(
    pathMinterSierraCode.abi,
    "0xf588125a5d2c5a585a51bf47685e8fb42faffaffb309df10c7e4d6ce77ed5b",
    provider
  );
  pathMinterContract.connect(account0)

    /* 
  
    Test
  */
  // Test mint
  // console.log(account0)
  const allowanceResponse = await windContract.approve("0x3d6ebc9b434f8839ed99b276d35312da91d89c0c58441d18556d1b65811bd30", 10000000);
    await provider.waitForTransaction(allowanceResponse.transaction_hash);
    console.log("✅ Successfully alllowed on windContract:");
    console.log("Transaction hash:", allowanceResponse.transaction_hash);

  // Test mint
  // console.log(account0)
  const testMintResponse = await loopMinterContract.mint_loop("2115620184325601055735808",2,account0.address);
    await provider.waitForTransaction(testMintResponse.transaction_hash);
    console.log("✅ Successfully mint on loop minter:");
    console.log("Transaction hash:", testMintResponse.transaction_hash);

}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });