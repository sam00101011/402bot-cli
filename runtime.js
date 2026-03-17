import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58 } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { privateKeyToAccount } from "viem/accounts";
import { parse as parseYaml } from "yaml";

export const BOT402_CONFIG_VERSION = 1;
const BOT402_APP_NAME = "402bot";
const X402_PROXY_APP_NAME = "x402-proxy";
const BASE_RPC_URL = "https://mainnet.base.org";
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const enc = new TextEncoder();

function checksumAddress(addr) {
  const hash = Buffer.from(keccak_256(enc.encode(addr))).toString("hex");
  let out = "0x";
  for (let index = 0; index < 40; index += 1) {
    out += Number.parseInt(hash[index], 16) >= 8 ? addr[index].toUpperCase() : addr[index];
  }
  return out;
}

export function getXdgConfigHome(env = process.env) {
  return env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function get402botConfigDir(env = process.env) {
  return join(getXdgConfigHome(env), BOT402_APP_NAME);
}

export function get402botConfigPath(env = process.env) {
  return join(get402botConfigDir(env), "config.json");
}

export function get402botCacheDir(env = process.env) {
  return join(get402botConfigDir(env), "cache");
}

export function get402botCatalogSnapshotPath(env = process.env) {
  return join(get402botCacheDir(env), "catalog-snapshot.json");
}

export function get402botLlmsPath(env = process.env) {
  return join(get402botCacheDir(env), "llms.txt");
}

export function get402botLlmsFullPath(env = process.env) {
  return join(get402botCacheDir(env), "llms-full.txt");
}

export function getX402ProxyConfigDir(env = process.env) {
  return join(getXdgConfigHome(env), X402_PROXY_APP_NAME);
}

export function getX402ProxyWalletPath(env = process.env) {
  return join(getX402ProxyConfigDir(env), "wallet.json");
}

export function getX402ProxyHistoryPath(env = process.env) {
  return join(getX402ProxyConfigDir(env), "history.jsonl");
}

function normalizePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalize402botConfig(raw) {
  const input = typeof raw === "object" && raw !== null ? raw : {};
  return {
    version: BOT402_CONFIG_VERSION,
    campaignId: normalizeOptionalString(input.campaignId),
    network: normalizeOptionalString(input.network),
    spendLimitDaily: normalizePositiveNumber(input.spendLimitDaily ?? input.spendCap ?? input.spendCapDaily),
    spendLimitPerTx: normalizePositiveNumber(input.spendLimitPerTx ?? input.spendCapPerTx),
    favoriteWallet: normalizeOptionalString(input.favoriteWallet),
    favoriteRecipe: normalizeOptionalString(input.favoriteRecipe),
  };
}

export function load402botConfig(env = process.env) {
  const filePath = get402botConfigPath(env);
  if (!existsSync(filePath)) {
    return normalize402botConfig({});
  }

  try {
    return normalize402botConfig(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return normalize402botConfig({});
  }
}

export function save402botConfig(config, env = process.env) {
  mkdirSync(get402botConfigDir(env), { recursive: true });
  const normalized = normalize402botConfig(config);
  writeFileSync(get402botConfigPath(env), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function load402botJsonFile(filePath, fallback = null) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function save402botJsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return value;
}

export function load402botTextFile(filePath, fallback = "") {
  if (!existsSync(filePath)) {
    return fallback;
  }

  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

export function save402botTextFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, "utf8");
  return value;
}

function parseJsonc(raw) {
  const stripped = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return JSON.parse(stripped);
}

export function loadX402ProxyConfig(env = process.env) {
  const dir = getX402ProxyConfigDir(env);
  for (const fileName of ["config.yaml", "config.yml", "config.jsonc", "config.json"]) {
    const filePath = join(dir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    try {
      const raw = readFileSync(filePath, "utf8");
      if (fileName.endsWith(".yaml") || fileName.endsWith(".yml")) {
        return parseYaml(raw) ?? {};
      }
      if (fileName.endsWith(".jsonc")) {
        return parseJsonc(raw);
      }
      return JSON.parse(raw);
    } catch {
      // Fall through to the next supported config file.
    }
  }

  return {};
}

export function buildMergedProxyConfig(env = process.env) {
  const proxyConfig = loadX402ProxyConfig(env);
  const botConfig = load402botConfig(env);
  return {
    proxyConfig,
    botConfig,
    mergedConfig: {
      ...proxyConfig,
      ...(botConfig.network ? { defaultNetwork: botConfig.network } : {}),
      ...(botConfig.spendLimitDaily ? { spendLimitDaily: botConfig.spendLimitDaily } : {}),
      ...(botConfig.spendLimitPerTx ? { spendLimitPerTx: botConfig.spendLimitPerTx } : {}),
    },
  };
}

export function createProxyOverlay(env = process.env) {
  const { mergedConfig } = buildMergedProxyConfig(env);
  const tempRoot = mkdtempSync(join(tmpdir(), "402bot-xdg-"));
  const proxyDir = join(tempRoot, X402_PROXY_APP_NAME);
  mkdirSync(proxyDir, { recursive: true });

  const walletPath = getX402ProxyWalletPath(env);
  const historyPath = getX402ProxyHistoryPath(env);

  if (existsSync(walletPath)) {
    symlinkSync(walletPath, join(proxyDir, "wallet.json"));
  }
  if (existsSync(historyPath)) {
    symlinkSync(historyPath, join(proxyDir, "history.jsonl"));
  }

  writeFileSync(join(proxyDir, "config.json"), `${JSON.stringify(mergedConfig, null, 2)}\n`, "utf8");

  return {
    env: {
      ...env,
      XDG_CONFIG_HOME: tempRoot,
    },
    cleanup() {
      rmSync(tempRoot, { force: true, recursive: true });
    },
  };
}

function deriveEvmKeypair(mnemonic) {
  const seed = mnemonicToSeedSync(mnemonic);
  const derived = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!derived.privateKey) {
    throw new Error("Failed to derive EVM private key.");
  }

  const privateKey = `0x${Buffer.from(derived.privateKey).toString("hex")}`;
  const hash = keccak_256(secp256k1.getPublicKey(derived.privateKey, false).slice(1));
  return {
    privateKey,
    address: checksumAddress(Buffer.from(hash.slice(-20)).toString("hex")),
  };
}

function deriveSolanaKeypair(mnemonic) {
  const seed = mnemonicToSeedSync(mnemonic);
  let I = hmac(sha512, enc.encode("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chainCode = I.slice(32);

  for (const index of [2147483692, 2147484149, 2147483648, 2147483648]) {
    const data = new Uint8Array(37);
    data[0] = 0;
    data.set(key, 1);
    data[33] = (index >>> 24) & 255;
    data[34] = (index >>> 16) & 255;
    data[35] = (index >>> 8) & 255;
    data[36] = index & 255;
    I = hmac(sha512, chainCode, data);
    key = I.slice(0, 32);
    chainCode = I.slice(32);
  }

  const secretKey = new Uint8Array(key);
  const publicKey = ed25519.getPublicKey(secretKey);
  const fullKey = new Uint8Array(64);
  fullKey.set(secretKey, 0);
  fullKey.set(publicKey, 32);
  return {
    secretKey: fullKey,
    address: base58.encode(publicKey),
  };
}

function parseSolanaKey(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith("[")) {
    return new Uint8Array(JSON.parse(trimmed));
  }
  return base58.decode(trimmed);
}

function solanaAddressFromKey(keyBytes) {
  if (keyBytes.length >= 64) {
    return base58.encode(keyBytes.slice(32));
  }
  return base58.encode(ed25519.getPublicKey(keyBytes));
}

function loadWalletFile(env = process.env) {
  const filePath = getX402ProxyWalletPath(env);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return parsed && parsed.version === 1 && typeof parsed.mnemonic === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveWallet(env = process.env) {
  const envEvm = normalizeOptionalString(env.X402_PROXY_WALLET_EVM_KEY);
  const envSolana = normalizeOptionalString(env.X402_PROXY_WALLET_SOLANA_KEY);
  if (envEvm || envSolana) {
    const result = {
      source: "env-keys",
    };

    if (envEvm) {
      const evmKey = envEvm.startsWith("0x") ? envEvm : `0x${envEvm}`;
      result.evmKey = evmKey;
      result.evmAddress = privateKeyToAccount(evmKey).address;
    }

    if (envSolana) {
      const solanaKey = parseSolanaKey(envSolana);
      result.solanaKey = solanaKey;
      result.solanaAddress = solanaAddressFromKey(solanaKey);
    }

    return result;
  }

  const envMnemonic = normalizeOptionalString(env.X402_PROXY_WALLET_MNEMONIC);
  if (envMnemonic) {
    const evm = deriveEvmKeypair(envMnemonic);
    const solana = deriveSolanaKeypair(envMnemonic);
    return {
      source: "env-mnemonic",
      evmKey: evm.privateKey,
      evmAddress: evm.address,
      solanaKey: solana.secretKey,
      solanaAddress: solana.address,
    };
  }

  const walletFile = loadWalletFile(env);
  if (!walletFile) {
    return { source: "none" };
  }

  const evm = deriveEvmKeypair(walletFile.mnemonic);
  const solana = deriveSolanaKeypair(walletFile.mnemonic);
  return {
    source: "wallet-file",
    evmKey: evm.privateKey,
    evmAddress: evm.address,
    solanaKey: solana.secretKey,
    solanaAddress: solana.address,
  };
}

async function rpcCall(url, method, params, signal) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    signal,
  });
  return response.json();
}

function parseHexBalance(value, divisor) {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    return null;
  }

  try {
    return Number(BigInt(value)) / divisor;
  } catch {
    return null;
  }
}

