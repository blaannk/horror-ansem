// Drives the global "sanity" from the project's token on-chain market cap.
//
// Every SANITY_POLL_MS (default 10s), we compute the pump.fun token market cap:
//   - bonding curve phase → SDK bondingCurveMarketCap(virtualReserves)
//   - after migration (curve "complete") → PumpSwap pool (pool reserves)
// then we map   sanity = clamp(marketCapUsd / SANITY_MC_TARGET_USD, 0, 1)
//   ($0 = 0%, SANITY_MC_TARGET_USD = 100%),
// and we write the shared global value (global_state + history point for the chart).
//
// The Solana RPC (including the Helius key) stays STRICTLY server-side: the client only ever
// reads the already-computed sanity value via GET /api/global/sanity.

import { createRequire } from 'node:module';
import { setGlobalSanity } from './db.js';

// The SDK's ESM build breaks on @coral-xyz/anchor's CJS interop ("Named export 'BN'").
// So we load the CommonJS build via createRequire, which handles anchor correctly.
const require = createRequire(import.meta.url);
const { Connection, PublicKey } = require('@solana/web3.js');
const {
  PumpSdk,
  bondingCurvePda,
  bondingCurveMarketCap,
  canonicalPumpPoolPda,
  getPumpAmmProgram,
} = require('@pump-fun/pump-sdk');

const LAMPORTS_PER_SOL = 1e9;
const WSOL = 'So11111111111111111111111111111111111111112';
const JUPITER_PRICE_URL = `https://lite-api.jup.ag/price/v3?ids=${WSOL}`;

// ---- Configuration (env) ----
const RPC_URL = process.env.SOLANA_RPC_URL;
const MINT_STR = process.env.TOKEN_MINT;
const TARGET_USD = Number(process.env.SANITY_MC_TARGET_USD) || 1_000_000; // market cap → 100 %
const POLL_MS = Math.max(2000, Number(process.env.SANITY_POLL_MS) || 10_000);

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---- SOL/USD price (cached, falls back to last known value) ----
let cachedSolUsd = 0;
let cachedSolUsdAt = 0;
const SOL_PRICE_TTL_MS = 60_000;

async function getSolUsd() {
  if (cachedSolUsd && Date.now() - cachedSolUsdAt < SOL_PRICE_TTL_MS) return cachedSolUsd;
  try {
    const res = await fetch(JUPITER_PRICE_URL, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    const price = Number(json?.[WSOL]?.usdPrice);
    if (Number.isFinite(price) && price > 0) {
      cachedSolUsd = price;
      cachedSolUsdAt = Date.now();
    }
  } catch (err) {
    console.warn('[marketcap] SOL/USD price unavailable, falling back to last known value:', err.message);
  }
  return cachedSolUsd; // 0 until a value has ever been obtained
}

// ---- On-chain market cap (in SOL) ----
// Returns the market cap in SOL, handling both phases (bonding curve then migrated pool).
async function marketCapSol(conn, sdk, mint) {
  const bcInfo = await conn.getAccountInfo(bondingCurvePda(mint));
  const bc = bcInfo ? sdk.decodeBondingCurveNullable(bcInfo) : null;

  // Bonding curve phase: virtual reserves still active.
  if (bc && !bc.complete && !bc.virtualTokenReserves.isZero()) {
    const lamports = bondingCurveMarketCap({
      mintSupply: bc.tokenTotalSupply,
      virtualQuoteReserves: bc.virtualQuoteReserves,
      virtualTokenReserves: bc.virtualTokenReserves,
    });
    return Number(lamports.toString()) / LAMPORTS_PER_SOL;
  }

  // Migrated phase: the token has "graduated" to a PumpSwap pool (curve complete / absent).
  const poolPda = canonicalPumpPoolPda(mint);
  const amm = getPumpAmmProgram(conn);
  const pool = await amm.account.pool.fetch(poolPda);
  const [baseBal, quoteBal, supply] = await Promise.all([
    conn.getTokenAccountBalance(pool.poolBaseTokenAccount),
    conn.getTokenAccountBalance(pool.poolQuoteTokenAccount),
    conn.getTokenSupply(mint),
  ]);
  const base = Number(baseBal.value.uiAmountString);
  const quote = Number(quoteBal.value.uiAmountString);
  const total = Number(supply.value.uiAmountString);
  if (!(base > 0)) throw new Error('pool base reserve is zero');
  const priceSol = quote / base; // SOL per token
  return priceSol * total;
}

// Computes sanity [0..1] from the current USD market cap.
export async function computeSanity(conn, sdk, mint) {
  const [mcSol, solUsd] = await Promise.all([marketCapSol(conn, sdk, mint), getSolUsd()]);
  if (!(solUsd > 0)) throw new Error('SOL/USD price unavailable');
  const mcUsd = mcSol * solUsd;
  return { sanity: clamp01(mcUsd / TARGET_USD), mcUsd, mcSol, solUsd };
}

// ---- Polling loop ----
let timer = null;

export function startMarketCapPoller() {
  if (timer) return; // already started
  if (!RPC_URL || !MINT_STR) {
    console.warn(
      '[marketcap] SOLANA_RPC_URL and/or TOKEN_MINT missing, poller disabled ' +
        '(sanity stays at its last stored value).'
    );
    return;
  }

  let mint;
  try {
    mint = new PublicKey(MINT_STR);
  } catch {
    console.error('[marketcap] invalid TOKEN_MINT:', MINT_STR, '→ poller disabled.');
    return;
  }

  const conn = new Connection(RPC_URL, 'confirmed');
  const sdk = new PumpSdk();
  let running = false; // guard against overlap if a tick exceeds POLL_MS

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { sanity, mcUsd } = await computeSanity(conn, sdk, mint);
      await setGlobalSanity(sanity);
      console.log(
        `[marketcap] MC ≈ $${Math.round(mcUsd).toLocaleString('en-US')} → sanity ${(sanity * 100).toFixed(1)}%`
      );
    } catch (err) {
      // We keep the last stored value (no write): the game and chart don't "jump".
      console.warn('[marketcap] tick failed (value kept):', err.message);
    } finally {
      running = false;
    }
  };

  console.log(
    `[marketcap] poller active - token ${MINT_STR}, 100% target = $${TARGET_USD.toLocaleString('en-US')}, every ${POLL_MS / 1000}s`
  );
  tick(); // immediate first computation
  timer = setInterval(tick, POLL_MS);
  timer.unref?.(); // doesn't block process exit
}

export function stopMarketCapPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
