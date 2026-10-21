# Lexical identity and storage v4

`Word.id` remains the immutable record/card identity. `lexicalKey` is the semantic dedupe key: JSON of NFC-trimmed Hanzi and normalized, lower-case, tone-preserving pinyin. Pinyin normalization unifies whitespace, apostrophes, separators, and `u:`/`v`/`ü`; it never removes tones.

## Migration and recovery

On first v4 load, the untouched v3 JSON is retained under `hanzi-deck:v3:recovery` before any v4 save. Migration is pure/idempotent: UUIDs, text, pinyin, translations, timestamps, every SRS field, histories, attempts, sentence IDs, queues, per-language projections, and explanations are copied. Sentence indexes are rebuilt from unchanged `wordIds`. Missing dictionary metadata never causes guessing, splitting, deletion, or resetting. Unmatched IDs and ambiguous tombstones are recorded in `migrationReport`.

Legacy `removedWordHanzi` becomes an exact reading key only when one stored reading resolves it; otherwise `hanzi:<NFC Hanzi>` safely tombstones all readings. Exact dictionary matches may bind metadata. A translation is auto-corrected only when an exact Hanzi+pinyin match exists and the prior value equals another reading's dictionary gloss; its previous value is retained in `translationCorrectionBackup`. `translationSource: user` is protected.

Rollback: deploy the prior dev commit, then restore `hanzi-deck:v3:recovery` to `hanzi-deck:v1`. Never copy dev SQLite or local storage into production.

## Merge behavior

Backup and backend sync derive absent keys for v3 clients, merge same-key translations/SRS while preserving the established UUID, retain distinct readings, and remap sentence/card references when IDs alias or collide. Active and per-language indexes are derived; queues retain valid sentence IDs. Re-import and repeat sync are idempotent.

## Remaining Hanzi-only structures

- HSK level/order maps: orthographic curriculum metadata only; the selected card uses the curated HSK Hanzi+pinyin key.
- OCR/text segmentation and Hanzi lookup: orthographic boundary discovery only. An ambiguous spelling has no implicit dictionary value and must supply a reading before import.
- Sentence dedupe: normalized Chinese plus preserved pinyin; sentence record identity remains `Sentence.id`.
- Character explanation validation: compares Han characters for coverage, not lexical identity. Word explanation cache callers can use record/key identity; character decomposition itself is orthographic.

## Validation

Run `npm test`, `npm run typecheck`, `npm run audit:i18n`, `npm run validate:hsk-data`, and `npm run build:web` in `frontend`; run `bun test` in `backend`.
