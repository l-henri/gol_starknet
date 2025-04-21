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
  const nutrientCallData = new CallData(nutrientSierraCode.abi);
  const nutrientConstructor = nutrientCallData.compile("constructor", {
    initial_supply: "1001000000000000000000",
      creator: process.env.DEPLOYER_ADDRESS ?? "",
  });
  const nutrientDeployResponse = await account0.declareAndDeploy({
    contract: nutrientSierraCode,
    casm: nutrientCasmCode,
    constructorCalldata: nutrientConstructor,
    salt: stark.randomAddress(),
  });
  console.log(`✅ nutrient has been deploy with the address: ${nutrientDeployResponse.deploy.contract_address}`);

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

  // Instantiate nutrient contract
  const nutrientContract = new Contract(
    nutrientSierraCode.abi,
    nutrientDeployResponse.deploy.contract_address,
    provider
  );
  nutrientContract.connect(account0)
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
  
  Setting up permissions

  */


  // Create minter role id
 const MINTER_ROLE = hash.starknetKeccak("MINTER_ROLE");

  // Grant nutrient minter role to lifeform contract
  const grantRole1Response = await nutrientContract.grant_role(MINTER_ROLE, lifeFormDeployResponse.deploy.contract_address);
    await provider.waitForTransaction(grantRole1Response.transaction_hash);
    console.log("✅ Successfully called grant role function on nutrientContract:", lifeFormDeployResponse.deploy.contract_address);
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

    // Set nutrient contract address in lifeform contract
    // console.log("Available methods:", Object.keys(lifeFormContract.functions));
    const setNutrientContractResponse = await lifeFormContract.update_nutrient_contract_address(nutrientDeployResponse.deploy.contract_address);
    await provider.waitForTransaction(setNutrientContractResponse.transaction_hash);
    console.log("✅ Successfully set nutrient contract in lifeform");
    console.log("Transaction hash:", setNutrientContractResponse.transaction_hash);   

      
  // Test mint
  // console.log(account0)
  
  const allowanceResponse = await nutrientContract.approve(lifeFormDeployResponse.deploy.contract_address, "100000000000000000000000000");
  await provider.waitForTransaction(allowanceResponse.transaction_hash);
  console.log("✅ Successfully alllowed on nutrientContract:");
  console.log("Transaction hash:", allowanceResponse.transaction_hash);

// Test mint
// console.log(account0)
const testMintResponse2 = await loopMinterContract.mint_loop("1073856514",60,account0.address);
  await provider.waitForTransaction(testMintResponse2.transaction_hash);
  console.log("✅ Successfully mint 0 on loop minter:");
  console.log("Transaction hash:", testMintResponse2.transaction_hash);

  
  // const testMintResponse4 = await loopMinterContract.mint_loop("237691741097710700555680088064",1,account0.address);
  // await provider.waitForTransaction(testMintResponse4.transaction_hash);
  // console.log("✅ Successfully mint 237691741097710700555680088064 on loop minter:");
  // console.log("Transaction hash:", testMintResponse4.transaction_hash);
  

  // const testMintResponse = await loopMinterContract.mint_loop("2115620184325601055735808",2,accountAddress0);
  // await provider.waitForTransaction(testMintResponse.transaction_hash);
  // console.log("✅ Successfully mint 2115620184325601055735808 on loop minter:");
  // console.log("Transaction hash:", testMintResponse.transaction_hash);

  // Test minting path
//   const testMintResponse3 = await pathMinterContract.mint_path("3626814352332034943221760",1,"3626888139308329781428224",1,account0.address);
// await provider.waitForTransaction(testMintResponse3.transaction_hash);
// console.log("✅ Successfully mint path 3626814352332034943221760 on path minter:");
// console.log("Transaction hash:", testMintResponse3.transaction_hash);


//57 no loop
// 62 triggered
// const testMintResponse3 = await loopMinterContract.mint_loop("4295360522",60,account0.address);
//   await provider.waitForTransaction(testMintResponse3.transaction_hash);
//   console.log("✅ Successfully mint 4295360522 on loop minter:");
//   console.log("Transaction hash:", testMintResponse3.transaction_hash);


}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });