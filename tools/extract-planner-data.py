"""Extract numeric planner validation facts from an installed Last Epoch build.

Only the game assets and Cpp2IL declarations are read. This script does not read
or write any character saves, and does not copy planner scripts or game artwork.
Regeneration is a maintenance aid; it does not validate a new save format.
"""
from __future__ import annotations

import argparse
from datetime import date
import json
from pathlib import Path
import re
import struct
import sys


def compact_tree(tree):
    nodes = {}
    for node in tree['nodes']:
        key = str(node['id'])
        if key in nodes:
            raise ValueError(f"Duplicate node {key} in {tree['treeID']}")
        nodes[key] = {
            'max': node['maxPoints'], 'mastery': node['requiredMastery'],
            'level': node['masteryRequirement'],
            'requires': [[r['nodeID'], r['requirement']] for r in node['requirements']],
        }
    return {'version': tree['version'], 'name': tree['name'], 'nodes': nodes}


def extract_classes(env):
    objects = {obj.path_id: obj for obj in env.objects}
    trees = {}
    class_skills = {}
    expected_names = {'Primalist', 'Mage', 'Sentinel', 'Acolyte', 'Rogue'}
    found = set()
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour' or obj.peek_name() not in expected_names:
            continue
        character = obj.read_typetree(check_read=True)
        name = character['m_Name']
        if name in found:
            raise ValueError(f'Duplicate class asset {name}')
        found.add(name)
        class_id = character['classID']
        trees[character['treeID']] = class_id
        abilities = {}

        def record(pointer, rule):
            if not pointer['m_PathID']:
                return
            if pointer['m_FileID'] != 0 or pointer['m_PathID'] not in objects:
                raise ValueError(f'Cannot resolve ability reference for {name}: {pointer}')
            ability = objects[pointer['m_PathID']].read_typetree(check_read=True)
            ability_id = ability['playerAbilityID']
            if ability_id:
                abilities.setdefault(ability_id, []).append(rule)

        # CharacterClass.getUnlockedAbilities uses knownAbilities, not the
        # default hotbar. The latter includes actions with separate unlock rules.
        for pointer in character['knownAbilities']:
            record(pointer, {'kind': 'level', 'level': 1})
        for ability in character['unlockableAbilities']:
            record(ability['ability'], {'kind': 'level', 'level': ability['level']})
        for index, mastery in enumerate(character['masteries']):
            record(mastery['masteryAbility'], {'kind': 'mastery', 'mastery': index})
            for ability in mastery['abilities']:
                record(ability['ability'], {'kind': 'passive', 'mastery': index, 'level': ability['level']})
        class_skills[str(class_id)] = abilities
    if found != expected_names or set(class_skills) != {'0', '1', '2', '3', '4'}:
        raise ValueError(f'Incomplete or changed class layout: {sorted(found)}')
    return trees, class_skills


def extract_xp(diffable_cs):
    declarations = (diffable_cs / '_PrivateImplementationDetails_.cs').read_text(encoding='utf-8-sig')
    blobs = re.findall(r'__StaticArrayInitTypeSize=76 [^\n]+hex blob\): \[([^\]]+)\]', declarations)
    if len(blobs) != 1:
        raise ValueError('The verified 19-integer skill XP table is no longer unique; inspect native code again')
    values = list(struct.unpack('<19i', bytes.fromhex(blobs[0])))
    if values != sorted(set(values)) or values[0] <= 0:
        raise ValueError('Skill XP table is not a positive, strictly increasing sequence')
    return [0, *values]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-dir', type=Path, required=True)
    parser.add_argument('--diffable-cs', type=Path, required=True,
                        help='Cpp2IL DiffableCs/LE directory from the same game installation')
    parser.add_argument('--out', type=Path, required=True, help='Output JavaScript module outside the game directory')
    parser.add_argument('--library-dir', type=Path, help='Optional directory containing UnityPy')
    parser.add_argument('--version-family', default='1.5', help='Must match the independently verified native rules')
    args = parser.parse_args()
    if args.library_dir:
        sys.path.insert(0, str(args.library_dir.resolve()))
    import UnityPy

    game = args.game_dir.resolve()
    output = args.out.resolve()
    if game == output or game in output.parents:
        raise ValueError('Output must be outside the game installation')
    if args.version_family != '1.5':
        raise ValueError('Native tree and skill rules are only verified for game family 1.5')
    game_data = game / 'Last Epoch_Data'
    env = UnityPy.load(str(game_data / 'StreamingAssets' / 'LEAssetBundles' / 'PermaLoad.bundle'))
    candidates = [obj for obj in env.objects
                  if obj.type.name == 'MonoBehaviour' and obj.peek_name() == 'Global Tree Data']
    if len(candidates) != 1:
        raise ValueError('Expected exactly one Global Tree Data asset')
    global_tree = candidates[0].read_typetree(check_read=True)
    classes, class_skills = extract_classes(env)
    data = {
        'gameVersionFamily': args.version_family,
        'source': f'Installed Last Epoch Global Tree Data and GameAssembly.dll, extracted {date.today().isoformat()}',
        'skillXpThresholds': extract_xp(args.diffable_cs),
        'classSkills': class_skills,
        'passives': {str(classes[t['treeID']]): {**compact_tree(t), 'treeID': t['treeID']}
                     for t in global_tree['passiveTrees']},
        'skills': {t['treeID']: compact_tree(t) for t in global_tree['skillTrees']},
    }
    if len(data['passives']) != 5 or not data['skills']:
        raise ValueError('Incomplete tree data')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        '// Functional validation data extracted from the installed game. No planner code or artwork.\n'
        'export default ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8',
    )
    provenance = {
        'gameBuildHash': (game_data / 'build_hash.txt').read_text().strip(),
        'unityVersion': candidates[0].assets_file.unity_version,
        'versionFamily': args.version_family,
        'extractedOn': date.today().isoformat(),
        'passiveTreeCount': len(data['passives']), 'skillTreeCount': len(data['skills']),
        'nativeMethodsVerified': {
            'LocalTreeData.loadPassiveTree': '0x16C5530',
            'LocalTreeData.ArePassiveNodeRequirementsMet': '0x16B9300',
            'GlobalTreeData.NodeData.masteryRequirementWouldBeMet': '0x16CEC70',
            'CharacterClass.getUnlockedAbilities': '0x1692290',
            'SpecialisedAbilityManager.getAbilityLevel': '0x249FF40',
            'SpecialisedAbilityManager.getNumberOfSpecialisationSlots': '0x24A0290',
        },
    }
    output.with_suffix('.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    print(f"Extracted {len(data['skills'])} skills and {len(data['passives'])} passive trees to {output}")


if __name__ == '__main__':
    main()