export async function fetchEvmBalances(address, { signal } = {}) {
  const usdcData = `0x70a08231${address.slice(2).padStart(64, "0")}`;
  const [nativeResponse, usdcResponse] = await Promise.all([
    rpcCall(BASE_RPC_URL, "eth_getBalance", [address, "latest"], signal),
    rpcCall(
      BASE_RPC_URL,
      "eth_call",
      [
        {
          to: BASE_USDC_ADDRESS,
          data: usdcData,
        },
        "latest",
      ],
      signal,
    ),
  ]);

  return {
    eth: parseHexBalance(nativeResponse?.result, 1e18),
    usdc: parseHexBalance(usdcResponse?.result, 1e6),
  };
}

export async function fetchSolanaBalances(address, { signal } = {}) {
  const [nativeResponse, usdcResponse] = await Promise.all([
    rpcCall(SOLANA_RPC_URL, "getBalance", [address], signal),
    rpcCall(
      SOLANA_RPC_URL,
      "getTokenAccountsByOwner",
      [address, { mint: SOLANA_USDC_MINT }, { encoding: "jsonParsed" }],
      signal,
    ),
  ]);

  const lamports = nativeResponse?.result?.value;
  const accounts = Array.isArray(usdcResponse?.result?.value) ? usdcResponse.result.value : [];
  let usdc = 0;

  for (const account of accounts) {
    const amount = Number(account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0);
    if (Number.isFinite(amount)) {
      usdc += amount;
    }
  }

  return {
    sol: typeof lamports === "number" ? lamports / 1e9 : null,
    usdc,
  };
}

