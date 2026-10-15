# Artwork review — local candidate and public snapshot

The published 0.49.3 source snapshot contains only the six community sprite atlases with explicit MIT notices and pinned hashes in `src/renderer/src/assets/pets/sources.json`. The copied eight official OpenAI sprite sheets have been removed from the release source. Existing avatar IDs remain compatible through a mapping; employee identity and layout are unchanged.

Extracted Finder/MarginNote images, the previously unverified Apple silhouette, the previously unverified Kali SVG and the Claude logo SVG were removed from that public source snapshot. The replacement computer/book/shield and engine glyphs are original SVG code, licensed under the host Apache-2.0 terms. Sources are recorded beside the assets. This records replacement, not a grant from any vendor.

The former private Git history is retained locally and is not part of the public source history. The exclusions described above apply to the 0.49.3 snapshot. Public screenshots are reviewed for paths and credentials.

Local 0.49.6 update: the macOS glyph now uses the Simple Icons Apple SVG, pinned by commit and SHA256 in the OS asset manifest. Its CC0-1.0 text is included separately; it is shown only as the macOS identification mark, with a macOS accessible label. This does not claim vendor endorsement or a trademark grant.

The Kali host icon now uses the unmodified white dragon SVG from the official Kali Linux press pack. Its pinned source is in the OS asset manifest and the product-identification trademark policy is linked in THIRD_PARTY_NOTICES.md. The earlier generic shield remains an original, unused source asset.

Local 0.49.9 restoration: the user requested all eight previously imported official OpenAI pets and both original engine identification glyphs. They are restored from project history for the local candidate. The later user request replaces community selections with official-source characters. Official sprite bytes match the original manifest. Named avatar IDs no longer map to substitute characters. This invalidates the previous exclusion-based approval for these restored assets; public redistribution review is pending. The existing published source checkout is unchanged and no publication is authorized for this candidate.

The 0.49.9 picker now includes Hoots from the official OpenAI extension, Clawd from the official Claude Code extension, and all 18 MIT-licensed Anthropic Buddy character animation sets. Community atlas imports are removed from the renderer; old IDs resolve to official appearances. The Clawd movement is application animation applied to the unchanged official SVG. Source versions, commit and checksums are recorded in the pet manifest.

Local 0.50.1 restores all six original community atlas imports and their original legacy aliases. Their bytes and MIT provenance match the published snapshot. The picker preserves 34 characters, with Clawd included in the Claude collection. Existing employee avatar selections and layout remain unchanged. The vendor asset redistribution review above remains pending.

0.50.3 source publication: the project owner approved the new four-engine cover and requested publication of the current changes on 2026-09-28. The source now includes the restored character collection. This publication instruction does not establish a third-party license; the vendor asset review remains pending and no new redistribution clearance is recorded.
