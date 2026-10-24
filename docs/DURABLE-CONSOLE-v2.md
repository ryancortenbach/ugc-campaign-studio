# Durable readiness console v2

The separate console now has actual hosted create, recovery and cancellation routes. It is not the main dashboard executor. Source and operational instructions: experiments/durable-workflow-v2/README.md. V1 preserved.

Console: https://duolingo-library-phone-v1-6le7imc81-ryancortenbachs-projects.vercel.app/

Twelve local and twelve real hosted HTTP checks passed. Unauthorized, forged and cross-run tickets were rejected. An active job cancelled and recovered as cancelled. Another completed with its budget blocker and recovered unchanged. Cancelling the completed job returned409 and retained completed status. V1 recovery was separately denied. Three offline security tests bind tickets to their run, secret and expiry and reject malformed inputs. The full root suite has53tests.

Browser verification covers anonymous access, fictional fixture loading, missing-token refusal, fake-token401, token-field clearing and390px layout. The authenticated browser lifecycle is untested. Authenticated API behavior is verified. Physical iPhone untested. These are distinct checks.

Public receipt: public/durable-proof/receipt-v2.json. No operator credential or job ticket is public. Job tickets live only in page memory. Browser storage holds IDs and statuses. Operator secret is in ignored experiments/durable-workflow-v2/.env.local and must never be printed, committed or uploaded as static content.

The source index differs from anonymous served HTML only by an exact Vercel feedback script suffix of163bytes. Console JS/CSS matched byte-for-byte. Build secret scan passed. READY deployment has targetnull. Existing project settings matched V17.

No server-side submission deduplication. Unknown submissions are blocked in the client until manual reconciliation, and the reconciliation UI records an operator assertion only. No multi-user ownership, cross-device job discovery, durable push alerts or external executor. Main dashboard runner remains browser-local. No model, media, sender or publishing adapter is present. Vercel quotas and payload retention apply. Whole hackathon scope remains incomplete.
