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
  
  Declaring & deploying contract

  */
  // Declare & deploy nutrient

  // const lifeformDeclareResponse = await account0.declare({
  //   contract: lifeFormSierraCode,
  //   casm: lifeFormCasmCode,
  // });
  // console.log(`✅ Lifeform has been deploy with the address: ${lifeformDeclareResponse}`);

// Upgrading NFT class hash
   // Instantiate lifeform contract
   const lifeFormContract = new Contract(
    lifeFormSierraCode.abi,
    "0x03894539380cb1f5daf0fa16dba2fd8d6341a506f2356f4999bcf545ac6eae46",
    provider
  );
  lifeFormContract.connect(account0)
const testMintResponse2 = await lifeFormContract.upgrade("0x0372570c9b2507995be98584eb875c6eb2bc97699af990cba4be97293bc08b29");
  await provider.waitForTransaction(testMintResponse2.transaction_hash);
  console.log("✅ Successfully updated class hash:");
  console.log("Transaction hash:", testMintResponse2.transaction_hash);

}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });