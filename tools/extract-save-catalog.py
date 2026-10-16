"""Extract short resource names and faction rank limits for the browser save editor.

Reads previously extracted MasterItemsList/MasterAffixesList JSON plus the current
game's PermaLoad.bundle. Writes only names, IDs and limits; never opens save files.
"""
import argparse
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-dir', type=Path, required=True)
    parser.add_argument('--game-data', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--library-dir', type=Path)
    args = parser.parse_args()
    game = args.game_dir.resolve()
    output = args.out.resolve()
    if output == game or game in output.parents:
        raise ValueError('Output must be outside the game installation')
    if args.library_dir:
        sys.path.insert(0, str(args.library_dir.resolve()))
    import UnityPy

    affixes = json.loads((args.game_data / 'MasterAffixesList.json').read_text(encoding='utf8'))
    items = json.loads((args.game_data / 'MasterItemsList.json').read_text(encoding='utf8'))
    shards = {str(affix['affixId']): affix.get('affixDisplayName') or affix['affixName']
              for affix in affixes['singleAffixes'] + affixes['multiAffixes']}
    resources = {f"{base['baseTypeID']}:{item['subTypeID']}": item.get('displayName') or item['name']
                 for base in items['nonEquippableItems'] if base['baseTypeID'] != 101
                 for item in base['subItems']}
    factions = {}
    bundle = game / 'Last Epoch_Data/StreamingAssets/LEAssetBundles/PermaLoad.bundle'
    env = UnityPy.load(str(bundle))
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour' or not (obj.peek_name() or '').startswith('Faction Data '):
            continue
        faction = obj.read_typetree(check_read=True)
        factions[str(faction['factionID'])] = {
            'name': faction['m_Name'].removeprefix('Faction Data '),
            'maxRank': len(faction['reputationReqForNextRanks']),
        }
    if len(factions) != 4:
        raise ValueError('Expected exactly four current faction records; review extraction before publishing')
    result = {
        'source': 'Installed Last Epoch MasterAffixesList, MasterItemsList and FactionData assets',
        'gameBuildHash': (game / 'Last Epoch_Data/build_hash.txt').read_text().strip(),
        'shards': shards,
        'resources': resources,
        'factions': factions,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text('// Generated resource names and numeric limits; no saves or player data.\nexport default '
                      + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8')
    print(f'Extracted {len(shards)} affix names, {len(resources)} resource names, {len(factions)} faction limits')


if __name__ == '__main__':
    main()
