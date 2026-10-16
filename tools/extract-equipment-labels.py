"""Build English item/affix labels from verified local game-data extraction.

Input is the output directory of extract-game-data.py: MasterItemsList.json,
UniqueList.json, MasterAffixesList.json, and extraction.json. No save files,
network requests, executable planner code, icons, or descriptions are used.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(directory, name):
    return json.loads((directory / name).read_text(encoding='utf-8-sig'))


def identifier(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f'Invalid numeric identifier: {value!r}')
    return str(value)


def label(row, primary, fallback):
    value = row.get(primary) or row.get(fallback) or ''
    if not isinstance(value, str):
        raise ValueError(f'Invalid label: {value!r}')
    return value.strip()


def add(mapping, key, value):
    if key in mapping:
        raise ValueError(f'Duplicate label identifier: {key}')
    # An unnamed placeholder exists at base 40 / subtype 0 in build 1.5.2.2.
    # Leave it absent so the UI can show the numeric ID rather than invent a name.
    if value:
        mapping[key] = value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    source = args.data_dir.resolve()
    items = load(source, 'MasterItemsList.json')
    uniques = load(source, 'UniqueList.json')
    affixes = load(source, 'MasterAffixesList.json')
    provenance = load(source, 'extraction.json')
    result = {'bases': {}, 'uniques': {}, 'affixes': {}, 'baseTypes': {}}
    for base in items['EquippableItems']:
        base_id = identifier(base['baseTypeID'])
        add(result['baseTypes'], base_id, label(base, 'displayName', 'BaseTypeName'))
        for subtype in base['subItems']:
            key = f"{base_id}:{identifier(subtype['subTypeID'])}"
            add(result['bases'], key, label(subtype, 'displayName', 'name'))
    for unique in uniques['uniques']:
        add(result['uniques'], identifier(unique['uniqueID']), label(unique, 'displayName', 'name'))
    for affix in [*affixes['singleAffixes'], *affixes['multiAffixes']]:
        add(result['affixes'], identifier(affix['affixId']), label(affix, 'affixDisplayName', 'affixName'))
    output = args.out.resolve()
    if output in [source / name for name in ['MasterItemsList.json', 'UniqueList.json', 'MasterAffixesList.json', 'extraction.json']]:
        raise ValueError('Output must not overwrite extraction input')
    output.parent.mkdir(parents=True, exist_ok=True)
    header = (
        '// English labels from installed Last Epoch game assets; no inferred translations.\n'
        f"// Build {provenance['gameBuildHash']}; source: MasterItemsList, UniqueList, MasterAffixesList.\n"
        '// Regenerate with tools/extract-equipment-labels.py after extracting the same game build.\n'
    )
    output.write_text(header + 'export default ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print('Wrote ' + ', '.join(f'{len(values)} {kind}' for kind, values in result.items()))


if __name__ == '__main__':
    main()
