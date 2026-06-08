import { RpcProvider, Contract, type Abi, type AccountInterface } from "starknet";

import lifeformsAbi from "./abi/golLifeforms.json";
import nutrientAbi from "./abi/nutrient.json";
import loopMinterAbi from "./abi/golLoopMinter.json";
import pathMinterAbi from "./abi/golPathMinter.json";

// Public Sepolia endpoint by default; override with NEXT_PUBLIC_RPC_URL.
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";

// Filled in after deployment — see .env.local.example.
export const ADDRESSES = {
  lifeforms: process.env.NEXT_PUBLIC_LIFEFORMS_ADDRESS ?? "",
  nutrient: process.env.NEXT_PUBLIC_NUTRIENT_ADDRESS ?? "",
  loopMinter: process.env.NEXT_PUBLIC_LOOP_MINTER_ADDRESS ?? "",
  pathMinter: process.env.NEXT_PUBLIC_PATH_MINTER_ADDRESS ?? "",
} as const;

export const NUT_DECIMALS = 18n;

export const LIFEFORMS_ABI = lifeformsAbi as unknown as Abi;
export const NUTRIENT_ABI = nutrientAbi as unknown as Abi;
export const LOOP_MINTER_ABI = loopMinterAbi as unknown as Abi;
export const PATH_MINTER_ABI = pathMinterAbi as unknown as Abi;

export const provider = new RpcProvider({ nodeUrl: RPC_URL });

/** True once every contract address has been configured via env. */
export function isConfigured(): boolean {
  return Object.values(ADDRESSES).every((addr) => addr.length > 0);
}

/** Read-only contract instances bound to the RPC provider. */
export function readContracts() {
  return {
    lifeforms: new Contract(LIFEFORMS_ABI, ADDRESSES.lifeforms, provider),
    nutrient: new Contract(NUTRIENT_ABI, ADDRESSES.nutrient, provider),
    loopMinter: new Contract(LOOP_MINTER_ABI, ADDRESSES.loopMinter, provider),
    pathMinter: new Contract(PATH_MINTER_ABI, ADDRESSES.pathMinter, provider),
  };
}

/** Contract instances connected to a wallet account, for sending transactions. */
export function writeContracts(account: AccountInterface) {
  const contracts = readContracts();
  contracts.lifeforms.connect(account);
  contracts.nutrient.connect(account);
  contracts.loopMinter.connect(account);
  contracts.pathMinter.connect(account);
  return contracts;
}
