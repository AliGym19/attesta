module lexivault::vault {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use sui::clock::{Self, Clock};
    use std::string::String;

    public struct DocumentVault has key, store {
        id: UID,
        document_title: String,
        walrus_blob_id: String,
        true_payload_hash: vector<u8>,
        authorized_client: address,
        is_shredded: bool,
    }

    public struct DocumentAccessedEvent has copy, drop {
        vault_id: ID,
        accessed_by: address,
        timestamp_ms: u64,
    }

    /// Solicitor mints a vault and transfers it to the authorized client.
    public fun mint_vault(
        title: String,
        walrus_blob_id: String,
        payload_hash: vector<u8>,
        client: address,
        ctx: &mut TxContext,
    ) {
        let vault = DocumentVault {
            id: object::new(ctx),
            document_title: title,
            walrus_blob_id,
            true_payload_hash: payload_hash,
            authorized_client: client,
            is_shredded: false,
        };
        transfer::transfer(vault, client);
    }

    /// Authorized client calls this to emit an immutable on-chain audit event.
    /// Clock is authoritative — never trust a client-supplied timestamp.
    public fun verify_and_log_access(
        vault: &DocumentVault,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let caller = tx_context::sender(ctx);
        assert!(caller == vault.authorized_client, 0);
        assert!(!vault.is_shredded, 1);
        let timestamp_ms = clock::timestamp_ms(clock);
        event::emit(DocumentAccessedEvent {
            vault_id: object::id(vault),
            accessed_by: caller,
            timestamp_ms,
        });
    }

    /// Tombstones the vault for GDPR erasure.
    /// Physical deletion of key-ability objects requires object::delete;
    /// flagging is the correct pattern for immutable-after-creation objects.
    public fun shred_vault(vault: &mut DocumentVault, _ctx: &TxContext) {
        vault.is_shredded = true;
    }
}
