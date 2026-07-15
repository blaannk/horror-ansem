// Pilote la « santé mentale » globale à partir du market cap on-chain du token du projet.
//
// Toutes les SANITY_POLL_MS (défaut 10 s), on calcule le market cap du token pump.fun :
//   - phase bonding curve  → SDK bondingCurveMarketCap(virtualReserves)
//   - après migration (curve « complete ») → pool PumpSwap (réserves du pool)
// puis on mappe   sanity = clamp(marketCapUsd / SANITY_MC_TARGET_USD, 0, 1)
//   (0 $ = 0 %,  SANITY_MC_TARGET_USD = 100 %),
// et on écrit la valeur globale partagée (global_state + point d'historique pour la courbe).
//
// Le RPC Solana (clé Helius incluse) reste STRICTEMENT côté serveur : le client ne lit jamais
// que la valeur de sanity déjà calculée via GET /api/global/sanity.

import { createRequire } from 'node:module';
import { setGlobalSanity } from './db.js';

// Le build ESM du SDK casse sur l'interop CJS de @coral-xyz/anchor (« Named export 'BN' »).
// On charge donc le build CommonJS via createRequire, qui gère correctement anchor.
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

// ---- Prix SOL/USD (mis en cache, avec repli sur la dernière valeur connue) ----
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
    console.warn('[marketcap] prix SOL/USD indisponible, repli sur la dernière valeur :', err.message);
  }
  return cachedSolUsd; // 0 tant qu'aucune valeur n'a jamais été obtenue
}

// ---- Market cap on-chain (en SOL) ----
// Renvoie le market cap en SOL, en gérant les deux phases (bonding curve puis pool migré).
async function marketCapSol(conn, sdk, mint) {
  const bcInfo = await conn.getAccountInfo(bondingCurvePda(mint));
  const bc = bcInfo ? sdk.decodeBondingCurveNullable(bcInfo) : null;

  // Phase bonding curve : réserves virtuelles encore actives.
  if (bc && !bc.complete && !bc.virtualTokenReserves.isZero()) {
    const lamports = bondingCurveMarketCap({
      mintSupply: bc.tokenTotalSupply,
      virtualQuoteReserves: bc.virtualQuoteReserves,
      virtualTokenReserves: bc.virtualTokenReserves,
    });
    return Number(lamports.toString()) / LAMPORTS_PER_SOL;
  }

  // Phase migrée : le token a « gradué » vers un pool PumpSwap (curve complete / absente).
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
  if (!(base > 0)) throw new Error('réserve de base du pool nulle');
  const priceSol = quote / base; // SOL par token
  return priceSol * total;
}

// Calcule la sanity [0..1] à partir du market cap USD courant.
export async function computeSanity(conn, sdk, mint) {
  const [mcSol, solUsd] = await Promise.all([marketCapSol(conn, sdk, mint), getSolUsd()]);
  if (!(solUsd > 0)) throw new Error('prix SOL/USD indisponible');
  const mcUsd = mcSol * solUsd;
  return { sanity: clamp01(mcUsd / TARGET_USD), mcUsd, mcSol, solUsd };
}

// ---- Boucle de polling ----
let timer = null;

export function startMarketCapPoller() {
  if (timer) return; // déjà démarré
  if (!RPC_URL || !MINT_STR) {
    console.warn(
      '[marketcap] SOLANA_RPC_URL et/ou TOKEN_MINT manquants → poller désactivé ' +
        '(la santé mentale reste à sa dernière valeur en base).'
    );
    return;
  }

  let mint;
  try {
    mint = new PublicKey(MINT_STR);
  } catch {
    console.error('[marketcap] TOKEN_MINT invalide :', MINT_STR, '→ poller désactivé.');
    return;
  }

  const conn = new Connection(RPC_URL, 'confirmed');
  const sdk = new PumpSdk();
  let running = false; // garde anti-chevauchement si un tick dépasse POLL_MS

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
      // On garde la dernière valeur en base (pas d'écriture) : le jeu et la courbe ne « sautent » pas.
      console.warn('[marketcap] tick en échec (valeur conservée) :', err.message);
    } finally {
      running = false;
    }
  };

  console.log(
    `[marketcap] poller actif - token ${MINT_STR}, cible 100 % = $${TARGET_USD.toLocaleString('en-US')}, toutes les ${POLL_MS / 1000}s`
  );
  tick(); // premier calcul immédiat
  timer = setInterval(tick, POLL_MS);
  timer.unref?.(); // ne bloque pas l'arrêt du process
}

export function stopMarketCapPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
