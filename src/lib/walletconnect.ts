/**
 * WalletConnect direct session for CLI — no browser needed.
 *
 * 1. Init WalletConnect SignClient
 * 2. Create session proposal → get QR URI
 * 3. Display QR in terminal
 * 4. User scans with mobile wallet (Phantom, Solflare)
 * 5. Session established → get wallet address
 * 6. Request nonce from gateway
 * 7. Request signature via WalletConnect
 * 8. Create delegation token via gateway
 * 9. Return credentials
 */

export interface WalletConnectResult {
  wallet: string;
  delegationToken: string;
  expiresAt: string;
}

export async function loginWithWalletConnectQR(
  gatewayUrl: string,
  opts?: { timeoutMs?: number; projectId?: string },
): Promise<WalletConnectResult> {
  const timeoutMs = opts?.timeoutMs ?? 300_000; // 5 minutes

  // Lazy imports — heavy dependencies
  const QRCode = await import('qrcode');
  const { SignClient: SC } = await import('@walletconnect/sign-client');

  // 1. Init WalletConnect SignClient
  const client: InstanceType<typeof SC> = await SC.init({
    projectId: opts?.projectId ?? process.env.WALLETCONNECT_PROJECT_ID ?? 'd141aaea95acc0c02c2e1400e02248a8',
    metadata: {
      name: 'Proxygate CLI',
      description: 'Authenticate Proxygate CLI with your wallet',
      url: 'https://proxygate.ai',
      icons: ['https://proxygate.ai/icon.png'],
    },
  });

  // 2. Create session proposal (use optionalNamespaces to avoid deprecation warning)
  const { uri, approval } = await client.connect({
    optionalNamespaces: {
      solana: {
        methods: ['solana_signMessage'],
        chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'], // mainnet
        events: [],
      },
    },
  });

  if (!uri) {
    throw new Error('Failed to generate WalletConnect URI');
  }

  // 3. Display QR in terminal (if URI fits)
  try {
    console.log();
    const qrString = await QRCode.toString(uri, { type: 'utf8', errorCorrectionLevel: 'L', margin: 1 });
    console.log(qrString);
  } catch {
    // URI too long for terminal QR — skip, user can use browser link
    console.log('  (QR too large for terminal, use the browser link instead)');
    console.log();
  }

  // 4. Wait for session approval with timeout
  const session = await Promise.race([
    approval(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout waiting for wallet connection')), timeoutMs),
    ),
  ]);

  // 5. Get wallet address from session
  const accounts = session.namespaces.solana?.accounts ?? [];
  if (accounts.length === 0) {
    throw new Error('No Solana accounts found in session');
  }
  // Format: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:FbExnNg..."
  const walletAddress = accounts[0].split(':').pop()!;

  // 6. Request nonce from gateway
  const nonceRes = await fetch(`${gatewayUrl}/v1/nonce?wallet=${walletAddress}`);
  if (!nonceRes.ok) {
    throw new Error(`Failed to fetch nonce: ${nonceRes.status}`);
  }
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  // 7. Request signature via WalletConnect
  const message = Buffer.from(nonce).toString('base64');
  const signResult = await client.request<{ signature: string }>({
    topic: session.topic,
    chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    request: {
      method: 'solana_signMessage',
      params: {
        pubkey: walletAddress,
        message,
      },
    },
  });

  // Convert signature to base64
  // WalletConnect/Phantom may return base58 or base64 — detect and normalize
  const sig = signResult.signature;
  let sigBase64: string;
  if (/^[A-Za-z0-9+/=]+$/.test(sig) && sig.length > 80) {
    // Looks like base64 already
    sigBase64 = sig;
  } else {
    // Assume base58 — decode via buffer
    const { decodeBase58 } = await import('@proxygate/sdk');
    const sigBytes = decodeBase58(sig);
    sigBase64 = Buffer.from(sigBytes).toString('base64');
  }

  // 8. Create delegation token via gateway
  const delegateRes = await fetch(`${gatewayUrl}/v1/auth/delegate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet: walletAddress,
      nonce,
      signature: sigBase64,
      scopes: ['proxy', 'balance:read', 'balance:deposit', 'usage:read', 'listings:read', 'listings:write', 'tunnel', 'keys:upload', 'jobs:read', 'jobs:write', 'rate:write', 'settlements:read', 'profile:read'],
      ttl: 604800,
    }),
  });

  if (!delegateRes.ok) {
    const err = (await delegateRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Delegation failed: ${delegateRes.status}`);
  }

  const { delegation_token, expires_at } = (await delegateRes.json()) as {
    delegation_token: string;
    expires_at: string;
  };

  // Cleanup session
  try {
    await client.disconnect({ topic: session.topic, reason: { code: 6000, message: 'Auth complete' } });
  } catch { /* ignore cleanup errors */ }

  return {
    wallet: walletAddress,
    delegationToken: delegation_token,
    expiresAt: expires_at,
  };
}
