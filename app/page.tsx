'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useReadContract, useReadContracts, useChainId, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseUnits, formatUnits } from 'viem';
import { hemiMainnet } from '@/lib/networks';
import { Wallet, Bitcoin, ArrowRightLeft, ShieldCheck, History, Coins, RefreshCw, LayoutGrid, ShoppingCart, PlusCircle, ExternalLink, Clock, Copy } from 'lucide-react';

// Mainnet Addresses
const BITDEX_ADDRESS = '0x98c039CB514e5beFBBd0EE4F70E595597186ba27' as `0x${string}`; 
const USDC_ADDRESS = '0xad11a8beb98bbf61dbb1aa0f6d6f2ecd87b35afa' as `0x${string}`; 

const BITDEX_ABI = [
  { name: 'intentCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getIntentIds', type: 'function', stateMutability: 'view', inputs: [{ name: '_start', type: 'uint256' }, { name: '_count', type: 'uint256' }], outputs: [{ name: '', type: 'bytes32[]' }] },
  { name: 'intents', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'bytes32' }], outputs: [{ name: 'maker', type: 'address' }, { name: 'usdcAmount', type: 'uint256' }, { name: 'requiredBtc', type: 'uint256' }, { name: 'makerBtcAddress', type: 'string' }, { name: 'expirationTime', type: 'uint256' }, { name: 'isActive', type: 'bool' }] },
  { name: 'createIntent', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_usdcAmount', type: 'uint256' }, { name: '_requiredBtc', type: 'uint256' }, { name: '_makerBtcAddress', type: 'string' }, { name: '_duration', type: 'uint256' }], outputs: [{ name: '', type: 'bytes32' }] },
  { name: 'fulfillIntent', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: '_intentId', type: 'bytes32' }, { name: '_btcTxId', type: 'bytes32' }], outputs: [] }
] as const;

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  // Header Connect Section
  const renderConnect = () => {
    if (isConnected) {
      return (
        <button onClick={() => disconnect()} style={walletButtonStyle}>
          <Wallet size={18} /> {address?.slice(0, 6)}...{address?.slice(-4)}
        </button>
      );
    }

    const injectedConnector = connectors.find(c => c.id === 'injected' || c.type === 'injected');
    const fallbackConnector = injectedConnector ?? connectors[0];
    if (!fallbackConnector) return null;

    return (
      <button
        onClick={() => connect({ connector: fallbackConnector })}
        style={connectButtonStyle}
      >
        <Wallet size={18} /> Connect Wallet
      </button>
    );
  };

  // UI State
  const [activeTab, setActiveTab] = useState<'create' | 'fulfill'>('create');

  // Price State
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);

  // Maker Form State
  const [usdcAmount, setUsdcAmount] = useState('');
  const [requiredBtc, setRequiredBtc] = useState('');
  const [btcAddress, setBtcAddress] = useState('');

  // Taker Form State
  const [targetIntentId, setTargetIntentId] = useState('');
  const [btcTxId, setBtcTxId] = useState('');

  // Input Focus State
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  // Fetch BTC Price
  const fetchPrice = async () => {
    setIsPriceLoading(true);
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      const data = await res.json();
      if (data.price) setBtcPrice(parseFloat(data.price));
    } catch (err) { console.error("Price fetch failed", err); }
    finally { setIsPriceLoading(false); }
  };

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (usdcAmount && btcPrice) {
      const usdc = parseFloat(usdcAmount);
      if (!isNaN(usdc)) {
        const sats = Math.floor((usdc / btcPrice) * 100_000_000);
        setRequiredBtc(sats.toString());
      }
    }
  }, [usdcAmount, btcPrice]);

  // Marketplace Logic
  const { data: counter } = useReadContract({
    address: BITDEX_ADDRESS,
    abi: BITDEX_ABI,
    functionName: 'intentCounter',
    query: { refetchInterval: 10000 }
  });

  const { data: fetchedIds } = useReadContract({
    address: BITDEX_ADDRESS,
    abi: BITDEX_ABI,
    functionName: 'getIntentIds',
    args: [0n, 20n], // Fetch last 20
    query: { refetchInterval: 10000 }
  });

  const { data: intentData } = useReadContracts({
    contracts: (fetchedIds || []).map(id => ({
      address: BITDEX_ADDRESS,
      abi: BITDEX_ABI,
      functionName: 'intents',
      args: [id]
    })),
    query: { enabled: !!fetchedIds && fetchedIds.length > 0 }
  });

  const activeIntents = useMemo(() => {
    if (!intentData || !fetchedIds) return [];
    return intentData
      .map((res, i) => {
        const result = res.result as any;
        if (!result) return null;
        return { 
          id: fetchedIds[i], 
          maker: result[0] as string,
          usdcAmount: result[1] as bigint,
          requiredBtc: result[2] as bigint,
          makerBtcAddress: result[3] as string,
          isActive: result[5] as boolean
        };
      })
      .filter((intent): intent is NonNullable<typeof intent> => !!intent && intent.isActive)
      .reverse(); // Newest first
  }, [intentData, fetchedIds]);

  // Chain
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  // Isolated Write Hooks
  const { writeContract: writeCreate, data: hashCreate, isPending: isPendingCreate, error: createError } = useWriteContract();
  const { writeContract: writeApprove, data: hashApprove, isPending: isPendingApprove, error: approveError } = useWriteContract();
  const { isLoading: isWaitingApprove, isSuccess: isSuccessApprove } = useWaitForTransactionReceipt({ hash: hashApprove });
  const { isLoading: isWaitingCreate, isSuccess: isSuccessCreate } = useWaitForTransactionReceipt({ hash: hashCreate });

  const { writeContract: writeFulfill, data: hashFulfill, isPending: isPendingFulfill, error: fulfillError } = useWriteContract();
  const { isLoading: isWaitingFulfill, isSuccess: isSuccessFulfill } = useWaitForTransactionReceipt({ hash: hashFulfill });

  const [isCreateFlowActive, setIsCreateFlowActive] = useState(false);
  const [createStatus, setCreateStatus] = useState('');

  const ensureHemi = async () => {
    if (chainId !== hemiMainnet.id) {
      await switchChainAsync({ chainId: hemiMainnet.id });
    }
  };

  const handleCreateIntent = async () => {
    if (!usdcAmount || !requiredBtc || !btcAddress) return;
    try {
      await ensureHemi();
      setIsCreateFlowActive(true);
      setCreateStatus('Requesting Approval...');
      writeApprove({
        chainId: hemiMainnet.id,
        address: USDC_ADDRESS,
        abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
        functionName: 'approve',
        args: [BITDEX_ADDRESS, parseUnits(usdcAmount, 6)],
      });
    } catch (err) {
      setIsCreateFlowActive(false);
      setCreateStatus(`Error: ${(err as Error).message}`);
    }
  };

  useEffect(() => {
    if (isSuccessApprove && isCreateFlowActive) {
      setCreateStatus('Approval Confirmed! Listing Order...');
      writeCreate({
        chainId: hemiMainnet.id,
        address: BITDEX_ADDRESS,
        abi: BITDEX_ABI,
        functionName: 'createIntent',
        args: [parseUnits(usdcAmount, 6), BigInt(requiredBtc), btcAddress, BigInt(86400)],
      });
    }
  }, [isSuccessApprove, isCreateFlowActive]);

  const handleFulfillIntent = async () => {
    if (!targetIntentId || !btcTxId) return;
    try {
      await ensureHemi();
      writeFulfill({
        chainId: hemiMainnet.id,
        address: BITDEX_ADDRESS,
        abi: BITDEX_ABI,
        functionName: 'fulfillIntent',
        args: [targetIntentId as `0x${string}`, btcTxId as `0x${string}`],
      });
    } catch (err) {
      console.error('Fulfill failed:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('ID Copied!');
  };

  const getInputStyle = (id: string) => ({
    ...inputStyle,
    borderColor: focusedInput === id ? '#2563eb' : '#f1f5f9',
    background: focusedInput === id ? '#fff' : '#f8fafc',
    boxShadow: focusedInput === id ? '0 0 0 4px rgba(37, 99, 235, 0.08)' : 'none',
  });

  return (
    <main style={mainContainerStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={logoIconStyle}><ArrowRightLeft size={32} /></div>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>BitDEX</h1>
            <p style={{ fontSize: '14px', color: '#71717a', margin: 0 }}>Native Bitcoin Swaps on Hemi</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {btcPrice && (
            <div style={priceBadgeStyle}>
              <Bitcoin size={16} color="#ff9900" />
              <span>${btcPrice.toLocaleString()}</span>
            </div>
          )}
          {renderConnect()}
        </div>
      </header>

      {/* Beta Warning */}
      <div style={betaWarningStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} />
          <span style={{ fontWeight: '700' }}>BETA NOTICE:</span>
        </div>
        <span>This project is currently under development. Please deposit only <strong>small amounts</strong> for testing purposes. Use at your own risk.</span>
      </div>

      <div style={contentGridStyle}>
        {/* Left Column: Actions */}
        <div style={leftColStyle}>
          <div style={tabsContainerStyle}>
            <button onClick={() => setActiveTab('create')} style={activeTab === 'create' ? activeTabStyle : tabStyle}><PlusCircle size={18} /> Create Intent</button>
            <button onClick={() => setActiveTab('fulfill')} style={activeTab === 'fulfill' ? activeTabStyle : tabStyle}><ShieldCheck size={18} /> Fulfill Swap</button>
          </div>

          <section style={cardStyle}>
            {activeTab === 'create' ? (
              <>
                <div style={formHeaderStyle}>
                  <h3 style={cardTitleStyle}>New Listing</h3>
                  <p style={cardSubStyle}>Deposit USDC to request native Bitcoin.</p>
                </div>
                <div style={formStyle}>
                  <div style={inputGroupStyle}>
                    <label style={labelStyle}>USDC to Sell</label>
                    <div style={inputWrapperStyle}>
                      <input 
                        type="number" 
                        value={usdcAmount} 
                        onChange={(e) => setUsdcAmount(e.target.value)} 
                        style={getInputStyle('usdc')} 
                        placeholder="0.00" 
                        onFocus={() => setFocusedInput('usdc')}
                        onBlur={() => setFocusedInput(null)}
                      />
                      <span style={inputSuffixStyle}>USDC</span>
                    </div>
                  </div>

                  <div style={inputGroupStyle}>
                    <label style={labelStyle}>Required BTC (Sats)</label>
                    <input 
                      type="number" 
                      value={requiredBtc} 
                      onChange={(e) => setRequiredBtc(e.target.value)} 
                      style={getInputStyle('sats')} 
                      placeholder="1000000" 
                      onFocus={() => setFocusedInput('sats')}
                      onBlur={() => setFocusedInput(null)}
                    />
                    <p style={subtextStyle}>≈ {(parseInt(requiredBtc) / 100_000_000 || 0).toFixed(8)} BTC</p>
                  </div>

                  <div style={inputGroupStyle}>
                    <label style={labelStyle}>Recipient Bitcoin Address</label>
                    <input 
                      type="text" 
                      value={btcAddress} 
                      onChange={(e) => setBtcAddress(e.target.value)} 
                      style={getInputStyle('addr')} 
                      placeholder="bc1q..." 
                      onFocus={() => setFocusedInput('addr')}
                      onBlur={() => setFocusedInput(null)}
                    />
                  </div>

                  {isCreateFlowActive && (
                    <div style={statusBoxStyle}>
                      <RefreshCw size={14} style={{ animation: 'spin 2s linear infinite' }} />
                      {createStatus}
                    </div>
                  )}

                  {(approveError || createError) && (
                    <div style={{ ...statusBoxStyle, color: '#dc2626', background: '#fef2f2' }}>
                      {(approveError || createError)?.message}
                    </div>
                  )}

                  <button 
                    onClick={handleCreateIntent}
                    disabled={isPendingApprove || isWaitingApprove || isPendingCreate || isWaitingCreate}
                    style={{...actionButtonStyle('#2563eb'), opacity: (isPendingApprove || isWaitingApprove || isPendingCreate || isWaitingCreate) ? 0.6 : 1}}
                  >
                    {isWaitingApprove ? 'Approving...' : isWaitingCreate ? 'Listing...' : 'Deposit & List'}
                  </button>
                  {isSuccessCreate && <p style={successTextStyle}>Order Listed Successfully!</p>}
                </div>
              </>
            ) : (
              <>
                <div style={formHeaderStyle}>
                  <h3 style={cardTitleStyle}>Fulfill Swap</h3>
                  <p style={cardSubStyle}>Verify and settle an existing trade.</p>
                </div>
                <div style={formStyle}>
                  <div style={inputGroupStyle}>
                    <label style={labelStyle}>Intent ID</label>
                    <input 
                      type="text" 
                      value={targetIntentId} 
                      onChange={(e) => setTargetIntentId(e.target.value)} 
                      style={getInputStyle('intentId')} 
                      placeholder="0x..." 
                      onFocus={() => setFocusedInput('intentId')}
                      onBlur={() => setFocusedInput(null)}
                    />
                  </div>
                  <div style={inputGroupStyle}>
                    <label style={labelStyle}>Bitcoin TxID</label>
                    <input 
                      type="text" 
                      value={btcTxId} 
                      onChange={(e) => setBtcTxId(e.target.value)} 
                      style={getInputStyle('txId')} 
                      placeholder="TxID..." 
                      onFocus={() => setFocusedInput('txId')}
                      onBlur={() => setFocusedInput(null)}
                    />
                  </div>
                  <button 
                    onClick={handleFulfillIntent}
                    disabled={isPendingFulfill || isWaitingFulfill}
                    style={{...actionButtonStyle('#000'), opacity: (isPendingFulfill || isWaitingFulfill) ? 0.6 : 1}}
                  >
                    {isWaitingFulfill ? 'Verifying...' : 'Claim USDC'}
                  </button>
                  {fulfillError && (
                    <div style={{ ...statusBoxStyle, color: '#dc2626', background: '#fef2f2' }}>
                      {fulfillError.message}
                    </div>
                  )}
                  {isSuccessFulfill && <p style={successTextStyle}>Swap Fulfilled! USDC Released.</p>}
                </div>
              </>
            )}
          </section>
        </div>

        {/* Right Column: Marketplace */}
        <div style={rightColStyle}>
          <div style={{ visibility: 'hidden', height: '56px' }}>{/* Spacer */}</div>
          
          <section style={{ ...cardStyle, height: '700px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ ...formHeaderStyle, flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={cardTitleStyle}>Active Listings</h3>
                <span style={countBadgeStyle}>{activeIntents.length} Live</span>
              </div>
              <p style={cardSubStyle}>Market trades available for fulfillment.</p>
            </div>

            <div style={{ ...listingsGridStyle, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
              {activeIntents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {activeIntents.map((intent, idx) => (
                    <div key={idx} style={listingCardStyle}>
                      <div style={listingHeaderStyle}>
                        <div style={listingAmountStyle}>{formatUnits(intent.usdcAmount || 0n, 6)} USDC</div>
                        <div style={listingBtcStyle}>{(Number(intent.requiredBtc || 0n) / 100_000_000).toFixed(8)} BTC</div>
                      </div>
                      <div style={listingBodyStyle}>
                        <div style={listingDetailStyle}>
                          <span style={listingLabelStyle}>Maker</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={listingValueStyle}>{intent.maker?.slice(0,6)}...{intent.maker?.slice(-4)}</span>
                            <button onClick={() => copyToClipboard(intent.maker)} style={listingSmallIconButtonStyle} title="Copy Maker Address"><Copy size={12} /></button>
                          </div>
                        </div>
                        <div style={listingDetailStyle}>
                          <span style={listingLabelStyle}>Bitcoin Addr</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={listingValueStyle}>{intent.makerBtcAddress?.slice(0,10)}...</span>
                            <button onClick={() => copyToClipboard(intent.makerBtcAddress)} style={listingSmallIconButtonStyle} title="Copy Bitcoin Address"><Copy size={12} /></button>
                          </div>
                        </div>
                      </div>
                      <div style={listingFooterStyle}>
                        <span style={listingIdStyle}>ID: {intent.id?.slice(0,12)}...</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => copyToClipboard(intent.id)} style={listingIconButtonStyle} title="Copy Intent ID"><Copy size={14} /></button>
                          <button onClick={() => {
                            setTargetIntentId(intent.id);
                            setActiveTab('fulfill');
                          }} style={listingActionButtonStyle}>Fulfill Swap</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyMarketStyle}>
                  <LayoutGrid size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                  <p>No active listings found.</p>
                  <p style={{ fontSize: '12px', marginTop: '4px' }}>Be the first to create an intent!</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <footer style={footerStyle}>
        <div style={{ display: 'flex', gap: '24px' }}>
          <span>Hemi Mainnet</span>
          <span>Security: hVM Precompiles</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <a href="https://explorer.hemi.xyz" target="_blank" style={footerLinkStyle}>Explorer <ExternalLink size={12} /></a>
          <span>v1.0.0</span>
        </div>
      </footer>
    </main>
  );
}

// Styles
const mainContainerStyle = { maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', minHeight: '100vh', display: 'flex', flexDirection: 'column' } as const;
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' } as const;
const logoIconStyle = { background: '#ff9900', color: 'white', padding: '10px', borderRadius: '14px', boxShadow: '0 4px 12px rgba(255,153,0,0.2)' } as const;
const priceBadgeStyle = { background: '#fff7ed', border: '1px solid #ffedd5', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', color: '#ea580c', display: 'flex', alignItems: 'center', gap: '8px' } as const;
const walletButtonStyle = { background: '#fff', border: '1px solid #e4e4e7', padding: '10px 18px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: '500', color: 'black', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' } as const;
const connectButtonStyle = { background: 'black', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px' } as const;

const contentGridStyle = { display: 'grid', gridTemplateColumns: '400px 1fr', gap: '40px', flex: 1 } as const;
const leftColStyle = { display: 'flex', flexDirection: 'column', gap: '24px' } as const;
const rightColStyle = { display: 'flex', flexDirection: 'column', gap: '24px' } as const;

const tabsContainerStyle = { display: 'flex', gap: '8px', padding: '4px', background: '#f4f4f5', borderRadius: '14px' } as const;
const tabStyle = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#71717a', transition: 'all 0.2s' } as const;
const activeTabStyle = { ...tabStyle, background: 'white', color: 'black', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' } as const;

const cardStyle = { background: 'white', border: '1px solid #e4e4e7', borderRadius: '24px', padding: '32px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)', height: '700px', display: 'flex', flexDirection: 'column' } as const;
const formHeaderStyle = { marginBottom: '24px', flexShrink: 0 } as const;
const cardTitleStyle = { color: 'black', fontSize: '22px', fontWeight: '700', margin: 0, letterSpacing: '-0.02em' } as const;
const cardSubStyle = { fontSize: '14px', color: '#71717a', margin: '4px 0 0 0' } as const;
const formStyle = { display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, overflowY: 'auto' } as const;
const inputGroupStyle = { display: 'flex', flexDirection: 'column', gap: '10px' } as const;
const labelStyle = { fontSize: '14px', fontWeight: '600', color: '#3f3f46' } as const;
const inputWrapperStyle = { position: 'relative', display: 'flex', alignItems: 'center' } as const;
const inputStyle = { 
  width: '100%', 
  padding: '14px 16px', 
  borderRadius: '12px', 
  border: '1.5px solid #f1f5f9', 
  background: '#f8fafc',
  fontSize: '16px', 
  color: '#0f172a',
  outline: 'none', 
  transition: 'all 0.2s',
  fontWeight: '500'
} as const;
const inputSuffixStyle = { position: 'absolute', right: '16px', fontSize: '13px', fontWeight: '800', color: '#64748b' } as const;
const subtextStyle = { fontSize: '12px', color: '#a1a1aa', margin: 0 } as const;
const statusBoxStyle = { background: '#f8fafc', padding: '14px', borderRadius: '12px', fontSize: '14px', color: '#475569', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' } as const;
const actionButtonStyle = (bg: string) => ({ background: bg, color: 'white', border: 'none', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', transition: 'transform 0.1s active', flexShrink: 0 }) as const;
const successTextStyle = { fontSize: '14px', color: '#16a34a', fontWeight: '600', textAlign: 'center' as const, marginTop: '8px' } as const;

const marketHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 } as const;
const countBadgeStyle = { background: '#f4f4f5', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', color: '#71717a' } as const;
const listingsGridStyle = { flex: 1, overflowY: 'auto', paddingRight: '8px' } as const;
const emptyMarketStyle = { height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa', background: '#fafafa', borderRadius: '24px', border: '2px dashed #f1f1f1' } as const;

const listingCardStyle = { background: 'white', border: '1px solid #e4e4e7', borderRadius: '20px', padding: '20px', transition: 'transform 0.2s' } as const;
const listingHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f4f4f5', paddingBottom: '16px' } as const;
const listingAmountStyle = { fontSize: '18px', fontWeight: '800', color: '#1a1a1a' } as const;
const listingBtcStyle = { fontSize: '16px', fontWeight: '700', color: '#ff9900' } as const;
const listingBodyStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' } as const;
const listingDetailStyle = { display: 'flex', flexDirection: 'column', gap: '4px' } as const;
const listingLabelStyle = { fontSize: '11px', fontWeight: '700', color: '#a1a1aa', textTransform: 'uppercase' } as const;
const listingValueStyle = { fontSize: '13px', fontWeight: '600', color: '#4b5563', fontFamily: 'monospace' } as const;
const listingFooterStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', padding: '10px 16px', borderRadius: '12px' } as const;
const listingIdStyle = { fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' } as const;
const listingActionButtonStyle = { background: '#2563eb', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' } as const;
const listingIconButtonStyle = { background: '#f3f4f6', border: 'none', color: '#6b7280', padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;
const listingSmallIconButtonStyle = { background: 'none', border: 'none', color: '#94a3b8', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s' } as const;

const footerStyle = { marginTop: '80px', paddingTop: '40px', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'space-between', color: '#a1a1aa', fontSize: '13px' } as const;
const footerLinkStyle = { color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' } as const;
const betaWarningStyle = { 
  background: '#fef2f2', 
  border: '1px solid #fecaca', 
  padding: '12px 20px', 
  borderRadius: '12px', 
  marginBottom: '32px', 
  fontSize: '13px', 
  color: '#991b1b', 
  display: 'flex', 
  alignItems: 'center', 
  gap: '12px',
  lineHeight: '1.5'
} as const;
