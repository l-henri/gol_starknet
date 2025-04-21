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
  let nutrientSierraCode, nutrientCasmCode;
  let lifeFormSierraCode, lifeFormCasmCode;
  let loopMinterSierraCode, loopMinterCasmCode;
  let pathMinterSierraCode, pathMinterCasmCode;

  try {
    ({ sierraCode: nutrientSierraCode, casmCode: nutrientCasmCode} = await getCompiledCode(
      "gol_starknet_Nutrient"
    ));
  } catch (error: any) {
    console.log("Failed to read gol_starknet_Nutrient files");
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

  // Instantiate nutrient contract
  const nutrientContract = new Contract(
    nutrientSierraCode.abi,
    "0x04f671f14138459cab9f575f368666acec732db7dfe8145d7673d6feb103e476",
    provider
  );
  nutrientContract.connect(account0)
  //  // Instantiate lifeform contract
  //  const lifeFormContract = new Contract(
  //   lifeFormSierraCode.abi,
  //   "0x3d6ebc9b434f8839ed99b276d35312da91d89c0c58441d18556d1b65811bd30",
  //   provider
  // );
  // lifeFormContract.connect(account0)
   // Instantiate loop minter contract
   const loopMinterContract = new Contract(
    loopMinterSierraCode.abi,
    "0x05ff956e9515e2022a25b3e8ae93eddcd8f5f3b632b91c57bc54f192b81168f4",
    provider
  );
  loopMinterContract.connect(account0)
  // Instantiate loop minter contract
  // const pathMinterContract = new Contract(
  //   pathMinterSierraCode.abi,
  //   "0xf588125a5d2c5a585a51bf47685e8fb42faffaffb309df10c7e4d6ce77ed5b",
  //   provider
  // );
  // pathMinterContract.connect(account0)

    /* 
  
    Test
  */
  // Test mint
  // console.log(account0)
  const allowanceResponse = await nutrientContract.approve("0x6109b381adb08f2a4a183e528616fb18716e40b7e6247c0d2167d8f04010b5a", 10000000);
    await provider.waitForTransaction(allowanceResponse.transaction_hash);
    console.log("✅ Successfully alllowed on nutrientContract:");
    console.log("Transaction hash:", allowanceResponse.transaction_hash);

  // Test mint
  // console.log(account0)
  const testMintResponse = await loopMinterContract.mint_loop("1073856514",60,account0.address);
    await provider.waitForTransaction(testMintResponse.transaction_hash);
    console.log("✅ Successfully mint on loop minter:");
    console.log("Transaction hash:", testMintResponse.transaction_hash);

    // const testMintResponse2 = await loopMinterContract.mint_loop("0",1,account0.address);
    // await provider.waitForTransaction(testMintResponse2.transaction_hash);
    // console.log("✅ Successfully mint on loop minter:");
    // console.log("Transaction hash:", testMintResponse2.transaction_hash);

}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });