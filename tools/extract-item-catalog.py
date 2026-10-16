"""Reduce privately extracted Unity assets to the numerical item facts used by the web codec."""
import argparse
import json
import re
import struct
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--input', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
read = lambda name: json.loads((a.input / f'{name}.json').read_text(encoding='utf-8'))
master = read('MasterItemsList')
affixes = read('MasterAffixesList')
uniques = read('UniqueList')['uniques']
catalog = {
    'gameVersion': '1.5.2.1',
    'internalVersion': '1.5.2.2',
    'buildHash': read('extraction')['gameBuildHash'],
    'itemSerializationVersion': 6,
    'bases': {}, 'uniques': {}, 'affixes': {},
}
if catalog['buildHash'] != '8dfd6929fe2d10f2e77b7ed4c8e6910f49b2736b':
    raise ValueError('The native v6 codec must be re-verified for this new game build before publishing data.')
for base in master['EquippableItems']:
    catalog['bases'][str(base['baseTypeID'])] = {
        'size': [int(base['gridSize']['x']), int(base['gridSize']['y'])],
        'maximumAffixes': base['maximumAffixes'],
        'subtypes': {str(s['subTypeID']): {
            'implicitCount': len(s['implicits']),
            'corrupted': bool(s['isCorruptedSubtype']),
        } for s in base['subItems']},
    }
for item in uniques:
    catalog['uniques'][str(item['uniqueID'])] = {
        'baseType': item['baseType'], 'subTypes': item['subTypes'],
        'set': item['isSetItem'], 'legendaryType': item['legendaryType'],
        'rollIds': sorted({m['rollID'] for m in item['mods'] if m['canRoll']}),
        'primordial': item['isPrimordialItem'],
        'cocooned': item['isCocoonedItem'],
        'preCorrupted': item['isPreCorrupted'],
        'specificAffixes': item['dropsSpecificLegendaryAffixes'],
    }
for item in affixes['singleAffixes'] + affixes['multiAffixes']:
    catalog['affixes'][str(item['affixId'])] = {
        'tierCount': len(item['tiers']), 'type': item['type'],
        'specialType': item['specialAffixType'], 'canRollOn': item['canRollOn'],
    }
# This supported build's Odin int[,] records contain an explicit 5|5 rank,
# followed by exactly 25 tagged Int32 values. Fail if any structure changes.
odin = bytes(read('IdolsContainerGridDataList')['serializationData']['SerializedBytes'])
rank = b'\x27\x01\x05\0\0\0' + 'ranks'.encode('utf-16le') + b'\x01\x03\0\0\0' + '5|5'.encode('utf-16le')
matrices = []
for match in re.finditer(re.escape(rank), odin):
    offset = match.end()
    values = []
    for i in range(25):
        if odin[offset] != 24:
            raise ValueError('Idol grid no longer contains tagged Int32 cells')
        values.append(struct.unpack_from('<i', odin, offset + 1)[0])
        offset += 5
    if odin[offset:offset + 2] != b'\x07\x05':
        raise ValueError('Idol grid terminator changed')
    # Unity int[x,y], top row first; save y is counted from the bottom.
    matrices.append([[values[x * 5 + y] for x in range(5)] for y in range(5)])
if len(matrices) != 1 + len(catalog['bases']['41']['subtypes']):
    raise ValueError('The idol altar grid count does not match current item subtypes')
catalog['idolGrids'] = {'default': matrices[0], **{str(i): m for i, m in enumerate(matrices[1:])}}
a.output.parent.mkdir(parents=True, exist_ok=True)
a.output.write_text(json.dumps(catalog, separators=(',', ':'), sort_keys=True)+'\n', encoding='utf-8')
print(f"Wrote {len(catalog['bases'])} base types, {len(catalog['uniques'])} uniques and {len(catalog['affixes'])} affixes")