export function readHistory(env = process.env) {
  const historyPath = getX402ProxyHistoryPath(env);
  if (!existsSync(historyPath)) {
    return [];
  }

  try {
    const content = readFileSync(historyPath, "utf8").trim();
    if (!content) {
      return [];
    }

    return content.split("\n").flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed?.t !== "number" || typeof parsed?.kind !== "string") {
          return [];
        }
        return [parsed];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function calcSpend(records) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  let today = 0;
  let total = 0;
  let count = 0;

  for (const record of records) {
    if (!record?.ok || record.amount == null || record.token !== "USDC") {
      continue;
    }

    total += Number(record.amount) || 0;
    count += 1;
    if (record.t >= todayMs) {
      today += Number(record.amount) || 0;
    }
  }

  return {
    today,
    total,
    count,
  };
}

export function parseTimeWindowSpec(value, now = new Date()) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const durationMatch = trimmed.match(/^(\d+)([smhdw])$/i);
  if (durationMatch) {
    const amount = Number(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    const multiplier =
      unit === "s" ? 1000
      : unit === "m" ? 60 * 1000
      : unit === "h" ? 60 * 60 * 1000
      : unit === "d" ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
    const ms = amount * multiplier;
    return {
      label: trimmed,
      sinceMs: now.getTime() - ms,
      ms,
    };
  }

  const absolute = new Date(trimmed);
  if (!Number.isNaN(absolute.getTime())) {
    return {
      label: trimmed,
      sinceMs: absolute.getTime(),
      ms: Math.max(0, now.getTime() - absolute.getTime()),
    };
  }

  return null;
}

export function filterHistorySince(records, timeWindow) {
  if (!timeWindow) {
    return records;
  }
  return records.filter((record) => record.t >= timeWindow.sinceMs);
}

export function summarizeHistory(records) {
  const byKind = new Map();
  const byNetwork = new Map();
  let successful = 0;
  let failed = 0;
  let totalUsdc = 0;

  for (const record of records) {
    if (record.ok) {
      successful += 1;
    } else {
      failed += 1;
    }

    if (record.ok && record.token === "USDC" && typeof record.amount === "number") {
      totalUsdc += record.amount;
    }

    const kindEntry = byKind.get(record.kind) ?? { kind: record.kind, count: 0, usdc: 0 };
    kindEntry.count += 1;
    if (record.ok && record.token === "USDC" && typeof record.amount === "number") {
      kindEntry.usdc += record.amount;
    }
    byKind.set(record.kind, kindEntry);

    const networkKey = record.net ?? "unknown";
    const networkEntry = byNetwork.get(networkKey) ?? { network: networkKey, count: 0, usdc: 0 };
    networkEntry.count += 1;
    if (record.ok && record.token === "USDC" && typeof record.amount === "number") {
      networkEntry.usdc += record.amount;
    }
    byNetwork.set(networkKey, networkEntry);
  }

  return {
    count: records.length,
    successful,
    failed,
    totalUsdc,
    byKind: [...byKind.values()].sort((left, right) => right.count - left.count),
    byNetwork: [...byNetwork.values()].sort((left, right) => right.count - left.count),
  };
}
