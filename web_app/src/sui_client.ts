import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { createHash } from 'crypto';

const TESTNET_RPC = 'https://fullnode.testnet.sui.io:443';
const FUNDED_ADDRESS = '0x021132db779cd51865b1e7972e30ae325428637777676ed327f507aa3fb88d5c';

// Replace with real PackageID after `sui client publish`
const PACKAGE_ID = '0xTODO';

const client = new SuiClient({ url: TESTNET_RPC });

/**
 * Deepfake armor: SHA-256 the downloaded Walrus blob and compare against the
 * on-chain true_payload_hash stored in the DocumentVault. A tampered blob
 * produces a different digest and must be rejected before display.
 */
function verifyFrontEndHash(downloadedBytes: Uint8Array, onChainHash: Uint8Array): boolean {
    const computed = createHash('sha256').update(downloadedBytes).digest();
    if (computed.length !== onChainHash.length) return false;
    return computed.every((b, i) => b === onChainHash[i]);
}

async function buildMintVaultTx(
    title: string,
    walrusBlobId: string,
    payloadHash: Uint8Array,
    authorizedClient: string,
): Promise<Transaction> {
    const tx = new Transaction();
    tx.moveCall({
        target: `${PACKAGE_ID}::vault::mint_vault`,
        arguments: [
            tx.pure.string(title),
            tx.pure.string(walrusBlobId),
            tx.pure.vector('u8', Array.from(payloadHash)),
            tx.pure.address(authorizedClient),
        ],
    });
    return tx;
}

async function buildVerifyAccessTx(
    vaultObjectId: string,
    clockMs: bigint,
): Promise<Transaction> {
    const tx = new Transaction();
    tx.moveCall({
        target: `${PACKAGE_ID}::vault::verify_and_log_access`,
        arguments: [
            tx.object(vaultObjectId),
            tx.pure.u64(clockMs),
        ],
    });
    return tx;
}

async function main() {
    // 1. Confirm RPC connectivity
    const state = await client.getLatestSuiSystemState();
    console.log(`Connected to testnet. Current epoch: ${state.epoch}`);

    // 2. Confirm funded address has balance
    const balanceResult = await client.getBalance({ owner: FUNDED_ADDRESS });
    console.log(`Funded address balance: ${balanceResult.totalBalance} MIST`);

    // 3. Demonstrate verifyFrontEndHash
    const fakeBlob = new TextEncoder().encode('contract_v1.pdf_bytes');
    const correctHash = createHash('sha256').update(fakeBlob).digest();
    const tamperedBlob = new TextEncoder().encode('contract_v1_TAMPERED.pdf_bytes');

    console.log('Hash match (correct blob):', verifyFrontEndHash(fakeBlob, correctHash));
    console.log('Hash match (tampered blob):', verifyFrontEndHash(tamperedBlob, correctHash));

    // 4. Describe dummy PTB shapes (not built/executed — requires real PackageID from publish)
    console.log('\nmint_vault PTB shape:', {
        target: `${PACKAGE_ID}::vault::mint_vault`,
        args: ['title: string', 'walrus_blob_id: string', 'payload_hash: vector<u8>', 'authorized_client: address'],
    });
    console.log('\nverify_and_log_access PTB shape:', {
        target: `${PACKAGE_ID}::vault::verify_and_log_access`,
        args: ['vault: &DocumentVault (object ref)', 'clock_ms: u64'],
    });
}

main().catch(console.error);
