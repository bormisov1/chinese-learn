# Third-party dictionary data

## Thai vocabulary meanings

`public/dictionaries/hsk-th.json` combines entries from these human-curated lexical resources:

- **VOLUBILIS Multilingual Thai Dictionary** by Belisan, version 25.3 (November 2025), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Chinese headwords were matched directly to HSK vocabulary. Changes: selected matching Chinese/Thai fields, combined duplicate Thai headwords, and converted the result to JSON.
- **Chinese Open Wordnet** and **Thai Wordnet**, distributed by the [Open Multilingual Wordnet](https://omwn.org/). Chinese and Thai lemmas were joined through shared WordNet synset identifiers. See the individual WordNet distributions for their licenses.
- **LEXiTRON**, developed by Thailand's National Electronics and Computer Technology Center (NECTEC). This product includes adaptations of LEXiTRON data. English glosses were matched exactly to Thai headwords from the [Yaitron](https://github.com/veer66/Yaitron) machine-readable distribution. See Yaitron's `LICENSE-LEXITRON` for redistribution terms.

No machine-generated translations are included. Entries without a match in these sources are omitted.
