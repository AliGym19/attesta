module attesta::registry {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::clock::{Self, Clock};
    use std::string::String;
    use std::option::{Self, Option};

    // ── Status constants ──────────────────────────────────────────────────────
    const ISSUED: u8 = 0;
    const VIEWED: u8 = 1;
    const VERIFIED: u8 = 2;
    const SIGNED: u8 = 3;
    const SUPERSEDED: u8 = 4;
    // Reserved for v2 dual-control (maker/checker). Do not wire yet.
    const PENDING_APPROVAL: u8 = 5;

    // ── Abort codes ──────────────────────────────────────────────────────────
    const E_ALREADY_SUPERSEDED: u64 = 1;
    const E_WRONG_STATUS: u64 = 2;
    const E_NOT_SEALER: u64 = 3;

    // ── On-chain record ──────────────────────────────────────────────────────
    /// Immutable document fingerprint anchored on Sui. Renamed from Certificate.
    public struct Record has key, store {
        id: UID,
        sha256: vector<u8>,
        walrus_blob: String,
        reference: String,
        sealed_ms: u64,
        sealer: address,
        status: u8,
        // Resolved to a zkLogin Sui address at issue or on first client auth.
        client_identity: Option<address>,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct Sealed has copy, drop {
        cert: ID,
        sha256: vector<u8>,
        reference: String,
        sealed_ms: u64,
        sealer: address,
    }

    public struct Viewed has copy, drop {
        cert: ID,
        viewer: address,
        viewed_ms: u64,
    }

    public struct Verified has copy, drop {
        cert: ID,
        verifier: address,
        verified_ms: u64,
    }

    public struct Mismatch has copy, drop {
        cert: ID,
        attempted_by: address,
        ms: u64,
    }

    public struct Executed has copy, drop {
        cert: ID,
        signer: address,
        signed_ms: u64,
    }

    public struct Superseded has copy, drop {
        cert: ID,
        reason: String,
        superseded_ms: u64,
    }

    // ── Public functions ─────────────────────────────────────────────────────

    /// Seal a document fingerprint. Called server-side after Walrus storage.
    /// `sha256`          — 32-byte SHA-256 digest, hashed client-side
    /// `walrus_blob`     — Walrus blob id of the ciphertext manifest
    /// `reference`       — public label (travels with the record, stored on-chain)
    /// `client_identity` — optional: solicitor-asserted client Sui address
    /// `clock`           — shared Clock object (0x6) for authoritative timestamp
    #[allow(lint(self_transfer))]
    public fun seal_record(
        sha256: vector<u8>,
        walrus_blob: String,
        reference: String,
        client_identity: Option<address>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sealer = tx_context::sender(ctx);
        let sealed_ms = clock::timestamp_ms(clock);
        let record = Record {
            id: object::new(ctx),
            sha256,
            walrus_blob,
            reference,
            sealed_ms,
            sealer,
            status: ISSUED,
            client_identity,
        };
        let cert_id = object::id(&record);
        event::emit(Sealed {
            cert: cert_id,
            sha256: record.sha256,
            reference: record.reference,
            sealed_ms,
            sealer,
        });
        transfer::transfer(record, sealer);
    }

    /// Client confirms they have viewed the document. Advances ISSUED → VIEWED.
    /// Gas is sponsored by the gas-station for this call — client pays nothing.
    public fun confirm_view(
        record: &mut Record,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(record.status != SUPERSEDED, E_ALREADY_SUPERSEDED);
        assert!(record.status == ISSUED, E_WRONG_STATUS);
        record.status = VIEWED;
        event::emit(Viewed {
            cert: object::id(record),
            viewer: tx_context::sender(ctx),
            viewed_ms: clock::timestamp_ms(clock),
        });
    }

    /// Mark the record as hash-verified (fingerprints matched). VIEWED → VERIFIED.
    public fun mark_verified(
        record: &mut Record,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(record.status != SUPERSEDED, E_ALREADY_SUPERSEDED);
        record.status = VERIFIED;
        event::emit(Verified {
            cert: object::id(record),
            verifier: tx_context::sender(ctx),
            verified_ms: clock::timestamp_ms(clock),
        });
    }

    /// Emit a Mismatch event when client hash differs from on-chain hash.
    /// Does NOT change status — solicitor row must be alerted, matter stays open.
    public fun mark_mismatch(
        record: &Record,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(record.status != SUPERSEDED, E_ALREADY_SUPERSEDED);
        event::emit(Mismatch {
            cert: object::id(record),
            attempted_by: tx_context::sender(ctx),
            ms: clock::timestamp_ms(clock),
        });
    }

    /// Client sign-off: VERIFIED → SIGNED. Emits Executed event.
    /// Gas sponsored by the gas-station.
    public fun confirm_signoff(
        record: &mut Record,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(record.status != SUPERSEDED, E_ALREADY_SUPERSEDED);
        assert!(record.status == VERIFIED, E_WRONG_STATUS);
        record.status = SIGNED;
        event::emit(Executed {
            cert: object::id(record),
            signer: tx_context::sender(ctx),
            signed_ms: clock::timestamp_ms(clock),
        });
    }

    /// Supersede a record. Only the original sealer can supersede.
    /// Never edit — always supersede and reissue.
    public fun supersede(
        record: &mut Record,
        reason: String,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(record.status != SUPERSEDED, E_ALREADY_SUPERSEDED);
        assert!(tx_context::sender(ctx) == record.sealer, E_NOT_SEALER);
        record.status = SUPERSEDED;
        event::emit(Superseded {
            cert: object::id(record),
            reason,
            superseded_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Read helpers (for indexer / off-chain queries) ───────────────────────
    public fun status(record: &Record): u8 { record.status }
    public fun sha256_bytes(record: &Record): &vector<u8> { &record.sha256 }
    public fun walrus_blob(record: &Record): &String { &record.walrus_blob }
    public fun sealer(record: &Record): address { record.sealer }
    public fun sealed_ms(record: &Record): u64 { record.sealed_ms }
    public fun client_identity(record: &Record): &Option<address> { &record.client_identity }

    // ── Status constants exposed for off-chain use ───────────────────────────
    public fun status_issued(): u8 { ISSUED }
    public fun status_viewed(): u8 { VIEWED }
    public fun status_verified(): u8 { VERIFIED }
    public fun status_signed(): u8 { SIGNED }
    public fun status_superseded(): u8 { SUPERSEDED }
    public fun status_pending_approval(): u8 { PENDING_APPROVAL }
}
