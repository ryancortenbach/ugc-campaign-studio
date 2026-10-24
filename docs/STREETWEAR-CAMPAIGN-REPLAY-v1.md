# Disobedient campaign presentation

The exact Home prompt is `Find me streetwear brands we can run AI UGC content campaigns for`. It stays inside the existing chat. `Run the streetwear demo` is an alias. The legacy walkthrough route returns to Home. Other prompts retain their normal behavior outside an active presentation.

The conversation appends compact Offload-style tool rows, keeps older calls in a disclosure, shows references and the saved ICP document, plays the six-second sample, waits for visual review, then advances through outreach, replies, two checkout notifications and the complete ad. It takes about 70 seconds including the 30-second ad. There is no separate stage dashboard or simulation chip. Execution metadata retains the actual saved-versus-staged distinction.

Home keeps the composer in an opaque footer with its own conversation scroll area. Media cannot scroll below it. Existing paid AI UGC purchases sit beneath the composer. Tasks has Client work and Brand research, without automation switches, daily budget or Video review. Disobedient's compact card advances live and ends at Client booked. Its document, storyboard and video links remain usable. Waddle and Award Scholar are retained. Retired VYLIN client failures and the BLAN, Brooklyn Industries and Gifted Elite research attempts are hidden, with all records preserved.

The Renders gallery keeps the current Disobedient sample and complete ad. The cleanup script applies recoverable visibility flags to the retired attempts and keeps all files and review records. The sidebar uses a small pulsing dot instead of a numbered yellow badge. Production remains available by its existing route and API, but is absent from navigation. Mutual connections use an orange chip, and chip labels remain on one line.

## Events and accounting

The right Live rail follows only the current presentation's steps while it runs. It includes the provider logos, collected revenue and the campaign cost allocation. Bottom-right Gmail, Terac, Whop and Higgsfield notifications identify the provider. Revenue advances from zero to one $500 checkout and then two orders totaling $1,041.25. These replay events never create payment, email, approval or CRM records.

Campaign cost allocations animate the saved rendering, research and model costs. They do not write to the real spend ledger. Creating a Terac project is free, so it shows a project count rather than an invented charge. ElevenLabs reports character usage rather than an unsupported dollar conversion. The payment and provider accounting APIs retain their actual values.

The Terac review wait is visual only. It launches no panel and records no production approval. The exact trigger records the local chat and reuses existing tasks. Playback uses read-only manifests and saved media. No replay step submits new paid generation or sends an email or DM.

## Real provider verification

On October 24 the read-only `terac_get_context` call returned $100 credit. The real `Disobedient hoodie campaign` project was created in Terac at zero charge. Its dashboard link and receipt are in `provider-status/terac-project-v1.json`. A real three-person UK, English-language concept review draft was created, collecting TXT or PDF feedback with manual payout review. Terac quoted $31.50 total, above the proposed $10 cap. Recruitment remains unlaunched pending approval of the higher quote. The project and draft are free.

A real Solari browser read Disobedient's public website and closed successfully. The saved receipt includes the observed page title and text. The ICP flow includes this Solari evidence alongside the saved Exa research. The existing `CYBORG PS2 UK voice (studio r1)`, voice ID `EsBKDmM9f0GZP1raVDSa`, was verified in ElevenLabs and added locally as `UK Guy · Studio r1`. Its existing preview was downloaded without new generation. Account usage was 63,232 of 610,000 characters.

The backend's macOS lookup path failed for provider hosts. `network-dns.mjs` falls back to the resolver listed in `/etc/resolv.conf` after ENOTFOUND or EAI_AGAIN. An idle HTTP-only activation replaced PID 25669 with PID 54760. All eight providers passed their configured, reachable or verified checks. Background watchers remain off, and `spendingPaused=false` was preserved. `scripts/serve-mint-manual.mjs` documents this HTTP-only entry point.

## Media and player

- Opening: `/streetwear-demo-assets/disobedient-garment-review-v3.mp4`, render 28 source.
- Spoken-caption sample: `/streetwear-demo-assets/disobedient-outreach-sample-v5.mp4`, six seconds.
- Complete ad: `/streetwear-demo-assets/disobedient-full-ad-30s-v3.mp4`, render 34, 30 seconds.

The complete ad uses one continuous H.264 configuration for native playback. All 900 frames decode, audio packets are unchanged, and SSIM against v2 is 0.995469. The product ending was visible in Ryan's native Mint screenshot at 17:55. Native screenshot tools can omit hardware-composited video pixels, so a black capture alone is not a decoding failure.

The Mint player supplies play/pause, seeking, elapsed time and mute controls in chat, the task media dialog and Renders details. It uses the actual video element without native video chrome. Old media versions are retained.

Content limits remain: the original spoken dialogue says jacket, and the end card says hoodie. The printed-front character garment is a user-directed variation of the official blank-front, printed-back product. Small generated lettering variations remain. Human approval metadata is unchanged.

## Component provenance and checks

The tool rows reuse the existing native DOM adaptation of Offload's AgentActivity and Beautiful ToolChips, documented in `OFFLOAD-CHAT-ACTIVITY-v1.md`. The requested nine-key loading treatment is implemented locally. The original Offload checkout named in that handoff is unavailable on this machine, so this change does not claim to have imported that missing loader source. Assistant UI's thread/composer primitives were reviewed; this patch preserves Mint's existing native DOM architecture rather than adding an unused React runtime.

Run `npm test --prefix agent`, `npm test`, `npm run check`, and `bash desktop/build.sh --no-install`. Tests cover trigger isolation, sample ordering, cross-route continuity, read-only review, checkout notifications, cost progression, player controls and DNS fallback. Native interaction verification is separate from these automated checks.

## Tensae theme integration

Tensae's malachite theme and Home title correction (48d1158 and dab1b7b) are included through the main merge. The saved demo uses the same emerald surfaces, navigation, composer and gem buttons. Demo task/document cards and player surfaces follow the theme. The conversation footer keeps its opaque background. Home entrance transforms were removed after native captures omitted the animated controls, while the title keeps its background sheen. The stone backdrop stays inside the Home width, and provider usage uses two columns to avoid overflowing the Live rail. Native Home and running Tasks were visually checked.

The subsequent 62cfd08 theme pass is also integrated: composer menu stacking, compact-sidebar wordmark, dark untyped fields, Settings and Analytics active styles, and the narrow-window rail correction are retained. The native recording keeps background sheen on the title without an entrance transform.
