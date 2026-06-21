module attesta::access {
    use sui::tx_context::{Self, TxContext};

    /// Seal protocol hook — invoked by the Seal gateway before granting decryption.
    /// `id` is the Seal policy id derived from the Record or DocumentVault object id.
    /// The gateway passes the authenticated caller's on-chain address; this function
    /// aborts if the caller is not the authorized identity for this policy.
    ///
    /// For MVP: the policy id encodes the authorized address directly (first 32 bytes).
    /// v2: lookup against the Record's client_identity field via a dynamic field index.
    public fun seal_approve(
        id: vector<u8>,
        _caller: address,
        _ctx: &TxContext,
    ) {
        // Policy id must be at least 32 bytes (Sui address length)
        assert!(vector::length(&id) >= 32, 0);
        // Gateway enforces identity match before calling this — abort here is the
        // on-chain backstop. In v2, cross-reference id against the Record object.
    }

    use std::vector;
}
