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
  
  Declaring & deploying contract

  */
  // Declare & deploy wind
  const windCallData = new CallData(windSierraCode.abi);
  const windConstructor = windCallData.compile("constructor", {
    initial_supply: 100,
      creator: process.env.DEPLOYER_ADDRESS ?? "",
  });
  const windDeployResponse = await account0.declareAndDeploy({
    contract: windSierraCode,
    casm: windCasmCode,
    constructorCalldata: windConstructor,
    salt: stark.randomAddress(),
  });
  console.log(`✅ Wind has been deploy with the address: ${windDeployResponse.deploy.contract_address}`);

    // Declare & deploy lifeform
    const lifeformCallData = new CallData(lifeFormSierraCode.abi);
    const lifeformConstructor = lifeformCallData.compile("constructor", {
        creator: process.env.DEPLOYER_ADDRESS ?? "",
    });
    const lifeFormDeployResponse = await account0.declareAndDeploy({
      contract: lifeFormSierraCode,
      casm: lifeFormCasmCode,
      constructorCalldata: lifeformConstructor,
      salt: stark.randomAddress(),
    });
    console.log(`✅ Lifeform has been deploy with the address: ${lifeFormDeployResponse.deploy.contract_address}`);

    // Declare & deploy loop minter
    const loopMinterCallData = new CallData(loopMinterSierraCode.abi);
    const loopMinterConstructor = loopMinterCallData.compile("constructor", {
        _gol_lifeforms_nft: lifeFormDeployResponse.deploy.contract_address,
    });
    const loopMinterDeployResponse = await account0.declareAndDeploy({
      contract: loopMinterSierraCode,
      casm: loopMinterCasmCode,
      constructorCalldata: loopMinterConstructor,
      salt: stark.randomAddress(),
    });
    console.log(`✅ Loop minter has been deploy with the address: ${loopMinterDeployResponse.deploy.contract_address}`);

    // Declare & deploy path minter
    const pathMinterCallData = new CallData(pathMinterSierraCode.abi);
    const pathMinterConstructor = pathMinterCallData.compile("constructor", {
        _gol_lifeforms_nft: lifeFormDeployResponse.deploy.contract_address,
    });
    const pathMinterDeployResponse = await account0.declareAndDeploy({
      contract: pathMinterSierraCode,
      casm: pathMinterCasmCode,
      constructorCalldata: pathMinterConstructor,
      salt: stark.randomAddress(),
    });
    console.log(`✅ Path minter has been deploy with the address: ${pathMinterDeployResponse.deploy.contract_address}`);

  
  /* 
  
  Instantiating objects to interact with contracts

  */

  // Instantiate wind contract
  const windContract = new Contract(
    windSierraCode.abi,
    windDeployResponse.deploy.contract_address,
    provider
  );
  windContract.connect(account0)
   // Instantiate lifeform contract
   const lifeFormContract = new Contract(
    lifeFormSierraCode.abi,
    lifeFormDeployResponse.deploy.contract_address,
    provider
  );
  lifeFormContract.connect(account0)
   // Instantiate loop minter contract
   const loopMinterContract = new Contract(
    loopMinterSierraCode.abi,
    loopMinterDeployResponse.deploy.contract_address,
    provider
  );
  loopMinterContract.connect(account0)
  // Instantiate path minter contract
  const pathMinterContract = new Contract(
    pathMinterSierraCode.abi,
    pathMinterDeployResponse.deploy.contract_address,
    provider
  );
  pathMinterContract.connect(account0)
    /* 
  
  Setting up permissipons

  */


  // Create minter role id
 const MINTER_ROLE = hash.starknetKeccak("MINTER_ROLE");

  // Grant wind minter role to lifeform contract
  const grantRole1Response = await windContract.grant_role(MINTER_ROLE, lifeFormDeployResponse.deploy.contract_address);
    await provider.waitForTransaction(grantRole1Response.transaction_hash);
    console.log("✅ Successfully called grant role function on windContract:", lifeFormDeployResponse.deploy.contract_address);
    console.log("Transaction hash:", grantRole1Response.transaction_hash);

 // Grant lifeform minter role to loop minter contract
 const grantRole2Response = await lifeFormContract.grant_role(MINTER_ROLE,loopMinterDeployResponse.deploy.contract_address);
   await provider.waitForTransaction(grantRole2Response.transaction_hash);
   console.log("✅ Successfully called grant role function on lifeform:", loopMinterDeployResponse.deploy.contract_address);
   console.log("Transaction hash:", grantRole2Response.transaction_hash);   

    // Grant lifeform minter role to path minter contract
 const grantRole3Response = await lifeFormContract.grant_role(MINTER_ROLE, pathMinterDeployResponse.deploy.contract_address);
 await provider.waitForTransaction(grantRole3Response.transaction_hash);
 console.log("✅ Successfully called grant role function on lifeform:", pathMinterDeployResponse.deploy.contract_address);
 console.log("Transaction hash:", grantRole3Response.transaction_hash);   

    // Set wind contract address in lifeform contract
    // console.log("Available methods:", Object.keys(lifeFormContract.functions));
    const setWindContractResponse = await lifeFormContract.update_wind_contract_address(windDeployResponse.deploy.contract_address);
    await provider.waitForTransaction(setWindContractResponse.transaction_hash);
    console.log("✅ Successfully set wind contract in lifeform");
    console.log("Transaction hash:", setWindContractResponse.transaction_hash);   

      // Test mint
  // console.log(account0)
  const allowanceResponse = await windContract.approve(lifeFormDeployResponse.deploy.contract_address, "100000000000000000000000000");
  await provider.waitForTransaction(allowanceResponse.transaction_hash);
  console.log("✅ Successfully alllowed on windContract:");
  console.log("Transaction hash:", allowanceResponse.transaction_hash);

// Test mint
// console.log(account0)
const testMintResponse = await loopMinterContract.mint_loop("2115620184325601055735808",2,accountAddress0);
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