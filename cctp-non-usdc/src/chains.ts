import type { Chain } from "viem";
import {
  arbitrumSepolia,
  arcTestnet,
  avalancheFuji,
  baseSepolia,
  hyperliquidEvmTestnet,
  inkSepolia,
  optimismSepolia,
  polygonAmoy,
  sepolia,
  worldchainSepolia,
} from "viem/chains";

/** Sandbox CrossChainTokenService — same CREATE3 address on every CCTPx testnet. */
export const TESTNET_CCTS =
  "0x63753E722bd2C2A5DF6EE19C5106662208B81077" as const;

/**
 * Hardcoded CCTPx testnet catalog for the direct (non–Bridge Kit) path.
 * Token configuration still comes from Iris — this is chain + CCTS only.
 */
export interface CCTPXChain {
  name: string;
  chainId: number;
  cctp: { domain: number };
  cctpx: { serviceAddress: typeof TESTNET_CCTS };
  viemChain: Chain;
}

function cctpxChain(
  name: string,
  domain: number,
  viemChain: Chain,
): CCTPXChain {
  return {
    name,
    chainId: viemChain.id,
    cctp: { domain },
    cctpx: { serviceAddress: TESTNET_CCTS },
    viemChain,
  };
}

/**
 * CCTPx-enabled EVM testnets — keep in sync with Bridge Kit's
 * CCTPXBridgingProvider testnet catalog (`serviceAddress` present).
 */
export const CCTPX_TESTNET_CHAINS: readonly CCTPXChain[] = [
  cctpxChain("Ethereum Sepolia", 0, sepolia),
  cctpxChain("Avalanche Fuji", 1, avalancheFuji),
  cctpxChain("OP Sepolia", 2, optimismSepolia),
  cctpxChain("Arbitrum Sepolia", 3, arbitrumSepolia),
  cctpxChain("Base Sepolia", 6, baseSepolia),
  cctpxChain("Polygon Amoy", 7, polygonAmoy),
  cctpxChain("World Chain Sepolia", 14, worldchainSepolia),
  cctpxChain("HyperEVM Testnet", 19, hyperliquidEvmTestnet),
  cctpxChain("Ink Sepolia", 21, inkSepolia),
  cctpxChain("Arc Testnet", 26, arcTestnet),
];
