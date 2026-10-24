# Editable production storyboard and portable packets

Open the workspace and choose Production packet. The starting draft retains the supplied brief, proposes three shots, and leaves unknown character-world details and dialogue for the creator to specify. Suggested shot directions are not approved creative work.

Edit the character, wardrobe, environment, voice, camera, action, dialogue, and sound cues. Choose 5, 15, or 30 seconds. Timing changes preserve written material and save the previous draft. A timing warning highlights dialogue that may be too long; it is not a speech synthesis measurement.

Save storyboard version creates a snapshot. Restoring a selected version preserves the current draft before restoring the older one. Draft fields autosave in this browser, including incomplete reference JSON. Save or load the manifest before treating it as parsed reference data.

Load storyboard into review lab transfers the full prompt and reference manifest. Dialogue is locked against accidental rewriting, without granting script approval. The cost quote resets to zero. Actual references, a current quote, model configuration and the separate approvals remain required. No video is generated.

Export JSON from the campaign view includes the brief, current storyboard and saved storyboard versions. The browser download was verified with four saved versions and spend approval false. The export is a planning document, not an editable video project.

Storage is local to each browser and preview origin. Other devices and new deployment URLs do not automatically share drafts. Export JSON before switching devices or previews. On the destination, open Production packet and choose Import production packet, or paste the JSON under Or paste a production packet. Processing happens locally in the browser. No API, outreach, generation, or payment request is made by import.

The importer creates a separate saved campaign and preserves the current campaign. Identical brief text can now have independent storyboards through campaign-specific planning IDs. Imported storyboard history is retained. Approval and submission flags and current generation quotes reset. Asset IDs in a file remain reference metadata, not proof of an uploaded or approved asset.

Validation rejects malformed JSON, files larger than 2 MB, non-text brief fields, inconsistent shot timing and malformed reference records. Legacy brief-only packets create a new draft storyboard. Unknown fields are discarded. Keep the original JSON file if validation fails. Authenticated cloud synchronization is still unimplemented.

Browser verification: a four-version packet was imported through the paste path, saved as a separate campaign, and its old original storyboard was reopened unchanged. The direct automation file chooser requires the Chrome extension's file-URL permission, which was not changed. Native manual file selection has not been physically tested on an iPhone. The paste path uses the same parser and campaign import function.
