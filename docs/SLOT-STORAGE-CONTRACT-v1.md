# Disconnected per-slot storage handoff contract

This is a generic backend transport contract, not a live storage integration. It is not registered in the app server, has no UI, and defaults to transport:null/configured:false. No provider driver, credentials, object URL, signing or email sending was added. Tests use in-memory transports only.

The module binds a preparation request to an exact current attached final with no active final-preparation attempt. The selection token includes raw order identity, slot, version, output digest/bytes/path and current source token. Stale selections reject. Before any put, canonical local containment and the actual bytes/digest are checked again. Raw order identity is hashed into the immutable object key, avoiding collisions between similarly sanitized labels.

A SQLite intent is persisted before transport.put. The contract requests private:true and createOnly:true with exact bytes. A receipt must match object key, digest, size and privacy assertion. Only normalized receipt fields are stored, not arbitrary provider responses or signed URLs. A response error, invalid receipt or local metadata failure preserves an uncertain intent.

An existing intent never starts another put. It uses transport.find for the exact object and accepts only a matching receipt. Missing/ambiguous/mismatched lookup blocks rather than assuming no prior acceptance. Reconstructing the module can reconcile a lost accepted response or a metadata save failure without another upload. Same-instance calls coalesce; another instance sees the intent and uses lookup only. A final that changes during the asynchronous transport action leaves old metadata preserved but cannot become the new current selection.

Stored means a transport assertion was recorded, not independent current provider verification. providerVerified and deliveryReady stay false. A real adapter must validate its create-only behavior, private-object policy, authoritative byte metadata, error/lookup semantics and account/cost boundaries before activation. There is no live adapter or signed-link flow to test here. This implementation cannot establish actual external privacy, media quality or entitlement.

The slot_storage_objects table initializes only when the factory receives a store. Tests use memory SQLite and temporary synthetic local final files. Actual app data was not opened or migrated by this worker. Coverage/package readiness is unchanged. Previous intent/object records remain accessible through history when a new final becomes current.

Tests cover disabled default, read-only inspection, exact receipt normalization, lost accepted response across reconstruction, absent/mismatched lookup without re-upload, local save failure, stale/active/changed byte rejection, concurrent callers and distinct raw-order keys. Independent review and full exact-source CI are recorded in the continuation audit.

Remaining: actual transport adapter, server/UI wiring, manual resolution for a truly absent object after an uncertain put, signing/expiry validation, email draft/recovery integration and delivery. No existing Studio/agent process was started or changed. No frontend/preview change, real storage/account request, paid generation, send, Air write or production release.
